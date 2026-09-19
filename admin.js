const PIN_KEY = "autodato_admin_pin";
const SESION_KEY = "autodato_admin_ok";

const $ = (id) => document.getElementById(id);

let editando = null;
let comboEditIndex = -1;

function clp(n) {
  if (n == null || n === "") return "A confirmar";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(`autodato-admin|${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hayClave() {
  return Boolean(localStorage.getItem(PIN_KEY));
}

function sesionOk() {
  return sessionStorage.getItem(SESION_KEY) === "1";
}

function mostrarAcceso() {
  $("acceso").hidden = false;
  $("panel").hidden = true;
  const nube = typeof nubeActiva === "function" && nubeActiva();
  $("acceso-email-wrap").hidden = !nube;
  if (nube) {
    $("acceso-texto").textContent = "Entra con el correo y la clave de Supabase.";
    $("acceso-label").textContent = "Clave";
    $("acceso-confirma-wrap").hidden = true;
    $("btn-acceso").textContent = "Entrar";
  } else {
    const setup = !hayClave();
    $("acceso-texto").textContent = setup
      ? "Primera vez: crea una clave. Queda en este navegador y solo quien la sepa entra al panel."
      : "Escribe tu clave para abrir el panel interno.";
    $("acceso-label").textContent = setup ? "Nueva clave" : "Clave";
    $("acceso-confirma-wrap").hidden = !setup;
    $("btn-acceso").textContent = setup ? "Crear clave y entrar" : "Entrar";
  }
  $("acceso-error").hidden = true;
}

function pintarTaller() {
  const t = leerTaller();
  if ($("taller-dir")) $("taller-dir").value = t.direccion;
  if ($("taller-wa")) $("taller-wa").value = t.whatsapp;
  if ($("taller-maps")) $("taller-maps").value = t.maps || "";
}

async function mostrarPanel() {
  $("acceso").hidden = true;
  $("panel").hidden = false;
  await cargarCatalogo();
  pintarTaller();
  renderLista();
  if (editando) renderEditor();
  else $("stage").innerHTML = `<p class="vacio">Elige un servicio o crea uno nuevo.</p>`;
}

async function intentarAcceso() {
  const pin = $("acceso-pin").value.trim();
  const err = $("acceso-error");
  err.hidden = true;
  if (typeof nubeActiva === "function" && nubeActiva()) {
    const email = $("acceso-email").value.trim();
    if (!email || !pin) {
      err.textContent = "Escribe correo y clave.";
      err.hidden = false;
      return;
    }
    try {
      await nubeLogin(email, pin);
      await mostrarPanel();
    } catch (e) {
      err.textContent = e.message || "No se pudo entrar. Revisa correo, clave y que el usuario esté confirmado.";
      err.hidden = false;
    }
    return;
  }
  const pin2 = $("acceso-pin2").value.trim();
  if (pin.length < 4) {
    err.textContent = "La clave debe tener al menos 4 caracteres.";
    err.hidden = false;
    return;
  }
  if (!hayClave()) {
    if (pin !== pin2) {
      err.textContent = "Las dos claves no coinciden.";
      err.hidden = false;
      return;
    }
    localStorage.setItem(PIN_KEY, await hashPin(pin));
    sessionStorage.setItem(SESION_KEY, "1");
    await mostrarPanel();
    return;
  }
  const ok = (await hashPin(pin)) === localStorage.getItem(PIN_KEY);
  if (!ok) {
    err.textContent = "Clave incorrecta.";
    err.hidden = false;
    return;
  }
  sessionStorage.setItem(SESION_KEY, "1");
  await mostrarPanel();
}

function servicioVacio() {
  return {
    id: "",
    tipo: "oferta",
    nombre: "",
    resumen: "",
    detalle: "",
    foto: "",
    galeria: [],
    videos: [],
    precio: 0,
    complementos: [],
    activo: true,
  };
}

function renderLista() {
  $("lista-servicios").innerHTML = catalogo
    .map((s) => {
      const on = editando && editando.id === s.id ? "is-on" : "";
      const foto = s.foto
        ? `<img src="${s.foto}" alt="" />`
        : `<span class="ph"></span>`;
      return `
        <button class="item ${on}" type="button" data-abrir="${s.id}">
          ${foto}
          <div>
            <strong>${s.nombre || "Sin nombre"}</strong>
            <span>${s.tipo === "diagnostico" ? "Diagnóstico" : "Oferta"} · ${clp(s.precio)} · ${(s.complementos || []).length} complementos</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function leerEditor() {
  if (!editando) return;
  editando.nombre = $("e-nombre").value.trim();
  editando.tipo = $("e-tipo").value;
  editando.resumen = $("e-resumen").value.trim();
  editando.detalle = $("e-detalle").value.trim();
  const precio = $("e-precio").value;
  editando.precio = precio === "" ? null : Number(precio);
}

function renderEditor() {
  const s = editando;
  $("stage").innerHTML = `
    <article class="editor">
      <h2>${s.id ? "Editar servicio" : "Nuevo servicio"}</h2>
      <p class="muted">Los cambios se ven en Ofertas y Diagnóstico del sitio público.</p>
      <div class="grid-2">
        <label class="field"><span>Nombre</span><input id="e-nombre" type="text" value="${escapeAttr(s.nombre)}" /></label>
        <label class="field">
          <span>Tipo</span>
          <select id="e-tipo">
            <option value="oferta" ${s.tipo === "oferta" ? "selected" : ""}>Oferta / mantención</option>
            <option value="diagnostico" ${s.tipo === "diagnostico" ? "selected" : ""}>Diagnóstico</option>
          </select>
        </label>
      </div>
      <label class="field"><span>Resumen (tarjeta)</span><input id="e-resumen" type="text" value="${escapeAttr(s.resumen)}" /></label>
      <label class="field"><span>Descripción</span><textarea id="e-detalle">${escapeText(s.detalle)}</textarea></label>
      <label class="field"><span>Valor de lista</span><input id="e-precio" type="number" min="0" step="1000" value="${s.precio == null ? "" : s.precio}" /></label>

      <label class="field">
        <span>Imagen de portada</span>
        <input id="e-foto" type="file" accept="image/*" />
      </label>
      <div class="preview" id="e-preview" ${s.foto ? `style="background-image:url('${s.foto}')"` : ""}></div>

      <label class="field">
        <span>Imágenes de complemento</span>
        <input id="e-galeria" type="file" accept="image/*" multiple />
      </label>
      <div class="galeria" id="e-galeria-box">${htmlGaleria(s)}</div>

      <label class="field">
        <span>Video (URL de YouTube o archivo en la web)</span>
        <div class="grid-2">
          <input id="e-video" type="url" placeholder="https://" />
          <button class="btn-line" type="button" id="btn-add-video">Agregar video</button>
        </div>
      </label>
      <div class="videos" id="e-videos-box">${htmlVideos(s)}</div>

      <h3>Servicios asociados</h3>
      <p class="hint">Si el cliente ya lleva <strong>${s.nombre || "este servicio"}</strong>, puedes bajar el precio de otro trabajo que se hace en el mismo ingreso. Ejemplo: cambias discos y las pastillas salen más baratas porque igual hay que sacarlas.</p>
      <div class="complementos" id="e-combos">${htmlComplementos(s)}</div>
      <button class="btn-line btn-block" type="button" id="btn-add-combo">Agregar servicio asociado</button>

      <div class="btn-row">
        <button class="btn-primary" type="button" id="btn-guardar">Guardar</button>
        ${s.id ? `<button class="btn-soft" type="button" id="btn-borrar">Eliminar</button>` : ""}
      </div>
    </article>
  `;
  renderLista();
}

function htmlGaleria(s) {
  return (s.galeria || [])
    .map(
      (src, i) =>
        `<div class="chip-x"><img src="${src}" alt="" /><button type="button" data-del-img="${i}">×</button></div>`
    )
    .join("");
}

function htmlVideos(s) {
  return (s.videos || [])
    .map(
      (url, i) =>
        `<div class="combo-row"><a href="${url}" target="_blank" rel="noopener">${url}</a><button class="btn-soft" type="button" data-del-video="${i}">Quitar</button></div>`
    )
    .join("");
}

function htmlComplementos(s) {
  const rows = (s.complementos || []).map((c, i) => {
    const otro = servicioPorId(c.id);
    const lista = otro && otro.precio != null ? otro.precio : null;
    const ahorro = lista != null ? lista - Number(c.precioCombo) : 0;
    return `
      <div class="combo-row">
        <div>
          <strong>${otro ? otro.nombre : c.id}</strong>
          <div class="muted">Lista ${clp(lista)} → combo ${clp(c.precioCombo)} · ahorra ${clp(ahorro)}</div>
        </div>
        <button class="btn-soft" type="button" data-edit-combo="${i}">Editar</button>
        <button class="btn-soft" type="button" data-del-combo="${i}">Quitar</button>
      </div>
    `;
  });
  return rows.join("") || `<p class="muted">Todavía no hay complementos.</p>`;
}

function escapeAttr(v) {
  return String(v || "").replace(/"/g, "&quot;");
}

function escapeText(v) {
  return String(v || "").replace(/</g, "&lt;");
}

function abrirServicio(id) {
  const s = servicioPorId(id);
  if (!s) return;
  editando = JSON.parse(JSON.stringify(s));
  renderEditor();
}

function nuevoServicio() {
  editando = servicioVacio();
  renderEditor();
}

async function guardarServicio() {
  leerEditor();
  if (!editando.nombre) {
    alert("Escribe el nombre del servicio.");
    return;
  }
  if (!editando.id) editando.id = nuevoIdServicio(editando.nombre);
  const copia = JSON.parse(JSON.stringify(editando));
  const idx = catalogo.findIndex((s) => s.id === copia.id);
  if (idx >= 0) catalogo[idx] = copia;
  else catalogo.push(copia);
  try {
    await guardarCatalogo(catalogo);
    editando = copia;
    renderLista();
    renderEditor();
    alert("Servicio guardado. Ya se ve en el sitio público.");
  } catch (e) {
    alert(e.message || "No se pudo guardar en la nube.");
  }
}

async function borrarServicio() {
  if (!editando || !editando.id) return;
  if (!confirm(`¿Eliminar ${editando.nombre}?`)) return;
  catalogo = catalogo.filter((s) => s.id !== editando.id);
  catalogo.forEach((s) => {
    s.complementos = (s.complementos || []).filter((c) => c.id !== editando.id);
  });
  try {
    await guardarCatalogo(catalogo);
    editando = null;
    await mostrarPanel();
  } catch (e) {
    alert(e.message || "No se pudo eliminar en la nube.");
  }
}

function leerImagen(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = url;
  });
}

function abrirCombo(index) {
  leerEditor();
  comboEditIndex = index;
  const usados = new Set((editando.complementos || []).map((c) => c.id));
  if (index >= 0) usados.delete(editando.complementos[index].id);
  const opciones = catalogo.filter((s) => s.id && s.id !== editando.id && !usados.has(s.id));
  if (!opciones.length) {
    alert("No hay otro servicio disponible. Crea primero el servicio que quieres asociar.");
    return;
  }
  $("combo-ayuda").textContent = `Si el cliente ya lleva “${editando.nombre || "este servicio"}”, el otro trabajo puede bajar de precio.`;
  $("combo-id").innerHTML = opciones
    .map((s) => `<option value="${s.id}">${s.nombre} · lista ${clp(s.precio)}</option>`)
    .join("");
  if (index >= 0) {
    $("combo-id").value = editando.complementos[index].id;
    $("combo-precio").value = editando.complementos[index].precioCombo;
  } else {
    $("combo-id").value = opciones[0].id;
    $("combo-precio").value = opciones[0].precio || "";
  }
  pintarPreviewCombo();
  $("modal-combo").hidden = false;
}

function pintarPreviewCombo() {
  const otro = servicioPorId($("combo-id").value);
  if (!otro) {
    $("combo-lista").textContent = "";
    $("combo-preview").textContent = "";
    return;
  }
  const lista = otro.precio;
  const combo = Number($("combo-precio").value);
  $("combo-lista").textContent = `${otro.nombre} vale ${clp(lista)} si se pide solo.`;
  if (lista == null || Number.isNaN(combo)) {
    $("combo-preview").textContent = "Escribe el precio de combo.";
    return;
  }
  const ahorro = lista - combo;
  $("combo-preview").innerHTML =
    ahorro > 0
      ? `Queda en <span style="color:var(--green)">${clp(combo)}</span>. El cliente ahorra ${clp(ahorro)} por llevarlo junto con ${editando.nombre || "este servicio"}.`
      : "El precio de combo debería ser menor que el de lista.";
}

function guardarCombo() {
  const id = $("combo-id").value;
  const precioCombo = Number($("combo-precio").value);
  const otro = servicioPorId(id);
  if (!otro || Number.isNaN(precioCombo)) {
    alert("Elige el servicio y un precio.");
    return;
  }
  const etiqueta = `con ${editando.nombre || "este servicio"}`;
  const fila = { id, precioCombo, etiqueta };
  if (!editando.complementos) editando.complementos = [];
  if (comboEditIndex >= 0) editando.complementos[comboEditIndex] = fila;
  else editando.complementos.push(fila);
  $("modal-combo").hidden = true;
  renderEditor();
}

$("btn-acceso").addEventListener("click", intentarAcceso);
$("acceso-pin").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarAcceso();
});
$("acceso-pin2").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarAcceso();
});

$("btn-nuevo").addEventListener("click", nuevoServicio);
$("btn-taller").addEventListener("click", () => {
  guardarTaller({
    direccion: $("taller-dir").value,
    whatsapp: $("taller-wa").value,
    maps: $("taller-maps").value,
  });
  pintarTaller();
  alert("Contacto guardado. Ya se ve en la portada.");
});
$("btn-salir").addEventListener("click", async () => {
  sessionStorage.removeItem(SESION_KEY);
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      await nubeSalir();
    } catch (e) {
      /* ignore */
    }
  }
  editando = null;
  mostrarAcceso();
});

$("lista-servicios").addEventListener("click", (e) => {
  const t = e.target.closest("[data-abrir]");
  if (t) abrirServicio(t.dataset.abrir);
});

$("stage").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "btn-guardar") guardarServicio();
  if (t.id === "btn-borrar") borrarServicio();
  if (t.id === "btn-add-combo") abrirCombo(-1);
  if (t.id === "btn-add-video") {
    leerEditor();
    const url = $("e-video").value.trim();
    if (!url) return;
    editando.videos = editando.videos || [];
    editando.videos.push(url);
    renderEditor();
  }
  if (t.dataset.delImg != null) {
    leerEditor();
    editando.galeria.splice(Number(t.dataset.delImg), 1);
    renderEditor();
  }
  if (t.dataset.delVideo != null) {
    leerEditor();
    editando.videos.splice(Number(t.dataset.delVideo), 1);
    renderEditor();
  }
  if (t.dataset.editCombo != null) abrirCombo(Number(t.dataset.editCombo));
  if (t.dataset.delCombo != null) {
    leerEditor();
    editando.complementos.splice(Number(t.dataset.delCombo), 1);
    renderEditor();
  }
});

$("stage").addEventListener("change", async (e) => {
  if (e.target.id === "e-foto" && e.target.files[0]) {
    leerEditor();
    let src = await leerImagen(e.target.files[0]);
    if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
    editando.foto = src;
    renderEditor();
  }
  if (e.target.id === "e-galeria" && e.target.files.length) {
    leerEditor();
    editando.galeria = editando.galeria || [];
    for (const file of e.target.files) {
      let src = await leerImagen(file, 1100);
      if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
      editando.galeria.push(src);
    }
    renderEditor();
  }
});

$("cerrar-combo").addEventListener("click", () => {
  $("modal-combo").hidden = true;
});
$("btn-guardar-combo").addEventListener("click", guardarCombo);
$("combo-id").addEventListener("change", pintarPreviewCombo);
$("combo-precio").addEventListener("input", pintarPreviewCombo);
$("modal-combo").addEventListener("click", (e) => {
  if (e.target.id === "modal-combo") $("modal-combo").hidden = true;
});

$("acceso-email")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarAcceso();
});

async function arrancarAdmin() {
  if (typeof nubeActiva === "function" && nubeActiva()) {
    if (await nubeSesion()) await mostrarPanel();
    else mostrarAcceso();
    return;
  }
  if (sesionOk()) await mostrarPanel();
  else mostrarAcceso();
}

arrancarAdmin();
