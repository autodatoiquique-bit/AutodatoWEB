/**
 * Panel admin: módulo Aprobados AutoDato (ficha tipo vitrina / Checkeados).
 */
"use strict";

let aprobadosCache = [];
/** @type {object|null} */
let aprobadoEditando = null;

const INFORME_PRESETS_APROBADO = [
  {
    key: "carroceria_estetica",
    label: "Carrocería y detalles estéticos",
    opciones: [
      {
        titulo: "Pintura e interiores excelentes",
        texto:
          "Pintura general en óptimo estado; paneles alineados de fábrica, sin abolladuras ni desgaste prematuro en tapicería.",
      },
      {
        titulo: "Detalles estéticos menores",
        texto:
          "Microrrayones superficiales por lavado o gravilla; parachoque delantero o trasero con leves marcas de uso cotidiano.",
      },
      {
        titulo: "Repintado parcial identificado",
        texto:
          "Se detecta repintado cosmético en panel lateral/puerta; trabajo bien terminado, sin diferencias de tonalidad evidentes.",
      },
      {
        titulo: "Desgaste visible / Toques de estacionamiento",
        texto:
          "Rayones en parachoques o abolladuras menores visibles en puertas; no compromete sellado ni apertura.",
      },
    ],
  },
  {
    key: "chasis_bajos",
    label: "Estado del chasis y bajos (óxido / estructura)",
    opciones: [
      {
        titulo: "Chasis sano y libre de corrosión",
        texto:
          "Bajos completamente limpios y secos; largueros, compactos y pisos libres de óxido estructural, salitre o golpes.",
      },
      {
        titulo: "Óxido superficial leve (normal de acopio)",
        texto:
          "Leve pátina de óxido superficial en masa de discos o silenciador de escape; estructura y puntos de anclaje totalmente sanos.",
      },
      {
        titulo: "Presencia de salitre costero",
        texto:
          "Salitre y corrosión superficial en tornillería y soportes inferiores; largueros íntegros, sin perforaciones ni debilidad de lámina.",
      },
      {
        titulo: "Corrosión severa / Observación crítica",
        texto:
          "Óxido avanzado con desprendimiento de escamas en pasos de rueda o anclajes de suspensión; requiere tratamiento o descarte.",
      },
    ],
  },
  {
    key: "suspension",
    label: "Suspensión",
    opciones: [
      {
        titulo: "Sin observaciones / Firme",
        texto: "Amortiguadores y bujes en excelente estado, sin rebotes excesivos ni ruidos parásitos en baches.",
      },
      {
        titulo: "Detalle leve / Desgaste normal",
        texto: "Bieletas o bujes de barra estabilizadora con leve juego; amortiguadores operativos sin fugas.",
      },
      {
        titulo: "Mantención sugerida",
        texto:
          "Amortiguadores delanteros con pérdida de eficacia o fatiga de cazoletas; se aconseja recambio preventivo.",
      },
      {
        titulo: "Observación crítica",
        texto: "Fuga de aceite visible en amortiguador / bujes de bandeja rotos; requiere sustitución antes de circular.",
      },
    ],
  },
  {
    key: "direccion",
    label: "Dirección",
    opciones: [
      {
        titulo: "Precisa y sin holguras",
        texto: "Alineación correcta, volante centrado, respuesta inmediata sin ruidos en cremallera ni crucetas.",
      },
      {
        titulo: "Juego leve / Desalineado",
        texto: "Dirección tira levemente hacia un costado; requiere alineación y balanceo preventivo.",
      },
      {
        titulo: "Holgura en columna (típico cambio volante)",
        texto: "Leve juego mecánico en cruceta o eje intermedio; cremallera operativa sin pérdida de asistencia.",
      },
      {
        titulo: "Falla en asistencia / Golpe seco",
        texto: "Cremallera con ruido metálico al doblar o asistencia EPS con endurecimiento intermitente.",
      },
    ],
  },
  {
    key: "frenos",
    label: "Frenos",
    opciones: [
      {
        titulo: "Óptimos al 100%",
        texto: "Frenado recto y firme; pastillas con más del 70% de vida útil y discos sin ceja ni alabeo.",
      },
      {
        titulo: "Desgaste intermedio",
        texto: "Pastillas con 30-40% de vida útil restante; discos con desgaste parejo, sin vibraciones al pedal.",
      },
      {
        titulo: "Alabeo / Vibración",
        texto:
          "Vibración leve en pedal de freno a alta velocidad; se aconseja rectificado o cambio de discos delanteros.",
      },
      {
        titulo: "Requiere mantención inmediata",
        texto: "Pastillas al límite / pedal esponjoso con bajo nivel de líquido; requiere servicio completo de frenos.",
      },
    ],
  },
  {
    key: "motor",
    label: "Motor",
    opciones: [
      {
        titulo: "Impecable y hermético",
        texto: "Ralentí estable, sin ruidos de distribución en frío ni fugas de aceite o refrigerante visibles.",
      },
      {
        titulo: "Resudación leve",
        texto:
          "Pequeña resudación de aceite en empaquetadura de tapa de válvulas o manguera de turbo; nivel y compresión estables.",
      },
      {
        titulo: "Carbonización detectable",
        texto:
          "Arranque y ralentí normales; se aprecia acumulación habitual de carbonilla en múltiple de admisión por kilometraje.",
      },
      {
        titulo: "Detalle mecánico",
        texto: "Ruido de cadena o correa de accesorios en frío / resudación en retén; requiere inspección en elevador.",
      },
    ],
  },
  {
    key: "escaner_automotriz",
    label: "Escáner automotriz",
    opciones: [
      {
        titulo: "Limpio / 0 códigos DTC",
        texto:
          "Barrido general sin códigos de falla en ECM, TCM ni ABS; kilometraje en ECU coincide con tablero.",
      },
      {
        titulo: "DPF e inyección en verde",
        texto: "Parámetros de DPF óptimos (baja contrapresión), inyectores en rango y odómetro real verificado.",
      },
      {
        titulo: "Códigos históricos leves",
        texto:
          "Sin fallas activas; registra códigos históricos no graves (baja tensión de batería en tránsito) ya resueltos.",
      },
      {
        titulo: "Falla electrónica detectada",
        texto:
          "Presencia de DTC activo en sistema de inyección / postratamiento; no califica para sello verde.",
      },
    ],
  },
  {
    key: "desempeno_ruta",
    label: "Desempeño en ruta",
    opciones: [
      {
        titulo: "Excelente respuesta",
        texto: "Aceleración lineal, caja de cambios con acoples suaves sin patinamiento ni tirones térmicos.",
      },
      {
        titulo: "Comportamiento normal",
        texto: "Desplazamiento estable; escalonamiento de marchas correcto a temperatura de régimen de servicio.",
      },
      {
        titulo: "Leve retardo / Vibración",
        texto: "Transmisión con acople algo perezoso en pendientes; se sugiere cambio de fluido ATF/CVT preventivo.",
      },
      {
        titulo: "Anomalía en caliente",
        texto: "Tirones perceptibles en aceleración o temperatura sobre el promedio; requiere diagnóstico en taller.",
      },
    ],
  },
  {
    key: "conclusion",
    label: "Conclusión",
    opciones: [
      {
        titulo: "Aprobado sobresaliente",
        texto:
          "Vehículo en óptimas condiciones mecánicas y estructurales. Kilometraje real comprobado, electrónica impecable y apto para uso inmediato sin reparaciones.",
      },
      {
        titulo: "Aprobado con mantención preventiva",
        texto:
          "Vehículo mecánicamente sano y sin vicios ocultos graves. Recomendado para compra, programando su mantención básica de fluidos y filtros de rigor.",
      },
      {
        titulo: "Aprobado condicionado (oportunidad por precio)",
        texto:
          "Mecánica base en buen estado, pero con detalles de desgaste habitual que deben subsanarse en el corto plazo para asegurar su durabilidad.",
      },
      {
        titulo: "Rechazado AutoDato",
        texto:
          "Unidad no califica para sello de certificación técnica debido a fallas activas en tren motriz o discrepancias en sus parámetros electrónicos.",
      },
    ],
  },
];

function informeIdTextoAprobado(key) {
  return `aprobado-inf-${key}`;
}

function informeIdSelectAprobado(key) {
  return `aprobado-inf-${key}-sel`;
}

function indicePresetInformePorTexto(opciones, valor) {
  const t = String(valor || "").trim();
  if (!t) return "";
  const i = opciones.findIndex((o) => o.texto.trim() === t);
  if (i >= 0) return String(i);
  const j = opciones.findIndex((o) => t.startsWith(o.titulo));
  return j >= 0 ? String(j) : "";
}

function htmlCampoInformePreset(campo, valorGuardado) {
  const val = String(valorGuardado || "");
  const selIdx = indicePresetInformePorTexto(campo.opciones, val);
  const idText = informeIdTextoAprobado(campo.key);
  const idSel = informeIdSelectAprobado(campo.key);
  const opts = campo.opciones
    .map(
      (o, i) =>
        `<option value="${i}"${selIdx === String(i) ? " selected" : ""}>${escapeText(o.titulo)}</option>`
    )
    .join("");
  return `
    <div class="aprobado-informe-campo" data-informe-campo="${escapeAttr(campo.key)}">
      <label class="field aprobado-field-span2">
        <span>${escapeText(campo.label)}</span>
        <select id="${escapeAttr(idSel)}" class="aprobado-inf-preset" data-informe-key="${escapeAttr(campo.key)}">
          <option value="">— Plantilla rápida (opcional) —</option>
          ${opts}
        </select>
      </label>
      <label class="field aprobado-field-span2 aprobado-informe-texto">
        <span>Texto publicado</span>
        <textarea id="${escapeAttr(idText)}" rows="2" placeholder="Escribe o elige plantilla arriba">${escapeText(
    val
  )}</textarea>
      </label>
    </div>`;
}

function activarPresetsInformeAprobado() {
  INFORME_PRESETS_APROBADO.forEach((campo) => {
    const sel = $(informeIdSelectAprobado(campo.key));
    const ta = $(informeIdTextoAprobado(campo.key));
    if (!sel || !ta || sel.dataset.presetOn === "1") return;
    sel.dataset.presetOn = "1";
    sel.addEventListener("change", () => {
      const idx = sel.value;
      if (idx === "") return;
      const op = campo.opciones[Number(idx)];
      if (op) ta.value = op.texto;
    });
  });
}

const APROBADOS_ESTADOS = [
  { v: "borrador", label: "Borrador" },
  { v: "en_revision", label: "En revisión" },
  { v: "aprobado", label: "Aprobado" },
  { v: "rechazado", label: "Rechazado" },
  { v: "vencido", label: "Vencido" },
];

const APROBADO_OPCIONES = {
  carroceria: ["SUV", "Sedán", "Hatchback", "Pickup", "Van", "Coupé", "Otro"],
  transmision: ["Automático", "Manual", "CVT", "Otro"],
  combustible: ["Bencina", "Diésel", "Híbrido", "Eléctrico", "Otro"],
  traccion: ["4x4 / AWD", "4x2", "Delantera", "Trasera", "—"],
};

function aprobadoVacio() {
  return {
    id: "",
    public_slug: "",
    marca: "",
    modelo: "",
    version: "",
    ano: null,
    patente: "",
    color: "",
    carroceria: "",
    transmision: "",
    combustible: "",
    traccion: "",
    cilindrada: "",
    modelo_motor: "",
    numero_chasis: "",
    airbags: null,
    asientos: null,
    duenos: null,
    folio: null,
    vendedor_nombre: "",
    vendedor_telefono: "",
    whatsapp_contacto: "",
    kilometraje: null,
    kilometraje_tablero: null,
    kilometraje_real: null,
    precio_referencia: null,
    precio_financiado: null,
    cuota_referencia: null,
    ahorro_referencia: null,
    garantia_vendedor: false,
    origen: "",
    ubicacion_nombre: "",
    ubicacion_direccion: "",
    ubicacion_maps: "",
    descripcion: "",
    equipamiento: [],
    video_url: "",
    estado: "borrador",
    notas_internas: "",
    foto_portada: "",
    galeria: [],
    detalles_esteticos: [],
    informe: {
      escaner_imagenes: [],
      informe_pdf: "",
      carroceria_estetica: "",
      chasis_bajos: "",
      suspension: "",
      direccion: "",
      frenos: "",
      motor: "",
      escaner_automotriz: "",
      desempeno_ruta: "",
      conclusion: "",
      observaciones_tecnicas: "",
      mapa_imagen: "",
      mapa_off_x: 0,
      mapa_off_y: 0,
      mapa_zoom: 1,
    },
    aprobado_at: null,
    vigente_hasta: null,
  };
}

function clonarAprobado(v) {
  const base = aprobadoVacio();
  if (!v) return base;
  return {
    ...base,
    ...v,
    galeria: Array.isArray(v.galeria) ? v.galeria.map((x) => ({ ...x })) : [],
    detalles_esteticos: Array.isArray(v.detalles_esteticos) ? v.detalles_esteticos.map((x) => ({ ...x })) : [],
    informe: {
      ...base.informe,
      ...(v.informe && typeof v.informe === "object" ? v.informe : {}),
      escaner_imagenes: Array.isArray(v.informe && v.informe.escaner_imagenes)
        ? v.informe.escaner_imagenes.map((x) => (typeof x === "string" ? { url: x } : { ...x }))
        : [],
      mapa_imagen: String((v.informe && v.informe.mapa_imagen) || "").trim(),
      mapa_off_x: Number(v.informe && v.informe.mapa_off_x) || 0,
      mapa_off_y: Number(v.informe && v.informe.mapa_off_y) || 0,
      mapa_zoom: Number(v.informe && v.informe.mapa_zoom) > 0 ? Number(v.informe.mapa_zoom) : 1,
    },
  };
}

function datosMapaPantallazoAprobado(inf) {
  const i = inf && typeof inf === "object" ? inf : {};
  return {
    url: String(i.mapa_imagen || "").trim(),
    off_x: Math.min(160, Math.max(-160, Number(i.mapa_off_x) || 0)),
    off_y: Math.min(160, Math.max(-160, Number(i.mapa_off_y) || 0)),
    zoom: Math.min(3, Math.max(0.5, Number(i.mapa_zoom) || 1)),
  };
}

function transformMapaPantallazoCss(m) {
  const z = m.zoom;
  const ox = m.off_x;
  const oy = m.off_y;
  return `translate(-50%,-50%) translate(${ox}%,${oy}%) scale(${z})`;
}

function htmlMapaPantallazoEditor(inf) {
  const m = datosMapaPantallazoAprobado(inf);
  const vacio = !m.url;
  return `
    <div class="aprobado-mapa-pantalla" id="aprobado-mapa-pantalla">
      <p class="muted aprobado-hint">Impr Pant en el PC y luego <strong>Ctrl+V</strong> sobre el marco, arrastra una imagen, o usa el botón. Ajusta posición y zoom.</p>
      <div class="aprobado-media-acciones">
        <button type="button" class="btn-line" id="btn-aprobado-subir-mapa-shot">Subir pantallazo del mapa</button>
        ${m.url ? `<button type="button" class="btn-soft" id="btn-aprobado-quitar-mapa-shot">Quitar pantallazo</button>` : ""}
      </div>
      <p class="muted aprobado-mapa-monitor-tag">Vista previa del comprador (mismas medidas que el celular)</p>
      <div class="aprobado-mapa-sim${vacio ? " is-vacio" : ""}" id="aprobado-mapa-sim" tabindex="0" role="button" aria-label="Pegar pantallazo del mapa con Ctrl+V">
        <div class="aprobados-maps-tap aprobado-mapa-wysiwyg" aria-hidden="${vacio ? "true" : "false"}">
          <span class="aprobados-maps-preview aprobados-maps-shot">
            <span class="aprobados-maps-lienzo" id="aprobado-mapa-lienzo">
              ${
                m.url
                  ? `<img class="aprobados-maps-shot-img" id="aprobado-mapa-img" src="${escapeAttr(
                      m.url
                    )}" alt="" style="transform:${transformMapaPantallazoCss(m)}" draggable="false" />`
                  : `<span class="aprobado-mapa-vacio muted">Clic aquí y pega (Ctrl+V)</span>`
              }
            </span>
            <span class="aprobados-maps-cta">Toca para abrir en Maps</span>
          </span>
        </div>
      </div>
      <label class="field aprobado-mapa-zoom-field" ${vacio ? "hidden" : ""}>
        <span>Zoom del pantallazo</span>
        <input id="aprobado-mapa-zoom" type="range" min="50" max="300" step="2" value="${Math.round(m.zoom * 100)}" />
      </label>
    </div>`;
}

function tituloVehiculoAprobado(v) {
  if (!v) return "—";
  const ver = v.version ? ` ${v.version}` : "";
  const parts = [`${v.marca || ""} ${v.modelo || ""}${ver}`.trim(), v.ano].filter((x) => x != null && String(x).trim() !== "");
  return parts.length ? parts.join(" ") : "Sin datos";
}

function etiquetaEstadoAprobado(estado) {
  const e = APROBADOS_ESTADOS.find((x) => x.v === estado);
  return (e && e.label) || String(estado || "—");
}

function claseTagEstadoAprobado(estado) {
  const m = {
    borrador: "tag-aprobado-borrador",
    en_revision: "tag-aprobado-revision",
    aprobado: "tag-aprobado-ok",
    rechazado: "tag-aprobado-rechazado",
    vencido: "tag-aprobado-vencido",
  };
  return `tag ${m[estado] || "tag-aprobado-borrador"}`;
}

function portadaAprobado(v) {
  if (v.foto_portada) return v.foto_portada;
  if (v.galeria && v.galeria.length && v.galeria[0].url) return v.galeria[0].url;
  return "";
}

function leerEquipamientoChecklistDesdeDom() {
  const ids = [];
  document.querySelectorAll("[data-aprobado-equip]:checked").forEach((el) => {
    const id = String(el.getAttribute("data-aprobado-equip") || "").trim();
    if (id) ids.push(id);
  });
  return ids;
}

function marcarTodoEquipamientoAprobado(marcar) {
  const root = $("aprobado-equip-checklist");
  if (!root) return;
  root.querySelectorAll("[data-aprobado-equip]").forEach((el) => {
    el.checked = Boolean(marcar);
  });
}

function htmlEditorEquipamientoAprobado(v) {
  const sel = idsEquipamientoAprobadoSet(v && v.equipamiento);
  return `<div class="aprobado-equip-checklist" id="aprobado-equip-checklist">
    <div class="aprobado-equip-toolbar">
      <p class="muted aprobado-hint aprobado-equip-hint">Marca lo que trae el auto. En la vitrina solo se muestran los ítems seleccionados.</p>
      <div class="aprobado-equip-toolbar-acciones">
        <button type="button" class="btn-line" id="btn-aprobado-equip-todo">Marcar todo</button>
        <button type="button" class="btn-line" id="btn-aprobado-equip-ninguno">Desmarcar todo</button>
      </div>
    </div>
    ${APROBADO_EQUIPAMIENTO_CATALOGO.map(
      (cat) => `
      <fieldset class="aprobado-equip-grupo">
        <legend>${escapeText(cat.titulo)}</legend>
        <div class="aprobado-equip-grid">
          ${cat.items
            .map(
              (it) => `<label class="aprobado-equip-item">
            <input type="checkbox" data-aprobado-equip="${escapeAttr(it.id)}"${sel.has(it.id) ? " checked" : ""} />
            <span>${escapeText(it.label)}</span>
          </label>`
            )
            .join("")}
        </div>
      </fieldset>`
    ).join("")}
  </div>`;
}

function htmlSelectOpciones(opciones, valor, vacio) {
  const val = String(valor || "");
  let html = vacio ? `<option value="">${vacio}</option>` : "";
  opciones.forEach((o) => {
    html += `<option value="${escapeAttr(o)}"${val === o ? " selected" : ""}>${escapeText(o)}</option>`;
  });
  return html;
}

function urlVistaPublicaAprobado(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    const base = window.location.origin.replace(/\/admin\.html.*$/i, "");
    return `${base}/aprobado/${encodeURIComponent(s)}`;
  }
  return `https://autodato.cl/aprobado/${encodeURIComponent(s)}`;
}

function abrirVistaPublicaAprobado() {
  const slug = aprobadoEditando && aprobadoEditando.public_slug ? aprobadoEditando.public_slug : "";
  const url = urlVistaPublicaAprobado(slug);
  if (!url) {
    alert("Guarda la ficha primero para generar el enlace del QR.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function htmlCardAprobado(v) {
  const precio =
    v.precio_referencia != null && typeof clp === "function"
      ? clp(v.precio_referencia)
      : v.precio_referencia != null
        ? String(v.precio_referencia)
        : "—";
  const foto = portadaAprobado(v);
  return `<button type="button" class="aprobado-card" data-abrir-aprobado="${escapeAttr(v.id)}">
    ${foto ? `<span class="aprobado-card-foto"><img src="${escapeAttr(foto)}" alt="" loading="lazy" /></span>` : ""}
    <span class="${claseTagEstadoAprobado(v.estado)}">${escapeText(etiquetaEstadoAprobado(v.estado))}</span>
    ${v.folio != null ? `<span class="aprobado-folio-tag">Folio ${escapeText(String(v.folio))}</span>` : ""}
    <strong>${escapeText(tituloVehiculoAprobado(v))}</strong>
    <span class="aprobado-card-meta">${escapeText(v.patente || "Sin patente")} · ref. ${escapeText(precio)}</span>
    ${v.vendedor_nombre ? `<span class="aprobado-card-vendedor">${escapeText(v.vendedor_nombre)}</span>` : ""}
  </button>`;
}

function htmlMenuGaleriaBtnAprobado(i) {
  return `<button
      type="button"
      class="aprobado-thumb-menu-btn"
      data-aprobado-menu-toggle
      data-aprobado-idx="${i}"
      aria-label="Opciones de foto"
      aria-expanded="false"
    ><span class="aprobado-thumb-menu-chevron" aria-hidden="true">▾</span></button>`;
}

function htmlMenuGaleriaPanelAprobado(i, esPortada) {
  return `<div class="aprobado-thumb-menu" data-aprobado-menu data-aprobado-idx="${i}" hidden>
      <button type="button" data-aprobado-portada data-aprobado-idx="${i}"${esPortada ? " disabled" : ""}>${
    esPortada ? "Ya es portada" : "Dejar como foto de portada"
  }</button>
      <button type="button" data-aprobado-quitar="galeria" data-aprobado-idx="${i}">Eliminar</button>
    </div>`;
}

function htmlThumbGrid(items, tipo) {
  if (!items.length) {
    return `<p class="muted aprobado-media-vacio">Sin imágenes aún.</p>`;
  }
  return `<div class="aprobado-thumb-grid" data-aprobado-grid="${escapeAttr(tipo)}">
    ${items
      .map((it, i) => {
        const url = String((it && it.url) || "");
        const cap = tipo === "estetica" ? String((it && it.caption) || "") : "";
        const esPortada = tipo === "galeria" && i === 0;
        return `<div class="aprobado-thumb${esPortada ? " is-portada" : ""}" data-aprobado-thumb="${tipo}" data-aprobado-idx="${i}">
          <div class="aprobado-thumb-media">
            <img src="${escapeAttr(url)}" alt="" />
            ${esPortada ? `<span class="aprobado-thumb-portada-tag">Portada</span>` : ""}
            ${
              tipo === "galeria"
                ? htmlMenuGaleriaBtnAprobado(i)
                : `<button type="button" class="aprobado-thumb-quitar" data-aprobado-quitar="${tipo}" data-aprobado-idx="${i}" title="Quitar">×</button>`
            }
          </div>
          ${tipo === "galeria" ? htmlMenuGaleriaPanelAprobado(i, esPortada) : ""}
          ${
            tipo === "estetica"
              ? `<input type="text" class="aprobado-thumb-caption" data-aprobado-caption="${i}" value="${escapeAttr(
                  cap
                )}" placeholder="Qué se ve (ej. rayón paragolpes)" />`
              : ""
          }
        </div>`;
      })
      .join("")}
  </div>`;
}

function htmlEditorAprobado() {
  const v = aprobadoEditando || aprobadoVacio();
  const inf = v.informe || {};
  const titulo = v.id ? "Editar ficha" : "Nuevo vehículo aprobado";
  const folioTxt = v.folio != null ? `Folio ${v.folio}` : "Folio: se asigna al guardar";
  const slugTxt = v.public_slug
    ? urlVistaPublicaAprobado(v.public_slug)
    : "Guarda para generar enlace público y QR.";
  const kmTab =
    v.kilometraje_tablero != null
      ? v.kilometraje_tablero
      : v.kilometraje != null
        ? v.kilometraje
        : null;
  const kmReal = v.kilometraje_real != null ? v.kilometraje_real : null;
  const puedeQr = Boolean(v.public_slug);

  return `
    <div class="admin-panel admin-panel-aprobados aprobado-editor">
      <div class="aprobado-editor-sticky">
        <div class="aprobado-editor-sticky-izq">
          <button type="button" class="btn-soft btn-back-aprobado" id="btn-aprobado-volver">← Listado</button>
          <div class="aprobado-editor-titulos">
            <h2>${escapeText(titulo)}</h2>
            <p class="aprobado-editor-meta">
              <span class="aprobado-folio-pill">${escapeText(folioTxt)}</span>
              <span class="muted aprobado-slug-mini">${escapeText(slugTxt)}</span>
            </p>
          </div>
        </div>
        <div class="admin-panel-top-acciones aprobado-editor-acciones">
          <button class="btn-soft" type="button" id="btn-aprobado-ver-qr" ${puedeQr ? "" : "disabled"} title="Vista comprador (próxima etapa)">VER QR</button>
          <button class="btn-primary" type="button" id="btn-aprobado-guardar">Guardar</button>
        </div>
      </div>

      <div class="aprobado-editor-columns">
      <div class="aprobado-editor-col">

      <section class="aprobado-seccion">
        <h3>Identificación (vitrina)</h3>
        <div class="aprobado-form-grid">
          <label class="field"><span>Marca</span><input id="aprobado-marca" type="text" value="${escapeAttr(v.marca)}" placeholder="Mazda" /></label>
          <label class="field"><span>Modelo</span><input id="aprobado-modelo" type="text" value="${escapeAttr(v.modelo)}" placeholder="CX-3" /></label>
          <label class="field aprobado-field-span2"><span>Versión / motor (título largo)</span><input id="aprobado-version" type="text" value="${escapeAttr(v.version)}" placeholder="2.0L AT 4X4" /></label>
          <label class="field"><span>Año</span><input id="aprobado-ano" type="number" min="1980" max="2099" value="${v.ano != null ? escapeAttr(String(v.ano)) : ""}" /></label>
          <label class="field"><span>Color</span><input id="aprobado-color" type="text" value="${escapeAttr(v.color)}" placeholder="Rojo" /></label>
          <label class="field"><span>Patente</span><input id="aprobado-patente" type="text" value="${escapeAttr(v.patente)}" placeholder="Opcional" /></label>
          <label class="field aprobado-field-span2"><span>Número de chasis</span><input id="aprobado-chasis" type="text" value="${escapeAttr(v.numero_chasis)}" placeholder="VIN / chasis (opcional)" autocapitalize="characters" /></label>
          <label class="field">
            <span>País de importación</span>
            <select id="aprobado-origen">
              <option value="">—</option>
              <option value="Japón"${v.origen === "Japón" ? " selected" : ""}>Japón</option>
              <option value="Corea"${v.origen === "Corea" ? " selected" : ""}>Corea</option>
              <option value="Otro"${v.origen === "Otro" ? " selected" : ""}>Otro</option>
            </select>
          </label>
        </div>
      </section>

      <section class="aprobado-seccion">
        <h3>Ficha técnica</h3>
        <div class="aprobado-form-grid">
          <label class="field"><span>Km en tablero</span><input id="aprobado-km-tablero" type="number" min="0" step="1" value="${kmTab != null ? escapeAttr(String(kmTab)) : ""}" /></label>
          <label class="field"><span>Km real (revisión)</span><input id="aprobado-km-real" type="number" min="0" step="1" value="${kmReal != null ? escapeAttr(String(kmReal)) : ""}" /></label>
          <label class="field"><span>Carrocería</span><select id="aprobado-carroceria">${htmlSelectOpciones(APROBADO_OPCIONES.carroceria, v.carroceria, "—")}</select></label>
          <label class="field"><span>Transmisión</span><select id="aprobado-transmision">${htmlSelectOpciones(APROBADO_OPCIONES.transmision, v.transmision, "—")}</select></label>
          <label class="field"><span>Combustible</span><select id="aprobado-combustible">${htmlSelectOpciones(APROBADO_OPCIONES.combustible, v.combustible, "—")}</select></label>
          <label class="field"><span>Tracción</span><select id="aprobado-traccion">${htmlSelectOpciones(APROBADO_OPCIONES.traccion, v.traccion, "—")}</select></label>
          <label class="field"><span>Cilindrada</span><input id="aprobado-cilindrada" type="text" value="${escapeAttr(v.cilindrada)}" placeholder="2.0 L" /></label>
          <label class="field"><span>Modelo de motor</span><input id="aprobado-modelo-motor" type="text" value="${escapeAttr(v.modelo_motor)}" placeholder="D4HA" /></label>
          <label class="field"><span>Airbags</span><input id="aprobado-airbags" type="number" min="0" max="20" value="${v.airbags != null ? escapeAttr(String(v.airbags)) : ""}" /></label>
          <label class="field"><span>Asientos</span><input id="aprobado-asientos" type="number" min="2" max="12" value="${v.asientos != null ? escapeAttr(String(v.asientos)) : ""}" /></label>
          <label class="field"><span>Dueños anteriores</span><input id="aprobado-duenos" type="number" min="0" max="20" value="${v.duenos != null ? escapeAttr(String(v.duenos)) : ""}" /></label>
        </div>
      </section>

      <section class="aprobado-seccion">
        <h3>Precios de referencia (del vendedor)</h3>
        <div class="aprobado-form-grid aprobado-form-grid-compact">
          <label class="field"><span>Precio contado</span><input id="aprobado-precio" type="number" min="0" step="10000" value="${v.precio_referencia != null ? escapeAttr(String(v.precio_referencia)) : ""}" /></label>
          <label class="field"><span>Precio financiado (opcional)</span><input id="aprobado-precio-fin" type="number" min="0" step="10000" value="${v.precio_financiado != null ? escapeAttr(String(v.precio_financiado)) : ""}" /></label>
          <label class="field"><span>Cuota desde (opcional)</span><input id="aprobado-cuota" type="number" min="0" step="1000" value="${v.cuota_referencia != null ? escapeAttr(String(v.cuota_referencia)) : ""}" /></label>
          <label class="field"><span>Texto ahorro (opcional)</span><input id="aprobado-ahorro" type="number" min="0" step="10000" value="${v.ahorro_referencia != null ? escapeAttr(String(v.ahorro_referencia)) : ""}" placeholder="Monto para badge" /></label>
          <label class="field aprobado-field-check">
            <input id="aprobado-garantia" type="checkbox"${v.garantia_vendedor ? " checked" : ""} />
            <span>El vendedor declara garantía propia</span>
          </label>
        </div>
      </section>

      <section class="aprobado-seccion">
        <h3>Automotora y ubicación</h3>
        <div class="aprobado-form-grid">
          <label class="field"><span>Automotora / vendedor</span><input id="aprobado-vendedor" type="text" value="${escapeAttr(v.vendedor_nombre)}" /></label>
          <label class="field"><span>Teléfono vendedor</span><input id="aprobado-telefono" type="tel" value="${escapeAttr(v.vendedor_telefono)}" /></label>
          <label class="field"><span>WhatsApp consultas</span><input id="aprobado-whatsapp" type="tel" value="${escapeAttr(v.whatsapp_contacto)}" placeholder="569…" /></label>
          <label class="field"><span>Dónde ver el auto (nombre)</span><input id="aprobado-ubi-nombre" type="text" value="${escapeAttr(v.ubicacion_nombre)}" placeholder="ZOFRI, nave 12…" /></label>
          <label class="field aprobado-field-span2"><span>Dirección</span><input id="aprobado-ubi-dir" type="text" value="${escapeAttr(v.ubicacion_direccion)}" /></label>
          <label class="field aprobado-field-span2"><span>Link Google Maps</span><input id="aprobado-ubi-maps" type="url" value="${escapeAttr(v.ubicacion_maps)}" placeholder="Link para abrir Maps en el celular" /></label>
          <div class="aprobado-field-span2">${htmlMapaPantallazoEditor(inf)}</div>
        </div>
      </section>

      </div>
      <div class="aprobado-editor-col">

      <section class="aprobado-seccion">
        <h3>Galería de fotos</h3>
        <p class="muted aprobado-hint">La 1.ª foto es portada.</p>
        <div class="aprobado-media-acciones">
          <button type="button" class="btn-line" id="btn-aprobado-subir-galeria">Subir fotos</button>
        </div>
        <div id="aprobado-galeria-grid">${htmlThumbGrid(v.galeria || [], "galeria")}</div>
      </section>

      <section class="aprobado-seccion aprobado-seccion-equip">
        <h3>Descripción y equipamiento</h3>
        ${htmlEditorEquipamientoAprobado(v)}
        <label class="field"><span>Video (YouTube)</span><input id="aprobado-video" type="url" value="${escapeAttr(v.video_url)}" placeholder="https://www.youtube.com/watch?v=…" /></label>
      </section>

      <section class="aprobado-seccion">
        <h3>Detalles estéticos</h3>
        <p class="muted aprobado-hint">Rayones y golpes visibles.</p>
        <div class="aprobado-media-acciones">
          <button type="button" class="btn-line" id="btn-aprobado-subir-estetica">Subir fotos de detalle</button>
        </div>
        <div id="aprobado-estetica-grid">${htmlThumbGrid(v.detalles_esteticos || [], "estetica")}</div>
      </section>

      <section class="aprobado-seccion">
        <h3>Informe AutoDato</h3>
        <p class="muted aprobado-hint">Elige plantilla en el desplegable o escribe manualmente. Solo se publican apartados con texto.</p>
        ${INFORME_PRESETS_APROBADO.map((c) => htmlCampoInformePreset(c, inf[c.key])).join("")}
        <label class="field aprobado-field-span2"><span>Enlace PDF informe (opcional)</span><input id="aprobado-pdf" type="url" value="${escapeAttr(inf.informe_pdf || "")}" placeholder="https://…" /></label>
        <div class="aprobado-media-acciones">
          <button type="button" class="btn-line" id="btn-aprobado-subir-escaner">Subir capturas escáner</button>
        </div>
        <div id="aprobado-escaner-grid">${htmlThumbGrid(inf.escaner_imagenes || [], "escaner")}</div>
      </section>

      <section class="aprobado-seccion">
        <h3>Estado interno</h3>
        <div class="aprobado-form-grid">
          <label class="field">
            <span>Estado</span>
            <select id="aprobado-estado">
              ${APROBADOS_ESTADOS.map(
                (st) =>
                  `<option value="${escapeAttr(st.v)}"${v.estado === st.v ? " selected" : ""}>${escapeText(st.label)}</option>`
              ).join("")}
            </select>
          </label>
          <label class="field aprobado-field-span2"><span>Notas internas (no públicas)</span><textarea id="aprobado-notas" rows="3">${escapeText(v.notas_internas || "")}</textarea></label>
        </div>
      </section>

      </div>
      </div>
    </div>
  `;
}

function numCampo(id) {
  const el = $(id);
  if (!el) return null;
  const raw = el.value.trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function sincronizarCaptionsEsteticaDesdeDom() {
  if (!aprobadoEditando || !Array.isArray(aprobadoEditando.detalles_esteticos)) return;
  document.querySelectorAll("[data-aprobado-caption]").forEach((inp) => {
    const i = Number(inp.dataset.aprobadoCaption);
    if (Number.isFinite(i) && aprobadoEditando.detalles_esteticos[i]) {
      aprobadoEditando.detalles_esteticos[i].caption = inp.value.trim();
    }
  });
}

function leerFormAprobado() {
  sincronizarCaptionsEsteticaDesdeDom();
  sincronizarMapaAprobadoDesdeDom();
  const base = aprobadoEditando || aprobadoVacio();
  return {
    ...base,
    marca: $("aprobado-marca") ? $("aprobado-marca").value.trim() : "",
    modelo: $("aprobado-modelo") ? $("aprobado-modelo").value.trim() : "",
    version: $("aprobado-version") ? $("aprobado-version").value.trim() : "",
    ano: numCampo("aprobado-ano"),
    color: $("aprobado-color") ? $("aprobado-color").value.trim() : "",
    patente: $("aprobado-patente") ? $("aprobado-patente").value.trim() : "",
    numero_chasis: $("aprobado-chasis") ? $("aprobado-chasis").value.trim().toUpperCase() : "",
    origen: $("aprobado-origen") ? $("aprobado-origen").value.trim() : "",
    kilometraje_tablero: numCampo("aprobado-km-tablero"),
    kilometraje_real: numCampo("aprobado-km-real"),
    kilometraje: numCampo("aprobado-km-real") ?? numCampo("aprobado-km-tablero"),
    carroceria: $("aprobado-carroceria") ? $("aprobado-carroceria").value.trim() : "",
    transmision: $("aprobado-transmision") ? $("aprobado-transmision").value.trim() : "",
    combustible: $("aprobado-combustible") ? $("aprobado-combustible").value.trim() : "",
    traccion: $("aprobado-traccion") ? $("aprobado-traccion").value.trim() : "",
    cilindrada: $("aprobado-cilindrada") ? $("aprobado-cilindrada").value.trim() : "",
    modelo_motor: $("aprobado-modelo-motor") ? $("aprobado-modelo-motor").value.trim() : "",
    airbags: numCampo("aprobado-airbags"),
    asientos: numCampo("aprobado-asientos"),
    duenos: numCampo("aprobado-duenos"),
    precio_referencia: numCampo("aprobado-precio"),
    precio_financiado: numCampo("aprobado-precio-fin"),
    cuota_referencia: numCampo("aprobado-cuota"),
    ahorro_referencia: numCampo("aprobado-ahorro"),
    garantia_vendedor: Boolean($("aprobado-garantia") && $("aprobado-garantia").checked),
    vendedor_nombre: $("aprobado-vendedor") ? $("aprobado-vendedor").value.trim() : "",
    vendedor_telefono: $("aprobado-telefono") ? $("aprobado-telefono").value.trim() : "",
    whatsapp_contacto: $("aprobado-whatsapp") ? $("aprobado-whatsapp").value.trim() : "",
    ubicacion_nombre: $("aprobado-ubi-nombre") ? $("aprobado-ubi-nombre").value.trim() : "",
    ubicacion_direccion: $("aprobado-ubi-dir") ? $("aprobado-ubi-dir").value.trim() : "",
    ubicacion_maps: $("aprobado-ubi-maps") ? $("aprobado-ubi-maps").value.trim() : "",
    descripcion: String((base.descripcion || "")).trim(),
    equipamiento: leerEquipamientoChecklistDesdeDom(),
    video_url: $("aprobado-video") ? $("aprobado-video").value.trim() : "",
    estado: $("aprobado-estado") ? $("aprobado-estado").value : "borrador",
    notas_internas: $("aprobado-notas") ? $("aprobado-notas").value.trim() : "",
    informe: {
      ...(base.informe || {}),
      ...Object.fromEntries(
        INFORME_PRESETS_APROBADO.map((c) => {
          const id = informeIdTextoAprobado(c.key);
          return [c.key, $(id) ? $(id).value.trim() : String((base.informe && base.informe[c.key]) || "").trim()];
        })
      ),
      informe_pdf: $("aprobado-pdf") ? $("aprobado-pdf").value.trim() : "",
      escaner_imagenes: Array.isArray(base.informe && base.informe.escaner_imagenes) ? base.informe.escaner_imagenes : [],
      mapa_imagen: String((base.informe && base.informe.mapa_imagen) || "").trim(),
      mapa_off_x: Number(base.informe && base.informe.mapa_off_x) || 0,
      mapa_off_y: Number(base.informe && base.informe.mapa_off_y) || 0,
      mapa_zoom: Number(base.informe && base.informe.mapa_zoom) > 0 ? Number(base.informe.mapa_zoom) : 1,
    },
    galeria: Array.isArray(base.galeria) ? base.galeria : [],
    detalles_esteticos: Array.isArray(base.detalles_esteticos) ? base.detalles_esteticos : [],
  };
}

function repintarMediasAprobado() {
  const v = aprobadoEditando || aprobadoVacio();
  const g = $("aprobado-galeria-grid");
  const e = $("aprobado-estetica-grid");
  const s = $("aprobado-escaner-grid");
  if (g) g.innerHTML = htmlThumbGrid(v.galeria || [], "galeria");
  if (e) e.innerHTML = htmlThumbGrid(v.detalles_esteticos || [], "estetica");
  if (s) s.innerHTML = htmlThumbGrid((v.informe && v.informe.escaner_imagenes) || [], "escaner");
}

function sincronizarMapaAprobadoDesdeDom() {
  if (!aprobadoEditando) return;
  if (!aprobadoEditando.informe) aprobadoEditando.informe = {};
  const z = $("aprobado-mapa-zoom");
  if (z) aprobadoEditando.informe.mapa_zoom = Number(z.value) / 100;
}

function repintarMapaPantallazoEditor() {
  const box = $("aprobado-mapa-pantalla");
  if (!box || !aprobadoEditando) return;
  const inf = aprobadoEditando.informe || {};
  box.outerHTML = htmlMapaPantallazoEditor(inf);
  activarEditorMapaAprobado();
}

function archivoImagenDesdePasteMapaAprobado(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return null;
  for (const item of items) {
    if (String(item.type || "").startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

function armarZonaPegadoMapaAprobado() {
  const zone = $("aprobado-mapa-sim");
  const wrap = $("aprobado-mapa-pantalla");
  if ((!zone && !wrap) || (zone && zone.dataset.mapaPaste === "1")) return;
  if (zone) zone.dataset.mapaPaste = "1";
  const marcarHover = (on) => zone && zone.classList.toggle("is-drop-hover", on);
  const onPaste = async (e) => {
    const file = archivoImagenDesdePasteMapaAprobado(e);
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    await subirMapaPantallazoAprobado(file);
  };
  if (wrap && !wrap.dataset.mapaPasteWrap) {
    wrap.dataset.mapaPasteWrap = "1";
    wrap.addEventListener("paste", onPaste);
  }
  if (!zone) return;
  zone.addEventListener("click", () => zone.focus());
  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    marcarHover(true);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    marcarHover(true);
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) marcarHover(false);
  });
  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    marcarHover(false);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && String(file.type || "").startsWith("image/")) await subirMapaPantallazoAprobado(file);
  });
  zone.addEventListener("paste", onPaste);
}

function activarEditorMapaAprobado() {
  armarZonaPegadoMapaAprobado();
  const lienzo = $("aprobado-mapa-lienzo");
  const img = $("aprobado-mapa-img");
  if (!lienzo || !img || lienzo.dataset.mapaEditor === "1") return;
  lienzo.dataset.mapaEditor = "1";
  let lastX = 0;
  let lastY = 0;
  let moving = false;
  const mover = (e) => {
    if (!moving || !aprobadoEditando || !aprobadoEditando.informe) return;
    const r = lienzo.getBoundingClientRect();
    const inf = aprobadoEditando.informe;
    inf.mapa_off_x = Math.min(
      160,
      Math.max(-160, (Number(inf.mapa_off_x) || 0) + ((e.clientX - lastX) / r.width) * 100)
    );
    inf.mapa_off_y = Math.min(
      160,
      Math.max(-160, (Number(inf.mapa_off_y) || 0) + ((e.clientY - lastY) / r.height) * 100)
    );
    lastX = e.clientX;
    lastY = e.clientY;
    img.style.transform = transformMapaPantallazoCss(datosMapaPantallazoAprobado(inf));
  };
  const fin = () => {
    moving = false;
  };
  lienzo.addEventListener("pointerdown", (e) => {
    moving = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lienzo.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  lienzo.addEventListener("pointermove", mover);
  lienzo.addEventListener("pointerup", fin);
  lienzo.addEventListener("pointercancel", fin);
  const zoom = $("aprobado-mapa-zoom");
  if (zoom) {
    zoom.addEventListener("input", () => {
      sincronizarMapaAprobadoDesdeDom();
      img.style.transform = transformMapaPantallazoCss(datosMapaPantallazoAprobado(aprobadoEditando.informe));
    });
  }
}

async function subirMapaPantallazoAprobado(file) {
  if (!aprobadoEditando || !file) return;
  sincronizarCaptionsEsteticaDesdeDom();
  sincronizarMapaAprobadoDesdeDom();
  Object.assign(aprobadoEditando, leerFormAprobado());
  try {
    if (typeof adminIniciarGuardado === "function") adminIniciarGuardado("Subiendo pantallazo…");
    const dataUrls = await leerArchivosComoDataUrl([file]);
    const urls = await subirUrlsAprobado(dataUrls);
    if (!aprobadoEditando.informe) aprobadoEditando.informe = {};
    aprobadoEditando.informe.mapa_imagen = urls[0] || "";
    aprobadoEditando.informe.mapa_off_x = 0;
    aprobadoEditando.informe.mapa_off_y = 0;
    aprobadoEditando.informe.mapa_zoom = 1;
    repintarMapaPantallazoEditor();
  } catch (e) {
    alert(String((e && e.message) || e || "No se pudo subir el pantallazo."));
  } finally {
    if (typeof adminFinGuardado === "function") adminFinGuardado();
  }
}

function quitarMapaPantallazoAprobado() {
  if (!aprobadoEditando) return;
  if (!aprobadoEditando.informe) aprobadoEditando.informe = {};
  aprobadoEditando.informe.mapa_imagen = "";
  aprobadoEditando.informe.mapa_off_x = 0;
  aprobadoEditando.informe.mapa_off_y = 0;
  aprobadoEditando.informe.mapa_zoom = 1;
  repintarMapaPantallazoEditor();
}

function abrirEditorAprobado(origen) {
  aprobadoEditando = clonarAprobado(origen);
  if (typeof editando !== "undefined") editando = null;
  $("stage")?.classList.remove("stage-board");
  $("stage").innerHTML = htmlEditorAprobado();
  activarEditorMapaAprobado();
  activarPresetsInformeAprobado();
  if (typeof renderLista === "function") renderLista();
}

function abrirEditorAprobadoNuevo() {
  abrirEditorAprobado(null);
  $("aprobado-marca")?.focus();
}

function abrirEditorAprobadoExistente(id) {
  const sid = String(id || "").trim();
  const v = aprobadosCache.find((x) => String(x.id) === sid);
  if (!v) return;
  abrirEditorAprobado(v);
}

async function leerArchivosComoDataUrl(files) {
  const list = [];
  for (const file of files) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error || new Error("No se pudo leer el archivo"));
      r.readAsDataURL(file);
    });
    list.push(dataUrl);
  }
  return list;
}

async function subirUrlsAprobado(dataUrls) {
  const out = [];
  for (const src of dataUrls) {
    let url = src;
    if (typeof nubeActiva === "function" && nubeActiva() && typeof nubeSubirImagen === "function") {
      url = await nubeSubirImagen(src);
    }
    out.push(url);
  }
  return out;
}

async function agregarImagenesAprobado(tipo, fileList) {
  if (!aprobadoEditando || !fileList || !fileList.length) return;
  sincronizarCaptionsEsteticaDesdeDom();
  Object.assign(aprobadoEditando, leerFormAprobado());
  try {
    if (typeof adminIniciarGuardado === "function") adminIniciarGuardado("Subiendo imágenes…");
    const dataUrls = await leerArchivosComoDataUrl(fileList);
    const urls = await subirUrlsAprobado(dataUrls);
    if (tipo === "galeria") {
      const base = aprobadoEditando.galeria.length;
      urls.forEach((url, i) => {
        aprobadoEditando.galeria.push({ url, orden: base + i });
      });
    } else if (tipo === "estetica") {
      urls.forEach((url) => {
        aprobadoEditando.detalles_esteticos.push({ url, caption: "" });
      });
    } else if (tipo === "escaner") {
      if (!aprobadoEditando.informe) aprobadoEditando.informe = {};
      if (!Array.isArray(aprobadoEditando.informe.escaner_imagenes)) aprobadoEditando.informe.escaner_imagenes = [];
      urls.forEach((url) => {
        aprobadoEditando.informe.escaner_imagenes.push({ url });
      });
    }
    repintarMediasAprobado();
  } catch (e) {
    alert(String((e && e.message) || e || "No se pudieron subir las imágenes."));
  } finally {
    if (typeof adminFinGuardado === "function") adminFinGuardado();
  }
}

function quitarImagenAprobado(tipo, idx) {
  if (!aprobadoEditando || !Number.isFinite(idx)) return;
  sincronizarCaptionsEsteticaDesdeDom();
  Object.assign(aprobadoEditando, leerFormAprobado());
  if (tipo === "galeria") {
    aprobadoEditando.galeria.splice(idx, 1);
    aprobadoEditando.galeria.forEach((it, i) => {
      it.orden = i;
    });
    if (aprobadoEditando.galeria.length) {
      aprobadoEditando.foto_portada = aprobadoEditando.galeria[0].url || "";
    } else {
      aprobadoEditando.foto_portada = "";
    }
  } else if (tipo === "estetica") {
    aprobadoEditando.detalles_esteticos.splice(idx, 1);
  } else if (tipo === "escaner" && aprobadoEditando.informe) {
    aprobadoEditando.informe.escaner_imagenes.splice(idx, 1);
  }
  repintarMediasAprobado();
}

function cerrarMenusGaleriaAprobado() {
  document.querySelectorAll(".aprobado-thumb-menu:not([hidden])").forEach((el) => {
    el.hidden = true;
    el.style.top = "";
    el.style.left = "";
    el.closest(".aprobado-thumb")?.classList.remove("is-menu-open");
  });
  document.querySelectorAll("[data-aprobado-menu-toggle][aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function toggleMenuGaleriaAprobado(btn) {
  const thumb = btn.closest(".aprobado-thumb");
  const menu = thumb && thumb.querySelector("[data-aprobado-menu]");
  if (!menu) return;
  const abrir = menu.hidden;
  cerrarMenusGaleriaAprobado();
  if (!abrir) {
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  menu.hidden = false;
  thumb.classList.add("is-menu-open");
  const r = btn.getBoundingClientRect();
  const ancho = menu.offsetWidth || 188;
  menu.style.top = `${Math.round(r.bottom + 4)}px`;
  menu.style.left = `${Math.round(Math.max(8, r.right - ancho))}px`;
  btn.setAttribute("aria-expanded", "true");
}

function ponerPortadaGaleriaAprobado(idx) {
  if (!aprobadoEditando || !Number.isFinite(idx) || idx < 1) return;
  sincronizarCaptionsEsteticaDesdeDom();
  Object.assign(aprobadoEditando, leerFormAprobado());
  const g = aprobadoEditando.galeria;
  if (!g || idx >= g.length) return;
  const [item] = g.splice(idx, 1);
  g.unshift(item);
  g.forEach((it, i) => {
    it.orden = i;
  });
  aprobadoEditando.foto_portada = item.url || "";
  cerrarMenusGaleriaAprobado();
  repintarMediasAprobado();
}

async function guardarAprobadoEditor() {
  const datos = leerFormAprobado();
  if (!datos.marca || !datos.modelo) {
    alert("Indica al menos marca y modelo.");
    return;
  }
  if (typeof nubeGuardarVehiculoAprobado !== "function") {
    alert("La nube no está disponible en este entorno.");
    return;
  }
  try {
    if (typeof adminIniciarGuardado === "function") adminIniciarGuardado("Guardando ficha…");
    const saved = await nubeGuardarVehiculoAprobado(datos);
    const idx = aprobadosCache.findIndex((x) => x.id === saved.id);
    if (idx >= 0) aprobadosCache[idx] = saved;
    else aprobadosCache.unshift(saved);
    aprobadoEditando = clonarAprobado(saved);
    $("stage").innerHTML = htmlEditorAprobado();
    if (typeof adminMostrarOkGuardado === "function") adminMostrarOkGuardado("Ficha guardada");
    setTimeout(() => {
      if (typeof adminFinGuardado === "function") adminFinGuardado();
    }, 500);
  } catch (e) {
    const msg = String((e && e.message) || e || "");
    if (/vehiculos_aprobados|schema cache|relation|column/i.test(msg)) {
      alert(
        "Falta actualizar la tabla en Supabase. Ejecuta supabase/vehiculos_aprobados_ampliacion.sql y vuelve a intentar.\n\n" +
          msg
      );
    } else {
      alert(msg || "No se pudo guardar.");
    }
    if (typeof adminFinGuardado === "function") adminFinGuardado();
  }
}

function pintarListaAprobados() {
  const box = $("lista-aprobados");
  if (!box) return;
  const err = $("aprobados-error");
  if (err) err.hidden = true;
  box.innerHTML = aprobadosCache.length
    ? aprobadosCache.map(htmlCardAprobado).join("")
    : `<p class="muted">Aún no hay fichas. Pulsa «+ NUEVO» para comenzar.</p>`;
}

async function renderAprobadosAutodato() {
  aprobadoEditando = null;
  if (typeof editando !== "undefined") editando = null;
  $("stage")?.classList.remove("stage-board");
  $("stage").innerHTML = `
    <div class="admin-panel admin-panel-aprobados">
      <div class="admin-panel-top">
        <div>
          <h2>Aprobados AutoDato</h2>
          <p class="muted">Fichas para vitrina y QR. Inspirado en catálogo tipo Checkeados: fotos, ficha técnica, detalles estéticos e informe.</p>
        </div>
        <div class="admin-panel-top-acciones">
          <button class="btn-primary" type="button" id="btn-aprobado-nuevo">+ NUEVO</button>
        </div>
      </div>
      <p id="aprobados-error" class="error" hidden></p>
      <div id="lista-aprobados" class="aprobados-grid">
        <p class="muted">Cargando…</p>
      </div>
    </div>
  `;

  if (typeof renderLista === "function") renderLista();

  if (typeof nubeSesion === "function" && !(await nubeSesion())) {
    const err = $("aprobados-error");
    if (err) {
      err.hidden = false;
      err.textContent = "Inicia sesión con tu correo Supabase en el panel para guardar fichas.";
    }
    $("lista-aprobados").innerHTML = `<p class="muted">Sin sesión de administrador.</p>`;
    return;
  }

  try {
    if (typeof adminIniciarGuardado === "function") adminIniciarGuardado("Cargando aprobados…");
    aprobadosCache =
      typeof nubeListarVehiculosAprobados === "function" ? await nubeListarVehiculosAprobados() : [];
    pintarListaAprobados();
  } catch (e) {
    const msg = String((e && e.message) || e || "");
    const err = $("aprobados-error");
    if (err) {
      err.hidden = false;
      err.textContent = /vehiculos_aprobados|schema cache|relation/i.test(msg)
        ? "Ejecuta la migración SQL de aprobados en Supabase y recarga."
        : msg || "No se pudo cargar el listado.";
    }
    $("lista-aprobados").innerHTML = "";
  } finally {
    if (typeof adminFinGuardado === "function") adminFinGuardado();
  }
}

$("btn-aprobados-autodato")?.addEventListener("click", () => {
  void renderAprobadosAutodato();
});

document.addEventListener("click", (e) => {
  if (e.target.id === "btn-aprobado-ver-qr" || e.target.closest("#btn-aprobado-ver-qr")) {
    abrirVistaPublicaAprobado();
    return;
  }
  if (e.target.id === "btn-aprobado-nuevo" || e.target.closest("#btn-aprobado-nuevo")) {
    abrirEditorAprobadoNuevo();
    return;
  }
  if (e.target.id === "btn-aprobado-volver" || e.target.closest("#btn-aprobado-volver")) {
    void renderAprobadosAutodato();
    return;
  }
  if (e.target.id === "btn-aprobado-guardar" || e.target.closest("#btn-aprobado-guardar")) {
    void guardarAprobadoEditor();
    return;
  }
  if (e.target.id === "btn-aprobado-subir-galeria" || e.target.closest("#btn-aprobado-subir-galeria")) {
    $("aprobado-file-galeria")?.click();
    return;
  }
  if (e.target.id === "btn-aprobado-subir-estetica" || e.target.closest("#btn-aprobado-subir-estetica")) {
    $("aprobado-file-estetica")?.click();
    return;
  }
  if (e.target.id === "btn-aprobado-subir-escaner" || e.target.closest("#btn-aprobado-subir-escaner")) {
    $("aprobado-file-escaner")?.click();
    return;
  }
  if (e.target.id === "btn-aprobado-subir-mapa-shot" || e.target.closest("#btn-aprobado-subir-mapa-shot")) {
    $("aprobado-file-mapa-shot")?.click();
    return;
  }
  if (e.target.id === "btn-aprobado-quitar-mapa-shot" || e.target.closest("#btn-aprobado-quitar-mapa-shot")) {
    quitarMapaPantallazoAprobado();
    return;
  }
  if (e.target.id === "btn-aprobado-equip-todo" || e.target.closest("#btn-aprobado-equip-todo")) {
    marcarTodoEquipamientoAprobado(true);
    return;
  }
  if (e.target.id === "btn-aprobado-equip-ninguno" || e.target.closest("#btn-aprobado-equip-ninguno")) {
    marcarTodoEquipamientoAprobado(false);
    return;
  }
  const menuToggle = e.target.closest("[data-aprobado-menu-toggle]");
  if (menuToggle) {
    e.stopPropagation();
    toggleMenuGaleriaAprobado(menuToggle);
    return;
  }
  const portadaBtn = e.target.closest("[data-aprobado-portada]");
  if (portadaBtn && !portadaBtn.disabled) {
    ponerPortadaGaleriaAprobado(Number(portadaBtn.dataset.aprobadoIdx));
    return;
  }
  const quitar = e.target.closest("[data-aprobado-quitar]");
  if (quitar) {
    cerrarMenusGaleriaAprobado();
    quitarImagenAprobado(quitar.dataset.aprobadoQuitar, Number(quitar.dataset.aprobadoIdx));
    return;
  }
  if (!e.target.closest(".aprobado-thumb-menu")) cerrarMenusGaleriaAprobado();
  const card = e.target.closest("[data-abrir-aprobado]");
  if (card) {
    abrirEditorAprobadoExistente(card.dataset.abrirAprobado);
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t || !t.files) return;
  if (t.id === "aprobado-file-galeria" && t.files.length) {
    void agregarImagenesAprobado("galeria", t.files).finally(() => {
      t.value = "";
    });
  }
  if (t.id === "aprobado-file-estetica" && t.files.length) {
    void agregarImagenesAprobado("estetica", t.files).finally(() => {
      t.value = "";
    });
  }
  if (t.id === "aprobado-file-escaner" && t.files.length) {
    void agregarImagenesAprobado("escaner", t.files).finally(() => {
      t.value = "";
    });
  }
  if (t.id === "aprobado-file-mapa-shot" && t.files.length) {
    void subirMapaPantallazoAprobado(t.files[0]).finally(() => {
      t.value = "";
    });
  }
});
