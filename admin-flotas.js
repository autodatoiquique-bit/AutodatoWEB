let flotaKanbanId = null;
let flotaColEditId = "";
let flotaSrvEdit = null;
let scrollFlotaGuardado = { trackLeft: 0, cols: {} };
let flotaKanbanDrag = { kind: "", payload: "" };
let flotaKanbanCardPointer = null;
let flotaKanbanSuppressClick = false;
let flotaColFotoDraft = null;
let flotaColFotoDraftColId = "";
let flotaSrvFotoDraft = null;
let flotaSrvFotoDraftSrvId = "";

function htmlFilaSolicitanteConfigFlota(s) {
  const sol = s || {};
  return `<tr data-sol-id="${escapeAttr(sol.id || "")}">
    <td><input type="text" class="sol-nombre" value="${escapeAttr(sol.nombre)}" placeholder="Nombre" /></td>
    <td><input type="tel" class="sol-telefono" value="${escapeAttr(sol.telefono)}" placeholder="+56…" /></td>
    <td><input type="email" class="sol-correo" value="${escapeAttr(sol.correo)}" placeholder="correo@…" /></td>
    <td><input type="text" class="sol-patente" maxlength="8" value="${escapeAttr(sol.patente)}" placeholder="ABCD12" /></td>
    <td><button type="button" class="btn-soft btn-quitar-sol" aria-label="Quitar">×</button></td>
  </tr>`;
}

function pintarModalConfigFlota() {
  if (!flotaKanbanId) return;
  hidratarFlotas();
  const flota = flotaPorId(flotaKanbanId);
  if (!flota) return;
  const sel = $("flota-config-agenda");
  if (sel) sel.value = flota.agenda_modo === "libre" ? "libre" : "limitada";
  const tbody = $("flota-config-solicitantes-body");
  if (!tbody) return;
  const lista = flota.solicitantes || [];
  tbody.innerHTML = lista.length
    ? lista.map((s) => htmlFilaSolicitanteConfigFlota(s)).join("")
    : htmlFilaSolicitanteConfigFlota({ id: "", nombre: "", telefono: "", correo: "", patente: "" });
}

function leerSolicitantesDesdeModalConfig() {
  const tbody = $("flota-config-solicitantes-body");
  if (!tbody) return [];
  const out = [];
  tbody.querySelectorAll("tr").forEach((tr) => {
    const nombre = (tr.querySelector(".sol-nombre") && tr.querySelector(".sol-nombre").value.trim()) || "";
    if (!nombre) return;
    const raw = {
      id: tr.getAttribute("data-sol-id") || "",
      nombre,
      telefono: (tr.querySelector(".sol-telefono") && tr.querySelector(".sol-telefono").value.trim()) || "",
      correo: (tr.querySelector(".sol-correo") && tr.querySelector(".sol-correo").value.trim()) || "",
      patente: (tr.querySelector(".sol-patente") && tr.querySelector(".sol-patente").value.trim()) || "",
    };
    const norm =
      typeof normalizarSolicitanteFlota === "function" ? normalizarSolicitanteFlota(raw) : raw;
    if (norm) out.push(norm);
  });
  return out;
}

function pintarLinkAccesoFlotaEnModal() {
  if (!flotaKanbanId || typeof asegurarLinkAccesoFlota !== "function") return;
  asegurarLinkAccesoFlota(flotaKanbanId);
  persistirFlotas();
  const inp = $("flota-link-acceso");
  if (inp && typeof urlPublicaAccesoFlota === "function") {
    inp.value = urlPublicaAccesoFlota(flotaKanbanId);
  }
}

function pintarClaveFlotaEnModal() {
  const inp = $("flota-clave-pin");
  if (!inp || !flotaKanbanId) return;
  hidratarFlotas();
  const f = flotaPorId(flotaKanbanId);
  inp.value = f && f.pin_cliente ? String(f.pin_cliente) : "";
}

function fotoGuardadaColumnaFlota(col) {
  if (!col || typeof col !== "object") return "";
  if (!Object.prototype.hasOwnProperty.call(col, "foto")) return "";
  return String(col.foto || "").trim();
}

function fotoGuardadaServicioFlota(srv) {
  if (!srv || typeof srv !== "object") return "";
  if (!Object.prototype.hasOwnProperty.call(srv, "foto")) return "";
  return String(srv.foto || "").trim();
}

function pintarPreviewFlotaCol(foto) {
  const img = $("flota-col-carnet-img");
  const vacio = $("flota-col-carnet-vacio");
  const src = String(foto || "").trim();
  if (img) {
    img.hidden = !src;
    if (src) img.src = src;
    else {
      img.removeAttribute("src");
    }
  }
  if (vacio) vacio.hidden = Boolean(src);
}

function pintarPreviewFlotaServicio(foto) {
  const img = $("flota-s-carnet-img");
  const vacio = $("flota-s-carnet-vacio");
  const src = String(foto || "").trim();
  if (img) {
    img.hidden = !src;
    if (src) img.src = src;
    else {
      img.removeAttribute("src");
    }
  }
  if (vacio) vacio.hidden = Boolean(src);
}

async function subirImagenFlotaAdmin(file) {
  const src = await leerImagen(file, 480, { quality: 0.7, forceJpeg: true });
  if (typeof nubeActiva === "function" && nubeActiva()) {
    return await nubeSubirImagen(src);
  }
  return src;
}

function esArchivoImagenFlota(file) {
  return Boolean(file && String(file.type || "").startsWith("image/"));
}

function archivoImagenDesdePaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return null;
  for (const item of items) {
    if (String(item.type || "").startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

async function aplicarArchivoImagenFlotaAdmin(file, pintarFn, asignarDraft) {
  if (!esArchivoImagenFlota(file)) {
    alert("Solo puedes usar archivos de imagen (JPG, PNG, WebP…).");
    return;
  }
  try {
    const src = await subirImagenFlotaAdmin(file);
    asignarDraft(src);
    pintarFn(src);
  } catch (err) {
    alert((err && err.message) || "No se pudo subir la imagen.");
  }
}

function armarZonaImagenFlotaAdmin(zone, modal, onImagen) {
  if (!zone || zone.dataset.dropFlota) return;
  zone.dataset.dropFlota = "1";
  zone.setAttribute("role", "button");
  zone.setAttribute("aria-label", "Arrastra una imagen o pega un pantallazo");

  const marcarHover = (on) => zone.classList.toggle("is-drop-hover", on);

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    marcarHover(true);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    marcarHover(true);
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) marcarHover(false);
  });
  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    marcarHover(false);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) await onImagen(file);
  });
  zone.addEventListener("paste", async (e) => {
    const file = archivoImagenDesdePaste(e);
    if (!file) return;
    e.preventDefault();
    await onImagen(file);
  });
  zone.addEventListener("click", () => zone.focus());

  if (modal && !modal.dataset.pasteFlota) {
    modal.dataset.pasteFlota = "1";
    modal.addEventListener("paste", async (e) => {
      if (modal.hidden) return;
      const file = archivoImagenDesdePaste(e);
      if (!file) return;
      e.preventDefault();
      await onImagen(file);
    });
  }
}

async function guardarFlotasNube() {
  persistirFlotas();
  if (typeof nubeActiva === "function" && nubeActiva()) {
    if (typeof nubeGuardarFlotasTarifario === "function") {
      await nubeGuardarFlotasTarifario();
    } else {
      await nubeGuardarCatalogoCanales(typeof catalogo !== "undefined" ? catalogo : []);
    }
  }
}

function htmlTarjetaFlotaKanban(srv, colId, token) {
  const tok = token || tokenFlotaServicio(srv.id);
  const fotoSrv = fotoGuardadaServicioFlota(srv);
  const inner = `<button class="kanban-card kanban-card-flota" type="button" data-flota-servicio="${escapeAttr(srv.id)}">
    <div class="kanban-cover kanban-cover-flota">${fotoSrv ? `<img src="${escapeAttr(fotoSrv)}" alt="" draggable="false" />` : ""}</div>
    <div class="kanban-body">
      <strong>${escapeText(srv.nombre)}</strong>
      ${srv.descripcion ? `<p class="kanban-desc">${escapeText(srv.descripcion)}</p>` : ""}
      <div class="kanban-precio">${escapeText(clpNetoMasIva(srv.precio))}</div>
    </div>
  </button>`;
  return `<div class="kanban-card-row" data-flota-token="${escapeAttr(tok)}" data-flota-card-col="${escapeAttr(colId)}">
    <div class="kanban-card-wrap">
      ${inner}
      <button type="button" class="kanban-card-del" data-flota-quitar="${escapeAttr(colId)}|${escapeAttr(tok)}" title="Quitar tarjeta" aria-label="Quitar tarjeta">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Z"/></svg>
      </button>
    </div>
  </div>`;
}

function htmlColumnaFlotaKanban(col) {
  const tarjetas = tarjetasFlotaDe(col);
  const fotoCol = fotoGuardadaColumnaFlota(col);
  const hasFoto = Boolean(fotoCol);
  return `
    <section class="kanban-col" data-flota-col-id="${escapeAttr(col.id)}">
      <div class="kanban-apex kanban-apex-flota${hasFoto ? " has-foto" : ""}">
        <button type="button" class="kanban-col-drag" draggable="true" data-flota-col-drag="${escapeAttr(col.id)}" title="Arrastrar columna" aria-label="Arrastrar columna">⋮⋮</button>
        ${hasFoto ? `<div class="kanban-apex-foto"><img src="${escapeAttr(fotoCol)}" alt="" /></div>` : ""}
        <div class="kanban-apex-meta kanban-apex-meta-flota">
          <strong>${escapeText(col.titulo)}</strong>
        </div>
        <button class="kanban-gear" type="button" data-flota-config="${escapeAttr(col.id)}" title="Renombrar categoría" aria-label="Renombrar categoría">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.1 12.9a7.6 7.6 0 0 0 .1-.9 7.6 7.6 0 0 0-.1-.9l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.5-.9l-.4-2.6h-4l-.4 2.6a7.4 7.4 0 0 0-1.5.9l-2.5-1-2 3.4 2.1 1.6a7.6 7.6 0 0 0-.1.9 7.6 7.6 0 0 0 .1.9L2.8 14.5l2 3.4 2.5-1c.5.3 1 .7 1.5.9l.4 2.6h4l.4-2.6c.5-.2 1.1-.5 1.5-.9l2.5 1 2-3.4-2.1-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>
        </button>
      </div>
      <div class="kanban-cards" data-flota-cards="${escapeAttr(col.id)}">
        ${tarjetas.map((t) => htmlTarjetaFlotaKanban(t.servicio, col.id, t.token)).join("")}
        ${!tarjetas.length ? `<p class="kanban-vacio">Sin servicios en esta categoría.</p>` : ""}
      </div>
      <div class="kanban-add">
        <button type="button" class="kanban-add-card" data-flota-add-srv="${escapeAttr(col.id)}">Añadir servicio</button>
      </div>
    </section>
  `;
}

function htmlFormColumnaFlota() {
  return `
    <section class="kanban-col kanban-col-add">
      <h3>Nueva categoría</h3>
      <p>Agrupa servicios del mismo tipo (ej. lavado, pértigas, balizas).</p>
      <label class="field">
        <span>Nombre de la categoría</span>
        <input id="flota-col-titulo-nueva" type="text" placeholder="Ej. Lavado y desbarrado" />
      </label>
      <button class="btn-primary btn-block" type="button" id="btn-flota-col-add">Agregar columna</button>
    </section>
  `;
}

function capturarScrollFlota() {
  const track = document.querySelector(".kanban-flota .kanban-track");
  if (!track) return;
  scrollFlotaGuardado.trackLeft = track.scrollLeft;
  const cols = {};
  track.querySelectorAll("[data-flota-cards]").forEach((box) => {
    const id = box.dataset.flotaCards;
    if (id) cols[id] = box.scrollTop;
  });
  scrollFlotaGuardado.cols = cols;
}

function restaurarScrollFlota() {
  const track = document.querySelector(".kanban-flota .kanban-track");
  if (!track) return;
  const apply = () => {
    track.scrollLeft = scrollFlotaGuardado.trackLeft || 0;
    track.querySelectorAll("[data-flota-cards]").forEach((box) => {
      const id = box.dataset.flotaCards;
      if (id && scrollFlotaGuardado.cols[id] != null) box.scrollTop = scrollFlotaGuardado.cols[id];
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function armarMemoriaScrollFlota(track) {
  if (!track || track.dataset.scrollMemFlota) return;
  track.dataset.scrollMemFlota = "1";
  track.addEventListener("scroll", capturarScrollFlota, { passive: true });
  track.querySelectorAll("[data-flota-cards]").forEach((box) => {
    box.addEventListener("scroll", capturarScrollFlota, { passive: true });
  });
}

function renderListadoFlotas() {
  capturarScrollFlota();
  editando = null;
  flotaKanbanId = null;
  hidratarFlotas();
  $("stage").classList.remove("stage-board");
  $("stage").innerHTML = `
    <div class="flotas-panel">
      <div class="flotas-top">
        <div>
          <h2>Flotas</h2>
          <p>Tarifarios por empresa. Cada flota tiene un tablero kanban por categoría de servicio.</p>
        </div>
        <button class="btn-primary" type="button" id="btn-flota-nueva">+ Nueva flota</button>
      </div>
      <div class="flotas-grid">
        ${
          (FLOTAS || []).length
            ? FLOTAS.map(
                (f) => `
          <button type="button" class="flota-card" data-abrir-flota="${escapeAttr(f.id)}">
            <strong>${escapeText(f.nombre)}</strong>
            <span>${(f.columnas || []).length} categorías · ${(f.columnas || []).reduce((n, c) => n + (c.servicios || []).length, 0)} servicios</span>
          </button>`
              ).join("")
            : `<p class="muted">Aún no hay flotas. Pulsa «+ Nueva flota» o espera la carga inicial de SALFA.</p>`
        }
      </div>
    </div>
  `;
  renderLista();
}

function renderFlotaKanban(flotaId) {
  capturarScrollFlota();
  editando = null;
  hidratarFlotas();
  const flota = flotaPorId(flotaId);
  if (!flota) {
    renderListadoFlotas();
    return;
  }
  flotaKanbanId = flotaId;
  $("stage").classList.add("stage-board");
  $("stage").innerHTML = `
    <div class="kanban kanban-flota">
      <div class="kanban-top">
        <div class="kanban-top-row">
          <button type="button" class="btn-soft btn-back-flota" id="btn-volver-flotas">← Flotas</button>
          <div>
            <h2>${escapeText(flota.nombre)}</h2>
            <p>Precios netos (se muestran con «+ IVA»). Arrastra ⋮⋮ para mover columnas; mantén pulsada una tarjeta para reordenar.</p>
          </div>
          <button type="button" class="btn-soft" id="btn-flota-config">Configuración</button>
          <button type="button" class="btn-soft" id="btn-flota-clave-cliente">Clave cliente</button>
        </div>
      </div>
      <div class="kanban-track">
        ${(flota.columnas || []).map(htmlColumnaFlotaKanban).join("")}
        ${htmlFormColumnaFlota()}
      </div>
    </div>
  `;
  renderLista();
  armarDragFlotaKanban();
  armarMemoriaScrollFlota(document.querySelector(".kanban-flota .kanban-track"));
  restaurarScrollFlota();
}

async function guardarOrdenFlotaKanban() {
  persistirFlotas();
  try {
    await guardarFlotasNube();
  } catch (e) {
    alert((e && e.message) || "No se pudo guardar el tablero de flota.");
  }
}

function limpiarFlotaKanbanCardFlotante(st) {
  if (st && st.ghostEl) st.ghostEl.remove();
  document.querySelectorAll(".kanban-flota .kanban-card-ghost, .kanban-flota .kanban-drop-marker").forEach((el) => el.remove());
}

function limpiarClasesDragFlotaKanban() {
  flotaKanbanDrag = { kind: "", payload: "" };
  if (flotaKanbanCardPointer) {
    if (flotaKanbanCardPointer.holdTimer) clearTimeout(flotaKanbanCardPointer.holdTimer);
    if (flotaKanbanCardPointer.raf) cancelAnimationFrame(flotaKanbanCardPointer.raf);
    if (flotaKanbanCardPointer.row) {
      flotaKanbanCardPointer.row.classList.remove("is-dragging");
      flotaKanbanCardPointer.row.style.minHeight = "";
    }
    limpiarFlotaKanbanCardFlotante(flotaKanbanCardPointer);
  }
  flotaKanbanCardPointer = null;
  document.querySelectorAll(".kanban-flota .kanban-col.is-dragging, .kanban-flota .kanban-col.is-drop-before, .kanban-flota .kanban-cards.is-card-dragging").forEach((el) => {
    el.classList.remove("is-dragging", "is-drop-before", "is-card-dragging");
  });
}

function autoScrollFlotaKanbanCards(box, clientY) {
  if (!box) return;
  const rect = box.getBoundingClientRect();
  const margin = 72;
  const maxStep = 18;
  if (clientY < rect.top + margin) {
    const t = (rect.top + margin - clientY) / margin;
    box.scrollTop -= Math.ceil(maxStep * t);
  } else if (clientY > rect.bottom - margin) {
    const t = (clientY - (rect.bottom - margin)) / margin;
    box.scrollTop += Math.ceil(maxStep * t);
  }
}

function loopFlotaKanbanCardScroll() {
  if (!flotaKanbanCardPointer || !flotaKanbanCardPointer.active) return;
  autoScrollFlotaKanbanCards(flotaKanbanCardPointer.box, flotaKanbanCardPointer.lastY);
  flotaKanbanCardPointer.raf = requestAnimationFrame(loopFlotaKanbanCardScroll);
}

function crearFlotaKanbanGhost(st) {
  const card = st.row.querySelector(".kanban-card");
  if (!card) return;
  const rect = st.row.getBoundingClientRect();
  st.rowHeight = rect.height;
  st.offX = st.lastX - rect.left;
  st.offY = st.lastY - rect.top;
  const ghost = document.createElement("div");
  ghost.className = "kanban-card-ghost";
  ghost.style.width = `${rect.width}px`;
  ghost.appendChild(card.cloneNode(true));
  document.body.appendChild(ghost);
  st.ghostEl = ghost;
  st.row.classList.add("is-dragging");
  st.row.style.minHeight = `${st.rowHeight}px`;
  ghost.style.left = `${st.lastX - st.offX}px`;
  ghost.style.top = `${st.lastY - st.offY}px`;
}

function moverFlotaKanbanGhost(st) {
  if (!st.ghostEl) return;
  st.ghostEl.style.left = `${st.lastX - st.offX}px`;
  st.ghostEl.style.top = `${st.lastY - st.offY}px`;
}

function activarFlotaKanbanCardDrag(st) {
  st.active = true;
  st.pending = false;
  if (st.holdTimer) clearTimeout(st.holdTimer);
  st.box.classList.add("is-card-dragging");
  flotaKanbanDrag = { kind: "card", payload: `${st.colId}|${st.token}` };
  crearFlotaKanbanGhost(st);
  try {
    st.row.setPointerCapture(st.pointerId);
  } catch (err) {}
  pintarMarcadorSoltarFlota(st, st.lastY);
  st.raf = requestAnimationFrame(loopFlotaKanbanCardScroll);
}

function filaFlotaPorToken(box, token) {
  if (!box || !token) return null;
  return box.querySelector(`.kanban-card-row[data-flota-token="${token}"]`);
}

function slotSoltarTarjetaFlota(box, clientY, dragToken) {
  const rows = [...box.querySelectorAll(".kanban-card-row")].filter((r) => r.dataset.flotaToken !== dragToken);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return row.dataset.flotaToken || "";
  }
  return "";
}

function pintarMarcadorSoltarFlota(st, clientY) {
  const beforeToken = slotSoltarTarjetaFlota(st.box, clientY, st.token);
  const slotKey = beforeToken || "__end__";
  st.dropBefore = beforeToken;
  if (st.markerBefore === slotKey && st.marker && st.marker.parentElement === st.box) return;
  st.markerBefore = slotKey;
  if (!st.marker) {
    st.marker = document.createElement("div");
    st.marker.className = "kanban-drop-marker";
    st.marker.innerHTML = "<span>Soltar aquí</span>";
  }
  st.marker.style.height = `${Math.max(st.rowHeight || 80, 64)}px`;
  const beforeRow = beforeToken ? filaFlotaPorToken(st.box, beforeToken) : null;
  if (beforeRow) st.box.insertBefore(st.marker, beforeRow);
  else st.box.appendChild(st.marker);
}

function programarFlotaKanbanDragPintado(st) {
  if (st.paintRaf) return;
  st.paintRaf = requestAnimationFrame(() => {
    st.paintRaf = 0;
    if (!st.active) return;
    moverFlotaKanbanGhost(st);
    pintarMarcadorSoltarFlota(st, st.lastY);
  });
}

function abrirEditorServicioFlota(servicioId) {
  const flota = flotaPorId(flotaKanbanId);
  if (!flota) return;
  let colId = "";
  let srv = null;
  for (const col of flota.columnas) {
    srv = (col.servicios || []).find((s) => s.id === servicioId);
    if (srv) {
      colId = col.id;
      break;
    }
  }
  if (!srv) return;
  flotaSrvEdit = { flotaId: flotaKanbanId, colId, servicioId: srv.id };
  flotaSrvFotoDraft = null;
  $("flota-s-nombre").value = srv.nombre || "";
  $("flota-s-desc").value = srv.descripcion || "";
  $("flota-s-precio").value = srv.precio || "";
  pintarPreviewFlotaServicio(srv.foto || "");
  $("modal-flota-servicio").hidden = false;
}

function abrirModalFlotaCol(colId) {
  flotaColEditId = colId || "";
  const flota = flotaPorId(flotaKanbanId);
  const col = flota && flota.columnas.find((c) => c.id === flotaColEditId);
  flotaColFotoDraft = null;
  flotaColFotoDraftColId = "";
  $("flota-col-titulo").value = (col && col.titulo) || "";
  pintarPreviewFlotaCol(col ? fotoGuardadaColumnaFlota(col) : "");
  $("modal-flota-col").hidden = false;
}

function armarFlotaKanbanCardPointer(track) {
  const umbralMouse = 12;
  const umbralHoldTouch = 220;
  const umbralTap = 14;

  track.addEventListener(
    "pointerdown",
    (e) => {
      const row = e.target.closest(".kanban-card-row");
      if (!row || !row.querySelector(".kanban-card") || e.target.closest(".kanban-gear, .kanban-col-drag, .kanban-add-card, .kanban-card-del")) return;
      const box = row.closest("[data-flota-cards]");
      if (!box) return;
      if (e.button != null && e.button !== 0) return;
      const colId = box.dataset.flotaCards;
      const token = row.dataset.flotaToken;
      if (!colId || !token) return;
      flotaKanbanCardPointer = {
        pending: true,
        active: false,
        touch: e.pointerType === "touch",
        colId,
        token,
        row,
        box,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dropBefore: "",
        markerBefore: "",
        holdTimer: 0,
        raf: 0,
        paintRaf: 0,
        pointerId: e.pointerId,
        scrolling: false,
      };
      if (flotaKanbanCardPointer.touch) {
        flotaKanbanCardPointer.holdTimer = window.setTimeout(() => {
          if (!flotaKanbanCardPointer || flotaKanbanCardPointer.pointerId !== e.pointerId || flotaKanbanCardPointer.active) return;
          if (flotaKanbanCardPointer.scrolling) return;
          if (Math.hypot(flotaKanbanCardPointer.lastX - flotaKanbanCardPointer.startX, flotaKanbanCardPointer.lastY - flotaKanbanCardPointer.startY) > umbralTap) return;
          activarFlotaKanbanCardDrag(flotaKanbanCardPointer);
        }, umbralHoldTouch);
      }
    },
    { passive: true }
  );

  track.addEventListener(
    "pointermove",
    (e) => {
      const st = flotaKanbanCardPointer;
      if (!st || st.pointerId !== e.pointerId) return;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      if (!st.active) {
        const d = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
        if (st.touch) {
          if (d > umbralTap) {
            if (st.holdTimer) clearTimeout(st.holdTimer);
            st.scrolling = true;
          }
          return;
        }
        if (d < umbralMouse) return;
        activarFlotaKanbanCardDrag(st);
      }
      e.preventDefault();
      programarFlotaKanbanDragPintado(st);
    },
    { passive: false }
  );

  const terminar = async (e) => {
    const st = flotaKanbanCardPointer;
    if (!st || st.pointerId !== e.pointerId) return;
    if (st.holdTimer) clearTimeout(st.holdTimer);
    if (st.raf) cancelAnimationFrame(st.raf);
    if (st.paintRaf) cancelAnimationFrame(st.paintRaf);
    const wasDrag = st.active;
    const row = st.row;
    try {
      row.releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (wasDrag) {
      e.preventDefault();
      flotaKanbanSuppressClick = true;
      const destino = st.markerBefore ? (st.markerBefore === "__end__" ? "" : st.markerBefore) : st.dropBefore;
      moverTarjetaFlota(flotaKanbanId, st.colId, st.token, destino);
      limpiarClasesDragFlotaKanban();
      await guardarOrdenFlotaKanban();
      renderFlotaKanban(flotaKanbanId);
      return;
    }
    const d = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
    if (!st.scrolling && d < umbralTap) {
      const btn = row.querySelector("[data-flota-servicio]");
      if (btn) abrirEditorServicioFlota(btn.dataset.flotaServicio);
    }
    flotaKanbanCardPointer = null;
  };

  track.addEventListener("pointerup", terminar);
  track.addEventListener("pointercancel", terminar);
}

function armarDragFlotaKanban() {
  const track = document.querySelector(".kanban-flota .kanban-track");
  if (!track || track.dataset.flotaDrag) return;
  track.dataset.flotaDrag = "1";

  armarFlotaKanbanCardPointer(track);

  track.querySelectorAll("[data-flota-col-drag]").forEach((handle) => {
    handle.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      flotaKanbanDrag = { kind: "col", payload: handle.dataset.flotaColDrag };
      e.dataTransfer.setData("text/plain", `flota-col:${flotaKanbanDrag.payload}`);
      e.dataTransfer.effectAllowed = "move";
      handle.closest(".kanban-col")?.classList.add("is-dragging");
    });
    handle.addEventListener("dragend", limpiarClasesDragFlotaKanban);
  });

  track.querySelectorAll(".kanban-col:not(.kanban-col-add)").forEach((colEl) => {
    colEl.addEventListener("dragover", (e) => {
      if (flotaKanbanDrag.kind !== "col") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".kanban-flota .kanban-col.is-drop-before").forEach((el) => el.classList.remove("is-drop-before"));
      const rect = colEl.getBoundingClientRect();
      colEl.classList.toggle("is-drop-before", e.clientX < rect.left + rect.width / 2);
    });
    colEl.addEventListener("dragleave", (e) => {
      if (!colEl.contains(e.relatedTarget)) colEl.classList.remove("is-drop-before");
    });
    colEl.addEventListener("drop", async (e) => {
      if (flotaKanbanDrag.kind !== "col") return;
      e.preventDefault();
      const colId = flotaKanbanDrag.payload;
      const targetId = colEl.dataset.flotaColId;
      if (!colId || colId === targetId) {
        limpiarClasesDragFlotaKanban();
        return;
      }
      const rect = colEl.getBoundingClientRect();
      const antes = e.clientX < rect.left + rect.width / 2;
      moverColumnaFlota(flotaKanbanId, colId, targetId, antes);
      limpiarClasesDragFlotaKanban();
      await guardarOrdenFlotaKanban();
      renderFlotaKanban(flotaKanbanId);
    });
  });

  track.addEventListener("click", async (e) => {
    if (flotaKanbanSuppressClick) {
      flotaKanbanSuppressClick = false;
      return;
    }
    const quitar = e.target.closest("[data-flota-quitar]");
    if (quitar) {
      const [colId, token] = String(quitar.dataset.flotaQuitar || "").split("|");
      if (!colId || !token || !confirm("¿Quitar este servicio del tablero?")) return;
      quitarServicioFlotaCol(flotaKanbanId, colId, token);
      await guardarOrdenFlotaKanban();
      renderFlotaKanban(flotaKanbanId);
      return;
    }
    const cfg = e.target.closest("[data-flota-config]");
    if (cfg) {
      abrirModalFlotaCol(cfg.dataset.flotaConfig || "");
      return;
    }
    const addSrv = e.target.closest("[data-flota-add-srv]");
    if (addSrv) {
      flotaSrvEdit = { flotaId: flotaKanbanId, colId: addSrv.dataset.flotaAddSrv, servicioId: "" };
      flotaSrvFotoDraft = null;
      $("flota-s-nombre").value = "";
      $("flota-s-desc").value = "";
      $("flota-s-precio").value = "";
      pintarPreviewFlotaServicio("");
      $("modal-flota-servicio").hidden = false;
    }
  });
}

function initFlotasAdmin() {
  const btnFlotas = $("btn-flotas");
  if (!btnFlotas) return;
  btnFlotas.addEventListener("click", () => renderListadoFlotas());

  $("stage").addEventListener("click", async (e) => {
    const abrir = e.target.closest("[data-abrir-flota]");
    if (abrir) {
      renderFlotaKanban(abrir.dataset.abrirFlota);
      return;
    }
    if (e.target.id === "btn-flota-nueva") {
      $("flota-n-nombre").value = "";
      $("modal-flota-nueva").hidden = false;
      return;
    }
    if (e.target.id === "btn-volver-flotas") {
      renderListadoFlotas();
      return;
    }
    if (e.target.id === "btn-flota-config") {
      pintarModalConfigFlota();
      $("modal-flota-config").hidden = false;
      return;
    }
    if (e.target.id === "btn-flota-clave-cliente") {
      pintarClaveFlotaEnModal();
      pintarLinkAccesoFlotaEnModal();
      $("modal-flota-clave").hidden = false;
      return;
    }
    if (e.target.id === "btn-flota-col-add") {
      const titulo = ($("flota-col-titulo-nueva") && $("flota-col-titulo-nueva").value.trim()) || "";
      if (!titulo) {
        alert("Escribe el nombre de la categoría.");
        return;
      }
      if (!flotaKanbanId) return;
      agregarColumnaFlota(flotaKanbanId, titulo);
      await guardarOrdenFlotaKanban();
      renderFlotaKanban(flotaKanbanId);
    }
  });

  $("btn-flota-nueva-ok").addEventListener("click", async () => {
    const nombre = $("flota-n-nombre").value.trim();
    if (!nombre) {
      alert("Escribe el nombre de la empresa o flota.");
      return;
    }
    const flota = crearFlotaVacia(nombre);
    $("modal-flota-nueva").hidden = true;
    try {
      await guardarFlotasNube();
    } catch (err) {
      alert((err && err.message) || "No se pudo guardar la flota.");
    }
    renderFlotaKanban(flota.id);
  });

  $("cerrar-flota-nueva").addEventListener("click", () => {
    $("modal-flota-nueva").hidden = true;
  });

  $("cerrar-flota-clave").addEventListener("click", () => {
    $("modal-flota-clave").hidden = true;
  });
  $("cerrar-flota-config").addEventListener("click", () => {
    $("modal-flota-config").hidden = true;
  });
  const modalFlotaConfig = $("modal-flota-config");
  if (modalFlotaConfig) {
    modalFlotaConfig.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-quitar-sol");
      if (!btn) return;
      const tr = btn.closest("tr");
      if (tr) tr.remove();
    });
  }
  $("btn-flota-config-add-sol").addEventListener("click", () => {
    const tbody = $("flota-config-solicitantes-body");
    if (!tbody) return;
    tbody.insertAdjacentHTML("beforeend", htmlFilaSolicitanteConfigFlota({}));
  });
  $("btn-flota-config-guardar").addEventListener("click", async () => {
    if (!flotaKanbanId) return;
    hidratarFlotas();
    const flota = flotaPorId(flotaKanbanId);
    if (!flota) return;
    const modo = ($("flota-config-agenda") && $("flota-config-agenda").value) || "limitada";
    flota.agenda_modo = modo === "libre" ? "libre" : "limitada";
    flota.solicitantes = leerSolicitantesDesdeModalConfig();
    persistirFlotas();
    try {
      await guardarFlotasNube();
      $("modal-flota-config").hidden = true;
      alert("Configuración guardada.");
    } catch (err) {
      alert((err && err.message) || "No se pudo sincronizar la flota.");
    }
  });
  $("btn-flota-clave-guardar").addEventListener("click", async () => {
    if (!flotaKanbanId) return;
    const pin = ($("flota-clave-pin") && $("flota-clave-pin").value.trim()) || "";
    if (pin && !/^\d{4}$/.test(pin)) {
      alert("La clave debe ser exactamente 4 números.");
      return;
    }
    if (typeof asegurarLinkAccesoFlota === "function") asegurarLinkAccesoFlota(flotaKanbanId);
    const ok = await establecerClaveFlota(flotaKanbanId, pin);
    if (!ok) {
      alert("No se pudo guardar la clave.");
      return;
    }
    try {
      await guardarFlotasNube();
      pintarClaveFlotaEnModal();
      alert(pin ? "Clave guardada. El cliente la usará en la app." : "Acceso libre: ya no se pide clave.");
    } catch (err) {
      alert((err && err.message) || "No se pudo sincronizar la flota.");
    }
  });

  $("btn-flota-copiar-link").addEventListener("click", async () => {
    const inp = $("flota-link-acceso");
    const url = (inp && inp.value.trim()) || "";
    if (!url) {
      alert("No hay enlace. Abre «Clave cliente» desde el tablero de la flota.");
      return;
    }
    try {
      if (typeof copiarTextoPlano === "function") await copiarTextoPlano(url);
      else if (navigator.clipboard) await navigator.clipboard.writeText(url);
      $("btn-flota-copiar-link").textContent = "Copiado";
      setTimeout(() => {
        $("btn-flota-copiar-link").textContent = "Copiar enlace";
      }, 2000);
    } catch (e) {
      inp.select();
      alert("Selecciona la URL y cópiala manualmente.");
    }
  });

  $("btn-flota-regenerar-link").addEventListener("click", async () => {
    if (!flotaKanbanId) return;
    const f = flotaPorId(flotaKanbanId);
    if (!f) return;
    if (!confirm("¿Regenerar enlace? El enlace anterior dejará de funcionar.")) return;
    if (typeof tokenLinkAccesoFlota === "function") f.link_acceso = tokenLinkAccesoFlota();
    persistirFlotas();
    pintarLinkAccesoFlotaEnModal();
    try {
      await guardarFlotasNube();
      alert("Enlace nuevo guardado.");
    } catch (err) {
      alert((err && err.message) || "No se pudo sincronizar el enlace.");
    }
  });

  $("btn-flota-col-ordenar-precio").addEventListener("click", async () => {
    if (!flotaKanbanId || !flotaColEditId) return;
    if (typeof ordenarColumnaFlotaPorPrecio !== "function") return;
    ordenarColumnaFlotaPorPrecio(flotaKanbanId, flotaColEditId);
    try {
      await guardarOrdenFlotaKanban();
      $("modal-flota-col").hidden = true;
      renderFlotaKanban(flotaKanbanId);
    } catch (err) {
      alert((err && err.message) || "No se pudo guardar el orden.");
    }
  });

  $("btn-flota-col-guardar").addEventListener("click", async () => {
    const titulo = $("flota-col-titulo").value.trim();
    if (!titulo || !flotaKanbanId || !flotaColEditId) return;
    const flota = flotaPorId(flotaKanbanId);
    const col = flota && flota.columnas.find((c) => c.id === flotaColEditId);
    if (!col) return;
    col.titulo = titulo;
    if (flotaColFotoDraft !== null && String(flotaColFotoDraftColId || "") === String(flotaColEditId || "")) {
      col.foto = String(flotaColFotoDraft || "").trim();
    }
    flotaColFotoDraft = null;
    flotaColFotoDraftColId = "";
    $("modal-flota-col").hidden = true;
    await guardarOrdenFlotaKanban();
    renderFlotaKanban(flotaKanbanId);
  });

  $("cerrar-flota-col").addEventListener("click", () => {
    flotaColFotoDraft = null;
    flotaColFotoDraftColId = "";
    $("modal-flota-col").hidden = true;
  });

  $("btn-flota-col-foto").addEventListener("click", () => {
    $("flota-col-foto-file").click();
  });
  $("btn-flota-col-quitar-foto").addEventListener("click", () => {
    flotaColFotoDraft = "";
    flotaColFotoDraftColId = flotaColEditId || "";
    pintarPreviewFlotaCol("");
  });
  $("flota-col-foto-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    await aplicarArchivoImagenFlotaAdmin(
      file,
      pintarPreviewFlotaCol,
      (src) => {
        flotaColFotoDraft = src;
        flotaColFotoDraftColId = flotaColEditId || "";
      }
    );
  });

  armarZonaImagenFlotaAdmin($("flota-col-carnet"), $("modal-flota-col"), (file) =>
    aplicarArchivoImagenFlotaAdmin(file, pintarPreviewFlotaCol, (src) => {
      flotaColFotoDraft = src;
      flotaColFotoDraftColId = flotaColEditId || "";
    })
  );

  $("btn-flota-s-foto").addEventListener("click", () => {
    $("flota-s-foto-file").click();
  });
  $("btn-flota-s-quitar-foto").addEventListener("click", () => {
    flotaSrvFotoDraft = "";
    pintarPreviewFlotaServicio("");
  });
  $("flota-s-foto-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    await aplicarArchivoImagenFlotaAdmin(
      file,
      pintarPreviewFlotaServicio,
      (src) => {
        flotaSrvFotoDraft = src;
      }
    );
  });

  armarZonaImagenFlotaAdmin($("flota-s-carnet"), $("modal-flota-servicio"), (file) =>
    aplicarArchivoImagenFlotaAdmin(file, pintarPreviewFlotaServicio, (src) => {
      flotaSrvFotoDraft = src;
    })
  );

  $("btn-flota-s-guardar").addEventListener("click", async () => {
    if (!flotaSrvEdit || !flotaSrvEdit.flotaId || !flotaSrvEdit.colId) return;
    const nombre = $("flota-s-nombre").value.trim();
    const descripcion = $("flota-s-desc").value.trim();
    const precio = Number($("flota-s-precio").value);
    if (!nombre) {
      alert("El servicio necesita nombre.");
      return;
    }
    const flota = flotaPorId(flotaSrvEdit.flotaId);
    const col = flota && flota.columnas.find((c) => c.id === flotaSrvEdit.colId);
    if (!col) return;
    const fotoSrv = flotaSrvFotoDraft !== null ? flotaSrvFotoDraft : undefined;
    if (flotaSrvEdit.servicioId) {
      const srv = col.servicios.find((s) => s.id === flotaSrvEdit.servicioId);
      if (srv) {
        srv.nombre = nombre;
        srv.descripcion = descripcion;
        srv.precio = Number.isFinite(precio) ? precio : 0;
        if (fotoSrv !== undefined) srv.foto = fotoSrv;
      }
    } else {
      agregarServicioFlotaCol(flotaSrvEdit.flotaId, flotaSrvEdit.colId, {
        nombre,
        descripcion,
        precio,
        foto: fotoSrv !== undefined ? fotoSrv : "",
      });
    }
    flotaSrvFotoDraft = null;
    $("modal-flota-servicio").hidden = true;
    flotaSrvEdit = null;
    await guardarOrdenFlotaKanban();
    renderFlotaKanban(flotaKanbanId);
  });

  $("cerrar-flota-servicio").addEventListener("click", () => {
    flotaSrvFotoDraft = null;
    $("modal-flota-servicio").hidden = true;
    flotaSrvEdit = null;
  });
}

async function arrancarFlotasAdmin() {
  if (!(FLOTAS && FLOTAS.length)) hidratarFlotas();
  const sembrado = await sembrarFlotaSalfaSiCorresponde();
  let subir = sembrado;
  if (typeof asegurarSolicitantesSemillaSalfa === "function") {
    subir = (await asegurarSolicitantesSemillaSalfa()) || subir;
  }
  if (subir && typeof nubeActiva === "function" && nubeActiva()) {
    try {
      await guardarFlotasNube();
    } catch (e) {
      console.warn("No se pudo subir la flota SALFA inicial.", e);
    }
  }
}

initFlotasAdmin();
