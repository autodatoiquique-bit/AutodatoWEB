const express = require("express");
const path = require("path");

const app = express();
const puerto = process.env.PORT || 5173;

app.use(express.json({ limit: "200kb" }));

app.get("/config.js", (_req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  res.type("application/javascript").send(
    `window.AUTODATO_NUBE = ${JSON.stringify({ supabaseUrl, supabaseAnonKey })};`
  );
});

function telefonoLimpio(valor) {
  let d = String(valor || "").replace(/\D/g, "");
  if (d.startsWith("56")) return d;
  if (d.startsWith("9") && d.length === 9) return `56${d}`;
  if (d.length === 8) return `569${d}`;
  return d;
}

function fechaDmy(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function cuerpoAutonexus(payload, token) {
  const items = Array.isArray(payload.servicios) ? payload.servicios : [];
  const total = Number(payload.total);
  const ahorro = Number(payload.ahorro) || 0;
  const marca = [payload.marca, payload.modelo, payload.ano].filter(Boolean).join(" ");
  return {
    accion: "crear_ticket",
    token,
    asistente: "clientes",
    nombre_cliente: String(payload.nombre_cliente || "").trim(),
    telefono: telefonoLimpio(payload.telefono),
    ticket_ingreso: String(payload.code || "").trim(),
    fecha_atencion: fechaDmy(payload.fecha_cita),
    hora_atencion: String(payload.hora || "").trim(),
    marca_modelo_anio: marca,
    servicio_solicitado: items
      .map((s) => {
        const precio = s.precio == null ? "A confirmar" : String(s.precio);
        return `${s.nombre} ${precio}`;
      })
      .join(", "),
    total_pactado: Number.isFinite(total) ? Math.round(total) : "",
    antecedentes: "",
    correo: String(payload.correo || "").trim(),
    patente: String(payload.patente || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    estatus_tarifa: ahorro > 0 ? "bonificacion" : "estandar",
  };
}

app.post("/api/autonexus-ticket", async (req, res) => {
  const url = process.env.AUTONEXUS_WEBHOOK_URL || "";
  const token = process.env.AUTONEXUS_WEBHOOK_TOKEN || "";
  if (!url || !token) {
    return res.status(501).json({ ok: false, error: "Webhook no configurado" });
  }
  try {
    const body = cuerpoAutonexus(req.body || {}, token);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const texto = await r.text();
    if (!r.ok) {
      console.warn("AutoNexus webhook falló", r.status);
      return res.status(502).json({ ok: false, error: "AutoNexus no aceptó el ticket" });
    }
    return res.json({ ok: true, detalle: texto.slice(0, 300) });
  } catch (e) {
    console.warn("AutoNexus webhook error", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo avisar a AutoNexus" });
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(puerto, () => {
  console.log(`AutoDato en http://localhost:${puerto}`);
});
