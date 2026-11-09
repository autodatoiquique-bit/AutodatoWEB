function comboVacio() {
  const b = servicioVacio();
  b.es_combo = true;
  b.combo_items = [];
  b.combo_regalo = [];
  b.oferta_combo = false;
  b.tiene_oferta = false;
  b.precio_oferta = null;
  b.complementos = [];
  b.canales = { ofertas: false, mantencion: true, diagnostico: false };
  b.tipo = tipoDesdeCanales(b.canales);
  return b;
}

function serviciosElegiblesParaCombo(excluirId) {
  return (catalogo || []).filter(
    (s) => s && s.activo !== false && !s.es_combo && s.id !== excluirId && s.precio != null
  );
}

function descuentoManualComboAdmin(s) {
  const pack = preciosPackCombo(s);
  const base =
    pack.pagado_asociaciones != null && Number.isFinite(Number(pack.pagado_asociaciones))
      ? Number(pack.pagado_asociaciones)
      : Number(pack.pagado) || 0;
  if (!tieneOferta(s)) return { pesos: 0, pct: 0, base };
  const final = Number(pack.pagado) || 0;
  const pesos = Math.max(0, Math.round(base - final));
  const pct = base > 0 ? (pesos / base) * 100 : 0;
  return { pesos, pct, base };
}

function htmlDescuentoComboAdmin(s) {
  const { pesos, pct, base } = descuentoManualComboAdmin(s);
  const pctTxt = pct > 0 ? (Math.round(pct * 100) / 100).toString() : "";
  return `
    <div class="combo-descuento-manual">
      <h4 class="combo-descuento-titulo">Descuento adicional del pack</h4>
      <p class="hint">Se suma a los descuentos por «servicios asociados» entre ítems. Base para el %: total con asociaciones (${clp(base)}).</p>
      <div class="combo-descuento-campos">
        <label class="field"><span>Descuento ($)</span><input id="combo-dto-pesos" type="number" min="0" step="1000" value="${pesos > 0 ? pesos : ""}" placeholder="0" inputmode="numeric" /></label>
        <label class="field"><span>Descuento (%)</span><input id="combo-dto-pct" type="number" min="0" max="100" step="0.1" value="${pctTxt}" placeholder="0" inputmode="decimal" /></label>
      </div>
    </div>
  `;
}

function htmlTotalesComboAdmin(s) {
  const pack = preciosPackCombo(s);
  const sinStock = comboSinStockMiembros(s);
  const pagadoAsoc =
    pack.pagado_asociaciones != null ? pack.pagado_asociaciones : pack.pagado;
  return `
    <div class="combo-admin-totales${sinStock ? " combo-admin-sin-stock" : ""}">
      <div><span>Total lista (suma servicios)</span><strong>${clp(pack.lista)}</strong></div>
      <div><span>Total con reglas asociadas</span><strong>${clp(pagadoAsoc)}</strong></div>
      <div><span>Total combo (precio final)</span><strong class="combo-total-pagado">${clp(pack.pagado)}</strong></div>
      <div><span>Total ahorrado</span><strong class="combo-total-ahorro">${clp(pack.ahorro)}</strong></div>
      ${
        sinStock
          ? `<p class="error combo-stock-aviso">Algún servicio incluido está agotado: el combo se verá como agotado en la web.</p>`
          : `<p class="hint">Marca servicios incluidos y, si quieres, un descuento adicional del pack abajo.</p>`
      }
    </div>
  `;
}

function comboRegaloSetAdmin(s) {
  const ids =
    typeof comboRegaloDe === "function"
      ? comboRegaloDe(s)
      : Array.isArray(s && s.combo_regalo)
        ? s.combo_regalo.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
  return new Set(ids);
}

function htmlCatalogoPickComboRows(s) {
  const sel = new Set(comboItemsDe(s));
  const regalo = comboRegaloSetAdmin(s);
  const q = String(comboBuscaAdmin || "")
    .trim()
    .toLowerCase();
  const lista = serviciosElegiblesParaCombo(s.id).filter((srv) => {
    if (!q) return true;
    const hay = `${srv.nombre || ""} ${srv.resumen || ""}`.toLowerCase();
    return hay.includes(q);
  });
  const idsActuales = [...sel];
  return lista
    .map((srv) => {
      const otros = idsActuales.filter((id) => id !== srv.id);
      const p = precioPagado(srv, otros);
      const checked = sel.has(srv.id);
      const esRegalo = checked && regalo.has(srv.id);
      const pagadoCombo = esRegalo ? 0 : p.pagado;
      const ahorroCombo = esRegalo ? p.lista : p.ahorro;
      const agot = servicioSinStock(srv);
      const regla = esRegalo
        ? "Bonificación 100% (regalo)"
        : p.regla && p.regla.etiqueta
          ? p.regla.etiqueta
          : p.ahorro > 0
            ? "Descuento por asociación"
            : "Precio lista";
      const regaloTitle = checked ? "Bonificación 100%: el servicio queda gratis en este combo" : "Primero incluye el servicio en el combo";
      return `
        <tr class="${checked ? "combo-pick-on" : ""}${esRegalo ? " combo-pick-regalo-on" : ""}${agot ? " combo-pick-agotado" : ""}">
          <td><label class="check combo-pick-check"><input type="checkbox" data-combo-pick="${escapeAttr(srv.id)}" ${checked ? "checked" : ""} /></label></td>
          <td class="combo-pick-regalo-col"><label class="check combo-pick-regalo-check" title="${escapeAttr(regaloTitle)}"><input type="checkbox" data-combo-regalo="${escapeAttr(srv.id)}" ${esRegalo ? "checked" : ""} ${checked ? "" : "disabled"} /></label></td>
          <td><strong>${escapeText(srv.nombre)}</strong>${agot ? ` <span class="tag tag-agotado">Agotado</span>` : ""}${esRegalo ? ` <span class="tag tag-regalo-combo">Regalo</span>` : ""}</td>
          <td>${clp(srv.precio)}</td>
          <td>${checked && pagadoCombo != null ? clp(pagadoCombo) : "—"}</td>
          <td>${checked && ahorroCombo > 0 ? clp(ahorroCombo) : "—"}</td>
          <td class="muted combo-pick-regla">${escapeText(regla)}</td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="7" class="muted">No hay servicios que coincidan.</td></tr>`;
}

function htmlCatalogoPickCombo(s) {
  const rows = htmlCatalogoPickComboRows(s);
  return `
    <label class="field"><span>Buscar en catálogo</span><input id="combo-admin-busca" type="search" placeholder="Nombre del servicio" value="${escapeAttr(comboBuscaAdmin)}" autocomplete="off" /></label>
    <div class="combo-pick-wrap">
      <table class="combo-pick-table">
        <thead>
          <tr>
            <th></th>
            <th class="combo-pick-regalo-col" title="Bonificación 100%">Regalo</th>
            <th>Servicio</th>
            <th>Lista</th>
            <th>En este combo</th>
            <th>Ahorro</th>
            <th>Regla</th>
          </tr>
        </thead>
        <tbody id="combo-pick-tbody">${rows}</tbody>
      </table>
    </div>
  `;
}

let comboBuscaAdmin = "";

function htmlPrecioPreviewCombo(s) {
  const pack = preciosPackCombo(s);
  if (pack.lista <= 0) return `<div class="precio">${clp(0)}</div>`;
  if (pack.ahorro > 0) {
    return `<div class="precio-lista tachado">${clp(pack.lista)}</div><div class="precio-oferta">${clp(pack.pagado)}</div><div class="ahorro-tag">Ahorras ${clp(pack.ahorro)}</div>`;
  }
  return `<div class="precio">${clp(pack.pagado)}</div>`;
}

function renderEditorCombo() {
  $("stage").classList.remove("stage-board");
  const s = editando;
  if (!s.media) s.media = mediaServicio(s);
  const lista = mediaEditando();
  if (lista.length && (mediaEditIndex < 0 || mediaEditIndex >= lista.length)) mediaEditIndex = 0;
  const m = mediaActual();
  const sinStock = comboSinStockMiembros(s);
  $("stage").innerHTML = `
    <article class="editor editor-portada editor-servicio editor-combo">
      <div class="editor-head">
        <div class="editor-head-row">
          <div>
            <h2>${s.id ? "Editar combo" : "Nuevo combo"}</h2>
            <p class="muted">Elige servicios del catálogo. El total y el ahorro se calculan con los descuentos por asociación entre ellos.</p>
          </div>
          <button type="button" id="btn-volver-combos" class="btn-line">Volver a combos</button>
        </div>
      </div>
      <div class="editor-board">
        <div class="portada-phone editor-phone-sticky">
          <div class="home-screen portada-preview servicio-preview" id="servicio-preview">
            <div class="portada-lienzo" id="e-lienzo">${htmlPreviewMedia(m)}${htmlPreviewBotonPortadaServicio(s)}</div>
            ${htmlDotsMedia(lista.length, mediaEditIndex, s)}
            <div class="servicio-copy">
              <p class="tag tag-combo editor-tag-combo">Combo</p>
              <h2 id="pv-nombre">${escapeText(s.nombre || "Nombre del combo")}</h2>
              <p id="pv-resumen">${escapeText(s.resumen || "Resumen en la tarjeta")}</p>
              <p class="lead" id="pv-detalle">${escapeText(s.detalle || "Detalle al abrir el combo.")}</p>
              <div class="precio-fila">
                <div id="pv-precios">${htmlPrecioPreviewCombo(s)}</div>
                ${
                  sinStock
                    ? `<span class="tag tag-agotado editor-tag-agotado">Agotado</span>`
                    : `<button class="btn-add-precio" type="button" tabindex="-1">Agregar al ticket</button>`
                }
              </div>
            </div>
            ${htmlNavPortadaFalsa()}
          </div>
          ${htmlEditorNumeroSerie(s)}
        </div>
        <div class="editor-fields">
          <div class="editor-col">
            <fieldset class="canales">
              <legend>Dónde aparece este combo</legend>
              <label class="check"><input id="e-canal-ofertas" type="checkbox" ${s.canales && s.canales.ofertas ? "checked" : ""} /> Promociones</label>
              <label class="check"><input id="e-canal-mantencion" type="checkbox" ${s.canales && s.canales.mantencion ? "checked" : ""} /> Mantención preventiva</label>
              <label class="check"><input id="e-canal-diagnostico" type="checkbox" ${s.canales && s.canales.diagnostico ? "checked" : ""} /> Diagnóstico automotriz</label>
            </fieldset>
            ${htmlPortadaServicioAdmin(s, "combo")}
            <label class="field"><span>Nombre del combo</span><input id="e-nombre" type="text" value="${escapeAttr(s.nombre)}" /></label>
            ${htmlEnlaceServicioAdmin(s)}
            <label class="field"><span>Resumen (tarjeta)</span><input id="e-resumen" type="text" value="${escapeAttr(s.resumen)}" /></label>
            <label class="field"><span>Descripción</span><textarea id="e-detalle">${escapeText(s.detalle)}</textarea></label>
            <label class="field"><span>Argumento de venta</span><textarea id="e-argumento-venta" rows="4" placeholder="Frases cortas para el asistente (Vambe)…">${escapeText(s.argumento_venta || "")}</textarea></label>
            <p class="hint">Opcional. Copy del pack completo para Vambe. El desglose de ítems incluidos se arma con los argumentos de cada servicio del pack.</p>
            ${htmlVehiculosEditor(s)}
            <h3>Servicios incluidos</h3>
            <div id="combo-pick-host">${htmlCatalogoPickCombo(s)}</div>
            <div id="combo-descuento-host">${htmlDescuentoComboAdmin(s)}</div>
            <div id="combo-totales-host">${htmlTotalesComboAdmin(s)}</div>
          </div>
          <div class="editor-col">
            <h3>Fotos y videos</h3>
            <p class="hint">La foto 1 es la portada del combo en el catálogo.</p>
            <div class="portada-thumbs">${htmlMediaThumbs(lista)}</div>
            <div class="btn-row">
              <button class="btn-line" type="button" id="btn-add-foto">Agregar foto</button>
              <button class="btn-line" type="button" id="btn-add-video">Agregar video</button>
            </div>
            ${m && m.tipo === "foto" && lista.filter((x) => x.tipo === "foto").length > 1 ? `<button class="btn-primary btn-block" type="button" id="btn-media-portada">Usar esta como portada</button>` : ""}
            ${lista.length ? `<button class="btn-soft btn-block" type="button" id="btn-del-media">Quitar este</button>` : ""}
            <input id="e-foto" type="file" accept="image/*" hidden />
            <input id="e-galeria" type="file" accept="image/*" multiple hidden />
            <input id="e-video-file" type="file" accept="video/mp4,video/webm,video/quicktime" hidden />
            ${
              m && m.tipo === "foto"
                ? `<label class="field"><span>Zoom</span><input id="e-zoom" type="range" min="35" max="400" step="2" value="${Math.round(m.zoom * 100)}" /></label>
                   <label class="field"><span>Estirar ancho</span><input id="e-ancho" type="range" min="40" max="250" step="2" value="${Math.round(m.scale_x * 100)}" /></label>
                   <label class="field"><span>Estirar alto</span><input id="e-alto" type="range" min="40" max="250" step="2" value="${Math.round(m.scale_y * 100)}" /></label>
                   <button class="btn-line btn-block" type="button" id="btn-reset-media">Centrar y resetear recorte</button>`
                : m && m.tipo === "video"
                  ? `<p class="hint">Video corto en la ficha del combo.</p>`
                  : ""
            }
            <div class="btn-row">
              <button class="btn-primary" type="button" id="btn-guardar-combo-editor">Guardar combo</button>
              ${s.id ? `<button class="btn-soft" type="button" id="btn-borrar-combo">Eliminar combo</button>` : ""}
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

function leerEditorComboBasico() {
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
  editando.argumento_venta =
    $("e-argumento-venta") ? $("e-argumento-venta").value.trim() : String(editando.argumento_venta || "").trim();
  const m = mediaActual();
  if (m && m.tipo === "foto") {
    if ($("e-zoom")) m.zoom = Number($("e-zoom").value) / 100;
    if ($("e-ancho")) m.scale_x = Number($("e-ancho").value) / 100;
    if ($("e-alto")) m.scale_y = Number($("e-alto").value) / 100;
  }
  aplicarMediaServicio(editando, mediaEditando());
  editando.vehiculos = leerVehiculosEditor();
  editando.es_combo = true;
  editando.oferta_combo = false;
  editando.complementos = [];
  leerDescuentoManualComboDesdeUi();
}

function basePagadoComboSinOfertaPack(s) {
  const pack = preciosPackComboMiembros(s);
  return Math.max(0, Math.round(Number(pack.pagado) || 0));
}

function aplicarDescuentoManualCombo(pesos) {
  if (!editando) return;
  const base = basePagadoComboSinOfertaPack(editando);
  let dto = Math.max(0, Math.round(Number(pesos) || 0));
  if (dto > base) dto = base;
  if (dto <= 0 || base <= 0) {
    editando.tiene_oferta = false;
    editando.precio_oferta = null;
  } else {
    editando.tiene_oferta = true;
    editando.precio_oferta = Math.max(0, base - dto);
  }
  const pack = preciosPackCombo(editando);
  editando.precio = pack.lista;
}

function leerDescuentoManualComboDesdeUi() {
  const inp = $("combo-dto-pesos");
  if (!inp || !editando) return;
  aplicarDescuentoManualCombo(inp.value);
}

let comboDtoSyncLock = false;

function sincronizarComboDtoPesosDesdeUi() {
  if (comboDtoSyncLock || !editando) return;
  const base = basePagadoComboSinOfertaPack(editando);
  const inpP = $("combo-dto-pesos");
  const inpC = $("combo-dto-pct");
  if (!inpP) return;
  let pesos = Math.max(0, Math.round(Number(inpP.value) || 0));
  if (pesos > base) pesos = base;
  comboDtoSyncLock = true;
  if (inpC && base > 0) {
    const pct = (pesos / base) * 100;
    inpC.value = pct > 0 ? String(Math.round(pct * 100) / 100) : "";
  }
  comboDtoSyncLock = false;
  aplicarDescuentoManualCombo(pesos);
  refrescarTotalesComboEnDom();
}

function sincronizarComboDtoPctDesdeUi() {
  if (comboDtoSyncLock || !editando) return;
  const base = basePagadoComboSinOfertaPack(editando);
  const inpP = $("combo-dto-pesos");
  const inpC = $("combo-dto-pct");
  if (!inpC) return;
  let pct = Math.max(0, Math.min(100, Number(inpC.value) || 0));
  const pesos = base > 0 ? Math.round((base * pct) / 100) : 0;
  comboDtoSyncLock = true;
  if (inpP) inpP.value = pesos > 0 ? String(pesos) : "";
  comboDtoSyncLock = false;
  aplicarDescuentoManualCombo(pesos);
  refrescarTotalesComboEnDom();
}

function refrescarTotalesComboEnDom(opts) {
  const full = opts && opts.refreshDescuento;
  const tot = $("combo-totales-host");
  const pv = $("pv-precios");
  const desc = $("combo-descuento-host");
  if (tot) tot.innerHTML = htmlTotalesComboAdmin(editando);
  if (pv) pv.innerHTML = htmlPrecioPreviewCombo(editando);
  if (full && desc) desc.innerHTML = htmlDescuentoComboAdmin(editando);
}

function refrescarPickComboEnDom() {
  const tbody = $("combo-pick-tbody");
  if (tbody) {
    tbody.innerHTML = htmlCatalogoPickComboRows(editando);
  } else {
    const host = $("combo-pick-host");
    if (host) host.innerHTML = htmlCatalogoPickCombo(editando);
  }
  refrescarTotalesComboEnDom({ refreshDescuento: true });
}

function toggleComboItem(servicioId, on) {
  if (!editando) return;
  const id = String(servicioId || "").trim();
  if (!id) return;
  if (!Array.isArray(editando.combo_items)) editando.combo_items = [];
  const set = new Set(editando.combo_items.map((x) => String(x || "").trim()).filter(Boolean));
  if (on) set.add(id);
  else set.delete(id);
  editando.combo_items = [...set];
  if (!on) toggleComboRegalo(id, false);
  editando.es_combo = true;
  const pack = preciosPackCombo(editando);
  editando.precio = pack.lista;
  leerDescuentoManualComboDesdeUi();
  refrescarPickComboEnDom();
}

function toggleComboRegalo(servicioId, on) {
  if (!editando) return;
  const id = String(servicioId || "").trim();
  if (!id) return;
  const miembros = new Set(comboItemsDe(editando));
  if (!miembros.has(id)) return;
  if (!Array.isArray(editando.combo_regalo)) editando.combo_regalo = [];
  const set = new Set(editando.combo_regalo.map((x) => String(x || "").trim()).filter(Boolean));
  if (on) set.add(id);
  else set.delete(id);
  editando.combo_regalo = [...set];
  const pack = preciosPackCombo(editando);
  editando.precio = pack.lista;
  leerDescuentoManualComboDesdeUi();
  refrescarPickComboEnDom();
}

async function confirmarActivarComboRegalo(checkbox) {
  if (!checkbox || !editando || !editando.es_combo) return;
  const id = String(checkbox.dataset.comboRegalo || "").trim();
  if (!id) return;
  if (!checkbox.checked) {
    leerEditorComboBasico();
    toggleComboRegalo(id, false);
    return;
  }
  const srv = typeof servicioPorId === "function" ? servicioPorId(id) : null;
  const nombre = (srv && srv.nombre) || id;
  const precioLista = srv && srv.precio != null ? clp(srv.precio) : "—";
  const cuerpo = `<p>Vas a marcar <strong>${escapeText(nombre)}</strong> como <strong>regalo</strong> en este combo.</p>
    <p>Dentro del pack ese servicio quedará a <strong>$0</strong> (valor de lista: <strong>${precioLista}</strong>).</p>
    <p class="error">Confirma solo si quieres bonificarlo al 100%. Si fue un clic accidental, cancela.</p>`;
  let ok = false;
  if (typeof pedirConfirmacionAdmin === "function") {
    ok = await pedirConfirmacionAdmin("Bonificación 100% — ¿es regalo?", cuerpo);
  } else {
    ok = confirm(`¿Marcar «${nombre}» como regalo (100% bonificación) en este combo?`);
  }
  if (!ok) {
    checkbox.checked = false;
    return;
  }
  leerEditorComboBasico();
  toggleComboRegalo(id, true);
}

function htmlTarjetaComboAdmin(s) {
  const pack = preciosPackCombo(s);
  const agotado = servicioSinStock(s);
  const foto = fotoPortadaServicioAdmin(s);
  return `
    <article class="card admin-serv-card admin-combo-card ${agotado ? "card-agotado" : ""}">
      <button class="card-abrir" type="button" data-abrir-combo="${escapeAttr(s.id)}">
        <div class="card-photo">
          ${foto ? `<img class="card-photo-img" src="${escapeAttr(foto)}" alt="" loading="lazy" />` : ""}
          <div class="card-tags">
            <span class="tag tag-combo">Combo</span>
            ${agotado ? `<span class="tag tag-agotado">Agotado</span>` : ""}
            ${pack.ahorro > 0 ? `<span class="tag tag-dto">− ${clp(pack.ahorro)}</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          <h3>${escapeText(s.nombre || "Sin nombre")}</h3>
          <p class="muted">${idsMiembrosCombo(s).length} servicios · ${escapeText(etiquetaCanales(s))}</p>
          <div class="precio-lista tachado">${clp(pack.lista)}</div>
          <div class="precio-card-oferta">${clp(pack.pagado)}</div>
        </div>
      </button>
    </article>
  `;
}

function renderListadoCombos() {
  editando = null;
  comboBuscaAdmin = "";
  $("stage").classList.remove("stage-board");
  const combos = (catalogo || []).filter((s) => s.es_combo);
  $("stage").innerHTML = `
    <div class="admin-panel admin-panel-servicios">
      <div class="admin-panel-top">
        <div>
          <h2>Combos</h2>
          <p class="muted">Paquetes de servicios con precio y ahorro calculados por las reglas de asociación.</p>
        </div>
        <button class="btn-primary" type="button" id="btn-nuevo-combo">+ Nuevo combo</button>
      </div>
      <div id="lista-combos-panel" class="lista-servicios-panel">
        ${
          combos.length
            ? `<div class="admin-servicios-catalog"><div class="admin-servicios-grid">${combos.map(htmlTarjetaComboAdmin).join("")}</div></div>`
            : `<p class="muted">Aún no hay combos. Pulsa «+ Nuevo combo».</p>`
        }
      </div>
    </div>
  `;
}

function abrirEditorComboCatalogo(id) {
  const s = servicioPorId(id);
  if (!s || !s.es_combo) return;
  editando = normalizarServicio(JSON.parse(JSON.stringify(s)));
  mediaEditIndex = 0;
  comboBuscaAdmin = "";
  renderEditorCombo();
}

function nuevoCombo() {
  editando = comboVacio();
  mediaEditIndex = 0;
  comboBuscaAdmin = "";
  renderEditorCombo();
}

async function guardarComboPack() {
  leerEditorComboBasico();
  if (!editando.nombre) {
    alert("Escribe el nombre del combo.");
    return;
  }
  if (!editando.canales.ofertas && !editando.canales.mantencion && !editando.canales.diagnostico) {
    alert("Marca al menos un menú donde aparecerá el combo.");
    return;
  }
  if (idsMiembrosCombo(editando).length < 2) {
    alert("Selecciona al menos 2 servicios para armar el combo.");
    return;
  }
  if ((editando.vehiculos || []).some((v) => v.ano_desde != null && v.ano_hasta != null && v.ano_desde > v.ano_hasta)) {
    alert("En algún vehículo el año desde es mayor que el año hasta.");
    return;
  }
  const pack = preciosPackCombo(editando);
  editando.precio = pack.lista;
  editando.agotado = false;
  editando.ultima_unidad = false;
  editando.stock_restante = null;
  if (!editando.id) editando.id = nuevoIdServicio(editando.nombre);
  if (typeof asignarNumerosSerieCatalogo === "function") asignarNumerosSerieCatalogo(catalogo);
  if (typeof asignarNumeroSerieServicio === "function") {
    const otros = catalogo.filter((x) => x.id !== editando.id);
    asignarNumeroSerieServicio(editando, [...otros, editando]);
  }
  const copia = JSON.parse(JSON.stringify(editando));
  const idx = catalogo.findIndex((s) => s.id === copia.id);
  if (idx >= 0) catalogo[idx] = copia;
  else catalogo.push(copia);
  try {
    await sincronizarPortadaDeServicio(copia);
    await guardarCatalogo(catalogo);
    editando = copia;
    renderEditorCombo();
  } catch (e) {
    alert(e.message || "No se pudo guardar en la nube.");
  }
}

async function borrarCombo() {
  if (!editando || !editando.id) return;
  if (!confirm(`¿Eliminar el combo ${editando.nombre}?`)) return;
  catalogo = catalogo.filter((s) => s.id !== editando.id);
  try {
    await quitarPortadaDeServicio(editando.id);
    await guardarCatalogo(catalogo);
    editando = null;
    renderListadoCombos();
  } catch (e) {
    alert(e.message || "No se pudo eliminar en la nube.");
  }
}

$("btn-combos")?.addEventListener("click", renderListadoCombos);

$("stage")?.addEventListener("click", (e) => {
  if (e.target.id === "btn-nuevo-combo") {
    nuevoCombo();
    return;
  }
  if (e.target.id === "btn-volver-combos") {
    renderListadoCombos();
    return;
  }
  if (e.target.id === "btn-guardar-combo-editor") {
    guardarComboPack();
    return;
  }
  if (e.target.id === "btn-borrar-combo") {
    borrarCombo();
    return;
  }
  const abrir = e.target.closest("[data-abrir-combo]");
  if (abrir) {
    abrirEditorComboCatalogo(abrir.dataset.abrirCombo);
    return;
  }
});

$("stage")?.addEventListener("change", async (e) => {
  const pick = e.target.closest("[data-combo-pick]");
  if (pick && editando && editando.es_combo) {
    leerEditorComboBasico();
    toggleComboItem(pick.dataset.comboPick, pick.checked);
    return;
  }
  const regalo = e.target.closest("[data-combo-regalo]");
  if (regalo && editando && editando.es_combo) {
    await confirmarActivarComboRegalo(e.target);
  }
});

$("stage")?.addEventListener("input", (e) => {
  if (e.target.id === "combo-admin-busca") {
    comboBuscaAdmin = e.target.value;
    if (editando && editando.es_combo) refrescarPickComboEnDom();
    return;
  }
  if (e.target.id === "combo-dto-pesos") {
    sincronizarComboDtoPesosDesdeUi();
    return;
  }
  if (e.target.id === "combo-dto-pct") {
    sincronizarComboDtoPctDesdeUi();
    return;
  }
  if (editando && editando.es_combo && (e.target.id === "e-nombre" || e.target.id === "e-resumen" || e.target.id === "e-detalle")) {
    if (e.target.id === "e-nombre" && $("pv-nombre")) $("pv-nombre").textContent = e.target.value || "Nombre del combo";
    if (e.target.id === "e-resumen" && $("pv-resumen")) $("pv-resumen").textContent = e.target.value || "Resumen en la tarjeta";
    if (e.target.id === "e-detalle" && $("pv-detalle")) $("pv-detalle").textContent = e.target.value || "Detalle al abrir el combo.";
  }
});
