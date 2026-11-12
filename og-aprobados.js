/**
 * Imagen Open Graph 1200×630 para fichas aprobados (mejor vista en Instagram / WhatsApp).
 */
"use strict";

const sharp = require("sharp");
const asistenteAprobados = require("./asistente-aprobados");

const OG_W = 1200;
const OG_H = 630;
const CACHE_MS = 60 * 60 * 1000;
const ogCache = new Map();

function escSvg(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncarTitulo(t, max = 52) {
  const x = String(t || "").trim();
  if (x.length <= max) return x;
  return `${x.slice(0, max - 1)}…`;
}

function svgPie(titulo, folio) {
  const t = escSvg(truncarTitulo(titulo));
  const folioTxt = folio != null ? ` · Folio ${folio}` : "";
  return Buffer.from(`<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(0,0,0)" stop-opacity="0"/>
      <stop offset="52%" stop-color="rgb(0,0,0)" stop-opacity="0"/>
      <stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#fade)"/>
  <rect y="${OG_H - 72}" width="${OG_W}" height="72" fill="#ffc400"/>
  <text x="44" y="${OG_H - 108}" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="800">${t}</text>
  <text x="44" y="${OG_H - 22}" fill="#111111" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="800">APROBADO POR AUTODATO${escSvg(folioTxt)}</text>
</svg>`);
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
  const titulo = asistenteAprobados.tituloVehiculo(row);

  let fotoPlano;
  if (portada) {
    try {
      const raw = await descargarBuffer(portada);
      fotoPlano = await sharp(raw).resize(OG_W, OG_H, { fit: "cover", position: "attention" }).toBuffer();
    } catch (_e) {
      fotoPlano = null;
    }
  }
  if (!fotoPlano) {
    fotoPlano = await sharp({
      create: {
        width: OG_W,
        height: OG_H,
        channels: 3,
        background: { r: 18, g: 18, b: 18 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  const overlay = svgPie(titulo, row.folio);
  return sharp(fotoPlano)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function obtenerOgAprobadoJpeg(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const hit = ogCache.get(s);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.buf;
  const buf = await renderOgAprobadoJpeg(s);
  if (buf) ogCache.set(s, { buf, ts: Date.now() });
  return buf;
}

module.exports = {
  obtenerOgAprobadoJpeg,
  OG_W,
  OG_H,
};
