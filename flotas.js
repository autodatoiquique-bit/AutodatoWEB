const FLOTAS_KEY = "autodato_flotas";
let FLOTAS = [];

function hidratarFlotas() {
  try {
    const raw = JSON.parse(localStorage.getItem(FLOTAS_KEY) || "[]");
    if (Array.isArray(raw)) FLOTAS = raw.map(normalizarFlota).filter(Boolean);
  } catch (e) {
    FLOTAS = FLOTAS || [];
  }
}

function persistirFlotas() {
  localStorage.setItem(FLOTAS_KEY, JSON.stringify(FLOTAS || []));
}

function uidFlota(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function tokenFlotaServicio(id) {
  const sid = String(id || "");
  return sid ? `f:${sid}` : "";
}

function parseTokenFlotaServicio(tok) {
  const m = String(tok || "").match(/^f:(.+)$/);
  return m ? m[1] : "";
}

function normalizarServicioFlota(s) {
  if (!s || !s.nombre) return null;
  const precio = Number(String(s.precio || "").replace(/\./g, "").replace(",", "."));
  return {
    id: String(s.id || uidFlota("srv")),
    nombre: String(s.nombre).trim(),
    descripcion: String(s.descripcion || "").trim(),
    precio: Number.isFinite(precio) ? precio : 0,
    foto: String(s.foto || "").trim(),
  };
}

function sincronizarOrdenTarjetasFlota(col) {
  if (!col || !Array.isArray(col.servicios)) return;
  const ids = col.servicios.map((s) => s.id);
  const tokens = ids.map(tokenFlotaServicio).filter(Boolean);
  if (!Array.isArray(col.orden_tarjetas) || !col.orden_tarjetas.length) {
    col.orden_tarjetas = tokens;
    return;
  }
  const set = new Set(tokens);
  col.orden_tarjetas = col.orden_tarjetas.filter((t) => set.has(t));
  tokens.forEach((t) => {
    if (!col.orden_tarjetas.includes(t)) col.orden_tarjetas.push(t);
  });
}

function aplicarTokensOrdenColFlota(col, list) {
  if (!col) return;
  const byTok = {};
  (col.servicios || []).forEach((s) => {
    byTok[tokenFlotaServicio(s.id)] = s;
  });
  col.orden_tarjetas = list.slice();
  col.servicios = list.map((t) => byTok[t]).filter(Boolean);
}

function tarjetasFlotaDe(col) {
  sincronizarOrdenTarjetasFlota(col);
  const byId = {};
  (col.servicios || []).forEach((s) => {
    byId[s.id] = s;
  });
  return (col.orden_tarjetas || [])
    .map((tok) => {
      const id = parseTokenFlotaServicio(tok);
      const servicio = byId[id];
      if (!servicio) return null;
      return { servicio, token: tok };
    })
    .filter(Boolean);
}

function normalizarColumnaFlota(c) {
  if (!c || !c.titulo) return null;
  const servicios = (Array.isArray(c.servicios) ? c.servicios : [])
    .map(normalizarServicioFlota)
    .filter(Boolean);
  const col = {
    id: String(c.id || uidFlota("col")),
    titulo: String(c.titulo).trim(),
    foto: String(c.foto || "").trim(),
    servicios,
    orden_tarjetas: Array.isArray(c.orden_tarjetas) ? c.orden_tarjetas.map(String) : [],
  };
  sincronizarOrdenTarjetasFlota(col);
  return col;
}

function normalizarFlota(f) {
  if (!f || !f.nombre) return null;
  const columnas = (Array.isArray(f.columnas) ? f.columnas : [])
    .map(normalizarColumnaFlota)
    .filter(Boolean);
  const pinHash = String(f.pin_hash || f.clave_hash || "").trim();
  return {
    id: String(f.id || uidFlota("flota")),
    nombre: String(f.nombre).trim(),
    columnas,
    pin_hash: pinHash,
    link_acceso: String(f.link_acceso || "").trim(),
    canal_webhook: String(f.canal_webhook || "").trim(),
  };
}

function tokenLinkAccesoFlota() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function asegurarLinkAccesoFlota(flotaId) {
  const f = flotaPorId(flotaId);
  if (!f) return "";
  if (!f.link_acceso) f.link_acceso = tokenLinkAccesoFlota();
  return f.link_acceso;
}

function flotaPorLinkAcceso(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  return (FLOTAS || []).find((f) => f.link_acceso === t) || null;
}

function urlPublicaAccesoFlota(flotaId) {
  const tok = asegurarLinkAccesoFlota(flotaId);
  if (!tok) return "";
  const base = `${location.origin}${location.pathname || "/"}`;
  const u = new URL(base);
  u.searchParams.set("flota_acceso", tok);
  return u.toString();
}

async function resolverFlotaIdPorPin(pin) {
  const ingreso = String(pin || "").trim();
  if (!/^\d{4}$/.test(ingreso)) return null;
  for (const f of FLOTAS || []) {
    if (!f.pin_hash) continue;
    if ((await hashClaveFlota(f.id, ingreso)) === f.pin_hash) return f.id;
  }
  return null;
}

function flotaCanalWebhook(f) {
  if (!f) return "";
  if (f.canal_webhook) return String(f.canal_webhook).trim();
  if (String(f.nombre || "").toLowerCase() === "salfa") return "SALFA";
  return String(f.nombre || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function flotaIdDesdeCarrito(carrito) {
  const linea = (carrito || []).find((x) => x && x.tipo === "flota");
  return linea ? linea.flotaId : "";
}

function esTicketWebhookSalfa(flotaId) {
  const f = flotaPorId(flotaId);
  return flotaCanalWebhook(f) === "SALFA";
}

async function hashClaveFlota(flotaId, pin) {
  const data = new TextEncoder().encode(`autodato-flota|${flotaId}|${String(pin || "").trim()}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function establecerClaveFlota(flotaId, pinPlano) {
  const f = flotaPorId(flotaId);
  if (!f) return false;
  const pin = String(pinPlano || "").trim();
  if (!pin) {
    f.pin_hash = "";
    return true;
  }
  if (!/^\d{4}$/.test(pin)) return false;
  f.pin_hash = await hashClaveFlota(flotaId, pin);
  return true;
}

function flotaRequiereClave(flotaId) {
  const f = flotaPorId(flotaId);
  return Boolean(f && f.pin_hash);
}

async function verificarClaveFlota(flotaId, pin) {
  const f = flotaPorId(flotaId);
  if (!f || !f.pin_hash) return true;
  const ingreso = String(pin || "").trim();
  if (!/^\d{4}$/.test(ingreso)) return false;
  return (await hashClaveFlota(flotaId, ingreso)) === f.pin_hash;
}

function lineaFlotaCarritoId(flotaId, servicioId) {
  return `flota|${flotaId}|${servicioId}`;
}

function parseLineaFlotaCarritoId(id) {
  const m = String(id || "").match(/^flota\|(.+)\|(.+)$/);
  return m ? { flotaId: m[1], servicioId: m[2] } : null;
}

function buscarServicioFlota(flotaId, servicioId) {
  const f = flotaPorId(flotaId);
  if (!f) return null;
  for (const col of f.columnas || []) {
    const s = (col.servicios || []).find((x) => x.id === servicioId);
    if (s) return s;
  }
  return null;
}

function columnaFlotaPorId(flotaId, colId) {
  const f = flotaPorId(flotaId);
  return (f && f.columnas || []).find((c) => c.id === colId) || null;
}

function precioFlotaConIva(neto) {
  const n = Number(neto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1.19);
}

async function cargarFlotasPublico() {
  hidratarFlotas();
  if (typeof nubeLeerCatalogoCanales !== "function") return FLOTAS;
  try {
    const extra = await nubeLeerCatalogoCanales();
    if (extra && Array.isArray(extra._flotas)) {
      FLOTAS = extra._flotas.map(normalizarFlota).filter(Boolean);
      persistirFlotas();
    }
  } catch (e) {
    /* local */
  }
  return FLOTAS;
}

const FLOTA_SESION_PREFIX = "autodato_flota_ok_";

function sesionFlotaOk(flotaId) {
  return sessionStorage.getItem(`${FLOTA_SESION_PREFIX}${flotaId}`) === "1";
}

function marcarSesionFlota(flotaId) {
  sessionStorage.setItem(`${FLOTA_SESION_PREFIX}${flotaId}`, "1");
}

function cerrarSesionFlota(flotaId) {
  sessionStorage.removeItem(`${FLOTA_SESION_PREFIX}${flotaId}`);
}

function flotaPorId(id) {
  return (FLOTAS || []).find((f) => f.id === id) || null;
}

function clpNetoMasIva(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "A confirmar + IVA";
  return `${new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(n))} + IVA`;
}

function parsePrecioTarifario(raw) {
  return Number(String(raw || "").replace(/\./g, "").replace(",", ".").trim());
}

function parseLineaServicioFlota(line) {
  const mNum = String(line || "").trim().match(/^\d+\.\s+(.+)$/);
  if (!mNum) return null;
  let body = mNum[1].trim();
  let precio = null;
  let m = body.match(/^(.+):\s*\$?([\d.]+)\s*$/);
  if (m) {
    body = m[1].trim();
    precio = parsePrecioTarifario(m[2]);
  } else {
    m = body.match(/^(.+?)\s+\$?([\d.]+)\s*$/);
    if (!m) return null;
    body = m[1].trim();
    precio = parsePrecioTarifario(m[2]);
  }
  let nombre = body;
  let descripcion = "";
  const pm = body.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (pm) {
    nombre = pm[1].trim();
    descripcion = pm[2].trim();
  }
  return normalizarServicioFlota({ id: uidFlota("srv"), nombre, descripcion, precio });
}

function columnasDesdeMarkdownTarifario(text) {
  const columnas = [];
  let col = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^###\s+\d+\./.test(line)) {
      col = { id: uidFlota("col"), titulo: line.replace(/^###\s*/, "").trim(), servicios: [], orden_tarjetas: [] };
      columnas.push(col);
      continue;
    }
    if (!col) continue;
    const srv = parseLineaServicioFlota(line);
    if (srv) {
      col.servicios.push(srv);
      col.orden_tarjetas.push(tokenFlotaServicio(srv.id));
    }
  }
  return columnas.map(normalizarColumnaFlota).filter(Boolean);
}

async function cargarMarkdownSemillaSalfa() {
  try {
    const res = await fetch(`flotas-salfa.md?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

function crearFlotaDesdeColumnas(nombre, columnas) {
  return normalizarFlota({
    id: uidFlota("flota"),
    nombre,
    columnas: columnas || [],
  });
}

async function sembrarFlotaSalfaSiCorresponde() {
  if (!(FLOTAS && FLOTAS.length)) hidratarFlotas();
  if ((FLOTAS || []).some((f) => String(f.nombre).toLowerCase() === "salfa")) return false;
  const md = await cargarMarkdownSemillaSalfa();
  if (!md) return false;
  const columnas = columnasDesdeMarkdownTarifario(md);
  if (!columnas.length) return false;
  const flota = crearFlotaDesdeColumnas("SALFA", columnas);
  FLOTAS.push(flota);
  persistirFlotas();
  return true;
}

function moverColumnaFlota(flotaId, colId, targetColId, insertBefore) {
  const flota = flotaPorId(flotaId);
  if (!flota) return;
  const from = flota.columnas.findIndex((c) => c.id === colId);
  if (from < 0) return;
  const list = flota.columnas.slice();
  const [item] = list.splice(from, 1);
  let to = targetColId ? list.findIndex((c) => c.id === targetColId) : list.length;
  if (to < 0) to = list.length;
  if (!insertBefore) to += 1;
  if (from < to) to -= 1;
  list.splice(Math.max(0, to), 0, item);
  flota.columnas = list;
}

function serviciosFlotaEnOrdenCol(flotaId, colId) {
  const col = columnaFlotaPorId(flotaId, colId);
  if (!col) return [];
  return tarjetasFlotaDe(col).map((t) => t.servicio);
}

function ordenarColumnaFlotaPorPrecio(flotaId, colId) {
  const col = columnaFlotaPorId(flotaId, colId);
  if (!col) return false;
  sincronizarOrdenTarjetasFlota(col);
  const sorted = (col.servicios || []).slice().sort((a, b) => {
    const pa = Number(a.precio) || 0;
    const pb = Number(b.precio) || 0;
    if (pa !== pb) return pa - pb;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
  const tokens = sorted.map((s) => tokenFlotaServicio(s.id)).filter(Boolean);
  aplicarTokensOrdenColFlota(col, tokens);
  return true;
}

function moverTarjetaFlota(flotaId, colId, token, beforeToken) {
  const flota = flotaPorId(flotaId);
  const col = flota && flota.columnas.find((c) => c.id === colId);
  if (!col || !token) return;
  sincronizarOrdenTarjetasFlota(col);
  const list = col.orden_tarjetas.slice();
  const from = list.indexOf(token);
  if (from < 0) return;
  list.splice(from, 1);
  let to = beforeToken ? list.indexOf(beforeToken) : list.length;
  if (to < 0) to = list.length;
  if (from < to) to -= 1;
  list.splice(to, 0, token);
  aplicarTokensOrdenColFlota(col, list);
}

function quitarServicioFlotaCol(flotaId, colId, token) {
  const flota = flotaPorId(flotaId);
  const col = flota && flota.columnas.find((c) => c.id === colId);
  const sid = parseTokenFlotaServicio(token);
  if (!col || !sid) return;
  col.servicios = (col.servicios || []).filter((s) => s.id !== sid);
  col.orden_tarjetas = (col.orden_tarjetas || []).filter((t) => t !== token);
}

function agregarColumnaFlota(flotaId, titulo) {
  const flota = flotaPorId(flotaId);
  if (!flota) return null;
  const col = normalizarColumnaFlota({ id: uidFlota("col"), titulo, servicios: [], orden_tarjetas: [] });
  flota.columnas.push(col);
  return col;
}

function agregarServicioFlotaCol(flotaId, colId, datos) {
  const flota = flotaPorId(flotaId);
  const col = flota && flota.columnas.find((c) => c.id === colId);
  if (!col) return null;
  const srv = normalizarServicioFlota({ ...datos, id: uidFlota("srv") });
  if (!srv) return null;
  col.servicios.push(srv);
  col.orden_tarjetas.push(tokenFlotaServicio(srv.id));
  return srv;
}

function crearFlotaVacia(nombre) {
  const flota = crearFlotaDesdeColumnas(nombre, []);
  FLOTAS.push(flota);
  persistirFlotas();
  return flota;
}
