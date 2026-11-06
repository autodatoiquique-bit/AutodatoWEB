/**
 * Catálogo + precios para webhook del asistente WhatsApp (Node).
 * POST /api/asistente/consultar-precios
 * POST /api/vambe/catalog/quote
 * POST /api/vambe/catalog/quote-flat
 * POST /api/vambe/ticket/from-quote
 * POST /api/vambe/ticket/from-quote-flat
 */
"use strict";

const crypto = require("crypto");

const ANIO_MIN = 2010;
const ANIO_MAX = new Date().getFullYear();
const CACHE_MS = Number(process.env.ASISTENTE_CATALOGO_CACHE_MS) || 5 * 60 * 1000;

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

let catalogo = [];
let tableroColumnas = [];
let cacheTs = 0;
let cacheCargando = null;
/** Para huella de versión de catálogo */
let ultimasFilasServicios = [];
let ultimosComplementos = [];
let ultimoExtraCanales = null;
let catalogVersionHash = "";

const PRICING_ENGINE = "1.0.0";
const QUOTE_DEFAULT_TTL_MS = Number(process.env.VAMBE_QUOTE_TTL_MS) || 48 * 60 * 60 * 1000;

/** Promociones temporales vigentes (cargadas desde tabla `promociones`; vacío = sin cambio) */
let promocionesVigentes = [];

function clp(n) {
  const v = Math.round(Number(n) || 0);
  return `$${v.toLocaleString("es-CL")}`;
}

function clampNum(n, min, max, def) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

function normalizarCombustible(v) {
  const t = String(v || "").toLowerCase();
  if (t === "diesel" || t === "diésel" || t === "diesell") return "diesel";
  if (t === "bencina" || t === "bencinero" || t === "gasolina") return "bencina";
  if (t === "hibrido" || t === "híbrido" || t === "hybrid") return "hibrido";
  return "ambos";
}

function combustibleCoincide(a, b) {
  const x = normalizarCombustible(a);
  const y = normalizarCombustible(b || "ambos");
  return x === "ambos" || y === "ambos" || x === y;
}

function anioONull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1950 || n > 2100) return null;
  return n;
}

function normalizarVehiculos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((v) => {
      if (!v || !v.marca) return null;
      return {
        marca: String(v.marca),
        modelo: String(v.modelo || "*"),
        ano_desde: anioONull(v.ano_desde),
        ano_hasta: anioONull(v.ano_hasta),
        combustible: normalizarCombustible(v.combustible),
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

function idsDeColumna(col, campo) {
  if (!col || !Array.isArray(col[campo])) return [];
  return col[campo].map(String).filter(Boolean);
}

function tokenTarjetaColumna(tipo, id) {
  return `${tipo === "portada" ? "p" : "s"}:${String(id || "")}`;
}

function itemOcultoEnColumna(col, tipo, id) {
  const ocultos = Array.isArray(col && col.ocultos) ? col.ocultos : [];
  return ocultos.includes(tokenTarjetaColumna(tipo, id));
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
  const candidatos = tableroColumnas.filter((c) => vehiculoEnColumna(v, c));
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

function servicioAplicaAVehiculo(s, vehiculo) {
  if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) {
    return { aplica: false, motivo: "Falta marca o modelo del vehículo" };
  }
  if (vehiculo.ano == null || vehiculo.ano === "" || !Number.isFinite(Number(vehiculo.ano))) {
    return { aplica: false, motivo: "Falta año del vehículo" };
  }
  if (!s || s.activo === false) return { aplica: false, motivo: "Servicio inactivo" };
  const col = columnaDeVehiculo(vehiculo);
  const id = String(s.id || "");
  if (col) {
    if (itemOcultoEnColumna(col, "servicio", id)) {
      return { aplica: false, motivo: "No disponible para este vehículo en el taller" };
    }
    if (!idsDeColumna(col, "servicios").includes(id)) {
      return { aplica: false, motivo: "Este servicio no está habilitado para ese modelo en el catálogo" };
    }
    return { aplica: true, motivo: "" };
  }
  const destinos = normalizarVehiculos(s.vehiculos);
  if (!destinos.length) return { aplica: true, motivo: "" };
  const ok = destinos.some((v) => {
    if (v.marca !== vehiculo.marca) return false;
    if (v.modelo !== "*" && v.modelo !== vehiculo.modelo) return false;
    if (!anioEnRango(vehiculo.ano, v)) return false;
    return combustibleCoincide(v.combustible, vehiculo.combustible);
  });
  return ok
    ? { aplica: true, motivo: "" }
    : { aplica: false, motivo: "No aplica a la marca, modelo, año o combustible indicados" };
}

function numeroSerieDe(s) {
  const n = Number(s && s.numero_serie);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function formatoNumeroSerie(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "0000";
  return String(Math.floor(v)).padStart(4, "0");
}

function servicioPorId(id) {
  return catalogo.find((s) => s.id === id);
}

function servicioPorNumeroSerie(cod) {
  const n = parseInt(String(cod || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return catalogo.find((s) => numeroSerieDe(s) === n) || null;
}

function comboItemsDe(s) {
  if (!s || !Array.isArray(s.combo_items)) return [];
  return s.combo_items.map((x) => String(x || "").trim()).filter(Boolean);
}

function esServicioCombo(s) {
  return Boolean(s && s.es_combo && comboItemsDe(s).length >= 2);
}

function ventaInsumo(ins) {
  const costo = Number(ins && ins.costo) || 0;
  const pct = Number(ins && ins.porcentaje) || 0;
  return Math.round(costo * (1 + pct / 100));
}

function netoServicioDe(s) {
  const labor = Number(s && s.mano_obra) || 0;
  const insumos = (s && s.insumos ? s.insumos : []).reduce((acc, ins) => acc + ventaInsumo(ins), 0);
  if (labor > 0 || insumos > 0) return labor + insumos;
  return 0;
}

function ivaDeNeto(neto) {
  return Math.round(Number(neto) * 0.19);
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

function tieneOferta(item) {
  if (!item) return false;
  if (item.tiene_oferta === false) return false;
  const v = Number(item.precio_oferta);
  const precioReal = Number.isFinite(v) && v > 0;
  if (item.tiene_oferta === true) return precioReal;
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
  if (item.oferta_combo === false) return false;
  return true;
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
  });
  return reglas;
}

function combosEntrantesDe(itemId) {
  return reglasComboDe(itemId).filter((r) => r.si && r.precio > 0);
}

function tierReglaPrecio(regla) {
  if (!regla) return 4;
  if (regla.tipo === "promocion_temporal") return 1;
  if (regla.tipo === "asociacion") return 2;
  if (regla.tipo === "oferta_fija") return 3;
  return 4;
}

function mejorPrecioEntre(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = tierReglaPrecio(a.regla);
  const tb = tierReglaPrecio(b.regla);
  if (ta !== tb) return ta < tb ? a : b;
  const pa = Number(a.pagado);
  const pb = Number(b.pagado);
  if (pa !== pb) return pa < pb ? a : b;
  return a;
}

function promocionTemporalVigente(p, nowMs) {
  if (!p || !p.activo) return false;
  if (p.fecha_inicio && new Date(p.fecha_inicio).getTime() > nowMs) return false;
  if (p.fecha_fin && new Date(p.fecha_fin).getTime() < nowMs) return false;
  if (p.cupos != null && p.cupos_usados != null && p.cupos_usados >= p.cupos) return false;
  return true;
}

function promocionAplicaVehiculoPromo(p, vehiculo) {
  if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) return false;
  if (p.marca && String(p.marca).toLowerCase() !== String(vehiculo.marca).toLowerCase()) return false;
  if (p.modelo && p.modelo !== "*" && String(p.modelo).toLowerCase() !== String(vehiculo.modelo).toLowerCase())
    return false;
  if (!anioEnRango(vehiculo.ano, { ano_desde: p.ano_desde, ano_hasta: p.ano_hasta })) return false;
  if (p.combustible && p.combustible !== "ambos" && !combustibleCoincide(p.combustible, vehiculo.combustible))
    return false;
  return true;
}

function precioDesdePromocionTemporal(p, lista, pagadoActual) {
  const t = String(p.tipo_regla || "precio_fijo").toLowerCase();
  if (t === "porcentaje" && p.porcentaje_descuento != null) {
    const pct = Number(p.porcentaje_descuento);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return Math.round(lista * (1 - pct / 100));
  }
  if (p.precio_fijo != null && Number(p.precio_fijo) > 0) return Math.round(Number(p.precio_fijo));
  return Math.min(pagadoActual, lista);
}

function aplicarMejorPromocionTemporal(item, vehiculo, base, idsCarrito) {
  const now = Date.now();
  let best = base;
  (promocionesVigentes || []).forEach((p) => {
    if (!p || p.servicio_id !== item.id) return;
    if (!promocionTemporalVigente(p, now)) return;
    if (!promocionAplicaVehiculoPromo(p, vehiculo)) return;
    if (p.condicion_combo_servicio_id && !(idsCarrito || []).includes(String(p.condicion_combo_servicio_id)))
      return;
    const pag = precioDesdePromocionTemporal(p, base.lista, base.pagado);
    if (pag == null || pag >= base.lista) return;
    const candidate = {
      lista: base.lista,
      pagado: pag,
      ahorro: Math.max(0, base.lista - pag),
      regla: {
        tipo: "promocion_temporal",
        etiqueta: p.nombre || "Promoción temporal",
        precio: pag,
        promocion_id: p.id,
        promocion_nombre: p.nombre || null,
        prioridad: p.prioridad,
      },
    };
    best = mejorPrecioEntre(best, candidate);
  });
  return best;
}

function precioPagado(item, idsCarrito, vehiculo, opts) {
  if (!item || item.precio == null) {
    return {
      lista: null,
      pagado: null,
      ahorro: 0,
      regla: null,
      precio_antes_capa_temporal: null,
      precio_referencia_anterior: null,
    };
  }
  const o = opts && typeof opts === "object" ? opts : {};
  let pagado = item.precio;
  let regla = null;
  const oferta = precioOfertaDe(item);
  if (oferta != null) {
    pagado = oferta;
    regla = { tipo: "oferta_fija", etiqueta: "Descuento de ocasión", precio: oferta };
  }
  reglasComboDe(item.id).forEach((d) => {
    if ((idsCarrito || []).includes(d.si) && d.precio > 0 && d.precio < pagado) {
      pagado = d.precio;
      regla = {
        tipo: "asociacion",
        etiqueta: `Incluye descuento al realizar servicio de ${nombreServicioDe(d.si)}`,
        precio: d.precio,
        servicio_requerido_id: d.si,
      };
    }
  });
  const lista = valorNormalDe(item);
  /** Precio tras oferta fija y reglas de combinación; entrada de la capa de promoción temporal. */
  const precioAntesCapaTemporal = pagado;
  const base = { lista, pagado, ahorro: Math.max(0, lista - pagado), regla };

  if (o.sinPromocionTemporal || !promocionesVigentes.length) {
    const prev = regla && (regla.tipo === "asociacion" || regla.tipo === "oferta_fija") ? lista : lista;
    return {
      ...base,
      precio_antes_capa_temporal: precioAntesCapaTemporal,
      precio_referencia_anterior: prev,
    };
  }

  const final = aplicarMejorPromocionTemporal(item, vehiculo, base, idsCarrito);
  let precioRefAnterior = lista;
  if (final.regla && final.regla.tipo === "promocion_temporal") {
    precioRefAnterior = precioAntesCapaTemporal;
  }
  return {
    ...final,
    precio_antes_capa_temporal: precioAntesCapaTemporal,
    precio_referencia_anterior: precioRefAnterior,
  };
}

function nombreServicioDe(id) {
  const s = servicioPorId(id);
  return (s && s.nombre) || String(id || "");
}

function preciosPackCombo(s, vehiculoOpt) {
  const ids = comboItemsDe(s);
  let lista = 0;
  let pagado = 0;
  const lineas = [];
  ids.forEach((id) => {
    const item = servicioPorId(id);
    if (!item || item.precio == null) return;
    const otros = ids.filter((x) => x !== id);
    const p = precioPagado(item, otros, vehiculoOpt || null, {});
    if (p.lista == null || p.pagado == null) return;
    lista += p.lista;
    pagado += p.pagado;
    lineas.push({ id, nombre: item.nombre || id, ...p });
  });
  return { lista, pagado, ahorro: Math.max(0, lista - pagado), lineas };
}

function idsMiembrosCombo(s) {
  return comboItemsDe(s);
}

function idsServiciosEnCarrito(carrito, excluirServicioId) {
  const ids = [];
  const push = (id) => {
    const sid = String(id || "");
    if (!sid || sid === String(excluirServicioId || "")) return;
    if (!ids.includes(sid)) ids.push(sid);
  };
  (carrito || []).forEach((linea) => {
    if (linea.tipo !== "oferta") return;
    if (linea.esComboLinea) {
      const combo = servicioPorId(linea.id);
      if (combo && esServicioCombo(combo)) idsMiembrosCombo(combo).forEach(push);
      return;
    }
    push(linea.id);
  });
  return ids;
}

function calcularCarrito(carrito, vehiculoOpt) {
  const items = [];
  let subtotal = 0;
  let total = 0;
  let ahorro = 0;
  carrito.forEach((linea) => {
    if (linea.tipo !== "oferta") return;
    if (linea.esComboLinea) {
      const combo = servicioPorId(linea.id);
      if (!combo || !esServicioCombo(combo)) return;
      const pack = preciosPackCombo(combo, vehiculoOpt);
      items.push({
        id: combo.id,
        codigo: formatoNumeroSerie(numeroSerieDe(combo)),
        nombre: combo.nombre,
        es_combo: true,
        lista: pack.lista,
        pagado: pack.pagado,
        ahorro: pack.ahorro,
        regla: null,
      });
      subtotal += pack.lista;
      total += pack.pagado;
      ahorro += pack.ahorro;
      return;
    }
    const s = servicioPorId(linea.id);
    if (!s || esServicioCombo(s)) return;
    const otros = idsServiciosEnCarrito(carrito, linea.id);
    const p = precioPagado(s, otros, vehiculoOpt || null, {});
    items.push({
      id: s.id,
      codigo: formatoNumeroSerie(numeroSerieDe(s)),
      nombre: s.nombre,
      es_combo: false,
      lista: p.lista,
      pagado: p.pagado,
      ahorro: p.ahorro,
      regla: p.regla,
    });
    subtotal += p.lista || 0;
    total += p.pagado || 0;
    ahorro += p.ahorro || 0;
  });
  return { items, subtotal_lista: subtotal, total_pagado: total, ahorro_total: ahorro };
}

function etiquetaTiempo(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return null;
  const hit = TIEMPOS_TRABAJO.find((t) => t.min === n);
  if (hit) return hit.label;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m}` : `${h} ${h === 1 ? "hora" : "horas"}`;
}

function etiquetaCanales(s) {
  const c = s.canales || {};
  const p = [];
  if (c.ofertas) p.push("Promociones");
  if (c.mantencion) p.push("Mantención");
  if (c.diagnostico) p.push("Diagnóstico");
  return p.join(" · ") || "Catálogo";
}

function fusionarExtraEnServicio(s, ex) {
  if (!ex) return s;
  s.canales = normalizarCanales(
    { ofertas: ex.ofertas, mantencion: ex.mantencion, diagnostico: ex.diagnostico },
    s.tipo
  );
  if (ex.tiene_oferta != null) s.tiene_oferta = Boolean(ex.tiene_oferta) && Number(ex.precio_oferta) > 0;
  if (ex.oferta_combo != null) s.oferta_combo = Boolean(ex.oferta_combo);
  if (Number(ex.precio_oferta) > 0) s.precio_oferta = Number(ex.precio_oferta);
  else if (ex.precio_oferta != null) s.precio_oferta = null;
  if (ex.vehiculos) s.vehiculos = ex.vehiculos;
  if (ex.agotado != null) s.agotado = Boolean(ex.agotado);
  if (ex.ultima_unidad != null) s.ultima_unidad = Boolean(ex.ultima_unidad);
  if (ex.es_combo != null) s.es_combo = Boolean(ex.es_combo);
  if (Array.isArray(ex.combo_items)) s.combo_items = ex.combo_items;
  if (Number(ex.numero_serie) > 0) s.numero_serie = Math.floor(Number(ex.numero_serie));
  if (ex.tiempo_min != null) s.tiempo_min = Number(ex.tiempo_min) || null;
  if (ex.mano_obra != null) s.mano_obra = Number(ex.mano_obra) || 0;
  if (Array.isArray(ex.insumos)) s.insumos = ex.insumos;
  s.tiene_oferta = tieneOferta(s);
  return s;
}

function filaAServicio(row, comps) {
  return {
    id: row.id,
    tipo: row.tipo,
    nombre: row.nombre,
    resumen: row.resumen || "",
    detalle: row.detalle || "",
    foto: row.foto || "",
    precio: row.precio,
    precio_oferta: null,
    activo: row.activo !== false,
    canales: null,
    complementos: (comps || [])
      .filter((c) => c.servicio_id === row.id)
      .map((c) => ({
        id: c.asociado_id,
        precioCombo: c.precio_combo,
        etiqueta: c.etiqueta || "",
      })),
    es_combo: false,
    combo_items: [],
    vehiculos: [],
    agotado: false,
    ultima_unidad: false,
    tiempo_min: null,
    mano_obra: 0,
    insumos: [],
    numero_serie: null,
  };
}

function normalizarColumnaTablero(c) {
  if (!c || !c.marca) return null;
  return {
    id: String(c.id || ""),
    marca: c.marca,
    modelo: c.modelo,
    ano_desde: anioONull(c.ano_desde),
    ano_hasta: anioONull(c.ano_hasta),
    combustible: normalizarCombustible(c.combustible),
    servicios: Array.isArray(c.servicios) ? c.servicios.map(String) : [],
    ocultos: Array.isArray(c.ocultos) ? c.ocultos : [],
    portadas: Array.isArray(c.portadas) ? c.portadas : [],
    orden_tarjetas: Array.isArray(c.orden_tarjetas) ? c.orden_tarjetas : [],
  };
}

function supabaseBase() {
  return String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/$/, "");
}

function supabaseKey() {
  return String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function supabaseServiceKeyQuotes() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function cargarCatalogoDesdeNube() {
  const base = supabaseBase();
  const key = supabaseKey();
  if (!base || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el servidor");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  const sr = supabaseServiceKeyQuotes();
  const promHeaders = sr
    ? {
        apikey: sr,
        Authorization: `Bearer ${sr}`,
        Accept: "application/json",
      }
    : null;

  const [rows, comps, extra, promos] = await Promise.all([
    fetchJson(`${base}/rest/v1/servicios?select=*&order=nombre.asc`, headers),
    fetchJson(`${base}/rest/v1/complementos?select=*`, headers),
    fetchJson(`${base}/storage/v1/object/public/servicios/catalogo-canales.json?t=${Date.now()}`, {}).catch(
      () => null
    ),
    promHeaders
      ? fetchJson(`${base}/rest/v1/promociones?select=*&activo=eq.true&order=prioridad.asc`, promHeaders).catch(
          () => []
        )
      : Promise.resolve([]),
  ]);

  tableroColumnas = Array.isArray(extra && extra._tablero_columnas)
    ? extra._tablero_columnas.map(normalizarColumnaTablero).filter(Boolean)
    : [];

  ultimasFilasServicios = rows || [];
  ultimosComplementos = comps || [];
  ultimoExtraCanales = extra;

  promocionesVigentes = Array.isArray(promos) ? promos : [];

  catalogo = (rows || [])
    .map((row) => {
      let s = filaAServicio(row, comps || []);
      const ex = extra && extra[s.id] ? extra[s.id] : null;
      s = fusionarExtraEnServicio(s, ex);
      return s;
    })
    .filter((s) => s.activo !== false);

  catalogVersionHash = calcularCatalogVersionHash();

  cacheTs = Date.now();
  return catalogo;
}

function calcularCatalogVersionHash() {
  try {
    const payload = JSON.stringify({
      rows: (ultimasFilasServicios || []).map((r) => ({
        id: r.id,
        nombre: r.nombre,
        precio: r.precio,
        tipo: r.tipo,
        activo: r.activo,
      })),
      complementos: ultimosComplementos || [],
      tablero: tableroColumnas || [],
      extras: ultimoExtraCanales
        ? Object.keys(ultimoExtraCanales)
            .filter((k) => k !== "_tablero_columnas")
            .sort()
            .reduce((acc, k) => {
              acc[k] = ultimoExtraCanales[k];
              return acc;
            }, {})
        : {},
      promos: (promocionesVigentes || []).map((p) => ({
        id: p.id,
        servicio_id: p.servicio_id,
        activo: p.activo,
        fi: p.fecha_inicio,
        ff: p.fecha_fin,
        precio_fijo: p.precio_fijo,
      })),
      engine: PRICING_ENGINE,
    });
    return `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`;
  } catch (_e) {
    return `ts:${cacheTs || Date.now()}`;
  }
}

async function asegurarCatalogo() {
  if (catalogo.length && Date.now() - cacheTs < CACHE_MS) return catalogo;
  if (cacheCargando) return cacheCargando;
  cacheCargando = cargarCatalogoDesdeNube()
    .catch((e) => {
      console.warn("asistente-precios: no se pudo refrescar catálogo", e.message || e);
      throw e;
    })
    .finally(() => {
      cacheCargando = null;
    });
  return cacheCargando;
}

function normalizarVehiculoInput(raw) {
  if (!raw || typeof raw !== "object") return null;
  const marca = String(raw.marca || raw.Marca || "").trim();
  const modelo = String(raw.modelo || raw.model || raw.Modelo || "").trim();
  const anoRaw = raw.ano != null ? raw.ano : raw.año != null ? raw.año : raw.anio;
  const ano = Number(anoRaw);
  const combustible = normalizarCombustible(raw.combustible || raw.combustible_motor || "ambos");
  if (!marca || !modelo) return null;
  return { marca, modelo, ano: Number.isFinite(ano) ? ano : null, combustible };
}

function parseCodigosInput(body) {
  let raw = body && body.codigos != null ? body.codigos : body && body.codigo != null ? body.codigo : null;
  if (raw == null && body && body.query) raw = body.query;
  if (Array.isArray(raw)) {
    return raw
      .flatMap((x) => String(x).split(/[+,\s;]+/))
      .map((x) => x.replace(/\D/g, ""))
      .filter(Boolean)
      .map((x) => x.padStart(4, "0").slice(-4));
  }
  const s = String(raw || "").trim();
  if (!s) return [];
  return s
    .split(/[+,\s;]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean)
    .map((x) => x.padStart(4, "0").slice(-4));
}

function descuentosCondicionales(s) {
  return combosEntrantesDe(s.id).map((r) => {
    const otro = servicioPorId(r.si);
    return {
      servicio_requerido_id: r.si,
      servicio_requerido_codigo: otro ? formatoNumeroSerie(numeroSerieDe(otro)) : null,
      servicio_requerido_nombre: otro ? otro.nombre : r.si,
      precio_con_descuento: r.precio,
      precio_con_descuento_texto: clp(r.precio),
      mensaje: `Incluye descuento al realizar servicio de ${otro ? otro.nombre : r.si} ${clp(r.precio)}`,
    };
  });
}

function recomendadosPara(s, vehiculo) {
  return descuentosCondicionales(s)
    .map((d) => {
      const otro = servicioPorId(d.servicio_requerido_id);
      if (!otro) return null;
      const ap = servicioAplicaAVehiculo(otro, vehiculo);
      if (!ap.aplica) return null;
      return {
        codigo: d.servicio_requerido_codigo,
        nombre: d.servicio_requerido_nombre,
        precio_si_combinan: d.precio_con_descuento,
        precio_si_combinan_texto: d.precio_con_descuento_texto,
        mensaje: d.mensaje,
      };
    })
    .filter(Boolean);
}

function fichaServicio(s, vehiculo, idsCarritoContexto) {
  const ap = servicioAplicaAVehiculo(s, vehiculo);
  const codigo = formatoNumeroSerie(numeroSerieDe(s));
  if (!ap.aplica) {
    return {
      codigo,
      id: s.id,
      nombre: s.nombre,
      aplica_vehiculo: false,
      motivo_no_aplica: ap.motivo,
    };
  }
  let lista;
  let pagado;
  let ahorro;
  let regla = null;
  if (esServicioCombo(s)) {
    const pack = preciosPackCombo(s, vehiculo);
    lista = pack.lista;
    pagado = pack.pagado;
    ahorro = pack.ahorro;
  } else {
    const p = precioPagado(s, idsCarritoContexto || [], vehiculo, {});
    lista = p.lista;
    pagado = p.pagado;
    ahorro = p.ahorro;
    regla = p.regla;
  }
  const ofertaFija = precioOfertaDe(s);
  return {
    codigo,
    id: s.id,
    nombre: s.nombre,
    es_combo: esServicioCombo(s),
    resumen: s.resumen || "",
    detalle: (s.detalle || "").slice(0, 2000),
    canales: etiquetaCanales(s),
    aplica_vehiculo: true,
    disponible: !s.agotado,
    agotado: Boolean(s.agotado),
    ultima_unidad: Boolean(s.ultima_unidad),
    tiempo_minutos: s.tiempo_min || null,
    tiempo_estimado: etiquetaTiempo(s.tiempo_min),
    precio_normal: lista,
    precio_normal_texto: clp(lista),
    precio_con_descuento: pagado,
    precio_con_descuento_texto: clp(pagado),
    ahorro,
    ahorro_texto: ahorro > 0 ? clp(ahorro) : null,
    tiene_oferta_fija: ofertaFija != null,
    precio_oferta_fija: ofertaFija,
    regla_aplicada: regla,
    descuentos_condicionales: esServicioCombo(s) ? [] : descuentosCondicionales(s),
    miembros_combo: esServicioCombo(s)
      ? comboItemsDe(s).map((mid) => {
          const m = servicioPorId(mid);
          return {
            id: mid,
            codigo: m ? formatoNumeroSerie(numeroSerieDe(m)) : null,
            nombre: m ? m.nombre : mid,
          };
        })
      : [],
    recomendados: esServicioCombo(s) ? [] : recomendadosPara(s, vehiculo),
  };
}

async function consultarPrecios(body) {
  await asegurarCatalogo();
  const vehiculo =
    normalizarVehiculoInput(body && body.vehiculo) || normalizarVehiculoInput(body);
  if (!vehiculo) {
    return { ok: false, error: "Falta objeto vehiculo con marca, modelo y ano" };
  }
  if (vehiculo.ano == null) {
    return { ok: false, error: "Falta ano del vehiculo (numero entero)" };
  }

  const codigos = parseCodigosInput(body || {});
  if (!codigos.length) {
    return { ok: false, error: "Falta codigos (array o string tipo 0001+0002)" };
  }

  const errores = [];
  const resueltos = [];
  const vistos = new Set();
  codigos.forEach((cod) => {
    if (vistos.has(cod)) return;
    vistos.add(cod);
    const s = servicioPorNumeroSerie(cod);
    if (!s) {
      errores.push({ codigo: cod, error: "Código no encontrado" });
      return;
    }
    resueltos.push({ codigo: cod, servicio: s });
  });

  const carrito = resueltos.map((r) => ({
    tipo: "oferta",
    id: r.servicio.id,
    esComboLinea: esServicioCombo(r.servicio),
  }));

  if (codigos.length === 1) {
    if (!resueltos.length) {
      return { ok: false, error: "Código no encontrado", errores };
    }
    const s = resueltos[0].servicio;
    const ficha = fichaServicio(s, vehiculo, []);
    return {
      ok: true,
      modo: "detalle",
      vehiculo,
      servicio: ficha,
      errores,
      catalogo_actualizado_en: new Date(cacheTs).toISOString(),
      catalog_version: catalogVersionHash,
    };
  }

  const lineas = [];
  resueltos.forEach((r) => {
    const s = r.servicio;
    const ap = servicioAplicaAVehiculo(s, vehiculo);
    if (!ap.aplica) {
      errores.push({ codigo: r.codigo, id: s.id, error: ap.motivo });
      return;
    }
    const ficha = fichaServicio(s, vehiculo, idsServiciosEnCarrito(carrito, s.id));
    lineas.push({
      codigo: r.codigo,
      id: s.id,
      nombre: s.nombre,
      es_combo: esServicioCombo(s),
      aplica_vehiculo: true,
      precio_lista: ficha.precio_normal,
      precio_lista_texto: ficha.precio_normal_texto,
      precio_pagado: ficha.precio_con_descuento,
      precio_pagado_texto: ficha.precio_con_descuento_texto,
      ahorro: ficha.ahorro,
      ahorro_texto: ficha.ahorro_texto,
      regla_aplicada: ficha.regla_aplicada,
      descuentos_condicionales: ficha.descuentos_condicionales,
      agotado: ficha.agotado,
      tiempo_estimado: ficha.tiempo_estimado,
    });
  });

  const tot = calcularCarrito(
    carrito.filter((l) => lineas.some((x) => x.id === l.id)),
    vehiculo
  );

  return {
    ok: true,
    modo: "cotizacion",
    vehiculo,
    lineas,
    totales: {
      subtotal_lista: tot.subtotal_lista,
      subtotal_lista_texto: clp(tot.subtotal_lista),
      total_pagado: tot.total_pagado,
      total_pagado_texto: clp(tot.total_pagado),
      ahorro_total: tot.ahorro_total,
      ahorro_total_texto: clp(tot.ahorro_total),
    },
    errores,
    catalogo_actualizado_en: new Date(cacheTs).toISOString(),
    catalog_version: catalogVersionHash,
  };
}

function tokenAsistenteValido(req) {
  const esperado = String(process.env.ASISTENTE_PRECIOS_TOKEN || process.env.ASSISTANT_WEBHOOK_TOKEN || "").trim();
  if (!esperado) return false;
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() === esperado;
  }
  const hdr = String(req.headers["x-asistente-token"] || req.headers["x-autodato-token"] || "").trim();
  return hdr === esperado;
}

function normalizarVehiculoVambe(raw) {
  if (!raw || typeof raw !== "object") return null;
  return normalizarVehiculoInput({
    marca: raw.brand || raw.marca,
    modelo: raw.model || raw.modelo,
    ano: raw.year != null ? raw.year : raw.ano,
    combustible: raw.fuel || raw.combustible || "ambos",
  });
}

function parseServiceCodesVambe(body) {
  if (body && Array.isArray(body.service_codes)) {
    return body.service_codes
      .map((x) => String(x).replace(/\D/g, ""))
      .filter(Boolean)
      .map((x) => x.padStart(4, "0").slice(-4));
  }
  return parseCodigosInput(body || {});
}

function priceTypeFromRegla(regla, lista, pagado) {
  if (regla && regla.tipo === "promocion_temporal") return "promotion";
  if (regla && regla.tipo === "asociacion") return "combination";
  if (regla && regla.tipo === "oferta_fija") return "promotional";
  if (lista != null && pagado != null && lista !== pagado) return "promotional";
  return "list";
}

function reglaAAppliedRules(regla, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const out = [];
  if (!regla) return out;
  if (regla.tipo === "promocion_temporal") {
    out.push({
      type: "temporary_promotion",
      promotion_id: regla.promocion_id || null,
      label: regla.etiqueta || "",
    });
  } else if (regla.tipo === "asociacion") {
    const otro = servicioPorId(regla.servicio_requerido_id);
    out.push({
      type: "combination",
      requires_service_id: regla.servicio_requerido_id,
      requires_service_code: otro ? formatoNumeroSerie(numeroSerieDe(otro)) : null,
      label: regla.etiqueta || "",
    });
  } else if (regla.tipo === "oferta_fija") {
    out.push({ type: "fixed_offer", label: regla.etiqueta || "Oferta fija" });
  }
  if (o.comboSourceCode) {
    out.push({ type: "combo", source_code: o.comboSourceCode });
  }
  return out;
}

function construirCarritoVambeDesdeCodigos(codigos, vehiculo) {
  const warnings = [];
  const errores = [];
  const vistosCod = new Set();
  const pedido = [];
  codigos.forEach((cod) => {
    if (vistosCod.has(cod)) {
      warnings.push({
        code: "DUPLICATE_CODE",
        message: "Ese código se repitió en la solicitud; se cuenta una sola vez.",
        service_code: cod,
      });
      return;
    }
    vistosCod.add(cod);
    const s = servicioPorNumeroSerie(cod);
    if (!s) {
      errores.push({ codigo: cod, error: "Código no encontrado" });
      return;
    }
    pedido.push({ cod, servicio: s });
  });

  const combos = pedido.filter((x) => esServicioCombo(x.servicio));
  const sueltos = pedido.filter((x) => !esServicioCombo(x.servicio));
  const miembrosCubiertos = new Set();
  combos.forEach(({ servicio: c }) => comboItemsDe(c).forEach((id) => miembrosCubiertos.add(id)));

  const carrito = [];
  const idsEnCarrito = new Set();

  combos.forEach(({ cod, servicio: c }) => {
    const ap = servicioAplicaAVehiculo(c, vehiculo);
    if (!ap.aplica) {
      errores.push({ codigo: cod, id: c.id, error: ap.motivo });
      return;
    }
    carrito.push({ tipo: "oferta", id: c.id, esComboLinea: true, codigo_serie: cod });
    idsEnCarrito.add(c.id);
  });

  sueltos.forEach(({ cod, servicio: s }) => {
    const ap = servicioAplicaAVehiculo(s, vehiculo);
    if (!ap.aplica) {
      errores.push({ codigo: cod, id: s.id, error: ap.motivo });
      return;
    }
    if (miembrosCubiertos.has(s.id)) {
      warnings.push({
        code: "SERVICE_ALREADY_IN_COMBO",
        message: "Ese servicio ya está incluido en un combo de la cotización.",
        service_code: cod,
      });
      return;
    }
    if (idsEnCarrito.has(s.id)) {
      warnings.push({
        code: "DUPLICATE_SERVICE",
        message: "El servicio ya estaba en el carrito.",
        service_code: cod,
      });
      return;
    }
    idsEnCarrito.add(s.id);
    carrito.push({ tipo: "oferta", id: s.id, esComboLinea: false, codigo_serie: cod });
  });

  return { carrito, errores, warnings };
}

function itemsVambeDesdeCarrito(carrito, vehiculo) {
  const items = [];
  carrito.forEach((linea) => {
    if (linea.tipo !== "oferta") return;
    if (linea.esComboLinea) {
      const combo = servicioPorId(linea.id);
      if (!combo || !esServicioCombo(combo)) return;
      const pack = preciosPackCombo(combo, vehiculo);
      const codCombo = linea.codigo_serie || formatoNumeroSerie(numeroSerieDe(combo));
      const included = comboItemsDe(combo).map((mid) => {
        const m = servicioPorId(mid);
        return m ? formatoNumeroSerie(numeroSerieDe(m)) : null;
      }).filter(Boolean);
      const metaCombo = {
        promotion_id: null,
        promotion_name: null,
        applied_rule: { type: "combo", tier_order: null, label: "Pack combo", source_code: codCombo },
        price_before: Math.round(pack.lista),
        price_final: Math.round(pack.pagado),
        promotion_higher_than_combination: false,
      };
      items.push({
        code: codCombo,
        id: combo.id,
        name: combo.nombre,
        price_type: "combo",
        unit_price: pack.pagado,
        quantity: 1,
        list_price: pack.lista,
        included_services: included,
        applied_rules: reglaAAppliedRules(null, { comboSourceCode: codCombo }),
        ...metaCombo,
      });
      return;
    }
    const s = servicioPorId(linea.id);
    if (!s) return;
    const otros = idsServiciosEnCarrito(carrito, linea.id);
    const p = precioPagado(s, otros, vehiculo, {});
    const cod = linea.codigo_serie || formatoNumeroSerie(numeroSerieDe(s));
    const meta = itemMetaPromocion(p);
    items.push({
      code: cod,
      id: s.id,
      name: s.nombre,
      price_type: priceTypeFromRegla(p.regla, p.lista, p.pagado),
      unit_price: p.pagado,
      quantity: 1,
      list_price: p.lista,
      included_services: [],
      applied_rules: reglaAAppliedRules(p.regla, {}),
      promotion_id: meta.promotion_id,
      promotion_name: meta.promotion_name,
      applied_rule: meta.applied_rule,
      price_before: meta.price_before,
      price_final: meta.price_final,
      promotion_higher_than_combination: meta.promotion_higher_than_combination,
    });
  });
  return items;
}

function addonsSugeridosVambe(carrito, vehiculo) {
  const idsEn = new Set(idsServiciosEnCarrito(carrito));
  const miembrosCombo = new Set();
  carrito.forEach((l) => {
    if (!l.esComboLinea) return;
    const c = servicioPorId(l.id);
    if (c && esServicioCombo(c)) comboItemsDe(c).forEach((id) => miembrosCombo.add(id));
  });
  const out = [];
  const vistoCod = new Set();
  carrito.forEach((linea) => {
    if (linea.esComboLinea) return;
    const s = servicioPorId(linea.id);
    if (!s) return;
    const sug = recomendadosPara(s, vehiculo) || [];
    sug.forEach((r) => {
      const otro = servicioPorNumeroSerie(r.codigo);
      if (!otro) return;
      if (idsEn.has(otro.id) || miembrosCombo.has(otro.id)) return;
      if (vistoCod.has(r.codigo)) return;
      vistoCod.add(r.codigo);
      out.push({
        code: r.codigo,
        name: r.nombre,
        price: r.precio_si_combinan,
        reason: r.mensaje || "Complemento sugerido",
      });
    });
  });
  return out.slice(0, 12);
}

async function upsertCotizacionSupabase(row) {
  const base = supabaseBase();
  const key = supabaseServiceKeyQuotes();
  if (!base || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY para cotizaciones");
  const url = `${base}/rest/v1/cotizaciones`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });
  const txt = await r.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch (_e) {
    data = null;
  }
  if (!r.ok) {
    throw new Error((data && data.message) || txt || `HTTP ${r.status}`);
  }
  return Array.isArray(data) ? data[0] : data;
}

async function leerCotizacionSupabase(id) {
  const base = supabaseBase();
  const key = supabaseServiceKeyQuotes();
  if (!base || !key) return null;
  const r = await fetch(`${base}/rest/v1/cotizaciones?id=eq.${encodeURIComponent(id)}&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}

async function leerCotizacionPorIdempotencia(channel, idem) {
  const base = supabaseBase();
  const key = supabaseServiceKeyQuotes();
  if (!base || !key || !idem) return null;
  const r = await fetch(
    `${base}/rest/v1/cotizaciones?channel=eq.${encodeURIComponent(channel)}&idempotency_key=eq.${encodeURIComponent(idem)}&select=*&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } }
  );
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}

async function leerCotizacionPorTicketIdem(channel, idem) {
  const base = supabaseBase();
  const key = supabaseServiceKeyQuotes();
  if (!base || !key || !idem) return null;
  const r = await fetch(
    `${base}/rest/v1/cotizaciones?channel=eq.${encodeURIComponent(channel)}&ticket_idempotency_key=eq.${encodeURIComponent(idem)}&select=*&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } }
  );
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}

async function actualizarCotizacionSupabase(id, patch) {
  const base = supabaseBase();
  const key = supabaseServiceKeyQuotes();
  if (!base || !key || !id) throw new Error("actualizar cotización: parámetros inválidos");
  const r = await fetch(`${base}/rest/v1/cotizaciones?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  const txt = await r.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch (_e) {
    data = null;
  }
  if (!r.ok) {
    throw new Error((data && data.message) || txt || `HTTP ${r.status}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

/** Snapshot u objeto interno: produce salida estable para la API Vambe */
function mapVehicleOut(v) {
  if (!v) return null;
  if (v.marca != null || v.modelo != null) {
    return {
      brand: v.marca,
      model: v.modelo,
      year: v.ano,
      fuel: v.combustible,
    };
  }
  return {
    brand: v.brand,
    model: v.model,
    year: v.year,
    fuel: v.fuel,
  };
}

function vehiculoEligible(v) {
  if (!v || !v.marca || !v.modelo || v.ano == null) return { eligible: false, warnings: [] };
  const wl = [];
  const m = String(v.marca).toLowerCase();
  if (m !== "hyundai" && m !== "kia") {
    wl.push({
      code: "BRAND_OUT_OF_SCOPE",
      message: "Por ahora el catálogo de este canal está orientado a Hyundai y Kia.",
    });
  }
  if (Number(v.ano) < ANIO_MIN) {
    wl.push({
      code: "YEAR_BELOW_POLICY",
      message: `Años inferiores a ${ANIO_MIN} pueden no tener cobertura en promociones del canal.`,
    });
  }
  return { eligible: true, warnings: wl };
}

function construirRespuestaVambeExito(opts) {
  const o = opts || {};
  const tot = Number(o.totales && o.totales.total_pagado != null ? o.totales.total_pagado : o.total) || 0;
  const sub = Number(o.totales && o.totales.subtotal_lista != null ? o.totales.subtotal_lista : o.subtotal) || 0;
  const disc = Math.max(0, sub - tot);
  return {
    ok: true,
    eligible: o.eligible !== false,
    quote_id: o.quote_id || null,
    catalog_version: catalogVersionHash || "",
    pricing_engine: PRICING_ENGINE,
    expires_at: o.expires_at != null ? o.expires_at : null,
    vehicle: mapVehicleOut(o.vehicle),
    items: o.items || [],
    suggested_addons: o.suggested_addons || [],
    subtotal: Math.round(sub),
    discount: Math.round(disc),
    total: Math.round(tot),
    currency: "CLP",
    warnings: o.warnings || [],
    active_promotions: (promocionesVigentes || [])
      .filter((p) => p && p.activo && promocionTemporalVigente(p, Date.now()))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        servicio_id: p.servicio_id,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
      })),
  };
}

function errorVambe(code, message, extra) {
  const e = extra && typeof extra === "object" ? extra : {};
  const out = {
    ok: false,
    error_code: code,
    message,
    warnings: e.warnings || [],
    quote_id: e.quote_id != null ? e.quote_id : null,
  };
  if (e.eligible != null) out.eligible = e.eligible;
  return out;
}

function parseScopeVambe(body) {
  const s = String((body && body.scope) || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s !== "hyundai_kia") return null;
  return s;
}

function alcanceRechazaMarca(scope, marca) {
  if (scope !== "hyundai_kia") return null;
  const m = String(marca || "")
    .trim()
    .toLowerCase();
  if (m !== "hyundai" && m !== "kia") {
    return errorVambe("BRAND_OUT_OF_SCOPE", "Este catálogo solo atiende vehículos Hyundai y Kia.", {
      eligible: false,
      warnings: [],
      quote_id: null,
    });
  }
  return null;
}

/**
 * Errores de vehículo antes de cotizar (quote / reprice).
 * Orden: marca > modelo > año; con scope hyundai_kia marca fuera de Hyundai/Kia.
 */
function validarVehiculoVambeParaCotizar(body, scope) {
  const raw = (body && body.vehicle) || body || {};
  const marcaRaw = raw.brand != null ? raw.brand : raw.marca;
  const modeloRaw = raw.model != null ? raw.model : raw.modelo;
  const anoRaw = raw.year != null ? raw.year : raw.ano;

  const marcaEmpty = marcaRaw == null || !String(marcaRaw).trim();
  const modeloEmpty = modeloRaw == null || !String(modeloRaw).trim();
  const anoEmpty = anoRaw == null || String(anoRaw).trim() === "";

  if (marcaEmpty) {
    return errorVambe("VEHICLE_BRAND_REQUIRED", "Indica la marca del vehículo.", { eligible: false, warnings: [] });
  }
  const outScope = alcanceRechazaMarca(scope, marcaRaw);
  if (outScope) return outScope;

  if (modeloEmpty) {
    return errorVambe("VEHICLE_MODEL_REQUIRED", "Indica el modelo del vehículo.", { eligible: false, warnings: [] });
  }
  const anoNum = Number(anoRaw);
  if (anoEmpty || !Number.isFinite(anoNum)) {
    return errorVambe("VEHICLE_YEAR_REQUIRED", "Indica el año del vehículo como número.", { eligible: false, warnings: [] });
  }
  return null;
}

/** Tras merge con vehicle_json guardado (reprice). */
function validarVehiculoNormalizadoVambe(vehiculo, scope, quoteIdOpt) {
  const extra = { eligible: false, warnings: [], quote_id: quoteIdOpt != null ? quoteIdOpt : null };
  if (!vehiculo) {
    return errorVambe("VEHICLE_REQUIRED", "Faltan datos del vehículo (marca, modelo y año).", extra);
  }
  const marcaEmpty = vehiculo.marca == null || !String(vehiculo.marca).trim();
  if (marcaEmpty) {
    return errorVambe("VEHICLE_BRAND_REQUIRED", "Indica la marca del vehículo.", extra);
  }
  const outScope = alcanceRechazaMarca(scope, vehiculo.marca);
  if (outScope) return { ...outScope, quote_id: quoteIdOpt != null ? quoteIdOpt : outScope.quote_id };
  if (vehiculo.modelo == null || !String(vehiculo.modelo).trim()) {
    return errorVambe("VEHICLE_MODEL_REQUIRED", "Indica el modelo del vehículo.", extra);
  }
  if (vehiculo.ano == null || !Number.isFinite(Number(vehiculo.ano))) {
    return errorVambe("VEHICLE_YEAR_REQUIRED", "Indica el año del vehículo como número.", extra);
  }
  return null;
}

function itemMetaPromocion(p) {
  const regla = p && p.regla;
  const promotionId = regla && regla.tipo === "promocion_temporal" ? regla.promocion_id || null : null;
  const promotionName =
    regla && regla.tipo === "promocion_temporal" ? regla.promocion_nombre || regla.etiqueta || null : null;
  let applied_rule = null;
  if (regla && regla.tipo === "promocion_temporal") {
    applied_rule = {
      type: "temporary_promotion",
      tier_order: 1,
      label: regla.etiqueta || promotionName || "",
      promotion_id: promotionId,
    };
  } else if (regla && regla.tipo === "asociacion") {
    applied_rule = {
      type: "combination",
      tier_order: 2,
      label: regla.etiqueta || "",
      servicio_requerido_id: regla.servicio_requerido_id || null,
    };
  } else if (regla && regla.tipo === "oferta_fija") {
    applied_rule = {
      type: "fixed_offer",
      tier_order: 3,
      label: regla.etiqueta || "Oferta fija",
    };
  }
  const lista = p.lista != null ? Math.round(Number(p.lista)) : null;
  const pagado = p.pagado != null ? Math.round(Number(p.pagado)) : null;
  const prev =
    p.precio_referencia_anterior != null && Number.isFinite(Number(p.precio_referencia_anterior))
      ? Math.round(Number(p.precio_referencia_anterior))
      : lista;
  const antes =
    p.precio_antes_capa_temporal != null && Number.isFinite(Number(p.precio_antes_capa_temporal))
      ? Math.round(Number(p.precio_antes_capa_temporal))
      : null;
  /** Promo temporal ganó por tier pero el precio final es mayor que el de combinación/oferta previa (decisión comercial pendiente si se desea “siempre el menor”). */
  const ambiguedad =
    regla && regla.tipo === "promocion_temporal" && antes != null && pagado != null && pagado > antes;
  return {
    promotion_id: promotionId,
    promotion_name: promotionName,
    applied_rule,
    price_before: prev,
    price_final: pagado,
    /** true si la promo temporal ganó por prioridad pero el precio era mayor que el de combinación/oferta previa */
    promotion_higher_than_combination: ambiguedad,
  };
}

/** Normaliza código "3", "0003", 3 → "0003". Vacío → null */
function parseCodigoPlanoVambe(raw) {
  const s = String(raw == null ? "" : raw)
    .replace(/\D/g, "")
    .trim();
  if (!s) return null;
  return s.padStart(4, "0").slice(-4);
}

/**
 * No quitar por separado un servicio que en el pedido está solo como miembro implícito de un combo.
 * `codigos`: lista actual de códigos (orden preservado).
 */
function puedeQuitarCodigoVambe(codigos, remNorm) {
  const list = codigos || [];

  if (!list.includes(remNorm)) {
    for (const cod of list) {
      const s = servicioPorNumeroSerie(cod);
      if (!s || !esServicioCombo(s)) continue;
      const miembros = comboItemsDe(s).map((id) => {
        const it = servicioPorId(id);
        return it ? formatoNumeroSerie(numeroSerieDe(it)) : null;
      }).filter(Boolean);
      if (miembros.includes(remNorm)) {
        return {
          code: "CANNOT_REMOVE_COMBO_MEMBER",
          message:
            "No se puede quitar por separado un servicio incluido en un combo. Quita primero el combo completo usando su código o reemplaza la cotización.",
          warnings: [{ code: "COMBO_MEMBER_LOCKED", service_code: remNorm, combo_service_code: cod }],
        };
      }
    }
    return { code: "SERVICE_NOT_IN_QUOTE", message: "Ese código no está en la cotización actual.", warnings: [] };
  }

  const pedido = [];
  const errores = [];
  list.forEach((cod) => {
    const s = servicioPorNumeroSerie(cod);
    if (!s) errores.push({ codigo: cod });
    else pedido.push({ cod, servicio: s });
  });

  const combos = pedido.filter((x) => esServicioCombo(x.servicio));
  const combosIncluyen = new Map();
  combos.forEach(({ cod, servicio: c }) => {
    const inc = comboItemsDe(c).map((id) => formatoNumeroSerie(numeroSerieDe(servicioPorId(id)))).filter(Boolean);
    combosIncluyen.set(cod, inc);
  });

  for (const [comboCod, miembros] of combosIncluyen) {
    if (miembros.includes(remNorm) && list.includes(comboCod)) {
      return {
        code: "CANNOT_REMOVE_COMBO_MEMBER",
        message:
          "No se puede quitar por separado un servicio incluido en un combo. Quita primero el combo completo usando su código o reemplaza la cotización.",
        warnings: [{ code: "COMBO_MEMBER_LOCKED", service_code: remNorm, combo_service_code: comboCod }],
      };
    }
  }
  return null;
}

function vehicleFromSnapshotOrRow(snap, row) {
  const v =
    snap && snap.vehicle && (snap.vehicle.brand || snap.vehicle.marca)
      ? {
          marca: snap.vehicle.brand || snap.vehicle.marca,
          modelo: snap.vehicle.model || snap.vehicle.modelo,
          ano: snap.vehicle.year != null ? snap.vehicle.year : snap.vehicle.ano,
          combustible: snap.vehicle.fuel || snap.vehicle.combustible || "ambos",
        }
      : row && row.vehicle_json && typeof row.vehicle_json === "object"
        ? row.vehicle_json
        : null;
  return v;
}

function respuestaExitoDesdeFilaCotizacion(row, extraWarnings) {
  const snap = (row.lines_json && row.lines_json.snapshot) || {};
  const v = vehicleFromSnapshotOrRow(snap, row);
  const { eligible, warnings: wElig } = vehiculoEligible(v || {});
  const wExtra = Array.isArray(extraWarnings) ? extraWarnings : [];
  return construirRespuestaVambeExito({
    quote_id: row.id,
    eligible,
    expires_at: row.expires_at,
    vehicle: v,
    items: snap.items || [],
    suggested_addons: snap.suggested_addons || [],
    subtotal: row.subtotal,
    total: row.total,
    totales: { subtotal_lista: row.subtotal, total_pagado: row.total },
    warnings: [...(wElig || []), ...wExtra],
  });
}

/** Webhook plano → cuerpo interno de cotización (mismas respuestas que /catalog/quote). */
function quoteFlatBodyToInternal(flat) {
  const f = flat && typeof flat === "object" ? flat : {};
  const action = String(f.action || "quote").toLowerCase();
  const internal = {
    action,
    scope: f.scope,
    channel: f.channel,
    idempotency_key: f.idempotency_key,
    client_ref: f.client_ref,
    quote_id: f.quote_id,
  };

  if (action === "reprice_add") {
    internal.add_service_code = f.add_service_code;
    return internal;
  }
  if (action === "reprice_remove") {
    internal.remove_service_code = f.remove_service_code;
    return internal;
  }

  const marca = f.brand != null ? f.brand : f.marca;
  const modelo = f.model != null ? f.model : f.modelo;
  const ano = f.year != null ? f.year : f.ano;
  const comb = f.fuel != null ? f.fuel : f.combustible;

  if (marca != null || modelo != null || ano != null || comb != null) {
    internal.vehicle = {
      brand: marca,
      model: modelo,
      year: ano,
      fuel: comb,
    };
  }

  if (f.service_codes != null) internal.service_codes = f.service_codes;
  else if (f.service_code != null && f.service_code !== "") {
    internal.service_codes = [f.service_code];
  } else if (f.codigos != null) internal.service_codes = f.codigos;

  return internal;
}

/** Ticket plano → cuerpo interno (misma validación que ticketDesdeCotizacionVambe). */
function ticketFlatBodyToInternal(flat) {
  const f = flat && typeof flat === "object" ? flat : {};
  return {
    quote_id: f.quote_id,
    channel: f.channel,
    idempotency_key: f.idempotency_key,
    contact: {
      name: f.name != null ? f.name : f.nombre_cliente,
      phone: f.phone != null ? f.phone : f.telefono,
      plate: f.plate != null ? f.plate : f.patente,
      email: f.email != null ? f.email : f.correo,
    },
    appointment: {
      date: f.appointment_date != null ? f.appointment_date : f.fecha_cita,
      time: f.appointment_time != null ? f.appointment_time : f.hora,
    },
    notes: f.notes != null ? f.notes : f.sintoma,
  };
}

async function cotizarVambeInterno(body) {
  await asegurarCatalogo();
  const action = String((body && body.action) || "quote").toLowerCase();
  const channel = String((body && body.channel) || "vambe").trim() || "vambe";
  const idem = String((body && body.idempotency_key) || "").trim();
  const clientRef = String((body && body.client_ref) || "").trim();
  const quoteIdIn = String((body && body.quote_id) || "").trim();
  const scope = parseScopeVambe(body || {});

  if (idem && (action === "quote" || action === "reprice" || action === "reprice_add" || action === "reprice_remove")) {
    let prev = await leerCotizacionPorIdempotencia(channel, idem);
    if (prev && prev.id && scope === "hyundai_kia") {
      const prevScope = String(
        (prev.request_json && prev.request_json.scope) ||
          (prev.lines_json && prev.lines_json.snapshot && prev.lines_json.snapshot.scope) ||
          ""
      )
        .trim()
        .toLowerCase();
      if (prevScope !== "hyundai_kia") prev = null;
    }
    if (prev && prev.id) {
      const snap = (prev.lines_json && prev.lines_json.snapshot) || {};
      const v =
        snap.vehicle && (snap.vehicle.brand || snap.vehicle.marca)
          ? {
              marca: snap.vehicle.brand || snap.vehicle.marca,
              modelo: snap.vehicle.model || snap.vehicle.modelo,
              ano: snap.vehicle.year != null ? snap.vehicle.year : snap.vehicle.ano,
              combustible: snap.vehicle.fuel || snap.vehicle.combustible || "ambos",
            }
          : prev.vehicle_json || {};
      if (scope === "hyundai_kia") {
        const br = alcanceRechazaMarca(scope, v && v.marca);
        if (br) return br;
      }
      const { eligible, warnings: wReplayElig } = vehiculoEligible(v);
      return construirRespuestaVambeExito({
        quote_id: prev.id,
        eligible,
        expires_at: prev.expires_at,
        vehicle: v,
        items: snap.items || [],
        suggested_addons: snap.suggested_addons || [],
        subtotal: prev.subtotal,
        total: prev.total,
        totales: { subtotal_lista: prev.subtotal, total_pagado: prev.total },
        warnings: [
          ...(wReplayElig || []),
          { code: "IDEMPOTENCY_REPLAY", message: "Misma clave de idempotencia: se devuelve la cotización ya registrada." },
        ],
      });
    }
  }

  if (action === "reprice_add" || action === "reprice_remove") {
    if (!quoteIdIn) {
      return errorVambe("REPRICE_QUOTE_REQUIRED", "Indica quote_id para modificar la cotización.", {});
    }
    if (!supabaseServiceKeyQuotes()) {
      return errorVambe(
        "QUOTE_PERSIST_DISABLED",
        "Para modificar la cotización hace falta SUPABASE_SERVICE_ROLE_KEY.",
        {}
      );
    }
    const existing = await leerCotizacionSupabase(quoteIdIn);
    if (!existing) return errorVambe("QUOTE_NOT_FOUND", "No se encontró la cotización.", {});

    const snap0 = (existing.lines_json && existing.lines_json.snapshot) || {};
    let codigos = Array.isArray(snap0.service_codes)
      ? snap0.service_codes.map((c) => String(c).replace(/\D/g, "").padStart(4, "0").slice(-4)).filter(Boolean)
      : [];
    if (!codigos.length && existing.lines_json && Array.isArray(existing.lines_json.carrito)) {
      codigos = (existing.lines_json.carrito || [])
        .map((l) => {
          const s = servicioPorId(l.id);
          return s ? formatoNumeroSerie(numeroSerieDe(s)) : null;
        })
        .filter(Boolean);
    }

    const addRaw = String((body && body.add_service_code) || "").trim();
    const remRaw = String((body && body.remove_service_code) || "").trim();
    let addNorm = null;
    let remNorm = null;

    if (action === "reprice_add") {
      addNorm = parseCodigoPlanoVambe(addRaw);
      if (!addNorm) {
        return errorVambe("ADD_SERVICE_CODE_REQUIRED", "Indica add_service_code con un código válido.", {
          quote_id: existing.id,
        });
      }
      if (codigos.includes(addNorm)) {
        const w = {
          code: "SERVICE_ALREADY_IN_QUOTE",
          message: "Ese código ya está en la cotización; no se duplicó.",
          service_code: addNorm,
        };
        return respuestaExitoDesdeFilaCotizacion(existing, [w]);
      }
      codigos = [...codigos, addNorm];
    } else {
      remNorm = parseCodigoPlanoVambe(remRaw);
      if (!remNorm) {
        return errorVambe("REMOVE_SERVICE_CODE_REQUIRED", "Indica remove_service_code con un código válido.", {
          quote_id: existing.id,
        });
      }
      const errCombo = puedeQuitarCodigoVambe(codigos, remNorm);
      if (errCombo) {
        return errorVambe(errCombo.code, errCombo.message, { quote_id: existing.id, warnings: errCombo.warnings || [] });
      }
      codigos = codigos.filter((c) => c !== remNorm);
      if (!codigos.length) {
        return errorVambe(
          "SERVICE_CODES_REQUIRED",
          "No se puede dejar la cotización sin servicios. Quita el combo completo o agrega otros códigos.",
          { quote_id: existing.id, warnings: [] }
        );
      }
    }

    const inner = {
      ...body,
      action: "reprice",
      quote_id: quoteIdIn,
      service_codes: codigos,
      ...(action === "reprice_add" && addNorm ? { _vambe_flat_add_code: addNorm } : {}),
    };
    return cotizarVambeInterno(inner);
  }

  if (action === "validate" && quoteIdIn) {
    const row = await leerCotizacionSupabase(quoteIdIn);
    if (!row) return errorVambe("QUOTE_NOT_FOUND", "No se encontró la cotización.", {});
    if (row.catalog_version && catalogVersionHash && row.catalog_version !== catalogVersionHash) {
      return errorVambe(
        "QUOTE_STALE_CATALOG",
        "El catálogo cambió desde esta cotización. Vuelve a cotizar.",
        { quote_id: row.id }
      );
    }
    const exp = row.expires_at ? new Date(row.expires_at).getTime() : null;
    if (exp && Date.now() > exp) {
      return errorVambe("QUOTE_EXPIRED", "La cotización expiró.", { quote_id: row.id });
    }
    const snap = (row.lines_json && row.lines_json.snapshot) || {};
    const v =
      snap.vehicle && (snap.vehicle.brand || snap.vehicle.marca)
        ? {
            marca: snap.vehicle.brand || snap.vehicle.marca,
            modelo: snap.vehicle.model || snap.vehicle.modelo,
            ano: snap.vehicle.year != null ? snap.vehicle.year : snap.vehicle.ano,
            combustible: snap.vehicle.fuel || snap.vehicle.combustible || "ambos",
          }
        : row.vehicle_json || {};
    if (scope === "hyundai_kia") {
      const br = alcanceRechazaMarca(scope, v && v.marca);
      if (br) return br;
    }
    const { eligible, warnings: wValElig } = vehiculoEligible(v);
    return construirRespuestaVambeExito({
      quote_id: row.id,
      eligible,
      expires_at: row.expires_at,
      vehicle: v,
      items: snap.items || [],
      suggested_addons: snap.suggested_addons || [],
      subtotal: row.subtotal,
      total: row.total,
      totales: { subtotal_lista: row.subtotal, total_pagado: row.total },
      warnings: wValElig || [],
    });
  }

  if (action === "reprice") {
    if (!quoteIdIn) {
      return errorVambe("REPRICE_QUOTE_REQUIRED", "Para recalcular indica quote_id y los nuevos service_codes.");
    }
    if (!supabaseServiceKeyQuotes()) {
      return errorVambe(
        "QUOTE_PERSIST_DISABLED",
        "Para reprice hace falta SUPABASE_SERVICE_ROLE_KEY para leer y actualizar la cotización.",
        {}
      );
    }
    const existing = await leerCotizacionSupabase(quoteIdIn);
    if (!existing) return errorVambe("QUOTE_NOT_FOUND", "No se encontró la cotización.", {});

    const vehiculo =
      normalizarVehiculoVambe((body && body.vehicle) || body) ||
      (existing.vehicle_json && typeof existing.vehicle_json === "object" ? existing.vehicle_json : null);
    const vErr = validarVehiculoNormalizadoVambe(vehiculo, scope, existing.id);
    if (vErr) return { ...vErr, quote_id: vErr.quote_id != null ? vErr.quote_id : existing.id };

    if (existing.catalog_version && catalogVersionHash && existing.catalog_version !== catalogVersionHash) {
      return errorVambe(
        "QUOTE_STALE_CATALOG",
        "El catálogo cambió desde esta cotización. Crea una cotización nueva (quote).",
        { quote_id: existing.id, warnings: [] }
      );
    }
    const expMs = existing.expires_at ? new Date(existing.expires_at).getTime() : null;
    if (expMs && Date.now() > expMs) {
      return errorVambe("QUOTE_EXPIRED", "La cotización expiró.", { quote_id: existing.id });
    }
    if (existing.status === "ticket_created") {
      return errorVambe("QUOTE_ALREADY_CONVERTED", "Esta cotización ya generó un ticket; no se puede recalcular.", {
        quote_id: existing.id,
      });
    }

    const { eligible, warnings: wElig } = vehiculoEligible(vehiculo);
    const codigos = parseServiceCodesVambe(body);
    if (!codigos.length) {
      return errorVambe("SERVICE_CODES_REQUIRED", "Indica al menos un código de servicio.", {
        quote_id: existing.id,
        warnings: wElig,
      });
    }

    const flatAdd = String((body && body._vambe_flat_add_code) || "")
      .replace(/\D/g, "")
      .padStart(4, "0")
      .slice(-4);
    if (flatAdd && codigos.includes(flatAdd)) {
      const sAdd = servicioPorNumeroSerie(flatAdd);
      if (!sAdd) {
        return errorVambe("SERVICE_NOT_COMPATIBLE", "Código no encontrado.", {
          quote_id: existing.id,
          warnings: wElig,
        });
      }
      const apAdd = servicioAplicaAVehiculo(sAdd, vehiculo);
      if (!apAdd.aplica) {
        return errorVambe("SERVICE_NOT_COMPATIBLE", apAdd.motivo || "Servicio no aplicable.", {
          quote_id: existing.id,
          warnings: wElig,
        });
      }
    }

    const { carrito, errores, warnings: wCart } = construirCarritoVambeDesdeCodigos(codigos, vehiculo);
    const warnings = [...(wElig || []), ...(wCart || [])];

    if (errores.length && !carrito.length) {
      const first = errores[0];
      return errorVambe("SERVICE_NOT_COMPATIBLE", first.error || "Servicio no aplicable.", {
        quote_id: existing.id,
        warnings,
      });
    }

    const carritoFiltrado = carrito.filter((l) => {
      const s = servicioPorId(l.id);
      return s && !errores.some((e) => e.id === s.id);
    });

    const tot = calcularCarrito(carritoFiltrado, vehiculo);
    const items = itemsVambeDesdeCarrito(carritoFiltrado, vehiculo);
    const suggested = addonsSugeridosVambe(carritoFiltrado, vehiculo);

    errores.forEach((e) => {
      warnings.push({
        code: "SERVICE_SKIPPED",
        message: e.error || "Servicio omitido",
        service_code: e.codigo,
      });
    });

    const nuevaExpira = new Date(Date.now() + QUOTE_DEFAULT_TTL_MS).toISOString();
    const snap = {
      scope: scope || null,
      vehicle: {
        brand: vehiculo.marca,
        model: vehiculo.modelo,
        year: vehiculo.ano,
        fuel: vehiculo.combustible,
      },
      items,
      suggested_addons: suggested,
      service_codes: codigos,
      totales: tot,
      errores,
    };

    try {
      await actualizarCotizacionSupabase(existing.id, {
        vehicle_json: vehiculo,
        request_json: body || {},
        lines_json: { snapshot: snap, carrito: carritoFiltrado },
        subtotal: Math.round(tot.subtotal_lista),
        discount: Math.max(0, Math.round(tot.subtotal_lista - tot.total_pagado)),
        total: Math.round(tot.total_pagado),
        catalog_version: catalogVersionHash,
        pricing_engine: PRICING_ENGINE,
        expires_at: nuevaExpira,
        status: "open",
        ...(idem ? { idempotency_key: idem } : {}),
        ...(clientRef ? { client_ref: clientRef } : {}),
      });
    } catch (e) {
      console.warn("cotizaciones: reprice no se pudo guardar", e.message || e);
      warnings.push({
        code: "QUOTE_PERSIST_FAILED",
        message: "El recálculo no se pudo guardar.",
      });
    }

    return construirRespuestaVambeExito({
      eligible,
      quote_id: existing.id,
      expires_at: nuevaExpira,
      vehicle: vehiculo,
      items,
      suggested_addons: suggested,
      totales: tot,
      subtotal: tot.subtotal_lista,
      total: tot.total_pagado,
      warnings,
    });
  }

  if (action !== "quote") {
    return errorVambe(
      "INVALID_ACTION",
      "Acción no reconocida. Usa quote, reprice, reprice_add, reprice_remove o validate.",
      {}
    );
  }

  const vehErr = validarVehiculoVambeParaCotizar(body, scope);
  if (vehErr) return vehErr;
  const vehiculo = normalizarVehiculoVambe((body && body.vehicle) || body);
  if (!vehiculo) {
    return errorVambe("VEHICLE_REQUIRED", "Faltan datos del vehículo (marca, modelo y año).", { eligible: false, warnings: [] });
  }

  const { eligible, warnings: wElig } = vehiculoEligible(vehiculo);
  const codigos = parseServiceCodesVambe(body);
  if (!codigos.length) {
    return errorVambe("SERVICE_CODES_REQUIRED", "Indica al menos un código de servicio.", { warnings: wElig });
  }

  const { carrito, errores, warnings: wCart } = construirCarritoVambeDesdeCodigos(codigos, vehiculo);
  const warnings = [...(wElig || []), ...(wCart || [])];

  if (errores.length && !carrito.length) {
    const first = errores[0];
    return errorVambe("SERVICE_NOT_COMPATIBLE", first.error || "Servicio no aplicable.", {
      warnings,
    });
  }

  const carritoFiltrado = carrito.filter((l) => {
    const s = servicioPorId(l.id);
    return s && !errores.some((e) => e.id === s.id);
  });

  const tot = calcularCarrito(carritoFiltrado, vehiculo);
  const items = itemsVambeDesdeCarrito(carritoFiltrado, vehiculo);
  const suggested = addonsSugeridosVambe(carritoFiltrado, vehiculo);

  errores.forEach((e) => {
    warnings.push({
      code: "SERVICE_SKIPPED",
      message: e.error || "Servicio omitido",
      service_code: e.codigo,
    });
  });

  const expira = new Date(Date.now() + QUOTE_DEFAULT_TTL_MS).toISOString();
  const snap = {
    scope: scope || null,
    vehicle: {
      brand: vehiculo.marca,
      model: vehiculo.modelo,
      year: vehiculo.ano,
      fuel: vehiculo.combustible,
    },
    items,
    suggested_addons: suggested,
    service_codes: codigos,
    totales: tot,
    errores,
  };

  let quoteId = null;
  if (supabaseServiceKeyQuotes()) {
    try {
      const row = await upsertCotizacionSupabase({
        channel,
        vehicle_json: vehiculo,
        request_json: body || {},
        lines_json: { snapshot: snap, carrito: carritoFiltrado },
        subtotal: Math.round(tot.subtotal_lista),
        discount: Math.max(0, Math.round(tot.subtotal_lista - tot.total_pagado)),
        total: Math.round(tot.total_pagado),
        currency: "CLP",
        catalog_version: catalogVersionHash,
        pricing_engine: PRICING_ENGINE,
        expires_at: expira,
        status: "open",
        idempotency_key: idem || null,
        client_ref: clientRef || null,
      });
      quoteId = row && row.id ? row.id : null;
    } catch (e) {
      console.warn("cotizaciones: no se pudo guardar", e.message || e);
      warnings.push({
        code: "QUOTE_PERSIST_FAILED",
        message: "La cotización se calculó pero no se guardó en base de datos.",
      });
    }
  } else {
    warnings.push({
      code: "QUOTE_PERSIST_DISABLED",
      message: "Definí SUPABASE_SERVICE_ROLE_KEY en el servidor para guardar cotizaciones.",
    });
  }

  return construirRespuestaVambeExito({
    eligible,
    quote_id: quoteId,
    expires_at: expira,
    vehicle: vehiculo,
    items,
    suggested_addons: suggested,
    totales: tot,
    subtotal: tot.subtotal_lista,
    total: tot.total_pagado,
    warnings,
  });
}

async function ticketDesdeCotizacionVambe(body, enviarAutonexus) {
  await asegurarCatalogo();
  const quoteId = String((body && body.quote_id) || "").trim();
  const idem = String((body && body.idempotency_key) || "").trim();
  const channel = String((body && body.channel) || "vambe").trim() || "vambe";
  if (!quoteId) return { ok: false, error_code: "QUOTE_REQUIRED", message: "Falta quote_id." };

  if (idem && supabaseServiceKeyQuotes()) {
    const sameIdem = await leerCotizacionPorTicketIdem(channel, idem);
    if (sameIdem && sameIdem.id && sameIdem.id !== quoteId) {
      if (sameIdem.created_ticket_code) {
        return {
          ok: true,
          repeated: true,
          code: sameIdem.created_ticket_code,
          quote_id: sameIdem.id,
          message: "Misma clave de idempotencia: se devuelve el ticket ya creado.",
        };
      }
      return {
        ok: false,
        error_code: "TICKET_IDEMPOTENCY_CONFLICT",
        message: "Esa clave de idempotencia ya está en uso con otra cotización.",
        quote_id: quoteId,
      };
    }
  }

  const row = await leerCotizacionSupabase(quoteId);
  if (!row) return { ok: false, error_code: "QUOTE_NOT_FOUND", message: "Cotización no encontrada." };
  if (String(row.channel || "vambe") !== channel) {
    return {
      ok: false,
      error_code: "QUOTE_CHANNEL_MISMATCH",
      message: "El canal no coincide con la cotización.",
      quote_id: quoteId,
    };
  }
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : null;
  if (exp && Date.now() > exp) {
    return { ok: false, error_code: "QUOTE_EXPIRED", message: "La cotización expiró.", quote_id: quoteId };
  }
  if (row.catalog_version && catalogVersionHash && row.catalog_version !== catalogVersionHash) {
    return {
      ok: false,
      error_code: "QUOTE_STALE_CATALOG",
      message: "El catálogo cambió; vuelve a cotizar antes de crear el ticket.",
      quote_id: quoteId,
    };
  }
  if (row.status === "ticket_created" && row.created_ticket_code) {
    return {
      ok: true,
      repeated: true,
      code: row.created_ticket_code,
      quote_id: quoteId,
      message: "Ticket ya creado con esta cotización.",
    };
  }

  const snap = (row.lines_json && row.lines_json.snapshot) || {};
  const vehFromSnap = snap.vehicle || {};
  const vehStored = row.vehicle_json || {};
  const vehiculo = {
    marca: vehFromSnap.brand || vehFromSnap.marca || vehStored.marca,
    modelo: vehFromSnap.model || vehFromSnap.modelo || vehStored.modelo,
    ano: vehFromSnap.year != null ? vehFromSnap.year : vehFromSnap.ano != null ? vehFromSnap.ano : vehStored.ano,
    combustible: vehFromSnap.fuel || vehFromSnap.combustible || vehStored.combustible || "ambos",
  };
  if (!vehiculo.marca || !vehiculo.modelo || vehiculo.ano == null || !Number.isFinite(Number(vehiculo.ano))) {
    return {
      ok: false,
      error_code: "VEHICLE_INCOMPLETE",
      message: "La cotización no tiene datos de vehículo completos.",
      quote_id: quoteId,
    };
  }

  const carritoStored = (row.lines_json && row.lines_json.carrito) || [];
  const carritoFiltrado = (carritoStored || []).filter((l) => {
    const s = servicioPorId(l.id);
    if (!s) return false;
    const ap = servicioAplicaAVehiculo(s, vehiculo);
    return ap.aplica;
  });
  const esperadoItems = itemsVambeDesdeCarrito(carritoFiltrado, vehiculo);
  const totEsperado = calcularCarrito(carritoFiltrado, vehiculo);
  if (
    Math.round(totEsperado.subtotal_lista) !== Math.round(row.subtotal) ||
    Math.round(totEsperado.total_pagado) !== Math.round(row.total)
  ) {
    return {
      ok: false,
      error_code: "QUOTE_PRICE_MISMATCH",
      message: "Los precios ya no coinciden con la cotización guardada; vuelve a cotizar.",
      quote_id: quoteId,
    };
  }

  const contact = (body && body.contact) || {};
  const app = (body && body.appointment) || {};

  const payload = {
    origen: "vambe_quote",
    quote_id: quoteId,
    catalog_version: row.catalog_version,
    nombre_cliente: String(contact.name || "").trim(),
    telefono: String(contact.phone || "").trim(),
    patente: String(contact.plate || contact.patente || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase(),
    correo: String(contact.email || "").trim() || null,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    ano: vehiculo.ano,
    combustible: vehiculo.combustible || "ambos",
    fecha_cita: app.date || null,
    hora: app.time || null,
    servicios: esperadoItems.map((it) => ({
      nombre: it.name,
      precio: it.unit_price,
      cantidad: it.quantity || 1,
    })),
    subtotal: Math.round(totEsperado.subtotal_lista),
    total: Math.round(totEsperado.total_pagado),
    ahorro: Math.max(0, Math.round(totEsperado.subtotal_lista - totEsperado.total_pagado)),
    sintoma: String((body && body.notes) || "").trim() || null,
  };

  if (typeof enviarAutonexus !== "function") {
    return { ok: false, error_code: "INTERNAL", message: "No se pudo enviar el ticket." };
  }

  const out = await enviarAutonexus(payload);
  if (out.ok && out.code) {
    if (supabaseServiceKeyQuotes()) {
      try {
        await actualizarCotizacionSupabase(quoteId, {
          status: "ticket_created",
          created_ticket_code: out.code,
          created_ticket_payload: payload,
          ...(idem ? { ticket_idempotency_key: idem } : {}),
        });
      } catch (_e) {}
    }
  }
  return { ...out, quote_id: quoteId };
}

module.exports = {
  consultarPrecios,
  cotizarVambeInterno,
  ticketDesdeCotizacionVambe,
  quoteFlatBodyToInternal,
  ticketFlatBodyToInternal,
  tokenAsistenteValido,
  asegurarCatalogo,
  calcularCatalogVersionHash: () => catalogVersionHash,
};
