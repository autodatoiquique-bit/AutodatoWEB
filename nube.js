function nubeUrl() {
  let u = String(window.AUTODATO_NUBE?.supabaseUrl || "").trim();
  return u.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
}

function nubeClave() {
  return String(window.AUTODATO_NUBE?.supabaseAnonKey || "").trim();
}

function nubeActiva() {
  return Boolean(nubeUrl() && nubeClave() && window.supabase);
}

function nubeCargarConfigRemota() {
  return new Promise((resolve) => {
    if (nubeUrl() && nubeClave()) {
      resolve(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://autodato.cl/config.js";
    s.onload = () => {
      window._sb = null;
      resolve(Boolean(nubeUrl() && nubeClave()));
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function clienteNube() {
  if (!nubeActiva()) return null;
  if (!window._sb) {
    window._sb = window.supabase.createClient(nubeUrl(), nubeClave());
  }
  return window._sb;
}

function slugFamiliaVambeNube(x) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function serviceFamiliesDesdeRow(row) {
  const v = row && row.service_families;
  if (v == null) return [];
  if (Array.isArray(v)) return [...new Set(v.map(slugFamiliaVambeNube).filter(Boolean))];
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      if (Array.isArray(j)) return serviceFamiliesDesdeRow({ service_families: j });
    } catch (_e) {
      return v
        .split(/[,;]/)
        .map(slugFamiliaVambeNube)
        .filter(Boolean);
    }
  }
  return [];
}

function tagsDesdeRow(row) {
  const t = row && row.tags;
  if (t == null) return [];
  if (Array.isArray(t)) return t.map((x) => String(x || "").trim()).filter(Boolean);
  if (typeof t === "string") {
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j.map((x) => String(x || "").trim()).filter(Boolean);
    } catch (_e) {
      return [];
    }
  }
  return [];
}

function filaAServicio(row, comps) {
  return {
    id: row.id,
    tipo: row.tipo,
    nombre: row.nombre,
    resumen: row.resumen || "",
    detalle: row.detalle || "",
    foto: row.foto || "",
    galeria: row.galeria || [],
    videos: row.videos || [],
    precio: row.precio,
    precio_oferta: Number(row.precio_oferta) > 0 ? Number(row.precio_oferta) : null,
    activo: row.activo !== false,
    canales: row.canales || null,
    service_families: serviceFamiliesDesdeRow(row),
    tags: tagsDesdeRow(row),
    priority: row.priority != null && Number.isFinite(Number(row.priority)) ? Number(row.priority) : null,
    oil_liters: row.oil_liters != null && Number.isFinite(Number(row.oil_liters)) ? Number(row.oil_liters) : null,
    complementos: (comps || [])
      .filter((c) => c.servicio_id === row.id)
      .map((c) => ({
        id: c.asociado_id,
        precioCombo: c.precio_combo,
        etiqueta: c.etiqueta || "",
      })),
  };
}

const NUBE_JSON_CANALES = "catalogo-canales.json";
const NUBE_JSON_FLOTAS = "catalogo-flotas.json";
const NUBE_JSON_FLOTAS_ACCESO = "catalogo-flotas-acceso.json";

async function nubeSubirJsonStorage(nombre, obj) {
  const sb = clienteNube();
  const { error } = await sb.storage.from("servicios").upload(
    nombre,
    new Blob([JSON.stringify(obj)], { type: "application/json" }),
    { contentType: "application/json", upsert: true, cacheControl: "0" }
  );
  if (error) throw error;
}

async function nubeLeerJsonStorage(nombre) {
  const sb = clienteNube();
  if (!sb) return null;
  const publico = sb.storage.from("servicios").getPublicUrl(nombre).data.publicUrl;
  try {
    const res = await fetch(`${publico}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch (e) {
    /* fallback */
  }
  const { data, error } = await sb.storage.from("servicios").download(nombre);
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

function flotaSnapshotAccesoNube(f) {
  if (!f) return null;
  return {
    id: f.id,
    nombre: f.nombre,
    pin_hash: f.pin_hash || "",
    link_acceso: f.link_acceso || "",
    canal_webhook: f.canal_webhook || "",
    agenda_modo: f.agenda_modo || "limitada",
    exigir_modelo_vehiculo: f.exigir_modelo_vehiculo || "no",
    columnas: [],
    solicitantes: [],
  };
}

async function nubeQuitarFlotasDeCatalogoCanales() {
  const raw = await nubeLeerJsonStorage(NUBE_JSON_CANALES);
  if (!raw || !Object.prototype.hasOwnProperty.call(raw, "_flotas")) return;
  delete raw._flotas;
  await nubeSubirJsonStorage(NUBE_JSON_CANALES, raw);
}

async function nubeGuardarFlotasTarifario() {
  const flotas = typeof FLOTAS !== "undefined" ? FLOTAS : [];
  await nubeSubirJsonStorage(NUBE_JSON_FLOTAS, { _flotas: flotas });
  await nubeSubirJsonStorage(NUBE_JSON_FLOTAS_ACCESO, {
    _flotas: flotas.map(flotaSnapshotAccesoNube).filter(Boolean),
  });
  try {
    await nubeQuitarFlotasDeCatalogoCanales();
  } catch (e) {
    console.warn("No se pudo aligerar catalogo-canales.json.", e);
  }
}

function entradaServicioCatalogoCanales(s, previo) {
  const canales = typeof normalizarCanales === "function" ? normalizarCanales(s.canales, s.tipo) : s.canales || {};
  const itemsLocal = Array.isArray(s.combo_items) ? s.combo_items : [];
  const prev = previo && previo[s.id];
  const conservarCombo =
    !itemsLocal.length && prev && prev.es_combo && Array.isArray(prev.combo_items) && prev.combo_items.length >= 2;
  return {
    ...canales,
    service_families: Array.isArray(s.service_families) ? s.service_families.map(slugFamiliaVambeNube).filter(Boolean) : [],
    tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
    priority: s.priority != null && Number.isFinite(Number(s.priority)) ? Number(s.priority) : null,
    oil_liters: s.oil_liters != null && Number.isFinite(Number(s.oil_liters)) ? Number(s.oil_liters) : null,
    tiene_oferta: Boolean(s.tiene_oferta) && Number(s.precio_oferta) > 0,
    oferta_combo: Boolean(s.oferta_combo),
    precio_oferta: s.tiene_oferta && Number(s.precio_oferta) > 0 ? Number(s.precio_oferta) : null,
    dots_x: Number(s.dots_x) || 50,
    dots_y: Number(s.dots_y) || 62,
    vehiculos: Array.isArray(s.vehiculos) ? s.vehiculos : [],
    tiempo_min: Number(s.tiempo_min) > 0 ? Number(s.tiempo_min) : null,
    mano_obra: Number(s.mano_obra) > 0 ? Number(s.mano_obra) : 0,
    insumos: Array.isArray(s.insumos) ? s.insumos : [],
    media: Array.isArray(s.media) ? s.media : [],
    agotado: Boolean(s.agotado),
    ultima_unidad: Boolean(s.ultima_unidad),
    stock_restante: stockRestanteDe(s),
    es_combo: conservarCombo ? true : Boolean(s.es_combo),
    combo_items: conservarCombo ? prev.combo_items : itemsLocal,
    combo_regalo: Array.isArray(s.combo_regalo)
      ? s.combo_regalo.map((id) => String(id || "").trim()).filter(Boolean)
      : conservarCombo && Array.isArray(prev.combo_regalo)
        ? prev.combo_regalo
        : [],
    numero_serie: Number(s.numero_serie) > 0 ? Math.floor(Number(s.numero_serie)) : null,
    argumento_venta: String(s.argumento_venta || "").trim(),
    servicios_incluidos: Array.isArray(s.servicios_incluidos)
      ? s.servicios_incluidos.map((id) => String(id || "").trim()).filter(Boolean)
      : [],
  };
}

function metaCatalogoCanalesEnMapa(mapa) {
  mapa._modelos = typeof MODELOS_EXTRA !== "undefined" ? MODELOS_EXTRA : {};
  mapa._marcas_extra = typeof MARCAS_EXTRA !== "undefined" ? MARCAS_EXTRA : [];
  mapa._fotos_modelos = typeof FOTOS_MODELOS !== "undefined" ? FOTOS_MODELOS : {};
  mapa._tablero_columnas = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  return mapa;
}

/** Solo columnas del tablero (orden y tarjetas por columna), sin reescribir todo el catálogo. */
async function nubeGuardarSoloTableroCanales() {
  let previo = null;
  try {
    previo = await nubeLeerJsonStorage(NUBE_JSON_CANALES);
  } catch (e) {
    previo = null;
  }
  const mapa = previo && typeof previo === "object" ? { ...previo } : {};
  metaCatalogoCanalesEnMapa(mapa);
  await nubeSubirJsonStorage(NUBE_JSON_CANALES, mapa);
}

async function nubeGuardarCatalogoCanales(lista, opts) {
  let previo = null;
  try {
    previo = await nubeLeerJsonStorage(NUBE_JSON_CANALES);
  } catch (e) {
    previo = null;
  }
  const soloIds = opts && Array.isArray(opts.soloIds) ? new Set(opts.soloIds.map((id) => String(id || "").trim()).filter(Boolean)) : null;
  const mergePrevio = Boolean(opts && opts.mergePrevio);
  const mapa = mergePrevio && previo && typeof previo === "object" ? { ...previo } : {};
  (lista || []).forEach((s) => {
    if (!s || !s.id) return;
    if (soloIds && !soloIds.has(String(s.id))) return;
    mapa[s.id] = entradaServicioCatalogoCanales(s, previo);
  });
  metaCatalogoCanalesEnMapa(mapa);
  await nubeSubirJsonStorage(NUBE_JSON_CANALES, mapa);
}

async function nubeLeerCatalogoCanales(opts) {
  const raw = await nubeLeerJsonStorage(NUBE_JSON_CANALES);
  if (!raw) return null;
  if (opts && opts.omitFlotas && Object.prototype.hasOwnProperty.call(raw, "_flotas")) {
    const copia = { ...raw };
    delete copia._flotas;
    return copia;
  }
  return raw;
}

async function nubeLeerFlotasTarifarioRemoto() {
  const data = await nubeLeerJsonStorage(NUBE_JSON_FLOTAS);
  if (data && Array.isArray(data._flotas)) return data._flotas;
  const legacy = await nubeLeerJsonStorage(NUBE_JSON_CANALES);
  if (legacy && Array.isArray(legacy._flotas)) return legacy._flotas;
  return null;
}

async function nubeLeerFlotasAccesoRemoto() {
  const data = await nubeLeerJsonStorage(NUBE_JSON_FLOTAS_ACCESO);
  if (data && Array.isArray(data._flotas)) return data._flotas;
  const legacy = await nubeLeerJsonStorage(NUBE_JSON_CANALES);
  if (legacy && Array.isArray(legacy._flotas)) {
    return legacy._flotas.map(flotaSnapshotAccesoNube).filter(Boolean);
  }
  const full = await nubeLeerJsonStorage(NUBE_JSON_FLOTAS);
  if (full && Array.isArray(full._flotas)) {
    return full._flotas.map(flotaSnapshotAccesoNube).filter(Boolean);
  }
  return null;
}

function aplicarMetaCatalogoExtra(extra, opts) {
  if (!extra || typeof extra !== "object") return;
  if (extra._modelos && typeof extra._modelos === "object") {
    MODELOS_EXTRA = extra._modelos;
    if (typeof persistirModelosExtra === "function") persistirModelosExtra();
  }
  if (Array.isArray(extra._marcas_extra)) {
    MARCAS_EXTRA = extra._marcas_extra.map((m) => String(m || "").trim()).filter(Boolean);
    if (typeof persistirMarcasExtra === "function") persistirMarcasExtra();
  }
  if (extra._fotos_modelos && typeof extra._fotos_modelos === "object") {
    FOTOS_MODELOS = extra._fotos_modelos;
    if (typeof persistirFotosModelos === "function") persistirFotosModelos();
  }
  if (Array.isArray(extra._tablero_columnas)) {
    TABLERO_COLUMNAS = extra._tablero_columnas.map(normalizarColumnaTablero).filter(Boolean);
    if (typeof persistirTablero === "function") persistirTablero();
  }
  const aplicarFlotas = !(opts && opts.omitFlotas);
  if (aplicarFlotas && Array.isArray(extra._flotas)) {
    FLOTAS = extra._flotas.map(normalizarFlota).filter(Boolean);
    if (typeof persistirFlotas === "function") persistirFlotas();
  }
}

function fusionarExtraEnServicio(s, extra, opts) {
  const lite = opts && opts.lite;
  const ex = extra && extra[s.id] && String(s.id).charAt(0) !== "_" ? extra[s.id] : null;
  if (!ex) return s;
  if (typeof normalizarCanales === "function") {
    s.canales = normalizarCanales(
      { ofertas: ex.ofertas, mantencion: ex.mantencion, diagnostico: ex.diagnostico },
      s.tipo
    );
  } else {
    s.canales = {
      ofertas: Boolean(ex.ofertas),
      mantencion: Boolean(ex.mantencion),
      diagnostico: Boolean(ex.diagnostico),
    };
  }
  if (ex.tiene_oferta != null) s.tiene_oferta = Boolean(ex.tiene_oferta) && Number(ex.precio_oferta) > 0;
  if (ex.oferta_combo != null) s.oferta_combo = Boolean(ex.oferta_combo);
  if (Number(ex.precio_oferta) > 0) s.precio_oferta = Number(ex.precio_oferta);
  else if (ex.precio_oferta != null) s.precio_oferta = null;
  if (ex.vehiculos) s.vehiculos = ex.vehiculos;
  if (ex.agotado != null) s.agotado = Boolean(ex.agotado);
  if (ex.ultima_unidad != null) s.ultima_unidad = Boolean(ex.ultima_unidad);
  if (ex.stock_restante != null && ex.stock_restante !== "") {
    s.stock_restante = stockRestanteDe({ stock_restante: ex.stock_restante });
  }
  if (ex.es_combo != null) s.es_combo = Boolean(ex.es_combo);
  if (Array.isArray(ex.combo_items)) s.combo_items = ex.combo_items;
  if (Array.isArray(ex.combo_regalo)) s.combo_regalo = ex.combo_regalo;
  if (Array.isArray(ex.servicios_incluidos)) s.servicios_incluidos = ex.servicios_incluidos;
  if (Number(ex.numero_serie) > 0) s.numero_serie = Math.floor(Number(ex.numero_serie));
  if (lite) {
    if (Array.isArray(ex.media) && ex.media.length) {
      const portada = ex.media.find((m) => m && m.src) || ex.media[0];
      if (portada && portada.src && !s.foto) s.foto = portada.src;
    }
    return s;
  }
  if (ex.dots_x != null) s.dots_x = Number(ex.dots_x);
  if (ex.dots_y != null) s.dots_y = Number(ex.dots_y);
  if (ex.tiempo_min != null) s.tiempo_min = Number(ex.tiempo_min) || null;
  if (ex.mano_obra != null) s.mano_obra = Number(ex.mano_obra) || 0;
  if (Array.isArray(ex.insumos)) s.insumos = ex.insumos;
  if (Array.isArray(ex.media) && ex.media.length) s.media = ex.media;
  if (ex.service_families != null) {
    const extra =
      typeof ex.service_families === "string"
        ? serviceFamiliesDesdeRow({ service_families: ex.service_families })
        : Array.isArray(ex.service_families)
          ? ex.service_families.map(slugFamiliaVambeNube).filter(Boolean)
          : [];
    const cur = Array.isArray(s.service_families) ? s.service_families.map(slugFamiliaVambeNube).filter(Boolean) : [];
    s.service_families = [...new Set([...cur, ...extra])];
  }
  if (Array.isArray(ex.tags)) {
    const cur = Array.isArray(s.tags) ? s.tags : [];
    const merged = [...new Set([...cur, ...ex.tags.map((t) => String(t || "").trim()).filter(Boolean)])];
    s.tags = merged;
    ex.tags.forEach((t) => {
      const x = String(t || "").trim();
      if (/^family:/i.test(x)) {
        const slug = slugFamiliaVambeNube(x.slice(7));
        if (!slug) return;
        const prev = Array.isArray(s.service_families) ? s.service_families.map(slugFamiliaVambeNube).filter(Boolean) : [];
        s.service_families = [...new Set([...prev, slug])];
      }
    });
  }
  if (ex.priority != null && Number.isFinite(Number(ex.priority))) s.priority = Number(ex.priority);
  if (ex.oil_liters != null && Number.isFinite(Number(ex.oil_liters))) s.oil_liters = Number(ex.oil_liters);
  if (ex.argumento_venta != null) s.argumento_venta = String(ex.argumento_venta || "").trim();
  return s;
}

async function nubeLeerCatalogo(opts) {
  const lite = !(opts && opts.completo);
  const sb = clienteNube();
  const cols = lite ? "id,tipo,nombre,resumen,foto,precio,activo" : "*";
  const { data: rows, error } = await sb.from("servicios").select(cols).order("nombre");
  if (error) throw error;
  const { data: comps, error: errorC } = await sb.from("complementos").select("*");
  if (errorC) throw errorC;
  let extra = null;
  try {
    extra = await nubeLeerCatalogoCanales({ omitFlotas: true });
  } catch (e) {
    extra = null;
  }
  aplicarMetaCatalogoExtra(extra, { omitFlotas: true });
  return (rows || []).map((row) => {
    const s = filaAServicio(row, comps || []);
    if (lite) {
      s.detalle = "";
      s.galeria = [];
      s.videos = [];
    }
    return fusionarExtraEnServicio(s, extra, { lite });
  });
}

async function nubeLeerServicioDetalle(id) {
  const sid = String(id || "").trim();
  if (!sid) return null;
  const sb = clienteNube();
  const { data: row, error } = await sb.from("servicios").select("*").eq("id", sid).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const { data: comps, error: errorC } = await sb.from("complementos").select("*").eq("servicio_id", sid);
  if (errorC) throw errorC;
  let extra = null;
  try {
    extra = await nubeLeerCatalogoCanales({ omitFlotas: true });
  } catch (e) {
    extra = null;
  }
  const s = filaAServicio(row, comps || []);
  return fusionarExtraEnServicio(s, extra, { lite: false });
}

async function nubeLeerServicioStockMapa() {
  const sb = clienteNube();
  if (!sb) return {};
  const { data, error } = await sb.from("servicio_stock").select("servicio_id, restante");
  if (error || !data) return {};
  const map = {};
  data.forEach((row) => {
    if (row && row.servicio_id != null && row.restante != null) {
      map[String(row.servicio_id)] = Math.max(0, Number(row.restante));
    }
  });
  return map;
}

async function nubeFusionarStockCatalogo(lista) {
  const map = await nubeLeerServicioStockMapa();
  if (!Object.keys(map).length) return lista;
  return (lista || []).map((s) => {
    if (map[s.id] == null) return s;
    return { ...s, stock_restante: map[s.id], agotado: map[s.id] <= 0 ? true : s.agotado };
  });
}

async function nubeSyncServicioStock(lista) {
  const sb = clienteNube();
  if (!sb) return;
  const ids = (lista || []).map((s) => s.id).filter(Boolean);
  for (const s of lista || []) {
    const lim = stockRestanteDe(s);
    if (lim == null) {
      await sb.from("servicio_stock").delete().eq("servicio_id", s.id);
      continue;
    }
    const { error } = await sb.from("servicio_stock").upsert({ servicio_id: s.id, restante: lim });
    if (error) throw error;
  }
  if (ids.length) {
    const { data } = await sb.from("servicio_stock").select("servicio_id");
    const sobran = (data || []).map((r) => r.servicio_id).filter((id) => !ids.includes(id));
    if (sobran.length) await sb.from("servicio_stock").delete().in("servicio_id", sobran);
  }
}

async function nubeGuardarCatalogo(lista) {
  const sb = clienteNube();
  const { data: actuales, error: errorA } = await sb.from("servicios").select("id");
  if (errorA) throw errorA;
  const ids = new Set(lista.map((s) => s.id));
  const borrar = (actuales || []).map((x) => x.id).filter((id) => !ids.has(id));
  if (borrar.length) {
    const { error } = await sb.from("servicios").delete().in("id", borrar);
    if (error) throw error;
  }
  const rows = lista.map((s) => ({
    id: s.id,
    tipo: s.tipo,
    nombre: s.nombre,
    resumen: s.resumen || "",
    detalle: s.detalle || "",
    foto: s.foto || "",
    galeria: s.galeria || [],
    videos: s.videos || [],
    precio: s.precio,
    activo: s.activo !== false,
    service_families: Array.isArray(s.service_families) ? s.service_families.map(slugFamiliaVambeNube).filter(Boolean) : [],
    tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
    priority: s.priority != null && Number.isFinite(Number(s.priority)) ? Number(s.priority) : null,
    oil_liters: s.oil_liters != null && Number.isFinite(Number(s.oil_liters)) ? Number(s.oil_liters) : null,
  }));
  const { error: errorU } = await sb.from("servicios").upsert(rows);
  if (errorU) throw errorU;
  try {
    await nubeGuardarCatalogoCanales(lista);
    await nubeSyncServicioStock(lista);
  } catch (e) {
    console.warn("No se pudieron guardar los menús del catálogo.", e);
    throw e;
  }
  const { error: errorD } = await sb.from("complementos").delete().neq("servicio_id", "__none__");
  if (errorD) throw errorD;
  const comps = [];
  lista.forEach((s) => {
    (s.complementos || []).forEach((c) => {
      comps.push({
        servicio_id: s.id,
        asociado_id: c.id,
        precio_combo: Number(c.precioCombo),
        etiqueta: c.etiqueta || "",
      });
    });
  });
  if (comps.length) {
    const { error } = await sb.from("complementos").insert(comps);
    if (error) throw error;
  }
}

async function nubeSubirImagen(dataUrl) {
  const sb = clienteNube();
  const blob = await (await fetch(dataUrl)).blob();
  const esPng = String(dataUrl).startsWith("data:image/png") || blob.type === "image/png";
  const ext = esPng ? "png" : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("servicios").upload(path, blob, {
    contentType: esPng ? "image/png" : "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return sb.storage.from("servicios").getPublicUrl(path).data.publicUrl;
}

async function nubeSubirVideo(file) {
  const sb = clienteNube();
  const ext = String((file && file.name) || "clip.mp4")
    .split(".")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("servicios").upload(path, file, {
    contentType: (file && file.type) || "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  return sb.storage.from("servicios").getPublicUrl(path).data.publicUrl;
}

async function nubeGuardarTicket(payload) {
  const sb = clienteNube();
  const { error } = await sb.from("tickets").insert({
    code: payload.code,
    payload,
    patente: payload.patente,
    telefono: payload.telefono,
  });
  if (error) throw error;
}

async function nubeBuscarTicket(patente, telefono) {
  const sb = clienteNube();
  const { data, error } = await sb.rpc("buscar_ticket", {
    p_patente: patente,
    p_telefono: telefono,
  });
  if (error) throw error;
  return data || null;
}

/** Historial admin: requiere sesión Supabase (política tickets_admin_read). */
async function nubeListarTickets(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const limite = Math.min(500, Math.max(1, Number(o.limite) || 300));
  const sb = clienteNube();
  const { data, error } = await sb
    .from("tickets")
    .select("id, code, patente, telefono, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function nubeActualizarTicket(id, datos) {
  const sb = clienteNube();
  const rowId = String(id || "").trim();
  if (!rowId) throw new Error("Falta id del ticket");
  const patch = {};
  if (datos && datos.code != null) patch.code = String(datos.code).trim();
  if (datos && datos.payload != null) patch.payload = datos.payload;
  if (datos && datos.patente !== undefined) {
    patch.patente = datos.patente ? String(datos.patente).trim().toUpperCase() : null;
  }
  if (datos && datos.telefono !== undefined) {
    patch.telefono = datos.telefono ? String(datos.telefono).trim() : null;
  }
  const { data, error } = await sb.from("tickets").update(patch).eq("id", rowId).select().single();
  if (error) throw error;
  return data;
}

/** Admin: requiere sesión Supabase (política tickets_admin_delete). */
async function nubeEliminarTicket(id) {
  const sb = clienteNube();
  const rowId = String(id || "").trim();
  if (!rowId) throw new Error("Falta id del ticket");
  const { error } = await sb.from("tickets").delete().eq("id", rowId);
  if (error) throw error;
}

function extraPortada(s) {
  return {
    id: s.id,
    mostrar_boton: Boolean(s.mostrar_boton),
    zoom: Number(s.zoom) || 1,
    scale_x: Number(s.scale_x) || 1,
    scale_y: Number(s.scale_y) || 1,
    off_x: Number(s.off_x) || 0,
    off_y: Number(s.off_y) || 0,
    btn_x: Number(s.btn_x) || 50,
    btn_y: Number(s.btn_y) || 55,
    dir_x: Number(s.dir_x) || 50,
    dir_y: Number(s.dir_y) || 76,
    wa_x: Number(s.wa_x) || 50,
    wa_y: Number(s.wa_y) || 84,
    dots_x: Number(s.dots_x) || 50,
    dots_y: Number(s.dots_y) || 68,
    banner_h: Number(s.banner_h) || 72,
    ico_s: Number(s.ico_s) || 46,
    vehiculos: Array.isArray(s.vehiculos) ? s.vehiculos : [],
    defecto: Boolean(s.defecto),
  };
}

async function nubeGuardarPortadaMeta(lista) {
  const sb = clienteNube();
  const cuerpo = JSON.stringify({
    ui: typeof portadaUi !== "undefined" ? portadaUi : {},
    slides: lista.map(extraPortada),
  });
  const { error } = await sb.storage.from("servicios").upload(
    "portada-config.json",
    new Blob([cuerpo], { type: "application/json" }),
    { contentType: "application/json", upsert: true, cacheControl: "0" }
  );
  if (error) throw error;
}

async function nubeLeerPortadaMeta() {
  const sb = clienteNube();
  const publico = sb.storage.from("servicios").getPublicUrl("portada-config.json").data.publicUrl;
  try {
    const res = await fetch(`${publico}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch (e) {
    /* fallback */
  }
  const { data, error } = await sb.storage.from("servicios").download("portada-config.json");
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

async function nubeLeerPortada() {
  const sb = clienteNube();
  const { data, error } = await sb.from("portada_slides").select("*").order("orden");
  if (error) throw error;
  let extra = null;
  try {
    extra = await nubeLeerPortadaMeta();
  } catch (e) {
    extra = null;
  }
  const byId = {};
  ((extra && extra.slides) || []).forEach((s) => {
    byId[s.id] = s;
  });
  return (data || []).map((row) => ({
    ...row,
    ...((extra && extra.ui) || {}),
    ...(byId[row.id] || {}),
  }));
}

async function nubeGuardarPortada(lista) {
  const sb = clienteNube();
  await nubeGuardarPortadaMeta(lista);
  const { error: errorD } = await sb.from("portada_slides").delete().neq("id", "__none__");
  if (errorD) throw errorD;
  if (!lista.length) return;
  const rows = lista.map((s, i) => ({
    id: s.id,
    foto: s.foto,
    servicio_id: s.servicio_id || null,
    mostrar_boton: Boolean(s.mostrar_boton),
    btn_texto: s.btn_texto || "Agregar al carrito",
    btn_x: Number(s.btn_x) || 50,
    btn_y: Number(s.btn_y) || 55,
    zoom: Number(s.zoom) || 1,
    orden: Number(s.orden) || i,
  }));
  const { error } = await sb.from("portada_slides").insert(rows);
  if (error && /column|schema cache/i.test(String(error.message || ""))) {
    const slim = lista.map((s, i) => ({
      id: s.id,
      foto: s.foto,
      servicio_id: s.servicio_id || null,
      btn_texto: s.btn_texto || "Agregar al carrito",
      btn_x: Number(s.btn_x) || 50,
      btn_y: Number(s.btn_y) || 55,
      orden: Number(s.orden) || i,
    }));
    const retry = await sb.from("portada_slides").insert(slim);
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
}

function jsonListaAprobado(v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? jsonListaAprobado(j) : [];
    } catch (_e) {
      return [];
    }
  }
  return [];
}

function jsonIdsEquipamientoAprobado(v) {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && x.id != null ? String(x.id) : ""))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return jsonIdsEquipamientoAprobado(j);
    } catch (_e) {
      return [];
    }
  }
  return [];
}

function jsonObjetoAprobado(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return j && typeof j === "object" && !Array.isArray(j) ? j : {};
    } catch (_e) {
      return {};
    }
  }
  return {};
}

function numOpcionalAprobado(v) {
  return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function filaAVehiculoAprobado(row) {
  if (!row || typeof row !== "object") return null;
  const informe = jsonObjetoAprobado(row.informe);
  return {
    id: row.id,
    public_slug: String(row.public_slug || "").trim(),
    marca: String(row.marca || "").trim(),
    modelo: String(row.modelo || "").trim(),
    version: String(row.version || "").trim(),
    ano: numOpcionalAprobado(row.ano),
    patente: row.patente ? String(row.patente).trim().toUpperCase() : "",
    color: String(row.color || "").trim(),
    carroceria: String(row.carroceria || "").trim(),
    transmision: String(row.transmision || "").trim(),
    combustible: String(row.combustible || "").trim(),
    traccion: String(row.traccion || "").trim(),
    cilindrada: String(row.cilindrada || "").trim(),
    modelo_motor: String(row.modelo_motor || "").trim(),
    numero_chasis: String(row.numero_chasis || "").trim(),
    airbags: numOpcionalAprobado(row.airbags),
    asientos: numOpcionalAprobado(row.asientos),
    duenos: numOpcionalAprobado(row.duenos),
    folio: numOpcionalAprobado(row.folio),
    revisado_por: String(row.revisado_por || "").trim(),
    revisado_whatsapp: String(row.revisado_whatsapp || "").trim(),
    vendedor_nombre: String(row.vendedor_nombre || "").trim(),
    vendedor_telefono: String(row.vendedor_telefono || "").trim(),
    whatsapp_contacto: String(row.whatsapp_contacto || "").trim(),
    kilometraje: numOpcionalAprobado(row.kilometraje),
    kilometraje_tablero: numOpcionalAprobado(row.kilometraje_tablero),
    kilometraje_real: numOpcionalAprobado(row.kilometraje_real),
    precio_referencia: numOpcionalAprobado(row.precio_referencia),
    precio_financiado: numOpcionalAprobado(row.precio_financiado),
    cuota_referencia: numOpcionalAprobado(row.cuota_referencia),
    ahorro_referencia: numOpcionalAprobado(row.ahorro_referencia),
    garantia_vendedor: Boolean(row.garantia_vendedor),
    mostrar_datos_vendedor: row.mostrar_datos_vendedor !== false,
    origen: String(row.origen || "").trim(),
    ubicacion_nombre: String(row.ubicacion_nombre || "").trim(),
    ubicacion_direccion: String(row.ubicacion_direccion || "").trim(),
    ubicacion_maps: String(row.ubicacion_maps || "").trim(),
    descripcion: String(row.descripcion || "").trim(),
    equipamiento: jsonIdsEquipamientoAprobado(row.equipamiento),
    video_url: String(row.video_url || "").trim(),
    estado: String(row.estado || "borrador").trim() || "borrador",
    notas_internas: String(row.notas_internas || "").trim(),
    foto_portada: String(row.foto_portada || "").trim(),
    galeria: jsonListaAprobado(row.galeria),
    detalles_esteticos: jsonListaAprobado(row.detalles_esteticos),
    informe,
    aprobado_at: row.aprobado_at || null,
    vigente_hasta: row.vigente_hasta || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    metricas_qr: Math.max(0, Math.floor(Number(row.metricas_qr) || 0)),
    metricas_whatsapp: Math.max(0, Math.floor(Number(row.metricas_whatsapp) || 0)),
    metricas_web: Math.max(0, Math.floor(Number(row.metricas_web) || 0)),
    metricas_maps: Math.max(0, Math.floor(Number(row.metricas_maps) || 0)),
    metricas_compartir: Math.max(0, Math.floor(Number(row.metricas_compartir) || 0)),
  };
}

/** Público: suma visita QR o clic WhatsApp (anon vía RPC o API). */
async function nubeRegistrarMetricaAprobado(slug, tipo) {
  const s = String(slug || "").trim();
  const t = String(tipo || "").trim().toLowerCase();
  if (!s || !/^(qr|whatsapp|web|maps|compartir)$/.test(t)) return;
  try {
    const sb = typeof clienteNube === "function" ? clienteNube() : null;
    if (sb) {
      const { error } = await sb.rpc("incrementar_metrica_aprobado", { p_slug: s, p_tipo: t });
      if (!error) return;
    }
  } catch (_e) {
    /* fallback API */
  }
  try {
    await fetch("/api/aprobado-metrica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: s, tipo: t }),
    });
  } catch (_e2) {
    /* sin red */
  }
}

/** Admin: listado completo (requiere sesión). */
async function nubeListarVehiculosAprobados() {
  const sb = clienteNube();
  const { data, error } = await sb.from("vehiculos_aprobados").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(filaAVehiculoAprobado).filter(Boolean);
}

/** Admin: crear o actualizar ficha. */
async function nubeGuardarVehiculoAprobado(datos) {
  const sb = clienteNube();
  const d = datos && typeof datos === "object" ? datos : {};
  const rowId = String(d.id || "").trim();
  const marca = String(d.marca || "").trim();
  const modelo = String(d.modelo || "").trim();
  if (!marca || !modelo) throw new Error("Marca y modelo son obligatorios.");

  const galeria = jsonListaAprobado(d.galeria).map((it, i) => ({
    url: String((it && it.url) || "").trim(),
    orden: Number.isFinite(Number(it && it.orden)) ? Number(it.orden) : i,
  })).filter((it) => it.url);
  const detalles = jsonListaAprobado(d.detalles_esteticos).map((it) => ({
    url: String((it && it.url) || "").trim(),
    caption: String((it && it.caption) || "").trim(),
  })).filter((it) => it.url);
  const informeIn = jsonObjetoAprobado(d.informe);
  const escaner = jsonListaAprobado(informeIn.escaner_imagenes)
    .map((it) => (typeof it === "string" ? { url: it } : it))
    .map((it) => ({ url: String((it && it.url) || "").trim() }))
    .filter((it) => it.url);

  let fotoPortada = String(d.foto_portada || "").trim();
  if (!fotoPortada && galeria.length) fotoPortada = galeria[0].url;

  const patch = {
    marca,
    modelo,
    version: String(d.version || "").trim() || null,
    ano: numOpcionalAprobado(d.ano),
    patente: d.patente ? String(d.patente).trim().toUpperCase() : null,
    color: String(d.color || "").trim() || null,
    carroceria: String(d.carroceria || "").trim() || null,
    transmision: String(d.transmision || "").trim() || null,
    combustible: String(d.combustible || "").trim() || null,
    traccion: String(d.traccion || "").trim() || null,
    cilindrada: String(d.cilindrada || "").trim() || null,
    modelo_motor: String(d.modelo_motor || "").trim() || null,
    numero_chasis: String(d.numero_chasis || "").trim() || null,
    airbags: numOpcionalAprobado(d.airbags),
    asientos: numOpcionalAprobado(d.asientos),
    duenos: numOpcionalAprobado(d.duenos),
    revisado_por: String(d.revisado_por || "").trim() || null,
    revisado_whatsapp: String(d.revisado_whatsapp || "").trim() || null,
    vendedor_nombre: String(d.vendedor_nombre || "").trim() || null,
    vendedor_telefono: String(d.vendedor_telefono || "").trim() || null,
    whatsapp_contacto: String(d.whatsapp_contacto || "").trim() || null,
    kilometraje_tablero: numOpcionalAprobado(d.kilometraje_tablero),
    kilometraje_real: numOpcionalAprobado(d.kilometraje_real),
    kilometraje:
      numOpcionalAprobado(d.kilometraje_real) != null
        ? numOpcionalAprobado(d.kilometraje_real)
        : numOpcionalAprobado(d.kilometraje_tablero),
    precio_referencia: numOpcionalAprobado(d.precio_referencia) != null ? Math.round(Number(d.precio_referencia)) : null,
    precio_financiado: numOpcionalAprobado(d.precio_financiado) != null ? Math.round(Number(d.precio_financiado)) : null,
    cuota_referencia: numOpcionalAprobado(d.cuota_referencia) != null ? Math.round(Number(d.cuota_referencia)) : null,
    ahorro_referencia: numOpcionalAprobado(d.ahorro_referencia) != null ? Math.round(Number(d.ahorro_referencia)) : null,
    garantia_vendedor: Boolean(d.garantia_vendedor),
    mostrar_datos_vendedor: d.mostrar_datos_vendedor !== false,
    origen: String(d.origen || "").trim() || null,
    ubicacion_nombre: String(d.ubicacion_nombre || "").trim() || null,
    ubicacion_direccion: String(d.ubicacion_direccion || "").trim() || null,
    ubicacion_maps: String(d.ubicacion_maps || "").trim() || null,
    descripcion: String(d.descripcion || "").trim() || null,
    equipamiento: jsonIdsEquipamientoAprobado(d.equipamiento),
    video_url: String(d.video_url || "").trim() || null,
    estado: String(d.estado || "borrador").trim() || "borrador",
    notas_internas: String(d.notas_internas || "").trim() || null,
    foto_portada: fotoPortada || null,
    galeria,
    detalles_esteticos: detalles,
    informe: {
      ...informeIn,
      escaner_imagenes: escaner,
      informe_pdf: String(informeIn.informe_pdf || "").trim() || null,
      carroceria_estetica: String(informeIn.carroceria_estetica || "").trim() || null,
      chasis_bajos: String(informeIn.chasis_bajos || "").trim() || null,
      suspension: String(informeIn.suspension || "").trim() || null,
      direccion: String(informeIn.direccion || "").trim() || null,
      frenos: String(informeIn.frenos || "").trim() || null,
      motor: String(informeIn.motor || "").trim() || null,
      escaner_automotriz: String(informeIn.escaner_automotriz || "").trim() || null,
      desempeno_ruta: String(informeIn.desempeno_ruta || "").trim() || null,
      conclusion: String(informeIn.conclusion || "").trim() || null,
      observaciones_tecnicas: String(informeIn.observaciones_tecnicas || "").trim() || null,
      mapa_imagen: String(informeIn.mapa_imagen || "").trim() || null,
      foto_placa_chasis: String(informeIn.foto_placa_chasis || "").trim() || null,
      mapa_off_x: Number(informeIn.mapa_off_x) || 0,
      mapa_off_y: Number(informeIn.mapa_off_y) || 0,
      mapa_zoom: Number(informeIn.mapa_zoom) > 0 ? Number(informeIn.mapa_zoom) : 1,
    },
    updated_at: new Date().toISOString(),
  };

  const est = String(d.estado || "").trim();
  const estCertificado = est === "aprobado" || est === "reservado";
  if (estCertificado && d.aprobado_at) {
    patch.aprobado_at = d.aprobado_at;
  } else if (estCertificado && !d.aprobado_at) {
    patch.aprobado_at = new Date().toISOString();
  }

  if (d.vigente_hasta) patch.vigente_hasta = d.vigente_hasta;

  if (rowId) {
    const { data, error } = await sb.from("vehiculos_aprobados").update(patch).eq("id", rowId).select().single();
    if (error) throw error;
    return filaAVehiculoAprobado(data);
  }

  const slug =
    String(d.public_slug || "").trim() ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
  const insert = {
    ...patch,
    public_slug: slug,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from("vehiculos_aprobados").insert(insert).select().single();
  if (error) throw error;
  return filaAVehiculoAprobado(data);
}

/** Público: vitrina (solo filas visibles por RLS, estado aprobado). */
async function nubeListarAprobadosPublicos() {
  const sb = clienteNube();
  if (!sb) return [];
  const { data, error } = await sb
    .from("vehiculos_aprobados")
    .select(
      "id, public_slug, folio, marca, modelo, version, ano, color, carroceria, transmision, combustible, traccion, kilometraje, kilometraje_tablero, kilometraje_real, precio_referencia, precio_financiado, cuota_referencia, ahorro_referencia, garantia_vendedor, mostrar_datos_vendedor, estado, foto_portada, galeria, ubicacion_nombre, ubicacion_direccion, vendedor_nombre, whatsapp_contacto, vendedor_telefono, created_at"
    )
    .in("estado", ["aprobado", "reservado"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(filaAVehiculoAprobado).filter(Boolean);
}

/** Público: ficha por slug (QR). */
async function nubeAprobadoPublicoPorSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const sb = clienteNube();
  if (!sb) return null;
  const { data, error } = await sb.from("vehiculos_aprobados").select("*").eq("public_slug", s).maybeSingle();
  if (error) throw error;
  const est = String(data && data.estado ? data.estado : "").trim();
  if (!data || (est !== "aprobado" && est !== "reservado")) return null;
  return filaAVehiculoAprobado(data);
}

async function nubeLogin(email, password) {
  const { error } = await clienteNube().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function nubeSesion() {
  const { data } = await clienteNube().auth.getSession();
  return Boolean(data.session);
}

async function nubeSalir() {
  await clienteNube().auth.signOut();
}

async function nubeEmailUsuario() {
  const sb = clienteNube();
  const { data, error } = await sb.auth.getUser();
  if (error) throw error;
  return String((data.user && data.user.email) || "").trim();
}

/** Verifica la clave actual y guarda la nueva en Supabase Auth (sesión activa). */
async function nubeCambiarClaveUsuario(claveActual, claveNueva) {
  const sb = clienteNube();
  const email = await nubeEmailUsuario();
  if (!email) throw new Error("No hay sesión activa. Vuelve a entrar al panel.");
  const { error: errLogin } = await sb.auth.signInWithPassword({ email, password: String(claveActual || "") });
  if (errLogin) throw new Error("La clave actual no es correcta.");
  const { error: errUpd } = await sb.auth.updateUser({ password: String(claveNueva || "") });
  if (errUpd) throw errUpd;
}

function nubeParseHashAuth() {
  const raw = String(window.location.hash || "").replace(/^#/, "");
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const access_token = p.get("access_token");
  if (!access_token) return null;
  return {
    access_token,
    refresh_token: p.get("refresh_token") || "",
    type: p.get("type") || "",
  };
}

function nubeLimpiarHashAuth() {
  if (!window.location.hash) return;
  try {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (_e) {
    window.location.hash = "";
  }
}

/** Tras abrir el enlace del correo de Supabase (type=recovery). */
async function nubeActivarSesionDesdeEnlace() {
  const p = nubeParseHashAuth();
  if (!p) return "";
  const sb = clienteNube();
  const { error } = await sb.auth.setSession({
    access_token: p.access_token,
    refresh_token: p.refresh_token,
  });
  if (error) throw error;
  return p.type;
}

async function nubeSolicitarRecuperacionClave(email) {
  const sb = clienteNube();
  const dest =
    String(window.location.origin || "").replace(/\/$/, "") + String(window.location.pathname || "/admin.html");
  const { error } = await sb.auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: dest,
  });
  if (error) throw error;
}
