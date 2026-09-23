function escFlota(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

async function ensureFlotasPublico() {
  if (typeof cargarFlotasPublico === "function") await cargarFlotasPublico();
  else if (typeof hidratarFlotas === "function") hidratarFlotas();
  return FLOTAS || [];
}

function htmlIconoCarroFlota() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l1 2h14l-1.6 8H8L6 7"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>`;
}

function textoBotonNavFlota() {
  return state.vista === "flotas-categorias" ? "← Salir" : "← Atrás";
}

function htmlBarraNavFlotas() {
  return `<div class="flota-modulo-top"><button type="button" class="btn-soft btn-flota-nav" id="btn-flota-atras">${textoBotonNavFlota()}</button></div>`;
}

function atrasNavegacionFlota() {
  if (state.vista === "flotas-categorias") {
    if (typeof salirAreaFlotas === "function") salirAreaFlotas();
    return;
  }
  if (state.vista === "flotas-servicio-detalle") {
    state.flotaServicioDetalleId = "";
    state.vista = "flotas-servicios";
    if (typeof renderVista === "function") renderVista();
    return;
  }
  if (state.vista === "flotas-servicios") {
    state.flotaCategoriaId = "";
    state.vista = "flotas-categorias";
    if (typeof renderVista === "function") renderVista();
    return;
  }
  if (state.vista === "flotas-pin") {
    if (typeof salirAreaFlotas === "function") salirAreaFlotas();
    return;
  }
  if (typeof salirAreaFlotas === "function") salirAreaFlotas();
}

function servicioFlotaEnCarrito(flotaId, servicioId) {
  const id = lineaFlotaCarritoId(flotaId, servicioId);
  return state.carrito.some((x) => x.tipo === "flota" && x.id === id);
}

function htmlBotonCarritoFlotaTarjeta(flotaId, srv) {
  const fid = escFlota(flotaId);
  const sid = escFlota(srv.id);
  if (servicioFlotaEnCarrito(flotaId, srv.id)) {
    return `<button class="card-add card-quitar-flota" type="button" data-quitar-flota="${fid}|${sid}" title="Quitar del ticket">Quitar del ticket</button>`;
  }
  return `<button class="card-add" type="button" data-add-flota="${fid}|${sid}" title="Agregar al ticket" aria-label="Agregar al ticket">
    <span class="kpi-cart">${htmlIconoCarroFlota()}</span>
  </button>`;
}

function htmlBotonCarritoFlotaBusqueda(flotaId, srv) {
  const fid = escFlota(flotaId);
  const sid = escFlota(srv.id);
  if (servicioFlotaEnCarrito(flotaId, srv.id)) {
    return `<div class="flota-busq-acciones">
      <span class="tag tag-carrito">En ticket</span>
      <button type="button" class="btn-soft flota-busq-quitar" data-quitar-flota="${fid}|${sid}">Quitar del ticket</button>
    </div>`;
  }
  return `<button type="button" class="btn-primary btn-sm flota-busq-add" data-add-flota="${fid}|${sid}">Añadir al ticket</button>`;
}

function refrescarUiCarritoFlota() {
  if (state.vista === "flotas-categorias") pintarResultadosBusquedaFlota();
  else if (state.vista === "flotas-servicios") renderFlotaServicios();
  else if (state.vista === "flotas-servicio-detalle") renderFlotaServicioDetalle();
}

function quitarServicioFlotaDelCarrito(flotaId, servicioId) {
  const id = lineaFlotaCarritoId(flotaId, servicioId);
  if (typeof quitarItem === "function") quitarItem(id);
  else {
    state.carrito = state.carrito.filter((x) => x.id !== id);
    if (typeof persistir === "function") persistir();
    if (typeof renderTotales === "function") renderTotales(true);
    refrescarUiCarritoFlota();
  }
}

function serviciosFlotaColumnaOrdenados(flotaId, colId) {
  if (typeof serviciosFlotaEnOrdenCol === "function") return serviciosFlotaEnOrdenCol(flotaId, colId);
  const col = typeof columnaFlotaPorId === "function" ? columnaFlotaPorId(flotaId, colId) : null;
  return (col && col.servicios) || [];
}

function htmlFilaBusquedaFlota(hit, flotaId) {
  const srv = hit.servicio;
  const lid = lineaFlotaCarritoId(flotaId, srv.id);
  const enCarro = servicioFlotaEnCarrito(flotaId, srv.id);
  const precioTxt = typeof clpNetoMasIva === "function" ? clpNetoMasIva(srv.precio) : clp(srv.precio);
  return `
    <article class="flota-busq-item ${enCarro ? "is-en-carro" : ""}">
      <button type="button" class="flota-busq-main" data-flota-servicio="${escFlota(srv.id)}">
        <strong class="flota-busq-nombre">${escFlota(srv.nombre)}</strong>
        ${hit.categoria ? `<span class="flota-busq-cat">${escFlota(hit.categoria)}</span>` : ""}
        ${srv.descripcion ? `<span class="flota-busq-desc">${escFlota(srv.descripcion)}</span>` : ""}
        <span class="precio flota-precio-iva flota-busq-precio">${escFlota(precioTxt)}</span>
      </button>
      ${htmlBotonCarritoFlotaBusqueda(flotaId, srv)}
    </article>
  `;
}

function syncChromeBusquedaFlota() {
  const inp = $("flota-busqueda-input");
  const activo =
    state.vista === "flotas-categorias" &&
    Boolean(inp && (inp.value.trim() || document.activeElement === inp));
  document.body.classList.toggle("en-flotas-busqueda", activo);
  if (typeof syncTecladoViewport === "function") syncTecladoViewport();
}

function scrollBusquedaFlotaVisible() {
  const head = document.querySelector(".flota-cat-head");
  const stage = $("stage");
  if (head) {
    head.scrollIntoView({ block: "start", behavior: "auto" });
  }
  if (stage) stage.scrollTop = 0;
  if (typeof esMovil === "function" && esMovil()) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function pintarResultadosBusquedaFlota() {
  const inp = $("flota-busqueda-input");
  const grid = $("flota-categorias-grid");
  const box = $("flota-busqueda-resultados");
  const hint = $("flota-categorias-hint");
  if (!inp || !box || !grid) return;
  const q = inp.value.trim();
  const f = flotaPorId(state.flotaActivaId);
  syncChromeBusquedaFlota();
  if (!q || !f) {
    box.hidden = true;
    box.innerHTML = "";
    grid.hidden = false;
    if (hint) hint.hidden = false;
    return;
  }
  const hits = typeof buscarServiciosFlota === "function" ? buscarServiciosFlota(f.id, q) : [];
  grid.hidden = true;
  if (hint) hint.hidden = true;
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.map((h) => htmlFilaBusquedaFlota(h, f.id)).join("")
    : `<p class="muted flota-busq-vacio">Ningún servicio coincide con «${escFlota(q)}».</p>`;
}

function armarBusquedaFlotaCategorias() {
  const inp = $("flota-busqueda-input");
  if (!inp || inp.dataset.busqFlota) return;
  inp.dataset.busqFlota = "1";
  inp.addEventListener("input", () => {
    pintarResultadosBusquedaFlota();
    scrollBusquedaFlotaVisible();
  });
  inp.addEventListener("focus", () => {
    syncChromeBusquedaFlota();
    scrollBusquedaFlotaVisible();
    setTimeout(scrollBusquedaFlotaVisible, 80);
    setTimeout(() => {
      if (typeof syncTecladoViewport === "function") syncTecladoViewport();
    }, 320);
  });
  inp.addEventListener("blur", () => {
    setTimeout(syncChromeBusquedaFlota, 120);
  });
  if (inp.value.trim()) pintarResultadosBusquedaFlota();
}

function htmlTarjetaCategoriaFlota(col) {
  const n = (col.servicios || []).length;
  return `
    <article class="card flota-cat-card">
      <button class="card-abrir" type="button" data-flota-categoria="${escFlota(col.id)}">
        <div class="card-photo">
          ${Object.prototype.hasOwnProperty.call(col, "foto") && col.foto ? `<img class="card-photo-img" src="${escFlota(col.foto)}" alt="" loading="lazy" />` : ""}
        </div>
        <div class="card-body">
          <h3>${escFlota(col.titulo)}</h3>
          <p>${n} servicio${n === 1 ? "" : "s"}</p>
        </div>
      </button>
    </article>
  `;
}

function htmlTarjetaServicioFlota(srv, flotaId) {
  const enCarro = servicioFlotaEnCarrito(flotaId, srv.id);
  const precioTxt = typeof clpNetoMasIva === "function" ? clpNetoMasIva(srv.precio) : clp(srv.precio);
  return `
    <article class="card card-flota-serv card-con-add ${enCarro ? "card-en-carro" : ""}">
      <button class="card-abrir" type="button" data-flota-servicio="${escFlota(srv.id)}" aria-label="Ver ${escFlota(srv.nombre)}">
        <div class="card-photo card-photo-flota">
          ${srv.foto ? `<img class="card-photo-img" src="${escFlota(srv.foto)}" alt="" loading="lazy" />` : ""}
          <div class="card-tags">
            ${enCarro ? `<span class="tag tag-carrito">En ticket</span>` : ""}
          </div>
        </div>
        <div class="card-body card-body-flota">
          <h3 class="flota-srv-nombre">${escFlota(srv.nombre)}</h3>
          ${srv.descripcion ? `<p class="flota-srv-desc">${escFlota(srv.descripcion)}</p>` : ""}
          <div class="precio flota-precio-iva">${escFlota(precioTxt)}</div>
        </div>
      </button>
      ${htmlBotonCarritoFlotaTarjeta(flotaId, srv)}
    </article>
  `;
}

function armarTecladoPinFlota() {
  const inp = $("flota-pin-input");
  if (!inp || inp.dataset.tecladoFlota) return;
  inp.dataset.tecladoFlota = "1";
  const onFocus = () => {
    document.body.classList.add("en-flotas-pin");
    document.body.classList.add("teclado-abierto");
    if (typeof syncTecladoViewport === "function") {
      setTimeout(syncTecladoViewport, 60);
      setTimeout(syncTecladoViewport, 320);
      setTimeout(() => {
        if (typeof llevarCampoSobreTeclado === "function") llevarCampoSobreTeclado(inp);
      }, 380);
    }
  };
  const onBlur = () => {
    setTimeout(() => {
      if (document.activeElement !== inp) document.body.classList.remove("en-flotas-pin");
      if (typeof syncTecladoViewport === "function") syncTecladoViewport();
    }, 150);
  };
  inp.addEventListener("focus", onFocus);
  inp.addEventListener("blur", onBlur);
}

function renderFlotaPin() {
  $("stage").innerHTML = `
    ${htmlBarraNavFlotas()}
    <section class="panel claro flota-pin-panel">
      <h2>Tarifario flotas</h2>
      <p class="lead">Ingresa la clave de 4 dígitos que te entregó el taller.</p>
      <label class="field">
        <span>Clave</span>
        <input id="flota-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="••••" />
      </label>
      <p id="flota-pin-error" class="error" hidden>Clave incorrecta. Revisa con el taller.</p>
      <button class="btn-primary btn-block" type="button" id="btn-flota-pin-ingresar">Entrar</button>
    </section>
  `;
  armarTecladoPinFlota();
  void ensureFlotasPublico().catch(() => {});
  const inp = $("flota-pin-input");
  if (inp) {
    inp.focus({ preventScroll: true });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") intentarPinFlota();
    });
  }
}

function renderFlotaCategorias() {
  const f = flotaPorId(state.flotaActivaId);
  if (!f) {
    state.vista = "flotas-pin";
    renderFlotaPin();
    return;
  }
  const bienvenida =
    state.flotaBienvenida && String(state.flotaBienvenida).trim()
      ? `<p class="flota-bienvenida">Bienvenido ${escFlota(state.flotaBienvenida)}</p>`
      : "";
  $("stage").innerHTML = `
    <div class="flota-cat-head">
      ${htmlBarraNavFlotas()}
      <label class="field flota-busqueda-field">
        <span class="flota-busq-label">Buscar servicio</span>
        <input id="flota-busqueda-input" type="search" enterkeyhint="search" autocomplete="off" placeholder="Buscar servicio…" />
      </label>
    </div>
    <section class="panel claro flota-cat-panel">
      <div class="flota-cat-meta">
        <h2>${escFlota(f.nombre)}</h2>
        ${bienvenida}
        ${typeof htmlAvisoTicketCorto === "function" ? htmlAvisoTicketCorto() : ""}
      </div>
      <div id="flota-busqueda-resultados" class="flota-busqueda-resultados" hidden></div>
      <p id="flota-categorias-hint" class="lead">Elige una categoría de servicios.</p>
      <div id="flota-categorias-grid" class="grid flota-cat-grid">
        ${
          (f.columnas || []).length
            ? f.columnas.map(htmlTarjetaCategoriaFlota).join("")
            : `<p class="muted">Esta flota aún no tiene categorías.</p>`
        }
      </div>
    </section>
  `;
  state.flotaBienvenida = "";
  armarBusquedaFlotaCategorias();
}

function renderFlotaServicios() {
  const f = flotaPorId(state.flotaActivaId);
  const col = columnaFlotaPorId(state.flotaActivaId, state.flotaCategoriaId);
  if (!f || !col) {
    state.vista = "flotas-categorias";
    renderFlotaCategorias();
    return;
  }
  const servicios = serviciosFlotaColumnaOrdenados(f.id, col.id);
  $("stage").innerHTML = `
    ${htmlBarraNavFlotas()}
    <section class="panel claro flota-servicios-panel">
      <h2>${escFlota(col.titulo)}</h2>
      <p class="lead">${escFlota(f.nombre)} · precios netos + IVA</p>
      <div class="grid flota-servicios-grid">
        ${
          servicios.length
            ? servicios.map((s) => htmlTarjetaServicioFlota(s, f.id)).join("")
            : `<p class="muted">No hay servicios en esta categoría.</p>`
        }
      </div>
    </section>
  `;
}

function renderFlotaServicioDetalle() {
  const f = flotaPorId(state.flotaActivaId);
  const sid = state.flotaServicioDetalleId;
  const srv = f && sid ? buscarServicioFlota(f.id, sid) : null;
  if (!f || !srv) {
    state.vista = "flotas-servicios";
    renderFlotaServicios();
    return;
  }
  const lid = lineaFlotaCarritoId(f.id, srv.id);
  const enCarro = state.carrito.some((x) => x.tipo === "flota" && x.id === lid);
  const precioTxt = typeof clpNetoMasIva === "function" ? clpNetoMasIva(srv.precio) : clp(srv.precio);
  $("stage").innerHTML = `
    ${htmlBarraNavFlotas()}
    <section class="panel claro flota-srv-detalle">
      <div class="flota-det-cover">${srv.foto ? `<img src="${escFlota(srv.foto)}" alt="" />` : ""}</div>
      <h2>${escFlota(srv.nombre)}</h2>
      ${srv.descripcion ? `<p class="lead flota-det-desc">${escFlota(srv.descripcion)}</p>` : `<p class="muted">Sin descripción adicional.</p>`}
      <div class="precio flota-precio-iva flota-det-precio">${escFlota(precioTxt)}</div>
      ${
        enCarro
          ? `<div class="flota-det-acciones">
              <span class="tag tag-carrito">En ticket</span>
              <button class="btn-soft btn-block" type="button" data-quitar-flota="${escFlota(f.id)}|${escFlota(srv.id)}">Quitar del ticket</button>
            </div>`
          : `<button class="btn-primary btn-block" type="button" data-add-flota="${escFlota(f.id)}|${escFlota(srv.id)}">Agregar al ticket</button>`
      }
    </section>
  `;
}

function abrirDetalleServicioFlota(servicioId) {
  state.flotaServicioDetalleId = servicioId;
  state.vista = "flotas-servicio-detalle";
  if (typeof renderVista === "function") renderVista();
}

async function intentarPinFlota() {
  const err = $("flota-pin-error");
  const btn = $("btn-flota-pin-ingresar");
  if (err) err.hidden = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Verificando…";
  }
  try {
    await ensureFlotasPublico();
  } catch (_e) {
    if (err) {
      err.textContent = "No pudimos cargar el tarifario. Reintenta.";
      err.hidden = false;
    }
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  }
  const pin = ($("flota-pin-input") && $("flota-pin-input").value.trim()) || "";
  if (err) err.textContent = "Clave incorrecta. Revisa con el taller.";
  const preferId =
    state.flotaActivaId ||
    (typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "") ||
    "";
  let flotaId = null;
  if (preferId && typeof verificarClaveFlota === "function" && (await verificarClaveFlota(preferId, pin))) {
    flotaId = preferId;
  } else if (typeof resolverFlotaIdPorPin === "function") {
    flotaId = await resolverFlotaIdPorPin(pin);
  }
  if (!flotaId) {
    if (err) err.hidden = false;
    return;
  }
  marcarSesionFlota(flotaId);
  entrarFlota(flotaId, { bienvenida: true });
}

function entrarFlota(id, opts = {}) {
  const f = flotaPorId(id);
  state.flotaActivaId = id;
  state.flotaCategoriaId = "";
  state.flotaPendienteId = "";
  if (opts.bienvenida && f) state.flotaBienvenida = f.nombre;
  state.vista = "flotas-categorias";
  if (typeof renderVista === "function") renderVista();
}

async function abrirVistaFlotas() {
  if (typeof entrarAreaFlotas === "function" && !entrarAreaFlotas()) return;
  try {
    await ensureFlotasPublico();
  } catch (e) {
    alert("No pudimos cargar las flotas. Reintenta.");
    return;
  }
  const sesionId = (FLOTAS || []).find((f) => sesionFlotaOk(f.id));
  if (sesionId) {
    entrarFlota(sesionId.id, { bienvenida: false });
    return;
  }
  state.flotaActivaId = "";
  state.flotaCategoriaId = "";
  state.flotaPendienteId = "";
  state.vista = "flotas-pin";
  if (typeof renderVista === "function") renderVista();
}

async function entrarFlotaPorLinkAcceso(token) {
  try {
    await ensureFlotasPublico();
  } catch (e) {
    return false;
  }
  const f = typeof flotaPorLinkAcceso === "function" ? flotaPorLinkAcceso(token) : null;
  if (!f) return false;
  if (typeof entrarAreaFlotas === "function" && !entrarAreaFlotas()) return false;
  marcarSesionFlota(f.id);
  if (typeof guardarTokenLinkFlotaSesion === "function") guardarTokenLinkFlotaSesion(f.id, token);
  state.flotaBienvenida = f.nombre;
  entrarFlota(f.id, { bienvenida: true });
  return true;
}

function agregarServicioFlotaAlCarrito(flotaId, servicioId) {
  if (typeof carritoTieneParticular === "function" && carritoTieneParticular()) {
    alert("No puedes mezclar servicios de flota con particulares. Sal del área Flotas y vacía el carrito.");
    return;
  }
  const srv = buscarServicioFlota(flotaId, servicioId);
  if (!srv) return;
  const id = lineaFlotaCarritoId(flotaId, servicioId);
  if (state.carrito.some((x) => x.id === id)) return;
  if (carritoTieneFlota() && !state.carrito.every((x) => x.flotaId === flotaId)) {
    alert("Solo puedes armar un ticket de una empresa de flota a la vez.");
    return;
  }
  state.areaFlotas = true;
  if (typeof syncAreaFlotasUi === "function") syncAreaFlotasUi();
  state.carrito.push({ tipo: "flota", id, flotaId, servicioId });
  if (typeof persistir === "function") persistir();
  if (typeof renderTotales === "function") renderTotales(true);
  refrescarUiCarritoFlota();
}

function refrescarVistaFlotaCliente() {
  if (state.vista === "flotas-pin") renderFlotaPin();
  else if (state.vista === "flotas-categorias") {
    if ($("flota-busqueda-input")) pintarResultadosBusquedaFlota();
    else renderFlotaCategorias();
  } else if (state.vista === "flotas-servicios") renderFlotaServicios();
  else if (state.vista === "flotas-servicio-detalle") renderFlotaServicioDetalle();
}
