/**
 * Motor único de precios, descuentos por asociación, promociones temporales y combos.
 * Usado por Node (asistente-precios) y por el navegador (script global vía UMD).
 *
 * Prioridad entre reglas en precioPagado (misma lógica que el backend histórico):
 * 1) Oferta fija (precio_oferta en extras)
 * 2) Reglas de asociación (complementos / descuentos: otro servicio en carrito)
 * 3) Lista = valorNormalDe(s) (precio o neto+IVA)
 * 4) Promoción temporal (tabla promociones): gana por menor tierReglaPrecio; empate = menor precio
 *
 * Nota: `descuentos` en el objeto servicio (además de complementos) se fusionan en reglasComboDe
 * para alinear con el cliente histórico (catalogo.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AUTODATO_PRICING_ENGINE = factory();
  }
})(typeof self !== "undefined" ? self : this, function pricingEngineFactory() {
  "use strict";

  const PRICING_ENGINE = "1.0.0";

  function normalizarCombustible(v) {
    const t = String(v || "").toLowerCase();
    if (t === "diesel" || t === "diésel" || t === "diesell") return "diesel";
    if (t === "bencina" || t === "bencinero" || t === "gasolina") return "bencina";
    if (t === "hibrido" || t === "híbrido" || t === "hybrid") return "hibrido";
    return "ambos";
  }

  function tieneOferta(item) {
    if (!item) return false;
    if (item.tiene_oferta === false) return false;
    const v = Number(item.precio_oferta);
    const precioReal = Number.isFinite(v) && v > 0;
    if (item.tiene_oferta === true) return precioReal;
    return precioReal && item.precio != null && v < Number(item.precio);
  }

  function precioOfertaDe(item) {
    if (!tieneOferta(item)) return null;
    const v = Number(item && item.precio_oferta);
    if (!Number.isFinite(v) || v <= 0) return null;
    if (item && item.precio != null && v >= Number(item.precio)) return null;
    return v;
  }

  function createPricingRuntime(ctx) {
    const catalogo = (ctx && ctx.catalogo) || [];
    const tableroColumnas = (ctx && ctx.tableroColumnas) || [];
    const promocionesVigentes = (ctx && ctx.promocionesVigentes) || [];
    const ANIO_MAX = new Date().getFullYear();
    const ANIO_MIN = 2010;

    function combustibleCoincide(a, b) {
      const x = normalizarCombustible(a);
      const y = normalizarCombustible(b || "ambos");
      return x === "ambos" || y === "ambos" || x === y;
    }

    function anioONull(v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1950 || n > 2100) return null;
      return n;
    }

    function normalizarVehiculos(lista) {
      if (!Array.isArray(lista)) return [];
      return lista
        .map((v) => {
          if (!v || !v.marca) return null;
          const oil =
            v.oil_liters != null && Number.isFinite(Number(v.oil_liters))
              ? Number(v.oil_liters)
              : v.litros_aceite != null && Number.isFinite(Number(v.litros_aceite))
                ? Number(v.litros_aceite)
                : null;
          return {
            marca: String(v.marca),
            modelo: String(v.modelo || "*"),
            ano_desde: anioONull(v.ano_desde),
            ano_hasta: anioONull(v.ano_hasta),
            combustible: normalizarCombustible(v.combustible),
            ...(oil != null ? { oil_liters: oil } : {}),
          };
        })
        .filter(Boolean);
    }

    function anioEnRango(ano, v) {
      if (ano == null || ano === "") return true;
      const n = Number(ano);
      if (!Number.isFinite(n)) return true;
      if (v.ano_desde != null && n < v.ano_desde) return false;
      if (v.ano_hasta != null && n > v.ano_hasta) return false;
      return true;
    }

    function idsDeColumna(col, campo) {
      if (!col || !Array.isArray(col[campo])) return [];
      return col[campo].map(String).filter(Boolean);
    }

    function tokenTarjetaColumna(tipo, id) {
      return `${tipo === "portada" ? "p" : "s"}:${String(id || "")}`;
    }

    function itemOcultoEnColumna(col, tipo, id) {
      const ocultos = Array.isArray(col && col.ocultos) ? col.ocultos : [];
      return ocultos.includes(tokenTarjetaColumna(tipo, id));
    }

    function vehiculoEnColumna(v, col) {
      if (!v || !col || !v.marca || !v.modelo) return false;
      if (String(v.marca).toLowerCase() !== String(col.marca).toLowerCase()) return false;
      if (String(v.modelo).toLowerCase() !== String(col.modelo).toLowerCase()) return false;
      if (v.ano != null && v.ano !== "" && !anioEnRango(v.ano, col)) return false;
      return combustibleCoincide(v.combustible, col.combustible);
    }

    function columnaDeVehiculo(v) {
      if (!v || !v.marca || !v.modelo) return null;
      const candidatos = tableroColumnas.filter((c) => vehiculoEnColumna(v, c));
      if (!candidatos.length) return null;
      if (candidatos.length === 1) return candidatos[0];
      if (v.ano != null && v.ano !== "") {
        const estrecho = candidatos
          .map((c) => ({
            c,
            span:
              (c.ano_hasta != null ? c.ano_hasta : ANIO_MAX) - (c.ano_desde != null ? c.ano_desde : ANIO_MIN),
          }))
          .sort((a, b) => a.span - b.span)[0];
        if (estrecho) return estrecho.c;
      }
      return candidatos[0];
    }

    function evalCompatibilidadServicioVehiculo(s, vehiculo) {
      if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) {
        return { aplica: false, motivo: "Falta marca o modelo del vehículo", via: null, col: null, matching_destinos: [] };
      }
      if (vehiculo.ano == null || vehiculo.ano === "" || !Number.isFinite(Number(vehiculo.ano))) {
        return { aplica: false, motivo: "Falta año del vehículo", via: null, col: null, matching_destinos: [] };
      }
      if (!s || s.activo === false) {
        return { aplica: false, motivo: "Servicio inactivo", via: null, col: null, matching_destinos: [] };
      }
      const col = columnaDeVehiculo(vehiculo);
      const id = String(s.id || "");
      if (col) {
        if (itemOcultoEnColumna(col, "servicio", id)) {
          return { aplica: false, motivo: "No disponible para este vehículo en el taller", via: "columna", col, matching_destinos: [] };
        }
        if (!idsDeColumna(col, "servicios").includes(id)) {
          return {
            aplica: false,
            motivo: "Este servicio no está habilitado para ese modelo en el catálogo",
            via: "columna",
            col,
            matching_destinos: [],
          };
        }
        return { aplica: true, motivo: "", via: "columna", col, matching_destinos: [] };
      }
      const destinos = normalizarVehiculos(s.vehiculos);
      if (!destinos.length) return { aplica: true, motivo: "", via: "generico", col: null, matching_destinos: [] };
      const matching_destinos = destinos.filter((v) => {
        if (v.marca !== vehiculo.marca) return false;
        if (v.modelo !== "*" && v.modelo !== vehiculo.modelo) return false;
        if (!anioEnRango(vehiculo.ano, v)) return false;
        return combustibleCoincide(v.combustible, vehiculo.combustible);
      });
      if (matching_destinos.length) {
        return { aplica: true, motivo: "", via: "lista_vehiculos", col: null, matching_destinos };
      }
      return {
        aplica: false,
        motivo: "No aplica a la marca, modelo, año o combustible indicados",
        via: "lista_vehiculos",
        col: null,
        matching_destinos: [],
      };
    }

    function servicioAplicaAVehiculo(s, vehiculo) {
      const r = evalCompatibilidadServicioVehiculo(s, vehiculo);
      return { aplica: r.aplica, motivo: r.motivo };
    }

    function numeroSerieDe(s) {
      const n = Number(s && s.numero_serie);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.floor(n);
    }

    function formatoNumeroSerie(n) {
      const v = Number(n);
      if (!Number.isFinite(v) || v <= 0) return "0000";
      return String(Math.floor(v)).padStart(4, "0");
    }

    function servicioPorId(id) {
      return catalogo.find((s) => s.id === id);
    }

    function servicioPorNumeroSerie(cod) {
      const n = parseInt(String(cod || "").replace(/\D/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return catalogo.find((s) => numeroSerieDe(s) === n) || null;
    }

    function comboItemsDe(s) {
      if (!s || !Array.isArray(s.combo_items)) return [];
      return s.combo_items.map((x) => String(x || "").trim()).filter(Boolean);
    }

    function esServicioCombo(s) {
      return Boolean(s && s.es_combo && comboItemsDe(s).length >= 2);
    }

    function ventaInsumo(ins) {
      const costo = Number(ins && ins.costo) || 0;
      const pct = Number(ins && ins.porcentaje) || 0;
      return Math.round(costo * (1 + pct / 100));
    }

    function netoServicioDe(s) {
      const labor = Number(s && s.mano_obra) || 0;
      const insumos = (s && s.insumos ? s.insumos : []).reduce((acc, ins) => acc + ventaInsumo(ins), 0);
      if (labor > 0 || insumos > 0) return labor + insumos;
      return 0;
    }

    function ivaDeNeto(neto) {
      return Math.round(Number(neto) * 0.19);
    }

    function totalServicioDe(s) {
      const neto = netoServicioDe(s);
      if (neto > 0) return neto + ivaDeNeto(neto);
      return Number(s && s.precio) || 0;
    }

    function valorNormalDe(s) {
      const total = totalServicioDe(s);
      if (total > 0) return total;
      return Number(s && s.precio) || 0;
    }

    function usaOfertaCombo(item) {
      if (!item) return true;
      if (item.oferta_combo === false) return false;
      return true;
    }

    function reglasComboDe(itemId) {
      const reglas = [];
      catalogo.forEach((s) => {
        if (!usaOfertaCombo(s)) return;
        (s.complementos || []).forEach((c) => {
          if (c.id === itemId && Number(c.precioCombo) > 0) {
            reglas.push({
              si: s.id,
              precio: Number(c.precioCombo),
              etiqueta: c.etiqueta || `con ${s.nombre}`,
            });
          }
        });
        if (s.id === itemId) {
          (s.descuentos || []).forEach((d) => reglas.push(d));
        }
      });
      return reglas;
    }

    function combosEntrantesDe(itemId) {
      return reglasComboDe(itemId).filter((r) => r.si && r.precio > 0);
    }

    function tierReglaPrecio(regla) {
      if (!regla) return 4;
      if (regla.tipo === "promocion_temporal") return 1;
      if (regla.tipo === "asociacion") return 2;
      if (regla.tipo === "oferta_fija") return 3;
      return 4;
    }

    function mejorPrecioEntre(a, b) {
      if (!a) return b;
      if (!b) return a;
      const ta = tierReglaPrecio(a.regla);
      const tb = tierReglaPrecio(b.regla);
      if (ta !== tb) return ta < tb ? a : b;
      const pa = Number(a.pagado);
      const pb = Number(b.pagado);
      if (pa !== pb) return pa < pb ? a : b;
      return a;
    }

    function promocionTemporalVigente(p, nowMs) {
      if (!p || !p.activo) return false;
      if (p.fecha_inicio && new Date(p.fecha_inicio).getTime() > nowMs) return false;
      if (p.fecha_fin && new Date(p.fecha_fin).getTime() < nowMs) return false;
      if (p.cupos != null && p.cupos_usados != null && p.cupos_usados >= p.cupos) return false;
      return true;
    }

    function promocionAplicaVehiculoPromo(p, vehiculo) {
      if (!vehiculo || !vehiculo.marca || !vehiculo.modelo) return false;
      if (p.marca && String(p.marca).toLowerCase() !== String(vehiculo.marca).toLowerCase()) return false;
      if (p.modelo && p.modelo !== "*" && String(p.modelo).toLowerCase() !== String(vehiculo.modelo).toLowerCase())
        return false;
      if (!anioEnRango(vehiculo.ano, { ano_desde: p.ano_desde, ano_hasta: p.ano_hasta })) return false;
      if (p.combustible && p.combustible !== "ambos" && !combustibleCoincide(p.combustible, vehiculo.combustible))
        return false;
      return true;
    }

    function precioDesdePromocionTemporal(p, lista, pagadoActual) {
      const t = String(p.tipo_regla || "precio_fijo").toLowerCase();
      if (t === "porcentaje" && p.porcentaje_descuento != null) {
        const pct = Number(p.porcentaje_descuento);
        if (!Number.isFinite(pct) || pct <= 0) return null;
        return Math.round(lista * (1 - pct / 100));
      }
      if (p.precio_fijo != null && Number(p.precio_fijo) > 0) return Math.round(Number(p.precio_fijo));
      return Math.min(pagadoActual, lista);
    }

    function aplicarMejorPromocionTemporal(item, vehiculo, base, idsCarrito) {
      const now = Date.now();
      let best = base;
      (promocionesVigentes || []).forEach((p) => {
        if (!p || p.servicio_id !== item.id) return;
        if (!promocionTemporalVigente(p, now)) return;
        if (!promocionAplicaVehiculoPromo(p, vehiculo)) return;
        if (p.condicion_combo_servicio_id && !(idsCarrito || []).includes(String(p.condicion_combo_servicio_id)))
          return;
        const pag = precioDesdePromocionTemporal(p, base.lista, base.pagado);
        if (pag == null || pag >= base.lista) return;
        const candidate = {
          lista: base.lista,
          pagado: pag,
          ahorro: Math.max(0, base.lista - pag),
          regla: {
            tipo: "promocion_temporal",
            etiqueta: p.nombre || "Promoción temporal",
            precio: pag,
            promocion_id: p.id,
            promocion_nombre: p.nombre || null,
            prioridad: p.prioridad,
          },
        };
        best = mejorPrecioEntre(best, candidate);
      });
      return best;
    }

    function nombreServicioDe(id) {
      const s = servicioPorId(id);
      return (s && s.nombre) || String(id || "");
    }

    function precioPagado(item, idsCarrito, vehiculo, opts) {
      if (!item || item.precio == null) {
        return {
          lista: null,
          pagado: null,
          ahorro: 0,
          regla: null,
          precio_antes_capa_temporal: null,
          precio_referencia_anterior: null,
        };
      }
      const o = opts && typeof opts === "object" ? opts : {};
      let pagado = item.precio;
      let regla = null;
      const oferta = precioOfertaDe(item);
      if (oferta != null) {
        pagado = oferta;
        regla = { tipo: "oferta_fija", etiqueta: "Descuento de ocasión", precio: oferta };
      }
      reglasComboDe(item.id).forEach((d) => {
        if ((idsCarrito || []).includes(d.si) && d.precio > 0 && d.precio < pagado) {
          pagado = d.precio;
          regla = {
            tipo: "asociacion",
            etiqueta: `Incluye descuento al realizar servicio de ${nombreServicioDe(d.si)}`,
            precio: d.precio,
            servicio_requerido_id: d.si,
          };
        }
      });
      const lista = valorNormalDe(item);
      const precioAntesCapaTemporal = pagado;
      const base = { lista, pagado, ahorro: Math.max(0, lista - pagado), regla };

      if (o.sinPromocionTemporal || !promocionesVigentes.length) {
        const prev = regla && (regla.tipo === "asociacion" || regla.tipo === "oferta_fija") ? lista : lista;
        return {
          ...base,
          precio_antes_capa_temporal: precioAntesCapaTemporal,
          precio_referencia_anterior: prev,
        };
      }

      const final = aplicarMejorPromocionTemporal(item, vehiculo, base, idsCarrito);
      let precioRefAnterior = lista;
      if (final.regla && final.regla.tipo === "promocion_temporal") {
        precioRefAnterior = precioAntesCapaTemporal;
      }
      return {
        ...final,
        precio_antes_capa_temporal: precioAntesCapaTemporal,
        precio_referencia_anterior: precioRefAnterior,
      };
    }

    function preciosPackCombo(s, vehiculoOpt) {
      const ids = comboItemsDe(s);
      let lista = 0;
      let pagado = 0;
      const lineas = [];
      ids.forEach((id) => {
        const item = servicioPorId(id);
        if (!item || item.precio == null) return;
        const otros = ids.filter((x) => x !== id);
        const p = precioPagado(item, otros, vehiculoOpt || null, {});
        if (p.lista == null || p.pagado == null) return;
        lista += p.lista;
        pagado += p.pagado;
        lineas.push({ id, nombre: item.nombre || id, ...p });
      });
      return { lista, pagado, ahorro: Math.max(0, lista - pagado), lineas };
    }

    function idsMiembrosCombo(s) {
      return comboItemsDe(s);
    }

    function idsServiciosEnCarrito(carrito, excluirServicioId) {
      const ids = [];
      const push = (id) => {
        const sid = String(id || "");
        if (!sid || sid === String(excluirServicioId || "")) return;
        if (!ids.includes(sid)) ids.push(sid);
      };
      (carrito || []).forEach((linea) => {
        if (linea.tipo !== "oferta") return;
        if (linea.esComboLinea) {
          const combo = servicioPorId(linea.id);
          if (combo && esServicioCombo(combo)) idsMiembrosCombo(combo).forEach(push);
          return;
        }
        push(linea.id);
      });
      return ids;
    }

    function calcularCarrito(carrito, vehiculoOpt) {
      const items = [];
      let subtotal = 0;
      let total = 0;
      let ahorro = 0;
      carrito.forEach((linea) => {
        if (linea.tipo !== "oferta") return;
        if (linea.esComboLinea) {
          const combo = servicioPorId(linea.id);
          if (!combo || !esServicioCombo(combo)) return;
          const pack = preciosPackCombo(combo, vehiculoOpt);
          items.push({
            id: combo.id,
            codigo: formatoNumeroSerie(numeroSerieDe(combo)),
            nombre: combo.nombre,
            es_combo: true,
            lista: pack.lista,
            pagado: pack.pagado,
            ahorro: pack.ahorro,
            regla: null,
          });
          subtotal += pack.lista;
          total += pack.pagado;
          ahorro += pack.ahorro;
          return;
        }
        const s = servicioPorId(linea.id);
        if (!s || esServicioCombo(s)) return;
        const otros = idsServiciosEnCarrito(carrito, linea.id);
        const p = precioPagado(s, otros, vehiculoOpt || null, {});
        items.push({
          id: s.id,
          codigo: formatoNumeroSerie(numeroSerieDe(s)),
          nombre: s.nombre,
          es_combo: false,
          lista: p.lista,
          pagado: p.pagado,
          ahorro: p.ahorro,
          regla: p.regla,
        });
        subtotal += p.lista || 0;
        total += p.pagado || 0;
        ahorro += p.ahorro || 0;
      });
      return { items, subtotal_lista: subtotal, total_pagado: total, ahorro_total: ahorro };
    }

    function mejorComboEntrante(item, pagadoActual) {
      const tope = pagadoActual == null ? Infinity : Number(pagadoActual);
      return combosEntrantesDe(item && item.id)
        .filter((r) => r.precio < tope)
        .sort((a, b) => a.precio - b.precio)[0] || null;
    }

    return {
      PRICING_ENGINE,
      catalogo,
      tableroColumnas,
      promocionesVigentes,
      normalizarCombustible,
      evalCompatibilidadServicioVehiculo,
      servicioAplicaAVehiculo,
      numeroSerieDe,
      formatoNumeroSerie,
      servicioPorId,
      servicioPorNumeroSerie,
      comboItemsDe,
      esServicioCombo,
      reglasComboDe,
      combosEntrantesDe,
      tieneOferta,
      precioOfertaDe,
      valorNormalDe,
      precioPagado,
      preciosPackCombo,
      idsServiciosEnCarrito,
      idsMiembrosCombo,
      calcularCarrito,
      mejorComboEntrante,
      nombreServicioDe,
      promocionTemporalVigente,
    };
  }

  return {
    PRICING_ENGINE,
    createPricingRuntime,
    normalizarCombustible,
    tieneOferta,
    precioOfertaDe,
  };
});
