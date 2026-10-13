/**
 * Panel admin: historial de tickets guardados en Supabase (tabla tickets).
 */
"use strict";

let ticketsHistorialCache = [];
let ticketsHistorialAbiertoId = "";
/** @type {"todos"|"particular"|"salfa"|"flota"} */
let ticketsHistorialFiltro = "todos";
let ticketEditId = "";
let ticketEditRowRef = null;
let ticketSrvSuggestBlurTimer = null;

function fechaTicketAdmin(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function payloadDeFilaTicket(row) {
  const p = row && row.payload;
  if (p && typeof p === "object") return p;
  if (typeof p === "string") {
    try {
      return JSON.parse(p);
    } catch (_e) {
      return {};
    }
  }
  return {};
}

function codigoCortoTicket(code) {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length >= 6) return c.slice(-6);
  return String(code || "").trim() || "—";
}

function textoClienteTicket(p) {
  const nom = String(p.nombre_cliente || "").trim();
  const tel = String(p.telefono || "").trim();
  if (nom && tel) return `${nom} · ${tel}`;
  return nom || tel || "—";
}

function textoVehiculoTicket(p) {
  const parts = [p.marca, p.modelo, p.ano].filter(Boolean);
  if (!parts.length) return "—";
  return parts.join(" ");
}

function textoCitaTicket(p) {
  const f = String(p.fecha_cita || "").trim();
  const h = String(p.hora || "").trim();
  if (f && h) return `${f} ${h}`;
  return f || h || "—";
}

function esTicketFlota(p) {
  if (!p) return false;
  if (p.flota_id || p.ticket_flota || p.neto != null) return true;
  const sv = Array.isArray(p.servicios) ? p.servicios : [];
  return sv.some((s) => s && (s.tipo === "flota" || s.neto != null));
}

function esTicketSalfa(p) {
  if (!p) return false;
  if (String(p.ticket_flota || "").toLowerCase() === "salfa") return true;
  if (String(p.canal_webhook || "").toUpperCase() === "SALFA") return true;
  const fid = String(p.flota_id || "").trim();
  if (fid && typeof flotaPorId === "function") {
    const f = flotaPorId(fid);
    if (f && String(f.nombre || "").toLowerCase() === "salfa") return true;
    if (f && typeof flotaCanalWebhook === "function" && flotaCanalWebhook(f) === "SALFA") return true;
  }
  return false;
}

/** Clasificación para listado admin (payload guardado al generar ticket en app.js). */
function tipoTicketAdmin(p) {
  if (!esTicketFlota(p)) {
    return { key: "particular", label: "Particular", tagClass: "tag-ticket-particular" };
  }
  if (esTicketSalfa(p)) {
    return { key: "salfa", label: "SALFA", tagClass: "tag-ticket-salfa" };
  }
  let label = "Flota";
  const fid = String((p && p.flota_id) || "").trim();
  if (fid && typeof flotaPorId === "function") {
    const f = flotaPorId(fid);
    if (f && f.nombre) label = String(f.nombre);
  } else if (p && p.canal_webhook) {
    label = String(p.canal_webhook);
  }
  return { key: "flota", label, tagClass: "tag-ticket-flota" };
}

function htmlTagTipoTicket(p) {
  const t = tipoTicketAdmin(p);
  return `<span class="tag ${t.tagClass}">${escapeText(t.label)}</span>`;
}

function filaPasaFiltroTipo(row) {
  if (ticketsHistorialFiltro === "todos") return true;
  const t = tipoTicketAdmin(payloadDeFilaTicket(row));
  if (ticketsHistorialFiltro === "particular") return t.key === "particular";
  if (ticketsHistorialFiltro === "salfa") return t.key === "salfa";
  if (ticketsHistorialFiltro === "flota") return t.key === "flota";
  return true;
}

function totalTicketAdmin(p) {
  if (!p) return "—";
  if (esTicketFlota(p)) {
    const neto = Number(p.neto);
    if (Number.isFinite(neto) && neto > 0) {
      return typeof clp === "function" ? `${clp(neto)} neto + IVA` : `${neto} neto + IVA`;
    }
  }
  const t = Number(p.total);
  if (Number.isFinite(t)) return typeof clp === "function" ? clp(t) : String(t);
  return "—";
}

function resumenServiciosTicket(p) {
  const list = Array.isArray(p.servicios) ? p.servicios : [];
  if (!list.length) return "—";
  const nombres = list.map((s) => String((s && s.nombre) || "").trim()).filter(Boolean);
  if (!nombres.length) return `${list.length} ítem(s)`;
  if (nombres.length <= 2) return nombres.join(", ");
  return `${nombres.slice(0, 2).join(", ")} +${nombres.length - 2}`;
}

function filaCoincideBusqueda(row, q) {
  if (!q) return true;
  const p = payloadDeFilaTicket(row);
  const blob = [
    row.code,
    row.patente,
    row.telefono,
    p.nombre_cliente,
    p.marca,
    p.modelo,
    p.patente,
    p.telefono,
    resumenServiciosTicket(p),
    tipoTicketAdmin(p).label,
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

function htmlDetalleTicket(row) {
  const p = payloadDeFilaTicket(row);
  const servicios = Array.isArray(p.servicios) ? p.servicios : [];
  const filasSrv = servicios
    .map((s) => {
      const nom = escapeText(String((s && s.nombre) || "Servicio"));
      let precio = "—";
      if (esTicketFlota(p) && s.neto != null && Number(s.neto) > 0) {
        precio = typeof clp === "function" ? `${clp(Number(s.neto))} neto` : String(s.neto);
      } else if (s.precio != null) {
        precio = typeof clp === "function" ? clp(Number(s.precio)) : String(s.precio);
      }
      return `<tr><td>${nom}</td><td>${escapeText(precio)}</td></tr>`;
    })
    .join("");
  return `
    <div class="tickets-detalle-box">
      <p><strong>Código</strong> ${escapeText(String(row.code || ""))}</p>
      <p><strong>Tipo</strong> ${htmlTagTipoTicket(p)}${
        p.flota_id ? ` <span class="muted">· flota_id ${escapeText(String(p.flota_id))}</span>` : ""
      }</p>
      <p><strong>Cliente</strong> ${escapeText(textoClienteTicket(p))}</p>
      <p><strong>Patente</strong> ${escapeText(String(p.patente || row.patente || "—"))}</p>
      <p><strong>Vehículo</strong> ${escapeText(textoVehiculoTicket(p))}</p>
      <p><strong>Cita</strong> ${escapeText(textoCitaTicket(p))}</p>
      <p><strong>Total</strong> ${escapeText(totalTicketAdmin(p))}</p>
      ${
        p.sintoma
          ? `<p><strong>Síntoma</strong><br />${escapeText(String(p.sintoma)).replace(/\n/g, "<br />")}</p>`
          : ""
      }
      ${
        filasSrv
          ? `<table class="tickets-detalle-table"><thead><tr><th>Servicio</th><th>Precio</th></tr></thead><tbody>${filasSrv}</tbody></table>`
          : `<p class="muted">Sin detalle de servicios en el payload.</p>`
      }
    </div>`;
}

function htmlTablaTickets(filas) {
  if (!filas.length) {
    return `<p class="muted tickets-vacio">No hay tickets que coincidan con la búsqueda.</p>`;
  }
  return `
    <div class="tickets-tabla-wrap" tabindex="0" aria-label="Listado de tickets">
      <table class="tickets-tabla">
        <colgroup>
          <col class="col-fecha" />
          <col class="col-tipo" />
          <col class="col-code" />
          <col class="col-cliente" />
          <col class="col-vehiculo" />
          <col class="col-cita" />
          <col class="col-total" />
          <col class="col-servicios" />
          <col class="col-accion" />
        </colgroup>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Código</th>
            <th>Cliente</th>
            <th>Vehículo</th>
            <th>Cita</th>
            <th>Total</th>
            <th>Servicios</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filas
            .map((row) => {
              const p = payloadDeFilaTicket(row);
              const id = String(row.id || row.code || "");
              const abierto = ticketsHistorialAbiertoId === id;
              return `
            <tr class="tickets-fila${abierto ? " is-open" : ""}" data-ticket-id="${escapeText(id)}">
              <td>${escapeText(fechaTicketAdmin(row.created_at))}</td>
              <td class="tickets-col-tipo">${htmlTagTipoTicket(p)}</td>
              <td><strong>${escapeText(codigoCortoTicket(row.code))}</strong></td>
              <td>${escapeText(textoClienteTicket(p))}</td>
              <td>${escapeText(textoVehiculoTicket(p))}</td>
              <td>${escapeText(textoCitaTicket(p))}</td>
              <td>${escapeText(totalTicketAdmin(p))}</td>
              <td class="tickets-col-servicios">${escapeText(resumenServiciosTicket(p))}</td>
              <td class="tickets-col-acciones">
                <button type="button" class="btn-line btn-sm tickets-ver" data-ticket-ver="${escapeText(id)}">${abierto ? "Ocultar" : "Ver"}</button>
                <button type="button" class="btn-line btn-sm tickets-edit" data-ticket-edit="${escapeText(id)}">Editar</button>
              </td>
            </tr>
            ${
              abierto
                ? `<tr class="tickets-fila-detalle"><td colspan="9">${htmlDetalleTicket(row)}</td></tr>`
                : ""
            }`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function pintarTicketsHistorial() {
  const host = $("tickets-historial-lista");
  const meta = $("tickets-historial-meta");
  if (!host) return;
  const q = String(($("tickets-historial-busqueda") && $("tickets-historial-busqueda").value) || "")
    .trim()
    .toLowerCase();
  const filas = ticketsHistorialCache.filter((row) => filaPasaFiltroTipo(row) && filaCoincideBusqueda(row, q));
  if (meta) {
    const partes = [`${filas.length} ticket${filas.length === 1 ? "" : "s"}`];
    if (ticketsHistorialFiltro !== "todos") partes.push(`filtro: ${ticketsHistorialFiltro}`);
    if (q) partes.push(`búsqueda activa`);
    if (filas.length !== ticketsHistorialCache.length) {
      partes.push(`(de ${ticketsHistorialCache.length} en total)`);
    }
    meta.textContent = partes.join(" · ");
  }
  host.innerHTML = htmlTablaTickets(filas);
}

async function cargarTicketsHistorial() {
  if (typeof nubeListarTickets !== "function") {
    throw new Error("Falta conexión a la nube.");
  }
  ticketsHistorialCache = await nubeListarTickets({ limite: 400 });
  ticketsHistorialAbiertoId = "";
}

async function renderTicketsCreados() {
  if (typeof editando !== "undefined") editando = null;
  $("stage").classList.remove("stage-board");
  $("stage").innerHTML = `
    <div class="admin-panel admin-panel-tickets">
      <div class="admin-panel-top">
        <div>
          <h2>Tickets creados</h2>
          <p class="muted">Historial de tickets generados desde autodato.cl (tabla Supabase <code>tickets</code>).</p>
        </div>
        <button class="btn-line" type="button" id="btn-tickets-refrescar">Actualizar</button>
      </div>
      <div id="tickets-historial-estado" class="tickets-historial-estado">
        <p class="muted">Cargando…</p>
      </div>
    </div>`;

  const estado = $("tickets-historial-estado");
  if (typeof nubeActiva !== "function" || !nubeActiva()) {
    estado.innerHTML = `<p class="muted">Conecta Supabase en <code>config.js</code> para ver el historial en la nube.</p>`;
    return;
  }
  if (typeof nubeSesion === "function" && !(await nubeSesion())) {
    estado.innerHTML = `<p class="muted">Entra al panel con tu <strong>correo y clave de Supabase</strong> (no solo la clave local) para leer los tickets.</p>`;
    return;
  }

  try {
    await cargarTicketsHistorial();
    estado.innerHTML = `
      <div class="tickets-toolbar">
        <label class="field tickets-busqueda-field">
          <span>Buscar</span>
          <input id="tickets-historial-busqueda" type="search" placeholder="Código, patente, cliente, servicio…" autocomplete="off" />
        </label>
        <div class="tickets-filtros" role="group" aria-label="Filtrar por tipo">
          <button type="button" class="tickets-filtro-btn is-on" data-tickets-filtro="todos">Todos</button>
          <button type="button" class="tickets-filtro-btn" data-tickets-filtro="particular">Particular</button>
          <button type="button" class="tickets-filtro-btn" data-tickets-filtro="salfa">SALFA</button>
          <button type="button" class="tickets-filtro-btn" data-tickets-filtro="flota">Otras flotas</button>
        </div>
      </div>
      <p class="muted tickets-meta" id="tickets-historial-meta"></p>
      <div id="tickets-historial-lista" class="tickets-historial-lista"></div>`;
    $("tickets-historial-busqueda")?.addEventListener("input", () => pintarTicketsHistorial());
    document.querySelectorAll("[data-tickets-filtro]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ticketsHistorialFiltro = btn.getAttribute("data-tickets-filtro") || "todos";
        document.querySelectorAll(".tickets-filtro-btn").forEach((b) => {
          b.classList.toggle("is-on", b === btn);
        });
        pintarTicketsHistorial();
      });
    });
    $("btn-tickets-refrescar")?.addEventListener("click", () => void refrescarTicketsHistorial());
    pintarTicketsHistorial();
  } catch (e) {
    estado.innerHTML = `<p class="error">${escapeText((e && e.message) || "No se pudo cargar el historial.")}</p>
      <p class="hint">Si ves un error de permisos, ejecuta en Supabase el SQL de <code>supabase/schema.sql</code> (política <code>tickets_admin_read</code>).</p>`;
  }
}

async function refrescarTicketsHistorial() {
  const btn = $("btn-tickets-refrescar");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Actualizando…";
  }
  try {
    await cargarTicketsHistorial();
    pintarTicketsHistorial();
  } catch (e) {
    alert((e && e.message) || "No se pudo actualizar.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Actualizar";
    }
  }
}

function ticketRowPorId(id) {
  const sid = String(id || "");
  return ticketsHistorialCache.find((r) => String(r.id || r.code || "") === sid);
}

function normalizarBusquedaServicioTicket(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function flotaIdParaBusquedaTicket(p) {
  const fid = String((p && p.flota_id) || "").trim();
  if (fid) return fid;
  if (p && esTicketSalfa(p) && typeof FLOTAS !== "undefined") {
    const s = (FLOTAS || []).find((f) => String(f.nombre || "").toLowerCase() === "salfa");
    if (s) return String(s.id || "");
  }
  return "";
}

function buscarServiciosCatalogoTicket(query) {
  const tokens = normalizarBusquedaServicioTicket(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const list = typeof catalogo !== "undefined" && Array.isArray(catalogo) ? catalogo : [];
  return list
    .filter((s) => s && s.activo !== false)
    .filter((s) => {
      const hay = normalizarBusquedaServicioTicket(
        [s.nombre, s.resumen, s.tipo, s.detalle].filter(Boolean).join(" ")
      );
      return tokens.every((t) => hay.includes(t));
    })
    .slice(0, 14)
    .map((s) => {
      let precio = s.precio != null ? Number(s.precio) : null;
      if (typeof precioPagado === "function") {
        const p = precioPagado(s, []);
        if (p && p.pagado != null) precio = Number(p.pagado);
      }
      return {
        id: s.id,
        nombre: s.nombre,
        precio: Number.isFinite(precio) ? precio : null,
        neto: null,
        categoria: s.tipo === "mantencion" ? "Mantención" : s.tipo === "diagnostico" ? "Diagnóstico" : "Oferta",
      };
    });
}

function buscarServiciosParaEditarTicket(query) {
  const p = ticketEditRowRef ? payloadDeFilaTicket(ticketEditRowRef) : {};
  const flotaId = flotaIdParaBusquedaTicket(p);
  if (flotaId && typeof buscarServiciosFlota === "function") {
    return buscarServiciosFlota(flotaId, query)
      .slice(0, 14)
      .map((h) => {
        const neto = Number(h.servicio.precio) || 0;
        const precio =
          typeof precioFlotaConIva === "function" ? precioFlotaConIva(h.servicio.precio) : neto;
        return {
          id: h.servicio.id,
          nombre: h.servicio.nombre,
          precio: precio != null ? Number(precio) : null,
          neto: neto > 0 ? neto : null,
          categoria: h.categoria || "Flota",
        };
      });
  }
  if (esTicketFlota(p) && typeof FLOTAS !== "undefined" && typeof buscarServiciosFlota === "function") {
    for (const f of FLOTAS || []) {
      const hits = buscarServiciosFlota(f.id, query).slice(0, 8);
      if (hits.length) {
        return hits.map((h) => {
          const neto = Number(h.servicio.precio) || 0;
          const precio =
            typeof precioFlotaConIva === "function" ? precioFlotaConIva(h.servicio.precio) : neto;
          return {
            id: h.servicio.id,
            nombre: h.servicio.nombre,
            precio: precio != null ? Number(precio) : null,
            neto: neto > 0 ? neto : null,
            categoria: `${f.nombre || "Flota"} · ${h.categoria || ""}`.trim(),
          };
        });
      }
    }
  }
  return buscarServiciosCatalogoTicket(query);
}

function htmlSugerenciaServicioTicket(hit) {
  const precioTxt =
    hit.neto != null && hit.neto > 0
      ? typeof clp === "function"
        ? `${clp(hit.neto)} neto`
        : `${hit.neto} neto`
      : hit.precio != null && typeof clp === "function"
        ? clp(hit.precio)
        : "";
  return `<button type="button" class="ticket-srv-pick" data-pick-nombre="${escapeAttr(hit.nombre)}" data-pick-precio="${hit.precio != null ? hit.precio : ""}" data-pick-neto="${hit.neto != null ? hit.neto : ""}">
    <strong>${escapeText(hit.nombre)}</strong>
    ${hit.categoria ? `<span class="ticket-srv-pick-cat">${escapeText(hit.categoria)}</span>` : ""}
    ${precioTxt ? `<span class="ticket-srv-pick-precio">${escapeText(precioTxt)}</span>` : ""}
  </button>`;
}

function cerrarSugerenciasServicioTicket(exceptWrap) {
  document.querySelectorAll(".ticket-srv-suggest").forEach((box) => {
    if (exceptWrap && exceptWrap.contains(box)) return;
    box.hidden = true;
    box.innerHTML = "";
  });
}

function pintarSugerenciasServicioTicket(inputEl) {
  const wrap = inputEl.closest(".ticket-srv-autocomplete");
  const box = wrap && wrap.querySelector(".ticket-srv-suggest");
  if (!box) return;
  const q = String(inputEl.value || "").trim();
  if (q.length < 1) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const hits = buscarServiciosParaEditarTicket(q);
  if (!hits.length) {
    box.hidden = false;
    box.innerHTML = `<p class="muted ticket-srv-suggest-empty">Ningún servicio coincide con «${escapeText(q)}».</p>`;
    return;
  }
  box.hidden = false;
  box.innerHTML = hits.map(htmlSugerenciaServicioTicket).join("");
}

function aplicarSugerenciaServicioTicket(btn) {
  const row = btn.closest("[data-ticket-srv-row]");
  if (!row) return;
  const nom = btn.getAttribute("data-pick-nombre") || "";
  const precio = btn.getAttribute("data-pick-precio");
  const neto = btn.getAttribute("data-pick-neto");
  const inpNom = row.querySelector("[data-srv-nombre]");
  const inpPrecio = row.querySelector("[data-srv-precio]");
  const inpNeto = row.querySelector("[data-srv-neto]");
  if (inpNom) inpNom.value = nom;
  if (inpPrecio && precio !== "") inpPrecio.value = precio;
  if (inpNeto && neto !== "") inpNeto.value = neto;
  cerrarSugerenciasServicioTicket();
}

function htmlFilaServicioEdit(s, idx) {
  const nom = escapeAttr((s && s.nombre) || "");
  const precio = s && s.precio != null ? Number(s.precio) : "";
  const neto = s && s.neto != null ? Number(s.neto) : "";
  const cant = s && s.cantidad != null ? Number(s.cantidad) : 1;
  return `
    <div class="ticket-srv-row" data-ticket-srv-row="${idx}">
      <label class="field field-srv-nombre"><span>Servicio</span>
        <div class="ticket-srv-autocomplete">
          <input type="search" data-srv-nombre value="${nom}" autocomplete="off" placeholder="Escribe para buscar…" enterkeyhint="search" />
          <div class="ticket-srv-suggest" hidden></div>
        </div>
      </label>
      <label class="field field-sm"><span>Cant.</span><input type="number" min="1" step="1" data-srv-cantidad value="${cant}" /></label>
      <label class="field field-sm"><span>Precio</span><input type="number" min="0" step="1" data-srv-precio value="${precio !== "" && Number.isFinite(precio) ? precio : ""}" placeholder="CLP" /></label>
      <label class="field field-sm"><span>Neto</span><input type="number" min="0" step="1" data-srv-neto value="${neto !== "" && Number.isFinite(neto) ? neto : ""}" placeholder="Flota" /></label>
      <button type="button" class="btn-line ticket-srv-quitar" data-srv-quitar="${idx}" title="Quitar línea">×</button>
    </div>`;
}

function pintarFilasServicioEdit(servicios) {
  const host = $("ticket-edit-servicios");
  if (!host) return;
  const list = Array.isArray(servicios) ? servicios : [];
  host.innerHTML =
    list.map((s, i) => htmlFilaServicioEdit(s, i)).join("") ||
    `<p class="muted">Sin servicios. Agrega al menos uno.</p>`;
}

async function abrirEditarTicket(id) {
  const row = ticketRowPorId(id);
  if (!row) return;
  ticketEditId = String(row.id || id);
  ticketEditRowRef = row;
  const p = payloadDeFilaTicket(row);
  if (esTicketFlota(p)) {
    try {
      if (typeof ensureFlotasPublico === "function") await ensureFlotasPublico();
      else if (typeof cargarFlotasPublico === "function") await cargarFlotasPublico();
    } catch (_e) {
      /* listado puede usar catálogo */
    }
  }
  const flota = esTicketFlota(p);
  $("ticket-edit-creado").textContent = `Registro en nube: ${fechaTicketAdmin(row.created_at)} (no editable)`;
  $("ticket-edit-form").innerHTML = `
    <fieldset class="ticket-edit-section">
      <legend>Identificación</legend>
      <label class="field"><span>Código ticket</span><input id="te-code" type="text" value="${escapeAttr(row.code || p.code || "")}" /></label>
    </fieldset>
    <fieldset class="ticket-edit-section">
      <legend>Cliente</legend>
      <div class="ticket-edit-grid">
        <label class="field"><span>Nombre</span><input id="te-nombre" type="text" value="${escapeAttr(p.nombre_cliente || "")}" /></label>
        <label class="field"><span>Teléfono</span><input id="te-telefono" type="tel" value="${escapeAttr(p.telefono || row.telefono || "")}" /></label>
        <label class="field"><span>Patente</span><input id="te-patente" type="text" maxlength="8" value="${escapeAttr(p.patente || row.patente || "")}" /></label>
        <label class="field"><span>Correo</span><input id="te-correo" type="email" value="${escapeAttr(p.correo || "")}" /></label>
      </div>
      <label class="field"><span>Síntoma / falla</span><textarea id="te-sintoma" rows="3">${escapeText(p.sintoma || "")}</textarea></label>
    </fieldset>
    <fieldset class="ticket-edit-section">
      <legend>Vehículo</legend>
      <div class="ticket-edit-grid">
        <label class="field"><span>Marca</span><input id="te-marca" type="text" value="${escapeAttr(p.marca || "")}" /></label>
        <label class="field"><span>Modelo</span><input id="te-modelo" type="text" value="${escapeAttr(p.modelo || "")}" /></label>
        <label class="field"><span>Año</span><input id="te-ano" type="number" min="1950" max="2100" value="${escapeAttr(p.ano != null ? p.ano : "")}" /></label>
        <label class="field"><span>Combustible</span>
          <select id="te-combustible">
            ${["bencina", "diesel", "hibrido", "ambos"]
              .map(
                (c) =>
                  `<option value="${c}"${String(p.combustible || "ambos").toLowerCase() === c ? " selected" : ""}>${c}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
    </fieldset>
    <fieldset class="ticket-edit-section">
      <legend>Cita en taller</legend>
      <div class="ticket-edit-grid">
        <label class="field"><span>Fecha cita</span><input id="te-fecha-cita" type="date" value="${escapeAttr(p.fecha_cita || "")}" /></label>
        <label class="field"><span>Hora cita</span><input id="te-hora" type="text" placeholder="09:00" value="${escapeAttr(p.hora || "")}" /></label>
      </div>
    </fieldset>
    <fieldset class="ticket-edit-section">
      <legend>Totales</legend>
      <div class="ticket-edit-grid">
        ${
          flota
            ? `<label class="field"><span>Total neto (flota)</span><input id="te-neto" type="number" min="0" step="1" value="${escapeAttr(p.neto != null ? p.neto : "")}" /></label>
               <label class="field"><span>Entrega fecha</span><input id="te-entrega-fecha" type="date" value="${escapeAttr(p.entrega_fecha || "")}" /></label>
               <label class="field"><span>Entrega hora</span><input id="te-entrega-hora" type="text" value="${escapeAttr(p.entrega_hora || "")}" /></label>
               <label class="field"><span>Traslado</span>
                 <select id="te-traslado">
                   <option value="no"${p.traslado === "no" ? " selected" : ""}>No</option>
                   <option value="si"${p.traslado === "si" ? " selected" : ""}>Sí</option>
                 </select>
               </label>`
            : `<label class="field"><span>Subtotal lista</span><input id="te-subtotal" type="number" min="0" step="1" value="${escapeAttr(p.subtotal != null ? p.subtotal : "")}" /></label>
               <label class="field"><span>Ahorro</span><input id="te-ahorro" type="number" min="0" step="1" value="${escapeAttr(p.ahorro != null ? p.ahorro : "")}" /></label>
               <label class="field"><span>Total pagado</span><input id="te-total" type="number" min="0" step="1" value="${escapeAttr(p.total != null ? p.total : "")}" /></label>`
        }
      </div>
    </fieldset>
    <fieldset class="ticket-edit-section">
      <legend>Servicios en ticket</legend>
      <div id="ticket-edit-servicios"></div>
      <button type="button" class="btn-line" id="btn-ticket-srv-add">+ Agregar servicio</button>
    </fieldset>
    <details class="ticket-edit-avanzado">
      <summary>Otros campos del JSON (avanzado)</summary>
      <label class="field"><span>Payload extra (JSON)</span><textarea id="te-payload-extra" rows="6" class="ticket-edit-json">${escapeText(JSON.stringify(p, null, 2))}</textarea></label>
      <p class="hint">Al guardar desde el formulario se actualizan los campos de arriba y se fusionan con este JSON. Revisa que el JSON sea válido si lo editas manualmente.</p>
    </details>`;
  pintarFilasServicioEdit(p.servicios);
  $("modal-ticket-edit").hidden = false;
}

function cerrarEditarTicket() {
  ticketEditId = "";
  ticketEditRowRef = null;
  cerrarSugerenciasServicioTicket();
  if ($("modal-ticket-edit")) $("modal-ticket-edit").hidden = true;
}

function leerServiciosDesdeFormEdit(originales) {
  const rows = [...document.querySelectorAll("#ticket-edit-servicios [data-ticket-srv-row]")];
  const orig = Array.isArray(originales) ? originales : [];
  return rows.map((row, i) => {
    const base = orig[i] && typeof orig[i] === "object" ? { ...orig[i] } : {};
    const nom = row.querySelector("[data-srv-nombre]");
    const precio = row.querySelector("[data-srv-precio]");
    const neto = row.querySelector("[data-srv-neto]");
    const cant = row.querySelector("[data-srv-cantidad]");
    base.nombre = nom ? nom.value.trim() : "";
    const pVal = precio && precio.value !== "" ? Number(precio.value) : null;
    base.precio = Number.isFinite(pVal) ? pVal : null;
    const nVal = neto && neto.value !== "" ? Number(neto.value) : null;
    if (Number.isFinite(nVal)) base.neto = nVal;
    else if (base.neto === undefined) delete base.neto;
    const cVal = cant && cant.value !== "" ? Number(cant.value) : 1;
    base.cantidad = Number.isFinite(cVal) && cVal > 0 ? cVal : 1;
    return base;
  });
}

function armarPayloadDesdeFormEdit(row) {
  const prev = payloadDeFilaTicket(row);
  let p = { ...prev };
  const extraRaw = $("te-payload-extra") && $("te-payload-extra").value.trim();
  if (extraRaw) {
    try {
      p = { ...p, ...JSON.parse(extraRaw) };
    } catch (_e) {
      throw new Error("El JSON avanzado no es válido.");
    }
  }
  const code = ($("te-code") && $("te-code").value.trim()) || String(row.code || "");
  if (!code) throw new Error("El código del ticket es obligatorio.");
  p.code = code;
  p.folio = code;
  p.nombre_cliente = ($("te-nombre") && $("te-nombre").value.trim()) || "";
  p.telefono = ($("te-telefono") && $("te-telefono").value.trim()) || "";
  p.patente = ($("te-patente") && $("te-patente").value.trim().toUpperCase()) || null;
  p.correo = ($("te-correo") && $("te-correo").value.trim()) || null;
  p.sintoma = ($("te-sintoma") && $("te-sintoma").value.trim()) || null;
  p.marca = ($("te-marca") && $("te-marca").value.trim()) || "";
  p.modelo = ($("te-modelo") && $("te-modelo").value.trim()) || "";
  const ano = $("te-ano") && $("te-ano").value !== "" ? Number($("te-ano").value) : null;
  p.ano = Number.isFinite(ano) ? ano : null;
  p.combustible = ($("te-combustible") && $("te-combustible").value) || "ambos";
  p.fecha_cita = ($("te-fecha-cita") && $("te-fecha-cita").value) || "";
  p.hora = ($("te-hora") && $("te-hora").value.trim()) || "";
  p.servicios = leerServiciosDesdeFormEdit(prev.servicios);
  if ($("te-neto")) {
    const neto = $("te-neto").value !== "" ? Number($("te-neto").value) : null;
    p.neto = Number.isFinite(neto) ? neto : null;
    p.entrega_fecha = ($("te-entrega-fecha") && $("te-entrega-fecha").value) || "";
    p.entrega_hora = ($("te-entrega-hora") && $("te-entrega-hora").value.trim()) || "";
    p.traslado = ($("te-traslado") && $("te-traslado").value) || "no";
  } else {
    const sub = $("te-subtotal").value !== "" ? Number($("te-subtotal").value) : null;
    const aho = $("te-ahorro").value !== "" ? Number($("te-ahorro").value) : null;
    const tot = $("te-total").value !== "" ? Number($("te-total").value) : null;
    if (Number.isFinite(sub)) p.subtotal = sub;
    if (Number.isFinite(aho)) p.ahorro = aho;
    if (Number.isFinite(tot)) p.total = tot;
  }
  p.editado_admin_en = new Date().toISOString();
  return {
    code,
    patente: p.patente,
    telefono: p.telefono,
    payload: p,
  };
}

async function confirmarEliminarTicketAdmin(row) {
  const p = payloadDeFilaTicket(row);
  const code = codigoCortoTicket(row.code || p.code);
  const cliente = textoClienteTicket(p);
  const cuerpo = `<p>Se borrará de forma permanente el ticket <strong>#${escapeText(code)}</strong>${cliente !== "—" ? ` (${escapeText(cliente)})` : ""}.</p><p class="muted">Esta acción no se puede deshacer.</p>`;
  if (typeof pedirConfirmacionAdmin === "function") {
    return pedirConfirmacionAdmin("Eliminar ticket", cuerpo);
  }
  return window.confirm(`¿Eliminar el ticket #${code} de forma permanente?`);
}

async function eliminarEditarTicket() {
  const row = ticketRowPorId(ticketEditId);
  if (!row) return;
  if (typeof nubeEliminarTicket !== "function") {
    alert("No hay conexión para eliminar en Supabase.");
    return;
  }
  const ok = await confirmarEliminarTicketAdmin(row);
  if (!ok) return;
  const btn = $("btn-ticket-edit-eliminar");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Eliminando…";
  }
  try {
    const borrar = async () => nubeEliminarTicket(row.id);
    if (typeof adminGuardando === "function") {
      await adminGuardando("Eliminando ticket…", borrar);
    } else {
      await borrar();
    }
    ticketsHistorialCache = ticketsHistorialCache.filter((r) => String(r.id) !== String(row.id));
    if (String(ticketsHistorialAbiertoId) === String(row.id)) ticketsHistorialAbiertoId = "";
    cerrarEditarTicket();
    pintarTicketsHistorial();
  } catch (e) {
    alert((e && e.message) || "No se pudo eliminar. ¿Ejecutaste la política tickets_admin_delete en Supabase?");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Eliminar ticket";
    }
  }
}

async function guardarEditarTicket() {
  const row = ticketRowPorId(ticketEditId);
  if (!row) return;
  if (typeof nubeActualizarTicket !== "function") {
    alert("No hay conexión para guardar en Supabase.");
    return;
  }
  let datos;
  try {
    datos = armarPayloadDesdeFormEdit(row);
  } catch (e) {
    alert(e.message || "Revisa los datos del formulario.");
    return;
  }
  const btn = $("btn-ticket-edit-guardar");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Guardando…";
  }
  try {
    const guardar = async () => nubeActualizarTicket(row.id, datos);
    if (typeof adminGuardando === "function") {
      await adminGuardando("Guardando ticket…", guardar);
    } else {
      await guardar();
    }
    const idx = ticketsHistorialCache.findIndex((r) => String(r.id) === String(row.id));
    const actualizado = {
      ...row,
      code: datos.code,
      patente: datos.patente,
      telefono: datos.telefono,
      payload: datos.payload,
    };
    if (idx >= 0) ticketsHistorialCache[idx] = actualizado;
    cerrarEditarTicket();
    pintarTicketsHistorial();
  } catch (e) {
    alert((e && e.message) || "No se pudo guardar. ¿Ejecutaste la política tickets_admin_update en Supabase?");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Guardar cambios";
    }
  }
}

document.addEventListener("click", (e) => {
  const filtroBtn = e.target.closest("[data-tickets-filtro]");
  if (filtroBtn) return;
  const editBtn = e.target.closest("[data-ticket-edit]");
  if (editBtn) {
    void abrirEditarTicket(editBtn.getAttribute("data-ticket-edit") || "");
    return;
  }
  const quitarSrv = e.target.closest("[data-srv-quitar]");
  if (quitarSrv) {
    quitarSrv.closest("[data-ticket-srv-row]")?.remove();
    return;
  }
  const ver = e.target.closest("[data-ticket-ver]");
  if (!ver) return;
  const id = ver.getAttribute("data-ticket-ver") || "";
  ticketsHistorialAbiertoId = ticketsHistorialAbiertoId === id ? "" : id;
  pintarTicketsHistorial();
});

$("cerrar-ticket-edit")?.addEventListener("click", cerrarEditarTicket);
$("btn-ticket-edit-cancel")?.addEventListener("click", cerrarEditarTicket);
$("btn-ticket-edit-guardar")?.addEventListener("click", () => void guardarEditarTicket());
$("btn-ticket-edit-eliminar")?.addEventListener("click", () => void eliminarEditarTicket());
document.addEventListener("click", (e) => {
  if (e.target.id === "btn-ticket-srv-add") {
    const host = $("ticket-edit-servicios");
    if (!host) return;
    if (host.querySelector(".muted")) host.innerHTML = "";
    const idx = host.querySelectorAll("[data-ticket-srv-row]").length;
    host.insertAdjacentHTML("beforeend", htmlFilaServicioEdit({ nombre: "", precio: null }, idx));
  }
});

document.addEventListener(
  "input",
  (e) => {
    if (!e.target.matches("[data-srv-nombre]")) return;
    if (!$("modal-ticket-edit") || $("modal-ticket-edit").hidden) return;
    pintarSugerenciasServicioTicket(e.target);
  },
  true
);

document.addEventListener(
  "focusin",
  (e) => {
    if (!e.target.matches("[data-srv-nombre]")) return;
    if (!$("modal-ticket-edit") || $("modal-ticket-edit").hidden) return;
    if (ticketSrvSuggestBlurTimer) {
      clearTimeout(ticketSrvSuggestBlurTimer);
      ticketSrvSuggestBlurTimer = null;
    }
    pintarSugerenciasServicioTicket(e.target);
  },
  true
);

document.addEventListener(
  "focusout",
  (e) => {
    if (!e.target.matches("[data-srv-nombre]")) return;
    const next = e.relatedTarget;
    if (next && next.closest && next.closest(".ticket-srv-suggest")) return;
    ticketSrvSuggestBlurTimer = setTimeout(() => cerrarSugerenciasServicioTicket(), 200);
  },
  true
);

document.addEventListener(
  "mousedown",
  (e) => {
    const pick = e.target.closest(".ticket-srv-pick");
    if (!pick) return;
    if (ticketSrvSuggestBlurTimer) {
      clearTimeout(ticketSrvSuggestBlurTimer);
      ticketSrvSuggestBlurTimer = null;
    }
    e.preventDefault();
    aplicarSugerenciaServicioTicket(pick);
  },
  true
);

$("btn-tickets-creados")?.addEventListener("click", () => {
  void renderTicketsCreados();
});
