/**
 * Vitrina pública — Aprobados AutoDato (móvil, estilo catálogo tipo Checkeados).
 */
"use strict";

const aprobadosUi = { lista: [], detalle: null, fotoIdx: 0 };

/** Enlace fijo «Qué es AutoDato» (ficha pública). */
const APROBADO_URL_QUE_ES_AUTODATO = "https://www.facebook.com/share/19yVEgsCPh/";

function estadoEsReservadoAprobado(v) {
  return v && String(v.estado || "").trim() === "reservado";
}

function htmlRibbonReservadoAprobado(v) {
  if (!estadoEsReservadoAprobado(v)) return "";
  return `<span class="aprobados-badge-reservado">RESERVADO</span>`;
}

function mostrarDatosVendedorPub(v) {
  return !v || v.mostrar_datos_vendedor !== false;
}

function fotosAprobado(v) {
  if (!v) return [];
  const gal = Array.isArray(v.galeria) ? v.galeria : [];
  const urls = gal.map((x) => String((x && x.url) || "").trim()).filter(Boolean);
  if (urls.length) return urls;
  const p = String(v.foto_portada || "").trim();
  return p ? [p] : [];
}

function tituloLargoAprobado(v) {
  if (!v) return "Vehículo";
  const ver = v.version ? ` ${v.version}` : "";
  const base = `${v.marca || ""} ${v.modelo || ""}${ver}`.trim();
  return v.ano != null ? `${base} ${v.ano}`.trim() : base || "Vehículo";
}

function kmTableroPub(v) {
  if (!v) return null;
  if (v.kilometraje_tablero != null) return v.kilometraje_tablero;
  if (v.kilometraje != null) return v.kilometraje;
  return null;
}

function kmRealPub(v) {
  if (!v) return null;
  return v.kilometraje_real != null ? v.kilometraje_real : null;
}

function fmtKmAprobado(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${new Intl.NumberFormat("es-CL").format(Math.round(Number(n)))} km`;
}

function clpAprobado(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(
    Number(n)
  );
}

function textoBusquedaUbicacionAprobado(v) {
  if (!v) return "";
  return [v.ubicacion_nombre, v.ubicacion_direccion].filter(Boolean).join(", ");
}

function extraerCoordsMaps(url) {
  const s = String(url || "");
  let m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  m = s.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  return null;
}

function resolverCoordsMapaAprobado(v) {
  if (!v) return null;
  const maps = String(v.ubicacion_maps || "").trim();
  let c = extraerCoordsMaps(maps);
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return c;
  const href = urlAbrirMapsAprobado(v);
  c = extraerCoordsMaps(href);
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return c;
  try {
    const u = new URL(href);
    const q = u.searchParams.get("query") || u.searchParams.get("q");
    if (q) {
      const m = String(q).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }
  } catch (_e) {
    return null;
  }
  return null;
}

function consultaGeocodeMapaAprobado(v) {
  const q = textoBusquedaUbicacionAprobado(v);
  if (!q) return "";
  if (/chile/i.test(q)) return q;
  return `${q}, Chile`;
}

function cargarCssAprobado(href) {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => resolve();
    l.onerror = () => reject(new Error("css"));
    document.head.appendChild(l);
  });
}

function cargarScriptAprobado(src) {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

async function asegurarLeafletAprobado() {
  if (typeof L !== "undefined") return;
  await cargarCssAprobado("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
  await cargarScriptAprobado("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
}

async function geocodeUbicacionAprobado(q) {
  const texto = String(q || "").trim();
  if (!texto) return null;
  try {
    const local = `/api/geocode?q=${encodeURIComponent(texto)}`;
    const r = await fetch(local);
    if (r.ok) {
      const data = await r.json();
      if (data && data.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
        return { lat: data.lat, lng: data.lng };
      }
    }
  } catch (_e) {
    /* sin servidor Node: Photon */
  }
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&limit=1&lang=es`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const f = data.features && data.features[0];
    if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
    const [lng, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (_e2) {
    return null;
  }
}

function pintarLeafletMapaAprobado(box, lat, lng) {
  box.innerHTML = "";
  box.classList.add("is-leaflet");
  box.style.paddingBottom = "0";
  box.style.height = "200px";
  if (L.Icon && L.Icon.Default) {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }
  const map = L.map(box, {
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomControl: false,
    tap: false,
    attributionControl: true,
  });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  map.setView([lat, lng], 15);
  L.marker([lat, lng]).addTo(map);
  requestAnimationFrame(() => map.invalidateSize());
}

function urlAbrirMapsAprobado(v) {
  if (!v) return "";
  const maps = String(v.ubicacion_maps || "").trim();
  const q = textoBusquedaUbicacionAprobado(v);
  const coords = maps ? extraerCoordsMaps(maps) : null;
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  if (maps) return maps;
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function datosMapaPantallazoPublico(v) {
  const inf = v && v.informe && typeof v.informe === "object" ? v.informe : {};
  return {
    url: String(inf.mapa_imagen || "").trim(),
    off_x: Math.min(160, Math.max(-160, Number(inf.mapa_off_x) || 0)),
    off_y: Math.min(160, Math.max(-160, Number(inf.mapa_off_y) || 0)),
    zoom: Math.min(3, Math.max(0.5, Number(inf.mapa_zoom) || 1)),
  };
}

function transformMapaPantallazoPublico(m) {
  return `translate(-50%,-50%) translate(${m.off_x}%,${m.off_y}%) scale(${m.zoom})`;
}

const INFORME_PUBLICO_APROBADO = [
  { key: "carroceria_estetica", label: "Carrocería y detalles estéticos" },
  { key: "chasis_bajos", label: "Estado del chasis y bajos" },
  { key: "suspension", label: "Suspensión" },
  { key: "direccion", label: "Dirección" },
  { key: "frenos", label: "Frenos" },
  { key: "motor", label: "Motor" },
  { key: "escaner_automotriz", label: "Escáner automotriz" },
  { key: "desempeno_ruta", label: "Desempeño en ruta" },
  { key: "conclusion", label: "Conclusión" },
];

function htmlInformeAutodatoAprobado(v) {
  const inf = v && v.informe && typeof v.informe === "object" ? v.informe : {};
  const partes = INFORME_PUBLICO_APROBADO.map((c) => {
    const texto = String(inf[c.key] || "").trim();
    if (!texto) return "";
    return `<article class="aprobados-informe-item">
      <h3>${escapeHtml(c.label)}</h3>
      <p>${escapeHtml(texto).replace(/\n/g, "<br />")}</p>
    </article>`;
  }).filter(Boolean);
  const pdf = String(inf.informe_pdf || "").trim();
  if (!partes.length && !pdf) return "";
  return `<section class="aprobados-block aprobados-informe">
    <h2>Informe AutoDato</h2>
    ${partes.join("")}
    ${pdf ? `<a class="btn-line" href="${escapeAttr(pdf)}" target="_blank" rel="noopener">Ver informe PDF</a>` : ""}
  </section>`;
}

function htmlMapaDetalleAprobado(v) {
  if (!mostrarDatosVendedorPub(v)) return "";
  const href = urlAbrirMapsAprobado(v);
  const dirLine = [v.ubicacion_nombre, v.ubicacion_direccion].filter(Boolean).join(" · ");
  const shot = datosMapaPantallazoPublico(v);
  if (!href && !dirLine && !shot.url) return "";
  const link = href || "#";
  const preview = shot.url
    ? `<span class="aprobados-maps-preview aprobados-maps-shot"><span class="aprobados-maps-lienzo"><img class="aprobados-maps-shot-img" src="${escapeAttr(
        shot.url
      )}" alt="Ubicación en mapa" style="transform:${transformMapaPantallazoPublico(shot)}" loading="lazy" /></span></span>`
    : "";
  return `<section class="aprobados-block aprobados-maps-block">
    <h2>Dónde ver este auto</h2>
    ${dirLine ? `<p class="aprobados-maps-direccion muted">${escapeHtml(dirLine)}</p>` : ""}
    <a class="aprobados-maps-tap" href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ubicación en Google Maps" data-aprobado-maps-metric="${escapeAttr(String(v.public_slug || ""))}">
      ${preview}
      <span class="aprobados-maps-cta">Toca para abrir en Maps</span>
    </a>
  </section>`;
}

function youtubeEmbedUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace(/\//g, "");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
  } catch (_e) {
    return "";
  }
  return "";
}

function normalizarWhatsappChile(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("56")) return d;
  if (d.length === 9) return `56${d}`;
  return d;
}

function whatsappCertificadorAprobado(v) {
  if (!v) return "";
  return normalizarWhatsappChile(v.revisado_whatsapp);
}

function textoWhatsappCertificadorAprobado(v) {
  const titulo = tituloLargoAprobado(v);
  const folio = v && v.folio != null ? ` (folio ${v.folio})` : "";
  const tec = v && String(v.revisado_por || "").trim();
  const urlFicha = urlFichaPublicaAbsolutaAprobado(v) || "";
  return `Hola${tec ? ` ${tec}` : ""}, consulto por la revisión certificada AutoDato del vehículo ${titulo}${folio}.

Ficha: ${urlFicha || "—"}`;
}

function whatsappAprobado(v) {
  if (!v) return "";
  const raw = String(v.whatsapp_contacto || v.vendedor_telefono || "").replace(/\D/g, "");
  if (!raw) {
    if (typeof leerTaller === "function") {
      const t = leerTaller();
      return String((t && t.whatsapp) || "").replace(/\D/g, "");
    }
    return "";
  }
  if (raw.startsWith("56")) return raw;
  if (raw.length === 9) return `56${raw}`;
  return raw;
}

function ingresoFichaDesdeQrImpreso() {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get("src") === "qr";
  } catch (_e) {
    return false;
  }
}

function limpiarParametroQrEnBarra(slug) {
  if (!ingresoFichaDesdeQrImpreso()) return;
  const path = urlAprobadoPath(slug);
  if (typeof history !== "undefined" && history.replaceState) {
    history.replaceState(history.state, "", path + (window.location.hash || ""));
  }
}

function registrarMetricaSesionAprobado(slug, tipo, prefijoKey) {
  const s = String(slug || "").trim();
  const t = String(tipo || "").trim().toLowerCase();
  if (!s || !t) return;
  const key = `${prefijoKey}-${s}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch (_e) {
    /* sin sessionStorage */
  }
  if (typeof nubeRegistrarMetricaAprobado === "function") void nubeRegistrarMetricaAprobado(s, t);
}

function registrarVisitaFichaAprobado(slug, desdeQrImpreso) {
  const s = String(slug || "").trim();
  if (!s) return;
  const esQr = desdeQrImpreso === true || (desdeQrImpreso !== false && ingresoFichaDesdeQrImpreso());
  if (esQr) {
    registrarMetricaSesionAprobado(s, "qr", "ad-metric-qr");
    limpiarParametroQrEnBarra(s);
  } else {
    registrarMetricaSesionAprobado(s, "web", "ad-metric-web");
  }
}

function registrarClicMapsAprobado(slug) {
  const s = String(slug || "").trim();
  if (!s) return;
  if (typeof nubeRegistrarMetricaAprobado === "function") void nubeRegistrarMetricaAprobado(s, "maps");
}

function registrarCompartirAprobado(slug) {
  const s = String(slug || "").trim();
  if (!s) return;
  if (typeof nubeRegistrarMetricaAprobado === "function") void nubeRegistrarMetricaAprobado(s, "compartir");
}

async function compartirFichaAprobado(v) {
  if (!v) return;
  const slug = String(v.public_slug || "").trim();
  const url = urlFichaPublicaAbsolutaAprobado(v);
  if (!url) return;
  const title = tituloLargoAprobado(v);
  const text = `Mira este auto revisado por AutoDato: ${title}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "AutoDato Aprobados", text, url });
      registrarCompartirAprobado(slug);
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    const msg = `${text}\n${url}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(msg);
    } else {
      const ta = document.createElement("textarea");
      ta.value = msg;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    registrarCompartirAprobado(slug);
    alert("Enlace copiado. Pégalo en WhatsApp u otra app.");
  } catch (_e) {
    alert(url);
  }
}

function registrarClicWhatsappAprobado(slug) {
  const s = String(slug || "").trim();
  if (!s) return;
  if (typeof nubeRegistrarMetricaAprobado === "function") void nubeRegistrarMetricaAprobado(s, "whatsapp");
}

function urlAprobadoPath(slug) {
  const s = encodeURIComponent(String(slug || "").trim());
  return s ? `/aprobado/${s}` : "/aprobados";
}

/** Enlace absoluto a la ficha pública (para compartir por WhatsApp). */
function urlFichaPublicaAbsolutaAprobado(v) {
  const slug = String((v && v.public_slug) || "").trim();
  if (!slug) return "";
  const path = `/aprobado/${encodeURIComponent(slug)}`;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `${window.location.origin}${path}`;
  }
  if (/autodato\.cl$/i.test(host)) {
    return `https://autodato.cl${path}`;
  }
  return `${window.location.origin}${path}`;
}

function automotoraWhatsappAprobado(v) {
  if (!v) return "—";
  const nom = String(v.vendedor_nombre || "").trim();
  return nom || "—";
}

function lineasReferenciaVehiculoAprobado(v) {
  if (!v) return "";
  const lines = [];
  const slug = String(v.public_slug || "").trim();
  if (slug) lines.push(`ID ficha: ${slug}`);
  if (v.folio != null) lines.push(`Folio AutoDato: ${v.folio}`);
  const ch = String(v.numero_chasis || "").trim();
  if (ch) lines.push(`Chasis: ${ch}`);
  const pat = String(v.patente || "").trim();
  if (pat) lines.push(`Patente: ${pat}`);
  return lines.join("\n");
}

function whatsappNumeroAutodato() {
  if (typeof leerTaller === "function") {
    const t = leerTaller();
    const raw = String((t && t.whatsapp) || "").replace(/\D/g, "");
    if (raw) {
      if (raw.startsWith("56")) return raw;
      if (raw.length === 9) return `56${raw}`;
      return raw;
    }
  }
  return "56961346945";
}

function textoWhatsappConsultaVendedorAprobado(v) {
  const marca = String((v && v.marca) || "").trim() || "—";
  const modelo = String((v && v.modelo) || "").trim() || "—";
  const ano = v && v.ano != null ? String(v.ano) : "—";
  const urlFicha = urlFichaPublicaAbsolutaAprobado(v) || "—";
  const automotora = automotoraWhatsappAprobado(v);
  const ref = lineasReferenciaVehiculoAprobado(v);
  return `Hola, estoy interesado en el vehículo que vi certificado en AutoDato:

🚗 Unidad: ${marca} ${modelo} (${ano})
${ref ? `${ref}\n` : ""}📄 Ficha técnica: ${urlFicha}
📍 Automotora: ${automotora}

Quisiera consultar el precio final y coordinar para verlo/probarlo. ¿Sigue disponible?`;
}

function textoWhatsappConsultaAutodatoAprobado(v) {
  const titulo = tituloLargoAprobado(v);
  const urlFicha = urlFichaPublicaAbsolutaAprobado(v) || "—";
  const ref = lineasReferenciaVehiculoAprobado(v);
  return `Hola AutoDato, consulta sobre ficha certificada:

${ref ? `${ref}\n` : ""}Vehículo: ${titulo}
Enlace: ${urlFicha}

Necesito información sobre esta unidad revisada.`;
}

async function asegurarNubeAprobados() {
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  if (typeof nubeActiva !== "function" || !nubeActiva()) {
    throw new Error("Sin conexión a la nube.");
  }
}

function htmlBadgeAprobado(v, compact) {
  if (compact) {
    return `<span class="aprobados-badge-sello">Aprobado por AutoDato</span>`;
  }
  const tec = v && String(v.revisado_por || "").trim();
  const waTec = whatsappCertificadorAprobado(v);
  const waHrefTec = waTec
    ? `https://wa.me/${waTec}?text=${encodeURIComponent(textoWhatsappCertificadorAprobado(v))}`
    : "";
  return `<div class="aprobados-sello-block">
    <div class="aprobados-sello-row">
      <span class="aprobados-badge-sello">Aprobado por AutoDato</span>
      ${htmlRibbonReservadoAprobado(v)}
    </div>
    ${
      tec
        ? `<p class="aprobados-revisado-por">
            <span class="aprobados-revisado-por-txt">Revisado por <strong>${escapeHtml(tec)}</strong></span>
            ${
              waHrefTec
                ? `<a class="aprobados-revisado-wa" href="${escapeAttr(waHrefTec)}" target="_blank" rel="noopener noreferrer" aria-label="Contactar al certificador por WhatsApp"><img src="imagenes/icono-whatsapp.png?v=alfa1" width="22" height="22" alt="" /></a>`
                : ""
            }
          </p>`
        : ""
    }
  </div>`;
}

function fotoPlacaChasisAprobado(v) {
  const inf = v && v.informe && typeof v.informe === "object" ? v.informe : {};
  return String(inf.foto_placa_chasis || "").trim();
}

function htmlConfirmacionChasisAprobado(v) {
  const ch = String((v && v.numero_chasis) || "").trim();
  const foto = fotoPlacaChasisAprobado(v);
  if (!ch && !foto) return "";
  return `<div class="aprobados-chasis-check" aria-labelledby="aprobados-chasis-leyenda">
    <p class="aprobados-chasis-leyenda" id="aprobados-chasis-leyenda">Confirma que estás revisando el vehículo correcto</p>
    <div class="aprobados-chasis-valor">
      ${
        ch
          ? `<span class="aprobados-chasis-par"><span class="aprobados-chasis-etq">Número de chasis</span><strong>${escapeHtml(ch)}</strong></span>`
          : ""
      }
      ${
        foto
          ? `<button type="button" class="aprobados-chasis-ver-foto aprobados-thumb-open" data-aprobado-ampliar-url="${escapeAttr(
              foto
            )}" aria-label="Ver foto de la placa del chasis">Ver foto placa</button>`
          : ""
      }
    </div>
  </div>`;
}

function htmlUbicacion(v) {
  if (!mostrarDatosVendedorPub(v)) return "";
  if (!v.ubicacion_nombre && !v.ubicacion_direccion) return "";
  return `
    <div class="aprobados-ubicacion">
      <span class="aprobados-ubicacion-ico" aria-hidden="true">📍</span>
      <div>
        <strong>${escapeHtml(v.ubicacion_nombre || "Ubicación")}</strong>
        ${v.ubicacion_direccion ? `<span>${escapeHtml(v.ubicacion_direccion)}</span>` : ""}
      </div>
    </div>`;
}

function htmlPrecioBloque(v) {
  if (!mostrarDatosVendedorPub(v)) return "";
  const contado = v.precio_referencia;
  const fin = v.precio_financiado;
  const cuota = v.cuota_referencia;
  const ahorro = v.ahorro_referencia;
  if (contado == null && fin == null) {
    return `<p class="muted aprobados-precio-vacio">Precio referencial: consultar con la automotora.</p>`;
  }
  return `
    <div class="aprobados-precio-box">
      ${contado != null ? `<p class="aprobados-precio-contado">Contado <span>${escapeHtml(clpAprobado(contado))}</span></p>` : ""}
      ${
        ahorro != null && ahorro > 0
          ? `<span class="aprobados-ahorro-badge">Ahorro ref. ${escapeHtml(clpAprobado(ahorro))}</span>`
          : ""
      }
      ${
        fin != null
          ? `<p class="aprobados-precio-fin"><strong>${escapeHtml(clpAprobado(fin))}</strong> <span class="aprobados-fin-tag">financiado ref.</span></p>`
          : ""
      }
      ${cuota != null ? `<p class="aprobados-cuota">desde <strong>${escapeHtml(clpAprobado(cuota))}</strong>/mes</p>` : ""}
      <p class="aprobados-precio-leyenda">Precios del vendedor. AutoDato no vende vehículos.</p>
    </div>`;
}

function htmlCardVitrina(v) {
  const fotos = fotosAprobado(v);
  const img = fotos[0] || "";
  const kmShow = kmRealPub(v) ?? kmTableroPub(v);
  const metaTxt = escapeHtml([v.ano, v.color].filter(Boolean).join(" · "));
  const metaGar =
    mostrarDatosVendedorPub(v) && v.garantia_vendedor ? ` · <span class="aprobados-garantia">Garantía vendedor</span>` : "";
  return `
    <article class="aprobados-card" data-abrir-aprobado-slug="${escapeAttr(v.public_slug)}">
      <div class="aprobados-card-media">
        ${img ? `<img src="${escapeAttr(img)}" alt="" loading="lazy" />` : `<span class="aprobados-sin-foto">Sin foto</span>`}
        <div class="aprobados-card-badges">
          ${htmlBadgeAprobado(v, true)}
          ${estadoEsReservadoAprobado(v) ? htmlRibbonReservadoAprobado(v) : ""}
          ${v.folio != null ? `<span class="aprobados-folio">#${escapeHtml(String(v.folio))}</span>` : ""}
        </div>
      </div>
      <header class="aprobados-card-body">
        <h3>${escapeHtml(tituloLargoAprobado(v))}</h3>
        <p class="aprobados-meta">${metaTxt}${metaGar}</p>
        ${htmlUbicacion(v)}
        ${htmlPrecioBloque(v)}
        <div class="aprobados-spec-grid">
          <span><small>Kilometraje</small>${escapeHtml(fmtKmAprobado(kmShow))}</span>
          <span><small>Transmisión</small>${escapeHtml(v.transmision || "—")}</span>
          <span><small>Combustible</small>${escapeHtml(v.combustible || "—")}</span>
          <span><small>Carrocería</small>${escapeHtml(v.carroceria || "—")}</span>
        </div>
      </header>
    </article>`;
}

function filaFicha(label, valor, extra) {
  if (valor == null || String(valor).trim() === "") return extra ? "" : "";
  return `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(valor))}</strong></li>`;
}

function htmlDescripcionEquipamientoAprobado(v) {
  const sel = idsEquipamientoAprobadoSet(v && v.equipamiento);
  const bloques = APROBADO_EQUIPAMIENTO_CATALOGO.map((cat) => {
    const items = cat.items.filter((it) => sel.has(it.id));
    if (!items.length) return "";
    return `<div class="aprobados-equip-grupo">
      <h3>${escapeHtml(cat.titulo)}</h3>
      <ul class="aprobados-equip-lista">
        ${items.map((it) => `<li>${escapeHtml(it.label)}</li>`).join("")}
      </ul>
    </div>`;
  })
    .filter(Boolean)
    .join("");
  if (bloques) {
    return `<section class="aprobados-block aprobados-equip-block">
      <h2>Equipamiento</h2>
      ${bloques}
    </section>`;
  }
  const desc = String(v.descripcion || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!desc.length) return "";
  return `<section class="aprobados-block">
    <h2>Equipamiento</h2>
    <ul class="aprobados-equip-lista aprobados-equip-lista-legacy">${desc
      .map((l) => `<li>${escapeHtml(l.replace(/^[-•]\s*/, ""))}</li>`)
      .join("")}</ul>
  </section>`;
}

function htmlFichaTecnica(v) {
  const kmT = kmTableroPub(v);
  const kmR = kmRealPub(v);
  const filas = [
    filaFicha("Año", v.ano),
    filaFicha("Número de chasis", v.numero_chasis),
    kmT != null ? filaFicha("Km tablero", fmtKmAprobado(kmT)) : "",
    kmR != null ? filaFicha("Km real (revisión)", fmtKmAprobado(kmR)) : "",
    filaFicha("Carrocería", v.carroceria),
    filaFicha("Transmisión", v.transmision),
    filaFicha("Combustible", v.combustible),
    filaFicha("Cilindrada", v.cilindrada),
    filaFicha("Modelo de motor", v.modelo_motor),
    filaFicha("Color", v.color),
    filaFicha("Tracción", v.traccion),
    v.airbags != null && Number(v.airbags) > 1 ? filaFicha("Airbags", v.airbags) : "",
    v.asientos != null ? filaFicha("Asientos", v.asientos) : "",
    v.duenos != null ? filaFicha("Dueños anteriores", v.duenos) : "",
    v.folio != null ? filaFicha("Folio AutoDato", v.folio) : "",
  ].filter(Boolean);
  if (!filas.length) return "";
  return `<section class="aprobados-block">
    <h2>Ficha técnica</h2>
    <ul class="aprobados-ficha-list">${filas.join("")}</ul>
  </section>`;
}

function htmlGaleriaDetalle(v) {
  const fotos = fotosAprobado(v);
  if (!fotos.length) return `<div class="aprobados-galeria-vacia">Sin fotos</div>`;
  const idx = Math.min(Math.max(0, aprobadosUi.fotoIdx), fotos.length - 1);
  const main = fotos[idx];
  return `
    <div class="aprobados-galeria" data-aprobado-galeria>
      <div class="aprobados-galeria-main" data-aprobado-galeria-swipe>
        <button type="button" class="aprobados-galeria-zoom-hit" data-aprobado-zoom-main aria-label="Ampliar foto">
          <img src="${escapeAttr(main)}" alt="" draggable="false" />
        </button>
        ${
          fotos.length > 1
            ? `<button type="button" class="aprobados-gal-nav aprobados-gal-prev" data-aprobado-foto-dir="-1" aria-label="Anterior">‹</button>
               <button type="button" class="aprobados-gal-nav aprobados-gal-next" data-aprobado-foto-dir="1" aria-label="Siguiente">›</button>
               <span class="aprobados-gal-count">${idx + 1} / ${fotos.length}</span>`
            : ""
        }
      </div>
      ${
        fotos.length > 1
          ? `<div class="aprobados-galeria-thumbs">${fotos
              .map(
                (url, i) =>
                  `<button type="button" class="aprobados-gal-thumb${i === idx ? " is-on" : ""}" data-aprobado-foto-idx="${i}"><img src="${escapeAttr(
                    url
                  )}" alt="" /></button>`
              )
              .join("")}</div>`
          : ""
      }
    </div>`;
}

function htmlDetalleAprobado(v) {
  const inf = v.informe && typeof v.informe === "object" ? v.informe : {};
  const estet = Array.isArray(v.detalles_esteticos) ? v.detalles_esteticos : [];
  const escaner = Array.isArray(inf.escaner_imagenes) ? inf.escaner_imagenes : [];
  const yt = youtubeEmbedUrl(v.video_url);
  const pubVendedor = mostrarDatosVendedorPub(v);
  const wa = pubVendedor ? whatsappAprobado(v) : "";
  const waVendedorHref =
    pubVendedor && wa ? `https://wa.me/${wa}?text=${encodeURIComponent(textoWhatsappConsultaVendedorAprobado(v))}` : "";
  const waAutodatoHref = `https://wa.me/${whatsappNumeroAutodato()}?text=${encodeURIComponent(
    textoWhatsappConsultaAutodatoAprobado(v)
  )}`;

  const slugAttr = escapeAttr(String(v.public_slug || ""));

  return `
    <section class="panel aprobados-shell aprobados-detalle">
      <div class="aprobados-detalle-toolbar">
        <button type="button" class="aprobados-volver-mini" data-volver-aprobados aria-label="Volver al catálogo">
          <span class="aprobados-volver-mini-ico" aria-hidden="true">←</span>
          <span class="aprobados-volver-mini-txt">Catálogo</span>
        </button>
        <button type="button" class="aprobados-compartir-mini" data-aprobado-compartir="${slugAttr}" aria-label="Compartir este auto">
          <span class="aprobados-compartir-mini-ico" aria-hidden="true">⎘</span>
          <span>Compartir</span>
        </button>
      </div>
      ${htmlGaleriaDetalle(v)}
      <header class="aprobados-detalle-head">
        <p class="aprobados-marca-ano">${escapeHtml(`${v.marca || ""} · ${v.ano || ""}`.replace(/^ · | · $/g, "").trim())}</p>
        <h1>${escapeHtml(tituloLargoAprobado(v))}</h1>
        <p class="aprobados-km-line">${escapeHtml(fmtKmAprobado(kmRealPub(v) ?? kmTableroPub(v)))} · ${escapeHtml(
    v.transmision || "—"
        )} · ${escapeHtml(v.combustible || "—")}</p>
        ${htmlConfirmacionChasisAprobado(v)}
        ${htmlBadgeAprobado(v)}
      </header>
      ${htmlPrecioBloque(v)}
      ${htmlUbicacion(v)}
      <div class="aprobados-spec-grid aprobados-spec-grid-detalle">
        <span><small>Km tablero</small>${escapeHtml(fmtKmAprobado(kmTableroPub(v)))}</span>
        <span><small>Km real</small>${escapeHtml(fmtKmAprobado(kmRealPub(v)))}</span>
        <span><small>Transmisión</small>${escapeHtml(v.transmision || "—")}</span>
        <span><small>Combustible</small>${escapeHtml(v.combustible || "—")}</span>
      </div>
      ${htmlFichaTecnica(v)}
      ${htmlDescripcionEquipamientoAprobado(v)}
      ${
        estet.length
          ? `<section class="aprobados-block">
              <h2>Detalles estéticos</h2>
              <p class="muted">Estado visible del auto con transparencia.</p>
              <div class="aprobados-estetica-grid">${estet
                .map(
                  (it) => `<figure>
                    <button type="button" class="aprobados-thumb-open" data-aprobado-ampliar-url="${escapeAttr(it.url)}" aria-label="Ampliar foto">
                      <img src="${escapeAttr(it.url)}" alt="" loading="lazy" draggable="false" />
                    </button>
                    ${it.caption ? `<figcaption>${escapeHtml(it.caption)}</figcaption>` : ""}
                  </figure>`
                )
                .join("")}</div>
            </section>`
          : ""
      }
      ${
        yt
          ? `<section class="aprobados-block"><h2>Video</h2><div class="aprobados-video"><iframe src="${escapeAttr(
              yt
            )}" title="Video del vehículo" loading="lazy" allowfullscreen></iframe></div></section>`
          : ""
      }
      ${htmlInformeAutodatoAprobado(v)}
      ${
        escaner.length
          ? `<section class="aprobados-block">
              <h2>Escáner</h2>
              <div class="aprobados-estetica-grid">${escaner
                .map((it) => {
                  const url = typeof it === "string" ? it : it && it.url;
                  return url
                    ? `<figure><button type="button" class="aprobados-thumb-open" data-aprobado-ampliar-url="${escapeAttr(
                        url
                      )}" aria-label="Ampliar escáner"><img src="${escapeAttr(url)}" alt="" loading="lazy" draggable="false" /></button></figure>`
                    : "";
                })
                .join("")}</div>
            </section>`
          : ""
      }
      ${
        pubVendedor && v.vendedor_nombre
          ? `<p class="muted aprobados-vendedor">Automotora: <strong>${escapeHtml(v.vendedor_nombre)}</strong></p>`
          : ""
      }
      ${htmlMapaDetalleAprobado(v)}
      ${
        waVendedorHref || waAutodatoHref
          ? `<div class="aprobados-wa-stack">
              ${
                waVendedorHref
                  ? `<a class="aprobados-wa-cta aprobados-wa-cta-vendedor btn-block" href="${escapeAttr(waVendedorHref)}" target="_blank" rel="noopener noreferrer" data-aprobado-wa-metric="${slugAttr}">
              <img src="imagenes/icono-whatsapp.png?v=alfa1" width="28" height="28" alt="" aria-hidden="true" />
              <span>Contactar al vendedor por WhatsApp</span>
            </a>`
                  : ""
              }
              <a class="aprobados-wa-cta aprobados-wa-cta-autodato btn-block" href="${escapeAttr(waAutodatoHref)}" target="_blank" rel="noopener noreferrer">
              <img src="imagenes/icono-whatsapp.png?v=alfa1" width="28" height="28" alt="" aria-hidden="true" />
              <span>Contactar a AutoDato por WhatsApp</span>
            </a>
            </div>`
          : ""
      }
      <a class="aprobados-que-es-autodato btn-block" href="${escapeAttr(APROBADO_URL_QUE_ES_AUTODATO)}" target="_blank" rel="noopener noreferrer">
        QUÉ ES AUTODATO?
      </a>
      <button type="button" class="aprobados-volver-catalogo btn-block" data-volver-aprobados>Volver al catálogo</button>
      <p class="aprobados-legal">AutoDato certifica la revisión; la venta es entre comprador y automotora.</p>
    </section>`;
}

function pintarVitrinaAprobados() {
  const lista = aprobadosUi.lista;
  const inner = lista.length
    ? `<div class="aprobados-lista">${lista.map(htmlCardVitrina).join("")}</div>`
  : `<p class="lead aprobados-vacio">Aún no hay vehículos aprobados publicados. Vuelve pronto.</p>`;
  const shell = $("stage") && $("stage").querySelector(".aprobados-shell");
  if (shell) {
    const box = shell.querySelector(".aprobados-lista-wrap");
    if (box) box.innerHTML = inner;
  }
}

function mostrarAvisoCatalogoAprobados() {
  const el = $("modal-aprobados-aviso");
  if (!el) return;
  el.hidden = false;
  document.body.classList.add("aprobados-aviso-on");
}

function cerrarAvisoCatalogoAprobados() {
  const el = $("modal-aprobados-aviso");
  if (el) el.hidden = true;
  document.body.classList.remove("aprobados-aviso-on");
}

let aprobadoSlugPendienteAviso = "";

function prepararDetalleAprobadoConAviso(slug) {
  aprobadoSlugPendienteAviso = String(slug || "").trim();
  if (typeof state !== "undefined") {
    state.vista = "aprobado-detalle";
    state.aprobadoSlug = aprobadoSlugPendienteAviso;
  }
  document.body.classList.add("en-aprobados");
  document.body.classList.remove("en-portada");
  if ($("stage")) {
    $("stage").innerHTML = `<section class="panel aprobados-shell" aria-hidden="true"></section>`;
  }
  if (typeof marcarMenu === "function") marcarMenu();
  if (typeof syncCromo === "function") syncCromo();
  mostrarAvisoCatalogoAprobados();
}

function continuarAvisoCatalogoAprobados() {
  const slug = aprobadoSlugPendienteAviso;
  aprobadoSlugPendienteAviso = "";
  cerrarAvisoCatalogoAprobados();
  if (slug) void abrirAprobadoPorSlug(slug);
}

async function renderVitrinaAprobados() {
  document.body.classList.add("en-aprobados");
  document.body.classList.remove("en-portada");
  $("stage").innerHTML = `
    <section class="panel aprobados-shell">
      <header class="aprobados-hero">
        <h1>Aprobados AutoDato</h1>
        <p class="lead">Autos revisados en ZOFRI y afuera. Visite con confianza antes de comprar.</p>
      </header>
      <div class="aprobados-lista-wrap"><p class="muted">Cargando vitrina…</p></div>
    </section>`;
  try {
    await asegurarNubeAprobados();
    aprobadosUi.lista =
      typeof nubeListarAprobadosPublicos === "function" ? await nubeListarAprobadosPublicos() : [];
    const lista = aprobadosUi.lista;
    const inner = lista.length
      ? `<div class="aprobados-lista">${lista.map(htmlCardVitrina).join("")}</div>`
      : `<p class="lead aprobados-vacio">Aún no hay vehículos con sello publicado. En el panel, cambia el estado a <strong>Aprobado</strong>.</p>`;
    const box = $("stage").querySelector(".aprobados-lista-wrap");
    if (box) box.innerHTML = inner;
  } catch (e) {
    const box = $("stage").querySelector(".aprobados-lista-wrap");
    if (box) {
      box.innerHTML = `<p class="muted">No pudimos cargar la vitrina. Revisa la conexión.</p>`;
    }
  }
}

async function abrirAprobadoPorSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return;
  const entradaDesdeQrImpreso = ingresoFichaDesdeQrImpreso();
  if (typeof state !== "undefined") {
    state.vista = "aprobado-detalle";
    state.aprobadoSlug = s;
  }
  aprobadosUi.fotoIdx = 0;
  $("stage").innerHTML = `<section class="panel aprobados-shell"><p class="lead">Cargando ficha…</p></section>`;
  document.body.classList.add("en-aprobados");
  try {
    await asegurarNubeAprobados();
    const row = typeof nubeAprobadoPublicoPorSlug === "function" ? await nubeAprobadoPublicoPorSlug(s) : null;
    if (!row) {
      $("stage").innerHTML = `<section class="panel aprobados-shell">
        <p class="lead">No encontramos esta ficha o aún no está aprobada.</p>
        <button type="button" class="btn-primary" data-volver-aprobados>Volver</button>
      </section>`;
      return;
    }
    aprobadosUi.detalle = row;
    $("stage").innerHTML = htmlDetalleAprobado(row);
    enlazarGaleriaAprobadosDetalle();
    registrarVisitaFichaAprobado(s, entradaDesdeQrImpreso);
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState({ vista: "aprobado-detalle", slug: s }, "", urlAprobadoPath(s));
    }
  } catch (_e) {
    $("stage").innerHTML = `<section class="panel aprobados-shell"><p class="muted">Error al cargar la ficha.</p></section>`;
  }
  if (typeof marcarMenu === "function") marcarMenu();
  if (typeof syncCromo === "function") syncCromo();
}

async function renderDetalleAprobadoPublico(slug) {
  await abrirAprobadoPorSlug(slug || (typeof state !== "undefined" ? state.aprobadoSlug : ""));
}

function navegarAprobadosVitrina() {
  if (typeof state !== "undefined") {
    state.vista = "aprobados";
    state.aprobadoSlug = "";
  }
  aprobadosUi.fotoIdx = 0;
  if (typeof history !== "undefined" && history.replaceState) {
    history.replaceState({ vista: "aprobados" }, "", "/aprobados");
  }
  if (typeof renderVista === "function") renderVista();
}

function refrescarGaleriaAprobadoEnDom() {
  const v = aprobadosUi.detalle;
  if (!v) return;
  const gal = $("stage") && $("stage").querySelector("[data-aprobado-galeria]");
  if (!gal || !gal.closest(".aprobados-detalle")) return;
  gal.outerHTML = htmlGaleriaDetalle(v);
  enlazarGaleriaAprobadosDetalle();
}

function cambiarFotoAprobado(delta) {
  const v = aprobadosUi.detalle;
  if (!v) return;
  const fotos = fotosAprobado(v);
  if (!fotos.length) return;
  const d = Number(delta);
  if (!Number.isFinite(d)) return;
  aprobadosUi.fotoIdx = (aprobadosUi.fotoIdx + d + fotos.length) % fotos.length;
  refrescarGaleriaAprobadoEnDom();
}

function irFotoAprobadoIdx(idx) {
  const v = aprobadosUi.detalle;
  if (!v) return;
  const fotos = fotosAprobado(v);
  if (!fotos.length) return;
  const i = Number(idx);
  if (!Number.isFinite(i)) return;
  aprobadosUi.fotoIdx = Math.min(Math.max(0, i), fotos.length - 1);
  refrescarGaleriaAprobadoEnDom();
}

const aprobadosLb = {
  urls: [],
  idx: 0,
  scale: 1,
  tx: 0,
  ty: 0,
  pointers: new Map(),
  pinchStartDist: 0,
  pinchStartScale: 1,
};

function asegurarLightboxAprobados() {
  let root = document.getElementById("aprobados-lightbox");
  if (root) return root;
  root = document.createElement("div");
  root.id = "aprobados-lightbox";
  root.className = "aprobados-lightbox";
  root.hidden = true;
  root.innerHTML = `
    <button type="button" class="aprobados-lb-close" data-aprobados-lb-close aria-label="Cerrar">×</button>
    <div class="aprobados-lb-viewport" data-aprobados-lb-viewport>
      <img src="" alt="" data-aprobados-lb-img draggable="false" />
    </div>
    <button type="button" class="aprobados-lb-nav aprobados-lb-prev" data-aprobados-lb-dir="-1" aria-label="Anterior">‹</button>
    <button type="button" class="aprobados-lb-nav aprobados-lb-next" data-aprobados-lb-dir="1" aria-label="Siguiente">›</button>
    <span class="aprobados-lb-count" data-aprobados-lb-count hidden></span>`;
  document.body.appendChild(root);

  root.querySelector("[data-aprobados-lb-close]")?.addEventListener("click", cerrarLightboxAprobados);
  root.addEventListener("click", (e) => {
    if (e.target === root) cerrarLightboxAprobados();
  });
  root.querySelectorAll("[data-aprobados-lb-dir]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      pasarLightboxAprobado(Number(btn.getAttribute("data-aprobados-lb-dir")));
    });
  });

  const vp = root.querySelector("[data-aprobados-lb-viewport]");
  const img = root.querySelector("[data-aprobados-lb-img]");
  if (vp && img) {
    vp.addEventListener(
      "touchstart",
      (e) => {
        for (const t of e.changedTouches) {
          aprobadosLb.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        if (aprobadosLb.pointers.size === 2) {
          aprobadosLb.pinchStartDist = distanciaPinchAprobados();
          aprobadosLb.pinchStartScale = aprobadosLb.scale;
        }
      },
      { passive: true }
    );
    vp.addEventListener(
      "touchmove",
      (e) => {
        for (const t of e.changedTouches) {
          const p = aprobadosLb.pointers.get(t.identifier);
          if (p) {
            p.x = t.clientX;
            p.y = t.clientY;
          }
        }
        if (aprobadosLb.pointers.size >= 2) {
          e.preventDefault();
          const dist = distanciaPinchAprobados();
          if (aprobadosLb.pinchStartDist > 0) {
            aprobadosLb.scale = Math.min(4, Math.max(1, (aprobadosLb.pinchStartScale * dist) / aprobadosLb.pinchStartDist));
            aplicarTransformLightboxAprobados(img);
          }
        } else if (aprobadosLb.pointers.size === 1 && aprobadosLb.scale > 1) {
          const t = e.changedTouches[0];
          const p = aprobadosLb.pointers.get(t.identifier);
          if (p) {
            const dx = t.clientX - p.x;
            const dy = t.clientY - p.y;
            aprobadosLb.tx += dx;
            aprobadosLb.ty += dy;
            p.x = t.clientX;
            p.y = t.clientY;
            aplicarTransformLightboxAprobados(img);
            if (dx !== 0 || dy !== 0) e.preventDefault();
          }
        }
      },
      { passive: false }
    );
    const onTouchEndLb = (e) => {
      for (const t of e.changedTouches) aprobadosLb.pointers.delete(t.identifier);
      if (aprobadosLb.scale <= 1.02) {
        aprobadosLb.scale = 1;
        aprobadosLb.tx = 0;
        aprobadosLb.ty = 0;
        aplicarTransformLightboxAprobados(img);
      }
    };
    vp.addEventListener("touchend", onTouchEndLb);
    vp.addEventListener("touchcancel", onTouchEndLb);

    let swipeX0 = 0;
    let swipeY0 = 0;
    let swipeActive = false;
    vp.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1 || aprobadosLb.scale > 1) return;
        swipeX0 = e.touches[0].clientX;
        swipeY0 = e.touches[0].clientY;
        swipeActive = true;
      },
      { passive: true }
    );
    vp.addEventListener(
      "touchend",
      (e) => {
        if (!swipeActive || aprobadosLb.scale > 1) return;
        swipeActive = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - swipeX0;
        const dy = t.clientY - swipeY0;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2 && aprobadosLb.urls.length > 1) {
          pasarLightboxAprobado(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }
  return root;
}

function distanciaPinchAprobados() {
  const pts = [...aprobadosLb.pointers.values()];
  if (pts.length < 2) return 0;
  const dx = pts[1].x - pts[0].x;
  const dy = pts[1].y - pts[0].y;
  return Math.hypot(dx, dy);
}

function aplicarTransformLightboxAprobados(img) {
  if (!img) return;
  img.style.transform = `translate3d(${aprobadosLb.tx}px, ${aprobadosLb.ty}px, 0) scale(${aprobadosLb.scale})`;
}

function resetLightboxTransform() {
  aprobadosLb.scale = 1;
  aprobadosLb.tx = 0;
  aprobadosLb.ty = 0;
  aprobadosLb.pointers.clear();
}

function pintarLightboxAprobados() {
  const root = asegurarLightboxAprobados();
  const img = root.querySelector("[data-aprobados-lb-img]");
  const count = root.querySelector("[data-aprobados-lb-count]");
  const prev = root.querySelector(".aprobados-lb-prev");
  const next = root.querySelector(".aprobados-lb-next");
  const url = aprobadosLb.urls[aprobadosLb.idx] || "";
  if (img) {
    resetLightboxTransform();
    img.src = url;
    aplicarTransformLightboxAprobados(img);
  }
  const multi = aprobadosLb.urls.length > 1;
  if (prev) prev.hidden = !multi;
  if (next) next.hidden = !multi;
  if (count) {
    count.hidden = !multi;
    count.textContent = `${aprobadosLb.idx + 1} / ${aprobadosLb.urls.length}`;
  }
}

function abrirLightboxAprobados(urls, startIdx) {
  const list = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!list.length) return;
  const root = asegurarLightboxAprobados();
  aprobadosLb.urls = list;
  aprobadosLb.idx = Math.min(Math.max(0, Number(startIdx) || 0), list.length - 1);
  pintarLightboxAprobados();
  root.hidden = false;
  document.body.classList.add("aprobados-lb-abierto");
}

function abrirLightboxGaleriaPrincipalAprobado() {
  const v = aprobadosUi.detalle;
  if (!v) return;
  const fotos = fotosAprobado(v);
  if (!fotos.length) return;
  abrirLightboxAprobados(fotos, aprobadosUi.fotoIdx);
}

function abrirLightboxUrlAprobado(url) {
  const u = String(url || "").trim();
  if (!u) return;
  abrirLightboxAprobados([u], 0);
}

function pasarLightboxAprobado(delta) {
  if (aprobadosLb.urls.length < 2) return;
  const d = Number(delta);
  if (!Number.isFinite(d)) return;
  aprobadosLb.idx = (aprobadosLb.idx + d + aprobadosLb.urls.length) % aprobadosLb.urls.length;
  if (aprobadosUi.detalle) {
    const fotos = fotosAprobado(aprobadosUi.detalle);
    const mismaGaleria =
      aprobadosLb.urls.length === fotos.length && aprobadosLb.urls.every((u, i) => u === fotos[i]);
    if (mismaGaleria) {
      aprobadosUi.fotoIdx = aprobadosLb.idx;
      refrescarGaleriaAprobadoEnDom();
    }
  }
  pintarLightboxAprobados();
}

function cerrarLightboxAprobados() {
  const root = document.getElementById("aprobados-lightbox");
  if (!root) return;
  root.hidden = true;
  document.body.classList.remove("aprobados-lb-abierto");
  resetLightboxTransform();
}

function enlazarGaleriaAprobadosDetalle() {
  const swipeEl = $("stage") && $("stage").querySelector("[data-aprobado-galeria-swipe]");
  if (swipeEl && !swipeEl.dataset.galeriaSwipe) {
    swipeEl.dataset.galeriaSwipe = "1";
    let x0 = 0;
    let y0 = 0;
    let tracking = false;
    swipeEl.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
        tracking = true;
      },
      { passive: true }
    );
    swipeEl.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          cambiarFotoAprobado(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }
}

function rutaAprobadoInicial() {
  const path = String(location.pathname || "");
  const m = path.match(/^\/aprobado\/([^/]+)\/?$/i);
  if (m) return { vista: "aprobado-detalle", slug: decodeURIComponent(m[1]) };
  if (/^\/aprobados\/?$/i.test(path)) return { vista: "aprobados", slug: "" };
  return null;
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-aprobados-aviso-continuar]")) {
    continuarAvisoCatalogoAprobados();
    return;
  }
  const wa = e.target.closest("[data-aprobado-wa-metric]");
  if (wa && wa.dataset.aprobadoWaMetric) {
    registrarClicWhatsappAprobado(wa.dataset.aprobadoWaMetric);
    return;
  }
  const maps = e.target.closest("[data-aprobado-maps-metric]");
  if (maps && maps.dataset.aprobadoMapsMetric) {
    registrarClicMapsAprobado(maps.dataset.aprobadoMapsMetric);
    return;
  }
  const comp = e.target.closest("[data-aprobado-compartir]");
  if (comp && comp.dataset.aprobadoCompartir) {
    const v = aprobadosUi.detalle;
    if (v && String(v.public_slug) === comp.dataset.aprobadoCompartir) {
      void compartirFichaAprobado(v);
    }
    return;
  }
});
