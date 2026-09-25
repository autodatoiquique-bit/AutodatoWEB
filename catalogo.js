const CATALOGO_KEY = "autodato_catalogo";
const DETALLE_CACHE_KEY = "autodato_servicio_detalle";

const MARCAS = ["Hyundai", "Kia", "Mazda", "Suzuki", "Nissan", "Toyota", "Mitsubishi", "Honda"];
const MODELOS = {
  Hyundai: ["Santa Fe", "Tucson", "Maxcruz", "Accent", "i30", "Elantra", "Porter", "Creta", "Veloster", "i40", "Palisade", "Otro"],
  Kia: ["Sportage", "Sorento", "Soul", "Carnival", "Bongo", "Otro"],
  Mitsubishi: ["Delica", "RVR"],
  Nissan: ["Tiida", "Note"],
  Toyota: ["Vitz"],
  Mazda: ["Axela", "Demio", "CX3", "CX5"],
  Suzuki: ["Otro"],
  Honda: ["Otro"],
};
const ANIO_MIN = 2010;
const ANIO_MAX = new Date().getFullYear();
const MODELOS_EXTRA_KEY = "autodato_modelos_extra";
const FOTOS_MODELOS_KEY = "autodato_fotos_modelos";
const TABLERO_KEY = "autodato_tablero_columnas";
let MODELOS_EXTRA = {};
let FOTOS_MODELOS = {};
let TABLERO_COLUMNAS = [];

function anios() {
  const out = [];
  for (let y = ANIO_MAX; y >= ANIO_MIN; y -= 1) out.push(y);
  return out;
}

function hidratarModelosExtra() {
  try {
    const raw = JSON.parse(localStorage.getItem(MODELOS_EXTRA_KEY) || "{}");
    if (raw && typeof raw === "object") MODELOS_EXTRA = { ...MODELOS_EXTRA, ...raw };
  } catch (e) {
    MODELOS_EXTRA = MODELOS_EXTRA || {};
  }
}

function persistirModelosExtra() {
  localStorage.setItem(MODELOS_EXTRA_KEY, JSON.stringify(MODELOS_EXTRA || {}));
}

function hidratarFotosModelos() {
  try {
    const raw = JSON.parse(localStorage.getItem(FOTOS_MODELOS_KEY) || "{}");
    if (raw && typeof raw === "object") FOTOS_MODELOS = { ...FOTOS_MODELOS, ...raw };
  } catch (e) {
    FOTOS_MODELOS = FOTOS_MODELOS || {};
  }
}

function persistirFotosModelos() {
  localStorage.setItem(FOTOS_MODELOS_KEY, JSON.stringify(FOTOS_MODELOS || {}));
}

function fotoModeloDe(marca, modelo) {
  if (!marca || !modelo) return "";
  return FOTOS_MODELOS[claveVehiculo(marca, modelo)] || "";
}

function hidratarTablero() {
  try {
    const raw = JSON.parse(localStorage.getItem(TABLERO_KEY) || "[]");
    if (Array.isArray(raw)) TABLERO_COLUMNAS = raw.map(normalizarColumnaTablero).filter(Boolean);
  } catch (e) {
    TABLERO_COLUMNAS = TABLERO_COLUMNAS || [];
  }
}

function persistirTablero() {
  localStorage.setItem(TABLERO_KEY, JSON.stringify(TABLERO_COLUMNAS || []));
}

function normalizarCombustible(v) {
  const t = String(v || "").toLowerCase();
  if (t === "diesel" || t === "diésel" || t === "diesell") return "diesel";
  if (t === "bencina" || t === "bencinero" || t === "gasolina") return "bencina";
  return "ambos";
}

function etiquetaCombustible(v) {
  const t = normalizarCombustible(v);
  if (t === "diesel") return "Diésel";
  if (t === "bencina") return "Bencina";
  return "Diésel y bencina";
}

function combustibleCoincide(a, b) {
  const x = normalizarCombustible(a);
  const y = normalizarCombustible(b);
  return x === "ambos" || y === "ambos" || x === y;
}

const COMBUSTIBLES = [
  { value: "diesel", label: "Diésel" },
  { value: "bencina", label: "Bencina" },
  { value: "ambos", label: "Ambos (diésel y bencina)" },
];

function anioONull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1950 || n > 2100) return null;
  return n;
}

function idsDeColumna(col, campo) {
  if (!col || !Array.isArray(col[campo])) return [];
  return col[campo].map(String).filter(Boolean);
}

function tokenTarjetaColumna(tipo, id) {
  const sid = String(id || "");
  if (!sid) return "";
  return `${tipo === "portada" ? "p" : "s"}:${sid}`;
}

function parseTokenTarjetaColumna(tok) {
  const m = String(tok || "").match(/^([ps]):(.+)$/);
  if (!m) return null;
  return { tipo: m[1] === "p" ? "portada" : "servicio", id: m[2] };
}

function aplicarTokensOrdenCol(col, tokens) {
  if (!col) return;
  col.orden_tarjetas = (tokens || []).map(String).filter(Boolean);
  col.portadas = col.orden_tarjetas.filter((t) => t.startsWith("p:")).map((t) => t.slice(2));
  col.servicios = col.orden_tarjetas.filter((t) => t.startsWith("s:")).map((t) => t.slice(2));
}

function sincronizarOrdenTarjetasCol(col) {
  if (!col) return;
  const vistos = new Set();
  const out = [];
  const push = (tok) => {
    if (!tok || vistos.has(tok)) return;
    const p = parseTokenTarjetaColumna(tok);
    if (!p) return;
    if (p.tipo === "portada" && !idsDeColumna(col, "portadas").includes(p.id)) return;
    if (p.tipo === "servicio" && !idsDeColumna(col, "servicios").includes(p.id)) return;
    vistos.add(tok);
    out.push(tok);
  };
  (Array.isArray(col.orden_tarjetas) ? col.orden_tarjetas : []).forEach(push);
  idsDeColumna(col, "portadas").forEach((id) => push(tokenTarjetaColumna("portada", id)));
  idsDeColumna(col, "servicios").forEach((id) => push(tokenTarjetaColumna("servicio", id)));
  aplicarTokensOrdenCol(col, out);
}

function tarjetasKanbanDe(col) {
  sincronizarOrdenTarjetasCol(col);
  return (col.orden_tarjetas || [])
    .map((tok) => {
      const p = parseTokenTarjetaColumna(tok);
      if (!p) return null;
      if (p.tipo === "portada") {
        const slide = (typeof portadaSlides !== "undefined" ? portadaSlides : []).find((s) => s.id === p.id);
        if (!slide || !itemEnColumna(slide, col)) return null;
        const i = portadaSlides.findIndex((s) => s.id === p.id);
        return { tipo: "portada", token: tok, slide, i };
      }
      const servicio = (typeof catalogo !== "undefined" ? catalogo : []).find((s) => s.id === p.id);
      if (!servicio || !itemEnColumna(servicio, col)) return null;
      return { tipo: "servicio", token: tok, servicio };
    })
    .filter(Boolean);
}

function ordenarServiciosColumna(col, lista) {
  if (!col || !lista || !lista.length) return lista || [];
  sincronizarOrdenTarjetasCol(col);
  const map = new Map(lista.map((s) => [String(s.id), s]));
  const out = [];
  (col.servicios || []).forEach((id) => {
    const s = map.get(String(id));
    if (s) {
      out.push(s);
      map.delete(String(id));
    }
  });
  map.forEach((s) => out.push(s));
  return out;
}

function sumarItemAColumna(col, id, campo) {
  if (!col || !id) return false;
  const key = campo || "servicios";
  if (!Array.isArray(col[key])) col[key] = [];
  const sid = String(id);
  if (col[key].includes(sid)) return false;
  col[key].push(sid);
  const tok = tokenTarjetaColumna(key === "portadas" ? "portada" : "servicio", sid);
  if (!Array.isArray(col.orden_tarjetas)) col.orden_tarjetas = [];
  if (!col.orden_tarjetas.includes(tok)) col.orden_tarjetas.push(tok);
  aplicarOrdenColumnaTableroSiCorresponde(col);
  return true;
}

function quitarItemDeColumnas(id) {
  const sid = String(id || "");
  if (!sid) return;
  (typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : []).forEach((col) => {
    if (Array.isArray(col.servicios)) col.servicios = col.servicios.filter((x) => String(x) !== sid);
    if (Array.isArray(col.portadas)) col.portadas = col.portadas.filter((x) => String(x) !== sid);
    if (Array.isArray(col.orden_tarjetas)) {
      col.orden_tarjetas = col.orden_tarjetas.filter((t) => !t.endsWith(`:${sid}`));
    }
  });
}

function normalizarOrdenAutomaticoTarjetasCol(raw) {
  const v = String(raw || "no").trim().toLowerCase();
  return v === "si" || v === "sí" || v === "true" ? "si" : "no";
}

function columnaOrdenAutomaticoTarjetas(col) {
  return Boolean(col && col.orden_automatico_tarjetas === "si");
}

function esAceiteMotorNombreServicio(s) {
  if (!s) return false;
  return String(s.nombre || "")
    .toLowerCase()
    .includes("aceite de motor");
}

function grupoOrdenTarjetaTablero(tarjeta) {
  if (!tarjeta) return 9;
  if (tarjeta.tipo === "portada") return 0;
  const s = tarjeta.servicio;
  if (!s) return 9;
  if (typeof esServicioCombo === "function" && esServicioCombo(s)) return 1;
  if (esAceiteMotorNombreServicio(s)) return 2;
  return 3;
}

function precioOrdenTarjetaTablero(tarjeta) {
  if (!tarjeta || !tarjeta.servicio) return 0;
  const s = tarjeta.servicio;
  const n = typeof valorNormalDe === "function" ? valorNormalDe(s) : s.precio;
  return Number(n) || 0;
}

function ordenarColumnaTableroAutomatico(col) {
  if (!col) return false;
  sincronizarOrdenTarjetasCol(col);
  const items = tarjetasKanbanDe(col);
  const sorted = items.slice().sort((a, b) => {
    const ga = grupoOrdenTarjetaTablero(a);
    const gb = grupoOrdenTarjetaTablero(b);
    if (ga !== gb) return ga - gb;
    if (ga >= 1) {
      const pa = precioOrdenTarjetaTablero(a);
      const pb = precioOrdenTarjetaTablero(b);
      if (pa !== pb) return pa - pb;
      return String(a.servicio?.nombre || "").localeCompare(String(b.servicio?.nombre || ""), "es");
    }
    if (a.tipo === "portada" && b.tipo === "portada") {
      return (a.i || 0) - (b.i || 0);
    }
    return 0;
  });
  aplicarTokensOrdenCol(
    col,
    sorted.map((t) => t.token).filter(Boolean)
  );
  return true;
}

function aplicarOrdenColumnaTableroSiCorresponde(colRef) {
  const tablero = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  const c =
    colRef && colRef.marca && colRef.modelo
      ? colRef
      : tablero.find((x) => x.id === (typeof colRef === "string" ? colRef : colRef && colRef.id));
  if (!c || !columnaOrdenAutomaticoTarjetas(c)) return false;
  return ordenarColumnaTableroAutomatico(c);
}

function servicioEnCanal(s, canal) {
  if (!canal || !s) return true;
  const c =
    typeof normalizarCanales === "function"
      ? normalizarCanales(s.canales, s.tipo)
      : s.canales || {};
  return Boolean(c[canal]);
}

function normalizarColumnaTablero(c) {
  if (!c || !c.marca || !c.modelo) return null;
  const d = anioONull(c.ano_desde);
  const h = anioONull(c.ano_hasta);
  const col = {
    id: String(c.id || `col-${c.marca}-${c.modelo}-${d || ""}-${h || ""}`),
    marca: String(c.marca),
    modelo: String(c.modelo),
    ano_desde: d,
    ano_hasta: h,
    combustible: normalizarCombustible(c.combustible),
    foto: String(c.foto || ""),
    servicios: idsDeColumna(c, "servicios"),
    portadas: idsDeColumna(c, "portadas"),
    orden_tarjetas: Array.isArray(c.orden_tarjetas) ? c.orden_tarjetas.map(String) : [],
    ocultos: Array.isArray(c.ocultos) ? c.ocultos.map(String) : [],
  };
  col.orden_automatico_tarjetas = normalizarOrdenAutomaticoTarjetasCol(c.orden_automatico_tarjetas);
  return col;
}

function claveColumnaTablero(c) {
  return `${c.marca}|${c.modelo}|${c.ano_desde || ""}|${c.ano_hasta || ""}|${normalizarCombustible(c && c.combustible)}`;
}

function aniosSeSolapan(a, b) {
  const a1 = a.ano_desde != null ? a.ano_desde : ANIO_MIN;
  const a2 = a.ano_hasta != null ? a.ano_hasta : ANIO_MAX;
  const b1 = b.ano_desde != null ? b.ano_desde : ANIO_MIN;
  const b2 = b.ano_hasta != null ? b.ano_hasta : ANIO_MAX;
  return a1 <= b2 && b1 <= a2;
}

function destinoEnColumna(dest, col) {
  if (!dest || !col) return false;
  if (dest.marca !== col.marca) return false;
  if (dest.modelo !== col.modelo) return false;
  if (!aniosSeSolapan(dest, col)) return false;
  return combustibleCoincide(dest.combustible, col.combustible);
}

function fotoPortadaColumna(col) {
  if (col && col.foto) return col.foto;
  const slides = portadasFlyerDeColumna(col);
  if (slides[0] && slides[0].foto) return slides[0].foto;
  return fotoModeloDe(col && col.marca, col && col.modelo);
}

function vehiculoEnColumna(v, col) {
  if (!v || !col || !v.marca || !v.modelo) return false;
  if (String(v.marca).toLowerCase() !== String(col.marca).toLowerCase()) return false;
  if (String(v.modelo).toLowerCase() !== String(col.modelo).toLowerCase()) return false;
  if (v.ano != null && v.ano !== "" && !anioEnRango(v.ano, col)) return false;
  return combustibleCoincide(v.combustible, col.combustible);
}

function columnaDeVehiculo(v) {
  if (!v || !v.marca || !v.modelo) return null;
  const cols = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  const candidatos = cols.filter((c) => vehiculoEnColumna(v, c));
  if (!candidatos.length) return null;
  if (candidatos.length === 1) return candidatos[0];
  if (v.ano != null && v.ano !== "") {
    const estrecho = candidatos
      .map((c) => ({
        c,
        span:
          (c.ano_hasta != null ? c.ano_hasta : ANIO_MAX) - (c.ano_desde != null ? c.ano_desde : ANIO_MIN),
      }))
      .sort((a, b) => a.span - b.span)[0];
    if (estrecho) return estrecho.c;
  }
  return candidatos[0];
}

function fotoPortadaVehiculo(v) {
  const col = columnaDeVehiculo(v);
  if (col) return fotoPortadaColumna(col);
  return fotoModeloDe(v && v.marca, v && v.modelo);
}

function itemOcultoEnColumna(col, tipo, id) {
  const sid = String(id || "");
  if (!col || !sid) return false;
  const ocultos = Array.isArray(col.ocultos) ? col.ocultos : [];
  return ocultos.includes(tokenTarjetaColumna(tipo, sid));
}

function quitarTarjetaDeColumna(colId, token) {
  const col = (typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : []).find((c) => c.id === colId);
  const tok = String(token || "");
  const p = parseTokenTarjetaColumna(tok);
  if (!col || !p) return false;
  if (!Array.isArray(col.ocultos)) col.ocultos = [];
  if (!col.ocultos.includes(tok)) col.ocultos.push(tok);
  if (Array.isArray(col.orden_tarjetas)) col.orden_tarjetas = col.orden_tarjetas.filter((t) => t !== tok);
  if (p.tipo === "servicio" && Array.isArray(col.servicios)) {
    col.servicios = col.servicios.filter((x) => String(x) !== p.id);
  }
  if (p.tipo === "portada" && Array.isArray(col.portadas)) {
    col.portadas = col.portadas.filter((x) => String(x) !== p.id);
  }
  return true;
}

function itemEnColumna(item, col) {
  if (!item || !col) return false;
  const id = String(item.id || "");
  const esPortada = typeof portadaSlides !== "undefined" && (portadaSlides || []).some((s) => s.id === id);
  if (esPortada) {
    if (itemOcultoEnColumna(col, "portada", id)) return false;
    sincronizarOrdenTarjetasCol(col);
    return idsDeColumna(col, "portadas").includes(id);
  }
  const esServicio = typeof catalogo !== "undefined" && (catalogo || []).some((s) => s.id === id);
  if (esServicio && itemOcultoEnColumna(col, "servicio", id)) return false;
  if (id && idsDeColumna(col, "servicios").includes(id)) return true;
  const destinos = normalizarVehiculos(item && item.vehiculos);
  if (!destinos.length) return false;
  return destinos.some((v) => destinoEnColumna(v, col));
}

function sembrarPortadasEnColumnas() {
  const cols = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  const slides = typeof portadaSlides !== "undefined" ? portadaSlides || [] : [];
  if (!cols.length || !slides.length) return false;
  let cambio = false;
  slides.forEach((s) => {
    if (!s || !s.id || !s.foto || s.defecto) return;
    const destinos = normalizarVehiculos(s.vehiculos);
    if (!destinos.length) return;
    cols.forEach((col) => {
      if (!destinos.some((v) => destinoEnColumna(v, col))) return;
      if (itemOcultoEnColumna(col, "portada", s.id)) return;
      if (sumarItemAColumna(col, s.id, "portadas")) cambio = true;
    });
  });
  if (cambio) cols.forEach((col) => sincronizarOrdenTarjetasCol(col));
  return cambio;
}

function sembrarMembresiaColumnas() {
  const cols = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  if (!cols.length) return;
  cols.forEach((col) => {
    if (!Array.isArray(col.servicios)) col.servicios = [];
    if (!Array.isArray(col.portadas)) col.portadas = [];
    (typeof catalogo !== "undefined" ? catalogo || [] : []).forEach((s) => {
      if (!s || !s.id || col.servicios.includes(String(s.id))) return;
      if (itemOcultoEnColumna(col, "servicio", s.id)) return;
      const destinos = normalizarVehiculos(s.vehiculos);
      if (destinos.some((v) => destinoEnColumna(v, col))) col.servicios.push(String(s.id));
    });
    sincronizarOrdenTarjetasCol(col);
  });
  return sembrarPortadasEnColumnas();
}

function sembrarColumnasTablero() {
  const vistos = new Set((TABLERO_COLUMNAS || []).map(claveColumnaTablero));
  const agregar = (v) => {
    const col = normalizarColumnaTablero({
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      marca: v.marca,
      modelo: v.modelo === "*" ? "todos" : v.modelo,
      ano_desde: v.ano_desde,
      ano_hasta: v.ano_hasta,
      combustible: v.combustible,
    });
    if (!col || col.modelo === "todos") return;
    const k = claveColumnaTablero(col);
    if (vistos.has(k)) return;
    vistos.add(k);
    TABLERO_COLUMNAS.push(col);
  };
  (catalogo || []).forEach((s) => normalizarVehiculos(s.vehiculos).forEach(agregar));
  (typeof portadaSlides !== "undefined" ? portadaSlides : []).forEach((s) =>
    normalizarVehiculos(s.vehiculos).forEach(agregar)
  );
  persistirTablero();
}

function registrarModelo(marca, modelo) {
  const m = String(modelo || "").trim();
  if (!marca || !m || m === "*") return false;
  const base = MODELOS[marca] || [];
  if (base.includes(m)) return true;
  if (!MODELOS_EXTRA[marca]) MODELOS_EXTRA[marca] = [];
  if (!MODELOS_EXTRA[marca].includes(m)) MODELOS_EXTRA[marca].push(m);
  persistirModelosExtra();
  return true;
}

function recolectarModelosExtra(lista) {
  (lista || []).forEach((s) => {
    normalizarVehiculos(s && s.vehiculos).forEach((v) => registrarModelo(v.marca, v.modelo));
  });
}

function modelosDe(marca) {
  const out = [];
  [...(MODELOS[marca] || []), ...(MODELOS_EXTRA[marca] || [])].forEach((m) => {
    if (m && !out.includes(m)) out.push(m);
  });
  if (!out.includes("Otro")) out.push("Otro");
  return out;
}

function claveVehiculo(marca, modelo) {
  return `${marca}|${modelo}`;
}

function etiquetaRangoAnios(v) {
  if (!v) return "todos los años";
  if (v.ano_desde != null && v.ano_hasta == null) return `${v.ano_desde} en adelante`;
  if (v.ano_desde == null && v.ano_hasta != null) return `hasta ${v.ano_hasta}`;
  if (v.ano_desde != null && v.ano_hasta != null && v.ano_desde === v.ano_hasta) return String(v.ano_desde);
  if (v.ano_desde != null && v.ano_hasta != null) return `${v.ano_desde} a ${v.ano_hasta}`;
  return "todos los años";
}

function etiquetaColumnaAnios(col) {
  if (!col) return "";
  if (col.ano_desde != null && col.ano_hasta != null) return `${col.ano_desde}-${col.ano_hasta}`;
  if (col.ano_desde != null) return `${col.ano_desde}+`;
  if (col.ano_hasta != null) return `hasta ${col.ano_hasta}`;
  return "";
}

function tituloColumna(col) {
  if (!col) return "";
  const anios = etiquetaColumnaAnios(col);
  return anios ? `${col.marca} ${col.modelo} ${anios}` : `${col.marca} ${col.modelo}`;
}

function normalizarVehiculos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((v) => {
      let marca = "";
      let modelo = "";
      let ano_desde = null;
      let ano_hasta = null;
      if (typeof v === "string") {
        const partes = v.split("|");
        marca = partes[0] || "";
        modelo = partes[1] || "";
      } else if (v && v.marca) {
        marca = String(v.marca);
        modelo = String(v.modelo || "*");
        ano_desde = anioONull(v.ano_desde);
        ano_hasta = anioONull(v.ano_hasta);
      }
      if (!marca) return null;
      return {
        marca,
        modelo: modelo || "*",
        ano_desde,
        ano_hasta,
        combustible: normalizarCombustible(v && v.combustible),
      };
    })
    .filter(Boolean);
}

function anioEnRango(ano, v) {
  if (ano == null || ano === "") return true;
  const n = Number(ano);
  if (!Number.isFinite(n)) return true;
  if (v.ano_desde != null && n < v.ano_desde) return false;
  if (v.ano_hasta != null && n > v.ano_hasta) return false;
  return true;
}

function servicioAplicaAVehiculo(s, vehiculo) {
  if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) return true;
  const col = columnaDeVehiculo(vehiculo);
  if (col) {
    const id = String((s && s.id) || "");
    if (!id || s.activo === false) return false;
    if (itemOcultoEnColumna(col, "servicio", id)) return false;
    sincronizarOrdenTarjetasCol(col);
    return idsDeColumna(col, "servicios").includes(id);
  }
  const destinos = normalizarVehiculos(s && s.vehiculos);
  if (!destinos.length) return true;
  return destinos.some((v) => {
    if (v.marca !== vehiculo.marca) return false;
    if (v.modelo !== "*" && v.modelo !== vehiculo.modelo) return false;
    if (!anioEnRango(vehiculo.ano, v)) return false;
    return combustibleCoincide(v.combustible, vehiculo.combustible);
  });
}

function etiquetaVehiculos(s) {
  const destinos = normalizarVehiculos(s && s.vehiculos);
  if (!destinos.length) return "Todos los vehículos";
  return destinos
    .map((v) => {
      const modelo = v.modelo === "*" ? "todos los modelos" : v.modelo;
      return `${v.marca} ${modelo} · ${etiquetaRangoAnios(v)} · ${etiquetaCombustible(v.combustible)}`;
    })
    .join(" · ");
}

const AGENDA_EXTRA = [
  { id: "cambio-aceite-agenda", nombre: "Cambio de aceite", precio: null, tipo: "agenda" },
];

const CATALOGO_SEMILLA = [
  {
    id: "descarb",
    tipo: "oferta",
    nombre: "Descarbonización de sistemas de admisión",
    precio: 240000,
    resumen: "Limpieza profunda de admisión para recuperar respuesta y consumo.",
    detalle: "Trabajo preventivo de admisión. En el catálogo ves el precio de lista. Los descuentos aparecen solo cuando ya elegiste un servicio y armas combo.",
    foto: "imagenes/scanner.jpg",
    galeria: [],
    videos: [],
    complementos: [
      { id: "refrigerante", precioCombo: 50000, etiqueta: "con descarbonización" },
      { id: "ckp", precioCombo: 160000, etiqueta: "con descarbonización" },
      { id: "filtro-aire", precioCombo: 15000, etiqueta: "con descarbonización" },
      { id: "aceite-valvoline", precioCombo: 134000, etiqueta: "con descarbonización" },
    ],
  },
  {
    id: "refrigerante",
    tipo: "oferta",
    nombre: "Cambio de refrigerante ZEREX Valvoline",
    precio: 90000,
    resumen: "Recambio de refrigerante ZEREX Valvoline.",
    detalle: "Precio de lista $90.000. Si ya tienes descarbonización en tu ticket, baja a $50.000.",
    foto: "imagenes/aceite.jpg",
    galeria: [],
    videos: [],
    complementos: [{ id: "termostato", precioCombo: 65000, etiqueta: "con cambio de refrigerante" }],
  },
  {
    id: "ckp",
    tipo: "oferta",
    nombre: "Cambio de sensor CKP original",
    precio: 220000,
    resumen: "Sensor CKP original.",
    detalle: "Precio de lista $220.000. Junto con la descarbonización baja a $160.000.",
    foto: "imagenes/frenos.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
  {
    id: "termostato",
    tipo: "oferta",
    nombre: "Cambio de termostato",
    precio: 80000,
    resumen: "Cambio de termostato.",
    detalle: "Precio de lista $80.000. Junto con el cambio de refrigerante baja a $65.000.",
    foto: "imagenes/alineacion.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
  {
    id: "filtro-aire",
    tipo: "oferta",
    nombre: "Cambio de filtro de aire",
    precio: 17500,
    resumen: "Filtro de aire.",
    detalle: "Precio de lista $17.500. Junto con la descarbonización baja a $15.000.",
    foto: "imagenes/ruta.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
  {
    id: "aceite-valvoline",
    tipo: "oferta",
    nombre: "Cambio de aceite Valvoline 5W30 MST",
    precio: 165000,
    resumen: "Aceite Valvoline 5W30 MST.",
    detalle: "Precio de lista $165.000. Con la descarbonización baja a $134.000.",
    foto: "imagenes/aceite.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
  {
    id: "diag-escaner",
    tipo: "diagnostico",
    nombre: "Diagnóstico escáner (check engine, pérdida de potencia)",
    resumen: "Scanner para check engine y pérdida de potencia.",
    detalle: "Lectura de fallas, check engine y pérdida de potencia.",
    precio: 49990,
    foto: "imagenes/scanner.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
  {
    id: "diag-suspension",
    tipo: "diagnostico",
    nombre: "Diagnóstico de suspensión, dirección o frenos",
    resumen: "Revisión de suspensión, dirección o frenos.",
    detalle: "Diagnóstico de suspensión, dirección o frenos.",
    precio: 44990,
    foto: "imagenes/frenos.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
  {
    id: "diag-fugas",
    tipo: "diagnostico",
    nombre: "Diagnóstico de fugas y sonidos de motor (mecánica general)",
    resumen: "Fugas y sonidos de motor. Mecánica general.",
    detalle: "Diagnóstico de fugas y ruidos de motor.",
    precio: 44990,
    foto: "imagenes/alineacion.jpg",
    galeria: [],
    videos: [],
    complementos: [],
  },
];

let catalogo = [];
let catalogoListo = false;
let catalogoPromesa = null;

function catalogoEstaListo() {
  return catalogoListo && Array.isArray(catalogo) && catalogo.length > 0;
}

function persistirCatalogoLocal(lista) {
  try {
    localStorage.setItem(CATALOGO_KEY, JSON.stringify(lista || catalogo));
  } catch (e) {
    /* ignore */
  }
}

function clonarCatalogo(lista) {
  return JSON.parse(JSON.stringify(lista));
}

function hidratarCatalogo() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATALOGO_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw;
  } catch (e) {
    /* ignore */
  }
  const semilla = clonarCatalogo(CATALOGO_SEMILLA);
  localStorage.setItem(CATALOGO_KEY, JSON.stringify(semilla));
  return semilla;
}

function normalizarCanales(c, tipo) {
  if (c && (c.ofertas != null || c.mantencion != null || c.diagnostico != null)) {
    return {
      ofertas: Boolean(c.ofertas),
      mantencion: Boolean(c.mantencion),
      diagnostico: Boolean(c.diagnostico),
    };
  }
  if (tipo === "diagnostico") return { ofertas: false, mantencion: false, diagnostico: true };
  return { ofertas: false, mantencion: true, diagnostico: false };
}

function tipoDesdeCanales(canales) {
  if (canales.diagnostico && !canales.ofertas && !canales.mantencion) return "diagnostico";
  return "oferta";
}

function normalizarMediaItem(x, tipo, i) {
  const src = typeof x === "string" ? x : String((x && (x.src || x.url)) || "");
  const base = typeof x === "object" && x ? x : {};
  return {
    id: String(base.id || `${tipo}-${i}`),
    tipo: base.tipo === "video" || tipo === "video" ? "video" : "foto",
    src,
    zoom: clampNum(base.zoom, 0.35, 4, 1),
    scale_x: clampNum(base.scale_x, 0.4, 3, 1),
    scale_y: clampNum(base.scale_y, 0.4, 3, 1),
    off_x: clampNum(base.off_x, -160, 160, 0),
    off_y: clampNum(base.off_y, -160, 160, 0),
  };
}

function mediaServicio(s) {
  if (s && Array.isArray(s.media) && s.media.length) {
    return s.media.map((m, i) => normalizarMediaItem(m, (m && m.tipo) || "foto", i)).filter((m) => m.src);
  }
  const items = [];
  const vistos = new Set();
  const push = (item) => {
    if (!item.src || vistos.has(item.src)) return;
    vistos.add(item.src);
    items.push(item);
  };
  const galeria = (s && s.galeria) || [];
  const yaEnGaleria = galeria.map((g) => (typeof g === "string" ? g : g && g.src));
  if (s && s.foto && !yaEnGaleria.includes(s.foto)) {
    push(normalizarMediaItem({ src: s.foto, ...(s.foto_ui || {}) }, "foto", 0));
  }
  galeria.forEach((g, i) => push(normalizarMediaItem(g, "foto", i + 1)));
  ((s && s.videos) || []).forEach((v, i) => push(normalizarMediaItem(v, "video", i)));
  return items;
}

function aplicarMediaServicio(s, media) {
  const lista = (media || []).map((m, i) => normalizarMediaItem(m, m.tipo || "foto", i)).filter((m) => m.src);
  s.media = lista;
  const fotos = lista.filter((m) => m.tipo === "foto");
  const videos = lista.filter((m) => m.tipo === "video");
  s.foto = fotos[0] ? fotos[0].src : "";
  s.foto_ui = fotos[0]
    ? { zoom: fotos[0].zoom, scale_x: fotos[0].scale_x, scale_y: fotos[0].scale_y, off_x: fotos[0].off_x, off_y: fotos[0].off_y }
    : null;
  s.galeria = fotos;
  s.videos = videos;
  return s;
}

function comboItemsDe(s) {
  if (!s || !Array.isArray(s.combo_items)) return [];
  return s.combo_items.map((id) => String(id || "").trim()).filter(Boolean);
}

function esServicioCombo(s) {
  return Boolean(s && s.es_combo && comboItemsDe(s).length >= 2);
}

function idsMiembrosCombo(s) {
  if (!s || !s.es_combo) return [];
  return comboItemsDe(s);
}

function preciosPackCombo(s) {
  const ids = idsMiembrosCombo(s);
  const lineas = [];
  let lista = 0;
  let pagado = 0;
  ids.forEach((id) => {
    const item = servicioPorId(id);
    if (!item || item.precio == null) return;
    const otros = ids.filter((x) => x !== id);
    const p = precioPagado(item, otros);
    if (p.lista == null || p.pagado == null) return;
    lista += p.lista;
    pagado += p.pagado;
    lineas.push({ id, nombre: item.nombre || id, ...p });
  });
  return { lista, pagado, ahorro: Math.max(0, lista - pagado), lineas };
}

function comboSinStockMiembros(s) {
  return idsMiembrosCombo(s).some((id) => {
    const m = servicioPorId(id);
    return m && servicioSinStock(m);
  });
}

function normalizarServicio(s) {
  const canales = normalizarCanales(s && s.canales, s && s.tipo);
  const comboItems = Array.isArray(s && s.combo_items)
    ? s.combo_items.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const base = {
    ...s,
    canales,
    es_combo: Boolean(s && s.es_combo),
    combo_items: comboItems,
    tipo: (s && s.tipo) || tipoDesdeCanales(canales),
    tiene_oferta: tieneOferta(s),
    oferta_combo: s && (s.oferta_combo === true || s.oferta_combo === "si" || (s.oferta_combo == null && (s.complementos || []).length > 0)),
    precio_oferta: precioOfertaDe({ ...s, tiene_oferta: tieneOferta(s) }),
    vehiculos: normalizarVehiculos(s && s.vehiculos),
    dots_x: clampNum(s && s.dots_x, 6, 94, 50),
    dots_y: clampNum(s && s.dots_y, 6, 94, 62),
    tiempo_min: Number(s && s.tiempo_min) > 0 ? Number(s.tiempo_min) : null,
    mano_obra: Number(s && s.mano_obra) > 0 ? Number(s.mano_obra) : 0,
    insumos: normalizarInsumos(s && s.insumos),
    agotado: Boolean(s && s.agotado),
    ultima_unidad: Boolean(s && s.ultima_unidad),
    stock_restante: stockRestanteDe(s),
  };
  if (base.stock_restante != null && base.stock_restante <= 0) base.agotado = true;
  const out = aplicarMediaServicio(base, mediaServicio(base));
  out.detalleListo = true;
  return out;
}

function normalizarServicioLista(s) {
  const canales = normalizarCanales(s && s.canales, s && s.tipo);
  const comboItems = Array.isArray(s && s.combo_items)
    ? s.combo_items.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const base = {
    ...s,
    canales,
    es_combo: Boolean(s && s.es_combo),
    combo_items: comboItems,
    tipo: (s && s.tipo) || tipoDesdeCanales(canales),
    tiene_oferta: tieneOferta(s),
    oferta_combo: s && (s.oferta_combo === true || s.oferta_combo === "si" || (s.oferta_combo == null && (s.complementos || []).length > 0)),
    precio_oferta: precioOfertaDe({ ...s, tiene_oferta: tieneOferta(s) }),
    vehiculos: normalizarVehiculos(s && s.vehiculos),
    detalle: "",
    galeria: [],
    videos: [],
    media: [],
    insumos: [],
    mano_obra: 0,
    tiempo_min: null,
    dots_x: 50,
    dots_y: 62,
    agotado: Boolean(s && s.agotado),
    ultima_unidad: Boolean(s && s.ultima_unidad),
    stock_restante: stockRestanteDe(s),
  };
  if (base.stock_restante != null && base.stock_restante <= 0) base.agotado = true;
  base.foto = String(base.foto || "").trim();
  base.detalleListo = false;
  return base;
}

function leerDetalleCache(id) {
  try {
    const map = JSON.parse(localStorage.getItem(DETALLE_CACHE_KEY) || "{}");
    return map[String(id)] || null;
  } catch (e) {
    return null;
  }
}

function guardarDetalleCache(id, s) {
  if (!id || !s) return;
  try {
    const map = JSON.parse(localStorage.getItem(DETALLE_CACHE_KEY) || "{}");
    map[String(id)] = {
      detalle: s.detalle || "",
      galeria: s.galeria || [],
      videos: s.videos || [],
      media: s.media || [],
      foto: s.foto || "",
      foto_ui: s.foto_ui || null,
      dots_x: s.dots_x,
      dots_y: s.dots_y,
      tiempo_min: s.tiempo_min,
      mano_obra: s.mano_obra,
      insumos: s.insumos || [],
    };
    localStorage.setItem(DETALLE_CACHE_KEY, JSON.stringify(map));
  } catch (e) {
    /* ignore */
  }
}

function fusionarDetalleEnServicio(dest, full) {
  if (!dest || !full) return dest;
  const campos = [
    "detalle",
    "galeria",
    "videos",
    "media",
    "foto",
    "foto_ui",
    "dots_x",
    "dots_y",
    "tiempo_min",
    "mano_obra",
    "insumos",
  ];
  campos.forEach((k) => {
    if (full[k] != null) dest[k] = full[k];
  });
  dest.detalleListo = true;
  return dest;
}

async function ensureDetalleServicio(id) {
  const sid = String(id || "");
  if (!sid) return null;
  let s = (catalogo || []).find((x) => String(x.id) === sid);
  if (!s) return null;
  if (s.detalleListo) return s;
  const cached = leerDetalleCache(sid);
  if (cached) {
    fusionarDetalleEnServicio(s, normalizarServicio({ ...s, ...cached }));
    return s;
  }
  if (typeof nubeActiva !== "function" || !nubeActiva() || typeof nubeLeerServicioDetalle !== "function") {
    return s;
  }
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  const remoto = await nubeLeerServicioDetalle(sid);
  if (!remoto) return s;
  const full = normalizarServicio(remoto);
  fusionarDetalleEnServicio(s, full);
  guardarDetalleCache(sid, s);
  return s;
}

function stockRestanteDe(s) {
  if (!s || s.stock_restante == null || s.stock_restante === "") return null;
  const n = Number(s.stock_restante);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function stockLimitado(s) {
  return stockRestanteDe(s) != null;
}

function servicioAgotado(s) {
  return Boolean(s && s.agotado);
}

function servicioSinStock(s) {
  if (s && s.es_combo && comboItemsDe(s).length) return comboSinStockMiembros(s);
  if (servicioAgotado(s)) return true;
  const r = stockRestanteDe(s);
  return r != null && r <= 0;
}

function aplicarStockRestanteLocal(restantes) {
  if (!restantes || typeof catalogo === "undefined") return;
  Object.entries(restantes).forEach(([id, n]) => {
    const s = (catalogo || []).find((x) => String(x.id) === String(id));
    if (!s) return;
    const num = Math.max(0, Math.floor(Number(n)));
    s.stock_restante = num;
    if (num <= 0) {
      s.agotado = true;
      s.ultima_unidad = false;
    }
  });
}

function servicioUltimaUnidad(s) {
  if (!s || servicioSinStock(s)) return false;
  return Boolean(s.ultima_unidad);
}

function etiquetaStock(s) {
  if (servicioSinStock(s)) return "";
  if (servicioUltimaUnidad(s)) return "¡Última unidad!";
  const r = stockRestanteDe(s);
  if (r == null || r <= 0) return "";
  if (r <= 5) return `Quedan ${r}`;
  return "";
}

function serviciosEn(canal) {
  return catalogo.filter((s) => s.activo !== false && s.canales && s.canales[canal]);
}

function serviciosCotizacion() {
  return catalogo.filter(
    (s) => s.activo !== false && s.canales && (s.canales.ofertas || s.canales.mantencion || s.canales.diagnostico)
  );
}

function etiquetaCanales(s) {
  const c = (s && s.canales) || {};
  const partes = [];
  if (c.ofertas) partes.push("Promociones");
  if (c.mantencion) partes.push("Mantención");
  if (c.diagnostico) partes.push("Diagnóstico");
  return partes.join(" · ") || "Sin menú";
}

function hidratarCatalogoClienteLocal() {
  if (catalogoEstaListo()) return catalogo;
  hidratarModelosExtra();
  hidratarFotosModelos();
  hidratarTablero();
  const raw = hidratarCatalogo();
  if (!Array.isArray(raw) || !raw.length) return catalogo;
  catalogo = raw.map((s) => normalizarServicioLista(s));
  if (typeof nubeActiva !== "function" || !nubeActiva()) catalogoListo = true;
  return catalogo;
}

function portadaRequiereCatalogo() {
  return (typeof portadaSlides !== "undefined" ? portadaSlides : []).some((s) => slideMuestraBoton(s));
}

async function asegurarCatalogoParaPortada() {
  if (!portadaRequiereCatalogo()) return catalogo;
  hidratarCatalogoClienteLocal();
  if (catalogoEstaListo()) return catalogo;
  return ensureCatalogoCargado();
}

async function ensureCatalogoCargado(opts) {
  if (catalogoEstaListo() && !(opts && opts.completo)) return catalogo;
  if (opts && opts.completo) catalogoListo = false;
  if (catalogoPromesa) return catalogoPromesa;
  catalogoPromesa = cargarCatalogo(opts)
    .then((lista) => {
      catalogoListo = true;
      return lista;
    })
    .finally(() => {
      catalogoPromesa = null;
    });
  return catalogoPromesa;
}

async function cargarCatalogo(opts) {
  const completo = Boolean(opts && opts.completo);
  const normalizar = completo ? normalizarServicio : normalizarServicioLista;
  hidratarModelosExtra();
  hidratarFotosModelos();
  hidratarTablero();
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeLeerCatalogo({ completo });
      if (remoto.length) {
        let lista = remoto.map(normalizar);
        if (typeof nubeFusionarStockCatalogo === "function") {
          lista = await nubeFusionarStockCatalogo(lista);
        }
        catalogo = lista.map(normalizar);
        recolectarModelosExtra(catalogo);
        persistirModelosExtra();
        persistirFotosModelos();
        persistirCatalogoLocal(catalogo);
        catalogoListo = true;
        if (completo) sembrarMembresiaColumnas();
        return catalogo;
      }
    } catch (e) {
      console.warn("No se pudo leer el catálogo en la nube.", e);
    }
  }
  catalogo = hidratarCatalogo().map((s) => (completo ? normalizarServicio(s) : normalizarServicioLista(s)));
  recolectarModelosExtra(catalogo);
  persistirModelosExtra();
  persistirFotosModelos();
  persistirCatalogoLocal(catalogo);
  catalogoListo = true;
  if (completo) sembrarMembresiaColumnas();
  return catalogo;
}

async function guardarCatalogo(lista) {
  catalogo = lista;
  recolectarModelosExtra(lista);
  persistirModelosExtra();
  localStorage.setItem(CATALOGO_KEY, JSON.stringify(lista));
  if (typeof nubeActiva === "function" && nubeActiva()) {
    await nubeGuardarCatalogo(lista);
  }
}

function servicioPorId(id) {
  return catalogo.find((s) => s.id === id);
}

function serviciosOferta() {
  return serviciosEn("ofertas");
}

function serviciosMantencion() {
  return serviciosEn("mantencion");
}

function serviciosDiagnostico() {
  return serviciosEn("diagnostico");
}

function serviciosAgendaLista() {
  return [...serviciosDiagnostico(), ...AGENDA_EXTRA];
}

function servicioAgenda(id) {
  return AGENDA_EXTRA.find((s) => s.id === id) || servicioPorId(id);
}

function oferta(id) {
  return servicioPorId(id);
}

function slugServicio(nombre) {
  return String(nombre || "servicio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "servicio";
}

function nuevoIdServicio(nombre) {
  const base = slugServicio(nombre);
  let id = base;
  let n = 2;
  while (catalogo.some((s) => s.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function reglasComboDe(itemId) {
  const reglas = [];
  catalogo.forEach((s) => {
    if (!usaOfertaCombo(s)) return;
    (s.complementos || []).forEach((c) => {
      if (c.id === itemId && Number(c.precioCombo) > 0) {
        reglas.push({
          si: s.id,
          precio: Number(c.precioCombo),
          etiqueta: c.etiqueta || `con ${s.nombre}`,
        });
      }
    });
    if (s.id === itemId) {
      (s.descuentos || []).forEach((d) => reglas.push(d));
    }
  });
  return reglas;
}

function combosEntrantesDe(itemId) {
  return reglasComboDe(itemId).filter((r) => r.si && r.precio > 0);
}

function mejorComboEntrante(item, pagadoActual) {
  const tope = pagadoActual == null ? Infinity : Number(pagadoActual);
  return combosEntrantesDe(item && item.id)
    .filter((r) => r.precio < tope)
    .sort((a, b) => a.precio - b.precio)[0] || null;
}

function nombreServicioDe(id) {
  const s = typeof servicioPorId === "function" ? servicioPorId(id) : (catalogo || []).find((x) => x.id === id);
  return (s && s.nombre) || id || "";
}

const TALLER_KEY = "autodato_taller";
const TALLER_DEFECTO = {
  whatsapp: "56961346945",
  direccion: "Cerro Hermoso 4042, Iquique",
  maps: "https://maps.app.goo.gl/3YEmuLBW2yQpt1N36?g_st=aw",
  horarios: "Lunes a viernes 9:00–18:00\nSábados 9:00–13:00",
};

function leerTaller() {
  try {
    return { ...TALLER_DEFECTO, ...JSON.parse(localStorage.getItem(TALLER_KEY) || "{}") };
  } catch (e) {
    return { ...TALLER_DEFECTO };
  }
}

const PORTADA_KEY = "autodato_portada";
const PORTADA_DEFECTO = [
  {
    id: "portada-fiestas",
    foto: "imagenes/portada.jpg",
    servicio_id: "",
    mostrar_boton: false,
    btn_texto: "Agregar al ticket",
    btn_x: 50,
    btn_y: 62,
    zoom: 1,
    pos_x: 50,
    pos_y: 50,
    orden: 0,
    defecto: true,
  },
];

let portadaSlides = [];
const LOGO_DEFECTO = "imagenes/logo.jpg";

let portadaUi = {
  dir_x: 50,
  dir_y: 76,
  wa_x: 50,
  wa_y: 84,
  dots_x: 50,
  dots_y: 68,
  logo: LOGO_DEFECTO,
  logo_zoom: 1,
  logo_scale_x: 1,
  logo_scale_y: 1,
  logo_off_x: 0,
  logo_off_y: 0,
  banner_h: 72,
  ico_s: 46,
};

function clampNum(n, min, max, def) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

function normalizarUi(s) {
  return {
    dir_x: clampNum(s && s.dir_x, 2, 98, 50),
    dir_y: clampNum(s && s.dir_y, 2, 98, 76),
    wa_x: clampNum(s && s.wa_x, 2, 98, 50),
    wa_y: clampNum(s && s.wa_y, 2, 98, 84),
    dots_x: clampNum(s && s.dots_x, 6, 94, 50),
    dots_y: clampNum(s && s.dots_y, 6, 94, 68),
    logo: String((s && s.logo) || LOGO_DEFECTO),
    logo_zoom: clampNum(s && s.logo_zoom, 0.3, 3, 1),
    logo_scale_x: clampNum(s && s.logo_scale_x, 0.3, 3, 1),
    logo_scale_y: clampNum(s && s.logo_scale_y, 0.3, 3, 1),
    logo_off_x: clampNum(s && s.logo_off_x, -120, 120, 0),
    logo_off_y: clampNum(s && s.logo_off_y, -120, 120, 0),
    banner_h: clampNum(s && s.banner_h, 40, 180, 72),
    ico_s: clampNum(s && s.ico_s, 28, 96, 46),
  };
}

function logoHref() {
  return (portadaUi && portadaUi.logo) || LOGO_DEFECTO;
}

function bannerAltoPortada(ui) {
  return clampNum(ui && ui.banner_h, 40, 180, 72);
}

function icoTamanoPortada(ui) {
  return clampNum(ui && ui.ico_s, 28, 96, 46);
}

function estiloIcoPortada(ui) {
  const n = icoTamanoPortada(ui);
  return `width:${n}px;height:${n}px`;
}

function aplicarIcosPortada() {
  const n = icoTamanoPortada(portadaUi);
  document.querySelectorAll(".home-ico").forEach((el) => {
    el.style.width = `${n}px`;
    el.style.height = `${n}px`;
  });
}

function aplicarBannerPortada() {
  const h = bannerAltoPortada(portadaUi);
  document.querySelectorAll(".home-logo").forEach((el) => {
    el.style.height = `${h}px`;
  });
}

function estiloLogoPortada(ui) {
  const u = ui || portadaUi;
  const z = clampNum(u && u.logo_zoom, 0.3, 3, 1);
  const sx = clampNum(u && u.logo_scale_x, 0.3, 3, 1) * z;
  const sy = clampNum(u && u.logo_scale_y, 0.3, 3, 1) * z;
  const ox = clampNum(u && u.logo_off_x, -120, 120, 0);
  const oy = clampNum(u && u.logo_off_y, -120, 120, 0);
  return `transform:translate(-50%,-50%) translate(${ox}%,${oy}%) scale(${sx},${sy});`;
}

function aplicarLogos() {
  const src = logoHref();
  const estilo = estiloLogoPortada(portadaUi);
  document.querySelectorAll("[data-logo]").forEach((img) => {
    img.src = src;
    if (img.closest(".home-logo")) img.style.cssText = estilo;
  });
  aplicarBannerPortada();
  aplicarIcosPortada();
}

function normalizarSlide(s, i) {
  const servicio = String((s && s.servicio_id) || "");
  const botonRaw = s && s.mostrar_boton;
  return {
    id: String((s && s.id) || `slide-${i}`),
    foto: String((s && s.foto) || ""),
    servicio_id: servicio,
    mostrar_boton: botonRaw == null ? Boolean(servicio) : botonRaw === true || botonRaw === "true",
    btn_texto: String((s && s.btn_texto) || "Agregar al ticket"),
    btn_x: clampNum(s && s.btn_x, 8, 92, 50),
    btn_y: clampNum(s && s.btn_y, 8, 92, 55),
    zoom: clampNum(s && s.zoom, 0.35, 4, 1),
    scale_x: clampNum(s && s.scale_x, 0.4, 3, 1),
    scale_y: clampNum(s && s.scale_y, 0.4, 3, 1),
    off_x: clampNum(s && s.off_x, -160, 160, 0),
    off_y: clampNum(s && s.off_y, -160, 160, 0),
    orden: Number(s && s.orden) || i,
    defecto: Boolean(s && (s.defecto === true || s.defecto === "true")),
    vehiculos: normalizarVehiculos(s && s.vehiculos),
    ...normalizarUi(s),
  };
}

function slideAplicaAVehiculo(slide, vehiculo) {
  const destinos = normalizarVehiculos(slide && slide.vehiculos);
  if (!destinos.length || !vehiculo || !vehiculo.marca || !vehiculo.modelo) return false;
  return destinos.some((v) => {
    if (v.marca !== vehiculo.marca) return false;
    if (v.modelo !== "*" && v.modelo !== vehiculo.modelo) return false;
    if (!anioEnRango(vehiculo.ano, v)) return false;
    return combustibleCoincide(v.combustible, vehiculo.combustible);
  });
}

function portadasDefectoDe(lista) {
  const base = lista || [];
  const marcadas = base.filter((s) => s.defecto);
  if (marcadas.length) return marcadas;
  const genericos = base.filter((s) => !normalizarVehiculos(s.vehiculos).length);
  return genericos.length ? genericos : base.slice(0, 1);
}

function portadasEnTableroSinSlide(slides) {
  const ids = new Set((slides || portadaSlides || []).map((s) => String(s.id)));
  const cols = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  for (const col of cols) {
    for (const pid of idsDeColumna(col, "portadas")) {
      if (!ids.has(String(pid))) return true;
    }
  }
  return false;
}

async function sincronizarTableroRemoto() {
  if (typeof nubeActiva !== "function" || !nubeActiva()) return false;
  if (typeof nubeLeerCatalogoCanales !== "function") return false;
  try {
    const extra = await nubeLeerCatalogoCanales({ omitFlotas: true });
    if (extra && Array.isArray(extra._tablero_columnas) && extra._tablero_columnas.length) {
      TABLERO_COLUMNAS = extra._tablero_columnas.map(normalizarColumnaTablero).filter(Boolean);
      persistirTablero();
      return true;
    }
  } catch (e) {
    console.warn("No se pudo sincronizar el tablero.", e);
  }
  return false;
}

function portadasFlyerDeColumna(col, base) {
  const lista = base || (portadaSlides || []).filter((s) => s.foto);
  if (!col || !lista.length) return [];
  sincronizarOrdenTarjetasCol(col);
  const idsCol = idsDeColumna(col, "portadas");
  if (!idsCol.length) return [];
  const byId = new Map(lista.map((s) => [String(s.id), s]));
  const out = [];
  const seen = new Set();
  const agregar = (sid) => {
    const id = String(sid || "");
    if (!id || seen.has(id) || !idsCol.includes(id)) return;
    if (itemOcultoEnColumna(col, "portada", id)) return;
    const slide = byId.get(id);
    if (!slide || !slide.foto) return;
    seen.add(id);
    out.push(slide);
  };
  (col.orden_tarjetas || []).forEach((tok) => {
    const p = parseTokenTarjetaColumna(tok);
    if (p && p.tipo === "portada") agregar(p.id);
  });
  idsCol.forEach(agregar);
  return out;
}

function slidesPortadaPara(vehiculo) {
  const todos = (portadaSlides || []).filter((s) => s.foto);
  const base = todos.length ? todos : PORTADA_DEFECTO.map(normalizarSlide);
  const reserva = portadasDefectoDe(base);
  if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) {
    return reserva.length ? reserva : base;
  }
  const col = columnaDeVehiculo(vehiculo);
  const propios = col ? portadasFlyerDeColumna(col, base) : [];
  if (propios.length) return propios;
  const extra = reserva.filter((s) => !propios.some((p) => p.id === s.id));
  return reserva.length ? reserva : extra;
}

function encajarVehiculoTaller(raw) {
  if (!raw) return null;
  const marcaTxt = String(raw.marca || "").trim();
  const modeloTxt = String(raw.modelo || "").trim();
  const ano = Number(raw.ano);
  const marca = MARCAS.find((m) => m.toLowerCase() === marcaTxt.toLowerCase());
  if (!marca || !modeloTxt || !Number.isFinite(ano)) return null;
  if (ano < ANIO_MIN || ano > ANIO_MAX) return null;
  const modelos = modelosDe(marca);
  const modelo =
    modelos.find((m) => m.toLowerCase() === modeloTxt.toLowerCase()) ||
    modelos.find((m) => modeloTxt.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(modeloTxt.toLowerCase()));
  if (!modelo) return null;
  return { marca, modelo, ano, combustible: normalizarCombustible(raw.combustible) };
}

const QUERY_VEHICULO_KEYS = [
  "marca",
  "modelo",
  "ano",
  "anio",
  "año",
  "year",
  "combustible",
  "comb",
  "fuel",
  "brand",
  "model",
];

const QUERY_SERVICIO_KEYS = ["servicio", "promo", "promocion", "oferta"];

const QUERY_ENTRADA_KEYS = [...QUERY_VEHICULO_KEYS, ...QUERY_SERVICIO_KEYS];

function rawVehiculoDesdeQuery(search) {
  const q = new URLSearchParams(search || (typeof location !== "undefined" ? location.search : ""));
  const keys = [...q.keys()].map((k) => k.toLowerCase());
  if (!keys.some((k) => QUERY_VEHICULO_KEYS.includes(k))) return null;
  return {
    marca: q.get("marca") || q.get("brand") || "",
    modelo: q.get("modelo") || q.get("model") || "",
    ano: q.get("ano") || q.get("anio") || q.get("año") || q.get("year") || "",
    combustible: q.get("combustible") || q.get("comb") || q.get("fuel") || "",
  };
}

function vehiculoDesdeQuery(search) {
  const raw = rawVehiculoDesdeQuery(search);
  if (!raw) return null;
  return encajarVehiculoTaller(raw);
}

function idServicioDesdeQuery(search) {
  const q = new URLSearchParams(search || (typeof location !== "undefined" ? location.search : ""));
  for (const k of QUERY_SERVICIO_KEYS) {
    const v = q.get(k);
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function vistaListaDeServicio(s) {
  const c = (s && s.canales) || {};
  if (c.ofertas) return "ofertas";
  if (c.mantencion) return "mantencion";
  if (c.diagnostico) return "diagnostico";
  return "ofertas";
}

/** Enlace a autodato.cl con el vehículo precargado (botón en ficha AutoNexus). */
function enlaceAutoDatoConVehiculo(v, base) {
  const origin =
    typeof location !== "undefined" && location.origin && !/^file:/i.test(location.origin)
      ? location.origin
      : "https://autodato.cl";
  const u = new URL(base || `${origin}/`);
  if (!v) return u.toString();
  if (v.marca) u.searchParams.set("marca", String(v.marca));
  if (v.modelo) u.searchParams.set("modelo", String(v.modelo));
  if (v.ano != null && v.ano !== "") u.searchParams.set("ano", String(v.ano));
  u.searchParams.set("combustible", normalizarCombustible(v.combustible));
  return u.toString();
}

function enlaceAutoDatoConServicio(servicioId, v, base) {
  const sid = String(servicioId || "").trim();
  if (!sid) return enlaceAutoDatoConVehiculo(v, base);
  const origin =
    typeof location !== "undefined" && location.origin && !/^file:/i.test(location.origin)
      ? location.origin
      : "https://autodato.cl";
  const u = new URL(base || `${origin}/`);
  if (v && v.marca && v.modelo) {
    u.searchParams.set("marca", String(v.marca));
    u.searchParams.set("modelo", String(v.modelo));
    if (v.ano != null && v.ano !== "") u.searchParams.set("ano", String(v.ano));
    u.searchParams.set("combustible", normalizarCombustible(v.combustible));
  }
  u.searchParams.set("servicio", sid);
  return u.toString();
}

function enlaceAutoDatoPlantillaServicio(servicioId) {
  const sid = encodeURIComponent(String(servicioId || "").trim());
  return `https://autodato.cl/?marca=MARCA&modelo=MODELO&ano=ANO&combustible=ambos&servicio=${sid}`;
}

function limpiarQueryEntradaEnHistorial() {
  if (typeof history === "undefined" || !history.replaceState) return;
  const u = new URL(location.href);
  [...u.searchParams.keys()].forEach((k) => {
    if (QUERY_ENTRADA_KEYS.includes(k.toLowerCase())) u.searchParams.delete(k);
  });
  const qs = u.searchParams.toString();
  const next = u.pathname + (qs ? `?${qs}` : "") + u.hash;
  history.replaceState(history.state, "", next);
}

function limpiarQueryVehiculoEnHistorial() {
  limpiarQueryEntradaEnHistorial();
}

function slideVacio(orden) {
  return normalizarSlide(
    {
      id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      foto: "",
      mostrar_boton: false,
      orden: orden || 0,
    },
    orden || 0
  );
}

function slideMuestraBoton(s) {
  return Boolean(s && s.mostrar_boton && s.servicio_id);
}

function estiloFotoPortada(s) {
  const z = clampNum(s && s.zoom, 0.35, 4, 1);
  const sx = clampNum(s && s.scale_x, 0.4, 3, 1) * z;
  const sy = clampNum(s && s.scale_y, 0.4, 3, 1) * z;
  const ox = clampNum(s && s.off_x, -160, 160, 0);
  const oy = clampNum(s && s.off_y, -160, 160, 0);
  return `position:absolute;left:50%;top:50%;width:auto;height:100%;max-width:none;object-fit:contain;object-position:center;transform:translate(-50%,-50%) translate(${ox}%,${oy}%) scale(${sx},${sy});`;
}

function htmlCapaPortada(ui, dotsN, dotsOn, arrastrable) {
  const drag = (name) => (arrastrable ? ` data-drag="${name}"` : "");
  const dots =
    dotsN > 1
      ? `<div class="home-dots${arrastrable ? "" : " home-dots-hint"}" style="left:${ui.dots_x}%;top:${ui.dots_y}%"${drag("dots")}>${Array.from(
          { length: dotsN },
          (_, i) => `<i class="${i === dotsOn ? "on" : ""}"></i>`
        ).join("")}</div>`
      : "";
  const ico = (cls, tipo, href, titulo, src, alt) => {
    const pos = `left:${ui[tipo === "dir" ? "dir_x" : "wa_x"]}%;top:${ui[tipo === "dir" ? "dir_y" : "wa_y"]}%;${estiloIcoPortada(ui)}`;
    if (arrastrable) {
      return `<a class="home-ico ${cls}" href="${href}" target="_blank" rel="noopener" title="${titulo}" style="${pos}"${drag(tipo)}><img src="${src}" alt="${alt}" /></a>`;
    }
    return `<button type="button" class="home-ico ${cls}" style="${pos}" data-hold="${tipo}" data-href="${href}" title="${titulo}"><img src="${src}" alt="${alt}" /></button>`;
  };
  return `
    ${ico("home-dir", "dir", mapsHref(), "Google Maps", "imagenes/icono-maps.png?v=alfa1", "Google Maps")}
    ${ico("home-wa", "wa", waHref(), "WhatsApp", "imagenes/icono-whatsapp.png?v=alfa1", "WhatsApp")}
    ${dots}`;
}

function hidratarPortadaLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(PORTADA_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      portadaSlides = raw.map(normalizarSlide).sort((a, b) => a.orden - b.orden);
      if (portadaSlides[0]) portadaUi = normalizarUi(portadaSlides[0]);
      return portadaSlides;
    }
  } catch (e) {
    /* ignore */
  }
  portadaSlides = PORTADA_DEFECTO.map(normalizarSlide);
  if (portadaSlides[0]) portadaUi = normalizarUi(portadaSlides[0]);
  return portadaSlides;
}

function aplicarPortadaLista(lista, opts = {}) {
  portadaSlides = (lista || []).map(normalizarSlide).sort((a, b) => a.orden - b.orden);
  if (portadaSlides[0]) portadaUi = normalizarUi(portadaSlides[0]);
  try {
    localStorage.setItem(PORTADA_KEY, JSON.stringify(portadaSlides));
  } catch (e) {
    /* ignore */
  }
  if (opts.sembrar !== false && catalogoEstaListo()) sembrarMembresiaColumnas();
  return portadaSlides;
}

async function refrescarPortadaRemota() {
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  if (typeof nubeActiva !== "function" || !nubeActiva()) return null;
  try {
    const remoto = await nubeLeerPortada();
    if (remoto.length) return aplicarPortadaLista(remoto, { sembrar: catalogoEstaListo() });
  } catch (e) {
    console.warn("No se pudo refrescar la portada.", e);
  }
  return null;
}

async function refrescarCatalogoRemoto() {
  if (typeof nubeActiva === "function" && nubeActiva()) {
    if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
    catalogoListo = false;
    catalogoPromesa = null;
    try {
      return await ensureCatalogoCargado();
    } catch (e) {
      console.warn("No se pudo refrescar el catálogo.", e);
      if (catalogo.length) catalogoListo = true;
      return null;
    }
  }
  if (catalogo.length && !catalogoListo) catalogoListo = true;
  return catalogo.length ? catalogo : null;
}

async function refrescarDatosInicioEnFondo() {
  const tareas = [];
  if (typeof sincronizarTableroRemoto === "function") tareas.push(sincronizarTableroRemoto());
  tareas.push(refrescarPortadaRemota());
  tareas.push(refrescarCatalogoRemoto());
  await Promise.all(tareas);
}

async function cargarPortada() {
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  const aplicarSlides = (lista) => aplicarPortadaLista(lista, { sembrar: true });
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeLeerPortada();
      if (remoto.length) return aplicarSlides(remoto);
    } catch (e) {
      console.warn("No se pudo leer la portada en la nube.", e);
    }
  }
  try {
    const raw = JSON.parse(localStorage.getItem(PORTADA_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      const local = raw.map(normalizarSlide);
      if (
        (portadasEnTableroSinSlide(local) || portadasEnTableroSinSlide()) &&
        typeof nubeActiva === "function" &&
        nubeActiva()
      ) {
        try {
          const remoto = await nubeLeerPortada();
          if (remoto.length) return aplicarSlides(remoto);
        } catch (e) {
          /* fallback local */
        }
      }
      return aplicarPortadaLista(local, { sembrar: catalogoEstaListo() });
    }
  } catch (e) {
    /* ignore */
  }
  return hidratarPortadaLocal();
}

async function guardarPortada(lista) {
  const ui = normalizarUi(portadaUi);
  portadaUi = ui;
  portadaSlides = lista.map((s, i) => normalizarSlide({ ...s, ...ui, orden: i }, i));
  localStorage.setItem(PORTADA_KEY, JSON.stringify(portadaSlides));
  sembrarPortadasEnColumnas();
  persistirTablero();
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  if (typeof nubeActiva === "function" && nubeActiva()) {
    await nubeGuardarPortada(portadaSlides);
    return "nube";
  }
  throw new Error("Este panel no está conectado a autodato.cl. Abre https://autodato.cl/admin.html y guarda ahí.");
}

function guardarTaller(data) {
  const prev = leerTaller();
  const actual = {
    whatsapp: String(data.whatsapp || "").replace(/\D/g, "") || TALLER_DEFECTO.whatsapp,
    direccion: String(data.direccion || "").trim() || TALLER_DEFECTO.direccion,
    maps: String(data.maps || prev.maps || "").trim() || TALLER_DEFECTO.maps,
    horarios: String(data.horarios != null ? data.horarios : prev.horarios || "").trim() || TALLER_DEFECTO.horarios,
  };
  localStorage.setItem(TALLER_KEY, JSON.stringify(actual));
  return actual;
}

function mapsHref() {
  return leerTaller().maps || TALLER_DEFECTO.maps;
}

function waHref() {
  return `https://wa.me/${leerTaller().whatsapp.replace(/\D/g, "")}`;
}

function waMostrar() {
  const d = leerTaller().whatsapp.replace(/\D/g, "");
  if (d.startsWith("56") && d.length >= 11) return `+56 ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

const TIEMPOS_TRABAJO = [
  { min: 15, label: "15 min" },
  { min: 30, label: "30 min" },
  { min: 45, label: "45 min" },
  { min: 60, label: "1 hora" },
  { min: 90, label: "1 h 30" },
  { min: 120, label: "2 horas" },
  { min: 150, label: "2 h 30" },
  { min: 180, label: "3 horas" },
  { min: 240, label: "4 horas" },
  { min: 300, label: "5 horas" },
  { min: 360, label: "6 horas" },
  { min: 480, label: "8 horas" },
];

function etiquetaTiempo(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return "Sin definir";
  const hit = TIEMPOS_TRABAJO.find((t) => t.min === n);
  if (hit) return hit.label;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m}` : `${h} ${h === 1 ? "hora" : "horas"}`;
}

function htmlOpcionesTiempo(sel) {
  const n = Number(sel);
  return `<option value="">Sin definir</option>${TIEMPOS_TRABAJO.map(
    (t) => `<option value="${t.min}" ${n === t.min ? "selected" : ""}>${t.label}</option>`
  ).join("")}`;
}

function normalizarInsumo(x, i) {
  const costo = Number(x && x.costo);
  const pct = Number(x && x.porcentaje);
  return {
    id: String((x && x.id) || `ins-${i || 0}-${Math.random().toString(36).slice(2, 6)}`),
    nombre: String((x && x.nombre) || "").trim(),
    costo: Number.isFinite(costo) && costo > 0 ? costo : 0,
    porcentaje: Number.isFinite(pct) ? pct : 30,
  };
}

function normalizarInsumos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map((x, i) => normalizarInsumo(x, i));
}

function ventaInsumo(ins) {
  const costo = Number(ins && ins.costo) || 0;
  const pct = Number(ins && ins.porcentaje) || 0;
  return Math.round(costo * (1 + pct / 100));
}

function costoInsumosDe(s) {
  return (s && s.insumos ? s.insumos : []).reduce((acc, ins) => acc + (Number(ins.costo) || 0), 0);
}

const IVA_TASA = 0.19;

function netoServicioDe(s) {
  const labor = Number(s && s.mano_obra) || 0;
  const insumos = (s && s.insumos ? s.insumos : []).reduce((acc, ins) => acc + ventaInsumo(ins), 0);
  if (labor > 0 || insumos > 0) return labor + insumos;
  return 0;
}

function ivaDeNeto(neto) {
  return Math.round((Number(neto) || 0) * IVA_TASA);
}

function totalServicioDe(s) {
  const neto = netoServicioDe(s);
  if (neto > 0) return neto + ivaDeNeto(neto);
  return Number(s && s.precio) || 0;
}

function valorNormalDe(s) {
  const total = totalServicioDe(s);
  if (total > 0) return total;
  return Number(s && s.precio) || 0;
}

function utilidadDe(precio, s) {
  const neto = netoServicioDe(s);
  const base = neto > 0 ? neto : Number(precio) || 0;
  return base - costoInsumosDe(s);
}

function tieneOferta(item) {
  if (!item) return false;
  if (item.tiene_oferta === false || item.tiene_oferta === "no" || item.tiene_oferta === "false") return false;
  const v = Number(item.precio_oferta);
  const precioReal = Number.isFinite(v) && v > 0;
  if (item.tiene_oferta === true || item.tiene_oferta === "si" || item.tiene_oferta === "true") return precioReal;
  return precioReal && item.precio != null && v < Number(item.precio);
}

function precioOfertaDe(item) {
  if (!tieneOferta(item)) return null;
  const v = Number(item && item.precio_oferta);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (item && item.precio != null && v >= Number(item.precio)) return null;
  return v;
}

function usaOfertaCombo(item) {
  if (!item) return true;
  if (item.oferta_combo === false || item.oferta_combo === "no" || item.oferta_combo === "false") return false;
  if (item.oferta_combo === true || item.oferta_combo === "si" || item.oferta_combo === "true") return true;
  return true;
}

function precioPagado(item, idsCarrito) {
  if (!item || item.precio == null) return { lista: null, pagado: null, ahorro: 0, regla: null };
  let pagado = item.precio;
  let regla = null;
  const oferta = precioOfertaDe(item);
  if (oferta != null) {
    pagado = oferta;
    regla = { etiqueta: "oferta", precio: oferta };
  }
  reglasComboDe(item.id).forEach((d) => {
    if ((idsCarrito || []).includes(d.si) && d.precio > 0 && d.precio < pagado) {
      pagado = d.precio;
      regla = d;
    }
  });
  return { lista: item.precio, pagado, ahorro: item.precio - pagado, regla };
}

