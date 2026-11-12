const express = require("express");
const fs = require("fs");
const path = require("path");
const asistentePrecios = require("./asistente-precios");
const asistenteAprobados = require("./asistente-aprobados");

const app = express();
const puerto = process.env.PORT || 5173;

const INDEX_HTML_PATH = path.join(__dirname, "index.html");
let indexHtmlPlantilla = null;
function leerIndexHtml() {
  if (!indexHtmlPlantilla) {
    indexHtmlPlantilla = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  }
  return indexHtmlPlantilla;
}

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

const ID_TALLER_AUTONEXUS_DEFAULT = "937db668-b9a4-4ccd-946c-1f2ed8569430";

function idTallerAutonexus() {
  return String(process.env.AUTONEXUS_ID_TALLER || ID_TALLER_AUTONEXUS_DEFAULT).trim();
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
  return { ok: r.ok, status: r.status, parsed, texto, url };
}

function mensajeErrorRespuestaAutonexus(parsed, texto, status) {
  if (parsed && typeof parsed === "object") {
    for (const k of [
      "mensaje_para_asistente",
      "error",
      "mensaje",
      "message",
      "detalle",
      "descripcion",
      "motivo",
    ]) {
      const v = parsed[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  const t = String(texto || "").trim();
  if (t) {
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return mensajeErrorRespuestaAutonexus(JSON.parse(t), "", status);
      } catch (_e) {
        /* texto no JSON */
      }
    }
    return t.length <= 800 ? t : `${t.slice(0, 800)}…`;
  }
  if (status === 404) {
    return "HTTP 404: el webhook no encontró la ruta o la acción sincronizar_lista_precios_flota.";
  }
  if (status === 401 || status === 403) {
    return `HTTP ${status}: token o permisos rechazados por AutoNexus.`;
  }
  if (status >= 500) {
    return `HTTP ${status}: error interno en AutoNexus o en el proxy.`;
  }
  return "AutoNexus no aceptó la sincronización (sin mensaje en la respuesta).";
}

function webhookAutonexusRechazo(parsed, httpOk) {
  if (!httpOk) return true;
  if (!parsed || typeof parsed !== "object") return true;
  if (parsed.exito === false || parsed.ok === false || parsed.success === false) return true;
  return false;
}

const TOKEN_SALFA_DEFAULT = "PORTAL_WH_PILOTO_7K3M";

function tokenSalfaAutonexus() {
  return String(process.env.AUTONEXUS_SALFA_WEBHOOK_TOKEN || TOKEN_SALFA_DEFAULT).trim();
}

function fechaEntregaDmyHora(fechaIso, hora) {
  const f = fechaDmy(fechaIso);
  const h = String(hora || "").trim();
  if (!f) return h;
  return h ? `${f} ${h}` : f;
}

function cuerpoAutonexusSalfa(payload, token) {
  const items = Array.isArray(payload.servicios) ? payload.servicios : [];
  const neto = Number(payload.neto);
  const total = Number(payload.total);
  const patente = String(payload.patente || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  const nombre = String(payload.nombre_cliente || "").trim();
  const telefono = telefonoLimpio(payload.telefono);
  const servicios = items
    .map((s, i) => {
      const precioNeto = s.neto != null ? Number(s.neto) : Number(s.precio);
      const txt = Number.isFinite(precioNeto) ? String(Math.round(precioNeto)) : "A confirmar";
      return `${i + 1}. ${s.nombre} $${txt}`;
    })
    .join("\n");
  const vehiculoDetalle = [payload.marca, payload.modelo, payload.ano].filter(Boolean).join(" ").trim();
  const vehiculo = vehiculoDetalle || (patente ? `SALFA ${patente}` : "SALFA");
  const canal = String(payload.canal_webhook || "SALFA").trim() || "SALFA";
  const fechaAtencion = fechaDmy(payload.fecha_cita);
  const horaAtencion = String(payload.hora || "").trim();
  const fechaEntrega =
    fechaEntregaDmyHora(payload.entrega_fecha, payload.entrega_hora) ||
    fechaEntregaDmyHora(payload.fecha_cita, payload.hora);
  return {
    accion: "crear_ticket",
    token,
    asistente: "salfa",
    canal,
    id_taller: idTallerAutonexus(),
    id_flota: "FLOTA_SALFA",
    flota: "SALFA",
    origen: "autodato.cl",
    nombre_cliente: nombre.toUpperCase().startsWith("SALFA") ? nombre : `SALFA ${nombre}`,
    servicios_solicitados: servicios,
    neto: Number.isFinite(neto) ? String(Math.round(neto)) : "",
    oc_pre: String(payload.oc_pre || "").trim(),
    fecha_atencion: fechaAtencion,
    hora_atencion: horaAtencion,
    fecha_cita: fechaAtencion,
    hora: horaAtencion,
    fecha_entrega: fechaEntrega,
    vehiculo,
    marca_modelo_ano: vehiculoDetalle,
    marca_modelo_anio: vehiculoDetalle,
    antecedentes: String(payload.sintoma || payload.antecedentes || "").trim(),
    patente,
    telefono_canal: telefono,
    telefono,
    total_pactado: Number.isFinite(total) ? String(Math.round(total)) : "",
    traslado: String(payload.traslado || "").trim().toLowerCase() === "si" ? "si" : "no",
  };
}

function esFlotaSalfaServidor(flota) {
  if (!flota) return false;
  if (String(flota.nombre || "").trim().toLowerCase() === "salfa") return true;
  return String(flota.canal_webhook || "").trim().toUpperCase() === "SALFA";
}

function idsFlotaAutonexus(flota) {
  if (esFlotaSalfaServidor(flota)) {
    return { id_flota: "FLOTA_SALFA", flota: "SALFA" };
  }
  const nombre = String(flota.nombre || "").trim();
  const slug = nombre.toUpperCase().replace(/\s+/g, "_");
  return { id_flota: slug || String(flota.id || ""), flota: nombre || slug };
}

function textoPlanoServicioFlota(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function netoEnteroFlota(precio) {
  const n = Math.round(Number(precio));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function ivaDesdeNetoFlota(neto) {
  return Math.round(neto * 0.19);
}

/** Orden global igual al kanban AutoDato (columnas + tarjetas). */
function itemsCatalogoFlotaParaAutonexus(flota) {
  const columnas = Array.isArray(flota && flota.columnas) ? flota.columnas : [];
  const items = [];
  let orden = 0;
  columnas.forEach((col, catIdx) => {
    const categoria = String((col && col.titulo) || "").trim();
    const ordenCategoria = (catIdx + 1) * 10;
    const servicios = Array.isArray(col && col.servicios) ? col.servicios : [];
    const tokens = Array.isArray(col && col.orden_tarjetas) ? col.orden_tarjetas : [];
    const byId = {};
    servicios.forEach((s) => {
      if (s && s.id) byId[s.id] = s;
    });
    const ordenados = [];
    if (tokens.length) {
      tokens.forEach((tok) => {
        const m = String(tok || "").match(/^f:(.+)$/);
        const id = m ? m[1] : "";
        if (id && byId[id]) ordenados.push(byId[id]);
      });
      servicios.forEach((s) => {
        if (s && !ordenados.includes(s)) ordenados.push(s);
      });
    } else {
      ordenados.push(...servicios);
    }
    ordenados.forEach((srv) => {
      if (!srv || !String(srv.nombre || "").trim()) return;
      orden += 10;
      const neto = netoEnteroFlota(srv.precio);
      const iva = ivaDesdeNetoFlota(neto);
      items.push({
        id: String(srv.id || "").trim(),
        nombre: String(srv.nombre).trim(),
        descripcion: textoPlanoServicioFlota(srv.descripcion || ""),
        categoria,
        orden_categoria: ordenCategoria,
        orden,
        neto,
        iva,
        total: neto + iva,
        activo: srv.activo !== false,
      });
    });
  });
  return items;
}

function cuerpoSyncPreciosFlotaAutonexus(flota, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const esSalfa = esFlotaSalfaServidor(flota);
  const token = esSalfa ? tokenSalfaAutonexus() : tokenAutonexus();
  const ids = idsFlotaAutonexus(flota);
  const confirmar = String(o.confirmar || "si").trim().toLowerCase() === "no" ? "no" : "si";
  const version =
    String(o.version_catalogo || "").trim() || new Date().toISOString();
  return {
    accion: "sincronizar_lista_precios_flota",
    token,
    id_taller: idTallerAutonexus(),
    id_flota: ids.id_flota,
    flota: ids.flota,
    modo: "reemplazar",
    confirmar,
    origen: "autodato.cl",
    version_catalogo: version,
    cliente_autodato: String(flota.nombre || flota.id || "").trim(),
    asistente: esSalfa ? "salfa" : "clientes",
    items: itemsCatalogoFlotaParaAutonexus(flota),
  };
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

async function descargarCatalogoFlotas() {
  const cfg = supabaseServiceConfig();
  if (!cfg) return null;
  const r = await fetch(`${cfg.url}/storage/v1/object/servicios/catalogo-flotas.json`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  });
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch (_e) {
    return null;
  }
}

async function subirCatalogoFlotas(payload) {
  const cfg = supabaseServiceConfig();
  if (!cfg) return false;
  const r = await fetch(`${cfg.url}/storage/v1/object/servicios/catalogo-flotas.json`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(payload),
  });
  return r.ok;
}

async function leerFlotasServidor() {
  const remoto = await descargarCatalogoFlotas();
  if (remoto && Array.isArray(remoto._flotas)) return remoto._flotas;
  const mapa = await descargarCatalogoCanales();
  if (mapa && Array.isArray(mapa._flotas)) return mapa._flotas;
  return null;
}

async function guardarFlotasServidor(flotas) {
  const ok = await subirCatalogoFlotas({ _flotas: flotas });
  if (!ok) return false;
  const mapa = await descargarCatalogoCanales();
  if (mapa && Object.prototype.hasOwnProperty.call(mapa, "_flotas")) {
    delete mapa._flotas;
    await subirCatalogoCanales(mapa);
  }
  return true;
}

const SOLICITANTES_SALFA_SEED = require("./solicitantes-salfa-seed.json");

function claveUnicaSolicitanteServidor(s) {
  const mail = String((s && s.correo) || "")
    .trim()
    .toLowerCase();
  if (mail) return `m:${mail}`;
  return `n:${String((s && s.nombre) || "")
    .trim()
    .toLowerCase()}`;
}

function normalizarSolicitanteServidor(raw) {
  const nombre = String((raw && raw.nombre) || "").trim();
  if (!nombre) return null;
  return {
    id: String((raw && raw.id) || `sol-${Date.now().toString(36)}`),
    nombre,
    telefono: String((raw && raw.telefono) || "").trim(),
    correo: String((raw && raw.correo) || "").trim(),
    patente: String((raw && raw.patente) || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase(),
  };
}

function fusionarSolicitanteEnFlotaServidor(flota, raw) {
  if (!flota) return null;
  if (!Array.isArray(flota.solicitantes)) flota.solicitantes = [];
  const norm = normalizarSolicitanteServidor(raw);
  if (!norm) return null;
  const clave = claveUnicaSolicitanteServidor(norm);
  const exist = flota.solicitantes.find((s) => claveUnicaSolicitanteServidor(s) === clave);
  if (exist) {
    if (norm.telefono) exist.telefono = norm.telefono;
    if (norm.correo) exist.correo = norm.correo;
    if (norm.patente) exist.patente = norm.patente;
    return exist;
  }
  flota.solicitantes.push(norm);
  return norm;
}

function asegurarSemillaSolicitantesSalfaServidor(flota) {
  if (!flota || String(flota.nombre || "").toLowerCase() !== "salfa") return;
  const keys = new Set((flota.solicitantes || []).map(claveUnicaSolicitanteServidor));
  for (const seed of SOLICITANTES_SALFA_SEED) {
    const k = claveUnicaSolicitanteServidor(seed);
    if (keys.has(k)) continue;
    fusionarSolicitanteEnFlotaServidor(flota, seed);
    keys.add(k);
  }
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

app.post("/api/flota-registrar-solicitante", async (req, res) => {
  const body = req.body || {};
  const flotaId = String(body.flota_id || "").trim();
  const nombre = String(body.nombre || "").trim();
  if (!flotaId || !nombre) {
    return res.status(400).json({ ok: false, error: "Faltan flota o nombre." });
  }
  const cfg = supabaseServiceConfig();
  if (!cfg) {
    return res.status(501).json({ ok: false, error: "Catálogo no configurado en el servidor." });
  }
  try {
    const flotas = await leerFlotasServidor();
    if (!flotas) {
      return res.status(502).json({ ok: false, error: "No se pudo leer el catálogo." });
    }
    const idx = flotas.findIndex((f) => String(f.id) === flotaId);
    if (idx < 0) return res.status(404).json({ ok: false, error: "Flota no encontrada." });
    const flota = flotas[idx];
    const link = String(flota.link_acceso || "").trim();
    const acceso = String(body.acceso || "").trim();
    // Solo validar enlace directo cuando el cliente envía token (URL compartida).
    // Entrada por PIN en la app no incluye link_acceso.
    if (link && acceso && acceso !== link) {
      return res.status(403).json({ ok: false, error: "Acceso no válido para esta flota." });
    }
    asegurarSemillaSolicitantesSalfaServidor(flota);
    const sol = fusionarSolicitanteEnFlotaServidor(flota, {
      nombre,
      telefono: body.telefono,
      correo: body.correo,
      patente: body.patente,
    });
    flotas[idx] = flota;
    const ok = await guardarFlotasServidor(flotas);
    if (!ok) return res.status(502).json({ ok: false, error: "No se pudo guardar en el catálogo." });
    return res.json({ ok: true, solicitante: sol, flota_id: flotaId });
  } catch (e) {
    console.warn("flota-registrar-solicitante", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo registrar el solicitante." });
  }
});

app.post("/api/flota-sembrar-solicitantes-salfa", async (req, res) => {
  const cfg = supabaseServiceConfig();
  if (!cfg) {
    return res.status(501).json({ ok: false, error: "Catálogo no configurado en el servidor." });
  }
  try {
    const flotas = await leerFlotasServidor();
    if (!flotas) {
      return res.status(502).json({ ok: false, error: "No se pudo leer el catálogo." });
    }
    const idx = flotas.findIndex((f) => String(f.nombre || "").toLowerCase() === "salfa");
    if (idx < 0) return res.status(404).json({ ok: false, error: "Flota SALFA no encontrada." });
    const flota = flotas[idx];
    const antes = (flota.solicitantes || []).length;
    asegurarSemillaSolicitantesSalfaServidor(flota);
    flotas[idx] = flota;
    const ok = await guardarFlotasServidor(flotas);
    if (!ok) return res.status(502).json({ ok: false, error: "No se pudo guardar en el catálogo." });
    return res.json({
      ok: true,
      agregados: Math.max(0, (flota.solicitantes || []).length - antes),
      total: (flota.solicitantes || []).length,
    });
  } catch (e) {
    console.warn("flota-sembrar-solicitantes-salfa", e.message || e);
    return res.status(502).json({ ok: false, error: "No se pudo sembrar solicitantes." });
  }
});

app.post("/api/autonexus-sync-precios-flota", async (req, res) => {
  const body = req.body || {};
  const flotaId = String(body.flota_id || "").trim();
  if (!flotaId) {
    return res.status(400).json({ ok: false, error: "Falta flota_id." });
  }
  const flotas = await leerFlotasServidor();
  if (!flotas) {
    return res.status(502).json({ ok: false, error: "No se pudo leer el catálogo de flotas." });
  }
  const flota = flotas.find((f) => String(f.id) === flotaId);
  if (!flota) {
    return res.status(404).json({ ok: false, error: "Flota no encontrada en el catálogo." });
  }
  const esSalfa = esFlotaSalfaServidor(flota);
  const token = esSalfa ? tokenSalfaAutonexus() : tokenAutonexus();
  if (!token) {
    return res.status(501).json({
      ok: false,
      error: esSalfa ? "Webhook SALFA no configurado." : "Webhook AutoNexus no configurado.",
    });
  }
  const payload = cuerpoSyncPreciosFlotaAutonexus(flota, {
    confirmar: body.confirmar,
    version_catalogo: body.version_catalogo,
  });
  if (!payload.items.length) {
    return res.status(400).json({ ok: false, error: "La flota no tiene servicios para sincronizar." });
  }
  const nombres = new Set();
  for (const it of payload.items) {
    const key = String(it.nombre || "")
      .trim()
      .toLowerCase();
    if (nombres.has(key)) {
      return res.status(400).json({
        ok: false,
        error: `Hay nombres duplicados en el catálogo: «${it.nombre}». Corrígelos antes de sincronizar.`,
      });
    }
    nombres.add(key);
  }
  try {
    const { ok, status, parsed, texto, url } = await postAutonexus(payload);
    if (webhookAutonexusRechazo(parsed, ok)) {
      const msg = mensajeErrorRespuestaAutonexus(parsed, texto, status);
      console.warn("sync precios flota falló", status, msg, parsed || texto?.slice(0, 200));
      const httpOut = !ok && status >= 400 ? status : 502;
      return res.status(httpOut).json({
        ok: false,
        error: msg,
        codigo: (parsed && (parsed.codigo || parsed.error_code || parsed.code)) || "",
        http_status: status,
        accion: payload.accion,
        id_flota: payload.id_flota,
        items_intentados: payload.items.length,
        webhook_destino: url || urlWebhookAutonexus(),
        respuesta_autonexus: parsed || null,
        respuesta_raw: !parsed && texto ? (texto.length <= 1500 ? texto : `${texto.slice(0, 1500)}…`) : "",
      });
    }
    return res.json({
      ok: true,
      preview: payload.confirmar === "no",
      items_enviados: payload.items.length,
      version_catalogo: payload.version_catalogo,
      id_flota: payload.id_flota,
      data: parsed,
    });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Error de red";
    console.warn("sync precios flota error", msg);
    return res.status(502).json({
      ok: false,
      error: `No se pudo conectar con AutoNexus: ${msg}`,
      http_status: 502,
    });
  }
});

app.post("/api/autonexus-ticket", async (req, res) => {
  const payload = req.body || {};
  const esSalfa =
    payload.ticket_flota === "salfa" ||
    String(payload.canal_webhook || "").toUpperCase() === "SALFA";
  try {
    let body;
    if (esSalfa) {
      const tokenS = tokenSalfaAutonexus();
      if (!tokenS) {
        return res.status(501).json({ ok: false, error: "Webhook SALFA no configurado" });
      }
      body = cuerpoAutonexusSalfa(payload, tokenS);
    } else {
      const token = tokenAutonexus();
      const id_taller = idTallerAutonexus();
      if (!token || !id_taller) {
        return res.status(501).json({ ok: false, error: "Webhook no configurado" });
      }
      body = cuerpoAutonexus(payload, token, id_taller);
    }
    const { ok, status, parsed, texto, url } = await postAutonexus(body);
    if (webhookAutonexusRechazo(parsed, ok)) {
      const codigo = (parsed && (parsed.codigo || parsed.error_code || parsed.error)) || "";
      const msg = mensajeErrorRespuestaAutonexus(parsed, texto, status);
      console.warn("AutoNexus webhook falló", status, codigo, msg, parsed || texto?.slice(0, 300));
      const http = codigo === "SLOT_OCUPADO" || codigo === "HORARIO_INVALIDO" ? 409 : status >= 400 ? status : 502;
      return res.status(http).json({
        ok: false,
        error: msg,
        codigo,
        http_status: status,
        webhook_destino: url || urlWebhookAutonexus(),
        respuesta_autonexus: parsed || null,
      });
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

app.post("/api/asistente/consultar-precios", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
  try {
    const out = await asistentePrecios.consultarPrecios(req.body || {});
    if (!out.ok) return res.status(400).json(out);
    return res.json(out);
  } catch (e) {
    console.warn("consultar-precios", e.message || e);
    return res.status(503).json({
      ok: false,
      error: "No pudimos consultar precios en este momento. Intenta de nuevo en unos minutos.",
    });
  }
});

function vambeQuoteErrorStatus(code) {
  const clientErr = new Set([
    "SERVICE_NOT_COMPATIBLE",
    "SERVICE_CODES_REQUIRED",
    "SERVICE_FAMILY_REQUIRED",
    "VEHICLE_REQUIRED",
    "VEHICLE_YEAR_REQUIRED",
    "VEHICLE_BRAND_REQUIRED",
    "VEHICLE_MODEL_REQUIRED",
    "BRAND_OUT_OF_SCOPE",
    "CATALOG_EMPTY",
    "SERVICE_FAMILIES_NOT_CONFIGURED",
    "UNKNOWN_SERVICE_FAMILY",
    "NO_COMPATIBLE_SERVICE_FOR_FAMILY",
    "NO_BOARD_COLUMN",
    "EMPTY_VEHICLE_MENU",
    "INVALID_ACTION",
    "REPRICE_QUOTE_REQUIRED",
    "ADD_SERVICE_CODE_REQUIRED",
    "REMOVE_SERVICE_CODE_REQUIRED",
    "SERVICE_NOT_IN_QUOTE",
    "CANNOT_REMOVE_COMBO_MEMBER",
  ]);
  if (clientErr.has(code)) return 400;
  const notFound = new Set(["QUOTE_NOT_FOUND"]);
  if (notFound.has(code)) return 404;
  return 409;
}

app.post("/api/vambe/catalog/quote", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({ ok: false, error_code: "UNAUTHORIZED", message: "No autorizado", warnings: [], quote_id: null });
  }
  try {
    const out = await asistentePrecios.cotizarVambeInterno(req.body || {});
    if (!out.ok) {
      const code = out.error_code || "REQUEST_ERROR";
      return res.status(vambeQuoteErrorStatus(code)).json(out);
    }
    return res.json(out);
  } catch (e) {
    console.warn("vambe/catalog/quote", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos cotizar en este momento. Intenta de nuevo en unos minutos.",
      warnings: [],
      quote_id: null,
    });
  }
});

app.post("/api/vambe/catalog/quote-flat", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({ ok: false, error_code: "UNAUTHORIZED", message: "No autorizado", warnings: [], quote_id: null });
  }
  try {
    const internal = asistentePrecios.quoteFlatBodyToInternal(req.body || {});
    const out = await asistentePrecios.cotizarVambeInterno(internal);
    if (!out.ok) {
      const code = out.error_code || "REQUEST_ERROR";
      return res.status(vambeQuoteErrorStatus(code)).json(out);
    }
    return res.json(out);
  } catch (e) {
    console.warn("vambe/catalog/quote-flat", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos cotizar en este momento. Intenta de nuevo en unos minutos.",
      warnings: [],
      quote_id: null,
    });
  }
});

app.post("/api/vambe/catalog/compatible-services", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({
      ok: false,
      error_code: "UNAUTHORIZED",
      message: "No autorizado",
      warnings: [],
      quote_id: null,
    });
  }
  try {
    const out = await asistentePrecios.compatibleServicesVambe(req.body || {});
    if (!out.ok) {
      const code = out.error_code || "REQUEST_ERROR";
      return res.status(vambeQuoteErrorStatus(code)).json(out);
    }
    return res.json(out);
  } catch (e) {
    console.warn("vambe/catalog/compatible-services", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos consultar servicios compatibles en este momento. Intenta de nuevo en unos minutos.",
      warnings: [],
      quote_id: null,
    });
  }
});

app.post("/api/vambe/catalog/vehicle-menu", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({
      ok: false,
      error_code: "UNAUTHORIZED",
      message: "No autorizado",
      warnings: [],
      services: [],
      combinations: [],
    });
  }
  try {
    const out = await asistentePrecios.vehicleMenuVambe(req.body || {});
    if (!out.ok) {
      const code = out.error_code || "REQUEST_ERROR";
      return res.status(vambeQuoteErrorStatus(code)).json(out);
    }
    return res.json(out);
  } catch (e) {
    console.warn("vambe/catalog/vehicle-menu", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos cargar el menú del vehículo en este momento. Intenta de nuevo en unos minutos.",
      warnings: [],
      services: [],
      combinations: [],
    });
  }
});

app.post("/api/vambe/ticket/from-quote", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({ ok: false, error_code: "UNAUTHORIZED", message: "No autorizado", quote_id: null });
  }
  try {
    const enviar = async (payload) => {
      const token = tokenAutonexus();
      const id_taller = idTallerAutonexus();
      if (!token || !id_taller) {
        return { ok: false, error_code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook no configurado", code: "" };
      }
      const body = cuerpoAutonexus(payload, token, id_taller);
      const { ok, status, parsed, texto, url } = await postAutonexus(body);
      if (webhookAutonexusRechazo(parsed, ok)) {
        const msg = mensajeErrorRespuestaAutonexus(parsed, texto, status);
        return {
          ok: false,
          error_code: (parsed && (parsed.codigo || parsed.error_code || parsed.error)) || "AUTONEXUS_REJECTED",
          message: msg,
          http_status: status,
          webhook_destino: url || urlWebhookAutonexus(),
        };
      }
      const code = (parsed && (parsed.code || parsed.codigo_ticket)) || "";
      return { ok: true, code: String(code), ticket_whatsapp_enviado: Boolean(parsed && parsed.ticket_whatsapp_enviado), data: parsed };
    };
    const out = await asistentePrecios.ticketDesdeCotizacionVambe(req.body || {}, enviar);
    if (!out.ok) {
      const c = out.error_code || "TICKET_ERROR";
      const st =
        c === "QUOTE_EXPIRED" || c === "QUOTE_STALE_CATALOG" || c === "QUOTE_PRICE_MISMATCH"
          ? 409
          : c === "QUOTE_NOT_FOUND"
            ? 404
            : c === "TICKET_IDEMPOTENCY_CONFLICT"
              ? 409
              : 400;
      return res.status(st).json({
        ok: false,
        error_code: c,
        message: out.message || "No se pudo crear el ticket.",
        quote_id: out.quote_id != null ? out.quote_id : null,
      });
    }
    return res.json({
      ok: true,
      code: out.code,
      repeated: Boolean(out.repeated),
      quote_id: out.quote_id,
      message: out.message || null,
      ticket_whatsapp_enviado: out.ticket_whatsapp_enviado,
      data: out.data,
    });
  } catch (e) {
    console.warn("vambe/ticket/from-quote", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos crear el ticket en este momento.",
      quote_id: null,
    });
  }
});

app.post("/api/vambe/ticket/from-quote-flat", async (req, res) => {
  if (!asistentePrecios.tokenAsistenteValido(req)) {
    return res.status(401).json({ ok: false, error_code: "UNAUTHORIZED", message: "No autorizado", quote_id: null });
  }
  try {
    const internal = asistentePrecios.ticketFlatBodyToInternal(req.body || {});
    const enviar = async (payload) => {
      const token = tokenAutonexus();
      const id_taller = idTallerAutonexus();
      if (!token || !id_taller) {
        return { ok: false, error_code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook no configurado", code: "" };
      }
      const body = cuerpoAutonexus(payload, token, id_taller);
      const { ok, status, parsed, texto, url } = await postAutonexus(body);
      if (webhookAutonexusRechazo(parsed, ok)) {
        const msg = mensajeErrorRespuestaAutonexus(parsed, texto, status);
        return {
          ok: false,
          error_code: (parsed && (parsed.codigo || parsed.error_code || parsed.error)) || "AUTONEXUS_REJECTED",
          message: msg,
          http_status: status,
          webhook_destino: url || urlWebhookAutonexus(),
        };
      }
      const code = (parsed && (parsed.code || parsed.codigo_ticket)) || "";
      return { ok: true, code: String(code), ticket_whatsapp_enviado: Boolean(parsed && parsed.ticket_whatsapp_enviado), data: parsed };
    };
    const out = await asistentePrecios.ticketDesdeCotizacionVambe(internal, enviar);
    if (!out.ok) {
      const c = out.error_code || "TICKET_ERROR";
      const st =
        c === "QUOTE_EXPIRED" || c === "QUOTE_STALE_CATALOG" || c === "QUOTE_PRICE_MISMATCH"
          ? 409
          : c === "QUOTE_NOT_FOUND"
            ? 404
            : c === "TICKET_IDEMPOTENCY_CONFLICT"
              ? 409
              : 400;
      return res.status(st).json({
        ok: false,
        error_code: c,
        message: out.message || "No se pudo crear el ticket.",
        quote_id: out.quote_id != null ? out.quote_id : null,
      });
    }
    return res.json({
      ok: true,
      code: out.code,
      repeated: Boolean(out.repeated),
      quote_id: out.quote_id,
      message: out.message || null,
      ticket_whatsapp_enviado: out.ticket_whatsapp_enviado,
      data: out.data,
    });
  } catch (e) {
    console.warn("vambe/ticket/from-quote-flat", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos crear el ticket en este momento.",
      quote_id: null,
    });
  }
});

app.post("/api/vambe/aprobados/lookup", async (req, res) => {
  if (!asistenteAprobados.tokenAsistenteValido(req)) {
    return res.status(401).json({
      ok: false,
      error_code: "UNAUTHORIZED",
      message: "No autorizado",
    });
  }
  try {
    const out = await asistenteAprobados.lookupAprobadoVambe(req.body || {});
    if (!out.ok) {
      const code = out.error_code || "REQUEST_ERROR";
      return res.status(asistenteAprobados.lookupErrorStatus(code)).json(out);
    }
    return res.json(out);
  } catch (e) {
    console.warn("vambe/aprobados/lookup", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos consultar la ficha en este momento.",
    });
  }
});

app.post("/api/vambe/aprobados/lookup-flat", async (req, res) => {
  if (!asistenteAprobados.tokenAsistenteValido(req)) {
    return res.status(401).json({
      ok: false,
      error_code: "UNAUTHORIZED",
      message: "No autorizado",
    });
  }
  try {
    const out = await asistenteAprobados.lookupAprobadoVambe(req.body || {});
    if (!out.ok) {
      const code = out.error_code || "REQUEST_ERROR";
      return res.status(asistenteAprobados.lookupErrorStatus(code)).json(out);
    }
    return res.json(out);
  } catch (e) {
    console.warn("vambe/aprobados/lookup-flat", e.message || e);
    return res.status(503).json({
      ok: false,
      error_code: "SERVICE_UNAVAILABLE",
      message: "No pudimos consultar la ficha en este momento.",
    });
  }
});

app.get("/api/asistente/consultar-precios", (_req, res) => {
  res.status(405).json({ ok: false, error: "Usa POST con JSON" });
});

app.get("/admin", (_req, res) => {
  res.redirect(302, "/admin.html");
});

app.post("/api/aprobado-metrica", async (req, res) => {
  const slug = String((req.body && req.body.slug) || "").trim();
  const tipo = String((req.body && req.body.tipo) || "").trim().toLowerCase();
  if (!slug || !/^(qr|whatsapp|web|maps|compartir)$/.test(tipo)) {
    return res.status(400).json({ ok: false, error: "Parámetros inválidos" });
  }
  const cfg = supabaseServiceConfig();
  if (!cfg) return res.status(501).json({ ok: false, error: "Sin configuración" });
  try {
    const r = await fetch(`${cfg.url}/rest/v1/rpc/incrementar_metrica_aprobado`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug, p_tipo: tipo }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ ok: false, error: txt.slice(0, 200) });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.get("/aprobados", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/aprobado/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  let html = leerIndexHtml();
  try {
    const row = await asistenteAprobados.fetchAprobadoRowBySlug(slug);
    const meta = row ? asistenteAprobados.buildOpenGraphMetaAprobado(row) : null;
    if (meta) html = asistenteAprobados.inyectarOpenGraphEnHtml(html, meta);
  } catch (e) {
    console.warn("aprobado/og-meta", e.message || e);
  }
  res.type("html").send(html);
});

app.get("/api/geocode", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ ok: false, error: "Falta q" });
  try {
    let lat = null;
    let lng = null;
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=es`;
    const pr = await fetch(photonUrl);
    if (pr.ok) {
      const pdata = await pr.json();
      const f = pdata.features && pdata.features[0];
      if (f && f.geometry && Array.isArray(f.geometry.coordinates)) {
        lng = Number(f.geometry.coordinates[0]);
        lat = Number(f.geometry.coordinates[1]);
      }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const nr = await fetch(nomUrl, {
        headers: { "User-Agent": "AutoDatoWeb/1.0 (autodato.cl; contacto@autodato.cl)" },
      });
      if (nr.ok) {
        const rows = await nr.json();
        const hit = rows && rows[0];
        if (hit) {
          lat = Number(hit.lat);
          lng = Number(hit.lon);
        }
      }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(404).json({ ok: false, error: "Sin resultados" });
    }
    res.json({ ok: true, lat, lng, q });
  } catch (e) {
    res.status(503).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(puerto, () => {
  console.log(`AutoDato en http://localhost:${puerto}`);
});
