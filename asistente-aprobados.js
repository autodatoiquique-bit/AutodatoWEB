/**
 * Webhook Vambe: resolver vehículo certificado (catálogo Aprobados) desde WhatsApp.
 * POST /api/vambe/aprobados/lookup
 * POST /api/vambe/aprobados/lookup-flat
 */
"use strict";

const { tokenAsistenteValido } = require("./asistente-precios");

const SITE_BASE = String(process.env.PUBLIC_SITE_URL || "https://autodato.cl").replace(/\/$/, "");

const INFORME_KEYS_PUBLICOS = [
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

function supabaseServiceConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

function numOk(v) {
  return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function jsonObj(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      return j && typeof j === "object" && !Array.isArray(j) ? j : {};
    } catch (_e) {
      return {};
    }
  }
  return {};
}

function jsonLista(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch (_e) {
      return [];
    }
  }
  return [];
}

/** Misma prioridad que la ficha pública: galería → primera foto; si no, `foto_portada`. */
function urlsGaleriaAprobado(row) {
  if (!row) return [];
  return jsonLista(row.galeria)
    .map((x) => String((typeof x === "string" ? x : x && x.url) || "").trim())
    .filter(Boolean);
}

function fotoPortadaAprobado(row) {
  const gal = urlsGaleriaAprobado(row);
  if (gal.length) return gal[0];
  const p = String((row && row.foto_portada) || "").trim();
  return p || null;
}

function vehiculoPublicable(row) {
  if (!row || typeof row !== "object") return false;
  const est = String(row.estado || "").trim();
  if (est !== "aprobado" && est !== "reservado") return false;
  if (row.vigente_hasta) {
    const fin = new Date(row.vigente_hasta);
    if (Number.isFinite(fin.getTime()) && fin <= new Date()) return false;
  }
  return true;
}

function slugDesdeUrlFicha(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const m =
    u.match(/\/aprobado\/([^/?#\s]+)/i) ||
    u.match(/[?&]slug=([^&#\s]+)/i);
  return m ? decodeURIComponent(m[1]).trim() : "";
}

function normalizarChasis(v) {
  return String(v || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizarPatente(v) {
  return String(v || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function tituloVehiculo(row) {
  const marca = String(row.marca || "").trim();
  const modelo = String(row.modelo || "").trim();
  const ano = row.ano != null ? String(row.ano) : "";
  return [marca, modelo, ano].filter(Boolean).join(" ").trim() || "Vehículo certificado";
}

function urlFichaPublica(slug) {
  const s = String(slug || "").trim();
  return s ? `${SITE_BASE}/aprobado/${encodeURIComponent(s)}` : "";
}

function urlStoryShareAprobado(slug) {
  const s = String(slug || "").trim();
  return s ? `${SITE_BASE}/story/aprobado/${encodeURIComponent(s)}.jpg` : "";
}

function clp(n) {
  const x = numOk(n);
  if (x == null) return null;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(x);
}

function parseReferenciasDesdeMensaje(text) {
  const t = String(text || "");
  const out = {};

  const mVr = t.match(/vambe_ref:\s*(\{[\s\S]*?\})/i);
  if (mVr) {
    try {
      const j = JSON.parse(mVr[1]);
      if (j && typeof j === "object") {
        if (j.public_slug) out.public_slug = String(j.public_slug).trim();
        if (j.folio != null) out.folio = numOk(j.folio);
        if (j.numero_chasis) out.numero_chasis = String(j.numero_chasis).trim();
        if (j.patente) out.patente = normalizarPatente(j.patente);
      }
    } catch (_e) {
      /* ignore */
    }
  }

  const mSlug = t.match(/ID ficha:\s*(\S+)/i);
  if (mSlug && !out.public_slug) out.public_slug = mSlug[1].trim();

  const mFolio = t.match(/Folio AutoDato:\s*(\d+)/i);
  if (mFolio && out.folio == null) out.folio = Number(mFolio[1]);

  const mCh = t.match(/Chasis:\s*([^\n\r]+)/i);
  if (mCh && !out.numero_chasis) out.numero_chasis = String(mCh[1]).trim();

  const mPat = t.match(/Patente:\s*([^\n\r]+)/i);
  if (mPat && !out.patente) out.patente = normalizarPatente(mPat[1]);

  const mUrl = t.match(/Enlace:\s*(https?:\/\/[^\s]+)/i) || t.match(/(https?:\/\/[^\s]*\/aprobado\/[^/\s?#]+)/i);
  if (mUrl) {
    const url = String(mUrl[1] || mUrl[0] || "").trim();
    out.ficha_url = url;
    const slug = slugDesdeUrlFicha(url);
    if (slug && !out.public_slug) out.public_slug = slug;
  }

  return out;
}

function lookupFlatBodyToInternal(body) {
  const b = body || {};
  const ref = b.reference && typeof b.reference === "object" ? b.reference : {};
  const whatsapp_message = String(
    b.whatsapp_message || b.message_text || b.mensaje || b.text || b.customer_message || ""
  ).trim();

  const parsed = whatsapp_message ? parseReferenciasDesdeMensaje(whatsapp_message) : {};

  return {
    public_slug: String(b.public_slug || b.id_ficha || b.slug || ref.public_slug || parsed.public_slug || "").trim(),
    folio: numOk(b.folio != null ? b.folio : ref.folio != null ? ref.folio : parsed.folio),
    numero_chasis: String(
      b.numero_chasis || b.chasis || ref.numero_chasis || parsed.numero_chasis || ""
    ).trim(),
    patente: normalizarPatente(b.patente || ref.patente || parsed.patente || ""),
    ficha_url: String(b.ficha_url || b.url || b.enlace || ref.ficha_url || parsed.ficha_url || "").trim(),
    channel: String(b.channel || "vambe").trim() || "vambe",
    whatsapp_message,
  };
}

function tieneReferencia(ref) {
  return Boolean(
    ref.public_slug ||
      ref.folio != null ||
      ref.numero_chasis ||
      ref.patente ||
      ref.ficha_url ||
      ref.whatsapp_message
  );
}

async function supabaseSelectAprobados(queryParams) {
  const cfg = supabaseServiceConfig();
  if (!cfg) {
    return { ok: false, error_code: "SUPABASE_NOT_CONFIGURED", rows: [] };
  }
  const qs = new URLSearchParams(queryParams);
  qs.set("select", "*");
  qs.set("limit", "5");
  const r = await fetch(`${cfg.url}/rest/v1/vehiculos_aprobados?${qs.toString()}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });
  const texto = await r.text();
  let data = null;
  try {
    data = texto ? JSON.parse(texto) : [];
  } catch (_e) {
    data = null;
  }
  if (!r.ok) {
    return {
      ok: false,
      error_code: "SUPABASE_ERROR",
      detail: (data && data.message) || texto.slice(0, 200),
      rows: [],
    };
  }
  return { ok: true, rows: Array.isArray(data) ? data : [] };
}

async function buscarPorCampo(campo, valor) {
  const qs = new URLSearchParams();
  qs.set(campo, `eq.${valor}`);
  return supabaseSelectAprobados(qs);
}

function filasPublicables(rows) {
  return (rows || []).filter(vehiculoPublicable);
}

function construirInformeResumen(informeRaw) {
  const informe = jsonObj(informeRaw);
  const items = [];
  for (const c of INFORME_KEYS_PUBLICOS) {
    const texto = String(informe[c.key] || "").trim();
    if (texto) items.push({ key: c.key, label: c.label, text: texto });
  }
  const conclusion = String(informe.conclusion || "").trim();
  const informe_pdf = String(informe.informe_pdf || "").trim() || null;
  return { conclusion, informe_pdf, items };
}

function vehiculoParaVambe(row, matchedBy) {
  const slug = String(row.public_slug || "").trim();
  const kmReal = numOk(row.kilometraje_real ?? row.kilometraje);
  const kmTab = numOk(row.kilometraje_tablero ?? row.kilometraje);
  const informe_resumen = construirInformeResumen(row.informe);
  const titulo = tituloVehiculo(row);
  const ficha_url = urlFichaPublica(slug);
  const foto_portada_url = fotoPortadaAprobado(row);
  const galeria_urls = urlsGaleriaAprobado(row);
  const informeObj = jsonObj(row.informe);
  const foto_placa_chasis_url = String(informeObj.foto_placa_chasis || "").trim() || null;
  const mostrarVendedor = row.mostrar_datos_vendedor !== false;

  const lines = [];
  lines.push(`Certificado AutoDato: ${titulo}.`);
  if (row.folio != null) lines.push(`Folio de revisión: ${row.folio}.`);
  if (row.revisado_por) lines.push(`Revisado por el técnico ${String(row.revisado_por).trim()}.`);
  if (row.numero_chasis) lines.push(`Chasis: ${String(row.numero_chasis).trim()}.`);
  if (mostrarVendedor && row.vendedor_nombre) lines.push(`Automotora / vendedor: ${String(row.vendedor_nombre).trim()}.`);
  if (kmReal != null) lines.push(`Kilometraje real (revisión): ${kmReal.toLocaleString("es-CL")} km.`);
  lines.push(`Ficha pública: ${ficha_url}`);
  lines.push(
    "AutoDato certifica la revisión técnica; la venta y el precio final son con la automotora. Para comprar o agendar visita, ofrece contactar al vendedor."
  );

  return {
    public_slug: slug,
    folio: numOk(row.folio),
    title: titulo,
    marca: String(row.marca || "").trim(),
    modelo: String(row.modelo || "").trim(),
    version: String(row.version || "").trim() || null,
    ano: numOk(row.ano),
    patente: normalizarPatente(row.patente) || null,
    numero_chasis: String(row.numero_chasis || "").trim() || null,
    color: String(row.color || "").trim() || null,
    transmision: String(row.transmision || "").trim() || null,
    combustible: String(row.combustible || "").trim() || null,
    carroceria: String(row.carroceria || "").trim() || null,
    kilometraje_tablero: kmTab,
    kilometraje_real: kmReal,
    revisado_por: String(row.revisado_por || "").trim() || null,
    revisado_whatsapp: String(row.revisado_whatsapp || "").trim() || null,
    garantia_vendedor: mostrarVendedor ? Boolean(row.garantia_vendedor) : false,
    mostrar_datos_vendedor: mostrarVendedor,
    vendedor: mostrarVendedor
      ? {
          nombre: String(row.vendedor_nombre || "").trim() || null,
          telefono: String(row.vendedor_telefono || "").trim() || null,
          whatsapp: String(row.whatsapp_contacto || "").trim() || null,
        }
      : null,
    ubicacion: mostrarVendedor
      ? {
          nombre: String(row.ubicacion_nombre || "").trim() || null,
          direccion: String(row.ubicacion_direccion || "").trim() || null,
          maps_url: String(row.ubicacion_maps || "").trim() || null,
        }
      : null,
    precios: mostrarVendedor
      ? {
          referencia: numOk(row.precio_referencia),
          referencia_texto: clp(row.precio_referencia),
          financiado: numOk(row.precio_financiado),
          financiado_texto: clp(row.precio_financiado),
          cuota_mensual: numOk(row.cuota_referencia),
          cuota_mensual_texto: clp(row.cuota_referencia),
          ahorro_referencia: numOk(row.ahorro_referencia),
          nota: "Precios referenciales del vendedor; confirmar disponibilidad y monto con la automotora.",
        }
      : {
          referencia: null,
          referencia_texto: null,
          financiado: null,
          financiado_texto: null,
          cuota_mensual: null,
          cuota_mensual_texto: null,
          ahorro_referencia: null,
          nota: "Datos del vendedor no publicados en esta ficha.",
        },
    descripcion: String(row.descripcion || "").trim() || null,
    ficha_url,
    foto_portada_url,
    imagenes: {
      portada: foto_portada_url,
      galeria: galeria_urls.length ? galeria_urls : foto_portada_url ? [foto_portada_url] : [],
      placa_chasis: foto_placa_chasis_url,
    },
    foto_placa_chasis_url,
    informe_resumen,
    estado: String(row.estado || "").trim() || null,
    reservado: String(row.estado || "").trim() === "reservado",
    matched_by: matchedBy,
    message_for_assistant: lines.join(" "),
  };
}

async function resolverUnicaFila(rows, matchedBy) {
  const publicables = filasPublicables(rows);
  if (!publicables.length) {
    const ocultas = (rows || []).length;
    if (ocultas) {
      return {
        ok: false,
        error_code: "VEHICLE_NOT_PUBLISHED",
        message: "Hay un registro con esos datos, pero la ficha no está publicada o está vencida.",
      };
    }
    return { ok: false, error_code: "NOT_FOUND", message: "No encontramos un vehículo certificado con esos datos." };
  }
  if (publicables.length > 1) {
    return {
      ok: false,
      error_code: "AMBIGUOUS_MATCH",
      message: "Hay más de un vehículo con esos datos. Pide al cliente el ID ficha o el enlace completo.",
      candidates: publicables.slice(0, 5).map((r) => ({
        public_slug: r.public_slug,
        folio: r.folio,
        title: tituloVehiculo(r),
        ficha_url: urlFichaPublica(r.public_slug),
        foto_portada_url: fotoPortadaAprobado(r),
      })),
    };
  }
  return {
    ok: true,
    vehicle: vehiculoParaVambe(publicables[0], matchedBy),
    matched_by: matchedBy,
  };
}

async function lookupAprobadoVambe(body) {
  const ref = lookupFlatBodyToInternal(body);
  if (!tieneReferencia(ref)) {
    return {
      ok: false,
      error_code: "REFERENCE_REQUIRED",
      message:
        "Indica public_slug, folio, chasis, patente, ficha_url o el texto completo del WhatsApp del cliente (whatsapp_message).",
    };
  }

  if (ref.ficha_url && !ref.public_slug) {
    ref.public_slug = slugDesdeUrlFicha(ref.ficha_url);
  }

  const intentos = [];

  if (ref.public_slug) {
    intentos.push({
      by: "public_slug",
      run: () => buscarPorCampo("public_slug", ref.public_slug),
    });
  }
  if (ref.folio != null) {
    intentos.push({
      by: "folio",
      run: () => buscarPorCampo("folio", String(ref.folio)),
    });
  }
  if (ref.numero_chasis) {
    const rawCh = String(ref.numero_chasis).trim();
    const normCh = normalizarChasis(rawCh);
    intentos.push({
      by: "numero_chasis",
      run: async () => {
        let fetched = await buscarPorCampo("numero_chasis", rawCh);
        if (fetched.ok && fetched.rows.length) return fetched;
        if (normCh && normCh !== rawCh) {
          fetched = await buscarPorCampo("numero_chasis", normCh);
        }
        return fetched;
      },
    });
  }
  if (ref.patente) {
    intentos.push({
      by: "patente",
      run: () => buscarPorCampo("patente", ref.patente),
    });
  }

  const cfg = supabaseServiceConfig();
  if (!cfg) {
    return {
      ok: false,
      error_code: "SUPABASE_NOT_CONFIGURED",
      message: "Falta SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el servidor.",
    };
  }

  let ultimoNotFound = null;
  for (const step of intentos) {
    const fetched = await step.run();
    if (!fetched.ok) {
      return {
        ok: false,
        error_code: fetched.error_code || "SUPABASE_ERROR",
        message: "No pudimos consultar el catálogo de aprobados.",
        detail: fetched.detail || null,
      };
    }
    const resolved = await resolverUnicaFila(fetched.rows, step.by);
    if (resolved.ok) {
      return {
        ok: true,
        channel: ref.channel,
        matched_by: resolved.matched_by,
        vehicle: resolved.vehicle,
        reference_used: {
          public_slug: ref.public_slug || null,
          folio: ref.folio,
          numero_chasis: ref.numero_chasis || null,
          patente: ref.patente || null,
          ficha_url: ref.ficha_url || null,
          parsed_from_message: Boolean(ref.whatsapp_message),
        },
      };
    }
    if (resolved.error_code === "AMBIGUOUS_MATCH") return resolved;
    if (resolved.error_code === "VEHICLE_NOT_PUBLISHED") return resolved;
    ultimoNotFound = resolved;
  }

  if (ultimoNotFound) return ultimoNotFound;
  return {
    ok: false,
    error_code: "NOT_FOUND",
    message: "No encontramos un vehículo certificado con esos datos.",
  };
}

function lookupErrorStatus(code) {
  if (code === "REFERENCE_REQUIRED") return 400;
  if (code === "NOT_FOUND" || code === "VEHICLE_NOT_PUBLISHED") return 404;
  if (code === "AMBIGUOUS_MATCH") return 409;
  if (code === "SUPABASE_NOT_CONFIGURED") return 501;
  if (code === "SUPABASE_ERROR") return 502;
  return 400;
}

function escMetaHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function urlImagenAbsolutaAprobado(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  const base = SITE_BASE.replace(/\/$/, "");
  return u.startsWith("/") ? `${base}${u}` : `${base}/${u}`;
}

async function fetchAprobadoRowBySlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const qs = new URLSearchParams();
  qs.set("public_slug", `eq.${s}`);
  const fetched = await supabaseSelectAprobados(qs);
  if (!fetched.ok || !fetched.rows.length) return null;
  const row = fetched.rows[0];
  return vehiculoPublicable(row) ? row : null;
}

function buildOpenGraphMetaAprobado(row) {
  if (!row) return null;
  const slug = String(row.public_slug || "").trim();
  const titulo = tituloVehiculo(row);
  const image = `${SITE_BASE}/og/aprobado/${encodeURIComponent(slug)}.jpg?v=2`;
  const folio = row.folio != null ? ` Folio ${row.folio}.` : "";
  return {
    title: `${titulo} — Aprobado por AutoDato`,
    description: `Vehículo certificado por AutoDato.${folio} Revisa fotos, informe y ficha técnica.`,
    url: urlFichaPublica(slug),
    image,
    imageWidth: 1200,
    imageHeight: 630,
  };
}

function htmlOpenGraphTags(meta) {
  if (!meta) return "";
  let tags = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="AutoDato" />
    <meta property="og:locale" content="es_CL" />
    <meta property="og:title" content="${escMetaHtml(meta.title)}" />
    <meta property="og:description" content="${escMetaHtml(meta.description)}" />
    <meta property="og:url" content="${escMetaHtml(meta.url)}" />
    <meta name="description" content="${escMetaHtml(meta.description)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escMetaHtml(meta.title)}" />
    <meta name="twitter:description" content="${escMetaHtml(meta.description)}" />`;
  if (meta.image) {
    tags += `
    <meta property="og:image" content="${escMetaHtml(meta.image)}" />
    <meta property="og:image:secure_url" content="${escMetaHtml(meta.image)}" />
    <meta name="twitter:image" content="${escMetaHtml(meta.image)}" />`;
    if (meta.imageWidth) {
      tags += `
    <meta property="og:image:width" content="${escMetaHtml(String(meta.imageWidth))}" />
    <meta property="og:image:height" content="${escMetaHtml(String(meta.imageHeight || 630))}" />`;
    }
  }
  return tags;
}

function inyectarOpenGraphEnHtml(html, meta) {
  if (!meta || !html) return html;
  let out = String(html).replace(/<title>[\s\S]*?<\/title>/i, `<title>${escMetaHtml(meta.title)}</title>`);
  const block = htmlOpenGraphTags(meta);
  if (!block) return out;
  return out.replace("</head>", `${block}\n</head>`);
}

module.exports = {
  lookupAprobadoVambe,
  lookupFlatBodyToInternal,
  parseReferenciasDesdeMensaje,
  lookupErrorStatus,
  tokenAsistenteValido,
  fetchAprobadoRowBySlug,
  buildOpenGraphMetaAprobado,
  inyectarOpenGraphEnHtml,
  fotoPortadaAprobado,
  tituloVehiculo,
  urlImagenAbsolutaAprobado,
  urlFichaPublica,
};
