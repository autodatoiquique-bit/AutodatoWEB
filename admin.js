const PIN_KEY = "autodato_admin_pin";
const SESION_KEY = "autodato_admin_ok";

const $ = (id) => document.getElementById(id);

let editando = null;
let comboEditIndex = -1;
let slideEditIndex = 0;
let mediaEditIndex = 0;
let fotoModeloPendiente = "";
let colFotoPendiente = "";
let columnaEditId = "";
let ofertaDraft = null;
let tarjetaColId = "";
let tarjetaSeleccion = new Set();

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
  else renderTablero();
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
    vehiculos: [
      {
        marca: MARCAS[0],
        modelo: modelosDe(MARCAS[0])[0],
        combustible: "diesel",
        ano_desde: ANIO_MIN,
        ano_hasta: ANIO_MAX,
      },
    ],
    dots_x: 50,
    dots_y: 62,
    complementos: [],
    activo: true,
    tiempo_min: null,
    mano_obra: 0,
    insumos: [],
  };
}

function vehiculosDeColumna(col) {
  return [
    {
      marca: col.marca,
      modelo: col.modelo,
      ano_desde: col.ano_desde,
      ano_hasta: col.ano_hasta,
      combustible: col.combustible || "ambos",
    },
  ];
}

function htmlOpcionesCombustible(sel) {
  return COMBUSTIBLES.map(
    (c) => `<option value="${c.value}" ${normalizarCombustible(sel) === c.value ? "selected" : ""}>${c.label}</option>`
  ).join("");
}

function htmlCamposColumna(col, id) {
  const marca = (col && col.marca) || MARCAS[0];
  const modelos = modelosDe(marca);
  const modelo = (col && col.modelo) || modelos[0];
  const adelante = !col || anioONull(col.ano_hasta) == null;
  const desde = anioONull(col && col.ano_desde) || ANIO_MIN;
  const hasta = anioONull(col && col.ano_hasta) || ANIO_MAX;
  return `
    <label class="field"><span>Marca</span>
      <select data-col-campo="marca" data-col-id="${id}">${MARCAS.map((m) => `<option value="${m}" ${m === marca ? "selected" : ""}>${m}</option>`).join("")}</select>
    </label>
    <label class="field"><span>Modelo</span>
      <select data-col-campo="modelo" data-col-id="${id}">${modelos.map((m) => `<option value="${m}" ${m === modelo ? "selected" : ""}>${m}</option>`).join("")}</select>
    </label>
    <label class="field"><span>Desde el año</span>
      <select data-col-campo="desde" data-col-id="${id}">${htmlOpcionesAnio(desde)}</select>
    </label>
    <label class="field"><span>Hasta el año</span>
      <select data-col-campo="hasta" data-col-id="${id}" ${adelante ? "disabled" : ""}>${htmlOpcionesAnio(hasta)}</select>
    </label>
    <label class="check"><input type="checkbox" data-col-campo="adelante" data-col-id="${id}" ${adelante ? "checked" : ""} /> En adelante (sin tope)</label>
    <label class="field"><span>Combustible</span>
      <select data-col-campo="combustible" data-col-id="${id}">${htmlOpcionesCombustible(col && col.combustible)}</select>
    </label>
  `;
}

function leerCamposColumna(id) {
  const q = (campo) => document.querySelector(`[data-col-campo="${campo}"][data-col-id="${id}"]`);
  const adelante = Boolean(q("adelante") && q("adelante").checked);
  return {
    marca: q("marca") && q("marca").value,
    modelo: q("modelo") && q("modelo").value,
    ano_desde: q("desde") ? Number(q("desde").value) : ANIO_MIN,
    ano_hasta: adelante ? null : q("hasta") ? Number(q("hasta").value) : ANIO_MAX,
    combustible: q("combustible") && q("combustible").value,
  };
}

async function guardarTableroNube() {
  persistirTablero();
  if (typeof nubeActiva === "function" && nubeActiva()) {
    await nubeGuardarCatalogoCanales(catalogo);
  }
}

function htmlTarjetaKanbanServicio(s) {
  const normal = typeof valorNormalDe === "function" ? valorNormalDe(s) : s.precio;
  const oferta = Number(s.precio_oferta) > 0 ? Number(s.precio_oferta) : null;
  const uN = typeof utilidadDe === "function" ? utilidadDe(normal, s) : null;
  const uO = oferta != null && typeof utilidadDe === "function" ? utilidadDe(oferta, s) : null;
  return `<button class="kanban-card" type="button" data-kanban-servicio="${s.id}">
    <div class="kanban-cover">${s.foto ? `<img src="${s.foto}" alt="" />` : ""}</div>
    <div class="kanban-body">
      <strong>${escapeText(s.nombre || "Sin nombre")}</strong>
      <div class="kanban-kpis">
        <div>
          <span>Normal</span>
          <b>${clp(normal)}</b>
          <em${uN != null && uN < 0 ? ` class="is-bad"` : ""}>Utilidad ${uN == null ? "—" : clp(uN)}</em>
        </div>
        <div>
          <span>Oferta</span>
          <b>${oferta != null ? clp(oferta) : "—"}</b>
          <em${uO != null && uO < 0 ? ` class="is-bad"` : ""}>${uO == null ? "Sin oferta" : `Utilidad ${clp(uO)}`}</em>
        </div>
        <div>
          <span>Tiempo</span>
          <b>${etiquetaTiempo(s.tiempo_min)}</b>
        </div>
      </div>
    </div>
  </button>`;
}

function htmlTarjetaKanbanPortada(s, i) {
  return `<button class="kanban-card" type="button" data-kanban-portada="${s.id}">
    <div class="kanban-cover">${s.foto ? `<img src="${s.foto}" alt="" />` : ""}</div>
    <div class="kanban-body">
      <strong>Portada</strong>
      <span>Flyer ${i + 1}${s.mostrar_boton ? " · con botón" : ""}</span>
    </div>
  </button>`;
}

function htmlColumnaKanban(col) {
  const foto = fotoPortadaColumna(col);
  const portadas = (portadaSlides || [])
    .map((s, i) => ({ s, i }))
    .filter((x) => itemEnColumna(x.s, col));
  const servicios = (catalogo || []).filter((s) => itemEnColumna(s, col));
  return `
    <section class="kanban-col">
      <div class="kanban-apex">
        <div class="kanban-apex-foto">${foto ? `<img src="${foto}" alt="" />` : ""}</div>
        <div class="kanban-apex-meta">
          <strong>${tituloColumna(col)}</strong>
          <span>${etiquetaCombustible(col.combustible)}</span>
        </div>
        <button class="kanban-gear" type="button" data-kanban-config="${col.id}" title="Configurar columna" aria-label="Configurar columna">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.1 12.9a7.6 7.6 0 0 0 .1-.9 7.6 7.6 0 0 0-.1-.9l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.5-.9l-.4-2.6h-4l-.4 2.6a7.4 7.4 0 0 0-1.5.9l-2.5-1-2 3.4 2.1 1.6a7.6 7.6 0 0 0-.1.9 7.6 7.6 0 0 0 .1.9L2.8 14.5l2 3.4 2.5-1c.5.3 1 .7 1.5.9l.4 2.6h4l.4-2.6c.5-.2 1.1-.5 1.5-.9l2.5 1 2-3.4-2.1-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>
        </button>
      </div>
      <div class="kanban-cards">
        ${portadas.map((x) => htmlTarjetaKanbanPortada(x.s, x.i)).join("")}
        ${servicios.map(htmlTarjetaKanbanServicio).join("")}
        ${!portadas.length && !servicios.length ? `<p class="kanban-vacio">Sin promociones para este auto.</p>` : ""}
      </div>
      <div class="kanban-add">
        <button type="button" class="kanban-add-card" data-kanban-tarjeta="${col.id}">Añadir tarjeta</button>
      </div>
    </section>
  `;
}

function pintarCarnetColumna(col) {
  const img = $("col-carnet-img");
  const vacio = $("col-carnet-vacio");
  const src = col ? fotoPortadaColumna(col) : "";
  if (img) {
    img.hidden = !src;
    if (src) img.src = src;
  }
  if (vacio) vacio.hidden = Boolean(src);
}

function abrirModalColumna(id) {
  const col = TABLERO_COLUMNAS.find((c) => c.id === id);
  if (!col || !$("modal-columna") || !$("col-campos")) return;
  columnaEditId = id;
  $("col-campos").innerHTML = htmlCamposColumna(col, id);
  pintarCarnetColumna(col);
  $("modal-columna").hidden = false;
}

function cerrarModalColumna() {
  columnaEditId = "";
  if ($("modal-columna")) $("modal-columna").hidden = true;
}

function htmlKpisOferta(s) {
  const neto = netoServicioDe(s);
  const iva = ivaDeNeto(neto);
  const normal = valorNormalDe(s);
  const oferta = Number(s && s.precio_oferta) > 0 ? Number(s.precio_oferta) : null;
  const uN = utilidadDe(normal, s);
  const uO = oferta != null ? utilidadDe(oferta, s) : null;
  return `
    <div class="kpi-oferta">
      <div>
        <span>Neto ${clp(neto)}</span>
        <span>IVA 19% ${clp(iva)}</span>
        <span>Total</span>
        <strong>${clp(normal)}</strong>
        <em class="${uN < 0 ? "is-bad" : ""}">Utilidad ${clp(uN)}</em>
      </div>
      <div>
        <span>Valor oferta</span>
        <strong>${oferta != null ? clp(oferta) : "—"}</strong>
        <em class="${uO != null && uO < 0 ? "is-bad" : ""}">Utilidad ${uO != null ? clp(uO) : "—"}</em>
      </div>
      <div>
        <span>Tiempo aproximado</span>
        <strong>${etiquetaTiempo(s && s.tiempo_min)}</strong>
      </div>
    </div>
  `;
}

function htmlFilasInsumos(lista) {
  const rows = lista || [];
  if (!rows.length) return `<p class="muted">Todavía no hay insumos. Agrégalos con su costo y el porcentaje de margen.</p>`;
  return rows
    .map(
      (ins, i) => `
      <div class="insumo-row">
        <input data-ins-nombre="${i}" type="text" placeholder="Insumo" value="${escapeAttr(ins.nombre)}" />
        <input data-ins-costo="${i}" type="number" min="0" step="100" placeholder="Costo" value="${ins.costo || ""}" />
        <input data-ins-pct="${i}" type="number" min="0" step="1" placeholder="%" value="${ins.porcentaje}" />
        <span>${clp(ventaInsumo(ins))}</span>
        <button type="button" data-ins-del="${i}" title="Quitar insumo">×</button>
      </div>
    `
    )
    .join("");
}

function leerModalOferta() {
  if (!ofertaDraft) return;
  if ($("o-nombre")) ofertaDraft.nombre = $("o-nombre").value.trim();
  if ($("o-mano")) ofertaDraft.mano_obra = $("o-mano").value === "" ? 0 : Number($("o-mano").value);
  if ($("o-tiempo")) ofertaDraft.tiempo_min = $("o-tiempo").value ? Number($("o-tiempo").value) : null;
  const oferta = $("o-oferta") ? $("o-oferta").value : "";
  ofertaDraft.precio_oferta = oferta !== "" ? Number(oferta) : null;
  ofertaDraft.tiene_oferta = Number(ofertaDraft.precio_oferta) > 0;
  ofertaDraft.insumos = [...document.querySelectorAll("#o-insumos .insumo-row")].map((row, i) =>
    normalizarInsumo(
      {
        id: ofertaDraft.insumos[i] && ofertaDraft.insumos[i].id,
        nombre: row.querySelector("[data-ins-nombre]") && row.querySelector("[data-ins-nombre]").value,
        costo: row.querySelector("[data-ins-costo]") && row.querySelector("[data-ins-costo]").value,
        porcentaje: row.querySelector("[data-ins-pct]") && row.querySelector("[data-ins-pct]").value,
      },
      i
    )
  );
  ofertaDraft.precio = valorNormalDe(ofertaDraft);
}

function pintarModalOferta() {
  if (!$("oferta-kpis") || !ofertaDraft) return;
  $("oferta-kpis").innerHTML = htmlKpisOferta(ofertaDraft);
  if ($("o-insumos")) $("o-insumos").innerHTML = htmlFilasInsumos(ofertaDraft.insumos);
  pintarDesgloseIva(ofertaDraft);
}

function pintarDesgloseIva(s) {
  const neto = netoServicioDe(s);
  const iva = ivaDeNeto(neto);
  const total = valorNormalDe(s);
  if ($("o-neto")) $("o-neto").textContent = clp(neto);
  if ($("o-iva")) $("o-iva").textContent = clp(iva);
  if ($("o-normal")) $("o-normal").textContent = clp(total);
}

function abrirModalOferta(base) {
  ofertaDraft = normalizarServicio(
    JSON.parse(
      JSON.stringify(
        base || {
          ...servicioVacio(),
          canales: { ofertas: true, mantencion: false, diagnostico: false },
        }
      )
    )
  );
  if (!$("modal-oferta")) return;
  if ($("oferta-modal-titulo")) $("oferta-modal-titulo").textContent = "Calculadora del servicio";
  if ($("o-nombre")) $("o-nombre").value = ofertaDraft.nombre || "";
  if ($("o-mano")) $("o-mano").value = ofertaDraft.mano_obra || "";
  if ($("o-oferta")) $("o-oferta").value = Number(ofertaDraft.precio_oferta) > 0 ? ofertaDraft.precio_oferta : "";
  if ($("o-tiempo")) $("o-tiempo").innerHTML = htmlOpcionesTiempo(ofertaDraft.tiempo_min);
  pintarModalOferta();
  $("modal-oferta").hidden = false;
}

function cerrarModalOferta() {
  ofertaDraft = null;
  if ($("modal-oferta")) $("modal-oferta").hidden = true;
}

function guardarModalOferta() {
  leerModalOferta();
  ofertaDraft.precio = valorNormalDe(ofertaDraft);
  if (ofertaDraft.tiene_oferta && ofertaDraft.precio && ofertaDraft.precio_oferta >= ofertaDraft.precio) {
    alert("El precio oferta tiene que ser menor que el valor normal.");
    return;
  }
  if (editando) {
    editando.mano_obra = ofertaDraft.mano_obra;
    editando.insumos = ofertaDraft.insumos;
    editando.tiempo_min = ofertaDraft.tiempo_min;
    editando.precio = ofertaDraft.precio;
    if (Number(ofertaDraft.precio_oferta) > 0) {
      editando.precio_oferta = ofertaDraft.precio_oferta;
      editando.tiene_oferta = true;
    }
    if (ofertaDraft.nombre && !editando.nombre) editando.nombre = ofertaDraft.nombre;
    cerrarModalOferta();
    renderEditor();
    return;
  }
  cerrarModalOferta();
}

function abrirModalTarjeta(colId) {
  tarjetaColId = colId;
  tarjetaSeleccion = new Set();
  if ($("tarjeta-busca")) $("tarjeta-busca").value = "";
  pintarListaTarjeta("");
  if ($("modal-tarjeta")) $("modal-tarjeta").hidden = false;
}

function cerrarModalTarjeta() {
  tarjetaColId = "";
  tarjetaSeleccion = new Set();
  if ($("modal-tarjeta")) $("modal-tarjeta").hidden = true;
}

function pintarAceptarTarjeta() {
  const btn = $("btn-tarjeta-aceptar");
  if (!btn) return;
  const n = tarjetaSeleccion.size;
  btn.disabled = n === 0;
  btn.textContent = n > 1 ? `Aceptar (${n})` : "Aceptar";
}

function pintarListaTarjeta(q) {
  const lista = $("tarjeta-lista");
  if (!lista) return;
  const col = TABLERO_COLUMNAS.find((c) => c.id === tarjetaColId);
  const t = String(q || "").toLowerCase().trim();
  const items = (catalogo || []).filter((s) => {
    if (col && itemEnColumna(s, col)) return false;
    return !t || String(s.nombre || "").toLowerCase().includes(t);
  });
  lista.innerHTML =
    items
      .map((s) => {
        const on = tarjetaSeleccion.has(s.id);
        return `<label class="tarjeta-item${on ? " is-on" : ""}" data-tarjeta-serv="${s.id}">
          <input type="checkbox" ${on ? "checked" : ""} />
          <span class="tarjeta-check" aria-hidden="true"></span>
          <span class="tarjeta-item-txt">
            <strong>${escapeText(s.nombre || "Sin nombre")}</strong>
            <span>${clp(s.precio)}${s.tiempo_min ? ` · ${etiquetaTiempo(s.tiempo_min)}` : ""} · ${etiquetaCanales(s)}</span>
          </span>
        </label>`;
      })
      .join("") ||
    `<p class="muted">${
      t ? "No hay servicios con ese nombre." : "Todos los servicios de esta lista ya están en la columna."
    }</p>`;
  pintarAceptarTarjeta();
}

function sumarDestinoAServicio(s, dest) {
  if (!s || !dest) return;
  const actuales = normalizarVehiculos(s.vehiculos);
  const ya = actuales.some(
    (v) =>
      v.marca === dest.marca &&
      v.modelo === dest.modelo &&
      combustibleCoincide(v.combustible, dest.combustible) &&
      aniosSeSolapan(v, dest)
  );
  if (!ya) s.vehiculos = [...actuales, dest];
}

async function asignarServiciosAColumna(sids, colId) {
  const col = TABLERO_COLUMNAS.find((c) => c.id === colId);
  if (!col || !sids.length) return;
  const dest = vehiculosDeColumna(col)[0];
  if (!dest) return;
  let n = 0;
  sids.forEach((sid) => {
    const s = catalogo.find((x) => x.id === sid);
    if (!s) return;
    sumarDestinoAServicio(s, dest);
    n += 1;
  });
  if (!n) return;
  try {
    await guardarCatalogo(catalogo);
  } catch (e) {
    alert((e && e.message) || "No se pudieron agregar las tarjetas.");
    return;
  }
  cerrarModalTarjeta();
  renderTablero();
}

function aplicarFotoColumna(col, src) {
  if (!col || !src) return;
  col.foto = src;
  FOTOS_MODELOS[claveVehiculo(col.marca, col.modelo)] = src;
  persistirFotosModelos();
}

function htmlFormColumna() {
  return `
    <section class="kanban-col kanban-col-add">
      <h3>Nueva columna</h3>
      <p>Marca, modelo, años y combustible. La foto de arriba es la portada de ese auto.</p>
      ${htmlCamposColumna(null, "nueva")}
      <button class="btn-primary btn-block" type="button" id="btn-col-add">Agregar columna</button>
    </section>
  `;
}

function renderTablero() {
  editando = null;
  hidratarTablero();
  const sembrar = !TABLERO_COLUMNAS.length;
  if (sembrar) sembrarColumnasTablero();
  $("stage").classList.add("stage-board");
  $("stage").innerHTML = `
    <div class="kanban">
      <div class="kanban-top">
        <div>
          <h2>Tablero de promociones</h2>
          <p>Cada columna es un auto: marca, modelo, años y combustible. Arriba va la foto de portada de ese modelo.</p>
        </div>
      </div>
      <div class="kanban-track">
        ${TABLERO_COLUMNAS.map(htmlColumnaKanban).join("")}
        ${htmlFormColumna()}
      </div>
    </div>
  `;
  renderLista();
  if (sembrar) guardarTableroNube();
}

async function agregarColumnaTablero() {
  const raw = leerCamposColumna("nueva");
  if (!raw.marca || !raw.modelo) {
    alert("Elige marca y modelo.");
    return;
  }
  const col = normalizarColumnaTablero({
    id: `col-${Date.now()}`,
    ...raw,
  });
  if (TABLERO_COLUMNAS.some((c) => claveColumnaTablero(c) === claveColumnaTablero(col))) {
    alert("Esa columna ya está en el tablero.");
    return;
  }
  TABLERO_COLUMNAS.push(col);
  try {
    await guardarTableroNube();
  } catch (e) {
    alert((e && e.message) || "No se pudo guardar la columna.");
  }
  renderTablero();
}

async function guardarColumnaTablero(id) {
  const i = TABLERO_COLUMNAS.findIndex((c) => c.id === id);
  if (i < 0) return;
  const raw = leerCamposColumna(id);
  if (!raw.marca || !raw.modelo) {
    alert("Elige marca y modelo.");
    return;
  }
  const previa = TABLERO_COLUMNAS[i];
  TABLERO_COLUMNAS[i] = normalizarColumnaTablero({
    ...previa,
    ...raw,
    id,
    foto: previa.foto,
  });
  if (previa.foto) aplicarFotoColumna(TABLERO_COLUMNAS[i], previa.foto);
  try {
    await guardarTableroNube();
  } catch (e) {
    alert((e && e.message) || "No se pudo guardar la columna.");
    return;
  }
  cerrarModalColumna();
  renderTablero();
}

function nuevoServicioEnColumna(id) {
  const col = TABLERO_COLUMNAS.find((c) => c.id === id);
  editando = servicioVacio();
  if (col) editando.vehiculos = vehiculosDeColumna(col);
  mediaEditIndex = 0;
  $("stage").classList.remove("stage-board");
  renderEditor();
}

async function nuevaPortadaEnColumna(id) {
  const col = TABLERO_COLUMNAS.find((c) => c.id === id);
  await cargarPortada();
  const s = slideVacio(portadaSlides.length);
  if (col) s.vehiculos = vehiculosDeColumna(col);
  portadaSlides.push(s);
  slideEditIndex = portadaSlides.length - 1;
  editando = null;
  $("stage").classList.remove("stage-board");
  renderEditorPortada();
}

async function abrirPortadaDesdeTablero(id) {
  await cargarPortada();
  const i = portadaSlides.findIndex((s) => s.id === id);
  if (i < 0) {
    abrirEditorPortada();
    return;
  }
  slideEditIndex = i;
  editando = null;
  $("stage").classList.remove("stage-board");
  renderEditorPortada();
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
            <span>${etiquetaCanales(s)} · ${clp(s.precio)} · ${etiquetaVehiculos(s)}</span>
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
  leerCostosEditor();
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
  editando.vehiculos = leerVehiculosEditor();
}

function leerAnioCampo(sel) {
  if (!sel || sel.value === "") return null;
  const n = Number(sel.value);
  return Number.isFinite(n) ? n : null;
}

function destinoVacio() {
  const marca = MARCAS[0];
  return {
    marca,
    modelo: modelosDe(marca)[0],
    combustible: "diesel",
    ano_desde: ANIO_MIN,
    ano_hasta: ANIO_MAX,
  };
}

function modoVehiculosDe(s, opts) {
  const dest = normalizarVehiculos(s && s.vehiculos);
  if (!dest.length) {
    if (opts && opts.portada) return { modo: "filas", dest: [destinoVacio()] };
    return { modo: s && s.id ? "todos" : "filas", dest: s && s.id ? [] : [destinoVacio()] };
  }
  if (dest.every((v) => v.modelo === "*")) return { modo: dest[0] && dest[0].marca ? "marca" : "todos", dest };
  return { modo: "filas", dest: dest.filter((v) => v.modelo !== "*") };
}

function htmlFilaCompat(dest, i) {
  const marca = (dest && dest.marca) || MARCAS[0];
  const modelos = modelosDe(marca);
  const modelo = dest && dest.modelo && dest.modelo !== "*" && modelos.includes(dest.modelo) ? dest.modelo : modelos[0];
  const desde = dest && dest.ano_desde != null ? dest.ano_desde : 2013;
  const hasta = dest && dest.ano_hasta != null ? dest.ano_hasta : 2017;
  return `
    <div class="veh-linea" data-veh-i="${i}">
      <select data-compat-marca aria-label="Marca">${MARCAS.map((m) => `<option value="${m}" ${m === marca ? "selected" : ""}>${m.toUpperCase()}</option>`).join("")}</select>
      <select data-compat-modelo aria-label="Modelo">${modelos.map((m) => `<option value="${m}" ${m === modelo ? "selected" : ""}>${m.toUpperCase()}</option>`).join("")}</select>
      <select data-compat-combustible aria-label="Combustible">${htmlOpcionesCombustible(dest && dest.combustible)}</select>
      <select data-compat-desde aria-label="Desde">${htmlOpcionesAnio(desde)}</select>
      <span class="veh-guion">-</span>
      <select data-compat-hasta aria-label="Hasta">${htmlOpcionesAnio(hasta)}</select>
      <button class="veh-linea-x" type="button" data-compat-del="${i}" title="Quitar" ${i === 0 ? "hidden" : ""}>×</button>
    </div>
  `;
}

function htmlFilaMarca(dest, i) {
  const marca = (dest && dest.marca) || MARCAS[0];
  const desde = dest && dest.ano_desde != null ? dest.ano_desde : ANIO_MIN;
  const hasta = dest && dest.ano_hasta != null ? dest.ano_hasta : ANIO_MAX;
  return `
    <div class="veh-linea veh-marca-linea" data-marca-i="${i}">
      <select data-marca-compat aria-label="Marca">${MARCAS.map((m) => `<option value="${m}" ${m === marca ? "selected" : ""}>${m.toUpperCase()}</option>`).join("")}</select>
      <select data-marca-comb aria-label="Combustible">${htmlOpcionesCombustible(dest && dest.combustible)}</select>
      <select data-marca-desde aria-label="Desde">${htmlOpcionesAnio(desde)}</select>
      <span class="veh-guion">-</span>
      <select data-marca-hasta aria-label="Hasta">${htmlOpcionesAnio(hasta)}</select>
      <button class="veh-linea-x" type="button" data-marca-del="${i}" title="Quitar" ${i === 0 ? "hidden" : ""}>×</button>
    </div>
  `;
}

function htmlVehiculosEditor(s, hint, opts) {
  const { modo, dest } = modoVehiculosDe(s, opts);
  const multi = modo === "todos" || modo === "marca";
  const filas = dest.filter((v) => v.modelo !== "*");
  const marcas = dest.filter((v) => v.modelo === "*");
  const visibles = filas.length ? filas : [destinoVacio()];
  const marcasVis = marcas.length ? marcas : [destinoVacio()];
  return `
    <fieldset class="canales veh-box">
      <legend>Modelos compatibles</legend>
      <p class="hint">${hint || "Un auto por línea. Puedes sumar Hyundai y también Kia, u otro modelo de la misma marca."}</p>
      <div id="e-veh-filas" ${modo === "todos" || modo === "marca" ? "hidden" : ""}>
        ${visibles.map((v, i) => htmlFilaCompat(v, i)).join("")}
      </div>
      <button class="btn-line veh-add-btn" type="button" id="btn-add-compat" ${modo === "todos" || modo === "marca" ? "hidden" : ""}>Añadir modelo compatible</button>
      <label class="check veh-multi-check"><input id="e-veh-multi" type="checkbox" ${multi ? "checked" : ""} /> Multi modelo</label>
      <div id="e-veh-multi-ops" class="veh-multi-ops" ${multi ? "" : "hidden"}>
        <label class="check"><input type="radio" name="e-veh-alcance" id="e-veh-todos" value="todos" ${modo === "todos" ? "checked" : ""} /> Todos los vehículos</label>
        <label class="check"><input type="radio" name="e-veh-alcance" id="e-veh-marca" value="marca" ${modo === "marca" || (multi && modo !== "todos") ? "checked" : ""} /> Marcas completas</label>
        <div id="e-veh-marca-campos" ${modo === "marca" || (multi && modo !== "todos") ? "" : "hidden"}>
          <div id="e-veh-marcas">${marcasVis.map((v, i) => htmlFilaMarca(v, i)).join("")}</div>
          <button class="btn-line veh-add-btn" type="button" id="btn-add-marca">Añadir marca</button>
        </div>
      </div>
    </fieldset>
  `;
}

function leerVehiculosEditor(raiz) {
  const box = raiz || document;
  const multi = box.querySelector ? box.querySelector("#e-veh-multi") : $("e-veh-multi");
  const todos = box.querySelector ? box.querySelector("#e-veh-todos") : $("e-veh-todos");
  const marca = box.querySelector ? box.querySelector("#e-veh-marca") : $("e-veh-marca");
  if (multi && multi.checked && todos && todos.checked) return [];
  const q = (sel) => [...box.querySelectorAll(sel)];
  if (multi && multi.checked && marca && marca.checked) {
    return normalizarVehiculos(
      q(".veh-marca-linea").map((row) => ({
        marca: row.querySelector("[data-marca-compat]") && row.querySelector("[data-marca-compat]").value,
        modelo: "*",
        combustible: row.querySelector("[data-marca-comb]") && row.querySelector("[data-marca-comb]").value,
        ano_desde: leerAnioCampo(row.querySelector("[data-marca-desde]")),
        ano_hasta: leerAnioCampo(row.querySelector("[data-marca-hasta]")),
      }))
    );
  }
  return normalizarVehiculos(
    q(".veh-linea:not(.veh-marca-linea)").map((row) => ({
      marca: row.querySelector("[data-compat-marca]") && row.querySelector("[data-compat-marca]").value,
      modelo: row.querySelector("[data-compat-modelo]") && row.querySelector("[data-compat-modelo]").value,
      combustible: row.querySelector("[data-compat-combustible]") && row.querySelector("[data-compat-combustible]").value,
      ano_desde: leerAnioCampo(row.querySelector("[data-compat-desde]")),
      ano_hasta: leerAnioCampo(row.querySelector("[data-compat-hasta]")),
    }))
  );
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

function htmlDotsMedia(n, on, s) {
  if (n < 2) return "";
  const x = s && s.dots_x != null ? s.dots_x : 50;
  const y = s && s.dots_y != null ? s.dots_y : 62;
  return `<div class="home-dots servicio-dots" data-drag="dots" style="left:${x}%;top:${y}%">${Array.from({ length: n }, (_, i) => `<i class="${i === on ? "on" : ""}"></i>`).join("")}</div>`;
}

function htmlOpcionesAnio(sel) {
  return anios()
    .map((y) => `<option value="${y}" ${Number(sel) === y ? "selected" : ""}>${y}</option>`)
    .join("");
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
  const mejor = typeof mejorComboEntrante === "function" ? mejorComboEntrante(s, p.pagado) : null;
  const combo = mejor
    ? `<p class="combo-hint">Si también llevas ${nombreServicioDe(mejor.si)}, baja a <strong>${clp(mejor.precio)}</strong></p>`
    : "";
  if (p.ahorro > 0) {
    return `<div class="precio-lista tachado">${clp(p.lista)}</div><div class="precio-oferta">${clp(p.pagado)}</div><div class="ahorro-tag">Ahorras ${clp(p.ahorro)}</div>${combo}`;
  }
  return `<div class="precio">${clp(s.precio)}</div>${combo}`;
}

function htmlCombosEntrantes(s) {
  if (!s || !s.id || typeof combosEntrantesDe !== "function") {
    return `<p class="hint">Para que este filtro baje aún más si el cliente lleva el aceite, no lo armes aquí. Ábrelo en <strong>Cambio de aceite</strong> → Servicios asociados → agrega este servicio y pon el precio combo (ej. $55.990).</p>`;
  }
  const reglas = combosEntrantesDe(s.id);
  if (!reglas.length) {
    return `<p class="hint">Este servicio todavía no baja de precio por llevar otro. Eso se define en el otro servicio. Ejemplo: abre el <strong>cambio de aceite</strong>, agrega este filtro como asociado y pon $55.990. Aquí solo dejas la oferta fija ($59.990).</p>`;
  }
  return `<div class="hint">${reglas
    .map((r) => `Si el cliente lleva <strong>${nombreServicioDe(r.si)}</strong>, este servicio queda en <strong>${clp(r.precio)}</strong>.`)
    .join("<br />")}<br />Eso se edita en el servicio que da el descuento, no aquí.</div>`;
}

function htmlCalculadoraServicio(s) {
  const dummy = {
    ...s,
    mano_obra: Number(s && s.mano_obra) || 0,
    insumos: normalizarInsumos(s && s.insumos),
    tiempo_min: s && s.tiempo_min,
    precio_oferta: s && s.precio_oferta,
  };
  dummy.precio = valorNormalDe(dummy);
  return `
    <fieldset class="canales calc-box">
      <legend>Calculadora del servicio</legend>
      <p class="hint">Mano de obra e insumos van en neto. La calculadora suma neto, IVA 19% y total.</p>
      <div id="e-kpis">${htmlKpisOferta(dummy)}</div>
      <div class="grid-2">
        <label class="field"><span>Mano de obra</span><input id="e-mano" type="number" min="0" step="1000" value="${dummy.mano_obra || ""}" /></label>
        <label class="field"><span>Tiempo aproximado</span><select id="e-tiempo">${htmlOpcionesTiempo(dummy.tiempo_min)}</select></label>
      </div>
      <h4 class="oferta-h">Insumos</h4>
      <div class="insumo-head"><span>Insumo</span><span>Costo</span><span>%</span><span>Venta</span><span></span></div>
      <div id="e-insumos">${htmlFilasInsumos(dummy.insumos)}</div>
      <button class="btn-line" type="button" id="btn-add-insumo-editor">Agregar insumo</button>
      <label class="field"><span>Valor normal</span><input id="e-precio" type="number" min="0" step="1000" value="${dummy.precio || ""}" /></label>
    </fieldset>
  `;
}

function leerCostosEditor() {
  if (!editando) return;
  if ($("e-tiempo")) editando.tiempo_min = $("e-tiempo").value ? Number($("e-tiempo").value) : null;
  if ($("e-precio-oferta") && $("e-oferta-fija") && $("e-oferta-fija").checked) {
    const oferta = $("e-precio-oferta").value;
    editando.precio_oferta = oferta === "" ? null : Number(oferta);
    editando.tiene_oferta = Number(editando.precio_oferta) > 0;
  }
  if ($("e-precio")) editando.precio = $("e-precio").value === "" ? null : Number($("e-precio").value);
}

function pintarCalculadoraEditor() {
  if (!editando || !$("e-kpis")) return;
  leerCostosEditor();
  $("e-kpis").innerHTML = htmlKpisOferta(editando);
  document.querySelectorAll("#e-insumos .insumo-row").forEach((row, i) => {
    const ins = editando.insumos[i];
    const span = row.querySelector("span");
    if (span && ins) span.textContent = clp(ventaInsumo(ins));
  });
  pintarPrecioPreview();
}

function pintarFotoServicio() {
  const img = $("e-img");
  const m = mediaActual();
  if (img && m && m.tipo === "foto") img.style.cssText = estiloFotoPortada(m);
}

function renderEditor() {
  $("stage").classList.remove("stage-board");
  const s = editando;
  if (!s.media) s.media = mediaServicio(s);
  const lista = mediaEditando();
  if (lista.length && (mediaEditIndex < 0 || mediaEditIndex >= lista.length)) mediaEditIndex = 0;
  const m = mediaActual();
  $("stage").innerHTML = `
    <article class="editor editor-portada editor-servicio">
      <div class="editor-head">
        <div class="editor-head-row">
          <div>
            <h2>${s.id ? "Editar servicio" : "Nuevo servicio"}</h2>
            <p class="muted">El celular se queda a la vista. Edita a la derecha. Arrastra la cápsula de puntos para ubicarla. Arrastra la foto para el recorte.</p>
          </div>
          <button type="button" id="btn-volver-tablero" class="btn-line">Volver al tablero</button>
        </div>
      </div>
      <div class="editor-board">
        <div class="portada-phone editor-phone-sticky">
          <div class="home-screen portada-preview servicio-preview" id="servicio-preview">
            <div class="portada-lienzo" id="e-lienzo">${htmlPreviewMedia(m)}</div>
            ${htmlDotsMedia(lista.length, mediaEditIndex, s)}
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
        <div class="editor-fields">
          <div class="editor-col">
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
            ${htmlVehiculosEditor(s)}
            <label class="field"><span>Valor normal</span><input id="e-precio" type="number" min="0" step="1000" value="${s.precio == null ? "" : s.precio}" /></label>
            <label class="field"><span>Tiempo aproximado</span><select id="e-tiempo">${htmlOpcionesTiempo(s.tiempo_min)}</select></label>
            <button class="btn-line btn-block" type="button" id="btn-armar-oferta">Calculadora del servicio</button>
            <fieldset class="canales">
              <legend>Criterio de la oferta</legend>
              <p class="hint">Puedes marcar las dos. El cliente se queda con el precio más bajo que le corresponda.</p>
              <label class="check"><input id="e-oferta-fija" type="checkbox" ${s.tiene_oferta ? "checked" : ""} /> Descuento de ocasión</label>
              <div id="e-oferta-wrap" ${s.tiene_oferta ? "" : "hidden"}>
                <label class="field"><span>Precio oferta</span><input id="e-precio-oferta" type="number" min="0" step="1000" value="${s.precio_oferta == null || Number(s.precio_oferta) <= 0 ? "" : s.precio_oferta}" /></label>
              </div>
              <label class="check"><input id="e-oferta-combo" type="checkbox" ${s.oferta_combo ? "checked" : ""} /> Oferta por complemento de servicio</label>
              <p class="hint">El descuento de ocasión vale siempre. El de complemento solo si el cliente lleva el otro servicio. Si aplican las dos, se usa la más conveniente.</p>
            </fieldset>
          </div>
          <div class="editor-col">
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
                   <p class="hint">Arrastra la foto en el celular para moverla. Si es horizontal, elige qué parte se ve. Arrastra los puntos para ubicar la cápsula.</p>`
                : m && m.tipo === "video"
                  ? `<p class="hint">Video corto dentro de la ficha. El cliente lo reproduce ahí mismo, sin YouTube.</p>`
                  : ""
            }
            <h3>Este servicio baja si llevan otro</h3>
            ${htmlCombosEntrantes(s)}
            <h3>Servicios que este hace más baratos</h3>
            <p class="hint">Al revés: si el cliente ya lleva <strong>${s.nombre || "este servicio"}</strong>, puedes bajar el precio de otro trabajo del mismo ingreso.</p>
            <div class="complementos" id="e-combos">${htmlComplementos(s)}</div>
            <button class="btn-line btn-block" type="button" id="btn-add-combo">Agregar servicio asociado</button>
            <div class="btn-row">
              <button class="btn-primary" type="button" id="btn-guardar">Guardar</button>
              ${s.id ? `<button class="btn-soft" type="button" id="btn-borrar">Eliminar</button>` : ""}
            </div>
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
  if ((editando.vehiculos || []).some((v) => v.ano_desde != null && v.ano_hasta != null && v.ano_desde > v.ano_hasta)) {
    alert("En algún vehículo el año desde es mayor que el año hasta.");
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

function imagenEsTransparente(file) {
  const tipo = String((file && file.type) || "").toLowerCase();
  const nombre = String((file && file.name) || "").toLowerCase();
  return tipo === "image/png" || tipo === "image/webp" || nombre.endsWith(".png") || nombre.endsWith(".webp");
}

function leerImagen(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      const conservar = imagenEsTransparente(file);
      if (!conservar) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(conservar ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
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
  $("combo-ayuda").textContent = `Si el cliente ya lleva “${editando.nombre || "este servicio"}”, elige qué otro trabajo baja de precio y a cuánto. Ejemplo: en el cambio de aceite, eliges el filtro diésel y pones $55.990.`;
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
  const ofertaOtro = typeof precioOfertaDe === "function" ? precioOfertaDe(otro) : null;
  $("combo-lista").textContent = ofertaOtro
    ? `${otro.nombre} vale ${clp(lista)} y su oferta fija es ${clp(ofertaOtro)}. El combo tiene que ser más bajo que esa oferta.`
    : `${otro.nombre} vale ${clp(lista)} si se pide solo.`;
  if (lista == null || Number.isNaN(combo)) {
    $("combo-preview").textContent = "Escribe el precio de combo.";
    return;
  }
  const tope = ofertaOtro != null ? ofertaOtro : lista;
  const ahorro = tope == null ? 0 : tope - combo;
  $("combo-preview").innerHTML =
    ahorro > 0
      ? `Queda en <span style="color:var(--green)">${clp(combo)}</span>. El cliente ve la oferta fija y, si suma ${editando.nombre || "este servicio"}, baja a ${clp(combo)}.`
      : "El precio de combo tiene que ser menor que la oferta fija (o el valor normal si no tiene oferta).";
}

function guardarCombo() {
  const id = $("combo-id").value;
  const precioCombo = Number($("combo-precio").value);
  const otro = servicioPorId(id);
  if (!otro || Number.isNaN(precioCombo) || precioCombo <= 0) {
    alert("Elige el servicio y un precio mayor a 0.");
    return;
  }
  const tope = (typeof precioOfertaDe === "function" && precioOfertaDe(otro)) || otro.precio;
  if (tope != null && precioCombo >= Number(tope)) {
    alert("El precio combo tiene que ser menor que la oferta fija del otro servicio (o su valor normal).");
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

function renderEditorFotosModelos() {
  $("stage").classList.remove("stage-board");
  editando = null;
  hidratarFotosModelos();
  const bloques = MARCAS.map((marca) => {
    const modelos = modelosDe(marca);
    return `
      <details class="veh-marca" open>
        <summary>${marca}</summary>
        <div class="fotos-modelos">
          ${modelos
            .map((m) => {
              const clave = claveVehiculo(marca, m);
              const src = fotoModeloDe(marca, m);
              return `<div class="foto-modelo">
                <div class="foto-modelo-img">${src ? `<img src="${src}" alt="${m}" />` : `<span>Sin foto</span>`}</div>
                <strong>${m}</strong>
                <button class="btn-line" type="button" data-foto-modelo="${escapeAttr(clave)}">${src ? "Cambiar foto" : "Agregar foto"}</button>
              </div>`;
            })
            .join("")}
        </div>
      </details>
    `;
  }).join("");
  $("stage").innerHTML = `
    <article class="editor editor-portada">
      <div class="editor-head">
        <div class="editor-head-row">
          <div>
            <h2>Fotos de modelos</h2>
            <p class="muted">Una foto por modelo. El cliente la ve en el botón flotante de su auto y al elegir marca y modelo. Así reconoce de inmediato de qué vehículo son las ofertas.</p>
          </div>
          <button type="button" id="btn-volver-tablero" class="btn-line">Volver al tablero</button>
        </div>
      </div>
      <div class="editor-fields editor-fields-single" style="max-width:none">
        ${bloques}
        <p class="hint">Si falta un modelo, agrégalo en un servicio (Para qué vehículos) y vuelve aquí.</p>
      </div>
    </article>
  `;
}

function htmlNavPortadaFalsa() {
  return `<nav class="portada-nav" aria-hidden="true">${["Ficha interactiva", "Promociones", "Agendamiento", "Mantención preventiva"]
    .map((txt) => `<span><i></i><b>${txt}</b></span>`)
    .join("")}</nav>`;
}

function pintarFotoPortada() {
  const img = $("p-img");
  const s = slideActual();
  if (!img) return;
  img.style.cssText = estiloFotoPortada(s);
}

function asegurarPortadaDefecto() {
  if (!(portadaSlides || []).length) return;
  if (portadaSlides.some((x) => x.defecto)) return;
  const generico = portadaSlides.find((x) => !normalizarVehiculos(x.vehiculos).length);
  (generico || portadaSlides[0]).defecto = true;
}

function marcarPortadaDefecto(id) {
  (portadaSlides || []).forEach((x) => {
    x.defecto = x.id === id;
  });
}

function resumenSlidePortada(s) {
  if (s.defecto) return "Por defecto";
  const dest = normalizarVehiculos(s.vehiculos);
  if (!dest.length) return "Sin modelos";
  return dest
    .slice(0, 2)
    .map((v) => (v.modelo === "*" ? `${v.marca} todos` : v.modelo))
    .join(", ");
}

function renderEditorPortada() {
  $("stage").classList.remove("stage-board");
  asegurarPortadaDefecto();
  const s = slideActual();
  const ofertas = serviciosCotizacion();
  $("stage").innerHTML = `
    <article class="editor editor-portada">
      <div class="editor-head">
        <div class="editor-head-row">
          <div>
            <h2>Configurar portada</h2>
            <p class="muted">El celular se queda a la vista. A la derecha eliges foto, modelos y cuál flyer es el de defecto.</p>
          </div>
          <button type="button" id="btn-volver-tablero" class="btn-line">Volver al tablero</button>
        </div>
      </div>
      <div class="editor-board">
        <div class="portada-phone editor-phone-sticky">
          <div class="home-screen portada-preview" id="portada-preview">
            <header class="home-logo" style="height:${bannerAltoPortada(portadaUi)}px">
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
        <div class="editor-fields editor-fields-portada">
          <div class="editor-col">
            <div class="portada-thumbs" id="portada-thumbs">
              ${portadaSlides
                .map(
                  (x, i) =>
                    `<div class="portada-thumb">
                      <input type="number" min="1" max="${portadaSlides.length}" value="${i + 1}" data-orden-id="${x.id}" title="Orden" />
                      <button type="button" data-slide="${i}" class="${i === slideEditIndex ? "is-on" : ""}">${
                        x.foto ? `<img src="${x.foto}" alt="" />` : `<span class="ph">Foto ${i + 1}</span>`
                      }${x.defecto ? `<em class="thumb-defecto">Defecto</em>` : ""}</button>
                      <small>${escapeText(resumenSlidePortada(x))}</small>
                    </div>`
                )
                .join("")}
            </div>
            <div class="btn-row">
              <button class="btn-line" type="button" id="btn-slide-add">Agregar flyer</button>
              ${portadaSlides.length > 1 ? `<button class="btn-soft" type="button" id="btn-slide-del">Quitar este</button>` : ""}
            </div>
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
            <label class="field">
              <span>Alto del banner amarillo</span>
              <input id="p-banner-alto" type="range" min="40" max="160" step="2" value="${bannerAltoPortada(portadaUi)}" />
            </label>
            <label class="field">
              <span>Tamaño de Maps y WhatsApp</span>
              <input id="p-ico-tamano" type="range" min="28" max="96" step="1" value="${icoTamanoPortada(portadaUi)}" />
            </label>
            <button class="btn-soft btn-block" type="button" id="btn-reset-logo">Centrar y resetear logo</button>
            <p class="hint">Arrastra el logo, la foto, el botón o los puntos sobre el celular.</p>
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
          </div>
          <div class="editor-col">
            <section class="portada-defecto ${s.defecto ? "is-on" : ""}">
              <h3>Portada por defecto</h3>
              <p>Si un auto no tiene portada propia, ve esta. También la ve quien aún no eligió vehículo.</p>
              <label class="check">
                <input id="p-defecto" type="checkbox" ${s.defecto ? "checked" : ""} />
                Esta es la portada por defecto
              </label>
            </section>
            <div id="p-modelos-box" ${s.defecto ? "hidden" : ""}>
              ${htmlVehiculosEditor(s, "Elige para qué modelos va este flyer. Si dos flyers comparten el mismo modelo, ese auto verá las dos portadas y podrá deslizarlas.", { portada: true })}
            </div>
            <p class="hint" id="p-defecto-nota" ${s.defecto ? "" : "hidden"}>Esta portada no se asigna a un modelo: cubre a todos los autos que no tienen flyer propio.</p>
            <div class="btn-row">
              <button class="btn-primary" type="button" id="btn-guardar-portada">Guardar portada</button>
            </div>
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
  if ($("p-banner-alto")) portadaUi.banner_h = Number($("p-banner-alto").value);
  if ($("p-ico-tamano")) portadaUi.ico_s = Number($("p-ico-tamano").value);
  if ($("p-defecto")) s.defecto = $("p-defecto").checked;
  if (s.defecto) marcarPortadaDefecto(s.id);
  else s.vehiculos = leerVehiculosEditor($("p-modelos-box") || document);
}

function pintarLogoPortada() {
  aplicarLogos();
}

function ubicarCapa(el, xKey, yKey, clientX, clientY) {
  const caja = $("portada-preview");
  if (!caja || !el) return;
  const r = caja.getBoundingClientRect();
  const libre = xKey === "dir_x" || xKey === "wa_x";
  const min = libre ? 2 : 6;
  const max = libre ? 98 : 94;
  portadaUi[xKey] = Math.min(max, Math.max(min, ((clientX - r.left) / r.width) * 100));
  portadaUi[yKey] = Math.min(max, Math.max(min, ((clientY - r.top) / r.height) * 100));
  el.style.left = `${portadaUi[xKey]}%`;
  el.style.top = `${portadaUi[yKey]}%`;
}

function activarEditorMedia() {
  const caja = $("servicio-preview");
  const lienzo = $("e-lienzo");
  const dots = caja ? caja.querySelector("[data-drag=\"dots\"]") : null;
  if (!caja) return;
  let modo = "";
  let lastX = 0;
  let lastY = 0;
  const mover = (e) => {
    const r = caja.getBoundingClientRect();
    if (modo === "dots" && dots && editando) {
      editando.dots_x = Math.min(94, Math.max(6, ((e.clientX - r.left) / r.width) * 100));
      editando.dots_y = Math.min(94, Math.max(6, ((e.clientY - r.top) / r.height) * 100));
      dots.style.left = `${editando.dots_x}%`;
      dots.style.top = `${editando.dots_y}%`;
      return;
    }
    if (modo !== "foto") return;
    const m = mediaActual();
    if (!m || m.tipo !== "foto") return;
    m.off_x = Math.min(160, Math.max(-160, m.off_x + ((e.clientX - lastX) / r.width) * 100));
    m.off_y = Math.min(160, Math.max(-160, m.off_y + ((e.clientY - lastY) / r.height) * 100));
    lastX = e.clientX;
    lastY = e.clientY;
    pintarFotoServicio();
  };
  const fin = () => {
    modo = "";
  };
  if (dots) {
    dots.addEventListener("pointerdown", (e) => {
      modo = "dots";
      dots.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    dots.addEventListener("pointermove", mover);
    dots.addEventListener("pointerup", fin);
    dots.addEventListener("pointercancel", fin);
  }
  if (lienzo) {
    lienzo.addEventListener("pointerdown", (e) => {
      const m = mediaActual();
      if (!m || m.tipo !== "foto") return;
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
  asegurarPortadaDefecto();
  const actual = slideActual();
  if (actual && !actual.defecto && !normalizarVehiculos(actual.vehiculos).length) {
    alert("Esta portada necesita un modelo, o márcala como portada por defecto.");
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

$("btn-tablero").addEventListener("click", renderTablero);
$("btn-portada").addEventListener("click", abrirEditorPortada);
$("btn-fotos-modelos").addEventListener("click", renderEditorFotosModelos);
$("btn-nuevo").addEventListener("click", nuevoServicio);
$("foto-modelo-file")?.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  const clave = fotoModeloPendiente;
  e.target.value = "";
  fotoModeloPendiente = "";
  if (!file || !clave) return;
  const [marca, modelo] = clave.split("|");
  try {
    let src = await leerImagen(file, 900);
    if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
    FOTOS_MODELOS[claveVehiculo(marca, modelo)] = src;
    persistirFotosModelos();
    if (typeof nubeActiva === "function" && nubeActiva()) await nubeGuardarCatalogoCanales(catalogo);
    renderEditorFotosModelos();
  } catch (err) {
    alert((err && err.message) || "No se pudo subir la foto del modelo.");
  }
});
$("col-foto-file")?.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  const id = colFotoPendiente || columnaEditId;
  e.target.value = "";
  colFotoPendiente = "";
  if (!file || !id) return;
  const col = TABLERO_COLUMNAS.find((c) => c.id === id);
  if (!col) return;
  try {
    let src = await leerImagen(file, 1400);
    if (typeof nubeActiva === "function" && nubeActiva()) src = await nubeSubirImagen(src);
    aplicarFotoColumna(col, src);
    await guardarTableroNube();
    pintarCarnetColumna(col);
    const seguir = id;
    renderTablero();
    abrirModalColumna(seguir);
  } catch (err) {
    alert((err && err.message) || "No se pudo subir la foto de portada.");
  }
});
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
  if (t.id === "btn-col-add") agregarColumnaTablero();
  if (t.id === "btn-volver-tablero") {
    renderTablero();
    return;
  }
  if (t.id === "btn-armar-oferta") {
    leerEditor();
    abrirModalOferta(editando);
    return;
  }
  if (t.id === "btn-add-marca") {
    const caja = $("e-veh-marcas");
    if (!caja) return;
    caja.insertAdjacentHTML("beforeend", htmlFilaMarca(destinoVacio(), document.querySelectorAll(".veh-marca-linea").length));
    document.querySelectorAll("[data-marca-del]").forEach((b, i) => {
      b.hidden = document.querySelectorAll(".veh-marca-linea").length < 2;
      b.dataset.marcaDel = String(i);
    });
    return;
  }
  if (t.dataset.marcaDel != null && t.dataset.marcaDel !== "") {
    const row = t.closest(".veh-marca-linea");
    if (row && document.querySelectorAll(".veh-marca-linea").length > 1) row.remove();
    document.querySelectorAll("[data-marca-del]").forEach((b, i) => {
      b.hidden = document.querySelectorAll(".veh-marca-linea").length < 2;
      b.dataset.marcaDel = String(i);
    });
    return;
  }
  if (t.id === "btn-add-compat") {
    const caja = $("e-veh-filas");
    if (!caja) return;
    caja.insertAdjacentHTML("beforeend", htmlFilaCompat(destinoVacio(), document.querySelectorAll(".veh-linea").length));
    document.querySelectorAll("[data-compat-del]").forEach((b, i) => {
      b.hidden = document.querySelectorAll(".veh-linea").length < 2;
      b.dataset.compatDel = String(i);
    });
    return;
  }
  if (t.dataset.compatDel != null && t.dataset.compatDel !== "") {
    const row = t.closest(".veh-linea");
    if (row && document.querySelectorAll(".veh-linea").length > 1) row.remove();
    document.querySelectorAll("[data-compat-del]").forEach((b, i) => {
      b.hidden = document.querySelectorAll(".veh-linea").length < 2;
      b.dataset.compatDel = String(i);
    });
    return;
  }
  if (t.dataset.insDel != null && t.dataset.insDel !== "" && $("e-insumos")) {
    leerCostosEditor();
    editando.insumos.splice(Number(t.dataset.insDel), 1);
    $("e-insumos").innerHTML = htmlFilasInsumos(editando.insumos);
    pintarCalculadoraEditor();
    return;
  }
  if (t.id === "btn-add-insumo-editor") {
    leerCostosEditor();
    if (!editando.insumos) editando.insumos = [];
    editando.insumos.push(normalizarInsumo({ nombre: "", costo: 0, porcentaje: 30 }, editando.insumos.length));
    if ($("e-insumos")) $("e-insumos").innerHTML = htmlFilasInsumos(editando.insumos);
    pintarCalculadoraEditor();
    return;
  }
  if (t.dataset.kanbanTarjeta) {
    abrirModalTarjeta(t.dataset.kanbanTarjeta);
    return;
  }
  if (t.dataset.kanbanConfig) {
    abrirModalColumna(t.dataset.kanbanConfig);
    return;
  }
  if (t.dataset.kanbanGuardarCol) {
    guardarColumnaTablero(t.dataset.kanbanGuardarCol);
    return;
  }
  if (t.dataset.colFoto) {
    colFotoPendiente = t.dataset.colFoto;
    $("col-foto-file")?.click();
    return;
  }
  if (t.dataset.kanbanServicio) {
    abrirServicio(t.dataset.kanbanServicio);
    return;
  }
  if (t.dataset.kanbanPortada) {
    abrirPortadaDesdeTablero(t.dataset.kanbanPortada);
    return;
  }
  if (t.dataset.kanbanNuevo) {
    nuevoServicioEnColumna(t.dataset.kanbanNuevo);
    return;
  }
  if (t.dataset.kanbanPortadaNueva) {
    nuevaPortadaEnColumna(t.dataset.kanbanPortadaNueva);
    return;
  }
  if (t.dataset.kanbanDelCol) {
    TABLERO_COLUMNAS = TABLERO_COLUMNAS.filter((c) => c.id !== t.dataset.kanbanDelCol);
    guardarTableroNube().then(renderTablero);
    return;
  }
  if (t.dataset.fotoModelo) {
    fotoModeloPendiente = t.dataset.fotoModelo;
    $("foto-modelo-file")?.click();
    return;
  }
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
    portadaUi.banner_h = 72;
    portadaUi.ico_s = 46;
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
  if (t.dataset.addModelo) {
    const enServicio = Boolean(editando && $("e-nombre"));
    if (enServicio) leerEditor();
    else leerEditorPortada();
    const marca = t.dataset.addModelo;
    const input = document.querySelector(`[data-nuevo-modelo="${marca}"]`);
    const nombre = input && input.value.trim();
    if (!nombre) {
      alert("Escribe el nombre del modelo.");
      return;
    }
    registrarModelo(marca, nombre);
    const destino = enServicio ? editando : slideActual();
    if (!destino.vehiculos) destino.vehiculos = [];
    if (!destino.vehiculos.some((v) => v.marca === marca && v.modelo === nombre)) {
      destino.vehiculos.push({ marca, modelo: nombre, ano_desde: ANIO_MIN, ano_hasta: null });
    }
    if ($("e-veh-todos")) $("e-veh-todos").checked = false;
    if (enServicio) renderEditor();
    else renderEditorPortada();
    return;
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
  if (e.target.id === "p-banner-alto") {
    portadaUi.banner_h = Number(e.target.value);
    aplicarBannerPortada();
  }
  if (e.target.id === "p-ico-tamano") {
    portadaUi.ico_s = Number(e.target.value);
    aplicarIcosPortada();
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
  if (
    e.target.id === "e-precio" ||
    e.target.id === "e-precio-oferta" ||
    e.target.id === "e-mano" ||
    e.target.id === "e-tiempo" ||
    e.target.dataset.insNombre != null ||
    e.target.dataset.insCosto != null ||
    e.target.dataset.insPct != null
  ) {
    pintarCalculadoraEditor();
    pintarPrecioPreview();
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
  if (e.target.id === "p-defecto") {
    leerEditorPortada();
    if (e.target.checked) marcarPortadaDefecto(slideActual().id);
    else slideActual().defecto = false;
    renderEditorPortada();
  }
  if (e.target.dataset.colCampo === "marca") {
    const id = e.target.dataset.colId;
    const modelos = modelosDe(e.target.value);
    const sel = document.querySelector(`[data-col-campo="modelo"][data-col-id="${id}"]`);
    if (sel) sel.innerHTML = modelos.map((m) => `<option value="${m}">${m}</option>`).join("");
  }
  if (e.target.dataset.colCampo === "adelante") {
    const hasta = document.querySelector(`[data-col-campo="hasta"][data-col-id="${e.target.dataset.colId}"]`);
    if (hasta) hasta.disabled = e.target.checked;
  }
  if (e.target.id === "e-tiempo") pintarCalculadoraEditor();
  if (e.target.id === "e-oferta-fija") {
    if ($("e-oferta-wrap")) $("e-oferta-wrap").hidden = !e.target.checked;
    pintarPrecioPreview();
    pintarCalculadoraEditor();
  }
  if (e.target.id === "e-veh-multi") {
    const on = e.target.checked;
    if ($("e-veh-multi-ops")) $("e-veh-multi-ops").hidden = !on;
    const todos = on && $("e-veh-todos") && $("e-veh-todos").checked;
    const marcas = on && $("e-veh-marca") && $("e-veh-marca").checked;
    if (on && $("e-veh-todos") && $("e-veh-marca") && !$("e-veh-marca").checked && !$("e-veh-todos").checked) {
      $("e-veh-marca").checked = true;
    }
    if ($("e-veh-filas")) $("e-veh-filas").hidden = on;
    if ($("btn-add-compat")) $("btn-add-compat").hidden = on;
    if ($("e-veh-marca-campos")) $("e-veh-marca-campos").hidden = !(on && ($("e-veh-marca") && $("e-veh-marca").checked));
  }
  if (e.target.name === "e-veh-alcance") {
    const marcas = e.target.value === "marca";
    if ($("e-veh-marca-campos")) $("e-veh-marca-campos").hidden = !marcas;
    if ($("e-veh-filas")) $("e-veh-filas").hidden = true;
    if ($("btn-add-compat")) $("btn-add-compat").hidden = true;
  }
  if (e.target.dataset.compatMarca) {
    const modelos = modelosDe(e.target.value);
    const sel = e.target.closest(".veh-linea") && e.target.closest(".veh-linea").querySelector("[data-compat-modelo]");
    if (sel) sel.innerHTML = modelos.map((m) => `<option value="${m}">${m.toUpperCase()}</option>`).join("");
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
$("cerrar-columna")?.addEventListener("click", cerrarModalColumna);
$("btn-col-foto")?.addEventListener("click", () => {
  colFotoPendiente = columnaEditId;
  $("col-foto-file")?.click();
});
$("btn-guardar-columna")?.addEventListener("click", () => {
  if (columnaEditId) guardarColumnaTablero(columnaEditId);
});
$("btn-quitar-columna")?.addEventListener("click", () => {
  if (!columnaEditId) return;
  TABLERO_COLUMNAS = TABLERO_COLUMNAS.filter((c) => c.id !== columnaEditId);
  guardarTableroNube().then(() => {
    cerrarModalColumna();
    renderTablero();
  });
});
$("modal-columna")?.addEventListener("click", (e) => {
  if (e.target.id === "modal-columna") cerrarModalColumna();
});
$("cerrar-oferta")?.addEventListener("click", cerrarModalOferta);
$("btn-guardar-oferta")?.addEventListener("click", guardarModalOferta);
$("btn-add-insumo")?.addEventListener("click", () => {
  if (!ofertaDraft) return;
  leerModalOferta();
  ofertaDraft.insumos.push(normalizarInsumo({ nombre: "", costo: 0, porcentaje: 30 }, ofertaDraft.insumos.length));
  pintarModalOferta();
});
$("modal-oferta")?.addEventListener("click", (e) => {
  if (e.target.id === "modal-oferta") cerrarModalOferta();
  const del = e.target.closest("[data-ins-del]");
  if (!del || !ofertaDraft) return;
  leerModalOferta();
  ofertaDraft.insumos.splice(Number(del.dataset.insDel), 1);
  pintarModalOferta();
});
function refrescarKpisOfertaVivo() {
  if (!ofertaDraft) return;
  leerModalOferta();
  if ($("oferta-kpis")) $("oferta-kpis").innerHTML = htmlKpisOferta(ofertaDraft);
  pintarDesgloseIva(ofertaDraft);
  document.querySelectorAll("#o-insumos .insumo-row").forEach((row, i) => {
    const ins = ofertaDraft.insumos[i];
    const span = row.querySelector("span");
    if (span && ins) span.textContent = clp(ventaInsumo(ins));
  });
}
$("modal-oferta")?.addEventListener("input", (e) => {
  if (e.target.id === "o-nombre") return;
  refrescarKpisOfertaVivo();
});
$("modal-oferta")?.addEventListener("change", refrescarKpisOfertaVivo);
$("cerrar-tarjeta")?.addEventListener("click", cerrarModalTarjeta);
$("modal-tarjeta")?.addEventListener("click", (e) => {
  if (e.target.id === "modal-tarjeta") cerrarModalTarjeta();
});
$("btn-tarjeta-nueva")?.addEventListener("click", () => {
  const id = tarjetaColId;
  cerrarModalTarjeta();
  if (id) nuevoServicioEnColumna(id);
});
$("btn-tarjeta-portada")?.addEventListener("click", () => {
  const id = tarjetaColId;
  cerrarModalTarjeta();
  if (id) nuevaPortadaEnColumna(id);
});
$("tarjeta-busca")?.addEventListener("input", (e) => pintarListaTarjeta(e.target.value));
$("tarjeta-lista")?.addEventListener("change", (e) => {
  const item = e.target.closest("[data-tarjeta-serv]");
  if (!item || e.target.type !== "checkbox") return;
  const id = item.dataset.tarjetaServ;
  if (e.target.checked) tarjetaSeleccion.add(id);
  else tarjetaSeleccion.delete(id);
  item.classList.toggle("is-on", e.target.checked);
  pintarAceptarTarjeta();
});
$("btn-tarjeta-aceptar")?.addEventListener("click", () => {
  if (!tarjetaColId || !tarjetaSeleccion.size) return;
  asignarServiciosAColumna([...tarjetaSeleccion], tarjetaColId);
});
$("modal-columna")?.addEventListener("change", (e) => {
  if (e.target.dataset.colCampo === "marca") {
    const id = e.target.dataset.colId;
    const modelos = modelosDe(e.target.value);
    const sel = document.querySelector(`[data-col-campo="modelo"][data-col-id="${id}"]`);
    if (sel) sel.innerHTML = modelos.map((m) => `<option value="${m}">${m}</option>`).join("");
  }
  if (e.target.dataset.colCampo === "adelante") {
    const hasta = document.querySelector(`[data-col-campo="hasta"][data-col-id="${e.target.dataset.colId}"]`);
    if (hasta) hasta.disabled = e.target.checked;
  }
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
