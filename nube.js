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
    complementos: (comps || [])
      .filter((c) => c.servicio_id === row.id)
      .map((c) => ({
        id: c.asociado_id,
        precioCombo: c.precio_combo,
        etiqueta: c.etiqueta || "",
      })),
  };
}

async function nubeGuardarCatalogoCanales(lista) {
  const sb = clienteNube();
  const mapa = {};
  (lista || []).forEach((s) => {
    const canales = typeof normalizarCanales === "function" ? normalizarCanales(s.canales, s.tipo) : s.canales || {};
    mapa[s.id] = {
      ...canales,
      tiene_oferta: Boolean(s.tiene_oferta) && Number(s.precio_oferta) > 0,
      oferta_combo: Boolean(s.oferta_combo),
      precio_oferta: s.tiene_oferta && Number(s.precio_oferta) > 0 ? Number(s.precio_oferta) : null,
      dots_x: Number(s.dots_x) || 50,
      dots_y: Number(s.dots_y) || 62,
      vehiculos: Array.isArray(s.vehiculos) ? s.vehiculos : [],
      tiempo_min: Number(s.tiempo_min) > 0 ? Number(s.tiempo_min) : null,
      mano_obra: Number(s.mano_obra) > 0 ? Number(s.mano_obra) : 0,
      insumos: Array.isArray(s.insumos) ? s.insumos : [],
    };
  });
  mapa._modelos = typeof MODELOS_EXTRA !== "undefined" ? MODELOS_EXTRA : {};
  mapa._fotos_modelos = typeof FOTOS_MODELOS !== "undefined" ? FOTOS_MODELOS : {};
  mapa._tablero_columnas = typeof TABLERO_COLUMNAS !== "undefined" ? TABLERO_COLUMNAS : [];
  const { error } = await sb.storage.from("servicios").upload(
    "catalogo-canales.json",
    new Blob([JSON.stringify(mapa)], { type: "application/json" }),
    { contentType: "application/json", upsert: true, cacheControl: "0" }
  );
  if (error) throw error;
}

async function nubeLeerCatalogoCanales() {
  const sb = clienteNube();
  const publico = sb.storage.from("servicios").getPublicUrl("catalogo-canales.json").data.publicUrl;
  try {
    const res = await fetch(`${publico}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch (e) {
    /* fallback */
  }
  const { data, error } = await sb.storage.from("servicios").download("catalogo-canales.json");
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

async function nubeLeerCatalogo() {
  const sb = clienteNube();
  const { data: rows, error } = await sb.from("servicios").select("*").order("nombre");
  if (error) throw error;
  const { data: comps, error: errorC } = await sb.from("complementos").select("*");
  if (errorC) throw errorC;
  let extra = null;
  try {
    extra = await nubeLeerCatalogoCanales();
  } catch (e) {
    extra = null;
  }
  if (extra && extra._modelos && typeof extra._modelos === "object") {
    MODELOS_EXTRA = extra._modelos;
  }
  if (extra && extra._fotos_modelos && typeof extra._fotos_modelos === "object") {
    FOTOS_MODELOS = extra._fotos_modelos;
    if (typeof persistirFotosModelos === "function") persistirFotosModelos();
  }
  if (extra && Array.isArray(extra._tablero_columnas)) {
    TABLERO_COLUMNAS = extra._tablero_columnas.map(normalizarColumnaTablero).filter(Boolean);
    if (typeof persistirTablero === "function") persistirTablero();
  }
  return (rows || []).map((row) => {
    const s = filaAServicio(row, comps || []);
    if (extra && extra[s.id] && String(s.id).charAt(0) !== "_") {
      s.canales = extra[s.id];
      if (extra[s.id].tiene_oferta != null) s.tiene_oferta = Boolean(extra[s.id].tiene_oferta) && Number(extra[s.id].precio_oferta) > 0;
      if (extra[s.id].oferta_combo != null) s.oferta_combo = Boolean(extra[s.id].oferta_combo);
      if (Number(extra[s.id].precio_oferta) > 0) s.precio_oferta = Number(extra[s.id].precio_oferta);
      else s.precio_oferta = null;
      if (extra[s.id].dots_x != null) s.dots_x = Number(extra[s.id].dots_x);
      if (extra[s.id].dots_y != null) s.dots_y = Number(extra[s.id].dots_y);
      if (extra[s.id].vehiculos) s.vehiculos = extra[s.id].vehiculos;
      if (extra[s.id].tiempo_min != null) s.tiempo_min = Number(extra[s.id].tiempo_min) || null;
      if (extra[s.id].mano_obra != null) s.mano_obra = Number(extra[s.id].mano_obra) || 0;
      if (Array.isArray(extra[s.id].insumos)) s.insumos = extra[s.id].insumos;
    }
    return s;
  });
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
  }));
  const { error: errorU } = await sb.from("servicios").upsert(rows);
  if (errorU) throw errorU;
  try {
    await nubeGuardarCatalogoCanales(lista);
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
