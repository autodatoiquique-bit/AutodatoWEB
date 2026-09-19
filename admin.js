const PIN_KEY = "autodato_admin_pin";
const SESION_KEY = "autodato_admin_ok";

const $ = (id) => document.getElementById(id);

let editando = null;
let comboEditIndex = -1;
let slideEditIndex = 0;
let mediaEditIndex = 0;

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
  await cargarPortada();
  aplicarLogos();
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
    canales: { ofertas: false, mantencion: true, diagnostico: false },
    nombre: "",
    resumen: "",
    detalle: "",
    foto: "",
    galeria: [],
    videos: [],
    media: [],
    precio: 0,
    precio_oferta: null,
    tiene_oferta: false,
    oferta_combo: false,
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
            <span>${etiquetaCanales(s)} · ${clp(s.precio)} · ${(s.complementos || []).length} complementos</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function leerEditor() {
  if (!editando) return;
  editando.nombre = $("e-nombre").value.trim();
  editando.canales = {
    ofertas: Boolean($("e-canal-ofertas") && $("e-canal-ofertas").checked),
    mantencion: Boolean($("e-canal-mantencion") && $("e-canal-mantencion").checked),
    diagnostico: Boolean($("e-canal-diagnostico") && $("e-canal-diagnostico").checked),
  };
  editando.tipo = tipoDesdeCanales(editando.canales);
  editando.resumen = $("e-resumen").value.trim();
  editando.detalle = $("e-detalle").value.trim();
  const precio = $("e-precio").value;
  editando.precio = precio === "" ? null : Number(precio);
  editando.tiene_oferta = Boolean($("e-oferta-fija") && $("e-oferta-fija").checked);
  editando.oferta_combo = Boolean($("e-oferta-combo") && $("e-oferta-combo").checked);
  const oferta = $("e-precio-oferta") ? $("e-precio-oferta").value : "";
  editando.precio_oferta = editando.tiene_oferta && oferta !== "" ? Number(oferta) : null;
  const m = mediaActual();
  if (m && m.tipo === "foto") {
    if ($("e-zoom")) m.zoom = Number($("e-zoom").value) / 100;
    if ($("e-ancho")) m.scale_x = Number($("e-ancho").value) / 100;
    if ($("e-alto")) m.scale_y = Number($("e-alto").value) / 100;
  }
  aplicarMediaServicio(editando, mediaEditando());
}

function mediaEditando() {
  if (!editando) return [];
  if (!Array.isArray(editando.media)) editando.media = mediaServicio(editando);
  return editando.media;
}

function mediaActual() {
  const lista = mediaEditando();
  if (!lista.length) return null;
  if (mediaEditIndex < 0 || mediaEditIndex >= lista.length) mediaEditIndex = 0;
  return lista[mediaEditIndex];
}

function htmlMediaThumbs(lista) {
  return lista
    .map((m, i) => {
      const cuerpo =
        m.tipo === "video"
          ? `<video src="${m.src}" muted playsinline></video><span class="ph">Video</span>`
          : `<img src="${m.src}" alt="" />`;
      return `<div class="portada-thumb">
        <button type="button" data-media="${i}" class="${i === mediaEditIndex ? "is-on" : ""}">${cuerpo}</button>
      </div>`;
    })
    .join("");
}

function htmlPreviewMedia(m) {
  if (!m) return `<div class="vacio-foto">Sube fotos o un video corto para verlo en el celular</div>`;
  if (m.tipo === "video") {
    return `<video class="servicio-video" src="${m.src}" muted playsinline controls preload="metadata"></video>`;
  }
  return `<img class="home-foto" id="e-img" src="${m.src}" alt="" style="${estiloFotoPortada(m)}" />`;
}

function htmlDotsMedia(n, on) {
  if (n < 2) return "";
  return `<div class="home-dots servicio-dots">${Array.from({ length: n }, (_, i) => `<i class="${i === on ? "on" : ""}"></i>`).join("")}</div>`;
}

function pintarPrecioPreview() {
  if (!$("pv-precios") || !editando) return;
  const dummy = {
    ...editando,
    precio: $("e-precio") && $("e-precio").value !== "" ? Number($("e-precio").value) : null,
    tiene_oferta: Boolean($("e-oferta-fija") && $("e-oferta-fija").checked),
    precio_oferta: $("e-precio-oferta") && $("e-precio-oferta").value !== "" ? Number($("e-precio-oferta").value) : null,
  };
  $("pv-precios").innerHTML = htmlPrecioPreview(dummy);
}

function htmlPrecioPreview(s) {
  const p = typeof precioPagado === "function" ? precioPagado(s, []) : { lista: s.precio, pagado: s.precio, ahorro: 0 };
  if (p.ahorro > 0) {
    return `<div class="precio-lista tachado">${clp(p.lista)}</div><div class="precio-oferta">${clp(p.pagado)}</div><div class="ahorro-tag">Ahorras ${clp(p.ahorro)}</div>`;
  }
  return `<div class="precio">${clp(s.precio)}</div>`;
}

function pintarFotoServicio() {
  const img = $("e-img");
  const m = mediaActual();
  if (img && m && m.tipo === "foto") img.style.cssText = estiloFotoPortada(m);
}

function renderEditor() {
  const s = editando;
  if (!s.media) s.media = mediaServicio(s);
  const lista = mediaEditando();
  if (lista.length && (mediaEditIndex < 0 || mediaEditIndex >= lista.length)) mediaEditIndex = 0;
  const m = mediaActual();
  $("stage").innerHTML = `
    <article class="editor editor-portada">
      <h2>${s.id ? "Editar servicio" : "Nuevo servicio"}</h2>
      <p class="muted">La izquierda es el celular. Arrastra la foto para elegir el recorte. Los puntos aparecen si hay más de una imagen o video. El cliente los desliza igual.</p>
      <div class="portada-layout">
        <div class="portada-phone">
          <div class="home-screen portada-preview servicio-preview" id="servicio-preview">
            <header class="home-logo">
              <img data-logo src="${logoHref()}" alt="AutoDato" style="${estiloLogoPortada(portadaUi)}" />
            </header>
            <div class="portada-lienzo" id="e-lienzo">${htmlPreviewMedia(m)}</div>
            ${htmlDotsMedia(lista.length, mediaEditIndex)}
            <div class="servicio-copy">
              <h2 id="pv-nombre">${escapeText(s.nombre || "Nombre del servicio")}</h2>
              <p id="pv-resumen">${escapeText(s.resumen || "Resumen de la tarjeta")}</p>
              <p class="lead" id="pv-detalle">${escapeText(s.detalle || "La descripción se ve aquí, como en el celular.")}</p>
              <div class="precio-fila">
                <div id="pv-precios">${htmlPrecioPreview(s)}</div>
                <button class="btn-add-precio" type="button" tabindex="-1">Agregar al carrito</button>
              </div>
            </div>
            ${htmlNavPortadaFalsa()}
          </div>
        </div>
        <div>
          <fieldset class="canales">
            <legend>Dónde aparece este servicio</legend>
            <p class="hint">Los tres menús arman una cotización. Ofertas es solo para promociones de ocasión.</p>
            <label class="check"><input id="e-canal-ofertas" type="checkbox" ${s.canales && s.canales.ofertas ? "checked" : ""} /> Ofertas</label>
            <label class="check"><input id="e-canal-mantencion" type="checkbox" ${s.canales && s.canales.mantencion ? "checked" : ""} /> Mantención preventiva</label>
            <label class="check"><input id="e-canal-diagnostico" type="checkbox" ${s.canales && s.canales.diagnostico ? "checked" : ""} /> Diagnóstico automotriz</label>
          </fieldset>
          <label class="field"><span>Nombre</span><input id="e-nombre" type="text" value="${escapeAttr(s.nombre)}" /></label>
          <label class="field"><span>Resumen (tarjeta)</span><input id="e-resumen" type="text" value="${escapeAttr(s.resumen)}" /></label>
          <label class="field"><span>Descripción</span><textarea id="e-detalle">${escapeText(s.detalle)}</textarea></label>
          <label class="field"><span>Valor normal</span><input id="e-precio" type="number" min="0" step="1000" value="${s.precio == null ? "" : s.precio}" /></label>
          <fieldset class="canales">
            <legend>Criterio de la oferta</legend>
            <p class="hint">Puedes marcar las dos. El cliente se queda con el precio más bajo que le corresponda. Ejemplo: refrigerante $90.000, esta semana $85.000, y si además lleva descarbonización baja a $50.000.</p>
            <label class="check"><input id="e-oferta-fija" type="checkbox" ${s.tiene_oferta ? "checked" : ""} /> Oferta fija (descuento porque sí)</label>
            <div id="e-oferta-wrap" ${s.tiene_oferta ? "" : "hidden"}>
              <label class="field"><span>Precio oferta</span><input id="e-precio-oferta" type="number" min="0" step="1000" value="${s.precio_oferta == null || Number(s.precio_oferta) <= 0 ? "" : s.precio_oferta}" /></label>
            </div>
            <label class="check"><input id="e-oferta-combo" type="checkbox" ${s.oferta_combo ? "checked" : ""} /> Oferta por complemento de servicio</label>
            <p class="hint">La oferta fija vale siempre. La de complemento solo si el cliente lleva el otro servicio. Si aplican las dos, se usa la más conveniente.</p>
          </fieldset>

          <h3>Fotos y videos</h3>
          <div class="portada-thumbs">${htmlMediaThumbs(lista)}</div>
          <div class="btn-row">
            <button class="btn-line" type="button" id="btn-add-foto">Agregar foto</button>
            <button class="btn-line" type="button" id="btn-add-video">Agregar video</button>
          </div>
          ${lista.length ? `<button class="btn-soft btn-block" type="button" id="btn-del-media">Quitar este</button>` : ""}
          <input id="e-foto" type="file" accept="image/*" hidden />
          <input id="e-galeria" type="file" accept="image/*" multiple hidden />
          <input id="e-video-file" type="file" accept="video/mp4,video/webm,video/quicktime" hidden />
          ${
            m && m.tipo === "foto"
              ? `<label class="field"><span>Zoom</span><input id="e-zoom" type="range" min="35" max="400" step="2" value="${Math.round(m.zoom * 100)}" /></label>
                 <label class="field"><span>Estirar ancho</span><input id="e-ancho" type="range" min="40" max="250" step="2" value="${Math.round(m.scale_x * 100)}" /></label>
                 <label class="field"><span>Estirar alto</span><input id="e-alto" type="range" min="40" max="250" step="2" value="${Math.round(m.scale_y * 100)}" /></label>
                 <button class="btn-line btn-block" type="button" id="btn-reset-media">Centrar y resetear recorte</button>
                 <p class="hint">Arrastra la foto en el celular para moverla. Si es horizontal, elige qué parte se ve.</p>`
              : m && m.tipo === "video"
                ? `<p class="hint">Video corto dentro de la ficha. El cliente lo reproduce ahí mismo, sin YouTube.</p>`
                : ""
          }

          <h3>Servicios asociados</h3>
          <p class="hint">Si el cliente ya lleva <strong>${s.nombre || "este servicio"}</strong>, puedes bajar el precio de otro trabajo que se hace en el mismo ingreso.</p>
          <div class="complementos" id="e-combos">${htmlComplementos(s)}</div>
          <button class="btn-line btn-block" type="button" id="btn-add-combo">Agregar servicio asociado</button>

          <div class="btn-row">
            <button class="btn-primary" type="button" id="btn-guardar">Guardar</button>
            ${s.id ? `<button class="btn-soft" type="button" id="btn-borrar">Eliminar</button>` : ""}
          </div>
        </div>
      </div>
    </article>
  `;
  renderLista();
  aplicarLogos();
  activarEditorMedia();
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
  editando = normalizarServicio(JSON.parse(JSON.stringify(s)));
  mediaEditIndex = 0;
  renderEditor();
}

function nuevoServicio() {
  editando = servicioVacio();
  mediaEditIndex = 0;
  renderEditor();
}

async function guardarServicio() {
  leerEditor();
  if (!editando.nombre) {
    alert("Escribe el nombre del servicio.");
    return;
  }
  if (!editando.canales.ofertas && !editando.canales.mantencion && !editando.canales.diagnostico) {
    alert("Marca al menos un menú: Ofertas, Mantención preventiva o Diagnóstico automotriz.");
    return;
  }
  if (editando.tiene_oferta && (editando.precio_oferta == null || Number.isNaN(editando.precio_oferta) || Number(editando.precio_oferta) <= 0)) {
    alert("Si el servicio tiene oferta, escribe el precio oferta.");
    return;
  }
  if (editando.tiene_oferta && editando.precio != null && editando.precio_oferta >= editando.precio) {
    alert("El precio oferta tiene que ser menor que el valor normal.");
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
  if (!otro || Number.isNaN(precioCombo) || precioCombo <= 0) {
    alert("Elige el servicio y un precio mayor a 0.");
    return;
  }
  const etiqueta = `con ${editando.nombre || "este servicio"}`;
  const fila = { id, precioCombo, etiqueta };
  editando.oferta_combo = true;
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
  const ofertas = serviciosCotizacion();
  $("stage").innerHTML = `
    <article class="editor editor-portada">
      <h2>Configurar portada</h2>
      <p class="muted">La izquierda es el celular. La foto se sube completa, sin recorte. Si es horizontal, arrástrala para elegir qué parte se ve en el formato vertical. Estira ancho y alto por separado. El logo puede salir del marco amarillo.</p>
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
            <header class="home-logo">
              <img data-logo id="p-logo" src="${logoHref()}" alt="AutoDato" style="${estiloLogoPortada(portadaUi)}" />
            </header>
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
            <input id="p-zoom" type="range" min="35" max="400" step="2" value="${Math.round(s.zoom * 100)}" />
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
          <h3>Logotipo</h3>
          <button class="btn-line btn-block" type="button" id="btn-cambiar-logo-editor">Cambiar logotipo</button>
          <label class="field">
            <span>Zoom del logo</span>
            <input id="p-logo-zoom" type="range" min="30" max="280" step="2" value="${Math.round(portadaUi.logo_zoom * 100)}" />
          </label>
          <label class="field">
            <span>Estirar logo (ancho)</span>
            <input id="p-logo-ancho" type="range" min="30" max="280" step="2" value="${Math.round(portadaUi.logo_scale_x * 100)}" />
          </label>
          <label class="field">
            <span>Estirar logo (alto)</span>
            <input id="p-logo-alto" type="range" min="30" max="280" step="2" value="${Math.round(portadaUi.logo_scale_y * 100)}" />
          </label>
          <button class="btn-soft btn-block" type="button" id="btn-reset-logo">Centrar y resetear logo</button>
          <p class="hint">Arrastra el logo de la barra amarilla para moverlo. Puede salir hacia afuera del marco.</p>
          <p class="hint">Arrastra la foto para elegir el recorte. Baja el zoom si quieres verla completa. Arrastra cada botón o los puntos para ubicarlos.</p>
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
  if ($("p-logo-zoom")) portadaUi.logo_zoom = Number($("p-logo-zoom").value) / 100;
  if ($("p-logo-ancho")) portadaUi.logo_scale_x = Number($("p-logo-ancho").value) / 100;
  if ($("p-logo-alto")) portadaUi.logo_scale_y = Number($("p-logo-alto").value) / 100;
}

function pintarLogoPortada() {
  aplicarLogos();
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

function activarEditorMedia() {
  const caja = $("servicio-preview");
  const lienzo = $("e-lienzo");
  const img = $("e-img");
  if (!caja || !lienzo || !img) return;
  let lastX = 0;
  let lastY = 0;
  let moviendo = false;
  lienzo.addEventListener("pointerdown", (e) => {
    const m = mediaActual();
    if (!m || m.tipo !== "foto") return;
    moviendo = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lienzo.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  lienzo.addEventListener("pointermove", (e) => {
    if (!moviendo) return;
    const m = mediaActual();
    if (!m || m.tipo !== "foto") return;
    const r = caja.getBoundingClientRect();
    m.off_x = Math.min(160, Math.max(-160, m.off_x + ((e.clientX - lastX) / r.width) * 100));
    m.off_y = Math.min(160, Math.max(-160, m.off_y + ((e.clientY - lastY) / r.height) * 100));
    lastX = e.clientX;
    lastY = e.clientY;
    pintarFotoServicio();
  });
  const fin = () => {
    moviendo = false;
  };
  lienzo.addEventListener("pointerup", fin);
  lienzo.addEventListener("pointercancel", fin);
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
    if (modo === "logo") {
      const r = caja.getBoundingClientRect();
      portadaUi.logo_off_x = Math.min(120, Math.max(-120, portadaUi.logo_off_x + ((e.clientX - lastX) / r.width) * 100));
      portadaUi.logo_off_y = Math.min(120, Math.max(-120, portadaUi.logo_off_y + ((e.clientY - lastY) / r.height) * 100));
      lastX = e.clientX;
      lastY = e.clientY;
      pintarLogoPortada();
      return;
    }
    if (modo === "foto" && img) {
      const r = caja.getBoundingClientRect();
      s.off_x = Math.min(160, Math.max(-160, s.off_x + ((e.clientX - lastX) / r.width) * 100));
      s.off_y = Math.min(160, Math.max(-160, s.off_y + ((e.clientY - lastY) / r.height) * 100));
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
  const logo = $("p-logo");
  if (logo) {
    logo.addEventListener("pointerdown", (e) => {
      modo = "logo";
      lastX = e.clientX;
      lastY = e.clientY;
      logo.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    logo.addEventListener("pointermove", mover);
    logo.addEventListener("pointerup", fin);
    logo.addEventListener("pointercancel", fin);
  }
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
    alert("Portada publicada en autodato.cl. Recarga esa página para verla.");
  } catch (e) {
    alert(
      (e && e.message) ||
        "No se pudo guardar la portada. Reintenta o recarga el panel."
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

async function cambiarLogotipo(file) {
  if (!file) return;
  if (!portadaSlides.length) await cargarPortada();
  let src = await leerImagen(file, 1400);
  if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
  portadaUi.logo = src;
  pintarLogoPortada();
  try {
    if (portadaSlides.length) await guardarPortada(portadaSlides);
  } catch (e) {
    if (typeof nubeGuardarPortadaMeta === "function" && portadaSlides.length) {
      try {
        await nubeGuardarPortadaMeta(portadaSlides);
      } catch (e2) {
        /* ignore */
      }
    }
  }
}

function abrirSelectorLogo() {
  $("logo-file")?.click();
}

$("btn-logo-lapiz")?.addEventListener("click", abrirSelectorLogo);
$("btn-cambiar-logo")?.addEventListener("click", abrirSelectorLogo);
$("logo-file")?.addEventListener("change", async (e) => {
  if (e.target.files[0]) {
    await cambiarLogotipo(e.target.files[0]);
    e.target.value = "";
  }
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
  if (t.id === "btn-cambiar-logo-editor") {
    $("logo-file")?.click();
    return;
  }
  if (t.id === "btn-reset-logo") {
    portadaUi.logo_zoom = 1;
    portadaUi.logo_scale_x = 1;
    portadaUi.logo_scale_y = 1;
    portadaUi.logo_off_x = 0;
    portadaUi.logo_off_y = 0;
    renderEditorPortada();
    return;
  }
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
  if (t.id === "btn-add-foto") {
    $("e-foto")?.click();
    return;
  }
  if (t.id === "btn-add-video") {
    $("e-video-file")?.click();
    return;
  }
  if (t.id === "btn-del-media") {
    leerEditor();
    const lista = mediaEditando();
    if (!lista.length) return;
    lista.splice(mediaEditIndex, 1);
    mediaEditIndex = Math.max(0, lista.length - 1);
    aplicarMediaServicio(editando, lista);
    renderEditor();
    return;
  }
  if (t.id === "btn-reset-media") {
    const m = mediaActual();
    if (!m || m.tipo !== "foto") return;
    m.zoom = 1;
    m.scale_x = 1;
    m.scale_y = 1;
    m.off_x = 0;
    m.off_y = 0;
    renderEditor();
    return;
  }
  if (t.dataset.media != null) {
    leerEditor();
    mediaEditIndex = Number(t.dataset.media);
    renderEditor();
    return;
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
  if (e.target.id === "p-logo-zoom") {
    portadaUi.logo_zoom = Number(e.target.value) / 100;
    pintarLogoPortada();
  }
  if (e.target.id === "p-logo-ancho") {
    portadaUi.logo_scale_x = Number(e.target.value) / 100;
    pintarLogoPortada();
  }
  if (e.target.id === "p-logo-alto") {
    portadaUi.logo_scale_y = Number(e.target.value) / 100;
    pintarLogoPortada();
  }
  if (e.target.id === "e-zoom") {
    const m = mediaActual();
    if (m && m.tipo === "foto") {
      m.zoom = Number(e.target.value) / 100;
      pintarFotoServicio();
    }
  }
  if (e.target.id === "e-ancho") {
    const m = mediaActual();
    if (m && m.tipo === "foto") {
      m.scale_x = Number(e.target.value) / 100;
      pintarFotoServicio();
    }
  }
  if (e.target.id === "e-alto") {
    const m = mediaActual();
    if (m && m.tipo === "foto") {
      m.scale_y = Number(e.target.value) / 100;
      pintarFotoServicio();
    }
  }
  if (e.target.id === "e-nombre" && $("pv-nombre")) $("pv-nombre").textContent = e.target.value || "Nombre del servicio";
  if (e.target.id === "e-resumen" && $("pv-resumen")) $("pv-resumen").textContent = e.target.value || "Resumen de la tarjeta";
  if (e.target.id === "e-detalle" && $("pv-detalle")) $("pv-detalle").textContent = e.target.value || "La descripción se ve aquí, como en el celular.";
  if (e.target.id === "e-precio" || e.target.id === "e-precio-oferta") pintarPrecioPreview();
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
  if (e.target.id === "e-oferta-fija") {
    if ($("e-oferta-wrap")) $("e-oferta-wrap").hidden = !e.target.checked;
    pintarPrecioPreview();
  }
  if (e.target.id === "p-servicio") slideActual().servicio_id = e.target.value;
  if (e.target.id === "p-foto" && e.target.files[0]) {
    let src = await leerImagen(e.target.files[0], 1800);
    if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
    const actual = slideActual();
    actual.foto = src;
    actual.zoom = 1;
    actual.scale_x = 1;
    actual.scale_y = 1;
    actual.off_x = 0;
    actual.off_y = 0;
    renderEditorPortada();
  }
  if (e.target.id === "e-foto" && e.target.files[0]) {
    leerEditor();
    let src = await leerImagen(e.target.files[0], 1800);
    if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
    const lista = mediaEditando();
    lista.push(normalizarMediaItem({ src }, "foto", lista.length));
    mediaEditIndex = lista.length - 1;
    aplicarMediaServicio(editando, lista);
    e.target.value = "";
    renderEditor();
  }
  if (e.target.id === "e-galeria" && e.target.files.length) {
    leerEditor();
    const lista = mediaEditando();
    for (const file of e.target.files) {
      let src = await leerImagen(file, 1800);
      if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
      lista.push(normalizarMediaItem({ src }, "foto", lista.length));
    }
    mediaEditIndex = lista.length - 1;
    aplicarMediaServicio(editando, lista);
    e.target.value = "";
    renderEditor();
  }
  if (e.target.id === "e-video-file" && e.target.files[0]) {
    leerEditor();
    const file = e.target.files[0];
    try {
      if (file.size > 28 * 1024 * 1024) throw new Error("El video debe pesar menos de 25 MB. Sube un clip corto.");
      let src = "";
      if (typeof nubeActiva === "function" && nubeActiva() && typeof nubeSubirVideo === "function") {
        src = await nubeSubirVideo(file);
      } else {
        throw new Error("Abre el panel en autodato.cl/admin.html para subir el video.");
      }
      const lista = mediaEditando();
      lista.push(normalizarMediaItem({ src }, "video", lista.length));
      mediaEditIndex = lista.length - 1;
      aplicarMediaServicio(editando, lista);
      e.target.value = "";
      renderEditor();
    } catch (err) {
      alert((err && err.message) || "No se pudo subir el video.");
      e.target.value = "";
    }
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
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  try {
    await cargarPortada();
    aplicarLogos();
  } catch (e) {
    /* ignore */
  }
  if (typeof nubeActiva === "function" && nubeActiva()) {
    if (await nubeSesion()) await mostrarPanel();
    else mostrarAcceso();
    return;
  }
  if (sesionOk()) await mostrarPanel();
  else mostrarAcceso();
}

arrancarAdmin();
