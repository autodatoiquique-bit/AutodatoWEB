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

function htmlBarraSalirFlotas() {
  return `<div class="flota-modulo-top"><button type="button" class="btn-soft btn-salir-flota-modulo" id="btn-salir-flotas">Salir</button></div>`;
}

function htmlTarjetaCategoriaFlota(col) {
  const n = (col.servicios || []).length;
  return `
    <article class="card flota-cat-card">
      <button class="card-abrir" type="button" data-flota-categoria="${escFlota(col.id)}">
        <div class="card-photo">
          ${col.foto ? `<img class="card-photo-img" src="${escFlota(col.foto)}" alt="" loading="lazy" />` : ""}
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
  const lid = lineaFlotaCarritoId(flotaId, srv.id);
  const enCarro = state.carrito.some((x) => x.tipo === "flota" && x.id === lid);
  const precioTxt = typeof clpNetoMasIva === "function" ? clpNetoMasIva(srv.precio) : clp(srv.precio);
  return `
    <article class="card ${enCarro ? "card-en-carro" : "card-con-add"}">
      <button class="card-abrir" type="button" data-flota-servicio="${escFlota(srv.id)}">
        <div class="card-photo">
          ${srv.foto ? `<img class="card-photo-img" src="${escFlota(srv.foto)}" alt="" loading="lazy" />` : ""}
          <div class="card-tags">
            ${enCarro ? `<span class="tag tag-carrito">En ticket</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          <h3>${escFlota(srv.nombre)}</h3>
          ${srv.descripcion ? `<p>${escFlota(srv.descripcion)}</p>` : ""}
          <div class="precio flota-precio-iva">${escFlota(precioTxt)}</div>
        </div>
      </button>
      ${
        enCarro
          ? ""
          : `<button class="card-add" type="button" data-add-flota="${escFlota(flotaId)}|${escFlota(srv.id)}" title="Agregar al ticket" aria-label="Agregar al ticket">
              <span class="kpi-cart">${htmlIconoCarroFlota()}</span>
            </button>`
      }
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
    ${htmlBarraSalirFlotas()}
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
    ${htmlBarraSalirFlotas()}
    <section class="panel claro">
      <h2>${escFlota(f.nombre)}</h2>
      ${bienvenida}
      ${typeof htmlAvisoTicketCorto === "function" ? htmlAvisoTicketCorto() : ""}
      <p class="lead">Elige una categoría de servicios.</p>
      <div class="grid flota-cat-grid">
        ${
          (f.columnas || []).length
            ? f.columnas.map(htmlTarjetaCategoriaFlota).join("")
            : `<p class="muted">Esta flota aún no tiene categorías.</p>`
        }
      </div>
    </section>
  `;
  state.flotaBienvenida = "";
}

function renderFlotaServicios() {
  const f = flotaPorId(state.flotaActivaId);
  const col = columnaFlotaPorId(state.flotaActivaId, state.flotaCategoriaId);
  if (!f || !col) {
    state.vista = "flotas-categorias";
    renderFlotaCategorias();
    return;
  }
  const servicios = col.servicios || [];
  $("stage").innerHTML = `
    ${htmlBarraSalirFlotas()}
    <section class="panel claro">
      <button type="button" class="btn-soft btn-volver-flota" data-volver-flotas-categorias>← Categorías</button>
      <h2>${escFlota(col.titulo)}</h2>
      <p class="lead">${escFlota(f.nombre)} · precios netos + IVA</p>
      <div class="grid">
        ${
          servicios.length
            ? servicios.map((s) => htmlTarjetaServicioFlota(s, f.id)).join("")
            : `<p class="muted">No hay servicios en esta categoría.</p>`
        }
      </div>
    </section>
  `;
}

async function intentarPinFlota() {
  const pin = ($("flota-pin-input") && $("flota-pin-input").value.trim()) || "";
  const err = $("flota-pin-error");
  if (err) err.hidden = true;
  const flotaId =
    typeof resolverFlotaIdPorPin === "function" ? await resolverFlotaIdPorPin(pin) : null;
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
  if (state.vista === "flotas-servicios") renderFlotaServicios();
}

function refrescarVistaFlotaCliente() {
  if (state.vista === "flotas-pin") renderFlotaPin();
  else if (state.vista === "flotas-categorias") renderFlotaCategorias();
  else if (state.vista === "flotas-servicios") renderFlotaServicios();
}
