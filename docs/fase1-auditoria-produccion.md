# Fase 1 — Auditoría de producción (Supabase) y corrección del catálogo

Este documento describe **qué auditar**, **por qué el 0011 pudo mezclarse con cambio de aceite**, y **qué migración idempotente** aplica la fuente de verdad en `servicios` / `complementos` **sin** tocar código de servicio (display), nombre ni precio de lista.

## Límite de este entorno

Desde el repositorio **no hay acceso a tu proyecto Supabase de producción** sin `SUPABASE_URL` y una clave con permiso de lectura/escritura. Debes ejecutar los SQL en **Supabase → SQL Editor** (o `psql`) y pegar los resultados en la sección [Informe previo a migración](#informe-previo-a-migración) abajo.

## Tablas y campos que usa el motor

| Recurso | Uso en motor / Vambe |
|--------|----------------------|
| `servicios` | Precio lista, `activo`, `tipo`, texto (`nombre`, `resumen`, `detalle`), `vehiculos` (compatibilidad), `service_families` (jsonb), `tags` (jsonb; `family:slug` cuenta como familia). **`numero_serie` puede no existir en SQL** en algunos proyectos: el código 0003 suele venir del extra **`catalogo-canales.json`** en Storage (clave por `id` del servicio). |
| `complementos` | Reglas de asociación “padre → asociado” con `precio_combo` |
| `promociones` | Promociones temporales (capa adicional en `precioPagado`) |
| Storage `servicios/catalogo-canales.json` | Extras por `id` de servicio: ofertas, `service_families` extra, tags, etc. (fusionados en `asistente-precios.js`) |

Metadatos de vehículos “por modelo” suelen vivir en **`servicios.vehiculos`** y en **`catalogo-canales.json` → `_tablero_columnas`** (no es una tabla SQL en el esquema mínimo del repo).

## Taxonomía de familias soportada

Slugs usados en código y en admin sugerido (`admin.js`): entre otros, `cambio_aceite`, `cambio_refrigerante`, `descarbonizacion`, etc. Cualquier slug presente en `service_families` o en tag `family:…` entra en `catalogKnownServiceFamilies()` y puede usarse en `compatible-services` como `service_family`.

Se añade en migración el slug **`sensor_ckp`** para descubrimiento de CKP sin inventar precios (el precio sigue siendo el de la fila `servicios.precio`).

## Por qué 0011 (refrigerante ZEREX) pudo aparecer en “cambio de aceite”

1. **`service_families` en BD o extras** puede incluir erróneamente `"cambio_aceite"` (p. ej. poblamiento manual o script antiguo).
2. **Heurística en `servicio_familias_vambe_datos_iniciales.sql`**: la regla de “cambio de aceite” coincide con textos que mencionan `5w`, `aceite`, etc. El nombre del refrigerante **no** debería cumplirla; si coincide, suele ser por **“Valvoline”** en aceites vs refrigerante — el script de datos iniciales ya excluye líneas con refrigerante/zerex para aceite, pero **una fila puede tener solo `cambio_aceite` cargado a mano**.
3. El endpoint **`compatible-services`** filtra por familias efectivas (`service_families` + tags `family:`). Si la única familia efectiva es `cambio_aceite`, el servicio compite ahí. En código hay además **`pareceServicioRefrigeranteVambe`** para no listar refrigerante en familia aceite **aunque la metadata esté mal** — eso es red de seguridad, no sustituto de datos correctos en Supabase.

**Regla de negocio (fase 1):** la fuente de verdad debe ser **`cambio_refrigerante`** en `service_families` (y **no** `cambio_aceite` para ese servicio).

## Semilla local (referencia, no es producción)

Valores de referencia en `catalogo.js` / `schema.sql`:

| id | Nombre / notas | Precio lista ref. | Familias en semilla |
|----|----------------|-------------------|---------------------|
| `descarb` | Descarbonización | 240000 | (poblado por script / texto) |
| `ckp` | Cambio de sensor CKP original | 220000 | (sin familia explícita en semilla JS) |
| `refrigerante` | ZEREX Valvoline | 90000 | `cambio_refrigerante` |
| Complemento | `descarb` → `ckp`, precio_combo **160000** | regla motor | tabla `complementos` |

Los códigos **0003, 0004, 0011** en API corresponden a **`numero_serie` en el objeto servicio** tras fusionar Supabase + extras. Si la columna no existe en `servicios`, mapea **`id` ↔ código** revisando `servicios` por `id` (`'0003'`… si aplica) o el JSON en **Storage** (`servicios/catalogo-canales.json`).

---

## Informe previo a migración

*(Completar tras ejecutar `supabase/fase1_auditoria_selects.sql`.)*

### Descarbonización

- **id:** …
- **activo:** …
- **precio lista:** …
- **`service_families`:** …
- **código operativo (en SQL o en extras Storage):** …

### CKP

- **id:** …
- **activo:** …
- **precio lista:** … (objetivo de negocio 220000 — no cambiar en SQL sin validar este informe)
- **`service_families` / tags:** …
- **código operativo:** …

### Complemento descarbonización → CKP

- **Existe fila:** sí / no
- **`servicio_id`, `asociado_id`, `precio_combo`, `etiqueta`:** …

### Refrigerante (código operativo 0011 en prod)

- **id interno:** …
- **nombre:** …
- **código / `numero_serie` en extras (¿0011?):** …
- **`service_families` actual:** …
- **Causa probable de mezcla con cambio_aceite:** …

### Cambio de aceite 0003 / 0004

- **id / código / precio / familias:** …

### Diferencias semilla vs producción

- …

### Migración propuesta

- Archivo: `supabase/fase1_migracion_idempotente_familias_vambe.sql`
- **Registros a tocar:** solo filas que cumplan condiciones (familias / complemento); **sin** cambiar `nombre`, `precio` de servicios ni códigos.

### Riesgos

- **Bajo** si se ejecuta después del informe: la migración usa `merge`/`remove` sobre JSONB y `ON CONFLICT` en `complementos`.
- Revisar que los `id` `descarb`, `ckp` y el id del refrigerante ZEREX coincidan con producción; si el id del padre no es `descarb`, ajustar el bloque CTE del script o crear complemento vía subconsulta acotada por nombre (comentado en el SQL).

---

## Después de migrar (checklist manual)

Con backend local o staging apuntando a la misma BD corregida:

1. `npm test`
2. `POST /api/vambe/catalog/compatible-services` — Kia Sorento 2015 diésel, `service_family: cambio_aceite` → no debe incluir refrigerante (0011).
3. Misma petición con `service_family: cambio_refrigerante` → debe incluir 0011 si es compatible.
4. `quote-flat` / cotización: CKP solo → lista acorde a `servicios.precio`; CKP + descarbonización en carrito → CKP a precio asociación 160000 vía motor (`complementos`).
5. Confirmar que 0011 **no** queda con `cambio_aceite` en `service_families` (consulta final en script de migración).

---

## Archivos relacionados en el repo

- `supabase/fase1_auditoria_selects.sql` — consultas de auditoría
- `supabase/fase1_migracion_idempotente_familias_vambe.sql` — corrección idempotente
- `supabase/servicio_familias_vambe_datos_iniciales.sql` — heurísticas de familia (contexto del bug 0011)
- `supabase/servicio_familias_vambe_fix_refrigerante.sql` — lógica similar a la migración (refrigerante)
