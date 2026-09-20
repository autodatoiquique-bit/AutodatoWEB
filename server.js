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

const WEBHOOK_AUTONEXUS =
  "https://vambe-autonexus-proxy.autodatoiquique.workers.dev";

function urlWebhookAutonexus() {
  const raw = String(process.env.AUTONEXUS_WEBHOOK_URL || "").trim();
  if (!raw || /vamble-autonexus-proxy/i.test(raw)) return WEBHOOK_AUTONEXUS;
  return raw;
}

function cuerpoAutonexus(payload, token) {
  const items = Array.isArray(payload.servicios) ? payload.servicios : [];
  const total = Number(payload.total);
  const ahorro = Number(payload.ahorro) || 0;
  const marca = [payload.marca, payload.modelo, payload.ano].filter(Boolean).join(" ");
  const servicios = items
    .map((s) => {
      const precio = s.precio == null ? "A confirmar" : String(s.precio);
      return `${s.nombre} ${precio}`;
    })
    .join(", ");
  const code = String(payload.code || "").trim();
  return {
    accion: "crear_ticket",
    token,
    asistente: "clientes",
    nombre_cliente: String(payload.nombre_cliente || "").trim(),
    telefono: telefonoLimpio(payload.telefono),
    code,
    fecha_atencion: fechaDmy(payload.fecha_cita),
    hora_atencion: String(payload.hora || "").trim(),
    vehiculo: marca,
    marca_modelo_ano: marca,
    marca_modelo_anio: marca,
    servicios_solicitados: servicios,
    servicio_solicitado: servicios,
    total_pactado: Number.isFinite(total) ? Math.round(total) : "",
    antecedentes: String(payload.sintoma || "").trim(),
    correo: String(payload.correo || "").trim(),
    patente: String(payload.patente || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    estatus_tarifa: ahorro > 0 ? "bonificacion" : "estandar",
  };
}

function extraerUrlFicha(parsed, texto) {
  const esUrl = (v) => {
    const t = String(v || "").trim();
    if (!/^https?:\/\//i.test(t)) return "";
    if (/workers\.dev/i.test(t)) return "";
    return t.replace(/[),.;]+$/, "");
  };
  const directa = esUrl(texto);
  if (directa) return directa;
  const enTexto = String(texto || "").match(/https?:\/\/[^\s"'<>]+/i);
  if (enTexto) {
    const limpia = esUrl(enTexto[0]);
    if (limpia) return limpia;
  }
  const claves = ["url", "link", "ficha", "url_ficha", "redirect", "href", "informe", "url_informe", "ficha_url"];
  const walk = (obj, depth) => {
    if (!obj || depth > 5) return "";
    if (typeof obj === "string") return esUrl(obj);
    if (typeof obj !== "object") return "";
    for (const k of claves) {
      const found = walk(obj[k], depth + 1);
      if (found) return found;
    }
    for (const v of Object.values(obj)) {
      const found = walk(v, depth + 1);
      if (found) return found;
    }
    return "";
  };
  return walk(parsed, 0);
}

const MARCAS_FICHA = ["Hyundai", "Kia", "Mazda", "Suzuki", "Nissan", "Toyota", "Mitsubishi", "Honda"];

function valorAnidado(obj, claves) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of claves) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function extraerVehiculoFicha(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const bloques = [parsed, parsed.data, parsed.cliente, parsed.vehiculo, parsed.auto].filter(
    (x) => x && typeof x === "object" && !Array.isArray(x)
  );
  let marca = "";
  let modelo = "";
  let ano = "";
  let combustible = "";
  bloques.forEach((b) => {
    if (!marca) marca = valorAnidado(b, ["marca", "brand"]);
    if (!modelo) modelo = valorAnidado(b, ["modelo", "model"]);
    if (!ano) ano = valorAnidado(b, ["ano", "anio", "año", "year", "ano_vehiculo"]);
    if (!combustible) combustible = valorAnidado(b, ["combustible", "tipo_combustible", "fuel"]);
  });
  const texto = String(
    valorAnidado(parsed, ["vehiculo", "marca_modelo_ano", "marca_modelo_anio"]) ||
      (parsed.vehiculo && typeof parsed.vehiculo === "string" ? parsed.vehiculo : "")
  ).trim();
  if ((!marca || !modelo || !ano) && texto) {
    const marcaHit = MARCAS_FICHA.find((m) => new RegExp(`^${m}\\b`, "i").test(texto));
    const anioHit = texto.match(/(19|20)\d{2}/);
    if (marcaHit) {
      marca = marca || marcaHit;
      const resto = texto.replace(new RegExp(`^${marcaHit}\\s+`, "i"), "").replace(/\s+(19|20)\d{2}.*$/, "").trim();
      modelo = modelo || resto;
    }
    if (anioHit) ano = ano || anioHit[0];
  }
  const n = Number(ano);
  marca = String(marca || "").trim();
  modelo = String(modelo || "").trim();
  if (!marca || !modelo || !Number.isFinite(n)) return null;
  return { marca, modelo, ano: n, combustible: combustible || "ambos" };
}

function cuerpoIdentificarCliente(payload, token) {
  return {
    accion: "identificar_cliente",
    token,
    asistente: "clientes",
    telefono: telefonoLimpio(payload.telefono),
    patente: String(payload.patente || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
  };
}

app.post("/api/autonexus-ficha", async (req, res) => {
  const url = urlWebhookAutonexus();
  const token = process.env.AUTONEXUS_WEBHOOK_TOKEN || "";
  if (!token) {
    return res.status(501).json({ ok: false, error: "Webhook no configurado" });
  }
  const telefono = telefonoLimpio((req.body || {}).telefono);
  const patente = String((req.body || {}).patente || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!telefono || !patente) {
    return res.status(400).json({ ok: false, error: "Escribe la patente y el celular." });
  }
  try {
    const body = cuerpoIdentificarCliente({ telefono, patente }, token);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const texto = await r.text();
    let parsed = null;
    try {
      parsed = JSON.parse(texto);
    } catch (_e) {
      parsed = null;
    }
    if (!r.ok || (parsed && parsed.exito === false)) {
      console.warn("AutoNexus ficha falló", r.status);
      return res.status(502).json({
        ok: false,
        error: (parsed && (parsed.error || parsed.mensaje_para_asistente)) ||
          "No encontramos una ficha con esos datos.",
      });
    }
    const ficha = extraerUrlFicha(parsed, texto);
    if (!ficha) {
      console.warn("AutoNexus ficha sin URL");
      return res.status(502).json({
        ok: false,
        error: "AutoNexus respondió, pero no trajo el enlace de la ficha.",
      });
    }
    return res.json({ ok: true, url: ficha, vehiculo: extraerVehiculoFicha(parsed) });
  } catch (e) {
    console.warn("AutoNexus ficha error", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo abrir la ficha interactiva." });
  }
});

app.post("/api/autonexus-ticket", async (req, res) => {
  const url = urlWebhookAutonexus();
  const token = process.env.AUTONEXUS_WEBHOOK_TOKEN || "";
  if (!token) {
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
    let parsed = null;
    try {
      parsed = JSON.parse(texto);
    } catch (_e) {
      parsed = null;
    }
    if (!r.ok || !parsed || parsed.exito === false) {
      console.warn("AutoNexus webhook falló", r.status, parsed && parsed.error);
      return res.status(502).json({
        ok: false,
        error: (parsed && (parsed.error || parsed.mensaje_para_asistente)) ||
          "AutoNexus no aceptó el ticket",
      });
    }
    return res.json({ ok: true, code: parsed.code || body.code });
  } catch (e) {
    console.warn("AutoNexus webhook error", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo avisar a AutoNexus" });
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(puerto, () => {
  console.log(`AutoDato en http://localhost:${puerto}`);
});
