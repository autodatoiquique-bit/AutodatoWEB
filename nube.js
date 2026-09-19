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
    activo: row.activo !== false,
    complementos: (comps || [])
      .filter((c) => c.servicio_id === row.id)
      .map((c) => ({
        id: c.asociado_id,
        precioCombo: c.precio_combo,
        etiqueta: c.etiqueta || "",
      })),
  };
}

async function nubeLeerCatalogo() {
  const sb = clienteNube();
  const { data: rows, error } = await sb.from("servicios").select("*").order("nombre");
  if (error) throw error;
  const { data: comps, error: errorC } = await sb.from("complementos").select("*");
  if (errorC) throw errorC;
  return (rows || []).map((row) => filaAServicio(row, comps || []));
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
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from("servicios").upload(path, blob, {
    contentType: "image/jpeg",
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

async function nubeLeerPortada() {
  const sb = clienteNube();
  const { data, error } = await sb.from("portada_slides").select("*").order("orden");
  if (error) throw error;
  return data || [];
}

async function nubeGuardarPortada(lista) {
  const sb = clienteNube();
  const { error: errorD } = await sb.from("portada_slides").delete().neq("id", "__none__");
  if (errorD) throw errorD;
  if (!lista.length) return;
  const rows = lista.map((s, i) => ({
    id: s.id,
    foto: s.foto,
    servicio_id: s.servicio_id || null,
    btn_texto: s.btn_texto || "Agregar al carrito",
    btn_x: Number(s.btn_x) || 50,
    btn_y: Number(s.btn_y) || 72,
    orden: Number(s.orden) || i,
  }));
  const { error } = await sb.from("portada_slides").insert(rows);
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
