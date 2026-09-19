const CATALOGO_KEY = "autodato_catalogo";

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
let MODELOS_EXTRA = {};

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
        const d = Number(v.ano_desde);
        const h = Number(v.ano_hasta);
        ano_desde = Number.isFinite(d) ? d : null;
        ano_hasta = Number.isFinite(h) ? h : null;
      }
      if (!marca) return null;
      return { marca, modelo: modelo || "*", ano_desde, ano_hasta };
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
  const destinos = normalizarVehiculos(s && s.vehiculos);
  if (!destinos.length) return true;
  if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) return true;
  return destinos.some((v) => {
    if (v.marca !== vehiculo.marca) return false;
    if (v.modelo !== "*" && v.modelo !== vehiculo.modelo) return false;
    return anioEnRango(vehiculo.ano, v);
  });
}

function etiquetaVehiculos(s) {
  const destinos = normalizarVehiculos(s && s.vehiculos);
  if (!destinos.length) return "Todos los vehículos";
  return destinos
    .map((v) => {
      const modelo = v.modelo === "*" ? "todos los modelos" : v.modelo;
      return `${v.marca} ${modelo} · ${etiquetaRangoAnios(v)}`;
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
    detalle: "Precio de lista $90.000. Si ya tienes descarbonización en el carrito, baja a $50.000.",
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

function normalizarServicio(s) {
  const canales = normalizarCanales(s && s.canales, s && s.tipo);
  const base = {
    ...s,
    canales,
    tipo: (s && s.tipo) || tipoDesdeCanales(canales),
    tiene_oferta: tieneOferta(s),
    oferta_combo: s && (s.oferta_combo === true || s.oferta_combo === "si" || (s.oferta_combo == null && (s.complementos || []).length > 0)),
    precio_oferta: precioOfertaDe({ ...s, tiene_oferta: tieneOferta(s) }),
    vehiculos: normalizarVehiculos(s && s.vehiculos),
    dots_x: clampNum(s && s.dots_x, 6, 94, 50),
    dots_y: clampNum(s && s.dots_y, 6, 94, 62),
  };
  return aplicarMediaServicio(base, mediaServicio(base));
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
  if (c.ofertas) partes.push("Ofertas");
  if (c.mantencion) partes.push("Mantención");
  if (c.diagnostico) partes.push("Diagnóstico");
  return partes.join(" · ") || "Sin menú";
}

async function cargarCatalogo() {
  hidratarModelosExtra();
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeLeerCatalogo();
      if (remoto.length) {
        catalogo = remoto.map(normalizarServicio);
        recolectarModelosExtra(catalogo);
        persistirModelosExtra();
        return catalogo;
      }
    } catch (e) {
      console.warn("No se pudo leer el catálogo en la nube.", e);
    }
  }
  catalogo = hidratarCatalogo().map(normalizarServicio);
  recolectarModelosExtra(catalogo);
  persistirModelosExtra();
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
    btn_texto: "Agregar al carrito",
    btn_x: 50,
    btn_y: 62,
    zoom: 1,
    pos_x: 50,
    pos_y: 50,
    orden: 0,
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
};

function clampNum(n, min, max, def) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

function normalizarUi(s) {
  return {
    dir_x: clampNum(s && s.dir_x, 6, 94, 50),
    dir_y: clampNum(s && s.dir_y, 6, 94, 76),
    wa_x: clampNum(s && s.wa_x, 6, 94, 50),
    wa_y: clampNum(s && s.wa_y, 6, 94, 84),
    dots_x: clampNum(s && s.dots_x, 6, 94, 50),
    dots_y: clampNum(s && s.dots_y, 6, 94, 68),
    logo: String((s && s.logo) || LOGO_DEFECTO),
    logo_zoom: clampNum(s && s.logo_zoom, 0.3, 3, 1),
    logo_scale_x: clampNum(s && s.logo_scale_x, 0.3, 3, 1),
    logo_scale_y: clampNum(s && s.logo_scale_y, 0.3, 3, 1),
    logo_off_x: clampNum(s && s.logo_off_x, -120, 120, 0),
    logo_off_y: clampNum(s && s.logo_off_y, -120, 120, 0),
  };
}

function logoHref() {
  return (portadaUi && portadaUi.logo) || LOGO_DEFECTO;
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
}

function normalizarSlide(s, i) {
  const servicio = String((s && s.servicio_id) || "");
  const botonRaw = s && s.mostrar_boton;
  return {
    id: String((s && s.id) || `slide-${i}`),
    foto: String((s && s.foto) || ""),
    servicio_id: servicio,
    mostrar_boton: botonRaw == null ? Boolean(servicio) : botonRaw === true || botonRaw === "true",
    btn_texto: String((s && s.btn_texto) || "Agregar al carrito"),
    btn_x: clampNum(s && s.btn_x, 8, 92, 50),
    btn_y: clampNum(s && s.btn_y, 8, 92, 55),
    zoom: clampNum(s && s.zoom, 0.35, 4, 1),
    scale_x: clampNum(s && s.scale_x, 0.4, 3, 1),
    scale_y: clampNum(s && s.scale_y, 0.4, 3, 1),
    off_x: clampNum(s && s.off_x, -160, 160, 0),
    off_y: clampNum(s && s.off_y, -160, 160, 0),
    orden: Number(s && s.orden) || i,
    ...normalizarUi(s),
  };
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
  return `
    <a class="home-pill home-dir" href="${mapsHref()}" target="_blank" rel="noopener" style="left:${ui.dir_x}%;top:${ui.dir_y}%"${drag("dir")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2" fill="#111"/></svg>
      ${leerTaller().direccion}
    </a>
    <a class="home-pill home-wa" href="${waHref()}" target="_blank" rel="noopener" style="left:${ui.wa_x}%;top:${ui.wa_y}%"${drag("wa")}>
      <span class="wa-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path fill="#25D366" d="M12 2a10 10 0 0 0-8.7 14.8L2 22l5.3-1.3A10 10 0 1 0 12 2z"/>
          <path fill="#fff" d="M16.4 14.1c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.4.1-.3c0-.1 0-.3 0-.4s-.5-1.3-.7-1.8-.4-.4-.5-.4h-.4c-.1 0-.4.1-.6.3s-.8.8-.8 1.9.8 2.2.9 2.4 1.6 2.6 4 3.5c.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.4-.6 1.6-1.1s.2-1 .1-1.1-.2-.2-.4-.3z"/>
        </svg>
      </span>
      WhatsApp ${waMostrar()}
    </a>
    ${dots}`;
}

async function cargarPortada() {
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeLeerPortada();
      if (remoto.length) {
        portadaSlides = remoto.map(normalizarSlide).sort((a, b) => a.orden - b.orden);
        if (portadaSlides[0]) portadaUi = normalizarUi(portadaSlides[0]);
        return portadaSlides;
      }
    } catch (e) {
      console.warn("No se pudo leer la portada en la nube.", e);
    }
  }
  try {
    const raw = JSON.parse(localStorage.getItem(PORTADA_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      portadaSlides = raw.map(normalizarSlide);
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

async function guardarPortada(lista) {
  const ui = normalizarUi(portadaUi);
  portadaUi = ui;
  portadaSlides = lista.map((s, i) => normalizarSlide({ ...s, ...ui, orden: i }, i));
  localStorage.setItem(PORTADA_KEY, JSON.stringify(portadaSlides));
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

