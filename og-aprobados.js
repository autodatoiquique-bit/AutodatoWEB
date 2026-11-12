/**
 * Imagen Open Graph 1200×630 para fichas aprobados (mejor vista en Instagram / WhatsApp).
 */
"use strict";

const sharp = require("sharp");
const asistenteAprobados = require("./asistente-aprobados");

const OG_W = 1200;
const OG_H = 630;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_VERSION = 2;
const ogCache = new Map();

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

module.exports = {
  obtenerOgAprobadoJpeg,
  OG_W,
  OG_H,
};
