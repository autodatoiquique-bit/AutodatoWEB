/**
 * Pruebas del motor Vambe (fetch mockeado; no llama a Supabase real).
 * Ejecutar: npm test
 */
"use strict";

const { test, before, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const SUPABASE = "https://test.supabase.co";

function promosRows() {
  const now = Date.now();
  const past = new Date(now - 86400000).toISOString();
  const future = new Date(now + 86400000 * 30).toISOString();
  return [
    {
      id: "promo-vigente",
      nombre: "Promo test 0003",
      activo: true,
      fecha_inicio: past,
      fecha_fin: future,
      prioridad: 10,
      servicio_id: "a3",
      tipo_regla: "precio_fijo",
      precio_fijo: 99999,
      marca: "Hyundai",
      modelo: "Santa Fe",
      ano_desde: 2010,
      ano_hasta: 2020,
      combustible: "diesel",
      cupos: null,
      cupos_usados: 0,
      condicion_combo_servicio_id: null,
    },
    {
      id: "promo-vencida",
      nombre: "Promo vieja",
      activo: true,
      fecha_inicio: "2020-01-01T00:00:00.000Z",
      fecha_fin: "2020-06-01T00:00:00.000Z",
      prioridad: 5,
      servicio_id: "a3",
      tipo_regla: "precio_fijo",
      precio_fijo: 1,
      marca: null,
      modelo: null,
      ano_desde: null,
      ano_hasta: null,
      combustible: "ambos",
      cupos: null,
      cupos_usados: 0,
      condicion_combo_servicio_id: null,
    },
  ];
}

function buildExtras(opts) {
  const o = opts || {};
  return {
    _tablero_columnas: o.columnas || [
      {
        marca: "Hyundai",
        modelo: "Santa Fe",
        ano_desde: 2010,
        ano_hasta: 2026,
        combustible: "ambos",
        servicios: ["a1", "a2", "a3", "a9"],
        ocultos: o.ocultos || [],
        portadas: [],
        orden_tarjetas: [],
      },
    ],
    a1: o.a1 || { numero_serie: 1, tiene_oferta: false },
    a2: o.a2 || { numero_serie: 2, es_combo: true, combo_items: ["a1", "a9"] },
    a3: o.a3 || { numero_serie: 3 },
    a9: o.a9 || { numero_serie: 9 },
  };
}

function mockCatalogFetch(extraOpts) {
  const servicios = [
    { id: "a1", tipo: "oferta", nombre: "Servicio 0001", precio: 100000, activo: true },
    { id: "a2", tipo: "oferta", nombre: "Combo 0002", precio: 450000, activo: true },
    { id: "a3", tipo: "oferta", nombre: "Servicio 0003", precio: 150000, activo: true },
    { id: "a9", tipo: "oferta", nombre: "Servicio 0009", precio: 80000, activo: true },
  ];
  const complementos = [
    { servicio_id: "a1", asociado_id: "a3", precio_combo: 120000, etiqueta: "con 0001" },
  ];
  const extras = buildExtras(extraOpts);
  return async (url) => {
    const u = String(url);
    if (u.includes("/rest/v1/servicios")) {
      const data = servicios;
      const raw = JSON.stringify(data);
      return { ok: true, status: 200, text: async () => raw, json: async () => data };
    }
    if (u.includes("/rest/v1/complementos")) {
      const data = complementos;
      const raw = JSON.stringify(data);
      return { ok: true, status: 200, text: async () => raw, json: async () => data };
    }
    if (u.includes("/catalogo-canales.json")) {
      const data = extras;
      const raw = JSON.stringify(data);
      return { ok: true, status: 200, text: async () => raw, json: async () => data };
    }
    if (u.includes("/rest/v1/promociones")) {
      const data = promosRows();
      const raw = JSON.stringify(data);
      return { ok: true, status: 200, text: async () => raw, json: async () => data };
    }
    return { ok: false, status: 404, text: async () => "{}", json: async () => ({}) };
  };
}

let quoteSeq = 0;
const cotizacionesMem = new Map();

function mockSupabaseQuotesFetch(baseFetch) {
  return async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || "GET";
    if (u.includes("/rest/v1/cotizaciones?") && u.includes("id=eq.")) {
      const m = u.match(/id=eq\.([^&]+)/);
      const id = m && decodeURIComponent(m[1]);
      const row = id ? cotizacionesMem.get(id) : null;
      if (opts && opts.method === "PATCH") {
        const patch = JSON.parse(String(opts.body || "{}"));
        const cur = row || {};
        const next = { ...cur, ...patch };
        if (id) cotizacionesMem.set(id, next);
        const rawPatch = JSON.stringify([next]);
        return { ok: true, status: 200, text: async () => rawPatch, json: async () => [next] };
      }
      const rawGet = JSON.stringify(row ? [row] : []);
      return { ok: true, status: 200, text: async () => rawGet, json: async () => (row ? [row] : []) };
    }
    if (u.includes("idempotency_key=eq.")) {
      const chMatch = u.match(/channel=eq\.([^&]+)/);
      const idemMatch = u.match(/idempotency_key=eq\.([^&]+)/);
      const ch = chMatch ? decodeURIComponent(chMatch[1]) : "";
      const idem = idemMatch ? decodeURIComponent(idemMatch[1]) : "";
      for (const row of cotizacionesMem.values()) {
        if (row.channel === ch && row.idempotency_key === idem) {
          const raw = JSON.stringify([row]);
          return { ok: true, status: 200, text: async () => raw, json: async () => [row] };
        }
      }
      return { ok: true, status: 200, text: async () => "[]", json: async () => [] };
    }
    if (u.includes("ticket_idempotency_key=eq.")) {
      const chMatch = u.match(/channel=eq\.([^&]+)/);
      const idemMatch = u.match(/ticket_idempotency_key=eq\.([^&]+)/);
      const ch = chMatch ? decodeURIComponent(chMatch[1]) : "";
      const idem = idemMatch ? decodeURIComponent(idemMatch[1]) : "";
      for (const row of cotizacionesMem.values()) {
        if (row.channel === ch && row.ticket_idempotency_key === idem && row.created_ticket_code) {
          const raw = JSON.stringify([row]);
          return { ok: true, status: 200, text: async () => raw, json: async () => [row] };
        }
      }
      return { ok: true, status: 200, text: async () => "[]", json: async () => [] };
    }
    if (u.includes("/rest/v1/cotizaciones") && method === "POST") {
      const body = opts && opts.body ? JSON.parse(String(opts.body)) : {};
      quoteSeq += 1;
      const id = `q-${quoteSeq}`;
      const row = { id, channel: body.channel || "vambe", ...body, lines_json: body.lines_json || {} };
      cotizacionesMem.set(id, row);
      const raw = JSON.stringify([row]);
      return { ok: true, status: 201, text: async () => raw, json: async () => [row] };
    }
    return baseFetch(url, opts);
  };
}

function reloadAsistente() {
  delete require.cache[require.resolve(path.join(__dirname, "..", "asistente-precios.js"))];
  return require("../asistente-precios.js");
}

const vehicleHyundai = {
  brand: "Hyundai",
  model: "Santa Fe",
  year: 2015,
  fuel: "diesel",
};

before(async () => {
  process.env.SUPABASE_URL = SUPABASE;
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-sr";
  process.env.VAMBE_QUOTE_TTL_MS = String(3600000);
  process.env.ASISTENTE_CATALOGO_CACHE_MS = "0";

  cotizacionesMem.clear();
  quoteSeq = 0;
  global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
  reloadAsistente();
});

describe("Vambe pricing", () => {
  test("1 vehículo compatible", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.ok, true);
    assert.equal(out.items[0].code, "0001");
  });

  test("2 vehículo incompatible (servicio no en columna del modelo)", async () => {
    global.fetch = mockSupabaseQuotesFetch(
      mockCatalogFetch({
        columnas: [
          {
            marca: "Toyota",
            modelo: "Corolla",
            ano_desde: 2010,
            ano_hasta: 2026,
            combustible: "ambos",
            servicios: ["a3"],
            ocultos: [],
            portadas: [],
            orden_tarjetas: [],
          },
        ],
      })
    );
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: { brand: "Toyota", model: "Corolla", year: 2018, fuel: "bencina" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.ok, false);
    assert.equal(out.error_code, "SERVICE_NOT_COMPATIBLE");
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    reloadAsistente();
  });

  test("3 servicio no compatible (oculto en columna)", async () => {
    global.fetch = mockSupabaseQuotesFetch(
      mockCatalogFetch({
        ocultos: ["s:a9"],
      })
    );
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0009"],
      channel: "vambe",
    });
    assert.equal(out.ok, false);
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    reloadAsistente();
  });

  test("4 precio normal (lista)", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.items[0].price_type, "list");
  });

  test("5 precio promocional (oferta fija en extra)", async () => {
    global.fetch = mockSupabaseQuotesFetch(
      mockCatalogFetch({
        a1: { numero_serie: 1, tiene_oferta: true, precio_oferta: 90000 },
      })
    );
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.items[0].price_type, "promotional");
    assert.equal(out.items[0].unit_price, 90000);
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    reloadAsistente();
  });

  test("6 combinación 0003 con 0001 en carrito", async () => {
    const cat = mockCatalogFetch();
    global.fetch = mockSupabaseQuotesFetch(async (url) => {
      if (String(url).includes("/rest/v1/promociones")) {
        return { ok: true, status: 200, text: async () => "[]", json: async () => [] };
      }
      return cat(url);
    });
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001", "0003"],
      channel: "vambe",
    });
    assert.equal(out.ok, true);
    const it3 = out.items.find((x) => x.code === "0003");
    assert.equal(it3.unit_price, 120000);
    assert.ok(it3.applied_rules.some((r) => r.type === "combination"));
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    reloadAsistente();
  });

  test("7 combo con included_services", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0002"],
      channel: "vambe",
    });
    assert.equal(out.items.length, 1);
    assert.ok(out.items[0].included_services.includes("0001"));
    assert.ok(out.items[0].included_services.includes("0009"));
  });

  test("8 no cobrar dos veces miembro de combo", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0002", "0009"],
      channel: "vambe",
    });
    assert.equal(out.items.length, 1);
    assert.ok(out.warnings.some((w) => w.code === "SERVICE_ALREADY_IN_COMBO"));
  });

  test("9 promoción temporal vigente en 0003", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0003"],
      channel: "vambe",
    });
    const it = out.items[0];
    assert.equal(it.unit_price, 99999);
    assert.ok(it.applied_rules.some((r) => r.type === "temporary_promotion"));
  });

  test("10 promoción temporal vencida no aplica (precio distinto de 1)", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: { ...vehicleHyundai, fuel: "bencina" },
      service_codes: ["0003"],
      channel: "vambe",
    });
    assert.notEqual(out.items[0].unit_price, 1);
  });

  test("11 cotización vencida en validate", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.ok(q.quote_id);
    const row = cotizacionesMem.get(q.quote_id);
    assert.ok(row);
    row.expires_at = "2020-01-01T00:00:00.000Z";
    cotizacionesMem.set(q.quote_id, row);

    const v = await ap.cotizarVambeInterno({ action: "validate", quote_id: q.quote_id, channel: "vambe" });
    assert.equal(v.ok, false);
    assert.equal(v.error_code, "QUOTE_EXPIRED");
  });

  test("12 misma idempotency key devuelve misma cotización", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    const ap = reloadAsistente();
    const body = {
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
      idempotency_key: "idem-z",
    };
    const a = await ap.cotizarVambeInterno(body);
    const b = await ap.cotizarVambeInterno(body);
    assert.equal(a.quote_id, b.quote_id);
    assert.ok(b.warnings.some((w) => w.code === "IDEMPOTENCY_REPLAY"));
  });

  test("13 dos cotizaciones distintas mismo vehículo", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const x = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
      idempotency_key: "u1",
    });
    const y = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
      idempotency_key: "u2",
    });
    assert.notEqual(x.quote_id, y.quote_id);
  });

  test("14 error de catálogo (falla servicios)", async () => {
    global.fetch = mockSupabaseQuotesFetch(async (url) => {
      const u = String(url);
      if (u.includes("/rest/v1/servicios")) {
        return { ok: false, status: 500, text: async () => "fail", json: async () => ({ message: "fail" }) };
      }
      return mockCatalogFetch()(url);
    });
    const ap = reloadAsistente();
    await assert.rejects(() => ap.asegurarCatalogo(), /HTTP 500/);
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    reloadAsistente();
  });

  test("15 ticket: error simulado AutoNexus", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const out = await ap.ticketDesdeCotizacionVambe(
      {
        quote_id: q.quote_id,
        channel: "vambe",
        contact: { name: "Test", phone: "+56911112222", plate: "ABCD12" },
        appointment: { date: null, time: null },
      },
      async () => ({ ok: false, error_code: "X", message: "falló creación", code: "" })
    );
    assert.equal(out.ok, false);
  });

  test("reprice actualiza quote existente", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const first = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const second = await ap.cotizarVambeInterno({
      action: "reprice",
      quote_id: first.quote_id,
      vehicle: vehicleHyundai,
      service_codes: ["0001", "0003"],
      channel: "vambe",
    });
    assert.equal(second.quote_id, first.quote_id);
    assert.equal(second.items.length, 2);
  });

  test("scope hyundai_kia: Hyundai aceptado", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      scope: "hyundai_kia",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.ok, true);
  });

  test("scope hyundai_kia: Kia aceptado", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      scope: "hyundai_kia",
      vehicle: { brand: "Kia", model: "Sportage", year: 2015, fuel: "diesel" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.ok, true);
  });

  test("scope hyundai_kia: Toyota rechazado", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      scope: "hyundai_kia",
      vehicle: { brand: "Toyota", model: "Corolla", year: 2018, fuel: "bencina" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.ok, false);
    assert.equal(out.error_code, "BRAND_OUT_OF_SCOPE");
    assert.equal(out.eligible, false);
  });

  test("scope hyundai_kia: Mazda rechazado", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      scope: "hyundai_kia",
      vehicle: { brand: "Mazda", model: "3", year: 2017, fuel: "bencina" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.error_code, "BRAND_OUT_OF_SCOPE");
  });

  test("marca faltante", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: { model: "Santa Fe", year: 2015, fuel: "diesel" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.error_code, "VEHICLE_BRAND_REQUIRED");
  });

  test("modelo faltante", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: { brand: "Hyundai", year: 2015, fuel: "diesel" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.error_code, "VEHICLE_MODEL_REQUIRED");
  });

  test("año faltante", async () => {
    const ap = reloadAsistente();
    const out = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: { brand: "Hyundai", model: "Santa Fe", fuel: "diesel" },
      service_codes: ["0001"],
      channel: "vambe",
    });
    assert.equal(out.error_code, "VEHICLE_YEAR_REQUIRED");
  });

  test("quoteFlatBodyToInternal mapea campos planos", async () => {
    const ap = reloadAsistente();
    const internal = ap.quoteFlatBodyToInternal({
      action: "quote",
      scope: "hyundai_kia",
      brand: "Hyundai",
      model: "Santa Fe",
      year: 2015,
      fuel: "diesel",
      service_code: "0001",
      channel: "vambe",
    });
    assert.equal(internal.action, "quote");
    assert.equal(internal.scope, "hyundai_kia");
    assert.deepEqual(internal.service_codes, ["0001"]);
    assert.equal(internal.vehicle.brand, "Hyundai");
  });

  test("flat: cotización con un servicio (vía interno)", async () => {
    const ap = reloadAsistente();
    const internal = ap.quoteFlatBodyToInternal({
      action: "quote",
      brand: "Hyundai",
      model: "Santa Fe",
      year: 2015,
      fuel: "diesel",
      service_code: "0001",
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno(internal);
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
  });

  test("reprice_add agrega servicio", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno({
      action: "reprice_add",
      quote_id: q.quote_id,
      add_service_code: "0003",
      channel: "vambe",
    });
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 2);
  });

  test("reprice_remove quita servicio", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001", "0003"],
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno({
      action: "reprice_remove",
      quote_id: q.quote_id,
      remove_service_code: "0003",
      channel: "vambe",
    });
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
  });

  test("flat: vehículo fuera de alcance", async () => {
    const ap = reloadAsistente();
    const internal = ap.quoteFlatBodyToInternal({
      action: "quote",
      scope: "hyundai_kia",
      brand: "Toyota",
      model: "Corolla",
      year: 2018,
      fuel: "bencina",
      service_code: "0001",
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno(internal);
    assert.equal(out.error_code, "BRAND_OUT_OF_SCOPE");
  });

  test("reprice_add servicio incompatible", async () => {
    global.fetch = mockSupabaseQuotesFetch(
      mockCatalogFetch({
        ocultos: ["s:a9"],
      })
    );
    const ap = reloadAsistente();
    cotizacionesMem.clear();
    quoteSeq = 0;
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno({
      action: "reprice_add",
      quote_id: q.quote_id,
      add_service_code: "0009",
      channel: "vambe",
    });
    assert.equal(out.ok, false);
    assert.equal(out.error_code, "SERVICE_NOT_COMPATIBLE");
    global.fetch = mockSupabaseQuotesFetch(mockCatalogFetch());
    reloadAsistente();
  });

  test("combo en reprice_add (0002)", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno({
      action: "reprice_add",
      quote_id: q.quote_id,
      add_service_code: "0002",
      channel: "vambe",
    });
    assert.equal(out.ok, true);
    const combo = out.items.find((x) => x.code === "0002");
    assert.ok(combo);
  });

  test("duplicado al agregar mismo código (warning)", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno({
      action: "reprice_add",
      quote_id: q.quote_id,
      add_service_code: "0001",
      channel: "vambe",
    });
    assert.equal(out.ok, true);
    assert.ok(out.warnings.some((w) => w.code === "SERVICE_ALREADY_IN_QUOTE"));
  });

  test("no quitar miembro de combo sin quitar el combo", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0002"],
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno({
      action: "reprice_remove",
      quote_id: q.quote_id,
      remove_service_code: "0001",
      channel: "vambe",
    });
    assert.equal(out.ok, false);
    assert.equal(out.error_code, "CANNOT_REMOVE_COMBO_MEMBER");
  });

  test("flat validate", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const internal = ap.quoteFlatBodyToInternal({
      action: "validate",
      quote_id: q.quote_id,
      channel: "vambe",
    });
    const out = await ap.cotizarVambeInterno(internal);
    assert.equal(out.ok, true);
  });

  test("cotización vencida en validate (flat)", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const row = cotizacionesMem.get(q.quote_id);
    row.expires_at = "2020-01-01T00:00:00.000Z";
    cotizacionesMem.set(q.quote_id, row);
    const internal = ap.quoteFlatBodyToInternal({
      action: "validate",
      quote_id: q.quote_id,
      channel: "vambe",
    });
    const v = await ap.cotizarVambeInterno(internal);
    assert.equal(v.error_code, "QUOTE_EXPIRED");
  });

  test("ticketFlatBodyToInternal mapea a contact/appointment", async () => {
    const ap = reloadAsistente();
    const t = ap.ticketFlatBodyToInternal({
      quote_id: "q-1",
      name: "A",
      phone: "569",
      plate: "AB12",
      appointment_date: "2026-01-01",
      appointment_time: "10:00",
      channel: "vambe",
      idempotency_key: "t1",
    });
    assert.equal(t.contact.name, "A");
    assert.equal(t.appointment.date, "2026-01-01");
    assert.equal(t.appointment.time, "10:00");
  });

  test("ticket plano sin crear ticket real (mock falla)", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const q = await ap.cotizarVambeInterno({
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
    });
    const flat = ap.ticketFlatBodyToInternal({
      quote_id: q.quote_id,
      name: "Cliente Test",
      phone: "+56900000000",
      plate: "ABCD12",
      channel: "vambe",
    });
    const out = await ap.ticketDesdeCotizacionVambe(flat, async () => ({
      ok: false,
      error_code: "MOCK",
      message: "sin ticket",
      code: "",
    }));
    assert.equal(out.ok, false);
  });

  test("idempotencia quote + reprice_add misma key", async () => {
    cotizacionesMem.clear();
    quoteSeq = 0;
    const ap = reloadAsistente();
    const body1 = {
      action: "quote",
      vehicle: vehicleHyundai,
      service_codes: ["0001"],
      channel: "vambe",
      idempotency_key: "idem-flat-reprice",
    };
    const a = await ap.cotizarVambeInterno(body1);
    const b = await ap.cotizarVambeInterno({
      action: "reprice_add",
      quote_id: a.quote_id,
      add_service_code: "0003",
      channel: "vambe",
      idempotency_key: "idem-flat-reprice",
    });
    assert.equal(b.warnings.some((w) => w.code === "IDEMPOTENCY_REPLAY"), true);
    assert.equal(b.items.length, 1);
  });
});
