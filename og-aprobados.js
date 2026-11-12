/**
 * Imagen Open Graph 1200×630 para fichas aprobados (mejor vista en Instagram / WhatsApp).
 */
"use strict";

const sharp = require("sharp");
const asistenteAprobados = require("./asistente-aprobados");

const OG_W = 1200;
const OG_H = 630;
const STORY_W = 1080;
const STORY_H = 1920;
const STORY_FOOTER_H = 380;
const STORY_PHOTO_H = STORY_H - STORY_FOOTER_H;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_VERSION = 2;
const STORY_CACHE_VERSION = 1;
const ogCache = new Map();
const storyCache = new Map();

function escSvg(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncar(s, max) {
  const x = String(s || "").trim();
  if (x.length <= max) return x;
  return `${x.slice(0, max - 1)}…`;
}

async function descargarBuffer(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function renderOgAprobadoJpeg(slug) {
  const row = await asistenteAprobados.fetchAprobadoRowBySlug(slug);
  if (!row) return null;

  const portada = asistenteAprobados.urlImagenAbsolutaAprobado(asistenteAprobados.fotoPortadaAprobado(row));

  if (portada) {
    try {
      const raw = await descargarBuffer(portada);
      return sharp(raw)
        .resize(OG_W, OG_H, { fit: "cover", position: "attention" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } catch (_e) {
      /* fallback abajo */
    }
  }
  return sharp({
    create: {
      width: OG_W,
      height: OG_H,
      channels: 3,
      background: { r: 24, g: 24, b: 24 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function obtenerOgAprobadoJpeg(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const hit = ogCache.get(s);
  if (hit && hit.v === CACHE_VERSION && Date.now() - hit.ts < CACHE_MS) return hit.buf;
  const buf = await renderOgAprobadoJpeg(s);
  if (buf) ogCache.set(s, { buf, ts: Date.now(), v: CACHE_VERSION });
  return buf;
}

function svgStoryPie(titulo, urlFicha, folio) {
  const t = escSvg(truncar(titulo, 44));
  const u = escSvg(urlFicha);
  const f = folio != null ? escSvg(`Folio ${folio}`) : "";
  return Buffer.from(`<svg width="${STORY_W}" height="${STORY_FOOTER_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${STORY_W}" height="${STORY_FOOTER_H}" fill="#111111"/>
  <rect width="${STORY_W}" height="64" fill="#ffc400"/>
  <text x="540" y="42" text-anchor="middle" fill="#111111" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="800" letter-spacing="1">REVISADO Y APROBADO POR AUTODATO</text>
  <text x="540" y="118" text-anchor="middle" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="800">${t}</text>
  ${f ? `<text x="540" y="158" text-anchor="middle" fill="#bbbbbb" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">${f}</text>` : ""}
  <text x="540" y="${f ? 210 : 178}" text-anchor="middle" fill="#ffc400" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="800">${u}</text>
  <text x="540" y="${f ? 262 : 230}" text-anchor="middle" fill="#cccccc" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="600">Auto certificado · abre el enlace para ver informe completo</text>
</svg>`);
}

async function renderStoryShareJpeg(slug) {
  const row = await asistenteAprobados.fetchAprobadoRowBySlug(slug);
  if (!row) return null;

  const portada = asistenteAprobados.urlImagenAbsolutaAprobado(asistenteAprobados.fotoPortadaAprobado(row));
  const titulo = asistenteAprobados.tituloVehiculo(row);
  const urlFicha = asistenteAprobados.urlFichaPublica(String(row.public_slug || "").trim());

  let foto;
  if (portada) {
    try {
      const raw = await descargarBuffer(portada);
      foto = await sharp(raw).resize(STORY_W, STORY_PHOTO_H, { fit: "cover", position: "attention" }).toBuffer();
    } catch (_e) {
      foto = null;
    }
  }
  if (!foto) {
    foto = await sharp({
      create: { width: STORY_W, height: STORY_PHOTO_H, channels: 3, background: { r: 40, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();
  }

  const pie = await sharp(svgStoryPie(titulo, urlFicha, row.folio)).png().toBuffer();

  return sharp({
    create: { width: STORY_W, height: STORY_H, channels: 3, background: { r: 17, g: 17, b: 17 } },
  })
    .composite([
      { input: foto, top: 0, left: 0 },
      { input: pie, top: STORY_PHOTO_H, left: 0 },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function obtenerStoryAprobadoJpeg(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const hit = storyCache.get(s);
  if (hit && hit.v === STORY_CACHE_VERSION && Date.now() - hit.ts < CACHE_MS) return hit.buf;
  const buf = await renderStoryShareJpeg(s);
  if (buf) storyCache.set(s, { buf, ts: Date.now(), v: STORY_CACHE_VERSION });
  return buf;
}

module.exports = {
  obtenerOgAprobadoJpeg,
  obtenerStoryAprobadoJpeg,
  OG_W,
  OG_H,
  STORY_W,
  STORY_H,
};
