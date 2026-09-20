const BLOQUES = [
  { hora: "09:00", etiqueta: "Mañana 09:00" },
  { hora: "11:00", etiqueta: "Mañana 11:00" },
  { hora: "15:00", etiqueta: "Tarde 15:00" },
];

const PAGINAS = {
  flotas: {
    titulo: "Flotas",
    texto: "Atención de flotas con los mismos modelos que recibe el taller (2010 en adelante). Escríbenos o agenda unidad por unidad.",
  },
};

const state = {
  vista: "portada",
  ofertaAbierta: null,
  ofertaPendiente: null,
  vehiculo: null,
  carrito: [],
  origenAgenda: "menu",
  pasoAgenda: "filtro",
  servicioAgenda: null,
  cliente: { nombre: "", telefono: "", patente: "", correo: "" },
  cita: { fecha: "", hora: "" },
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  vistaAnterior: "ofertas",
  origenLista: "ofertas",
  agregarTrasFiltro: false,
  vistaPendiente: "",
};

let quitarPendiente = null;

const $ = (id) => document.getElementById(id);

function clp(n) {
  if (n == null) return "A confirmar";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function calcular(carrito = state.carrito) {
  const items = [];
  let subtotal = 0;
  let total = 0;
  let ahorro = 0;

  carrito.forEach((linea) => {
    if (linea.tipo === "oferta") {
      const s = oferta(linea.id);
      if (!s) return;
      const otros = carrito.filter((x) => x.id !== linea.id).map((x) => x.id);
      const p = precioPagado(s, otros);
      items.push({ ...s, tipo: "oferta", ...p });
      subtotal += p.lista;
      total += p.pagado;
      ahorro += p.ahorro;
    } else {
      const s = servicioAgenda(linea.id);
      if (!s) return;
      items.push({ ...s, tipo: "agenda", lista: s.precio, pagado: s.precio, ahorro: 0 });
      if (s.precio != null) {
        subtotal += s.precio;
        total += s.precio;
      }
    }
  });

  return { items, subtotal, total, ahorro };
}

function vehiculoOk() {
  return Boolean(
    state.vehiculo &&
      state.vehiculo.marca &&
      state.vehiculo.modelo &&
      state.vehiculo.ano &&
      state.vehiculo.combustible
  );
}

function textoVehiculo() {
  if (!state.vehiculo) return "";
  const fuel = state.vehiculo.combustible ? ` · ${etiquetaCombustible(state.vehiculo.combustible)}` : "";
  return `${state.vehiculo.marca} ${state.vehiculo.modelo} ${state.vehiculo.ano}${fuel}`;
}

function textoVehiculoCorto() {
  if (!vehiculoOk()) return "Tu auto";
  return `${state.vehiculo.modelo} ${state.vehiculo.ano}`;
}

function fotoVehiculoActual() {
  if (!vehiculoOk()) return "";
  return typeof fotoPortadaVehiculo === "function"
    ? fotoPortadaVehiculo(state.vehiculo)
    : fotoModeloDe(state.vehiculo.marca, state.vehiculo.modelo);
}

function vistaConPerfilModelo() {
  const v = state.vista;
  return v === "ofertas" || v === "mantencion" || v === "diagnostico" || v === "oferta-detalle" || v === "filtro-oferta";
}

function pintarChipAuto() {
  const chip = $("chip-auto");
  const src = fotoVehiculoActual();
  const fichaAbierta = Boolean($("modal-informe") && !$("modal-informe").hidden);
  const mostrar = Boolean(vehiculoOk() && vistaConPerfilModelo() && !fichaAbierta);
  document.body.classList.toggle("hay-auto", vehiculoOk());
  document.body.classList.toggle("hay-perfil", mostrar);
  if (!chip) return;
  chip.hidden = !mostrar;
  if (!mostrar) return;
  const foto = $("perfil-auto-foto");
  if (foto) {
    foto.hidden = !src;
    if (src) foto.src = src;
  }
  const texto = $("chip-auto-texto");
  if (texto) texto.textContent = textoVehiculoCorto();
}

function abrirModalAuto() {
  if (!$("modal-auto-cuerpo")) return;
  $("modal-auto-cuerpo").innerHTML = htmlFiltro("editar");
  $("modal-auto").hidden = false;
  $("overlay").hidden = true;
}

function cerrarModalAuto() {
  if ($("modal-auto")) $("modal-auto").hidden = true;
}

function opciones(lista, valor, placeholder) {
  return `<option value="">${placeholder}</option>${lista
    .map((v) => `<option value="${v}" ${String(valor) === String(v) ? "selected" : ""}>${v}</option>`)
    .join("")}`;
}

function htmlDrop(id, label, lista, valor, placeholder, disabled) {
  const items = (lista || []).map((v) => (v && typeof v === "object" ? v : { value: v, label: v }));
  const actual = items.find((x) => String(x.value) === String(valor));
  const texto = actual ? actual.label : placeholder;
  return `
    <div class="dd">
      <span class="dd-label">${label}</span>
      <input type="hidden" id="f-${id}" value="${valor || ""}" />
      <button type="button" class="dd-btn" data-dd-toggle="${id}" ${disabled ? "disabled" : ""}>
        <span data-dd-texto>${texto}</span>
        <b aria-hidden="true">▾</b>
      </button>
      <ul class="dd-list" id="dd-list-${id}" hidden>
        ${items
          .map(
            (v) =>
              `<li><button type="button" data-dd-pick="${id}" data-value="${v.value}" class="${
                String(valor) === String(v.value) ? "is-on" : ""
              }">${v.label}</button></li>`
          )
          .join("")}
      </ul>
    </div>
  `;
}

function htmlFiltro(contexto) {
  const marca = state.vehiculo?.marca || "";
  const modelo = state.vehiculo?.modelo || "";
  const ano = state.vehiculo?.ano || "";
  const combustible = state.vehiculo?.combustible || "";
  const modelos = marca ? modelosDe(marca) : [];
  return `
    <div class="filtro">
      <h2>${contexto === "editar" ? "Cambia tu vehículo" : "¿Qué vehículo tienes?"}</h2>
      <p class="lead">Marca, modelo, año y combustible. Si tu auto no está en la lista, no podemos abrirte el servicio. El año y el combustible importan: un mismo trabajo puede ser otro producto.</p>
      ${htmlDrop("marca", "Marca", MARCAS, marca, "Elige la marca", false)}
      ${htmlDrop("modelo", "Modelo", modelos, modelo, marca ? "Elige el modelo" : "Primero elige la marca", !marca)}
      ${htmlDrop("ano", "Año", anios(), ano, "Elige el año", false)}
      ${htmlDrop("combustible", "Combustible", COMBUSTIBLES, combustible, "Elige el combustible", false)}
      ${marca && modelo && fotoModeloDe(marca, modelo) ? `<div class="filtro-foto"><img src="${fotoModeloDe(marca, modelo)}" alt="${modelo}" /></div>` : ""}
      <button class="btn-primary btn-block" type="button" data-filtrar="${contexto}">${contexto === "editar" ? "Guardar auto" : "Continuar"}</button>
    </div>
  `;
}

function cerrarDrops(salvo) {
  document.querySelectorAll(".dd-list").forEach((el) => {
    if (el.id !== `dd-list-${salvo}`) el.hidden = true;
  });
}

function resetModeloDrop() {
  const marca = $("f-marca")?.value;
  const hidden = $("f-modelo");
  const btn = document.querySelector('[data-dd-toggle="modelo"]');
  const list = $("dd-list-modelo");
  if (!hidden || !btn || !list) return;
  hidden.value = "";
  const span = btn.querySelector("[data-dd-texto]");
  if (!marca) {
    btn.disabled = true;
    if (span) span.textContent = "Primero elige la marca";
    list.innerHTML = "";
    return;
  }
  btn.disabled = false;
  if (span) span.textContent = "Elige el modelo";
  list.innerHTML = modelosDe(marca)
    .map((v) => `<li><button type="button" data-dd-pick="modelo" data-value="${v}">${v}</button></li>`)
    .join("");
}

function elegirDrop(id, valor) {
  const hidden = $(`f-${id}`);
  const btn = document.querySelector(`[data-dd-toggle="${id}"]`);
  const list = $(`dd-list-${id}`);
  if (hidden) hidden.value = valor;
  if (btn) {
    const span = btn.querySelector("[data-dd-texto]");
    const pick = list && list.querySelector(`[data-dd-pick][data-value="${valor}"]`);
    if (span) span.textContent = (pick && pick.textContent) || valor;
  }
  if (list) {
    list.hidden = true;
    list.querySelectorAll("[data-dd-pick]").forEach((b) => b.classList.toggle("is-on", b.dataset.value === String(valor)));
  }
  if (id === "marca") {
    state.vehiculo = { ...(state.vehiculo || {}), marca: valor, modelo: "" };
    resetModeloDrop();
  } else if (id === "modelo") {
    state.vehiculo = { ...(state.vehiculo || {}), modelo: valor };
  } else if (id === "ano") {
    state.vehiculo = { ...(state.vehiculo || {}), ano: Number(valor) };
  } else if (id === "combustible") {
    state.vehiculo = { ...(state.vehiculo || {}), combustible: valor };
  }
}

function esMovil() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function esIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function irAContenido() {
  if (!esMovil()) return;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function syncCromo() {
  document.body.classList.toggle("en-portada", state.vista === "portada");
}

function marcarMenu() {
  const fichaAbierta = Boolean($("modal-informe") && !$("modal-informe").hidden);
  document.querySelectorAll(".menu [data-vista]").forEach((btn) => {
    const on =
      !fichaAbierta &&
      (btn.dataset.vista === state.vista ||
        ((state.vista === "oferta-detalle" || state.vista === "filtro-oferta") && btn.dataset.vista === state.origenLista) ||
        (state.vista === "carrito-agenda" && btn.dataset.vista === "agendamiento"));
    btn.classList.toggle("is-on", on);
  });
  const inf = document.querySelector('.menu [data-open="informe"]');
  if (inf) inf.classList.toggle("is-on", fichaAbierta);
}

function ticketAbierto() {
  return Boolean($("drawer-ticket") && !$("drawer-ticket").hidden);
}

function syncSeguirKpi() {
  const historial = Boolean($("modal-informe") && !$("modal-informe").hidden);
  const enPortada = state.vista === "portada";
  const ticket = ticketAbierto();
  const stack = document.querySelector(".kpi-stack");
  if (stack) stack.hidden = historial || enPortada || ticket;
  const btn = $("btn-seguir-kpi");
  if (!btn) return;
  const enAgenda = state.vista === "agendamiento" || state.vista === "carrito-agenda";
  btn.hidden = historial || ticket || !enAgenda;
}

function renderTotales(animar) {
  const { total, ahorro } = calcular();
  $("total-valor").textContent = clp(total);
  $("saldo-valor").textContent = clp(ahorro);
  if (animar) {
    const bar = $("totales-bar");
    bar.classList.remove("pop");
    void bar.offsetWidth;
    bar.classList.add("pop");
  }
}

function persistir() {
  localStorage.setItem(
    "autodato_sesion",
    JSON.stringify({
      carrito: state.carrito,
      vehiculo: state.vehiculo,
      cliente: state.cliente,
      cita: state.cita,
    })
  );
}

function hidratar() {
  try {
    const raw = JSON.parse(localStorage.getItem("autodato_sesion") || "null");
    if (!raw) return;
    if (Array.isArray(raw.carrito)) {
      state.carrito = raw.carrito.filter((x) =>
        x.tipo === "oferta" ? Boolean(oferta(x.id)) : Boolean(servicioAgenda(x.id))
      );
    }
    if (raw.vehiculo) {
      state.vehiculo = raw.vehiculo;
      if (state.vehiculo && !state.vehiculo.combustible) state.vehiculo.combustible = "ambos";
    }
    if (raw.cliente) state.cliente = { ...state.cliente, ...raw.cliente };
    if (raw.cita) state.cita = { ...state.cita, ...raw.cita };
  } catch (e) {
    /* ignore */
  }
}

function estiloFotoPortadaAttr(s) {
  return estiloFotoPortada(s).replace(/"/g, "");
}

function htmlSlidePortada(s) {
  const ofertaOk = slideMuestraBoton(s) && oferta(s.servicio_id);
  return `
    <article class="home-slide">
      <img class="home-foto" src="${s.foto}" alt="${ofertaOk ? oferta(s.servicio_id).nombre : "Portada AutoDato"}" style="${estiloFotoPortadaAttr(s)}" />
      ${
        ofertaOk
          ? `<button class="home-add" type="button" data-portada-oferta="${s.servicio_id}" style="left:${s.btn_x}%;top:${s.btn_y}%">${s.btn_texto || "Agregar al carrito"}</button>`
          : ""
      }
    </article>`;
}

function armarCarruselPortada(nReal) {
  const pista = $("home-slides");
  if (!pista || nReal < 1) return;
  const slides = [...pista.querySelectorAll(".home-slide")];
  const dots = document.querySelectorAll(".home-dots i");
  const loop = nReal > 1;
  const ancho = () => pista.clientWidth;
  const medir = () => {
    const w = ancho();
    slides.forEach((el) => {
      el.style.flex = `0 0 ${w}px`;
      el.style.width = `${w}px`;
      el.style.minWidth = `${w}px`;
      el.style.maxWidth = `${w}px`;
    });
  };
  const crudo = () => Math.round(pista.scrollLeft / Math.max(1, ancho()));
  const realDe = (i) => {
    if (!loop) return i;
    if (i <= 0) return nReal - 1;
    if (i >= nReal + 1) return 0;
    return i - 1;
  };
  const pintarDots = (i) => {
    dots.forEach((d, n) => d.classList.toggle("on", n === i));
  };
  const irA = (i, suave) => {
    const w = ancho();
    if (!w) return;
    if (suave) pista.scrollTo({ left: i * w, behavior: "smooth" });
    else {
      const prev = pista.style.scrollBehavior;
      pista.style.scrollBehavior = "auto";
      pista.scrollLeft = i * w;
      pista.style.scrollBehavior = prev;
    }
    pintarDots(realDe(i));
  };
  const acomodar = () => {
    let i = crudo();
    if (loop && i <= 0) {
      irA(nReal, false);
      return;
    }
    if (loop && i >= nReal + 1) {
      irA(1, false);
      return;
    }
    irA(i, true);
  };
  const irAlPrimero = () => {
    medir();
    if (ancho() < 20) return false;
    irA(loop ? 1 : 0, false);
    return true;
  };
  if (!irAlPrimero()) {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (irAlPrimero() || n > 40) clearInterval(t);
    }, 50);
  }
  let tope;
  pista.addEventListener("scroll", () => {
    pintarDots(realDe(crudo()));
    clearTimeout(tope);
    tope = setTimeout(acomodar, 80);
  }, { passive: true });
  if (window._portadaResize) window.removeEventListener("resize", window._portadaResize);
  window._portadaResize = () => {
    medir();
    irA(loop ? realDe(crudo()) + 1 : crudo(), false);
  };
  window.addEventListener("resize", window._portadaResize);
}

function renderPortada() {
  const lista = slidesPortadaPara(state.vehiculo);
  const loop = lista.length > 1;
  const pista = loop ? [lista[lista.length - 1], ...lista, lista[0]] : lista;
  $("stage").innerHTML = `
    <section class="home-screen">
      <header class="home-logo">
        <img data-logo src="${logoHref()}" alt="AutoDato" style="${estiloLogoPortada(portadaUi)}" />
      </header>
      <div class="home-slides" id="home-slides">${pista.map(htmlSlidePortada).join("")}</div>
      ${htmlCapaPortada(portadaUi, lista.length, 0, false)}
    </section>
  `;
  armarCarruselPortada(lista.length);
  pintarChipAuto();
}

function idsComboPara(id) {
  return state.carrito.filter((x) => x.tipo === "oferta" && x.id !== id).map((x) => x.id);
}

function htmlHintCombo(s, pagado) {
  const mejor = mejorComboEntrante(s, pagado);
  if (!mejor) return "";
  return `<p class="combo-hint">Si también llevas ${nombreServicioDe(mejor.si)}, baja a <strong>${clp(mejor.precio)}</strong></p>`;
}

function htmlSumaRelacionados(s, enCarro) {
  const padres = combosEntrantesDe(s.id)
    .map((r) => ({ regla: r, servicio: oferta(r.si) }))
    .filter((x) => x.servicio && servicioAplicaAVehiculo(x.servicio, state.vehiculo));
  const hijos = (s.complementos || [])
    .map((c) => ({ combo: c, servicio: oferta(c.id) }))
    .filter((x) => x.servicio && servicioAplicaAVehiculo(x.servicio, state.vehiculo));
  const bloques = [];
  if (padres.length) {
    const mejor = padres.reduce((a, b) => (a.regla.precio <= b.regla.precio ? a : b));
    bloques.push(`
      <section class="suma-ofertas">
        <h3>Suma ${mejor.servicio.nombre} y este servicio queda en ${clp(mejor.regla.precio)}</h3>
        <div class="minis">${padres.map((x) => htmlMini(x.servicio)).join("")}</div>
      </section>
    `);
  }
  if (enCarro && hijos.length) {
    bloques.push(`
      <section class="suma-ofertas">
        <h3>Suma estos servicios y activa la oferta</h3>
        <div class="minis">${hijos.map((x) => htmlMini(x.servicio, x.combo)).join("")}</div>
      </section>
    `);
  }
  return bloques.join("");
}

function htmlIconoCarro() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l1 2h14l-1.6 8H8L6 7"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>`;
}

function htmlTarjetaOferta(s) {
  const enCarro = state.carrito.some((x) => x.id === s.id);
  const p = precioPagado(s, idsComboPara(s.id));
  const hayDesc = p.ahorro > 0;
  return `
    <article class="card ${enCarro ? "card-en-carro" : "card-con-add"}">
      <button class="card-abrir" type="button" data-abrir-oferta="${s.id}">
        <div class="card-photo" style="background-image:url('${s.foto}')">
          <div class="card-tags">
            ${enCarro ? `<span class="tag tag-carrito">En carrito</span>` : ""}
            ${!enCarro && hayDesc ? `<span class="tag tag-dto">− ${clp(p.ahorro)}</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          <h3>${s.nombre}</h3>
          <p>${s.resumen}</p>
          ${normalizarVehiculos(s.vehiculos).length ? `<p class="card-veh">${etiquetaVehiculos(s)}</p>` : ""}
          ${
            hayDesc
              ? `<div class="precio-lista tachado">${clp(s.precio)}</div>
                 <div class="precio-card-oferta">${clp(p.pagado)}</div>
                 <div class="ahorro-tag">Ahorras ${clp(p.ahorro)}</div>
                 ${p.regla && p.regla.si ? `<p class="card-combo">${p.regla.etiqueta}</p>` : ""}`
              : `<div class="precio">${clp(s.precio)}</div>`
          }
          ${htmlHintCombo(s, p.pagado)}
        </div>
      </button>
      ${
        enCarro
          ? ""
          : `<button class="card-add" type="button" data-add-oferta="${s.id}" title="Agregar al carrito" aria-label="Agregar al carrito">
              <span class="kpi-cart">${htmlIconoCarro()}</span>
            </button>`
      }
    </article>
  `;
}

function serviciosParaVehiculo(lista) {
  return (lista || []).filter((s) => servicioAplicaAVehiculo(s, state.vehiculo));
}

function htmlListaCotizacion(titulo, lead, lista, opts = {}) {
  const hayCarro = state.carrito.some((x) => x.tipo === "oferta");
  const vacio = vehiculoOk()
    ? `<p class="muted">No hay servicios para ${textoVehiculo()}.</p>`
    : `<p class="muted">Aún no hay servicios en esta sección.</p>`;
  const texto = opts.fijo || !hayCarro
    ? lead
    : "Los servicios con etiqueta En carrito ya están seleccionados. En el resto ves el descuento de combo si aplica.";
  return `
    <section class="panel claro">
      <h2>${titulo}</h2>
      <p class="lead">${texto}</p>
      <div class="grid">
        ${lista.length ? lista.map(htmlTarjetaOferta).join("") : vacio}
      </div>
    </section>
  `;
}

function renderOfertas() {
  $("stage").innerHTML = htmlListaCotizacion(
    "Ofertas",
    "Promociones de ocasión. Las mantenciones regulares están en Mantención preventiva.",
    serviciosParaVehiculo(serviciosOferta())
  );
}

function renderMantencion() {
  $("stage").innerHTML = htmlListaCotizacion(
    "Mantención preventiva",
    "¡Arma tu combo y ahorra en mano de obra! Al realizar varios servicios en una misma visita optimizamos los tiempos de taller y desarme, permitiéndonos ofrecerte un descuento especial en cada mantención adicional que sumes al carrito.",
    serviciosParaVehiculo(serviciosMantencion()),
    { fijo: true }
  );
}

function renderFiltroOferta() {
  $("stage").innerHTML = `<section class="panel claro">${htmlFiltro("oferta")}</section>`;
}

function renderFiltroMenu() {
  $("stage").innerHTML = `<section class="panel claro">${htmlFiltro("menu")}</section>`;
}

function renderDetalleOferta() {
  const s = oferta(state.ofertaAbierta);
  if (!s) {
    renderOfertas();
    return;
  }
  const enCarro = state.carrito.some((x) => x.id === s.id);
  const ids = state.carrito.map((x) => x.id);
  const p = precioPagado(s, ids.filter((id) => id !== s.id));
  const mostrarDesc = p.ahorro > 0;

  $("stage").innerHTML = `
    <article class="detalle-full">
      <div class="detalle-hero">
        ${htmlCarruselServicio(s)}
        <div class="detalle-copy">
          <h2>${s.nombre}</h2>
          ${s.resumen ? `<p class="detalle-resumen">${s.resumen}</p>` : ""}
          <p class="lead">${s.detalle}</p>
          <div class="precio-fila">
            <div class="precio-col">
              <div class="precio-lista ${mostrarDesc ? "tachado" : ""}">${clp(s.precio)}</div>
              ${
                mostrarDesc
                  ? `<div class="precio-oferta">${clp(p.pagado)}</div><div class="ahorro-tag">Ahorras ${clp(p.ahorro)} ${p.regla && p.regla.si ? p.regla.etiqueta : ""}</div>`
                  : ""
              }
              ${htmlHintCombo(s, p.pagado)}
            </div>
            ${
              enCarro
                ? `<button class="btn-en-carro" type="button" data-quitar-oferta="${s.id}">En carrito</button>`
                : `<button class="btn-add-precio" type="button" data-add-oferta="${s.id}">Agregar al carrito</button>`
            }
          </div>
          ${htmlSumaRelacionados(s, enCarro)}
        </div>
      </div>
    </article>
  `;
  armarCarruselDetalle();
}

function htmlSlideMediaServicio(m) {
  if (m.tipo === "video") {
    return `<article class="detalle-slide"><video class="servicio-video" src="${m.src}" playsinline muted controls preload="metadata"></video></article>`;
  }
  return `<article class="detalle-slide"><img class="home-foto" src="${m.src}" alt="" style="${estiloFotoPortada(m)}" /></article>`;
}

function htmlCarruselServicio(s) {
  const media = mediaServicio(s);
  if (!media.length) return `<div class="detalle-media"><div class="detalle-foto"></div></div>`;
  return `
    <div class="detalle-media" id="detalle-media">
      <div class="detalle-pista" id="detalle-pista">${media.map(htmlSlideMediaServicio).join("")}</div>
      <div class="detalle-fade" aria-hidden="true"></div>
      ${
        media.length > 1
          ? `<div class="home-dots detalle-dots" style="left:${s.dots_x || 50}%;top:${s.dots_y || 88}%">${media.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>`
          : ""
      }
    </div>
  `;
}

function armarCarruselDetalle() {
  const pista = $("detalle-pista");
  if (!pista) return;
  const slides = [...pista.querySelectorAll(".detalle-slide")];
  const dots = document.querySelectorAll(".detalle-dots i");
  const ancho = () => pista.clientWidth;
  const medir = () => {
    const w = ancho();
    slides.forEach((el) => {
      el.style.flex = `0 0 ${w}px`;
      el.style.width = `${w}px`;
      el.style.minWidth = `${w}px`;
      el.style.maxWidth = `${w}px`;
    });
  };
  const pintar = () => {
    const i = Math.round(pista.scrollLeft / Math.max(1, ancho()));
    dots.forEach((d, n) => d.classList.toggle("on", n === i));
  };
  medir();
  requestAnimationFrame(medir);
  pista.addEventListener("scroll", pintar, { passive: true });
  if (window._detalleResize) window.removeEventListener("resize", window._detalleResize);
  window._detalleResize = () => {
    const i = Math.round(pista.scrollLeft / Math.max(1, ancho()));
    medir();
    pista.scrollLeft = i * ancho();
  };
  window.addEventListener("resize", window._detalleResize);
}

function htmlMini(s, combo) {
  const enCarro = state.carrito.some((x) => x.id === s.id);
  const p = precioPagado(s, idsComboPara(s.id));
  const precioCombo = combo && Number(combo.precioCombo) > 0 ? Number(combo.precioCombo) : null;
  const pagadoCombo = precioCombo != null && precioCombo < (p.pagado == null ? Infinity : p.pagado) ? precioCombo : p.pagado;
  const hayOferta = p.lista != null && pagadoCombo != null && pagadoCombo < p.lista;
  const pagado = hayOferta ? pagadoCombo : p.pagado;
  const ahorro = hayOferta ? p.lista - pagado : 0;
  const etiqueta = (precioCombo != null && precioCombo === pagado && combo?.etiqueta) || (p.regla && p.regla.si ? p.regla.etiqueta : "") || "";
  return `
    <div class="mini">
      <div class="mini-foto" style="background-image:url('${s.foto}')"></div>
      <div class="mini-body">
        ${enCarro ? `<span class="tag tag-carrito">En carrito</span>` : ""}
        <strong>${s.nombre}</strong>
        ${
          hayOferta
            ? `<div class="lista">${clp(s.precio)}</div><div class="nuevo">${clp(pagado)}</div><div class="ahorro-tag">− ${clp(ahorro)} ${etiqueta}</div>`
            : `<div class="precio">${clp(s.precio)}</div>`
        }
        <div class="btn-row">
          <button class="btn-soft" type="button" data-abrir-oferta="${s.id}">Ver</button>
          ${
            enCarro
              ? `<button class="btn-soft" type="button" data-quitar-oferta="${s.id}">Quitar</button>`
              : `<button class="btn-green" type="button" data-add-oferta="${s.id}">Añadir</button>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderInfo(clave) {
  const p = PAGINAS[clave];
  $("stage").innerHTML = `
    <section class="panel claro">
      <h2>${p.titulo}</h2>
      <p class="lead">${p.texto}</p>
      <button class="btn-primary" type="button" data-vista="agendamiento">Ir a agendamiento</button>
    </section>
  `;
}

function renderAgendamiento() {
  if (state.carrito.length) {
    if (!vehiculoOk()) {
      $("stage").innerHTML = `<section class="panel claro">${htmlFiltro("agenda-oferta")}</section>`;
      return;
    }
    renderDatosAgenda();
    return;
  }

  if (state.pasoAgenda === "filtro" || !vehiculoOk()) {
    $("stage").innerHTML = `<section class="panel claro">${htmlFiltro("agenda")}</section>`;
    return;
  }

  if (state.pasoAgenda === "servicio" || !state.servicioAgenda) {
    renderServicioAgenda();
    return;
  }

  renderDatosAgenda();
}

function renderDiagnostico() {
  $("stage").innerHTML = htmlListaCotizacion(
    "Diagnóstico automotriz",
    "Elige el diagnóstico. Se suma a la misma cotización que mantención y ofertas.",
    serviciosParaVehiculo(serviciosDiagnostico())
  );
}

function renderServicioAgenda() {
  const actual = state.servicioAgenda || "";
  $("stage").innerHTML = `
    <section class="panel claro">
      <div class="filtro">
        <p class="muted">${textoVehiculo()}</p>
        <h2>Servicio requerido</h2>
        <p class="lead">Elige solo una opción de esta lista.</p>
        <label class="field">
          <span>Servicio</span>
          <select id="f-servicio">
            <option value="">Elige el servicio</option>
            ${serviciosAgendaLista().map(
              (s) =>
                `<option value="${s.id}" ${actual === s.id ? "selected" : ""}>${s.nombre}${s.precio != null ? " — " + clp(s.precio) : ""}</option>`
            ).join("")}
          </select>
        </label>
        <button class="btn-primary btn-block" type="button" id="btn-seguir-servicio">Continuar</button>
      </div>
    </section>
  `;
  $("btn-seguir-servicio").addEventListener("click", () => {
    const id = $("f-servicio").value;
    if (!id) {
      alert("Elige el servicio requerido.");
      return;
    }
    state.servicioAgenda = id;
    state.carrito = [{ tipo: "agenda", id }];
    state.pasoAgenda = "datos";
    persistir();
    renderTotales(false);
    renderVista();
  });
}

function esHabil(date) {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

function ymd(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function hoy0() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function fechaBonita(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function htmlCalendario() {
  const { y, m } = state.cal;
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const titulo = first.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const celdas = [];
  for (let i = 0; i < startPad; i += 1) celdas.push("<span></span>");
  for (let d = 1; d <= days; d += 1) {
    const fecha = new Date(y, m, d);
    const id = ymd(fecha);
    const ok = esHabil(fecha) && fecha >= hoy0();
    const on = state.cita.fecha === id ? "is-on" : "";
    celdas.push(`<button type="button" data-dia="${id}" ${ok ? "" : "disabled"} class="${on}">${d}</button>`);
  }
  return `
    <div class="cal-wrap">
      <div class="cal-nav">
        <button type="button" data-cal="-1">‹</button>
        <strong>${titulo}</strong>
        <button type="button" data-cal="1">›</button>
      </div>
      <div class="cal">
        <b>L</b><b>M</b><b>M</b><b>J</b><b>V</b><b>S</b><b>D</b>
        ${celdas.join("")}
      </div>
      <p class="muted">${state.cita.fecha && state.cita.hora ? `Elegiste ${fechaBonita(state.cita.fecha)} · ${state.cita.hora}` : "Pincha un día hábil. Se abre un recuadro con las horas."}</p>
    </div>
  `;
}

function abrirModalHoras(fecha) {
  $("modal-horas").hidden = false;
  $("overlay").hidden = false;
  $("modal-horas-fecha").textContent = fechaBonita(fecha);
  $("modal-horas-lista").innerHTML = BLOQUES.map(
    (b) =>
      `<button type="button" data-hora="${b.hora}" class="${state.cita.hora === b.hora && state.cita.fecha === fecha ? "is-on" : ""}">${b.etiqueta}</button>`
  ).join("");
}

function cerrarModalHoras() {
  $("modal-horas").hidden = true;
  if (overlayLibre()) $("overlay").hidden = true;
}

function irAAgendaDesdeKpi() {
  if (!state.carrito.length) {
    alert("Agrega al menos un servicio para generar el ticket.");
    return;
  }
  if (state.vista !== "agendamiento" && state.vista !== "carrito-agenda") {
    state.vistaAnterior = state.vista;
  }
  state.origenAgenda = state.carrito.some((x) => x.tipo === "oferta") ? "ofertas" : "menu";
  state.vista = "carrito-agenda";
  cerrarModalKpi();
  renderVista();
}

function seguirExplorandoOfertas() {
  cerrarModalKpi();
  if (state.vistaAnterior === "oferta-detalle" && state.ofertaAbierta) {
    state.vista = "oferta-detalle";
  } else {
    state.vista = state.origenLista || "ofertas";
  }
  renderVista();
}

function abrirModalKpi() {
  $("modal-kpi").hidden = false;
  $("overlay").hidden = false;
}

function cerrarModalKpi() {
  $("modal-kpi").hidden = true;
  if (overlayLibre()) $("overlay").hidden = true;
}

function tecladoFichaActivo() {
  const a = document.activeElement;
  return Boolean(
    $("modal-informe") &&
    !$("modal-informe").hidden &&
    a &&
    (a.id === "informe-patente" || a.id === "informe-telefono")
  );
}

function syncTecladoFicha() {
  const modal = $("modal-informe");
  const abierta = Boolean(modal && !modal.hidden);
  let cubierto = 0;
  if (abierta && window.visualViewport) {
    const vv = window.visualViewport;
    cubierto = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }
  document.documentElement.style.setProperty("--teclado", `${cubierto}px`);
  document.body.classList.toggle("teclado-abierto", abierta && (cubierto > 80 || tecladoFichaActivo()));
  if (abierta && (cubierto > 80 || tecladoFichaActivo())) {
    const btn = $("btn-abrir-informe");
    if (btn) btn.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
}

function guardarDatosFicha() {
  const pat = $("informe-patente");
  const tel = $("informe-telefono");
  if (pat) state.cliente.patente = normalizarPatente(pat.value);
  if (tel) state.cliente.telefono = String(tel.value || "").trim();
  persistir();
}

function pintarDatosFicha() {
  const pat = $("informe-patente");
  const tel = $("informe-telefono");
  if (pat) pat.value = state.cliente.patente || "";
  if (tel) tel.value = state.cliente.telefono || "";
}

function abrirModalInforme() {
  pintarDatosFicha();
  $("modal-informe").hidden = false;
  $("overlay").hidden = true;
  marcarMenu();
  syncSeguirKpi();
  pintarChipAuto();
  syncTecladoFicha();
}

function cerrarModalInforme() {
  guardarDatosFicha();
  $("modal-informe").hidden = true;
  if (overlayLibre()) $("overlay").hidden = true;
  marcarMenu();
  syncSeguirKpi();
  pintarChipAuto();
  syncTecladoFicha();
}

function normalizarPatente(v) {
  return String(v || "").replace(/[\s.-]/g, "").toUpperCase();
}

function normalizarFono(v) {
  return String(v || "").replace(/\D/g, "").replace(/^56/, "");
}

async function buscarTicketVisita(patente, telefono) {
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      const remoto = await nubeBuscarTicket(patente, telefono);
      if (remoto) return remoto;
    } catch (e) {
      console.warn("No se pudo buscar el ticket en la nube.", e);
    }
  }
  const tickets = JSON.parse(localStorage.getItem("autodato_tickets") || "[]");
  return tickets.find(
    (t) => normalizarPatente(t.patente) === patente && normalizarFono(t.telefono) === telefono
  );
}

function iconoBasura() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12"/></svg>`;
}

function renderDatosAgenda() {
  const { items, subtotal, total, ahorro } = calcular();
  $("stage").innerHTML = `
    <section class="panel claro">
      <h2>Tus datos y la hora</h2>
      <p class="lead">${textoVehiculo()}. Al generar el ticket, la visita queda agendada.</p>
      <ul class="resumen">
        ${items
          .map((s) => {
            const precio = s.pagado == null ? "A confirmar" : clp(s.pagado);
            const desc = s.ahorro > 0 ? `<span class="ahorro-tag">− ${clp(s.ahorro)}</span> <s>${clp(s.lista)}</s> ` : "";
            return `<li class="resumen-item"><span class="resumen-nom">${s.nombre}<button class="btn-basura" type="button" data-pedir-quitar="${s.id}" aria-label="Quitar ${s.nombre}">${iconoBasura()}</button></span><strong>${desc}${precio}</strong></li>`;
          })
          .join("")}
        <li><span>Lista</span><strong>${clp(subtotal)}</strong></li>
        <li><span>Ahorro</span><strong style="color:var(--red)">${clp(ahorro)}</strong></li>
        <li><span>Total</span><strong style="color:var(--green)">${clp(total)}</strong></li>
      </ul>
      <label class="field"><span>Nombre</span><input id="c-nombre" type="text" value="${escapeAttr(state.cliente.nombre)}" /></label>
      <label class="field"><span>Teléfono</span><input id="c-telefono" type="tel" value="${escapeAttr(state.cliente.telefono)}" /></label>
      <label class="field"><span>Patente (opcional)</span><input id="c-patente" type="text" maxlength="8" value="${escapeAttr(state.cliente.patente)}" /></label>
      <label class="field"><span>Correo (opcional)</span><input id="c-correo" type="email" value="${escapeAttr(state.cliente.correo)}" /></label>
      <h3>Fecha de visita</h3>
      ${htmlCalendario()}
      <button class="btn-green btn-block" type="button" id="btn-ticket">Generar ticket y agendar</button>
    </section>
  `;

  ["c-nombre", "c-telefono", "c-patente", "c-correo"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", guardarClienteDesdeForma);
  });
}

function escapeAttr(v) {
  return String(v || "").replace(/"/g, "&quot;");
}

function faltantesTicket() {
  const falta = [];
  if (!state.carrito.length) falta.push("al menos un servicio");
  if (!vehiculoOk()) falta.push("marca, modelo, año y combustible del vehículo");
  if (!state.cliente.nombre.trim()) falta.push("nombre");
  if (!state.cliente.telefono.trim()) falta.push("teléfono");
  if (!state.cita.fecha) falta.push("día de visita");
  if (!state.cita.hora) falta.push("bloque horario");
  return falta;
}

function renderVista(opts = {}) {
  syncCromo();
  marcarMenu();
  syncSeguirKpi();
  pintarChipAuto();
  if (state.vista === "portada") renderPortada();
  else if (state.vista === "ofertas") renderOfertas();
  else if (state.vista === "mantencion") renderMantencion();
  else if (state.vista === "filtro-oferta") renderFiltroOferta();
  else if (state.vista === "filtro-menu") renderFiltroMenu();
  else if (state.vista === "oferta-detalle") renderDetalleOferta();
  else if (state.vista === "diagnostico") renderDiagnostico();
  else if (state.vista === "agendamiento" || state.vista === "carrito-agenda") renderAgendamiento();
  else renderInfo(state.vista);
  if (!opts.quedarse) irAContenido();
}

function aplicarFiltro(contexto) {
  const marca = $("f-marca").value;
  const modelo = $("f-modelo").value;
  const ano = $("f-ano").value;
  const combustible = $("f-combustible") && $("f-combustible").value;
  if (!marca || !modelo || !ano || !combustible) {
    alert("Elige marca, modelo, año y combustible. Si tu auto no está en la lista, no podemos abrirte el servicio.");
    return;
  }
  state.vehiculo = { marca, modelo, ano: Number(ano), combustible };
  persistir();
  pintarChipAuto();

  if (contexto === "editar") {
    cerrarModalAuto();
    renderVista({ quedarse: true });
    return;
  }
  if (contexto === "menu") {
    const dest = state.vistaPendiente || "ofertas";
    state.vistaPendiente = "";
    if (dest === "agendamiento") {
      state.vista = "agendamiento";
      if (state.carrito.length) {
        state.origenAgenda = state.carrito.some((x) => x.tipo === "oferta") ? "ofertas" : "menu";
        state.pasoAgenda = "datos";
      } else {
        state.origenAgenda = "menu";
        state.pasoAgenda = state.servicioAgenda ? "datos" : "servicio";
      }
    } else {
      if (dest === "ofertas" || dest === "mantencion" || dest === "diagnostico") state.origenLista = dest;
      state.vista = dest;
    }
    renderVista();
    return;
  }

  if (contexto === "oferta") {
    state.vista = "oferta-detalle";
    state.ofertaAbierta = state.ofertaPendiente;
    if (state.agregarTrasFiltro && state.ofertaPendiente) {
      const id = state.ofertaPendiente;
      const s = oferta(id);
      state.agregarTrasFiltro = false;
      if (s && !servicioAplicaAVehiculo(s, state.vehiculo)) {
        alert(`Esta oferta no aplica para ${textoVehiculo()}.`);
      } else if (s && !state.carrito.some((x) => x.id === id)) {
        state.carrito.push({ tipo: "oferta", id });
        persistir();
        renderTotales(true);
      }
    }
    renderVista();
    return;
  }
  if (contexto === "agenda-oferta") {
    state.origenAgenda = "ofertas";
    state.vista = "carrito-agenda";
    renderVista();
    return;
  }
  state.pasoAgenda = "servicio";
  state.vista = "agendamiento";
  renderVista();
}

function intentarAbrirOferta(id) {
  state.ofertaPendiente = id;
  state.agregarTrasFiltro = false;
  if (!vehiculoOk()) {
    state.vista = "filtro-oferta";
    renderVista();
    return;
  }
  const s = oferta(id);
  if (s && !servicioAplicaAVehiculo(s, state.vehiculo)) {
    alert(`Este servicio no aplica para ${textoVehiculo()}.`);
    return;
  }
  state.ofertaAbierta = id;
  state.vista = "oferta-detalle";
  renderVista();
}

function iniciarOfertaDesdePortada(id) {
  if (!oferta(id)) return;
  state.ofertaPendiente = id;
  state.agregarTrasFiltro = true;
  if (vehiculoOk()) {
    aplicarFiltroTrasPortada();
    return;
  }
  state.vista = "filtro-oferta";
  renderVista();
}

function aplicarFiltroTrasPortada() {
  const id = state.ofertaPendiente;
  const s = oferta(id);
  state.agregarTrasFiltro = false;
  if (s && !servicioAplicaAVehiculo(s, state.vehiculo)) {
    alert(`Esta oferta no aplica para ${textoVehiculo()}.`);
    return;
  }
  if (s && !state.carrito.some((x) => x.id === id)) {
    state.carrito.push({ tipo: "oferta", id });
    persistir();
    renderTotales(true);
  }
  state.ofertaAbierta = id;
  state.vista = "oferta-detalle";
  renderVista();
}

function agregarOferta(id) {
  if (!state.carrito.some((x) => x.id === id)) {
    state.carrito.push({ tipo: "oferta", id });
    persistir();
    renderTotales(true);
  }
  if (state.vista === "oferta-detalle") {
    state.ofertaAbierta = id;
    state.origenAgenda = "ofertas";
    renderVista();
    return;
  }
  if (!state.ofertaAbierta) state.ofertaAbierta = id;
  state.origenAgenda = "ofertas";
  refrescarListasCotizacion();
}

function refrescarListasCotizacion() {
  if (state.vista === "oferta-detalle") renderDetalleOferta();
  if (state.vista === "ofertas") renderOfertas();
  if (state.vista === "mantencion") renderMantencion();
  if (state.vista === "diagnostico") renderDiagnostico();
}

function agregarDiagnostico(id) {
  intentarAbrirOferta(id);
}

function impactoQuitar(id) {
  const actual = calcular();
  const siguiente = calcular(state.carrito.filter((x) => x.id !== id));
  const item = actual.items.find((x) => x.id === id);
  const ofertasAfectadas = actual.items.filter((s) => {
    if (s.id === id) return false;
    const next = siguiente.items.find((n) => n.id === s.id);
    return Boolean(next && s.ahorro > 0 && (next.pagado == null ? 0 : next.pagado) > (s.pagado == null ? 0 : s.pagado));
  });
  const pierdePropio = Boolean(item && item.ahorro > 0);
  return {
    item,
    actual,
    siguiente,
    ahorroPerdido: Math.max(0, actual.ahorro - siguiente.ahorro),
    pierdeOferta: pierdePropio || ofertasAfectadas.length > 0,
    ofertasAfectadas,
  };
}

function overlayLibre() {
  return (
    $("drawer-ticket").hidden &&
    $("modal-kpi").hidden &&
    $("modal-horas").hidden &&
    $("modal-quitar").hidden &&
    $("modal-informe").hidden
  );
}

function pedirQuitar(id) {
  guardarClienteDesdeForma();
  const impacto = impactoQuitar(id);
  if (!impacto.item) return;
  quitarPendiente = id;
  const extras = impacto.ofertasAfectadas
    .map((s) => `<li>${s.nombre} pierde su precio de combo</li>`)
    .join("");
  $("quitar-cuerpo").innerHTML = `
    <p class="muted">Vas a quitar <strong>${impacto.item.nombre}</strong>.</p>
    <p>${
      impacto.pierdeOferta
        ? "Si lo quitas, se pierde el precio de oferta de uno o más servicios."
        : "Este cambio no quita un combo a los demás servicios."
    }</p>
    ${extras ? `<ul class="muted">${extras}</ul>` : ""}
    <div class="quitar-nums">
      <div><span>Total quedaría</span><strong class="final">${clp(impacto.siguiente.total)}</strong></div>
      <div><span>Descuento que pierdes</span><strong class="perdida">${clp(impacto.ahorroPerdido)}</strong></div>
    </div>
  `;
  $("modal-quitar").hidden = false;
  $("overlay").hidden = false;
}

function cerrarModalQuitar() {
  $("modal-quitar").hidden = true;
  quitarPendiente = null;
  if (overlayLibre()) $("overlay").hidden = true;
}

function confirmarQuitar() {
  const id = quitarPendiente;
  if (!id) return;
  quitarPendiente = null;
  $("modal-quitar").hidden = true;
  if (overlayLibre()) $("overlay").hidden = true;
  quitarItem(id);
}

function quitarItem(id) {
  state.carrito = state.carrito.filter((x) => x.id !== id);
  if (state.servicioAgenda === id) state.servicioAgenda = null;
  persistir();
  renderTotales(true);
  if (!state.carrito.length && (state.vista === "carrito-agenda" || state.vista === "agendamiento")) {
    if (state.origenAgenda === "ofertas") state.vista = state.origenLista || "ofertas";
    else {
      state.pasoAgenda = vehiculoOk() ? "servicio" : "filtro";
      state.vista = "agendamiento";
    }
    renderVista();
    return;
  }
  refrescarListasCotizacion();
  if (state.vista === "carrito-agenda" || state.vista === "agendamiento") renderVista();
}

function quitarOferta(id) {
  quitarItem(id);
}

function nuevoCodeTicket() {
  const n = 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
  return String(n).padStart(14, "0");
}

async function enviarTicketAutonexus(payload) {
  try {
    const r = await fetch("/api/autonexus-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) return true;
    const j = await r.json().catch(() => ({}));
    console.warn("AutoNexus no recibió el ticket.", r.status, j.error || "");
    return false;
  } catch (e) {
    console.warn("No se pudo avisar a AutoNexus.", e);
    return false;
  }
}

function mostrarCargaTicket(on) {
  const el = $("carga-ticket");
  if (el) el.hidden = !on;
}

async function generarTicket() {
  guardarClienteDesdeForma();
  const falta = faltantesTicket();
  if (falta.length) {
    alert(`Falta completar: ${falta.join(", ")}.`);
    return;
  }

  const btn = $("btn-ticket");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generando ticket…";
  }
  mostrarCargaTicket(true);

  let llegoAgenda = false;
  try {
  const { items, subtotal, total, ahorro } = calcular();
  const code = nuevoCodeTicket();
  const payload = {
    origen: "autodato_web",
    accion: "crear_ingreso",
    code,
    folio: code,
    agendado: true,
    marca: state.vehiculo.marca,
    modelo: state.vehiculo.modelo,
    ano: state.vehiculo.ano,
    combustible: state.vehiculo.combustible,
    nombre_cliente: state.cliente.nombre.trim(),
    telefono: state.cliente.telefono.trim(),
    patente: state.cliente.patente.trim().toUpperCase() || null,
    correo: state.cliente.correo.trim() || null,
    fecha_cita: state.cita.fecha,
    hora: state.cita.hora,
    servicios: items.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      precio_lista: s.lista,
      precio: s.pagado,
      ahorro: s.ahorro,
    })),
    subtotal,
    ahorro,
    total,
    creado: new Date().toISOString(),
  };

  const tickets = JSON.parse(localStorage.getItem("autodato_tickets") || "[]");
  tickets.unshift(payload);
  localStorage.setItem("autodato_tickets", JSON.stringify(tickets));
  if (typeof nubeActiva === "function" && nubeActiva()) {
    try {
      await nubeGuardarTicket(payload);
    } catch (e) {
      console.warn("El ticket quedó en este navegador, pero no en la nube.", e);
    }
  }

  llegoAgenda = await enviarTicketAutonexus(payload);
  vaciarCarritoTrasTicket();
  abrirTicket(payload);
  } finally {
    mostrarCargaTicket(false);
  }
  if (!llegoAgenda) {
    alert("El ticket se generó, pero no llegó a la agenda de AutoNexus. Revisa el CODE y reintenta o avisa en el taller.");
  }
}

function vaciarCarritoTrasTicket() {
  state.carrito = [];
  state.servicioAgenda = null;
  state.ofertaAbierta = null;
  state.ofertaPendiente = null;
  state.cita = { fecha: "", hora: "" };
  state.pasoAgenda = "filtro";
  state.origenAgenda = "menu";
  state.cliente = { nombre: "", telefono: "", patente: "", correo: "" };
  state.vista = "ofertas";
  persistir();
  renderTotales(false);
  renderVista({ quedarse: true });
}

function abrirTicket(payload) {
  const items = payload.servicios || [];
  $("ticket-contenido").innerHTML = `
    <div id="ticket-sheet" class="ticket-sheet">
      <div class="ticket-head">
        <img data-logo src="${logoHref()}" alt="AutoDato" />
      </div>
      <div class="ticket-body">
        <p class="muted">Ticket de visita</p>
        <div class="ticket-code">CODE ${payload.code}</div>
        <div class="ticket-grid">
          <div>
            <p><strong>Cliente</strong><br />${payload.nombre_cliente}<br />${payload.telefono}${payload.correo ? "<br />" + payload.correo : ""}${payload.patente ? "<br />Patente " + payload.patente : ""}</p>
            <p><strong>Vehículo</strong><br />${payload.marca} ${payload.modelo} ${payload.ano}</p>
            <p><strong>Cita</strong><br />${fechaBonita(payload.fecha_cita)} · ${payload.hora}</p>
          </div>
          <div>
            <div id="ticket-qr" class="ticket-qr"></div>
            <p class="muted" style="text-align:center;margin-top:8px">QR de ingreso</p>
          </div>
        </div>
        <table class="ticket-table">
          ${items
            .map((s) => {
              const precio = s.precio == null ? "A confirmar" : clp(s.precio);
              const extra = s.ahorro > 0 ? ` <span class="muted">(${clp(s.precio_lista)} − ${clp(s.ahorro)})</span>` : "";
              return `<tr><td>${s.nombre}${extra}</td><td>${precio}</td></tr>`;
            })
            .join("")}
          <tr><td>Subtotal lista</td><td>${clp(payload.subtotal)}</td></tr>
          <tr><td>Ahorro</td><td>${clp(payload.ahorro)}</td></tr>
          <tr><td>Total</td><td>${clp(payload.total)}</td></tr>
        </table>
      </div>
    </div>
    <div class="ticket-acciones">
      <button class="btn-green btn-block" type="button" id="btn-descargar-ticket" data-guardar-ticket>Guardar en el celular</button>
      <button class="btn-soft btn-block" type="button" data-compartir-ticket>Compartir</button>
      <p class="muted" style="margin:0;text-align:center">Se guarda en Descargas. Después lo ves en Galería.</p>
      <button class="btn-soft btn-block" type="button" data-close>Cerrar</button>
    </div>
  `;
  abrir("ticket");
  syncSeguirKpi();
  const nodo = $("ticket-qr");
  nodo.innerHTML = "";
  new QRCode(nodo, {
    text: String(payload.code || "").trim(),
    width: 240,
    height: 240,
    correctLevel: QRCode.CorrectLevel.L,
  });
}

async function fotoDelTicket() {
  const hoja = $("ticket-sheet");
  if (!hoja) throw new Error("sin ticket");
  if (!window.html2canvas) throw new Error("sin html2canvas");
  const canvas = await html2canvas(hoja, {
    scale: esMovil() ? 1.5 : 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("sin imagen"))), "image/png");
  });
  const code = String((hoja.querySelector(".ticket-code") || {}).textContent || "")
    .replace(/\D/g, "")
    .slice(-14);
  const nombre = `ticket-autodato-${code || Date.now()}.png`;
  return { blob, file: new File([blob], nombre, { type: "image/png" }), nombre };
}

function bajarBlob(blob, nombre) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const a = document.createElement("a");
      a.href = reader.result;
      a.download = nombre;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      resolve();
    };
    reader.readAsDataURL(blob);
  });
}

async function compartirArchivo(file) {
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return false;
  await navigator.share({
    files: [file],
    title: "Ticket AutoDato",
    text: "Ticket de visita AutoDato",
  });
  return true;
}

async function descargarTicket() {
  const btn = $("btn-descargar-ticket");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Preparando foto…";
  }
  try {
    const { blob, file, nombre } = await fotoDelTicket();
    if (esIos()) {
      if (await compartirArchivo(file)) return;
    }
    await bajarBlob(blob, nombre);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    console.warn("No se pudo guardar el ticket.", e);
    window.print();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Guardar en el celular";
    }
  }
}

async function compartirTicket() {
  try {
    const { blob, file, nombre } = await fotoDelTicket();
    if (await compartirArchivo(file)) return;
    await bajarBlob(blob, nombre);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    console.warn("No se pudo compartir el ticket.", e);
  }
}

function abrir(id) {
  $("overlay").hidden = false;
  $("drawer-ticket").hidden = id !== "ticket";
}

function cerrar() {
  $("overlay").hidden = true;
  $("drawer-ticket").hidden = true;
  $("modal-horas").hidden = true;
  $("modal-kpi").hidden = true;
  $("modal-quitar").hidden = true;
  $("modal-informe").hidden = true;
  if ($("modal-auto")) $("modal-auto").hidden = true;
  quitarPendiente = null;
  marcarMenu();
  syncSeguirKpi();
  pintarChipAuto();
  syncTecladoFicha();
}

function guardarClienteDesdeForma() {
  if ($("c-nombre")) state.cliente.nombre = $("c-nombre").value;
  if ($("c-telefono")) state.cliente.telefono = $("c-telefono").value;
  if ($("c-patente")) state.cliente.patente = $("c-patente").value.toUpperCase();
  if ($("c-correo")) state.cliente.correo = $("c-correo").value;
  persistir();
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".dd")) cerrarDrops();
  const t = e.target.closest(
    "[data-vista], [data-open], [data-close], [data-abrir-oferta], [data-add-oferta], [data-add-diag], [data-quitar-oferta], [data-pedir-quitar], [data-confirmar-quitar], [data-cerrar-quitar], [data-cerrar-informe], [data-editar-auto], [data-cerrar-auto], [data-filtrar], [data-dia], [data-hora], [data-cal], [data-cerrar-horas], [data-abrir-kpi], [data-cerrar-kpi], [data-kpi], [data-seguir-explorando], [data-dd-toggle], [data-dd-pick], [data-guardar-ticket], [data-compartir-ticket], [data-portada-oferta], #btn-ticket, #chip-auto"
  );
  if (!t) return;

  if (t.dataset.ddToggle) {
    const id = t.dataset.ddToggle;
    const list = $(`dd-list-${id}`);
    if (!list) return;
    const abrir = list.hidden;
    cerrarDrops();
    list.hidden = !abrir;
    return;
  }
  if (t.dataset.ddPick) {
    elegirDrop(t.dataset.ddPick, t.dataset.value);
    return;
  }

  if (t.dataset.vista || t.dataset.open) cerrar();

  if (t.dataset.vista) {
    const pideAuto = ["ofertas", "mantencion", "diagnostico", "agendamiento"].includes(t.dataset.vista);
    if (pideAuto && !vehiculoOk()) {
      state.vistaPendiente = t.dataset.vista;
      if (t.dataset.vista !== "agendamiento") state.origenLista = t.dataset.vista;
      state.vista = "filtro-menu";
      renderVista();
      return;
    }
    if (t.dataset.vista === "ofertas" || t.dataset.vista === "mantencion" || t.dataset.vista === "diagnostico") {
      state.origenLista = t.dataset.vista;
    }
    if (t.dataset.vista === "agendamiento") {
      state.vista = "agendamiento";
      if (state.carrito.length) {
        state.origenAgenda = state.carrito.some((x) => x.tipo === "oferta") ? "ofertas" : "menu";
        state.pasoAgenda = "datos";
      } else {
        state.origenAgenda = "menu";
        state.pasoAgenda = vehiculoOk() ? (state.servicioAgenda ? "datos" : "servicio") : "filtro";
      }
    } else if (t.dataset.vista === "carrito-agenda") {
      state.vistaAnterior = state.vista;
      state.vista = "carrito-agenda";
      state.origenAgenda = "ofertas";
    } else {
      state.vista = t.dataset.vista;
    }
    renderVista();
    if (t.dataset.vista !== "portada") cerrarModalHoras();
  }

  if (t.hasAttribute("data-abrir-kpi")) irAAgendaDesdeKpi();
  if (t.hasAttribute("data-cerrar-kpi")) cerrarModalKpi();
  if (t.dataset.kpi === "ticket") irAAgendaDesdeKpi();
  if (t.dataset.kpi === "explorar") seguirExplorandoOfertas();
  if (t.hasAttribute("data-seguir-explorando")) seguirExplorandoOfertas();
  if (t.dataset.open === "informe") abrirModalInforme();
  if (t.hasAttribute("data-cerrar-informe")) cerrarModalInforme();
  if (t.id === "chip-auto" || t.hasAttribute("data-editar-auto")) abrirModalAuto();
  if (t.hasAttribute("data-cerrar-auto")) cerrarModalAuto();
  if (t.hasAttribute("data-close")) cerrar();
  if (t.hasAttribute("data-guardar-ticket")) descargarTicket();
  if (t.hasAttribute("data-compartir-ticket")) compartirTicket();
  if (t.dataset.portadaOferta) iniciarOfertaDesdePortada(t.dataset.portadaOferta);
  if (t.hasAttribute("data-cerrar-horas")) cerrarModalHoras();
  if (t.hasAttribute("data-cerrar-quitar")) cerrarModalQuitar();
  if (t.hasAttribute("data-confirmar-quitar")) confirmarQuitar();
  if (t.dataset.pedirQuitar) pedirQuitar(t.dataset.pedirQuitar);
  if (t.dataset.abrirOferta) intentarAbrirOferta(t.dataset.abrirOferta);
  if (t.dataset.addOferta) agregarOferta(t.dataset.addOferta);
  if (t.dataset.addDiag) agregarDiagnostico(t.dataset.addDiag);
  if (t.dataset.quitarOferta) quitarOferta(t.dataset.quitarOferta);
  if (t.dataset.filtrar) aplicarFiltro(t.dataset.filtrar);

  if (t.dataset.dia) {
    state.cita.fecha = t.dataset.dia;
    guardarClienteDesdeForma();
    persistir();
    renderDatosAgenda();
    abrirModalHoras(t.dataset.dia);
  }
  if (t.dataset.hora) {
    state.cita.hora = t.dataset.hora;
    guardarClienteDesdeForma();
    persistir();
    cerrarModalHoras();
    renderDatosAgenda();
  }
  if (t.dataset.cal) {
    const next = new Date(state.cal.y, state.cal.m + Number(t.dataset.cal), 1);
    state.cal = { y: next.getFullYear(), m: next.getMonth() };
    guardarClienteDesdeForma();
    renderDatosAgenda();
  }
  if (t.id === "btn-ticket") generarTicket();
});

$("overlay").addEventListener("click", () => {
  if (!$("modal-quitar").hidden) {
    cerrarModalQuitar();
    return;
  }
  if (!$("modal-informe").hidden) {
    cerrarModalInforme();
    return;
  }
  if (!$("modal-kpi").hidden) {
    cerrarModalKpi();
    return;
  }
  if (!$("modal-horas").hidden) {
    cerrarModalHoras();
    return;
  }
  cerrar();
});

$("modal-informe").addEventListener("click", (e) => {
  if (e.target.id === "modal-informe") cerrarModalInforme();
});
if ($("modal-auto")) {
  $("modal-auto").addEventListener("click", (e) => {
    if (e.target.id === "modal-auto") cerrarModalAuto();
  });
}

$("btn-abrir-informe").addEventListener("click", async () => {
  guardarDatosFicha();
  const patente = normalizarPatente($("informe-patente").value);
  const telefono = $("informe-telefono").value;
  if (!patente || !normalizarFono(telefono)) {
    alert("Escribe la patente y el celular de tu visita.");
    return;
  }
  const btn = $("btn-abrir-informe");
  const texto = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando ficha…";
  try {
    const r = await fetch("/api/autonexus-ficha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patente, telefono }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.url) {
      alert(data.error || "No encontramos una ficha con esa patente y ese celular.");
      return;
    }
    const auto = typeof encajarVehiculoTaller === "function" ? encajarVehiculoTaller(data.vehiculo) : null;
    if (auto) {
      state.vehiculo = auto;
      persistir();
      pintarChipAuto();
    }
    cerrarModalInforme();
    window.open(data.url, "_blank", "noopener");
    if (auto && state.vista === "portada") renderPortada();
  } catch (_e) {
    alert("No se pudo abrir la ficha interactiva. Reintenta.");
  } finally {
    btn.disabled = false;
    btn.textContent = texto;
  }
});

window.addEventListener("focus", async () => {
  await cargarCatalogo();
  await cargarPortada();
  aplicarLogos();
  renderVista({ quedarse: true });
  renderTotales(false);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncTecladoFicha);
  window.visualViewport.addEventListener("scroll", syncTecladoFicha);
}
window.addEventListener("resize", syncTecladoFicha);
["informe-patente", "informe-telefono"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", guardarDatosFicha);
  el.addEventListener("change", guardarDatosFicha);
  el.addEventListener("focus", () => {
    document.body.classList.add("teclado-abierto");
    setTimeout(syncTecladoFicha, 80);
  });
  el.addEventListener("blur", () => {
    guardarDatosFicha();
    setTimeout(syncTecladoFicha, 80);
  });
});

function animarScrollX(el, from, to, ms) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const paso = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const ease = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      el.scrollLeft = from + (to - from) * ease;
      if (p < 1) requestAnimationFrame(paso);
      else resolve();
    };
    requestAnimationFrame(paso);
  });
}

function pistaMenuDesplazable() {
  if (localStorage.getItem("autodato_menu_hint")) return;
  const menu = $("menu-principal");
  if (!menu || window.innerWidth > 860) return;
  if (menu.scrollWidth <= menu.clientWidth + 12) return;
  localStorage.setItem("autodato_menu_hint", "1");
  const extra = Math.min(84, menu.scrollWidth - menu.clientWidth);
  setTimeout(async () => {
    await animarScrollX(menu, 0, extra, 450);
    await animarScrollX(menu, extra, 0, 550);
  }, 500);
}

async function arrancar() {
  if (typeof nubeCargarConfigRemota === "function") await nubeCargarConfigRemota();
  await cargarCatalogo();
  await cargarPortada();
  aplicarLogos();
  hidratar();
  pintarDatosFicha();
  renderVista({ quedarse: true });
  renderTotales(false);
  pistaMenuDesplazable();
}

arrancar();
