# API backend Vambe (cotización y ticket)

Integración estable para el asistente Vambe: el motor de precios es el mismo que `POST /api/asistente/consultar-precios` (`asistente-precios.js`). No hay segundo motor de cálculo.

## Autenticación

Igual que el endpoint del asistente:

- Header `Authorization: Bearer <ASISTENTE_PRECIOS_TOKEN>` (también acepta `ASSISTANT_WEBHOOK_TOKEN`), o
- `x-asistente-token` / `x-autodato-token` con el mismo valor.

No exponer estos tokens en el frontend público.

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `SUPABASE_URL` | Base del proyecto Supabase (sin `/rest/v1`). |
| `SUPABASE_ANON_KEY` | Lectura de `servicios`, `complementos`, `catalogo-canales.json`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Cotizaciones (`cotizaciones`), promociones (`promociones`), escritura de ticket en fila. |
| `ASISTENTE_PRECIOS_TOKEN` o `ASSISTANT_WEBHOOK_TOKEN` | Token de API asistente / Vambe. |
| `VAMBE_QUOTE_TTL_MS` | TTL de cotización en ms (default 48 h). |
| `ASISTENTE_CATALOGO_CACHE_MS` | Cache en memoria del catálogo (existente). |
| `AUTONEXUS_WEBHOOK_TOKEN`, `AUTONEXUS_ID_TALLER`, `AUTONEXUS_WEBHOOK_URL` | Creación de ticket vía webhook (igual que el resto del sitio). |

## Migración SQL

Ejecutar en Supabase (SQL Editor):

- Archivo: `supabase/vambe_quotes_promociones.sql`
- Familias Vambe / metadata opcional: `supabase/servicio_familias_vambe.sql` (`service_families`, `priority`, `oil_liters`, `tags` en `servicios`)
- Opcional, población por patrones: `supabase/servicio_familias_vambe_datos_iniciales.sql` (ejecutar y **revisar** filas afectadas)

**Mantenimiento desde el admin (recomendado):** en **Servicios → Editar servicio**, campo *Familias Vambe (slugs)*. Se guardan en Supabase (`servicios.service_families`) y en `catalogo-canales.json` al guardar el catálogo.

Si la tabla `cotizaciones` ya existía sin `ticket_idempotency_key`:

```sql
alter table cotizaciones add column if not exists ticket_idempotency_key text;
create unique index if not exists idx_cotizaciones_ticket_idem
  on cotizaciones (channel, ticket_idempotency_key)
  where ticket_idempotency_key is not null;
```

## Endpoints

### `POST /api/vambe/catalog/quote`

**Acciones:** `quote` | `reprice` | `reprice_add` | `reprice_remove` | `validate`

- **`quote`:** nueva cotización; opcional `idempotency_key` (si existe fila con mismo `channel` + clave, se devuelve la existente con aviso `IDEMPOTENCY_REPLAY`).
- **`reprice`:** requiere `quote_id` y nuevo listado `service_codes`; actualiza la fila en Supabase (mismo `id`).
- **`reprice_add` / `reprice_remove`:** ver sección más abajo (también disponibles vía `/catalog/quote-flat`).
- **`validate`:** requiere `quote_id`; comprueba vigencia, versión de catálogo (`catalog_version` hash) y devuelve snapshot.

**Alcance (asistente HYUNDAI KIA):** campo opcional `scope`.

| Valor | Comportamiento |
|-------|----------------|
| *(omitido)* | **Compatible con integraciones anteriores.** Misma lógica que antes: se admiten otras marcas si el catálogo y el tablero lo permiten; solo se añaden *warnings* informativos (p. ej. marca fuera de Hyundai/Kia). |
| `"hyundai_kia"` | **Restricción en servidor:** solo Hyundai o Kia. Cualquier otra marca → error, **sin** cotización ni precios. |

**Cuerpo ejemplo (`quote`):**

```json
{
  "action": "quote",
  "scope": "hyundai_kia",
  "vehicle": {
    "brand": "Hyundai",
    "model": "Santa Fe",
    "year": 2015,
    "fuel": "diesel"
  },
  "service_codes": ["0003"],
  "quote_id": null,
  "channel": "vambe",
  "idempotency_key": "clave-unica-del-intento",
  "client_ref": "opcional"
}
```

Respuesta de alcance rechazado (`scope: "hyundai_kia"` y marca no Hyundai/Kia):

```json
{
  "ok": false,
  "eligible": false,
  "error_code": "BRAND_OUT_OF_SCOPE",
  "message": "Este catálogo solo atiende vehículos Hyundai y Kia.",
  "quote_id": null,
  "warnings": []
}
```

Otros errores de vehículo (sin devolver cotización): `VEHICLE_BRAND_REQUIRED`, `VEHICLE_MODEL_REQUIRED`, `VEHICLE_YEAR_REQUIRED` (cada uno con `eligible: false` cuando aplica).

**Respuesta exitosa:** ver contrato en el mensaje de especificación del usuario (`ok`, `eligible`, `quote_id`, `catalog_version`, `items`, `suggested_addons`, totales, `warnings`, `active_promotions`).

**Ítems (`items[]`):** además de `applied_rules` (lista), cada línea incluye cuando corresponde:

- `promotion_id`, `promotion_name` — si ganó una promoción temporal.
- `applied_rule` — objeto con `type`, `tier_order` (1–4 según prioridad documentada), `label`, y campos auxiliares.
- `price_before` — precio de referencia **antes** de la regla final (lista si la regla es combinación u oferta fija; precio previo a la capa temporal si gana la promo temporal).
- `price_final` — igual a `unit_price` final cobrado.
- `promotion_higher_than_combination` — `true` si la **promoción temporal** aplicada dejó un precio **mayor** que el precio ya alcanzado por combinación/oferta **antes** de esa capa (ambigüedad comercial; el motor **no** elige automáticamente “el menor precio”).

**Errores:** `ok: false`, `error_code`, `message`, `warnings`, `quote_id`.

Códigos HTTP típicos: 400 (validación / servicio no compatible), 409 (catálogo desactualizado, cotización expirada en flujos que lo ameriten), 401, 503. `QUOTE_NOT_FOUND` → 404.

**Acciones adicionales (cuerpo JSON, mismo motor de respuesta):** `reprice_add` | `reprice_remove`

- **`reprice_add`:** `quote_id`, `add_service_code` (un código), opcional `scope`, `channel`, `idempotency_key`. Lee `service_codes` del snapshot, añade el código si falta, recalcula y actualiza la fila (mismo comportamiento que `reprice` con lista extendida). Si el código ya estaba: respuesta OK con warning `SERVICE_ALREADY_IN_QUOTE`. Si el nuevo servicio no aplica al vehículo: `SERVICE_NOT_COMPATIBLE`.
- **`reprice_remove`:** `quote_id`, `remove_service_code`. No permite quitar un servicio que solo existe como **miembro** de un combo en el carrito; en ese caso `CANNOT_REMOVE_COMBO_MEMBER`. Para vaciar el carrito hay que quitar el código del **combo** o cotizar de nuevo.

---

### `POST /api/vambe/catalog/quote-flat`

Misma autenticación y **misma respuesta JSON** que `POST /api/vambe/catalog/quote`. Solo normaliza la entrada: el webhook puede enviar **campos planos** sin objeto `vehicle` anidado.

**Mapeo:**

| Plano | Interno |
|-------|---------|
| `brand` / `marca` | `vehicle.brand` |
| `model` / `modelo` | `vehicle.model` |
| `year` / `ano` | `vehicle.year` |
| `fuel` / `combustible` | `vehicle.fuel` |
| `service_code` (string o número) | `service_codes: ["0003"]` |
| `service_codes` (si ya viene array) | se reenvía igual |
| `action`, `scope`, `channel`, `quote_id`, `idempotency_key`, `client_ref` | iguales |
| `add_service_code`, `remove_service_code` | acciones `reprice_add` / `reprice_remove` |

Ejemplo **quote** plano:

```json
{
  "action": "quote",
  "scope": "hyundai_kia",
  "brand": "Hyundai",
  "model": "Santa Fe",
  "year": 2015,
  "fuel": "diesel",
  "service_code": "0003",
  "channel": "vambe",
  "idempotency_key": "clave-unica",
  "client_ref": "opcional"
}
```

Ejemplo **`reprice_add`:**

```json
{
  "action": "reprice_add",
  "scope": "hyundai_kia",
  "quote_id": "uuid-de-cotizacion",
  "add_service_code": "0009",
  "channel": "vambe",
  "idempotency_key": "clave-unica"
}
```

Ejemplo **`reprice_remove`:**

```json
{
  "action": "reprice_remove",
  "scope": "hyundai_kia",
  "quote_id": "uuid-de-cotizacion",
  "remove_service_code": "0009",
  "channel": "vambe",
  "idempotency_key": "clave-unica"
}
```

Ejemplo **`validate`:**

```json
{
  "action": "validate",
  "scope": "hyundai_kia",
  "quote_id": "uuid-de-cotizacion",
  "channel": "vambe"
}
```

**Idempotencia:** usar **`idempotency_key` distinta** entre `quote` inicial y operaciones `reprice_add` / `reprice_remove`; si se reutiliza la misma clave que en el `quote`, el servidor puede devolver la cotización original (replay) sin aplicar el add/remove.

---

### `POST /api/vambe/catalog/compatible-services`

Solo lectura: lista **candidatos** de servicios del catálogo que coinciden con una **familia** estable y son **compatibles** con el vehículo, usando el mismo motor que la cotización (`servicioAplicaAVehiculo` / columnas de tablero / lista de compatibilidad). **No** crea filas en `cotizaciones` ni tickets. El precio mostrado usa `precioPagado` (lista, combinación, oferta fija y promoción temporal cuando aplique al servicio solo).

**Autenticación:** igual que los demás endpoints Vambe.

**Cuerpo (campos planos, mismo criterio que `quote-flat` para el vehículo):**

```json
{
  "scope": "hyundai_kia",
  "channel": "vambe",
  "brand": "Hyundai",
  "model": "Santa Fe",
  "year": 2015,
  "fuel": "diesel",
  "service_family": "cambio_aceite",
  "locale": "es-CL"
}
```

- `scope`: si es `"hyundai_kia"`, misma validación de marca que en cotización (otras marcas → `BRAND_OUT_OF_SCOPE`).
- `service_family`: slug estable (`cambio_aceite`, `cambio_refrigerante`, `descarbonizacion`, etc.). Se normaliza a minúsculas y guiones bajos.
- `locale`: opcional; se devuelve en la respuesta para trazabilidad (no altera la lógica).

**Familias en el catálogo (datos, no código):**

1. Columna **`service_families`** en `servicios` (JSON array de strings), *o*
2. En **extras** por servicio en `catalogo-canales.json`: `"service_families": ["cambio_aceite"]`, *o*
3. Tag con prefijo en **`tags`**: `"family:cambio_aceite"`.

Campos opcionales útiles: `priority` (número, mayor = más prioridad en empates), `oil_liters` (extras o columna), y en cada ítem de `vehiculos` (compatibilidad por modelo) se puede usar `oil_liters` o `litros_aceite` para volumen por rango sin inferir desde el nombre.

**Respuesta exitosa (varios candidatos → desambiguación):**

```json
{
  "ok": true,
  "eligible": true,
  "scope": "hyundai_kia",
  "service_family": "cambio_aceite",
  "catalog_version": "sha256:…",
  "disambiguation_needed": true,
  "locale": "es-CL",
  "channel": "vambe",
  "candidates": [
    {
      "service_code": "0003",
      "canonical_service_name": "Cambio de aceite … + regeneración DPF",
      "display_name": "Cambio de aceite … + regeneración DPF",
      "price_list": 250000,
      "price_with_promotions": 240000,
      "promotion_summary": "Nombre promo o regla",
      "combination_promotions": [
        {
          "requires_service_code": "0001",
          "requires_service_name": "Descarbonización …",
          "price_for_this_service": 120000,
          "label": "con descarbonización",
          "other_service_compatible_with_vehicle": true
        }
      ],
      "oil_liters": null,
      "variant_hints": ["Incluye regeneración DPF", "…"],
      "rank": 1
    }
  ],
  "warnings": []
}
```

- `disambiguation_needed`: `true` si hay **más de un** candidato (hasta 5). No se elige automáticamente entre variantes comerciales; Vambe debe elegir un `service_code` y llamar a `quote-flat`.
- `price_list` / `price_with_promotions` / `promotion_summary`: mismas capas que `precioPagado` con carrito vacío (oferta fija, reglas de complemento solo si el otro servicio ya está en el carrito — ver `combination_promotions`), promoción temporal de `promociones` cuando aplica.
- `combination_promotions`: ofertas **por llevar otro servicio** definidas en complementos (`complementos` / `s.complementos`). Lista **no vacía** cuando otro servicio del catálogo declara precio combo para este `servicio_id`. Incluye si el **otro** servicio es compatible con el mismo vehículo (`other_service_compatible_with_vehicle`). Para cobrar ese precio hay que cotizar con **ambos** códigos en `quote-flat`.
- `oil_liters`: número si viene de `servicios.oil_liters`, del extra `oil_liters`, o de **una sola** línea de compatibilidad con `oil_liters`/`litros_aceite`; si hay varios valores distintos o no hay dato, `null`.
- `variant_hints`: combina `resumen`, `tags` (excepto `family:*`), primera línea de `detalle` y texto de promoción cuando aplica.

**Nota:** los servicios **combo** (`es_combo` con varios ítems) no aparecen como candidatos del descubrimiento (se cotizan por su `service_code` en `quote-flat`). Para exponer un pack en descubrimiento, asignad familia a ese servicio combo o usad `combination_promotions` en los ítems.

**Errores comunes:**

| `error_code` | HTTP | Notas |
|--------------|------|--------|
| `SERVICE_FAMILY_REQUIRED` | 400 | Falta `service_family`. |
| `BRAND_OUT_OF_SCOPE` | 400 | `scope` hyundai_kia y marca no Hyundai/Kia. |
| `VEHICLE_*_REQUIRED` | 400 | Misma familia que cotización. |
| `UNKNOWN_SERVICE_FAMILY` | 400 | El slug no aparece en ningún servicio del catálogo cargado. |
| `SERVICE_FAMILIES_NOT_CONFIGURED` | 400 | Hay servicios pero ninguno tiene familia en columnas/tags/extras. |
| `CATALOG_EMPTY` | 400 | No hay filas activas en `servicios`. |
| `NO_COMPATIBLE_SERVICE_FOR_FAMILY` | 400 | La familia existe pero ningún servicio aplica al vehículo (`eligible: true`). |
| `UNAUTHORIZED` | 401 | Token ausente o incorrecto. |

**Flujo recomendado:** `compatible-services` → elegir código → `POST /api/vambe/catalog/quote-flat` con `service_code`. La cotización **vuelve** a validar compatibilidad y precios.

---

### `POST /api/vambe/ticket/from-quote`

Crea ticket en AutoNexus usando el **snapshot** de la cotización recalculado con el catálogo actual (compatibilidad + totales deben coincidir con la fila).

```json
{
  "quote_id": "uuid",
  "channel": "vambe",
  "idempotency_key": "clave-unica-ticket",
  "contact": {
    "name": "Nombre",
    "phone": "+56900000000",
    "plate": "ABC123"
  },
  "appointment": { "date": null, "time": null },
  "notes": "opcional"
}
```

**Idempotencia:** si `ticket_idempotency_key` ya está asociada a otra cotización con ticket creado, se devuelve ese ticket (`repeated`). La clave solo se guarda al **éxito** de AutoNexus (reintentos tras error no bloquean).

### `POST /api/vambe/ticket/from-quote-flat`

Misma lógica y respuesta que `POST /api/vambe/ticket/from-quote`. Campos planos → `contact` / `appointment` internos.

| Plano | Interno |
|-------|---------|
| `name` / `nombre_cliente` | `contact.name` |
| `phone` / `telefono` | `contact.phone` |
| `plate` / `patente` | `contact.plate` |
| `email` / `correo` | `contact.email` |
| `appointment_date` / `fecha_cita` | `appointment.date` |
| `appointment_time` / `hora` | `appointment.time` |
| `notes` / `sintoma` | `notes` |

```json
{
  "quote_id": "uuid",
  "name": "Nombre del cliente",
  "phone": "+56900000000",
  "plate": "ABC123",
  "appointment_date": "",
  "appointment_time": "",
  "channel": "vambe",
  "idempotency_key": "clave-unica"
}
```

## Prioridad de precios (backend)

Orden documentado y reflejado en `tierReglaPrecio` / `mejorPrecioEntre`:

1. Promoción temporal vigente (tabla `promociones`, cuando aplica al servicio y vehículo).
2. Precio especial por combinación (`reglasComboDe` / complementos).
3. Oferta fija permanente (`precio_oferta` en extras / `oferta_fija`).
4. Precio de lista (`valorNormalDe` / `precio`).

**Ambigüedad comercial:** la prioridad por **tier** hace que la promoción temporal pueda **ganar** aunque deje un precio **más alto** que el de una combinación ya aplicada en capas anteriores. Eso queda reflejado en cada ítem con `promotion_higher_than_combination: true`. **No** se cambia automáticamente al menor precio; hace falta decisión explícita del negocio si el comportamiento deseado es distinto.

## Combos y duplicados

- Un combo se representa como **una línea**; `included_services` son códigos de serie de los miembros.
- Si se pide un servicio ya incluido en un combo del mismo pedido, se **omite** con advertencia `SERVICE_ALREADY_IN_COMBO` (no se cobra dos veces).
- `applied_rules` incluye `type: "combo"` y `source_code` del combo cuando corresponde.

## `catalog_version`

Hash estable `sha256:...` sobre: filas relevantes de `servicios` (incluye `service_families`, `priority`, `oil_liters` cuando existan), `complementos`, columnas `_tablero_columnas`, extras de `catalogo-canales.json` (sin duplicar el motor), promociones activas cargadas, y versión del motor (`PRICING_ENGINE`).

## Probar localmente

```bash
# Variables mínimas en .env o entorno (ver tabla arriba)
npm start
# Otro terminal:
curl -s -X POST http://localhost:5173/api/vambe/catalog/quote \
  -H "Content-Type: application/json" \
  -H "x-asistente-token: TU_TOKEN" \
  -d '{"action":"quote","channel":"vambe","vehicle":{"brand":"Hyundai","model":"Santa Fe","year":2015,"fuel":"diesel"},"service_codes":["0001"]}'

curl -s -X POST http://localhost:5173/api/vambe/catalog/quote-flat \
  -H "Content-Type: application/json" \
  -H "x-asistente-token: TU_TOKEN" \
  -d '{"action":"quote","scope":"hyundai_kia","brand":"Hyundai","model":"Santa Fe","year":2015,"fuel":"diesel","service_code":"0003","channel":"vambe"}'

curl -s -X POST http://localhost:5173/api/vambe/catalog/compatible-services \
  -H "Content-Type: application/json" \
  -H "x-asistente-token: TU_TOKEN" \
  -d '{"scope":"hyundai_kia","brand":"Hyundai","model":"Santa Fe","year":2015,"fuel":"diesel","service_family":"cambio_aceite","channel":"vambe"}'

curl -s -X POST http://localhost:5173/api/vambe/ticket/from-quote-flat \
  -H "Content-Type: application/json" \
  -H "x-asistente-token: TU_TOKEN" \
  -d '{"quote_id":"UUID","name":"Nombre","phone":"+56900000000","plate":"ABC123","channel":"vambe"}'
```

Pruebas automatizadas (catálogo mockeado):

```bash
npm test
```

## Rollback

1. Quitar rutas en `server.js` (o revertir commit).
2. Dejar de llamar a los endpoints desde integraciones.
3. Opcional: `drop table if exists cotizaciones; drop table if exists promociones;` (solo si no hay datos que conservar).

## Archivos tocados (implementación)

- `asistente-precios.js` — API interna Vambe, cotizaciones Supabase, promociones temporales en `precioPagado`, `tokenAsistenteValido`, `compatibleServicesVambe`.
- `server.js` — rutas `POST /api/vambe/catalog/quote`, `POST /api/vambe/catalog/quote-flat`, `POST /api/vambe/catalog/compatible-services`, `POST /api/vambe/ticket/from-quote`, `POST /api/vambe/ticket/from-quote-flat`.
- `supabase/vambe_quotes_promociones.sql` — tablas e índices.
- `supabase/servicio_familias_vambe.sql` — columnas opcionales en `servicios` para familias Vambe.
- `test/vambe-pricing.test.js` — pruebas.
- `package.json` — script `test`.
- `render.yaml` — env vars documentadas.

## No implementado en esta fase (según spec)

- Rotación de token, firma HMAC y registro anti-replay global más allá de idempotencia en cotización/ticket.
- Conexión del asistente Vambe / webhooks (solo backend).
