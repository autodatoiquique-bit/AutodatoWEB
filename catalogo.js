const CATALOGO_KEY = "autodato_catalogo";

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

async function cargarCatalogo() {
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeLeerCatalogo();
      if (remoto.length) {
        catalogo = remoto;
        return catalogo;
      }
    } catch (e) {
      console.warn("No se pudo leer el catálogo en la nube.", e);
    }
  }
  catalogo = hidratarCatalogo();
  return catalogo;
}

async function guardarCatalogo(lista) {
  catalogo = lista;
  localStorage.setItem(CATALOGO_KEY, JSON.stringify(lista));
  if (typeof nubeActiva === "function" && nubeActiva()) {
    await nubeGuardarCatalogo(lista);
  }
}

function servicioPorId(id) {
  return catalogo.find((s) => s.id === id);
}

function serviciosOferta() {
  return catalogo.filter((s) => s.tipo === "oferta" && s.activo !== false);
}

function serviciosDiagnostico() {
  return catalogo.filter((s) => s.tipo === "diagnostico" && s.activo !== false);
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
    (s.complementos || []).forEach((c) => {
      if (c.id === itemId && c.precioCombo != null) {
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
    btn_texto: "Agregar al carrito",
    btn_x: 50,
    btn_y: 72,
    orden: 0,
  },
];

let portadaSlides = [];

function normalizarSlide(s, i) {
  return {
    id: String((s && s.id) || `slide-${i}`),
    foto: String((s && s.foto) || ""),
    servicio_id: String((s && s.servicio_id) || ""),
    btn_texto: String((s && s.btn_texto) || "Agregar al carrito"),
    btn_x: Math.min(92, Math.max(8, Number(s && s.btn_x) || 50)),
    btn_y: Math.min(92, Math.max(8, Number(s && s.btn_y) || 72)),
    orden: Number(s && s.orden) || i,
  };
}

function slideVacio(orden) {
  return {
    id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    foto: "",
    servicio_id: "",
    btn_texto: "Agregar al carrito",
    btn_x: 50,
    btn_y: 72,
    orden: orden || 0,
  };
}

async function cargarPortada() {
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeLeerPortada();
      if (remoto.length) {
        portadaSlides = remoto.map(normalizarSlide).sort((a, b) => a.orden - b.orden);
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
      return portadaSlides;
    }
  } catch (e) {
    /* ignore */
  }
  portadaSlides = PORTADA_DEFECTO.map(normalizarSlide);
  return portadaSlides;
}

async function guardarPortada(lista) {
  portadaSlides = lista.map(normalizarSlide);
  localStorage.setItem(PORTADA_KEY, JSON.stringify(portadaSlides));
  if (typeof nubeActiva === "function" && nubeActiva()) {
    await nubeGuardarPortada(portadaSlides);
  }
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

function precioPagado(item, idsCarrito) {
  if (!item || item.precio == null) return { lista: null, pagado: null, ahorro: 0, regla: null };
  let pagado = item.precio;
  let regla = null;
  reglasComboDe(item.id).forEach((d) => {
    if (idsCarrito.includes(d.si) && d.precio < pagado) {
      pagado = d.precio;
      regla = d;
    }
  });
  return { lista: item.precio, pagado, ahorro: item.precio - pagado, regla };
}

