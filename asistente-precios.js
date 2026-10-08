/**
 * Catálogo + precios para webhook del asistente WhatsApp (Node).
 * POST /api/asistente/consultar-precios
 */
"use strict";

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

function precioPagado(item, idsCarrito) {
  if (!item || item.precio == null) return { lista: null, pagado: null, ahorro: 0, regla: null };
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
  return { lista, pagado, ahorro: Math.max(0, lista - pagado), regla };
}

function nombreServicioDe(id) {
  const s = servicioPorId(id);
  return (s && s.nombre) || String(id || "");
}

function preciosPackCombo(s) {
  const ids = comboItemsDe(s);
  let lista = 0;
  let pagado = 0;
  const lineas = [];
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

function calcularCarrito(carrito) {
  const items = [];
  let subtotal = 0;
  let total = 0;
  let ahorro = 0;
  carrito.forEach((linea) => {
    if (linea.tipo !== "oferta") return;
    if (linea.esComboLinea) {
      const combo = servicioPorId(linea.id);
      if (!combo || !esServicioCombo(combo)) return;
      const pack = preciosPackCombo(combo);
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
    const p = precioPagado(s, otros);
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

  const [rows, comps, extra] = await Promise.all([
    fetchJson(`${base}/rest/v1/servicios?select=*&order=nombre.asc`, headers),
    fetchJson(`${base}/rest/v1/complementos?select=*`, headers),
    fetchJson(`${base}/storage/v1/object/public/servicios/catalogo-canales.json?t=${Date.now()}`, {}).catch(
      () => null
    ),
  ]);

  tableroColumnas = Array.isArray(extra && extra._tablero_columnas)
    ? extra._tablero_columnas.map(normalizarColumnaTablero).filter(Boolean)
    : [];

  catalogo = (rows || [])
    .map((row) => {
      let s = filaAServicio(row, comps || []);
      const ex = extra && extra[s.id] ? extra[s.id] : null;
      s = fusionarExtraEnServicio(s, ex);
      return s;
    })
    .filter((s) => s.activo !== false);

  cacheTs = Date.now();
  return catalogo;
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
    const pack = preciosPackCombo(s);
    lista = pack.lista;
    pagado = pack.pagado;
    ahorro = pack.ahorro;
  } else {
    const p = precioPagado(s, idsCarritoContexto || []);
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

  const tot = calcularCarrito(carrito.filter((l) => lineas.some((x) => x.id === l.id)));

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

module.exports = {
  consultarPrecios,
  tokenAsistenteValido,
  asegurarCatalogo,
};
