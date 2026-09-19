const MARCAS = ["Hyundai", "Kia", "Mazda", "Suzuki", "Nissan", "Toyota", "Mitsubishi", "Honda"];
const MODELOS = {
  Hyundai: ["Santa Fe", "Tucson", "Maxcruz", "Accent", "i30", "Elantra", "Porter", "Creta", "Veloster", "i40", "Palisade", "Otro"],
  Kia: ["Sportage", "Sorento", "Soul", "Carnival", "Bongo", "Otro"],
  Mitsubishi: ["Delica", "RVR"],
  Nissan: ["Tiida", "Note"],
  Toyota: ["Vitz"],
  Mazda: ["Axela", "Demio", "CX3", "CX5"],
  Suzuki: ["Otro"],
  Honda: ["Otro"],
};
const ANIO_MIN = 2010;
const ANIO_MAX = new Date().getFullYear();
const BLOQUES = [
  { hora: "09:00", etiqueta: "Mañana 09:00" },
  { hora: "11:00", etiqueta: "Mañana 11:00" },
  { hora: "15:00", etiqueta: "Tarde 15:00" },
];
const INFORME_BASE = "https://app.autonexus.cl/";

const PAGINAS = {
  mantencion: {
    titulo: "Mantención preventiva",
    texto: "Las mantenciones con precio de combo están en Ofertas. El cambio de aceite puntual se agenda en Agendamiento.",
  },
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
  agregarTrasFiltro: false,
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

function anios() {
  const out = [];
  for (let y = ANIO_MAX; y >= ANIO_MIN; y -= 1) out.push(y);
  return out;
}

function modelosDe(marca) {
  return MODELOS[marca] || ["Otro"];
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
  return Boolean(state.vehiculo && state.vehiculo.marca && state.vehiculo.modelo && state.vehiculo.ano);
}

function textoVehiculo() {
  if (!state.vehiculo) return "";
  return `${state.vehiculo.marca} ${state.vehiculo.modelo} ${state.vehiculo.ano}`;
}

function opciones(lista, valor, placeholder) {
  return `<option value="">${placeholder}</option>${lista
    .map((v) => `<option value="${v}" ${String(valor) === String(v) ? "selected" : ""}>${v}</option>`)
    .join("")}`;
}

function htmlDrop(id, label, lista, valor, placeholder, disabled) {
  const texto = valor || placeholder;
  return `
    <div class="dd">
      <span class="dd-label">${label}</span>
      <input type="hidden" id="f-${id}" value="${valor || ""}" />
      <button type="button" class="dd-btn" data-dd-toggle="${id}" ${disabled ? "disabled" : ""}>
        <span data-dd-texto>${texto}</span>
        <b aria-hidden="true">▾</b>
      </button>
      <ul class="dd-list" id="dd-list-${id}" hidden>
        ${lista
          .map(
            (v) =>
              `<li><button type="button" data-dd-pick="${id}" data-value="${v}" class="${
                String(valor) === String(v) ? "is-on" : ""
              }">${v}</button></li>`
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
  const modelos = marca ? modelosDe(marca) : [];
  return `
    <div class="filtro">
      <h2>¿Qué vehículo tienes?</h2>
      <p class="lead">Marca, modelo y año. Si no aparece, no se puede abrir el servicio.</p>
      ${htmlDrop("marca", "Marca", MARCAS, marca, "Elige la marca", false)}
      ${htmlDrop("modelo", "Modelo", modelos, modelo, marca ? "Elige el modelo" : "Primero elige la marca", !marca)}
      ${htmlDrop("ano", "Año", anios(), ano, "Elige el año", false)}
      <button class="btn-primary btn-block" type="button" data-filtrar="${contexto}">Continuar</button>
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
    if (span) span.textContent = valor;
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
  document.querySelectorAll(".menu [data-vista]").forEach((btn) => {
    const on =
      btn.dataset.vista === state.vista ||
      (state.vista === "oferta-detalle" && btn.dataset.vista === "ofertas") ||
      (state.vista === "carrito-agenda" && btn.dataset.vista === "agendamiento");
    btn.classList.toggle("is-on", on);
  });
  const inf = document.querySelector('.menu [data-open="informe"]');
  if (inf) inf.classList.toggle("is-on", Boolean($("modal-informe") && !$("modal-informe").hidden));
}

function ticketAbierto() {
  return Boolean($("drawer-ticket") && !$("drawer-ticket").hidden);
}

function syncSeguirKpi() {
  const historial = Boolean($("modal-informe") && !$("modal-informe").hidden);
  const enPortada = state.vista === "portada";
  const ticket = ticketAbierto();
  const stack = document.querySelector(".kpi-stack");
  const home = document.querySelector(".home-float");
  if (stack) stack.hidden = historial || enPortada || ticket;
  if (home) home.hidden = historial || enPortada || ticket;
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
    if (raw.vehiculo) state.vehiculo = raw.vehiculo;
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
    if (suave) pista.scrollTo({ left: i * w, behavior: "smooth" });
    else pista.scrollLeft = i * w;
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
  medir();
  irA(loop ? 1 : 0, false);
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
  const slides = (portadaSlides || []).filter((s) => s.foto);
  const lista = slides.length ? slides : PORTADA_DEFECTO.map(normalizarSlide);
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
}

function idsComboPara(id) {
  return state.carrito.filter((x) => x.tipo === "oferta" && x.id !== id).map((x) => x.id);
}

function htmlTarjetaOferta(s) {
  const enCarro = state.carrito.some((x) => x.id === s.id);
  const p = precioPagado(s, idsComboPara(s.id));
  const hayDesc = p.ahorro > 0;
  return `
    <button class="card ${enCarro ? "card-en-carro" : ""}" type="button" data-abrir-oferta="${s.id}">
      <div class="card-photo" style="background-image:url('${s.foto}')">
        <div class="card-tags">
          ${enCarro ? `<span class="tag tag-carrito">En carrito</span>` : ""}
          ${!enCarro && hayDesc ? `<span class="tag tag-dto">− ${clp(p.ahorro)}</span>` : ""}
        </div>
      </div>
      <div class="card-body">
        <h3>${s.nombre}</h3>
        <p>${s.resumen}</p>
        ${
          hayDesc
            ? `<div class="precio-lista tachado">${clp(s.precio)}</div>
               <div class="precio-card-oferta">${clp(p.pagado)}</div>
               <div class="ahorro-tag">Ahorras ${clp(p.ahorro)}</div>
               ${p.regla ? `<p class="card-combo">${p.regla.etiqueta}</p>` : ""}`
            : `<div class="precio">${clp(s.precio)}</div>`
        }
      </div>
    </button>
  `;
}

function renderOfertas() {
  const hayCarro = state.carrito.some((x) => x.tipo === "oferta");
  $("stage").innerHTML = `
    <section class="panel claro">
      <h2>Ofertas</h2>
      <p class="lead">${
        hayCarro
          ? "Los servicios con etiqueta En carrito ya están seleccionados. En el resto ves el descuento de combo si aplica."
          : "Precios de lista. Los descuentos se ven solo después de elegir un servicio y armar combo."
      }</p>
      <div class="grid">
        ${serviciosOferta().map(htmlTarjetaOferta).join("")}
      </div>
    </section>
  `;
}

function renderFiltroOferta() {
  $("stage").innerHTML = `<section class="panel claro">${htmlFiltro("oferta")}</section>`;
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
  const mostrarDesc = state.carrito.length > 0 && p.ahorro > 0;
  const idsComp = (s.complementos || []).map((c) => c.id);
  const extras = serviciosOferta().filter((x) => x.id !== s.id);
  const minisHtml = [
    ...(s.complementos || []).map((c) => {
      const extra = oferta(c.id);
      return extra ? htmlMini(extra, c) : "";
    }),
    ...extras.filter((x) => !idsComp.includes(x.id)).map((x) => htmlMini(x)),
  ].join("");

  $("stage").innerHTML = `
    <article class="detalle-full">
      <div class="detalle-foto" style="background-image:url('${s.foto}')"></div>
      <div class="detalle-copy">
        <p class="muted">${textoVehiculo()}</p>
        <h2>${s.nombre}</h2>
        <p class="lead">${s.detalle}</p>
        ${
          (s.galeria && s.galeria.length) || (s.videos && s.videos.length)
            ? `<div class="detalle-extras">
                ${(s.galeria || []).map((src) => `<img src="${src}" alt="" />`).join("")}
                ${(s.videos || []).map((url) => `<a class="btn-line btn-block" href="${url}" target="_blank" rel="noopener">Ver video</a>`).join("")}
              </div>`
            : ""
        }
        <div class="precio-fila">
          <div class="precio-col">
            <div class="precio-lista ${mostrarDesc ? "tachado" : ""}">${clp(s.precio)}</div>
            ${
              mostrarDesc
                ? `<div class="precio-oferta">${clp(p.pagado)}</div><div class="ahorro-tag">Ahorras ${clp(p.ahorro)} ${p.regla ? p.regla.etiqueta : ""}</div>`
                : ""
            }
          </div>
          ${
            enCarro
              ? `<button class="btn-en-carro" type="button" data-quitar-oferta="${s.id}">En carrito</button>`
              : `<button class="btn-add-precio" type="button" data-add-oferta="${s.id}">Agregar al carrito</button>`
          }
        </div>
        ${
          enCarro && extras.length
            ? `<section class="suma-ofertas">
                <h3>Suma estos servicios y activa la oferta</h3>
                <div class="minis">${minisHtml}</div>
              </section>`
            : ""
        }
      </div>
    </article>
  `;
}

function htmlMini(s, combo) {
  const enCarro = state.carrito.some((x) => x.id === s.id);
  const p = precioPagado(s, idsComboPara(s.id));
  const precioCombo = combo && combo.precioCombo != null ? combo.precioCombo : null;
  const hayOferta = precioCombo != null ? precioCombo < s.precio : p.ahorro > 0;
  const pagado = precioCombo != null ? precioCombo : p.pagado;
  const ahorro = precioCombo != null ? s.precio - precioCombo : p.ahorro;
  const etiqueta = combo?.etiqueta || p.regla?.etiqueta || "";
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
  $("stage").innerHTML = `
    <section class="panel claro">
      <h2>Diagnóstico automotriz</h2>
      <p class="lead">Elige el tipo de diagnóstico. Si ya tienes servicios en el carrito, se suma. Si no, queda como único servicio.</p>
      <div class="grid">
        ${serviciosDiagnostico().map((s) => {
          const enCarro = state.carrito.some((x) => x.id === s.id);
          return `
            <button class="card ${enCarro ? "card-en-carro" : ""}" type="button" data-add-diag="${s.id}">
              <div class="card-photo" style="background-image:url('${s.foto}')">
                <div class="card-tags">
                  ${enCarro ? `<span class="tag tag-carrito">En carrito</span>` : ""}
                </div>
              </div>
              <div class="card-body">
                <h3>${s.nombre}</h3>
                <p>${s.resumen}</p>
                <div class="precio">${clp(s.precio)}</div>
              </div>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
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
    state.vista = "ofertas";
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

function abrirModalInforme() {
  $("informe-patente").value = state.cliente.patente || $("informe-patente").value;
  $("informe-telefono").value = state.cliente.telefono || $("informe-telefono").value;
  $("modal-informe").hidden = false;
  $("overlay").hidden = true;
  marcarMenu();
  syncSeguirKpi();
}

function cerrarModalInforme() {
  $("modal-informe").hidden = true;
  if (overlayLibre()) $("overlay").hidden = true;
  marcarMenu();
  syncSeguirKpi();
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
  if (!vehiculoOk()) falta.push("marca, modelo y año del vehículo");
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
  if (state.vista === "portada") renderPortada();
  else if (state.vista === "ofertas") renderOfertas();
  else if (state.vista === "filtro-oferta") renderFiltroOferta();
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
  if (!marca || !modelo || !ano) {
    alert("Elige marca, modelo y año. Si tu auto no está en la lista, no podemos abrirte el servicio.");
    return;
  }
  state.vehiculo = { marca, modelo, ano: Number(ano) };
  persistir();

  if (contexto === "oferta") {
    state.vista = "oferta-detalle";
    state.ofertaAbierta = state.ofertaPendiente;
    if (state.agregarTrasFiltro && state.ofertaPendiente) {
      const id = state.ofertaPendiente;
      state.agregarTrasFiltro = false;
      if (!state.carrito.some((x) => x.id === id)) {
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
  state.ofertaAbierta = id;
  state.vista = "oferta-detalle";
  renderVista();
}

function iniciarOfertaDesdePortada(id) {
  if (!oferta(id)) return;
  state.ofertaPendiente = id;
  state.agregarTrasFiltro = true;
  state.vista = "filtro-oferta";
  renderVista();
}

function agregarOferta(id) {
  if (state.carrito.some((x) => x.id === id)) {
    if (state.vista === "oferta-detalle") renderDetalleOferta();
    return;
  }
  state.carrito.push({ tipo: "oferta", id });
  if (!state.ofertaAbierta) state.ofertaAbierta = id;
  state.origenAgenda = "ofertas";
  persistir();
  renderTotales(true);
  if (state.vista === "oferta-detalle") renderDetalleOferta();
  if (state.vista === "ofertas") renderOfertas();
}

function agregarDiagnostico(id) {
  if (state.carrito.some((x) => x.id === id)) return;
  state.carrito.push({ tipo: "agenda", id });
  state.servicioAgenda = id;
  persistir();
  renderTotales(true);
  if (state.vista === "diagnostico") renderDiagnostico();
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
    if (state.origenAgenda === "ofertas") state.vista = "ofertas";
    else {
      state.pasoAgenda = vehiculoOk() ? "servicio" : "filtro";
      state.vista = "agendamiento";
    }
    renderVista();
    return;
  }
  if (state.vista === "oferta-detalle") renderDetalleOferta();
  if (state.vista === "ofertas") renderOfertas();
  if (state.vista === "diagnostico") renderDiagnostico();
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

async function generarTicket() {
  guardarClienteDesdeForma();
  const falta = faltantesTicket();
  if (falta.length) {
    alert(`Falta completar: ${falta.join(", ")}.`);
    return;
  }

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

  const llegoAgenda = await enviarTicketAutonexus(payload);
  vaciarCarritoTrasTicket();
  abrirTicket(payload);
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
  quitarPendiente = null;
  marcarMenu();
  syncSeguirKpi();
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
    "[data-vista], [data-open], [data-close], [data-abrir-oferta], [data-add-oferta], [data-add-diag], [data-quitar-oferta], [data-pedir-quitar], [data-confirmar-quitar], [data-cerrar-quitar], [data-cerrar-informe], [data-filtrar], [data-dia], [data-hora], [data-cal], [data-cerrar-horas], [data-abrir-kpi], [data-cerrar-kpi], [data-kpi], [data-seguir-explorando], [data-dd-toggle], [data-dd-pick], [data-guardar-ticket], [data-compartir-ticket], [data-portada-oferta], #btn-ticket"
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

$("btn-abrir-informe").addEventListener("click", async () => {
  const patente = normalizarPatente($("informe-patente").value);
  const telefono = normalizarFono($("informe-telefono").value);
  if (!patente || !telefono) {
    alert("Escribe la patente y el celular de tu visita.");
    return;
  }
  const ticket = await buscarTicketVisita(patente, telefono);
  if (!ticket) {
    alert("No encontramos una visita con esa patente y ese celular. Tienen que ser los mismos que informaste al agendar.");
    return;
  }
  cerrarModalInforme();
  abrirTicket(ticket);
  window.open(`${INFORME_BASE}?entrada=${encodeURIComponent(ticket.patente || ticket.code)}`, "_blank", "noopener");
});

window.addEventListener("focus", async () => {
  await cargarCatalogo();
  await cargarPortada();
  aplicarLogos();
  renderVista({ quedarse: true });
  renderTotales(false);
});

async function arrancar() {
  await cargarCatalogo();
  await cargarPortada();
  aplicarLogos();
  hidratar();
  renderVista({ quedarse: true });
  renderTotales(false);
}

arrancar();
