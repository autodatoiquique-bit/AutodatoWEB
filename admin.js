const PIN_KEY = "autodato_admin_pin";
const SESION_KEY = "autodato_admin_ok";

const $ = (id) => document.getElementById(id);

let editando = null;
let comboEditIndex = -1;
let slideEditIndex = 0;

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

function slideActual() {
  if (!portadaSlides.length) portadaSlides.push(slideVacio(0));
  if (slideEditIndex < 0 || slideEditIndex >= portadaSlides.length) slideEditIndex = 0;
  return portadaSlides[slideEditIndex];
}

async function abrirEditorPortada() {
  editando = null;
  await cargarPortada();
  if (!portadaSlides.length) portadaSlides = [slideVacio(0)];
  slideEditIndex = 0;
  renderEditorPortada();
}

function htmlNavPortadaFalsa() {
  return `<nav class="portada-nav" aria-hidden="true">${["Mis informes", "Ofertas", "Agendamiento", "Mantención preventiva"]
    .map((txt) => `<span><i></i><b>${txt}</b></span>`)
    .join("")}</nav>`;
}

function pintarFotoPortada() {
  const img = $("p-img");
  const s = slideActual();
  if (!img) return;
  img.style.cssText = estiloFotoPortada(s);
}

function renderEditorPortada() {
  const s = slideActual();
  const ofertas = serviciosOferta();
  $("stage").innerHTML = `
    <article class="editor editor-portada">
      <h2>Configurar portada</h2>
      <p class="muted">La izquierda es el celular. Arrastra la foto para desplazarla. Estira ancho y alto por separado. Los cuatro controles (carrito, puntos, dirección y WhatsApp) se mueven igual.</p>
      <div class="portada-thumbs" id="portada-thumbs">
        ${portadaSlides
          .map(
            (x, i) =>
              `<div class="portada-thumb">
                <input type="number" min="1" max="${portadaSlides.length}" value="${i + 1}" data-orden-id="${x.id}" title="Orden" />
                <button type="button" data-slide="${i}" class="${i === slideEditIndex ? "is-on" : ""}">${
                x.foto ? `<img src="${x.foto}" alt="" />` : `<span class="ph">Foto ${i + 1}</span>`
              }</button>
              </div>`
          )
          .join("")}
      </div>
      <div class="btn-row">
        <button class="btn-line" type="button" id="btn-slide-add">Agregar flyer</button>
        ${portadaSlides.length > 1 ? `<button class="btn-soft" type="button" id="btn-slide-del">Quitar este</button>` : ""}
      </div>
      <div class="portada-layout">
        <div class="portada-phone">
          <div class="home-screen portada-preview" id="portada-preview">
            <div class="portada-lienzo" id="portada-lienzo">
              ${s.foto ? `<img class="home-foto" id="p-img" src="${s.foto}" alt="" style="${estiloFotoPortada(s)}" />` : `<div class="vacio-foto">Sube la foto para ajustar el recorte</div>`}
            </div>
            ${
              s.mostrar_boton
                ? `<button class="home-add portada-btn-drag" type="button" id="portada-btn-drag" style="left:${s.btn_x}%;top:${s.btn_y}%">${escapeText(s.btn_texto)}</button>`
                : ""
            }
            ${htmlCapaPortada(portadaUi, portadaSlides.length, slideEditIndex, true)}
            ${htmlNavPortadaFalsa()}
          </div>
        </div>
        <div>
          <label class="field">
            <span>Foto de este flyer</span>
            <input id="p-foto" type="file" accept="image/*" />
          </label>
          <label class="field">
            <span>Zoom</span>
            <input id="p-zoom" type="range" min="100" max="280" step="2" value="${Math.round(s.zoom * 100)}" />
          </label>
          <label class="field">
            <span>Estirar ancho</span>
            <input id="p-ancho" type="range" min="40" max="250" step="2" value="${Math.round(s.scale_x * 100)}" />
          </label>
          <label class="field">
            <span>Estirar alto</span>
            <input id="p-alto" type="range" min="40" max="250" step="2" value="${Math.round(s.scale_y * 100)}" />
          </label>
          <button class="btn-line btn-block" type="button" id="btn-reset-foto">Centrar y resetear recorte</button>
          <p class="hint">Arrastra la foto (el área negra) para moverla dentro del zoom. Arrastra cada botón o los puntos para ubicarlos.</p>
          <label class="check">
            <input id="p-boton" type="checkbox" ${s.mostrar_boton ? "checked" : ""} />
            Mostrar botón Agregar al carrito
          </label>
          <div id="p-boton-campos" ${s.mostrar_boton ? "" : "hidden"}>
            <label class="field">
              <span>Qué oferta agrega al carrito</span>
              <select id="p-servicio">
                <option value="">Elige un servicio</option>
                ${ofertas
                  .map((o) => `<option value="${o.id}" ${o.id === s.servicio_id ? "selected" : ""}>${o.nombre}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="field">
              <span>Texto del botón</span>
              <input id="p-texto" type="text" value="${escapeAttr(s.btn_texto)}" />
            </label>
          </div>
          <div class="btn-row">
            <button class="btn-primary" type="button" id="btn-guardar-portada">Guardar portada</button>
          </div>
        </div>
      </div>
    </article>
  `;
  activarEditorImagen();
}

function leerEditorPortada() {
  const s = slideActual();
  if ($("p-servicio")) s.servicio_id = $("p-servicio").value;
  if ($("p-texto")) s.btn_texto = $("p-texto").value.trim() || "Agregar al carrito";
  if ($("p-boton")) s.mostrar_boton = $("p-boton").checked;
  if ($("p-zoom")) s.zoom = Number($("p-zoom").value) / 100;
  if ($("p-ancho")) s.scale_x = Number($("p-ancho").value) / 100;
  if ($("p-alto")) s.scale_y = Number($("p-alto").value) / 100;
}

function ubicarCapa(el, xKey, yKey, clientX, clientY) {
  const caja = $("portada-preview");
  if (!caja || !el) return;
  const r = caja.getBoundingClientRect();
  portadaUi[xKey] = Math.min(94, Math.max(6, ((clientX - r.left) / r.width) * 100));
  portadaUi[yKey] = Math.min(94, Math.max(6, ((clientY - r.top) / r.height) * 100));
  el.style.left = `${portadaUi[xKey]}%`;
  el.style.top = `${portadaUi[yKey]}%`;
}

function activarEditorImagen() {
  const caja = $("portada-preview");
  const lienzo = $("portada-lienzo");
  const img = $("p-img");
  if (!caja) return;
  let modo = "";
  let lastX = 0;
  let lastY = 0;
  const capas = {
    dir: ["dir_x", "dir_y"],
    wa: ["wa_x", "wa_y"],
    dots: ["dots_x", "dots_y"],
  };
  const mover = (e) => {
    const s = slideActual();
    if (modo === "btn") {
      const btn = $("portada-btn-drag");
      if (!btn) return;
      const r = caja.getBoundingClientRect();
      s.btn_x = Math.min(92, Math.max(8, ((e.clientX - r.left) / r.width) * 100));
      s.btn_y = Math.min(92, Math.max(8, ((e.clientY - r.top) / r.height) * 100));
      btn.style.left = `${s.btn_x}%`;
      btn.style.top = `${s.btn_y}%`;
      return;
    }
    if (capas[modo]) {
      const el = caja.querySelector(`[data-drag="${modo}"]`);
      ubicarCapa(el, capas[modo][0], capas[modo][1], e.clientX, e.clientY);
      return;
    }
    if (modo === "foto" && img) {
      const r = caja.getBoundingClientRect();
      s.off_x = Math.min(90, Math.max(-90, s.off_x + ((e.clientX - lastX) / r.width) * 100));
      s.off_y = Math.min(90, Math.max(-90, s.off_y + ((e.clientY - lastY) / r.height) * 100));
      lastX = e.clientX;
      lastY = e.clientY;
      pintarFotoPortada();
    }
  };
  const fin = () => {
    modo = "";
  };
  const prender = (el, tipo) => {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      modo = tipo;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fin);
    el.addEventListener("pointercancel", fin);
  };
  prender($("portada-btn-drag"), "btn");
  Object.keys(capas).forEach((name) => prender(caja.querySelector(`[data-drag="${name}"]`), name));
  caja.querySelectorAll("[data-drag]").forEach((el) => {
    el.addEventListener("click", (e) => e.preventDefault());
  });
  if (lienzo) {
    lienzo.addEventListener("pointerdown", (e) => {
      if (!img) return;
      modo = "foto";
      lastX = e.clientX;
      lastY = e.clientY;
      lienzo.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    lienzo.addEventListener("pointermove", mover);
    lienzo.addEventListener("pointerup", fin);
    lienzo.addEventListener("pointercancel", fin);
  }
}

async function guardarEditorPortada() {
  leerEditorPortada();
  const sinFoto = portadaSlides.filter((s) => !s.foto);
  if (sinFoto.length) {
    alert("Cada flyer necesita una foto.");
    return;
  }
  const sinOferta = portadaSlides.filter((s) => s.mostrar_boton && !s.servicio_id);
  if (sinOferta.length) {
    alert("Si el botón está visible, elige qué oferta agrega al carrito.");
    return;
  }
  portadaSlides.forEach((s, i) => {
    s.orden = i;
  });
  try {
    await guardarPortada(portadaSlides);
    renderEditorPortada();
    alert("Portada guardada. Ya se ve en autodato.cl.");
  } catch (e) {
    alert(
      (e && e.message) ||
        "No se pudo guardar. Corre en Supabase el SQL nuevo de portada (scale_x, off_x, dir_x, etc.)."
    );
  }
}

$("btn-acceso").addEventListener("click", intentarAcceso);
$("acceso-pin").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarAcceso();
});
$("acceso-pin2").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarAcceso();
});

$("btn-portada").addEventListener("click", abrirEditorPortada);
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
  if (!t || t.id === "portada-btn-drag") return;
  if (t.id === "btn-guardar") guardarServicio();
  if (t.id === "btn-borrar") borrarServicio();
  if (t.id === "btn-guardar-portada") guardarEditorPortada();
  if (t.id === "btn-reset-foto") {
    const s = slideActual();
    s.zoom = 1;
    s.scale_x = 1;
    s.scale_y = 1;
    s.off_x = 0;
    s.off_y = 0;
    renderEditorPortada();
  }
  if (t.id === "btn-slide-add") {
    leerEditorPortada();
    portadaSlides.push(slideVacio(portadaSlides.length));
    slideEditIndex = portadaSlides.length - 1;
    renderEditorPortada();
  }
  if (t.id === "btn-slide-del") {
    if (portadaSlides.length < 2) return;
    portadaSlides.splice(slideEditIndex, 1);
    slideEditIndex = Math.max(0, slideEditIndex - 1);
    renderEditorPortada();
  }
  if (t.dataset.slide != null) {
    leerEditorPortada();
    slideEditIndex = Number(t.dataset.slide);
    renderEditorPortada();
  }
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

$("stage").addEventListener("input", (e) => {
  if (e.target.id === "p-texto") {
    slideActual().btn_texto = e.target.value.trim() || "Agregar al carrito";
    if ($("portada-btn-drag")) $("portada-btn-drag").textContent = slideActual().btn_texto;
  }
  if (e.target.id === "p-zoom") {
    slideActual().zoom = Number(e.target.value) / 100;
    pintarFotoPortada();
  }
  if (e.target.id === "p-ancho") {
    slideActual().scale_x = Number(e.target.value) / 100;
    pintarFotoPortada();
  }
  if (e.target.id === "p-alto") {
    slideActual().scale_y = Number(e.target.value) / 100;
    pintarFotoPortada();
  }
});

$("stage").addEventListener("change", async (e) => {
  if (e.target.dataset.ordenId) {
    leerEditorPortada();
    const id = e.target.dataset.ordenId;
    const dest = Math.min(portadaSlides.length, Math.max(1, Number(e.target.value))) - 1;
    const from = portadaSlides.findIndex((x) => x.id === id);
    if (from < 0 || from === dest) return;
    const [item] = portadaSlides.splice(from, 1);
    portadaSlides.splice(dest, 0, item);
    slideEditIndex = dest;
    renderEditorPortada();
    return;
  }
  if (e.target.id === "p-boton") {
    slideActual().mostrar_boton = e.target.checked;
    renderEditorPortada();
  }
  if (e.target.id === "p-servicio") slideActual().servicio_id = e.target.value;
  if (e.target.id === "p-foto" && e.target.files[0]) {
    let src = await leerImagen(e.target.files[0], 1800);
    if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
    slideActual().foto = src;
    renderEditorPortada();
  }
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
