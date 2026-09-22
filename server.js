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

function tokenAutonexus() {
  return String(process.env.AUTONEXUS_WEBHOOK_TOKEN || "").trim();
}

function idTallerAutonexus() {
  return String(process.env.AUTONEXUS_ID_TALLER || "").trim();
}

async function postAutonexus(body) {
  const url = urlWebhookAutonexus();
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const texto = await r.text();
  let parsed = null;
  try {
    parsed = texto ? JSON.parse(texto) : null;
  } catch (_e) {
    parsed = null;
  }
  return { ok: r.ok, status: r.status, parsed, texto };
}

function cuerpoAutonexus(payload, token, idTaller) {
  const items = Array.isArray(payload.servicios) ? payload.servicios : [];
  const total = Number(payload.total);
  const ahorro = Number(payload.ahorro) || 0;
  const marca = [payload.marca, payload.modelo, payload.ano].filter(Boolean).join(" ");
  const servicios = items
    .map((s, i) => {
      const precio = s.precio == null ? "A confirmar" : String(s.precio);
      return `${i + 1}. ${s.nombre} $${precio}`;
    })
    .join("\n");
  return {
    accion: "crear_ticket",
    token,
    asistente: "clientes",
    id_taller: idTaller,
    nombre_cliente: String(payload.nombre_cliente || "").trim(),
    telefono: telefonoLimpio(payload.telefono),
    fecha_atencion: fechaDmy(payload.fecha_cita),
    hora_atencion: String(payload.hora || "").trim(),
    vehiculo: marca,
    marca_modelo_ano: marca,
    marca_modelo_anio: marca,
    servicios_solicitados: servicios,
    total_pactado: Number.isFinite(total) ? String(Math.round(total)) : "",
    antecedentes: String(payload.sintoma || "").trim(),
    correo: String(payload.correo || "").trim(),
    patente: String(payload.patente || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    estatus_tarifa: ahorro > 0 ? "bonificación" : "TARIFA ESTÁNDAR",
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

function supabaseServiceConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

async function supabaseRpc(nombre, body) {
  const cfg = supabaseServiceConfig();
  if (!cfg) return { ok: false, status: 501, error: "Stock no configurado en el servidor." };
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const texto = await r.text();
  let data = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch (_e) {
    data = null;
  }
  if (!r.ok) {
    return { ok: false, status: 502, error: (data && data.message) || "No se pudo validar el stock." };
  }
  return { ok: true, data };
}

async function descargarCatalogoCanales() {
  const cfg = supabaseServiceConfig();
  if (!cfg) return null;
  const r = await fetch(`${cfg.url}/storage/v1/object/servicios/catalogo-canales.json`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  });
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch (_e) {
    return null;
  }
}

async function subirCatalogoCanales(mapa) {
  const cfg = supabaseServiceConfig();
  if (!cfg) return false;
  const r = await fetch(`${cfg.url}/storage/v1/object/servicios/catalogo-canales.json`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(mapa),
  });
  return r.ok;
}

function stockEnExtra(extra) {
  if (!extra || extra.stock_restante == null || extra.stock_restante === "") return null;
  const n = Math.floor(Number(extra.stock_restante));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

async function syncServicioStockRestantes(restantes) {
  const cfg = supabaseServiceConfig();
  if (!cfg || !restantes) return;
  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  for (const [sid, n] of Object.entries(restantes)) {
    try {
      await fetch(`${cfg.url}/rest/v1/servicio_stock?on_conflict=servicio_id`, {
        method: "POST",
        headers,
        body: JSON.stringify({ servicio_id: sid, restante: n }),
      });
    } catch (e) {
      console.warn("No se sincronizó servicio_stock", sid, e.message || e);
    }
  }
}

async function consumirStockEnCatalogo(limpios) {
  const cfg = supabaseServiceConfig();
  if (!cfg) return { ok: false, status: 501, error: "Stock no configurado en el servidor." };
  const mapa = await descargarCatalogoCanales();
  if (!mapa) return { ok: false, status: 502, error: "No se pudo leer el catálogo de stock." };

  const faltantes = [];
  limpios.forEach(({ id, qty }) => {
    const sid = String(id);
    const extra = mapa[sid];
    const cur = stockEnExtra(extra);
    if (cur == null) return;
    const q = Math.max(1, Number(qty) || 1);
    if (cur < q) faltantes.push({ id: sid, restante: cur, necesita: q });
  });
  if (faltantes.length) {
    return {
      ok: false,
      status: 409,
      error: "Uno o más servicios se agotaron hace un momento.",
      faltantes,
    };
  }

  const restantes = {};
  limpios.forEach(({ id, qty }) => {
    const sid = String(id);
    const extra = mapa[sid];
    const cur = stockEnExtra(extra);
    if (cur == null) return;
    const q = Math.max(1, Number(qty) || 1);
    const n = Math.max(0, cur - q);
    extra.stock_restante = n;
    if (n <= 0) {
      extra.agotado = true;
      extra.ultima_unidad = false;
    }
    restantes[sid] = n;
  });

  if (Object.keys(restantes).length && !(await subirCatalogoCanales(mapa))) {
    return { ok: false, status: 502, error: "No se pudo actualizar el stock." };
  }
  await syncServicioStockRestantes(restantes);
  return { ok: true, restantes };
}

app.post("/api/consumir-stock", async (req, res) => {
  const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
  const limpios = items
    .map((x) => ({ id: String(x.id || ""), qty: Math.max(1, Number(x.qty) || 1) }))
    .filter((x) => x.id);
  if (!limpios.length) return res.json({ ok: true, skipped: true });

  const out = await consumirStockEnCatalogo(limpios);
  if (!out.ok) {
    return res.status(out.status || 502).json({
      ok: false,
      error: out.error,
      faltantes: out.faltantes,
    });
  }
  return res.json({ ok: true, restantes: out.restantes || {} });
});

app.get("/api/agenda-disponibilidad", async (req, res) => {
  const token = tokenAutonexus();
  const id_taller = idTallerAutonexus();
  if (!token || !id_taller) {
    return res.status(501).json({ ok: false, error: "Agenda AutoNexus no configurada en el servidor." });
  }
  const dias = Math.min(60, Math.max(1, Number(req.query.dias) || 21));
  const body = {
    accion: "consultar_disponibilidad",
    token,
    asistente: "clientes",
    id_taller,
    dias,
  };
  const f = String(req.query.fecha || "").trim();
  if (f) body.fecha = /^\d{4}-\d{2}-\d{2}$/.test(f) ? fechaDmy(f) : f;
  try {
    const { ok, status, parsed } = await postAutonexus(body);
    if (!ok || !parsed || parsed.exito === false) {
      return res.status(status >= 400 ? status : 502).json({
        ok: false,
        error: (parsed && (parsed.error || parsed.mensaje_para_asistente)) || "No se pudo consultar la agenda.",
        codigo: (parsed && parsed.codigo) || "",
      });
    }
    return res.json({ ok: true, data: parsed });
  } catch (e) {
    console.warn("Agenda AutoNexus error", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo consultar la agenda." });
  }
});

app.post("/api/autonexus-ticket", async (req, res) => {
  const token = tokenAutonexus();
  const id_taller = idTallerAutonexus();
  if (!token || !id_taller) {
    return res.status(501).json({ ok: false, error: "Webhook no configurado" });
  }
  try {
    const body = cuerpoAutonexus(req.body || {}, token, id_taller);
    const { ok, status, parsed } = await postAutonexus(body);
    if (!ok || !parsed || parsed.exito === false) {
      const codigo = (parsed && (parsed.codigo || parsed.error)) || "";
      const msg =
        (parsed && (parsed.mensaje_para_asistente || parsed.error)) || "AutoNexus no aceptó el ticket";
      console.warn("AutoNexus webhook falló", status, codigo, msg);
      const http = codigo === "SLOT_OCUPADO" || codigo === "HORARIO_INVALIDO" ? 409 : 502;
      return res.status(http).json({ ok: false, error: msg, codigo });
    }
    return res.json({
      ok: true,
      code: parsed.code || parsed.codigo_ticket || "",
      ticket_whatsapp_enviado: Boolean(parsed.ticket_whatsapp_enviado),
      data: parsed,
    });
  } catch (e) {
    console.warn("AutoNexus webhook error", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo avisar a AutoNexus" });
  }
});

app.get("/admin", (_req, res) => {
  res.redirect(302, "/admin.html");
});

app.use(express.static(path.join(__dirname)));

app.listen(puerto, () => {
  console.log(`AutoDato en http://localhost:${puerto}`);
});
