const BLOQUES = [
  { hora: "09:00", etiqueta: "Mañana 09:00" },
  { hora: "11:00", etiqueta: "Mañana 11:00" },
  { hora: "15:00", etiqueta: "Tarde 15:00" },
];

const ENTREGA_CORTE_HORA = 18;
const ENTREGA_ALMUERZO_DESDE_MIN = 13 * 60 + 15;
const ENTREGA_ALMUERZO_HASTA_MIN = 14 * 60 + 15;
const TRASLADO_MIN_NETO_FLOTA = 50000;

const PAGINAS = {
  flotas: {
    titulo: "Flotas",
    texto: "Atención de flotas con los mismos modelos que recibe el taller (2010 en adelante). Escríbenos o agenda unidad por unidad.",
  },
};

const agendaAutonexus = { dias: [], ts: 0, cargando: false };

const state = {
  vista: "portada",
  ofertaAbierta: null,
  ofertaPendiente: null,
  vehiculo: null,
  carrito: [],
  origenAgenda: "menu",
  pasoAgenda: "filtro",
  servicioAgenda: null,
  cliente: { nombre: "", telefono: "", patente: "", correo: "", sintoma: "", solicitanteId: "" },
  entrega: { fecha: "", hora: "" },
  trasladoFlota: false,
  cita: { fecha: "", hora: "" },
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  vistaAnterior: "ofertas",
  origenLista: "ofertas",
  agregarTrasFiltro: false,
  vistaPendiente: "",
  flotaActivaId: "",
  flotaPendienteId: "",
  flotaCategoriaId: "",
  flotaBienvenida: "",
  flotaServicioDetalleId: "",
  areaFlotas: false,
};

let quitarPendiente = null;
let sustituirAceitePendiente = null;

const $ = (id) => document.getElementById(id);

function clp(n) {
  if (n == null) return "A confirmar";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function textoTotalNetoFlota(n) {
  if (n == null || !Number.isFinite(n)) return "A confirmar";
  if (n <= 0) return `${clp(0)} + iva`;
  return `${clp(n)} + iva`;
}

function calcular(carrito = state.carrito) {
  const items = [];
  let subtotal = 0;
  let total = 0;
  let ahorro = 0;
  let netoTotal = 0;

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
    } else if (linea.tipo === "flota") {
      const srv =
        typeof buscarServicioFlota === "function"
          ? buscarServicioFlota(linea.flotaId, linea.servicioId)
          : null;
      if (!srv) return;
      const pagado = typeof precioFlotaConIva === "function" ? precioFlotaConIva(srv.precio) : Number(srv.precio);
      if (pagado == null) return;
      const neto = Number(srv.precio) || 0;
      items.push({
        id: linea.id,
        nombre: srv.nombre,
        tipo: "flota",
        lista: pagado,
        pagado,
        neto,
        ahorro: 0,
        flotaId: linea.flotaId,
        servicioId: linea.servicioId,
      });
      subtotal += pagado;
      total += pagado;
      netoTotal += neto;
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

  return { items, subtotal, total, ahorro, netoTotal };
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

function flotaClienteActiva() {
  const id =
    state.flotaActivaId ||
    (typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "");
  if (!id || typeof flotaPorId !== "function") return null;
  return flotaPorId(id);
}

function flotaActivaExigeModeloVehiculo() {
  const f = flotaClienteActiva();
  return typeof flotaExigeModeloVehiculo === "function" && flotaExigeModeloVehiculo(f);
}

function debePedirVehiculoEnAgenda() {
  if (vehiculoOk()) return false;
  if (carritoSoloFlota()) return flotaActivaExigeModeloVehiculo();
  return true;
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
  const bloqueado = carritoBloqueaCambioAuto();
  chip.classList.toggle("chip-auto-bloqueado", bloqueado);
  chip.title = bloqueado ? "Quita servicios del ticket para cambiar de vehículo" : "Cambiar vehículo";
  if (!mostrar) return;
  const foto = $("perfil-auto-foto");
  if (foto) {
    foto.hidden = !src;
    if (src) foto.src = src;
  }
  const texto = $("chip-auto-texto");
  if (texto) texto.textContent = textoVehiculoCorto();
}

function carritoBloqueaCambioAuto() {
  return state.carrito.length > 0;
}

function avisoCambioAutoConCarrito() {
  alert(
    "Tienes servicios en tu ticket. Los precios dependen del vehículo que elegiste. Quítalos o genera el ticket antes de cambiar de auto."
  );
}

function abrirModalAuto() {
  if (carritoBloqueaCambioAuto()) {
    avisoCambioAutoConCarrito();
    return;
  }
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
  if (typeof hidratarTablero === "function") hidratarTablero();
  const usaTablero = typeof filtroUsaOpcionesTablero === "function" && filtroUsaOpcionesTablero(contexto);
  const marcas = typeof marcasParaFiltroVehiculo === "function" ? marcasParaFiltroVehiculo(contexto) : MARCAS;
  let marca = state.vehiculo?.marca || "";
  let modelo = state.vehiculo?.modelo || "";
  let ano = state.vehiculo?.ano || "";
  let combustible = state.vehiculo?.combustible || "";
  if (marca && !marcas.includes(marca)) marca = "";
  const modelos = marca ? modelosParaFiltroVehiculo(marca, contexto) : [];
  if (modelo && !modelos.includes(modelo)) modelo = "";
  const aniosLista = marca && modelo ? aniosParaFiltroVehiculo(marca, modelo, contexto) : usaTablero ? [] : anios();
  if (ano && !aniosLista.some((y) => String(y) === String(ano))) ano = "";
  const combLista =
    marca && modelo ? combustiblesParaFiltroVehiculo(marca, modelo, ano, contexto) : usaTablero ? [] : COMBUSTIBLES;
  if (combustible && !combLista.some((c) => c.value === combustible)) combustible = "";
  const titulo =
    contexto === "editar"
      ? "Cambia tu vehículo"
      : contexto === "flota"
        ? "Vehículo para esta flota"
        : "¿Qué vehículo tienes?";
  const lead = usaTablero
    ? "Solo aparecen marcas, modelos y años que el taller tiene configurados en el tablero. Si tu auto no está, aún no hay promociones para ese vehículo."
    : "Marca, modelo, año y combustible. Si tu auto no está en la lista, no podemos abrirte el servicio. El año y el combustible importan: un mismo trabajo puede ser otro producto.";
  const fotoSrc =
    marca && modelo
      ? typeof fotoPortadaVehiculo === "function"
        ? fotoPortadaVehiculo({ marca, modelo, ano, combustible })
        : fotoModeloDe(marca, modelo)
      : "";
  return `
    <div class="filtro" data-filtro-contexto="${escapeAttr(contexto)}">
      <h2>${titulo}</h2>
      <p class="lead">${lead}</p>
      ${htmlDrop("marca", "Marca", marcas, marca, marcas.length ? "Elige la marca" : "Sin vehículos en tablero", !marcas.length)}
      ${htmlDrop("modelo", "Modelo", modelos, modelo, marca ? (modelos.length ? "Elige el modelo" : "Sin modelos") : "Primero elige la marca", !marca || !modelos.length)}
      ${htmlDrop(
        "ano",
        "Año",
        aniosLista,
        ano,
        marca && modelo ? (aniosLista.length ? "Elige el año" : "Sin años") : "Primero marca y modelo",
        usaTablero ? !marca || !modelo || !aniosLista.length : false
      )}
      ${htmlDrop(
        "combustible",
        "Combustible",
        combLista,
        combustible,
        marca && modelo ? "Elige el combustible" : "Primero marca y modelo",
        usaTablero ? !marca || !modelo || !combLista.length : false
      )}
      ${fotoSrc ? `<div class="filtro-foto"><img src="${fotoSrc}" alt="${escapeAttr(modelo)}" /></div>` : ""}
      <button class="btn-primary btn-block" type="button" data-filtrar="${contexto}">${contexto === "editar" ? "Guardar auto" : "Continuar"}</button>
    </div>
  `;
}

function contextoFiltroVehiculoActual() {
  const root = document.querySelector(".filtro[data-filtro-contexto]");
  return (root && root.dataset.filtroContexto) || "menu";
}

function pintarOpcionesDrop(id, lista, placeholder, disabled) {
  const hidden = $(`f-${id}`);
  const btn = document.querySelector(`[data-dd-toggle="${id}"]`);
  const list = $(`dd-list-${id}`);
  if (!hidden || !btn || !list) return;
  const items = (lista || []).map((v) => (v && typeof v === "object" ? v : { value: v, label: v }));
  const valor = hidden.value;
  const valido = items.some((x) => String(x.value) === String(valor));
  if (!valido) {
    hidden.value = "";
    const span = btn.querySelector("[data-dd-texto]");
    if (span) span.textContent = placeholder;
  }
  btn.disabled = Boolean(disabled);
  list.innerHTML = items
    .map(
      (v) =>
        `<li><button type="button" data-dd-pick="${id}" data-value="${v.value}" class="${
          String(valor) === String(v.value) ? "is-on" : ""
        }">${v.label}</button></li>`
    )
    .join("");
  if (valido && btn.querySelector("[data-dd-texto]")) {
    const pick = items.find((x) => String(x.value) === String(valor));
    btn.querySelector("[data-dd-texto]").textContent = pick ? pick.label : valor;
  }
}

function refrescarDropsFiltroVehiculo() {
  const ctx = contextoFiltroVehiculoActual();
  const usaTablero = typeof filtroUsaOpcionesTablero === "function" && filtroUsaOpcionesTablero(ctx);
  const marca = $("f-marca")?.value || "";
  const modelo = $("f-modelo")?.value || "";
  const ano = $("f-ano")?.value || "";
  const modelos = marca ? modelosParaFiltroVehiculo(marca, ctx) : [];
  const aniosLista = marca && modelo ? aniosParaFiltroVehiculo(marca, modelo, ctx) : usaTablero ? [] : anios();
  const combLista = marca && modelo ? combustiblesParaFiltroVehiculo(marca, modelo, ano, ctx) : usaTablero ? [] : COMBUSTIBLES;
  pintarOpcionesDrop("modelo", modelos, marca ? "Elige el modelo" : "Primero elige la marca", !marca || !modelos.length);
  pintarOpcionesDrop(
    "ano",
    aniosLista,
    marca && modelo ? "Elige el año" : "Primero marca y modelo",
    usaTablero ? !marca || !modelo || !aniosLista.length : false
  );
  pintarOpcionesDrop(
    "combustible",
    combLista,
    "Elige el combustible",
    usaTablero ? !marca || !modelo || !combLista.length : false
  );
}

function cerrarDrops(salvo) {
  document.querySelectorAll(".dd-list").forEach((el) => {
    if (el.id !== `dd-list-${salvo}`) el.hidden = true;
  });
}

function resetModeloDrop() {
  const ctx = contextoFiltroVehiculoActual();
  const marca = $("f-marca")?.value;
  if ($("f-modelo")) $("f-modelo").value = "";
  if ($("f-ano")) $("f-ano").value = "";
  if ($("f-combustible")) $("f-combustible").value = "";
  refrescarDropsFiltroVehiculo();
  if (!marca) {
    const btn = document.querySelector('[data-dd-toggle="modelo"]');
    const span = btn && btn.querySelector("[data-dd-texto]");
    if (span) span.textContent = "Primero elige la marca";
  }
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
    state.vehiculo = { ...(state.vehiculo || {}), marca: valor, modelo: "", ano: "", combustible: "" };
    resetModeloDrop();
  } else if (id === "modelo") {
    state.vehiculo = { ...(state.vehiculo || {}), modelo: valor, ano: "", combustible: "" };
    if ($("f-ano")) $("f-ano").value = "";
    if ($("f-combustible")) $("f-combustible").value = "";
    refrescarDropsFiltroVehiculo();
  } else if (id === "ano") {
    state.vehiculo = { ...(state.vehiculo || {}), ano: Number(valor), combustible: "" };
    if ($("f-combustible")) $("f-combustible").value = "";
    refrescarDropsFiltroVehiculo();
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
  document.documentElement.classList.toggle("pull-refresh-ok", state.vista === "portada");
  document.body.classList.toggle("en-portada", state.vista === "portada");
  const datosAgenda =
    esMovil() &&
    (state.vista === "carrito-agenda" ||
      (state.vista === "agendamiento" && state.carrito.length && (vehiculoOk() || carritoSoloFlota())));
  document.body.classList.toggle("en-agenda-datos", datosAgenda);
  if (state.areaFlotas && carritoSoloFlota()) state.areaFlotas = true;
  syncAreaFlotasUi();
}

function marcarMenu() {
  const fichaAbierta = Boolean($("modal-informe") && !$("modal-informe").hidden);
  document.querySelectorAll(".menu [data-vista]").forEach((btn) => {
    const on =
      !fichaAbierta &&
      (btn.dataset.vista === state.vista ||
        ((state.vista.startsWith("flotas") || state.vista === "flotas-servicio-detalle") &&
          btn.dataset.vista === "flotas") ||
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
  const { total, ahorro, netoTotal } = calcular();
  const totalNetoEnBarra = state.areaFlotas && carritoSoloFlota();
  const bar = $("totales-bar");
  const ahorroKpi = bar && bar.querySelector(".kpi-ahorro");
  if (totalNetoEnBarra) {
    $("total-valor").textContent = textoTotalNetoFlota(netoTotal);
    if (bar) bar.classList.add("totales-bar-flota");
  } else {
    $("total-valor").textContent = clp(total);
    if (bar) bar.classList.remove("totales-bar-flota");
  }
  if (state.areaFlotas) {
    if (ahorroKpi) ahorroKpi.hidden = true;
  } else {
    $("saldo-valor").textContent = clp(ahorro);
    if (ahorroKpi) ahorroKpi.hidden = false;
  }
  pintarChipAuto();
  if (animar && bar) {
    bar.classList.remove("pop");
    void bar.offsetWidth;
    bar.classList.add("pop");
  }
}

const FLOTA_NAV_KEY = "autodato_flota_nav";

function persistirNavFlota() {
  if (!carritoTieneFlota()) {
    localStorage.removeItem(FLOTA_NAV_KEY);
    return;
  }
  const vistasGuardar = [
    "flotas-categorias",
    "flotas-servicios",
    "flotas-servicio-detalle",
    "carrito-agenda",
    "agendamiento",
  ];
  if (!vistasGuardar.includes(state.vista) && !String(state.vista || "").startsWith("flotas")) return;
  localStorage.setItem(
    FLOTA_NAV_KEY,
    JSON.stringify({
      vista: state.vista,
      flotaActivaId: state.flotaActivaId || "",
      flotaCategoriaId: state.flotaCategoriaId || "",
      ts: Date.now(),
    })
  );
}

function hidratarNavFlota() {
  if (!carritoTieneFlota()) {
    localStorage.removeItem(FLOTA_NAV_KEY);
    return;
  }
  try {
    const raw = JSON.parse(localStorage.getItem(FLOTA_NAV_KEY) || "null");
    if (!raw || typeof raw !== "object") return;
    const fid =
      typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
    if (fid) state.flotaActivaId = fid;
    else if (raw.flotaActivaId) state.flotaActivaId = raw.flotaActivaId;
    if (!fid || typeof sesionFlotaOk !== "function" || !sesionFlotaOk(fid)) return;
    const vistasOk = [
      "flotas-categorias",
      "flotas-servicios",
      "flotas-servicio-detalle",
      "carrito-agenda",
      "agendamiento",
    ];
    if (raw.vista && vistasOk.includes(raw.vista)) {
      state.vista = raw.vista;
      state.areaFlotas = true;
      if (raw.flotaCategoriaId) state.flotaCategoriaId = raw.flotaCategoriaId;
    }
  } catch (_e) {
    /* ignore */
  }
}

function persistir() {
  localStorage.setItem(
    "autodato_sesion",
    JSON.stringify({
      carrito: state.carrito,
      vehiculo: state.vehiculo,
      cliente: state.cliente,
      entrega: state.entrega,
      trasladoFlota: Boolean(state.trasladoFlota),
      cita: state.cita,
    })
  );
  persistirNavFlota();
}

function flotaActivaDelCarrito() {
  if (!carritoSoloFlota() || typeof flotaIdDesdeCarrito !== "function") return null;
  const id = flotaIdDesdeCarrito(state.carrito);
  return id && typeof flotaPorId === "function" ? flotaPorId(id) : null;
}

function flotaAgendaLibreActiva() {
  const f = flotaActivaDelCarrito();
  return typeof flotaAgendaEsLibre === "function" && flotaAgendaEsLibre(f);
}

function bloquesVisitaDia(iso) {
  if (flotaAgendaLibreActiva()) return BLOQUES.map((b) => b.hora);
  const libres = libresDeDia(iso);
  if (libres != null) return libres;
  return BLOQUES.map((b) => b.hora);
}

function minFechaEntregaIso() {
  const now = new Date();
  const min = new Date(now);
  min.setHours(0, 0, 0, 0);
  if (now.getHours() >= ENTREGA_CORTE_HORA) min.setDate(min.getDate() + 1);
  return ymd(min);
}

function esDiaEntregaHabil(date) {
  return esHabil(date);
}

function minutosHoraEntrega(h) {
  const [hh, mm] = String(h || "0:0").split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function horaEntregaEnAlmuerzo(h) {
  const t = minutosHoraEntrega(h);
  return t >= ENTREGA_ALMUERZO_DESDE_MIN && t <= ENTREGA_ALMUERZO_HASTA_MIN;
}

function horasEntregaHabiles(iso) {
  const p = String(iso || "").split("-").map(Number);
  if (p.length < 3 || !p[0]) return [];
  const date = new Date(p[0], p[1] - 1, p[2]);
  if (!esDiaEntregaHabil(date)) return [];
  const startMin = 9 * 60;
  const endMin = 18 * 60;
  const out = [];
  for (let t = startMin; t <= endMin; t += 30) {
    const hh = Math.floor(t / 60);
    const mm = t % 60;
    const h = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    if (horaEntregaEnAlmuerzo(h)) continue;
    out.push(h);
  }
  return out;
}

function horasEntregaHabilesDisponibles(iso) {
  const minIso = minFechaEntregaIso();
  if (!iso || iso < minIso) return [];
  let horas = horasEntregaHabiles(iso);
  const hoyIso = ymd(new Date());
  if (iso === hoyIso) {
    const now = new Date();
    horas = horas.filter((h) => instanteDesdeIsoHora(iso, h) > now);
  }
  return horas;
}

function etiquetaHoraEntrega(h) {
  const [hh, mm] = String(h || "0:0").split(":").map(Number);
  const d = new Date(2000, 0, 1, hh || 0, mm || 0);
  return d.toLocaleTimeString("es-CL", { hour: "numeric", minute: "2-digit" });
}

function normalizarEntregaFlotaEnState() {
  if (!carritoSoloFlota()) return;
  const minIso = minFechaEntregaIso();
  let { fecha, hora } = state.entrega || { fecha: "", hora: "" };
  fecha = String(fecha || "").trim();
  hora = String(hora || "").trim();
  if (!fecha) {
    state.entrega = { fecha: "", hora: "" };
    return;
  }
  if (fecha < minIso || !horasEntregaHabiles(fecha).length) {
    state.entrega = { fecha: "", hora: "" };
    return;
  }
  const permitidas = horasEntregaHabilesDisponibles(fecha);
  if (hora && !permitidas.includes(hora)) hora = "";
  state.entrega = { fecha, hora };
}

function instanteDesdeIsoHora(iso, hora) {
  const p = String(iso || "").split("-").map(Number);
  const t = String(hora || "09:00").split(":");
  return new Date(p[0], p[1] - 1, p[2], Number(t[0]) || 0, Number(t[1]) || 0, 0, 0);
}

const FLOTA_HIST_CLIENTE_PREFIX = "autodato_flota_cliente_";

function claveHistorialClienteFlota(flotaId) {
  return `${FLOTA_HIST_CLIENTE_PREFIX}${String(flotaId || "").trim()}`;
}

function historialClienteFlota(flotaId) {
  try {
    const raw = JSON.parse(localStorage.getItem(claveHistorialClienteFlota(flotaId)) || "null");
    if (!raw || !String(raw.nombre || "").trim()) return null;
    return {
      nombre: String(raw.nombre || "").trim(),
      telefono: String(raw.telefono || "").trim(),
      correo: String(raw.correo || "").trim(),
      patente: String(raw.patente || "").trim().toUpperCase(),
    };
  } catch (_e) {
    return null;
  }
}

function guardarHistorialClienteFlota(flotaId) {
  const id = String(flotaId || "").trim();
  const nombre = state.cliente.nombre.trim();
  if (!id || !nombre) return;
  try {
    localStorage.setItem(
      claveHistorialClienteFlota(id),
      JSON.stringify({
        nombre,
        telefono: state.cliente.telefono.trim(),
        correo: state.cliente.correo.trim(),
        patente: state.cliente.patente.trim().toUpperCase(),
      })
    );
  } catch (_e) {}
}

function aplicarHistorialClienteFlotaSiVacio(flotaId) {
  const h = historialClienteFlota(flotaId);
  if (!h) return;
  if (!state.cliente.nombre.trim()) state.cliente.nombre = h.nombre;
  if (!state.cliente.telefono.trim()) state.cliente.telefono = h.telefono;
  if (!state.cliente.correo.trim()) state.cliente.correo = h.correo;
  if (!state.cliente.patente.trim()) state.cliente.patente = h.patente;
  if (state.cliente.nombre.trim()) sincronizarSolicitanteIdDesdeNombreFlota();
}

function solicitanteFlotaPorNombreEnFlota(flota, nombre) {
  const n = String(nombre || "")
    .trim()
    .toLowerCase();
  if (!n || !flota) return null;
  return (flota.solicitantes || []).find((s) => String(s.nombre || "").trim().toLowerCase() === n) || null;
}

function sincronizarSolicitanteIdDesdeNombreFlota() {
  if (!carritoSoloFlota()) return;
  const flota = flotaActivaDelCarrito();
  const nombre = state.cliente.nombre.trim();
  if (!nombre) {
    state.cliente.solicitanteId = "";
    return;
  }
  const porId =
    state.cliente.solicitanteId && typeof solicitanteFlotaPorId === "function"
      ? solicitanteFlotaPorId(flota && flota.id, state.cliente.solicitanteId)
      : null;
  if (porId && String(porId.nombre || "").trim().toLowerCase() === nombre.toLowerCase()) return;
  const porNombre = solicitanteFlotaPorNombreEnFlota(flota, nombre);
  state.cliente.solicitanteId = porNombre ? porNombre.id : "";
}

async function guardarSolicitanteFlotaEnNube(opts = {}) {
  guardarClienteDesdeForma();
  const nombre = state.cliente.nombre.trim();
  if (!nombre) return { ok: !opts.requerir, error: "Falta el nombre." };
  const flotaId = typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
  if (!flotaId) return { ok: false, error: "Sin flota activa." };
  let acceso =
    (typeof tokenLinkFlotaSesion === "function" ? tokenLinkFlotaSesion(flotaId) : "") ||
    tokenFlotaAccesoDesdeQuery();
  const flotaLocal = typeof flotaPorId === "function" ? flotaPorId(flotaId) : null;
  const linkVigente = flotaLocal && String(flotaLocal.link_acceso || "").trim();
  if (acceso && linkVigente && acceso !== linkVigente) {
    acceso = "";
    if (typeof limpiarTokenLinkFlotaSesion === "function") limpiarTokenLinkFlotaSesion(flotaId);
  }
  try {
    const res = await fetch("/api/flota-registrar-solicitante", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flota_id: flotaId,
        acceso: acceso || undefined,
        nombre,
        telefono: state.cliente.telefono.trim(),
        correo: state.cliente.correo.trim(),
        patente: state.cliente.patente.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: (data && data.error) || "No se pudo guardar el solicitante en la flota." };
    }
    const flota = typeof flotaPorId === "function" ? flotaPorId(flotaId) : null;
    if (flota && data.solicitante && typeof fusionarSolicitanteEnFlota === "function") {
      fusionarSolicitanteEnFlota(flota, data.solicitante);
      if (typeof persistirFlotas === "function") persistirFlotas();
    }
    if (data.solicitante && data.solicitante.id) {
      state.cliente.solicitanteId = data.solicitante.id;
      state.cliente.nombre = data.solicitante.nombre || nombre;
      persistir();
    }
    guardarHistorialClienteFlota(flotaId);
    return { ok: true, solicitante: data.solicitante };
  } catch (_e) {
    return { ok: false, error: "No hubo conexión para guardar el solicitante." };
  }
}

async function asegurarSolicitanteFlotaParaTicket(opts = {}) {
  if (!carritoSoloFlota()) return { ok: true };
  guardarClienteDesdeForma();
  sincronizarSolicitanteIdDesdeNombreFlota();
  return guardarSolicitanteFlotaEnNube(opts);
}

async function elegirAtencionInmediataFlota() {
  await refrescarAgendaAutonexus(false);
  const ahora = new Date();
  for (let add = 0; add < 21; add += 1) {
    const day = new Date(ahora);
    day.setDate(day.getDate() + add);
    if (!esHabil(day)) continue;
    const iso = ymd(day);
    const horas = bloquesVisitaDia(iso);
    for (const h of horas) {
      const slot = instanteDesdeIsoHora(iso, h);
      if (slot > ahora) {
        state.cita.fecha = iso;
        state.cita.hora = h;
        persistir();
        actualizarCalendarioAgendaEnDom();
        cerrarModalHoras();
        return;
      }
    }
  }
  alert("No hay un horario hábil disponible en los próximos días.");
}

function aplicarVehiculoDesdeUrl() {
  if (typeof vehiculoDesdeQuery !== "function") return false;
  const auto = vehiculoDesdeQuery();
  if (!auto) return false;
  state.vehiculo = auto;
  return true;
}

function aplicarServicioDesdeUrl(idExplicito) {
  const id = idExplicito || (typeof idServicioDesdeQuery === "function" ? idServicioDesdeQuery() : "");
  if (!id) return false;
  const s = oferta(id);
  if (!s) return false;
  if (typeof vistaListaDeServicio === "function") state.origenLista = vistaListaDeServicio(s);
  intentarAbrirOferta(id);
  return true;
}

function aplicarVehiculoDesdeUrlAlInicio() {
  const teniaV = aplicarVehiculoDesdeUrl();
  if (teniaV) persistir();
  const servicioId = typeof idServicioDesdeQuery === "function" ? idServicioDesdeQuery() : "";
  if (teniaV || servicioId) {
    if (typeof limpiarQueryEntradaEnHistorial === "function") limpiarQueryEntradaEnHistorial();
  }
  return { teniaV, servicioId };
}

function sanitizarCarritoTrasCatalogo() {
  state.carrito = state.carrito.filter((x) => {
    if (x.tipo === "oferta") return Boolean(oferta(x.id));
    if (x.tipo === "flota") {
      return typeof buscarServicioFlota === "function" && Boolean(buscarServicioFlota(x.flotaId, x.servicioId));
    }
    return Boolean(servicioAgenda(x.id));
  });
  persistir();
}

function carritoSoloFlota() {
  return state.carrito.length > 0 && state.carrito.every((x) => x.tipo === "flota");
}

const VISTAS_CATALOGO_PARTICULAR = [
  "portada",
  "ofertas",
  "mantencion",
  "diagnostico",
  "oferta-detalle",
  "filtro-oferta",
  "filtro-menu",
];

function vistaCatalogoParticular(v) {
  return VISTAS_CATALOGO_PARTICULAR.includes(v);
}

function reconciliarAreaTrasCarrito() {
  if (carritoMixto()) {
    alert("El carrito mezclaba flota y particulares; se vació por seguridad.");
    state.carrito = [];
    state.servicioAgenda = null;
    state.areaFlotas = false;
    persistir();
    return;
  }
  if (carritoTieneFlota()) {
    const fid =
      typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
    if (fid) state.flotaActivaId = fid;
  } else {
    state.areaFlotas = false;
  }
}

function vistaEnModuloFlotas(v) {
  const id = String(v || state.vista || "");
  return id.startsWith("flotas") || (id === "carrito-agenda" && carritoSoloFlota());
}

function redirigirSiCarritoFlotaEnVistaParticular() {
  if (!carritoTieneFlota()) return false;
  if (state.vista.startsWith("flotas") || state.vista === "carrito-agenda") return false;
  if (state.vista === "agendamiento" && carritoSoloFlota()) return false;
  const fid =
    typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
  if (fid && typeof sesionFlotaOk === "function" && sesionFlotaOk(fid)) return false;
  if (!vistaCatalogoParticular(state.vista)) return false;
  state.areaFlotas = true;
  if (fid) state.flotaActivaId = fid;
  state.vista = "flotas-pin";
  syncAreaFlotasUi();
  return true;
}

function bloquearNavegacionParticularConCarritoFlota() {
  if (!carritoTieneFlota()) return false;
  alert(
    "Tienes servicios de flota en el ticket. Vacía el ticket o sal del área Flotas antes de ver el catálogo de particulares."
  );
  state.areaFlotas = true;
  const fid =
    typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
  if (fid) state.flotaActivaId = fid;
  state.vista =
    fid && typeof sesionFlotaOk === "function" && sesionFlotaOk(fid)
      ? "flotas-categorias"
      : "flotas-pin";
  syncAreaFlotasUi();
  renderVista();
  return true;
}

function carritoTieneFlota() {
  return state.carrito.some((x) => x.tipo === "flota");
}

function carritoTieneParticular() {
  return state.carrito.some((x) => x.tipo === "oferta" || x.tipo === "agenda");
}

function carritoMixto() {
  return carritoTieneFlota() && carritoTieneParticular();
}

function syncAreaFlotasUi() {
  if (!carritoTieneFlota() && !vistaEnModuloFlotas()) {
    state.areaFlotas = false;
  } else if (vistaEnModuloFlotas()) {
    state.areaFlotas = true;
  }
  const on = Boolean(state.areaFlotas);
  document.body.classList.toggle("en-area-flotas", on);
  document.body.classList.toggle("en-flotas-pin", on && state.vista === "flotas-pin");
  renderTotales(false);
}

function vaciarCarritoSilencioso() {
  state.carrito = [];
  state.servicioAgenda = null;
  state.areaFlotas = false;
  localStorage.removeItem(FLOTA_NAV_KEY);
  persistir();
  syncAreaFlotasUi();
  renderTotales(false);
}

function salirAreaFlotas() {
  if (state.carrito.length) {
    const ok = confirm("¿Seguro que quieres salir del área Flotas? Se vaciará el carrito.");
    if (!ok) return;
    vaciarCarritoSilencioso();
  }
  const flotaSes = state.flotaActivaId;
  state.areaFlotas = false;
  state.flotaActivaId = "";
  state.flotaCategoriaId = "";
  state.flotaPendienteId = "";
  state.flotaBienvenida = "";
  if (flotaSes && typeof cerrarSesionFlota === "function") cerrarSesionFlota(flotaSes);
  state.vista = "portada";
  syncAreaFlotasUi();
  renderVista();
}

function entrarAreaFlotas() {
  if (carritoTieneParticular()) {
    const ok = confirm(
      "Tienes servicios particulares en el carrito. Para entrar a Flotas se vaciará el carrito. ¿Continuar?"
    );
    if (!ok) return false;
    vaciarCarritoSilencioso();
  }
  state.areaFlotas = true;
  syncAreaFlotasUi();
  return true;
}

function origenAgendaDesdeCarrito() {
  if (state.carrito.some((x) => x.tipo === "oferta")) return "ofertas";
  if (state.carrito.some((x) => x.tipo === "flota")) return "flotas";
  return "menu";
}

async function ensureCatalogoCliente() {
  if (typeof nubeActiva === "function" && nubeActiva() && typeof refrescarCatalogoRemoto === "function") {
    await refrescarCatalogoRemoto();
  } else {
    await ensureCatalogoCargado();
  }
  sanitizarCarritoTrasCatalogo();
  renderTotales(false);
  return catalogo;
}

function reaplicarVistaTrasCatalogo() {
  sanitizarCarritoTrasCatalogo();
  renderTotales(false);
  const v = state.vista;
  if (
    v === "ofertas" ||
    v === "mantencion" ||
    v === "diagnostico" ||
    v === "oferta-detalle" ||
    v === "filtro-oferta" ||
    v === "agendamiento"
  ) {
    renderVista({ quedarse: true });
  }
}

async function abrirVistaCatalogo(vista) {
  if (carritoTieneFlota()) {
    bloquearNavegacionParticularConCarritoFlota();
    return;
  }
  const dest = vista || state.vista;
  $("stage").innerHTML = `<section class="panel claro"><p class="lead">Cargando catálogo…</p></section>`;
  try {
    await ensureCatalogoCliente();
  } catch (e) {
    $("stage").innerHTML = `<section class="panel claro"><p class="muted">No pudimos cargar el catálogo. Revisa la conexión e inténtalo de nuevo.</p></section>`;
    return;
  }
  state.vista = dest;
  renderVista();
}

async function abrirPromocionDesdeUrl(servicioId) {
  if (!servicioId) return;
  try {
    await ensureCatalogoCliente();
  } catch (e) {
    return;
  }
  aplicarServicioDesdeUrl(servicioId);
}

function hidratar() {
  try {
    const raw = JSON.parse(localStorage.getItem("autodato_sesion") || "null");
    if (!raw) return;
    if (Array.isArray(raw.carrito)) {
      state.carrito = raw.carrito.slice();
    }
    if (raw.vehiculo) {
      state.vehiculo = raw.vehiculo;
      if (state.vehiculo && !state.vehiculo.combustible) state.vehiculo.combustible = "ambos";
    }
    if (raw.cliente) state.cliente = { ...state.cliente, ...raw.cliente };
    if (raw.entrega) state.entrega = { ...state.entrega, ...raw.entrega };
    if (raw.trasladoFlota != null) state.trasladoFlota = Boolean(raw.trasladoFlota);
    if (raw.cita) state.cita = { ...state.cita, ...raw.cita };
    reconciliarAreaTrasCarrito();
    hidratarNavFlota();
  } catch (e) {
    /* ignore */
  }
}

function estiloFotoPortadaAttr(s) {
  return estiloFotoPortada(s).replace(/"/g, "");
}

function activarImagenPortada(img) {
  if (!img || img.dataset.loaded === "1") return;
  const pendiente = img.getAttribute("data-src");
  if (pendiente && !img.getAttribute("src")) img.src = pendiente;
  img.dataset.loaded = "1";
}

function precargarImagenesPortada(indices) {
  const pista = $("home-slides");
  if (!pista) return;
  const imgs = [...pista.querySelectorAll(".home-foto")];
  indices.forEach((i) => {
    if (imgs[i]) activarImagenPortada(imgs[i]);
  });
}

function htmlSlidePortada(s, idx, indicePrincipal) {
  const ofertaOk = slideMuestraBoton(s) && catalogoEstaListo() && oferta(s.servicio_id);
  const eager = idx === indicePrincipal;
  const alt = ofertaOk ? oferta(s.servicio_id).nombre : "Portada AutoDato";
  const imgAttrs = eager
    ? `src="${s.foto}" fetchpriority="high" decoding="async" data-loaded="1"`
    : `data-src="${s.foto}" src="" loading="lazy" decoding="async"`;
  return `
    <article class="home-slide">
      <img class="home-foto home-foto-flyer" ${imgAttrs} alt="${alt}" />
      ${
        ofertaOk
          ? `<button class="home-add" type="button" data-portada-oferta="${s.servicio_id}" style="left:${s.btn_x}%;top:${s.btn_y}%">${s.btn_texto || "Agregar al ticket"}</button>`
          : ""
      }
    </article>`;
}

function armarCarruselPortada(nReal, indicePrincipal) {
  const pista = $("home-slides");
  if (!pista || nReal < 1) return;
  const principal = indicePrincipal != null ? indicePrincipal : nReal > 1 ? 1 : 0;
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
    const i = crudo();
    pintarDots(realDe(i));
    precargarImagenesPortada([i, i + 1, i - 1]);
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

let holdContacto = { tipo: "", held: false, timer: 0 };

function textoContacto(tipo) {
  if (tipo === "wa") return waMostrar();
  return leerTaller().direccion;
}

function copiarTextoPlano(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(texto);
  }
  const t = document.createElement("textarea");
  t.value = texto;
  t.setAttribute("readonly", "");
  t.style.position = "fixed";
  t.style.left = "-9999px";
  document.body.appendChild(t);
  t.select();
  document.execCommand("copy");
  t.remove();
  return Promise.resolve();
}

function cerrarModalContacto() {
  if ($("modal-contacto")) $("modal-contacto").hidden = true;
  if ($("contacto-copiar")) $("contacto-copiar").textContent = "Copiar";
}

function abrirModalContacto(tipo) {
  const modal = $("modal-contacto");
  const texto = $("contacto-texto");
  if (!modal || !texto) return;
  holdContacto.tipo = tipo;
  texto.textContent = textoContacto(tipo);
  if ($("contacto-copiar")) $("contacto-copiar").textContent = "Copiar";
  modal.hidden = false;
}

function armarHoldContacto() {
  document.querySelectorAll("[data-hold]").forEach((el) => {
    const tipo = el.dataset.hold;
    const href = el.dataset.href || "";
    let sx = 0;
    let sy = 0;
    let activo = false;
    const cancelarTimer = () => {
      clearTimeout(holdContacto.timer);
      holdContacto.timer = 0;
    };
    const abrirDestino = () => {
      if (href) window.open(href, "_blank", "noopener");
    };
    el.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      holdContacto.held = false;
      activo = true;
      sx = e.clientX;
      sy = e.clientY;
      cancelarTimer();
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      holdContacto.timer = window.setTimeout(() => {
        holdContacto.held = true;
        holdContacto.timer = 0;
        if (navigator.vibrate) navigator.vibrate(20);
        abrirModalContacto(tipo);
      }, 1000);
    });
    el.addEventListener("pointermove", (e) => {
      if (!activo || !holdContacto.timer) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 22) {
        cancelarTimer();
        activo = false;
      }
    });
    el.addEventListener("pointerup", (e) => {
      if (!activo) return;
      activo = false;
      const hold = holdContacto.held;
      cancelarTimer();
      e.preventDefault();
      if (hold) {
        holdContacto.held = false;
        return;
      }
      abrirDestino();
    });
    el.addEventListener("pointercancel", () => {
      if (holdContacto.held) return;
      activo = false;
      cancelarTimer();
    });
    el.addEventListener("click", (e) => e.preventDefault());
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}

function renderPortada() {
  if (typeof hidratarCatalogoClienteLocal === "function") hidratarCatalogoClienteLocal();
  const lista = slidesPortadaPara(state.vehiculo);
  const loop = lista.length > 1;
  const pista = loop ? [lista[lista.length - 1], ...lista, lista[0]] : lista;
  const indicePrincipal = loop ? 1 : 0;
  $("stage").innerHTML = `
    <section class="home-screen">
      <header class="home-logo" style="height:${bannerAltoPortada(portadaUi)}px">
        <img data-logo src="${logoHref()}" alt="AutoDato" style="${estiloLogoPortada(portadaUi)}" />
      </header>
      <div class="home-slides" id="home-slides">${pista.map((s, i) => htmlSlidePortada(s, i, indicePrincipal)).join("")}</div>
      ${htmlCapaPortada(portadaUi, lista.length, 0, false)}
    </section>
  `;
  armarCarruselPortada(lista.length, indicePrincipal);
  armarHoldContacto();
  pintarChipAuto();
  if (lista.length > 1) {
    setTimeout(() => precargarImagenesPortada([indicePrincipal + 1, indicePrincipal - 1]), 400);
  }
}

function idsComboPara(id) {
  return state.carrito.filter((x) => x.tipo === "oferta" && x.id !== id).map((x) => x.id);
}

function comboEnCarrito(s) {
  if (typeof esServicioCombo !== "function" || !esServicioCombo(s)) return false;
  const ids = idsMiembrosCombo(s);
  if (!ids.length) return false;
  const cartIds = new Set(state.carrito.filter((x) => x.tipo === "oferta").map((x) => x.id));
  const aceitesMiembro = ids.filter((mid) => esAceiteMotorServicio(oferta(mid)));
  const fijos = ids.filter((mid) => !aceitesMiembro.includes(mid));
  if (!fijos.every((mid) => cartIds.has(mid))) return false;
  if (!aceitesMiembro.length) return true;
  return state.carrito.some((x) => {
    if (x.tipo !== "oferta") return false;
    const m = oferta(x.id);
    return m && esAceiteMotorServicio(m);
  });
}

function precioVistaCombo(s) {
  const pack = preciosPackCombo(s);
  return {
    lista: pack.lista,
    pagado: pack.pagado,
    ahorro: pack.ahorro,
    regla: pack.ahorro > 0 ? { etiqueta: "Precio combo" } : null,
  };
}

function idsContextoCombo(s) {
  return typeof idsMiembrosCombo === "function" ? idsMiembrosCombo(s) : [];
}

function esAceiteMotorServicio(s) {
  if (!s) return false;
  return String(s.nombre || "")
    .toLowerCase()
    .includes("aceite de motor");
}

function comboIncluyeAceiteMotor(comboServicio) {
  return idsContextoCombo(comboServicio).some((id) => esAceiteMotorServicio(oferta(id)));
}

function aceitesMotorEnCarrito() {
  return state.carrito
    .filter((x) => x.tipo === "oferta")
    .map((x) => oferta(x.id))
    .filter((s) => s && esAceiteMotorServicio(s));
}

function quitarAceitesMotorDelCarrito(exceptoId) {
  state.carrito = state.carrito.filter((x) => {
    if (x.tipo !== "oferta") return true;
    if (exceptoId && x.id === exceptoId) return true;
    const m = oferta(x.id);
    return !m || !esAceiteMotorServicio(m);
  });
}

function catalogoExtrasConDescuentoCombo(comboServicio) {
  const ctx = idsContextoCombo(comboServicio);
  if (!ctx.length) return [];
  const miembros = new Set(ctx);
  const byId = new Map();
  const incluir = (serv) => {
    if (!serv || miembros.has(serv.id)) return;
    if (serv.es_combo) return;
    if (serv.activo === false) return;
    if (typeof servicioAplicaAVehiculo === "function" && !servicioAplicaAVehiculo(serv, state.vehiculo)) return;
    byId.set(serv.id, serv);
  };
  (catalogo || []).forEach((serv) => {
    if (!serv || miembros.has(serv.id)) return;
    if (serv.es_combo || serv.activo === false) return;
    if (typeof servicioAplicaAVehiculo === "function" && !servicioAplicaAVehiculo(serv, state.vehiculo)) return;
    const p = precioPagado(serv, ctx);
    if (p.ahorro && p.ahorro > 0) incluir(serv);
  });
  if (comboIncluyeAceiteMotor(comboServicio)) {
    (catalogo || []).forEach((serv) => {
      if (esAceiteMotorServicio(serv)) incluir(serv);
    });
  }
  const out = [...byId.values()];
  out.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  return out;
}

function htmlComboExtrasEnDetalle(s) {
  const ctx = idsContextoCombo(s);
  const extras = catalogoExtrasConDescuentoCombo(s);
  if (!extras.length) return "";
  return `
      <div id="combo-sugerencias-post-ticket" class="combo-inclusiones-extras suma-ofertas">
        <h3>También con descuento al sumar con este combo</h3>
        <div class="minis">${extras.map((serv) => htmlMini(serv, null, ctx)).join("")}</div>
      </div>`;
}

function htmlDetalleComboInclusiones(s) {
  if (typeof esServicioCombo !== "function" || !esServicioCombo(s)) return "";
  const pack = preciosPackCombo(s);
  if (!pack.lineas.length) return "";
  return `
    <section class="combo-inclusiones">
      <h3>Incluye estos servicios</h3>
      <ul class="combo-inclusiones-lista">
        ${pack.lineas
          .map((l) => {
            const m = oferta(l.id);
            const agot = m && typeof servicioSinStock === "function" && servicioSinStock(m);
            const reglaTxt = l.regla && l.regla.etiqueta ? l.regla.etiqueta : "";
            return `<li class="combo-incl-item${agot ? " combo-incl-agotado" : ""}">
              <div class="combo-incl-nom"><strong>${escapeHtml(l.nombre)}</strong>${agot ? ` <span class="tag tag-agotado">Sin stock</span>` : ""}</div>
              <div class="combo-incl-precios">
                <span class="precio-lista tachado">${clp(l.lista)}</span>
                <span class="precio-oferta">${clp(l.pagado)}</span>
                ${l.ahorro > 0 ? `<span class="ahorro-tag">Ahorras ${clp(l.ahorro)}</span>` : ""}
              </div>
              ${reglaTxt ? `<p class="muted combo-incl-regla">${escapeHtml(reglaTxt)}</p>` : ""}
            </li>`;
          })
          .join("")}
      </ul>
    </section>
  `;
}

function htmlHintCombo(s, pagado) {
  const mejor = mejorComboEntrante(s, pagado);
  if (!mejor) return "";
  return `<p class="combo-hint">Si también llevas ${nombreServicioDe(mejor.si)}, baja a <strong>${clp(mejor.precio)}</strong></p>`;
}

function complementosDesdeTicket() {
  const idsCarrito = state.carrito.filter((x) => x.tipo === "oferta").map((x) => x.id);
  const out = [];
  const vistos = new Set();
  idsCarrito.forEach((pid) => {
    const padre = oferta(pid);
    if (!padre) return;
    (padre.complementos || []).forEach((c) => {
      if (vistos.has(c.id)) return;
      const servicio = oferta(c.id);
      if (!servicio || !servicioAplicaAVehiculo(servicio, state.vehiculo)) return;
      vistos.add(c.id);
      out.push({ combo: c, servicio });
    });
  });
  return out;
}

function htmlSumaRelacionados(s, enCarro) {
  const padres = combosEntrantesDe(s.id)
    .map((r) => ({ regla: r, servicio: oferta(r.si) }))
    .filter((x) => x.servicio && servicioAplicaAVehiculo(x.servicio, state.vehiculo));
  const hijosLocales = (s.complementos || [])
    .map((c) => ({ combo: c, servicio: oferta(c.id) }))
    .filter((x) => x.servicio && servicioAplicaAVehiculo(x.servicio, state.vehiculo));
  const map = new Map();
  const agregarRelacionado = (x) => {
    if (!x || !x.servicio) return;
    map.set(String(x.servicio.id), x);
  };
  complementosDesdeTicket().forEach(agregarRelacionado);
  if (enCarro) hijosLocales.forEach(agregarRelacionado);
  const relacionados = [...map.values()];
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
  if (relacionados.length) {
    bloques.push(`
      <section class="suma-ofertas">
        <h3>Suma estos servicios y activa la oferta</h3>
        <div class="minis">${relacionados.map((x) => htmlMini(x.servicio, x.combo)).join("")}</div>
      </section>
    `);
  }
  return bloques.join("");
}

function volverAlCatalogoDesdeDetalle() {
  state.ofertaAbierta = null;
  state.ofertaPendiente = null;
  state.vista = state.origenLista || "ofertas";
  renderVista();
}

function htmlIconoCarro() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l1 2h14l-1.6 8H8L6 7"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>`;
}

function htmlTarjetaOferta(s) {
  const esCombo = typeof esServicioCombo === "function" && esServicioCombo(s);
  const enCarro = esCombo ? comboEnCarrito(s) : state.carrito.some((x) => x.id === s.id);
  const agotado = typeof servicioSinStock === "function" && servicioSinStock(s);
  const avisoStock = !esCombo && !agotado && typeof etiquetaStock === "function" ? etiquetaStock(s) : "";
  const p = esCombo ? precioVistaCombo(s) : precioPagado(s, idsComboPara(s.id));
  const hayDesc = p.ahorro > 0;
  const precioLista = esCombo ? p.lista : s.precio;
  return `
    <article class="card ${enCarro ? "card-en-carro" : agotado ? "card-agotado" : "card-con-add"}">
      <button class="card-abrir" type="button" data-abrir-oferta="${s.id}">
        <div class="card-photo">
          ${s.foto ? `<img class="card-photo-img" src="${s.foto}" alt="" loading="lazy" decoding="async" />` : ""}
          <div class="card-tags">
            ${esCombo ? `<span class="tag tag-combo">Combo</span>` : ""}
            ${agotado && !enCarro ? `<span class="tag tag-agotado">Agotado</span>` : ""}
            ${avisoStock ? `<span class="tag tag-stock">${avisoStock}</span>` : ""}
            ${enCarro ? `<span class="tag tag-carrito">En ticket</span>` : ""}
            ${!enCarro && !agotado && hayDesc ? `<span class="tag tag-dto">− ${clp(p.ahorro)}</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          <h3>${s.nombre}</h3>
          ${s.resumen ? `<p class="card-resumen">${s.resumen}</p>` : ""}
          ${!esCombo && normalizarVehiculos(s.vehiculos).length ? `<p class="card-veh">${etiquetaVehiculos(s)}</p>` : ""}
          ${
            hayDesc
              ? `<div class="precio-lista tachado">${clp(precioLista)}</div>
                 <div class="precio-card-oferta">${clp(p.pagado)}</div>
                 <div class="ahorro-tag">Ahorras ${clp(p.ahorro)}</div>
                 ${p.regla && p.regla.si ? `<p class="card-combo">${p.regla.etiqueta}</p>` : ""}`
              : `<div class="precio">${clp(p.pagado != null ? p.pagado : s.precio)}</div>`
          }
          ${esCombo ? "" : htmlHintCombo(s, p.pagado)}
        </div>
      </button>
      ${
        enCarro || agotado
          ? ""
          : `<button class="card-add" type="button" data-add-oferta="${s.id}" title="Agregar al ticket" aria-label="Agregar al ticket">
              <span class="kpi-cart">${htmlIconoCarro()}</span>
            </button>`
      }
    </article>
  `;
}

function serviciosParaVehiculo(lista, canal) {
  let candidatos = Array.isArray(lista) ? lista.slice() : [];
  if (vehiculoOk()) {
    const col = columnaDeVehiculo(state.vehiculo);
    if (col && typeof idsDeColumna === "function" && typeof servicioPorId === "function") {
      const ids = new Set(candidatos.map((s) => String(s.id)));
      idsDeColumna(col, "servicios").forEach((sid) => {
        if (ids.has(String(sid))) return;
        const s = servicioPorId(sid);
        if (!s || s.activo === false) return;
        if (canal && typeof servicioEnCanal === "function" && !servicioEnCanal(s, canal)) return;
        candidatos.push(s);
        ids.add(String(sid));
      });
    }
  }
  const filtrados = candidatos.filter((s) => {
    if (!servicioAplicaAVehiculo(s, state.vehiculo)) return false;
    if (canal && typeof servicioEnCanal === "function" && !servicioEnCanal(s, canal)) return false;
    return true;
  });
  if (!vehiculoOk()) return filtrados;
  const col = columnaDeVehiculo(state.vehiculo);
  if (col && typeof ordenarServiciosColumna === "function") return ordenarServiciosColumna(col, filtrados);
  return filtrados;
}

function htmlAvisoTicketCorto() {
  const flota =
    Boolean(state.areaFlotas) ||
    String(state.vista || "").startsWith("flotas") ||
    (typeof carritoSoloFlota === "function" && carritoSoloFlota());
  const txt = flota
    ? "Los precios pueden variar con el tiempo según el ajuste del mercado."
    : "No es una compra en línea: armas un ticket para agendar en el taller.";
  return `<p class="aviso-ticket">${txt}</p>`;
}

function htmlListaCotizacion(titulo, lead, lista, opts = {}) {
  const hayCarro = state.carrito.some((x) => x.tipo === "oferta");
  const vacio = vehiculoOk()
    ? `<p class="muted">No hay servicios para ${textoVehiculo()}.</p>`
    : `<p class="muted">Aún no hay servicios en esta sección.</p>`;
  const texto = opts.fijo || !hayCarro
    ? lead
    : "Los servicios con etiqueta En ticket ya están seleccionados. En el resto ves el descuento de combo si aplica.";
  return `
    <section class="panel claro">
      <h2>${titulo}</h2>
      ${htmlAvisoTicketCorto()}
      <p class="lead">${texto}</p>
      <div class="grid">
        ${lista.length ? lista.map(htmlTarjetaOferta).join("") : vacio}
      </div>
    </section>
  `;
}

function renderOfertas() {
  $("stage").innerHTML = htmlListaCotizacion(
    "Promociones",
    "Promociones de ocasión. Las mantenciones regulares están en Mantención preventiva.",
    serviciosParaVehiculo(serviciosOferta(), "ofertas")
  );
}

function renderMantencion() {
  $("stage").innerHTML = htmlListaCotizacion(
    "Mantención preventiva",
    "¡Arma tu combo y ahorra en mano de obra! Al realizar varios servicios en una misma visita optimizamos los tiempos de taller y desarme, permitiéndonos ofrecerte un descuento especial en cada mantención adicional que sumes a tu ticket.",
    serviciosParaVehiculo(serviciosMantencion(), "mantencion"),
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
  const id = state.ofertaAbierta;
  const s = oferta(id);
  if (!s) {
    renderOfertas();
    return;
  }
  if (!s.detalleListo) {
    $("stage").innerHTML = `<section class="panel claro"><p class="lead">Cargando servicio…</p></section>`;
    void ensureDetalleServicio(id)
      .then(() => {
        if (state.vista === "oferta-detalle" && state.ofertaAbierta === id) renderDetalleOferta();
      })
      .catch(() => {
        alert("No pudimos cargar la ficha de este servicio. Reintenta.");
        volverAlCatalogoDesdeDetalle();
      });
    return;
  }
  const esCombo = typeof esServicioCombo === "function" && esServicioCombo(s);
  const enCarro = esCombo ? comboEnCarrito(s) : state.carrito.some((x) => x.id === s.id);
  const agotado = typeof servicioSinStock === "function" && servicioSinStock(s);
  const avisoStock = !esCombo && !agotado && typeof etiquetaStock === "function" ? etiquetaStock(s) : "";
  const ids = state.carrito.map((x) => x.id);
  const p = esCombo ? precioVistaCombo(s) : precioPagado(s, ids.filter((id) => id !== s.id));
  const mostrarDesc = p.ahorro > 0;
  const precioLista = esCombo ? p.lista : s.precio;

  $("stage").innerHTML = `
    <article class="detalle-full">
      <div class="detalle-hero">
        ${htmlCarruselServicio(s)}
        <div class="detalle-copy">
          <h2>${s.nombre}${esCombo ? ` <span class="tag tag-combo">Combo</span>` : ""}</h2>
          ${avisoStock ? `<p class="detalle-stock"><span class="tag tag-stock">${avisoStock}</span></p>` : ""}
          ${agotado && esCombo ? `<p class="detalle-stock"><span class="tag tag-agotado">Agotado — falta stock en algún servicio incluido</span></p>` : ""}
          ${s.resumen ? `<p class="detalle-resumen">${s.resumen}</p>` : ""}
          <p class="lead">${s.detalle}</p>
          ${htmlDetalleComboInclusiones(s)}
          <div class="precio-fila">
            <div class="precio-col">
              <div class="precio-lista ${mostrarDesc ? "tachado" : ""}">${clp(precioLista)}</div>
              ${
                mostrarDesc
                  ? `<div class="precio-oferta">${clp(p.pagado)}</div><div class="ahorro-tag">Ahorras ${clp(p.ahorro)} ${p.regla && p.regla.etiqueta ? p.regla.etiqueta : ""}</div>`
                  : ""
              }
              ${esCombo ? "" : htmlHintCombo(s, p.pagado)}
            </div>
            ${
              enCarro
                ? `<button class="btn-en-carro" type="button" data-quitar-oferta="${s.id}">En ticket</button>`
                : agotado
                  ? `<span class="tag tag-agotado tag-agotado-detalle">Agotado</span>`
                  : `<button class="btn-add-precio" type="button" data-add-oferta="${s.id}">Agregar al ticket</button>`
            }
          </div>
          ${esCombo && enCarro ? htmlComboExtrasEnDetalle(s) : ""}
          ${esCombo ? "" : htmlSumaRelacionados(s, enCarro)}
          <button class="btn-line btn-block btn-volver-catalogo" type="button" data-volver-catalogo>Volver al catálogo</button>
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

function htmlMini(s, combo, ctxOfertas) {
  const enCarro = state.carrito.some((x) => x.id === s.id);
  const agotado = typeof servicioSinStock === "function" && servicioSinStock(s);
  const baseIds = ctxOfertas || state.carrito.filter((x) => x.tipo === "oferta").map((x) => x.id);
  const p = precioPagado(s, baseIds.filter((id) => id !== s.id));
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
        ${agotado && !enCarro ? `<span class="tag tag-agotado">Agotado</span>` : ""}
        ${enCarro ? `<span class="tag tag-carrito">En ticket</span>` : ""}
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
              : agotado
                ? `<span class="muted mini-agotado">Agotado</span>`
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
    if (debePedirVehiculoEnAgenda()) {
      $("stage").innerHTML = `<section class="panel claro">${htmlFiltro("agenda-oferta")}</section>`;
      return;
    }
    renderDatosAgenda();
    return;
  }

  if (state.pasoAgenda === "filtro" || debePedirVehiculoEnAgenda()) {
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
    "Revisión enfocada en tu problema real. Para garantizar un diagnóstico certero, cada sistema se analiza por separado: escáner electrónico, ruidos mecánicos o inspección de fugas. Selecciona el servicio correspondiente según la falla que notes en tu vehículo.",
    serviciosParaVehiculo(serviciosDiagnostico(), "diagnostico"),
    { fijo: true }
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

async function refrescarAgendaAutonexus(force) {
  const ttl = 5 * 60 * 1000;
  if (!force && agendaAutonexus.dias.length && Date.now() - agendaAutonexus.ts < ttl) {
    return agendaAutonexus;
  }
  if (agendaAutonexus.cargando) return agendaAutonexus;
  agendaAutonexus.cargando = true;
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    const r = await fetch("/api/agenda-disponibilidad?dias=21", {
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok && j.data && Array.isArray(j.data.dias)) {
      agendaAutonexus.dias = j.data.dias;
      agendaAutonexus.ts = Date.now();
    }
  } catch (e) {
    console.warn("No se pudo cargar agenda AutoNexus.", e);
  }
  agendaAutonexus.cargando = false;
  return agendaAutonexus;
}

function diaAgenda(iso) {
  return agendaAutonexus.dias.find((d) => d.fecha_iso === iso) || null;
}

function libresDeDia(iso) {
  const d = diaAgenda(iso);
  if (!d) return null;
  if (d.motivo_dia_cerrado) return [];
  return Array.isArray(d.libres) ? d.libres.map(String) : [];
}

function diaAgendaReservable(fecha) {
  if (!esHabil(fecha) || fecha < hoy0()) return false;
  if (flotaAgendaLibreActiva()) return true;
  const iso = ymd(fecha);
  const d = diaAgenda(iso);
  if (!d) return true;
  if (d.motivo_dia_cerrado) return false;
  const libres = libresDeDia(iso);
  return libres != null && libres.length > 0;
}

function etiquetaAgendaDia(iso) {
  const d = diaAgenda(iso);
  if (!d) return "";
  if (d.motivo_dia_cerrado) return String(d.motivo_dia_cerrado);
  if (d.agenda_web_cerrada) return "Sin cupo web hoy";
  if (!(d.libres || []).length) return "Cupos tomados";
  return "";
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
    const ok = fecha >= hoy0() && esHabil(fecha) && diaAgendaReservable(fecha);
    const on = state.cita.fecha === id ? "is-on" : "";
    const title = etiquetaAgendaDia(id);
    celdas.push(
      `<button type="button" data-dia="${id}" ${ok ? "" : "disabled"} class="${on}"${title ? ` title="${escapeAttr(title)}"` : ""}>${d}</button>`
    );
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
      <p class="muted" id="cal-ayuda">${state.cita.fecha && state.cita.hora ? `Elegiste ${fechaBonita(state.cita.fecha)} · ${state.cita.hora}` : agendaAutonexus.cargando ? "Cargando cupos del taller…" : agendaAutonexus.dias.length ? "Pincha un día con cupo. Horarios: 09:00, 11:00 y 15:00." : "Pincha un día hábil. Se abre un recuadro con las horas."}</p>
    </div>
  `;
}

function abrirModalHoras(fecha) {
  const horas = bloquesVisitaDia(fecha);
  const bloques = BLOQUES.filter((b) => horas.includes(b.hora));
  $("modal-horas").hidden = false;
  $("overlay").hidden = false;
  $("modal-horas-fecha").textContent = fechaBonita(fecha);
  $("modal-horas-lista").innerHTML = bloques.length
    ? bloques
        .map(
          (b) =>
            `<button type="button" data-hora="${b.hora}" class="${state.cita.hora === b.hora && state.cita.fecha === fecha ? "is-on" : ""}">${b.etiqueta}</button>`
        )
        .join("")
    : `<p class="muted">No hay cupo en este día. Elige otra fecha.</p>`;
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
  state.origenAgenda = origenAgendaDesdeCarrito();
  state.vista = "carrito-agenda";
  cerrarModalKpi();
  renderVista();
  irAContenido();
}

function seguirExplorandoOfertas() {
  cerrarModalKpi();
  if (carritoTieneFlota() || state.origenAgenda === "flotas") {
    state.areaFlotas = true;
  }
  if (state.origenAgenda === "flotas" || carritoTieneFlota() || (state.vistaAnterior && String(state.vistaAnterior).startsWith("flotas"))) {
    state.vista =
      state.vistaAnterior === "flotas-servicio-detalle" && state.flotaServicioDetalleId
        ? "flotas-servicio-detalle"
        : state.flotaCategoriaId
          ? "flotas-servicios"
          : "flotas-categorias";
  } else if (state.vistaAnterior === "oferta-detalle" && state.ofertaAbierta) {
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

const IDS_CAMPOS_AGENDA = [
  "c-nombre",
  "c-telefono",
  "c-patente",
  "c-sintoma",
  "c-correo",
  "flota-pin-input",
  "flota-busqueda-input",
];

function tecladoFichaActivo() {
  const a = document.activeElement;
  return Boolean(
    $("modal-informe") &&
    !$("modal-informe").hidden &&
    a &&
    (a.id === "informe-patente" || a.id === "informe-telefono")
  );
}

function campoAgendaActivo() {
  const a = document.activeElement;
  return Boolean(a && IDS_CAMPOS_AGENDA.includes(a.id));
}

function llevarCampoSobreTeclado(el) {
  if (!el || !esMovil()) return;
  const vv = window.visualViewport;
  const reservado = document.body.classList.contains("en-flotas-pin")
    ? 48
    : document.body.classList.contains("en-agenda-datos")
      ? 72
      : 96;
  const teclado = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 280;
  const limite = (vv ? vv.height + vv.offsetTop : window.innerHeight) - reservado;
  const r = el.getBoundingClientRect();
  if (r.bottom > limite || r.top < 56) {
    const delta = r.bottom - limite + 16;
    window.scrollBy({ top: delta > 0 ? delta : r.top - 72, behavior: "smooth" });
  }
}

function syncTecladoViewport() {
  const modal = $("modal-informe");
  const fichaAbierta = Boolean(modal && !modal.hidden);
  let cubierto = 0;
  if (window.visualViewport) {
    const vv = window.visualViewport;
    cubierto = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }
  document.documentElement.style.setProperty("--teclado", `${cubierto}px`);
  const agendaCampo = esMovil() && campoAgendaActivo();
  const teclado =
    cubierto > 60 ||
    agendaCampo ||
    (fichaAbierta && (cubierto > 80 || tecladoFichaActivo()));
  document.body.classList.toggle("teclado-abierto", teclado);
  if (fichaAbierta && (cubierto > 80 || tecladoFichaActivo())) {
    const btn = $("btn-abrir-informe");
    if (btn) btn.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  if (agendaCampo) llevarCampoSobreTeclado(document.activeElement);
}

const syncTecladoFicha = syncTecladoViewport;

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

function enfocarBtnTicketAgenda() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const btn = $("btn-ticket");
      const stage = $("stage");
      if (!btn || !stage) return;
      const stageRect = stage.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const margen = 20;
      const fueraAbajo = btnRect.bottom - stageRect.bottom + margen;
      if (fueraAbajo > 0) {
        stage.scrollTo({ top: stage.scrollTop + fueraAbajo, behavior: "smooth" });
        return;
      }
      btn.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  });
}

let renderDatosAgendaGen = 0;

function actualizarBloqueEntregaFlotaEnDom() {
  const host = document.querySelector("[data-flota-entrega]");
  if (!host || !carritoSoloFlota()) return;
  host.innerHTML = htmlCamposEntregaFlota();
  enlazarEntregaFlota();
}

function enlazarTrasladoFlota() {
  const chk = $("c-traslado-flota");
  if (!chk) return;
  chk.addEventListener("change", () => {
    const neto = netoTotalCarritoFlota();
    if (neto < TRASLADO_MIN_NETO_FLOTA) {
      state.trasladoFlota = false;
      chk.checked = false;
    } else {
      state.trasladoFlota = Boolean(chk.checked);
    }
    persistir();
  });
}

function enlazarEntregaFlota() {
  const fInp = $("c-entrega-fecha");
  const hSel = $("c-entrega-hora");
  if (fInp) {
    fInp.addEventListener("change", () => {
      const val = fInp.value;
      if (val) {
        const p = val.split("-").map(Number);
        const d = new Date(p[0], p[1] - 1, p[2]);
        if (!esDiaEntregaHabil(d)) {
          fInp.value = "";
          state.entrega.fecha = "";
          state.entrega.hora = "";
        }
      }
      guardarClienteDesdeForma();
      actualizarBloqueEntregaFlotaEnDom();
    });
    fInp.addEventListener("input", guardarClienteDesdeForma);
  }
  if (hSel) {
    hSel.addEventListener("change", guardarClienteDesdeForma);
  }
}

function enlazarFormularioDatosAgenda() {
  ["c-nombre", "c-telefono", "c-patente", "c-sintoma", "c-correo"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", guardarClienteDesdeForma);
    el.addEventListener("change", guardarClienteDesdeForma);
  });
  if (carritoSoloFlota()) {
    enlazarTrasladoFlota();
    enlazarEntregaFlota();
  }
}

function htmlCamposClienteAgendaFlota(_flota) {
  return `
    <label class="field"><span>Nombre</span><input id="c-nombre" type="text" autocomplete="name" value="${escapeAttr(state.cliente.nombre)}" placeholder="Nombre completo del solicitante" /></label>
    <label class="field"><span>Teléfono</span><input id="c-telefono" type="tel" value="${escapeAttr(state.cliente.telefono)}" /></label>
    <label class="field"><span>Patente</span><input id="c-patente" type="text" maxlength="8" value="${escapeAttr(state.cliente.patente)}" required /></label>
    <label class="field"><span>Notas del servicio (opcional)</span><textarea id="c-sintoma" rows="3" maxlength="400" placeholder="Detalle adicional para el taller">${escapeHtml(state.cliente.sintoma)}</textarea></label>
    <label class="field"><span>Correo (opcional)</span><input id="c-correo" type="email" value="${escapeAttr(state.cliente.correo)}" /></label>
  `;
}

function netoTotalCarritoFlota() {
  if (!carritoSoloFlota()) return 0;
  const { netoTotal } = calcular();
  return Number(netoTotal) || 0;
}

function syncTrasladoFlotaConNeto(neto) {
  if (!carritoSoloFlota()) return;
  if ((Number(neto) || 0) < TRASLADO_MIN_NETO_FLOTA) state.trasladoFlota = false;
}

function htmlTrasladoFlota(netoTotal) {
  const neto = Number(netoTotal) || 0;
  syncTrasladoFlotaConNeto(neto);
  const califica = neto >= TRASLADO_MIN_NETO_FLOTA;
  const checked = califica && Boolean(state.trasladoFlota);
  return `
    <div class="flota-traslado-block">
      <label class="check flota-traslado-check">
        <input type="checkbox" id="c-traslado-flota" ${checked ? "checked" : ""}${califica ? "" : " disabled"} />
        <span>Solicitar retiro del vehículo en instalaciones del cliente</span>
      </label>
      <p class="muted flota-traslado-hint">${
        califica
          ? `Traslado gratuito desde las instalaciones del cliente hasta nuestro taller (ticket neto ${textoTotalNetoFlota(neto)}, sin IVA).`
          : `Retiro gratuito solo si el ticket supera ${clp(TRASLADO_MIN_NETO_FLOTA)} neto (sin IVA). Total neto actual: ${textoTotalNetoFlota(neto)}.`
      }</p>
    </div>
  `;
}

function htmlCamposEntregaFlota() {
  normalizarEntregaFlotaEnState();
  const minIso = minFechaEntregaIso();
  const fecha = state.entrega.fecha || "";
  const horas = fecha ? horasEntregaHabilesDisponibles(fecha) : [];
  const horaSel = horas.includes(state.entrega.hora) ? state.entrega.hora : "";
  return `
    <h3>Hora de solicitud de entrega <span class="muted flota-entrega-opc">(opcional)</span></h3>
    <p class="muted flota-entrega-hint">Cuándo necesitas el vehículo listo. Solo lun–vie, 9:00–18:00 (sin 13:15–14:15). Si son las 18:00 o más tarde, la fecha parte desde mañana.</p>
    <div class="field-row flota-entrega-row">
      <label class="field"><span>Fecha</span><input id="c-entrega-fecha" type="date" min="${escapeAttr(minIso)}" value="${escapeAttr(fecha)}" /></label>
      <label class="field"><span>Hora</span>
        <select id="c-entrega-hora"${fecha ? "" : " disabled"}>
          <option value="">Sin preferencia</option>
          ${horas.map((h) => `<option value="${escapeAttr(h)}"${h === horaSel ? " selected" : ""}>${escapeHtml(etiquetaHoraEntrega(h))}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function htmlPanelDatosAgenda() {
  const { items, subtotal, total, ahorro, netoTotal } = calcular();
  const soloFlota = carritoSoloFlota();
  const flota = soloFlota ? flotaActivaDelCarrito() : null;
  const agendaLibre = soloFlota && flotaAgendaLibreActiva();
  return `
    <section class="panel claro">
      <h2>${soloFlota ? "Ticket flota y agenda" : "Tus datos y la hora"}</h2>
      ${htmlAvisoTicketCorto()}
      <p class="lead">${
        soloFlota
          ? "Precios netos (+ IVA). Sin pago aquí: generas ticket de entrada."
          : `${textoVehiculo()}. Sin pago aquí: generas un ticket de entrada y queda agendada tu visita.`
      }</p>
      ${agendaLibre ? `<p class="muted">Esta flota tiene <strong>agenda libre</strong>: puedes elegir cualquier horario hábil aunque el cupo web esté lleno.</p>` : ""}
      <ul class="resumen">
        ${items
          .map((s) => {
            const precio = soloFlota
              ? s.neto != null && s.neto > 0
                ? textoTotalNetoFlota(s.neto)
                : "A confirmar"
              : s.pagado == null
                ? "A confirmar"
                : clp(s.pagado);
            const desc =
              !soloFlota && s.ahorro > 0
                ? `<span class="ahorro-tag">− ${clp(s.ahorro)}</span> <s>${clp(s.lista)}</s> `
                : "";
            return `<li class="resumen-item"><span class="resumen-nom">${s.nombre}<button class="btn-basura" type="button" data-pedir-quitar="${s.id}" aria-label="Quitar ${s.nombre}">${iconoBasura()}</button></span><strong>${desc}${precio}</strong></li>`;
          })
          .join("")}
        ${
          soloFlota
            ? `<li><span>Total ticket</span><strong style="color:var(--green)">${textoTotalNetoFlota(netoTotal)}</strong></li>`
            : `<li><span>Lista</span><strong>${clp(subtotal)}</strong></li>
        <li><span>Ahorro</span><strong style="color:var(--red)">${clp(ahorro)}</strong></li>
        <li><span>Total</span><strong style="color:var(--green)">${clp(total)}</strong></li>`
        }
      </ul>
      ${soloFlota ? htmlCamposClienteAgendaFlota(flota) : `
      <label class="field"><span>Nombre</span><input id="c-nombre" type="text" value="${escapeAttr(state.cliente.nombre)}" /></label>
      <label class="field"><span>Teléfono</span><input id="c-telefono" type="tel" value="${escapeAttr(state.cliente.telefono)}" /></label>
      <label class="field"><span>Patente (opcional)</span><input id="c-patente" type="text" maxlength="8" value="${escapeAttr(state.cliente.patente)}" /></label>
      <label class="field"><span>Falla o síntoma (opcional)</span><textarea id="c-sintoma" rows="3" maxlength="400" placeholder="Ruido, check engine, fuga u otra falla que notes">${escapeHtml(state.cliente.sintoma)}</textarea></label>
      <label class="field"><span>Correo (opcional)</span><input id="c-correo" type="email" value="${escapeAttr(state.cliente.correo)}" /></label>`}
      <h3>Fecha de visita al taller</h3>
      ${soloFlota ? `<button type="button" class="btn-soft btn-block btn-atencion-inmediata" data-atencion-inmediata-flota>Quiero atención inmediata</button>` : ""}
      <div data-agenda-cal>${htmlCalendario()}</div>
      ${soloFlota ? htmlTrasladoFlota(netoTotal) : ""}
      ${soloFlota ? `<div class="flota-entrega-block" data-flota-entrega>${htmlCamposEntregaFlota()}</div>` : ""}
      <button class="btn-green btn-block" type="button" id="btn-ticket">Generar ticket y agendar</button>
    </section>
  `;
}

function actualizarCalendarioAgendaEnDom() {
  const host = $("stage") && $("stage").querySelector("[data-agenda-cal]");
  if (host) host.innerHTML = htmlCalendario();
}

async function renderDatosAgenda(opts = {}) {
  const gen = ++renderDatosAgendaGen;
  if (carritoSoloFlota()) {
    const flotaId =
      typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
    aplicarHistorialClienteFlotaSiVacio(flotaId);
  }
  $("stage").innerHTML = htmlPanelDatosAgenda();
  enlazarFormularioDatosAgenda();
  if (opts.scrollToTicket && state.cita.fecha && state.cita.hora) enfocarBtnTicketAgenda();

  await refrescarAgendaAutonexus(Boolean(opts.forceAgenda));
  if (gen !== renderDatosAgendaGen) return;
  if (state.vista !== "carrito-agenda" && state.vista !== "agendamiento") return;
  actualizarCalendarioAgendaEnDom();
  if (opts.scrollToTicket && state.cita.fecha && state.cita.hora) enfocarBtnTicketAgenda();
}

function escapeHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(v) {
  return escapeHtml(v);
}

function faltantesTicket() {
  const falta = [];
  if (!state.carrito.length) falta.push("al menos un servicio");
  if (!carritoSoloFlota() && !vehiculoOk()) falta.push("marca, modelo, año y combustible del vehículo");
  if (!state.cliente.nombre.trim()) falta.push("nombre");
  if (!state.cliente.telefono.trim()) falta.push("teléfono");
  if (carritoSoloFlota()) {
    if (!state.cliente.patente.trim()) falta.push("patente");
  } else if (!state.cliente.patente.trim()) {
    /* patente opcional particulares */
  }
  if (!state.cita.fecha) falta.push("día de visita");
  if (!state.cita.hora) falta.push("bloque horario");
  return falta;
}

const VISTAS_CATALOGO = ["ofertas", "mantencion", "diagnostico", "oferta-detalle", "filtro-oferta"];

function renderVista(opts = {}) {
  reconciliarAreaTrasCarrito();
  redirigirSiCarritoFlotaEnVistaParticular();
  syncCromo();
  marcarMenu();
  syncSeguirKpi();
  pintarChipAuto();
  if (
    VISTAS_CATALOGO.includes(state.vista) &&
    typeof catalogoEstaListo === "function" &&
    !catalogoEstaListo()
  ) {
    void abrirVistaCatalogo(state.vista);
    return;
  }
  if (state.vista === "portada") renderPortada();
  else if (state.vista === "ofertas") renderOfertas();
  else if (state.vista === "mantencion") renderMantencion();
  else if (state.vista === "filtro-oferta") renderFiltroOferta();
  else if (state.vista === "filtro-menu") renderFiltroMenu();
  else if (state.vista === "filtro-flota") {
    if (typeof renderFiltroFlotaEntrada === "function") renderFiltroFlotaEntrada();
    else renderFiltroMenu();
  }
  else if (state.vista === "oferta-detalle") renderDetalleOferta();
  else if (state.vista === "diagnostico") renderDiagnostico();
  else if (state.vista === "agendamiento" || state.vista === "carrito-agenda") renderAgendamiento();
  else if (state.vista === "flotas") {
    state.vista = "flotas-pin";
    renderFlotaPin();
  } else if (state.vista === "flotas-pin") renderFlotaPin();
  else if (state.vista === "flotas-categorias") renderFlotaCategorias();
  else if (state.vista === "flotas-servicios") renderFlotaServicios();
  else if (state.vista === "flotas-servicio-detalle") renderFlotaServicioDetalle();
  else renderInfo(state.vista);
  if (!opts.quedarse) irAContenido();
}

async function aplicarFiltro(contexto) {
  const marca = $("f-marca").value;
  const modelo = $("f-modelo").value;
  const ano = $("f-ano").value;
  const combustible = $("f-combustible") && $("f-combustible").value;
  if (!marca || !modelo || !ano || !combustible) {
    alert("Elige marca, modelo, año y combustible. Si tu auto no está en la lista, no podemos abrirte el servicio.");
    return;
  }
  if (
    typeof filtroUsaOpcionesTablero === "function" &&
    filtroUsaOpcionesTablero(contexto) &&
    typeof columnaDeVehiculo === "function" &&
    !columnaDeVehiculo({ marca, modelo, ano: Number(ano), combustible })
  ) {
    alert("Esa combinación no está disponible en el tablero del taller. Revisa año y combustible.");
    return;
  }
  if (contexto === "editar" && carritoBloqueaCambioAuto()) {
    avisoCambioAutoConCarrito();
    cerrarModalAuto();
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
  if (contexto === "flota") {
    state.vista = "flotas-categorias";
    renderVista({ quedarse: true });
    return;
  }

  if (contexto === "menu") {
    const dest = state.vistaPendiente || "ofertas";
    state.vistaPendiente = "";
    if (dest === "agendamiento") {
      try {
        await ensureCatalogoCliente();
      } catch (e) {
        alert("No pudimos cargar el catálogo. Reintenta.");
        return;
      }
      state.vista = "agendamiento";
      if (state.carrito.length) {
        state.origenAgenda = origenAgendaDesdeCarrito();
        state.pasoAgenda = "datos";
      } else {
        state.origenAgenda = "menu";
        state.pasoAgenda = state.servicioAgenda ? "datos" : "servicio";
      }
      renderVista();
    } else if (dest === "ofertas" || dest === "mantencion" || dest === "diagnostico") {
      state.origenLista = dest;
      void abrirVistaCatalogo(dest);
    } else {
      state.vista = dest;
      renderVista();
    }
    return;
  }

  if (contexto === "oferta") {
    try {
      await ensureCatalogoCliente();
    } catch (e) {
      alert("No pudimos cargar el catálogo. Reintenta.");
      return;
    }
    state.vista = "oferta-detalle";
    state.ofertaAbierta = state.ofertaPendiente;
    if (state.agregarTrasFiltro && state.ofertaPendiente) {
      const id = state.ofertaPendiente;
      const s = oferta(id);
      state.agregarTrasFiltro = false;
      if (s && servicioSinStock && servicioSinStock(s)) {
        alert("Este servicio está agotado por ahora.");
      } else if (s && !servicioAplicaAVehiculo(s, state.vehiculo)) {
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
  if (carritoTieneFlota()) {
    bloquearNavegacionParticularConCarritoFlota();
    return;
  }
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

async function iniciarOfertaDesdePortada(id) {
  try {
    await ensureCatalogoCliente();
  } catch (e) {
    alert("No pudimos cargar el catálogo. Reintenta en un momento.");
    return;
  }
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
  if (s && servicioSinStock && servicioSinStock(s)) {
    alert("Este servicio está agotado por ahora.");
    state.ofertaAbierta = id;
    state.vista = "oferta-detalle";
    renderVista();
    return;
  }
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

function avisarServicioAgotado(id) {
  const s = typeof servicioPorId === "function" ? servicioPorId(id) : oferta(id);
  if (s && typeof servicioSinStock === "function" && servicioSinStock(s)) {
    alert("Este servicio está agotado por ahora.");
    return true;
  }
  return false;
}

async function consumirStockParaTicket(items) {
  const cuenta = {};
  (items || []).forEach((s) => {
    if (!s || !s.id || s.tipo === "flota") return;
    cuenta[s.id] = (cuenta[s.id] || 0) + 1;
  });
  const lineas = Object.entries(cuenta).map(([id, qty]) => ({ id, qty }));
  if (!lineas.length) return { ok: true };
  const hayLimite = lineas.some(({ id }) => {
    const s = typeof servicioPorId === "function" ? servicioPorId(id) : null;
    return s && typeof stockLimitado === "function" && stockLimitado(s);
  });
  if (!hayLimite) return { ok: true };
  try {
    const r = await fetch("/api/consumir-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lineas }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "No hay stock suficiente para completar el ticket. Alguien pudo reservarlo hace un momento.",
      };
    }
    if (data.restantes && typeof aplicarStockRestanteLocal === "function") {
      aplicarStockRestanteLocal(data.restantes);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "No se pudo validar el stock. Revisa tu conexión e intenta de nuevo." };
  }
}

function agregarOferta(id) {
  if (state.areaFlotas || carritoTieneFlota()) {
    alert("No puedes mezclar servicios particulares con un ticket de flota. Sal del área Flotas primero.");
    return;
  }
  if (avisarServicioAgotado(id)) return;
  const s = oferta(id);
  if (s && esAceiteMotorServicio(s)) {
    const otros = aceitesMotorEnCarrito().filter((m) => m.id !== id);
    if (otros.length) {
      pedirSustituirAceite(id, otros);
      return;
    }
  }
  agregarOfertaDirecto(id);
}

function agregarOfertaDirecto(id) {
  const s = oferta(id);
  const esCombo = s && typeof esServicioCombo === "function" && esServicioCombo(s);
  if (esCombo) {
    if (comboEnCarrito(s)) {
      persistir();
      renderTotales(true);
      if (state.vista === "oferta-detalle") {
        state.ofertaAbierta = id;
        renderDetalleOferta();
      } else refrescarListasCotizacion();
      return;
    }
    quitarAceitesMotorDelCarrito();
    idsMiembrosCombo(s).forEach((sid) => {
      if (!state.carrito.some((x) => x.id === sid)) state.carrito.push({ tipo: "oferta", id: sid });
    });
    persistir();
    renderTotales(true);
  } else if (!state.carrito.some((x) => x.id === id)) {
    state.carrito.push({ tipo: "oferta", id });
    persistir();
    renderTotales(true);
  }
  if (state.vista === "oferta-detalle") {
    state.ofertaAbierta = id;
    state.origenAgenda = "ofertas";
    renderDetalleOferta();
    if (esCombo) enfocarComboSugerenciasTrasAgregar();
    return;
  }
  if (!state.ofertaAbierta) state.ofertaAbierta = id;
  state.origenAgenda = "ofertas";
  refrescarListasCotizacion();
}

function etiquetaAceiteParaModal(s) {
  if (!s) return "aceite";
  const n = String(s.nombre || "")
    .replace(/^cambio de aceite de motor\s*/i, "")
    .replace(/^cambio de aceite\s*/i, "")
    .trim();
  return n || s.nombre || "aceite";
}

function precioAceiteEnTicket(s) {
  const otros = state.carrito.filter((x) => x.tipo === "oferta" && x.id !== s.id).map((x) => x.id);
  const p = precioPagado(s, otros);
  return p.pagado != null ? p.pagado : s.precio;
}

function enfocarComboSugerenciasTrasAgregar() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = $("combo-sugerencias-post-ticket");
      if (!el) return;
      const stage = $("stage");
      const margen = 72;
      if (stage && stage.scrollHeight > stage.clientHeight + 4) {
        const stageRect = stage.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offset = elRect.top - stageRect.top + stage.scrollTop - margen;
        stage.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
        return;
      }
      const y = window.scrollY + el.getBoundingClientRect().top - margen;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  });
}

function pedirSustituirAceite(nuevoId, reemplazar) {
  const nuevo = oferta(nuevoId);
  const viejo = (reemplazar || [])[0];
  if (!nuevo || !viejo) return;
  sustituirAceitePendiente = nuevoId;
  const marcaVieja = escapeHtml(etiquetaAceiteParaModal(viejo));
  const marcaNueva = escapeHtml(etiquetaAceiteParaModal(nuevo));
  const precioViejo = clp(precioAceiteEnTicket(viejo));
  const precioNuevo = clp(precioAceiteEnTicket(nuevo));
  $("sustituir-aceite-cuerpo").innerHTML = `
    <p>¿Quieres sustituir el aceite <strong>${marcaVieja}</strong> de <strong>${precioViejo}</strong> por <strong>${marcaNueva}</strong> ${precioNuevo}?</p>
  `;
  $("modal-sustituir-aceite").hidden = false;
}

function cerrarModalSustituirAceite() {
  $("modal-sustituir-aceite").hidden = true;
  sustituirAceitePendiente = null;
  if (overlayLibre()) $("overlay").hidden = true;
}

function confirmarSustituirAceite() {
  const nuevoId = sustituirAceitePendiente;
  if (!nuevoId) return;
  const comboIdAbierto =
    state.vista === "oferta-detalle" &&
    state.ofertaAbierta &&
    typeof esServicioCombo === "function" &&
    esServicioCombo(oferta(state.ofertaAbierta))
      ? state.ofertaAbierta
      : null;
  sustituirAceitePendiente = null;
  $("modal-sustituir-aceite").hidden = true;
  if (overlayLibre()) $("overlay").hidden = true;
  quitarAceitesMotorDelCarrito();
  agregarOfertaDirecto(nuevoId);
  if (comboIdAbierto) {
    state.ofertaAbierta = comboIdAbierto;
    renderDetalleOferta();
  }
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
  if (carritoSoloFlota()) {
    quitarItem(id);
    return;
  }
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
    else if (state.origenAgenda === "flotas") {
      state.vista = state.flotaCategoriaId ? "flotas-servicios" : "flotas-categorias";
    } else {
      state.pasoAgenda = vehiculoOk() ? "servicio" : "filtro";
      state.vista = "agendamiento";
    }
    renderVista();
    return;
  }
  refrescarListasCotizacion();
  if (typeof refrescarVistaFlotaCliente === "function") refrescarVistaFlotaCliente();
  if (state.vista === "carrito-agenda" || state.vista === "agendamiento") renderVista();
}

function quitarOferta(id) {
  const s = oferta(id);
  if (s && typeof esServicioCombo === "function" && esServicioCombo(s)) {
    const ids = new Set(idsMiembrosCombo(s));
    const quitaAceiteSustituto = comboIncluyeAceiteMotor(s);
    state.carrito = state.carrito.filter((x) => {
      if (x.tipo !== "oferta") return true;
      if (ids.has(x.id)) return false;
      if (quitaAceiteSustituto) {
        const m = oferta(x.id);
        if (m && esAceiteMotorServicio(m)) return false;
      }
      return true;
    });
    persistir();
    renderTotales(true);
    refrescarListasCotizacion();
    if (state.vista === "carrito-agenda" || state.vista === "agendamiento") renderVista();
    return;
  }
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
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      return { ok: true, code: j.code || "", ticket_whatsapp_enviado: Boolean(j.ticket_whatsapp_enviado) };
    }
    console.warn("AutoNexus no recibió el ticket.", r.status, j.error || j.codigo || "");
    return {
      ok: false,
      error: j.error || "AutoNexus no aceptó el ticket.",
      codigo: j.codigo || "",
    };
  } catch (e) {
    console.warn("No se pudo avisar a AutoNexus.", e);
    return { ok: false, error: "No se pudo conectar con la agenda del taller." };
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
  if (carritoSoloFlota()) {
    const reg = await asegurarSolicitanteFlotaParaTicket({ requerir: true });
    if (!reg.ok) {
      alert(reg.error || "No se pudo guardar el solicitante. Revisa la conexión e inténtalo de nuevo.");
      return;
    }
    guardarClienteDesdeForma();
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
  if (carritoMixto()) {
    alert("El ticket mezcla flota y servicios particulares. Vacía el carrito e inténtalo de nuevo.");
    return;
  }
  const stockOk = await consumirStockParaTicket(items);
  if (!stockOk.ok) {
    alert(stockOk.error);
    return;
  }
  const soloFlota = carritoSoloFlota();
  const flotaId = soloFlota && typeof flotaIdDesdeCarrito === "function" ? flotaIdDesdeCarrito(state.carrito) : "";
  const flota = flotaId && typeof flotaPorId === "function" ? flotaPorId(flotaId) : null;
  const netoFlota = soloFlota ? items.reduce((n, s) => n + (Number(s.neto) || 0), 0) : 0;
  const borrador = {
    origen: "autodato_web",
    accion: soloFlota ? "crear_ticket" : "crear_ingreso",
    agendado: true,
    ticket_flota: soloFlota && typeof esTicketWebhookSalfa === "function" && esTicketWebhookSalfa(flotaId) ? "salfa" : "",
    canal_webhook: soloFlota && typeof flotaCanalWebhook === "function" ? flotaCanalWebhook(flota) : "",
    flota_id: flotaId || null,
    marca: state.vehiculo && state.vehiculo.marca,
    modelo: state.vehiculo && state.vehiculo.modelo,
    ano: state.vehiculo && state.vehiculo.ano,
    combustible: state.vehiculo && state.vehiculo.combustible,
    nombre_cliente: state.cliente.nombre.trim(),
    telefono: state.cliente.telefono.trim(),
    patente: state.cliente.patente.trim().toUpperCase() || null,
    correo: state.cliente.correo.trim() || null,
    sintoma: (state.cliente.sintoma || "").trim() || null,
    oc_pre: "",
    entrega_fecha: soloFlota ? state.entrega.fecha : "",
    entrega_hora: soloFlota ? state.entrega.hora : "",
    agenda_flota_libre: soloFlota && flotaAgendaLibreActiva(),
    fecha_cita: state.cita.fecha,
    hora: state.cita.hora,
    servicios: items.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      precio_lista: s.lista,
      precio: s.pagado,
      neto: s.neto,
      ahorro: s.ahorro,
      tipo: s.tipo,
    })),
    neto: soloFlota ? netoFlota : null,
    traslado:
      soloFlota && netoFlota >= TRASLADO_MIN_NETO_FLOTA && state.trasladoFlota ? "si" : soloFlota ? "no" : "",
    subtotal,
    ahorro,
    total,
    creado: new Date().toISOString(),
  };

  const autonexus = await enviarTicketAutonexus(borrador);
  if (!autonexus.ok) {
    if (autonexus.codigo === "SLOT_OCUPADO" || autonexus.codigo === "HORARIO_INVALIDO") {
      await refrescarAgendaAutonexus(true);
      state.cita.hora = "";
      await renderDatosAgenda({ forceAgenda: true });
    }
    alert(autonexus.error || "No se pudo agendar en AutoNexus. Elige otra fecha u hora.");
    return;
  }

  const code = autonexus.code || nuevoCodeTicket();
  const payload = { ...borrador, code, folio: code };
  llegoAgenda = true;

  if (soloFlota && flotaId) guardarHistorialClienteFlota(flotaId);

  const tickets = JSON.parse(localStorage.getItem("autodato_tickets") || "[]");
  tickets.unshift(payload);
  localStorage.setItem("autodato_tickets", JSON.stringify(tickets));
  if (typeof nubeActiva === "function" && nubeActiva()) {
    void nubeGuardarTicket(payload).catch((e) => {
      console.warn("El ticket quedó en este navegador, pero no en la nube.", e);
    });
  }

  vaciarCarritoTrasTicket();
  mostrarCargaTicket(false);
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Generar ticket y agendar";
  }
  await abrirTicket(payload);
  if (typeof refrescarCatalogoRemoto === "function") {
    void refrescarCatalogoRemoto().catch(() => {});
  }
  } finally {
    mostrarCargaTicket(false);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Generar ticket y agendar";
    }
  }
}

function vaciarCarritoTrasTicket() {
  const eraFlota = state.areaFlotas || carritoSoloFlota();
  state.carrito = [];
  state.servicioAgenda = null;
  state.ofertaAbierta = null;
  state.ofertaPendiente = null;
  state.cita = { fecha: "", hora: "" };
  state.pasoAgenda = "filtro";
  state.origenAgenda = "menu";
  state.cliente = { nombre: "", telefono: "", patente: "", correo: "", sintoma: "", solicitanteId: "" };
  state.entrega = { fecha: "", hora: "" };
  state.trasladoFlota = false;
  state.flotaActivaId = "";
  state.flotaCategoriaId = "";
  state.flotaPendienteId = "";
  state.areaFlotas = false;
  state.vista = eraFlota ? "portada" : "ofertas";
  persistir();
  renderTotales(false);
  syncAreaFlotasUi();
  renderVista({ quedarse: true });
}

function textoCompartirTicket(code, patente) {
  const c6 = String(code || "")
    .replace(/\D/g, "")
    .slice(-6);
  const pat = String(patente || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (c6 && pat) return `Ticket AutoDato · ${c6} · ${pat}`;
  if (c6) return `Ticket AutoDato · ${c6}`;
  if (pat) return `Ticket AutoDato · ${pat}`;
  return "Ticket AutoDato";
}

function textoCompartirTicketDesdeHoja() {
  const hoja = $("ticket-sheet");
  if (!hoja) return "Ticket AutoDato";
  const preset = hoja.getAttribute("data-share-text");
  if (preset) return preset;
  const code =
    hoja.getAttribute("data-ticket-code") ||
    (hoja.querySelector(".ticket-code-num") && hoja.querySelector(".ticket-code-num").textContent) ||
    "";
  const pat = hoja.getAttribute("data-ticket-patente") || "";
  return textoCompartirTicket(code, pat);
}

async function abrirTicket(payload) {
  const items = payload.servicios || [];
  const ticketFlota = Boolean(payload.flota_id || payload.neto != null);
  const netoTicket = ticketFlota
    ? Number(payload.neto) ||
      items.reduce((n, s) => n + (Number(s.neto) || 0), 0)
    : 0;
  const shareText = textoCompartirTicket(payload.code, payload.patente);
  $("ticket-contenido").innerHTML = `
    <div id="ticket-sheet" class="ticket-sheet" data-ticket-code="${escapeAttr(String(payload.code || "").trim())}" data-ticket-patente="${escapeAttr(String(payload.patente || "").trim())}" data-share-text="${escapeAttr(shareText)}">
      <div class="ticket-head">
        <img data-logo src="${logoHref()}" alt="AutoDato" />
      </div>
      <div class="ticket-body">
        <p class="muted">Ticket de visita</p>
        <div class="ticket-grid">
          <div>
            <p><strong>Cliente</strong><br />${payload.nombre_cliente}<br />${payload.telefono}${payload.correo ? "<br />" + payload.correo : ""}${payload.patente ? "<br />Patente " + payload.patente : ""}</p>
            <p><strong>Vehículo</strong><br />${payload.marca} ${payload.modelo} ${payload.ano}</p>
            ${
              payload.sintoma
                ? `<p><strong>Falla o síntoma</strong><br />${escapeHtml(payload.sintoma).replace(/\n/g, "<br />")}</p>`
                : ""
            }
            <p><strong>Cita</strong><br />${fechaBonita(payload.fecha_cita)} · ${payload.hora}</p>
          </div>
          <div class="ticket-qr-col">
            <div id="ticket-qr" class="ticket-qr"></div>
            <div class="ticket-code" data-ticket-code="${escapeAttr(String(payload.code || "").trim())}">
              <span class="ticket-code-etq">CODE</span>
              <span class="ticket-code-num">${escapeHtml(String(payload.code || "").trim())}</span>
            </div>
            <p class="muted ticket-qr-hint">QR de ingreso</p>
          </div>
        </div>
        <table class="ticket-table">
          ${items
            .map((s) => {
              const precio = ticketFlota
                ? s.neto != null && Number(s.neto) > 0
                  ? textoTotalNetoFlota(Number(s.neto))
                  : "A confirmar"
                : s.precio == null
                  ? "A confirmar"
                  : clp(s.precio);
              const extra =
                !ticketFlota && s.ahorro > 0
                  ? ` <span class="muted">(${clp(s.precio_lista)} − ${clp(s.ahorro)})</span>`
                  : "";
              return `<tr><td>${s.nombre}${extra}</td><td>${precio}</td></tr>`;
            })
            .join("")}
          ${
            ticketFlota
              ? `<tr><td>Total ticket</td><td>${textoTotalNetoFlota(netoTicket)}</td></tr>`
              : `<tr><td>Subtotal lista</td><td>${clp(payload.subtotal)}</td></tr>
          <tr><td>Ahorro</td><td>${clp(payload.ahorro)}</td></tr>
          <tr><td>Total</td><td>${clp(payload.total)}</td></tr>`
          }
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
  void pintarQrTicket(String(payload.code || "").trim());
}

async function pintarQrTicket(code) {
  const nodo = $("ticket-qr");
  if (!nodo) return;
  nodo.innerHTML = `<p class="muted ticket-qr-hint">Generando QR…</p>`;
  try {
    await asegurarLibsTicket();
    if (!window.QRCode) throw new Error("sin qrcode");
    nodo.innerHTML = "";
    new QRCode(nodo, {
      text: String(code || "").trim(),
      width: 240,
      height: 240,
      correctLevel: QRCode.CorrectLevel.L,
    });
  } catch (e) {
    nodo.innerHTML = `<p class="muted ticket-qr-hint">No se pudo cargar el QR. Usa el código numérico.</p>`;
  }
}

function cargarScriptTicket(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.body.appendChild(s);
  });
}

async function asegurarLibsTicket() {
  await Promise.all([
    cargarScriptTicket("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"),
    cargarScriptTicket("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
  ]);
}

async function fotoDelTicket() {
  const hoja = $("ticket-sheet");
  if (!hoja) throw new Error("sin ticket");
  await asegurarLibsTicket();
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
  const codeEl = hoja.querySelector(".ticket-code");
  const code = String(
    (codeEl && codeEl.getAttribute("data-ticket-code")) ||
      (codeEl && codeEl.querySelector(".ticket-code-num") && codeEl.querySelector(".ticket-code-num").textContent) ||
      (codeEl && codeEl.textContent) ||
      ""
  )
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

async function compartirArchivo(file, text) {
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return false;
  const msg = String(text || textoCompartirTicketDesdeHoja() || "Ticket AutoDato").trim();
  await navigator.share({
    files: [file],
    title: "Ticket AutoDato",
    text: msg,
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
      if (await compartirArchivo(file, textoCompartirTicketDesdeHoja())) return;
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
    const shareText = textoCompartirTicketDesdeHoja();
    if (await compartirArchivo(file, shareText)) return;
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
  if ($("modal-sustituir-aceite")) $("modal-sustituir-aceite").hidden = true;
  $("modal-informe").hidden = true;
  if ($("modal-auto")) $("modal-auto").hidden = true;
  cerrarModalContacto();
  quitarPendiente = null;
  sustituirAceitePendiente = null;
  marcarMenu();
  syncSeguirKpi();
  pintarChipAuto();
  syncTecladoFicha();
}

function guardarClienteDesdeForma() {
  if ($("c-nombre")) state.cliente.nombre = $("c-nombre").value;
  if ($("c-telefono")) state.cliente.telefono = $("c-telefono").value;
  if ($("c-patente")) state.cliente.patente = $("c-patente").value.toUpperCase();
  if ($("c-sintoma")) state.cliente.sintoma = $("c-sintoma").value;
  if ($("c-correo")) state.cliente.correo = $("c-correo").value;
  if (carritoSoloFlota()) sincronizarSolicitanteIdDesdeNombreFlota();
  if ($("c-entrega-fecha")) state.entrega.fecha = $("c-entrega-fecha").value;
  if ($("c-entrega-hora")) state.entrega.hora = $("c-entrega-hora").value;
  if (carritoSoloFlota()) normalizarEntregaFlotaEnState();
  persistir();
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".dd")) cerrarDrops();
  const t = e.target.closest(
    "[data-vista], [data-open], [data-close], [data-abrir-oferta], [data-add-oferta], [data-add-diag], [data-quitar-oferta], [data-pedir-quitar], [data-confirmar-quitar], [data-cerrar-quitar], [data-confirmar-sustituir-aceite], [data-cerrar-sustituir-aceite], [data-cerrar-informe], [data-editar-auto], [data-cerrar-auto], [data-filtrar], [data-dia], [data-hora], [data-cal], [data-cerrar-horas], [data-abrir-kpi], [data-cerrar-kpi], [data-kpi], [data-seguir-explorando], [data-dd-toggle], [data-dd-pick], [data-guardar-ticket], [data-compartir-ticket], [data-portada-oferta], [data-volver-catalogo], [data-flota-categoria], [data-flota-servicio], [data-add-flota], [data-quitar-flota], [data-atencion-inmediata-flota], #btn-ticket, #btn-flota-pin-ingresar, #btn-flota-atras, #chip-auto"
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
    if (
      VISTAS_CATALOGO_PARTICULAR.includes(t.dataset.vista) &&
      t.dataset.vista !== "portada" &&
      carritoTieneFlota()
    ) {
      bloquearNavegacionParticularConCarritoFlota();
      return;
    }
    if (t.dataset.vista === "portada" && carritoTieneFlota()) {
      bloquearNavegacionParticularConCarritoFlota();
      return;
    }
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
        state.origenAgenda = origenAgendaDesdeCarrito();
        state.pasoAgenda = "datos";
      } else {
        state.origenAgenda = "menu";
        state.pasoAgenda = vehiculoOk() ? (state.servicioAgenda ? "datos" : "servicio") : "filtro";
      }
    } else if (t.dataset.vista === "carrito-agenda") {
      state.vistaAnterior = state.vista;
      state.vista = "carrito-agenda";
      state.origenAgenda = "ofertas";
      renderVista();
    } else     if (state.areaFlotas && t.dataset.vista !== "flotas") {
      return;
    }
    if (t.dataset.vista === "flotas") {
      void abrirVistaFlotas();
    } else if (["ofertas", "mantencion", "diagnostico"].includes(t.dataset.vista)) {
      void abrirVistaCatalogo(t.dataset.vista);
    } else {
      state.vista = t.dataset.vista;
      renderVista();
    }
    if (t.dataset.vista !== "portada") cerrarModalHoras();
  }

  if (t.hasAttribute("data-abrir-kpi")) irAAgendaDesdeKpi();
  if (t.hasAttribute("data-cerrar-kpi")) cerrarModalKpi();
  if (t.dataset.kpi === "ticket") irAAgendaDesdeKpi();
  if (t.dataset.kpi === "explorar") seguirExplorandoOfertas();
  if (t.hasAttribute("data-seguir-explorando")) seguirExplorandoOfertas();
  if (t.dataset.open === "informe") {
    if (state.areaFlotas) return;
    abrirModalInforme();
  }
  if (t.hasAttribute("data-cerrar-informe")) cerrarModalInforme();
  if (t.id === "chip-auto" || t.hasAttribute("data-editar-auto")) abrirModalAuto();
  if (t.hasAttribute("data-cerrar-auto")) cerrarModalAuto();
  if (t.hasAttribute("data-close")) cerrar();
  if (t.hasAttribute("data-guardar-ticket")) descargarTicket();
  if (t.hasAttribute("data-compartir-ticket")) compartirTicket();
  if (t.dataset.portadaOferta) void iniciarOfertaDesdePortada(t.dataset.portadaOferta);
  if (t.hasAttribute("data-cerrar-horas")) cerrarModalHoras();
  if (t.hasAttribute("data-cerrar-quitar")) cerrarModalQuitar();
  if (t.hasAttribute("data-confirmar-quitar")) confirmarQuitar();
  if (t.hasAttribute("data-cerrar-sustituir-aceite")) cerrarModalSustituirAceite();
  if (t.hasAttribute("data-confirmar-sustituir-aceite")) confirmarSustituirAceite();
  if (t.dataset.pedirQuitar) pedirQuitar(t.dataset.pedirQuitar);
  if (t.hasAttribute("data-volver-catalogo")) volverAlCatalogoDesdeDetalle();
  if (t.dataset.abrirOferta) {
    void ensureCatalogoCliente()
      .then(() => intentarAbrirOferta(t.dataset.abrirOferta))
      .catch(() => alert("No pudimos cargar el catálogo. Reintenta."));
  }
  if (t.dataset.addOferta) {
    void ensureCatalogoCliente()
      .then(() => agregarOferta(t.dataset.addOferta))
      .catch(() => alert("No pudimos cargar el catálogo. Reintenta."));
  }
  if (t.dataset.addDiag) agregarDiagnostico(t.dataset.addDiag);
  if (t.dataset.flotaCategoria) {
    state.flotaCategoriaId = t.dataset.flotaCategoria;
    state.flotaServicioDetalleId = "";
    state.vista = "flotas-servicios";
    renderVista();
  }
  if (t.dataset.flotaServicio && typeof abrirDetalleServicioFlota === "function") {
    abrirDetalleServicioFlota(t.dataset.flotaServicio);
  }
  if (t.dataset.addFlota) {
    const [fid, sid] = String(t.dataset.addFlota || "").split("|");
    if (fid && sid) agregarServicioFlotaAlCarrito(fid, sid);
  }
  if (t.dataset.quitarFlota) {
    const [fid, sid] = String(t.dataset.quitarFlota || "").split("|");
    if (fid && sid && typeof quitarServicioFlotaDelCarrito === "function") {
      quitarServicioFlotaDelCarrito(fid, sid);
    }
  }
  if (t.id === "btn-flota-pin-ingresar") void intentarPinFlota();
  if (t.id === "btn-flota-atras" && typeof atrasNavegacionFlota === "function") atrasNavegacionFlota();
  if (t.hasAttribute("data-atencion-inmediata-flota")) void elegirAtencionInmediataFlota();
  if (t.dataset.quitarOferta) quitarOferta(t.dataset.quitarOferta);
  if (t.dataset.filtrar) void aplicarFiltro(t.dataset.filtrar);

  if (t.dataset.dia) {
    state.cita.fecha = t.dataset.dia;
    state.cita.hora = "";
    guardarClienteDesdeForma();
    persistir();
    renderDatosAgenda().then(() => abrirModalHoras(t.dataset.dia));
  }
  if (t.dataset.hora) {
    state.cita.hora = t.dataset.hora;
    guardarClienteDesdeForma();
    persistir();
    cerrarModalHoras();
    renderDatosAgenda({ scrollToTicket: true });
  }
  if (t.dataset.cal) {
    const next = new Date(state.cal.y, state.cal.m + Number(t.dataset.cal), 1);
    state.cal = { y: next.getFullYear(), m: next.getMonth() };
    guardarClienteDesdeForma();
    renderDatosAgenda({ forceAgenda: true });
  }
  if (t.id === "btn-ticket") generarTicket();
});

$("overlay").addEventListener("click", () => {
  if ($("modal-sustituir-aceite") && !$("modal-sustituir-aceite").hidden) {
    cerrarModalSustituirAceite();
    return;
  }
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
if ($("modal-sustituir-aceite")) {
  $("modal-sustituir-aceite").addEventListener("click", (e) => {
    if (e.target.id === "modal-sustituir-aceite") cerrarModalSustituirAceite();
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

window.addEventListener("focus", () => {
  void (async () => {
    if (typeof refrescarDatosInicioEnFondo === "function") {
      await refrescarDatosInicioEnFondo();
      if (state.vista === "portada") {
        aplicarLogos();
        renderPortada();
      }
      reaplicarVistaTrasCatalogo();
    }
  })();
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

function pistaMenuDesplazable() {
  const menu = $("menu-principal");
  if (!menu || window.innerWidth > 860) return;
  if (menu.scrollWidth <= menu.clientWidth + 12) return;

  const peek = menu.clientWidth * 0.125;
  let cancelado = false;
  const fin = () => {
    cancelado = true;
    menu.classList.remove("menu-hint");
    menu.scrollLeft = 0;
  };
  menu.addEventListener("pointerdown", fin, { once: true });

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  function animScroll(desde, hasta, ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (cancelado) return resolve();
        const p = Math.min(1, (now - t0) / ms);
        menu.scrollLeft = desde + (hasta - desde) * ease(p);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  void (async () => {
    await new Promise((r) => setTimeout(r, 350));
    if (cancelado) return;
    menu.classList.add("menu-hint");
    for (let i = 0; i < 2 && !cancelado; i++) {
      await animScroll(menu.scrollLeft, peek, 420);
      await animScroll(menu.scrollLeft, 0, 520);
      if (i < 1) await new Promise((r) => setTimeout(r, 90));
    }
    fin();
  })();
}

if ($("modal-contacto")) {
  $("modal-contacto").addEventListener("click", (e) => {
    if (e.target.id === "modal-contacto" || e.target.closest("[data-cerrar-contacto]")) {
      cerrarModalContacto();
    }
  });
}
if ($("contacto-copiar")) {
  $("contacto-copiar").addEventListener("click", async () => {
    const texto = textoContacto(holdContacto.tipo);
    try {
      await copiarTextoPlano(texto);
      $("contacto-copiar").textContent = "Copiado";
    } catch (err) {
      alert("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  });
}

const stageEl = $("stage");
if (stageEl) {
  stageEl.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!t || !IDS_CAMPOS_AGENDA.includes(t.id)) return;
    document.body.classList.add("teclado-abierto");
    setTimeout(syncTecladoViewport, 60);
    setTimeout(syncTecladoViewport, 320);
  });
  stageEl.addEventListener("focusout", (e) => {
    if (IDS_CAMPOS_AGENDA.includes(e.target.id)) setTimeout(syncTecladoViewport, 150);
  });
}

function tokenFlotaAccesoDesdeQuery() {
  return new URLSearchParams(location.search).get("flota_acceso") || "";
}

function limpiarQueryFlotaAccesoEnHistorial() {
  if (typeof history === "undefined" || !history.replaceState) return;
  const u = new URL(location.href);
  if (!u.searchParams.has("flota_acceso")) return;
  u.searchParams.delete("flota_acceso");
  const qs = u.searchParams.toString();
  history.replaceState(history.state, "", u.pathname + (qs ? `?${qs}` : "") + u.hash);
}

async function arrancar() {
  if (typeof hidratarModelosExtra === "function") hidratarModelosExtra();
  if (typeof hidratarFotosModelos === "function") hidratarFotosModelos();
  if (typeof hidratarTablero === "function") hidratarTablero();
  if (typeof hidratarPortadaLocal === "function") hidratarPortadaLocal();
  if (typeof hidratarCatalogoClienteLocal === "function") hidratarCatalogoClienteLocal();
  hidratar();
  const flotaAcceso = tokenFlotaAccesoDesdeQuery();
  const entrada = aplicarVehiculoDesdeUrlAlInicio();
  pintarDatosFicha();
  renderVista({ quedarse: true });
  aplicarLogos();
  renderTotales(false);
  pistaMenuDesplazable();
  void asegurarLibsTicket().catch(() => {});
  if (flotaAcceso && typeof entrarFlotaPorLinkAcceso === "function") {
    void entrarFlotaPorLinkAcceso(flotaAcceso).then((ok) => {
      if (ok) limpiarQueryFlotaAccesoEnHistorial();
    });
  }
  if (entrada.servicioId) void abrirPromocionDesdeUrl(entrada.servicioId);
  void (async () => {
    if (typeof refrescarDatosInicioEnFondo === "function") {
      await refrescarDatosInicioEnFondo();
    }
    if (typeof asegurarCatalogoParaPortada === "function") {
      try {
        await asegurarCatalogoParaPortada();
      } catch (e) {
        /* local */
      }
    }
    if (state.vista === "portada") {
      aplicarLogos();
      renderPortada();
    }
    reaplicarVistaTrasCatalogo();
  })();
}

arrancar();
