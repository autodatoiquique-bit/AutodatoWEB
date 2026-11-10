# API Vambe — consulta vehículo certificado (Aprobados)

Cuando el cliente usa **«Contactar a AutoDato por WhatsApp»** en la ficha pública, el primer mensaje trae datos para identificar el auto. Este webhook devuelve la ficha completa (lo que ve el público + resumen del informe) para que el asistente responda con contexto.

**Producción:** `https://autodato.cl`  
**Autenticación:** la misma que cotización Vambe (`docs/vambe-api.md`).

## Autenticación

- Header `Authorization: Bearer <ASISTENTE_PRECIOS_TOKEN>`  
  (también `ASSISTANT_WEBHOOK_TOKEN`), o  
- `x-asistente-token` / `x-autodato-token` con el mismo valor.

## Endpoints

| Método | Ruta | Uso en Vambe |
|--------|------|----------------|
| `POST` | `/api/vambe/aprobados/lookup` | Cuerpo con objeto `reference` opcional |
| `POST` | `/api/vambe/aprobados/lookup-flat` | **Recomendado:** campos planos + `whatsapp_message` |

## Cómo identifica el auto (orden interno)

Si envías varios campos, el servidor prueba en este orden hasta encontrar **una** ficha publicada (`estado = aprobado` y vigente):

1. `public_slug` (línea del WhatsApp: `ID ficha: …`)
2. `folio` (`Folio AutoDato: …`)
3. `numero_chasis` (`Chasis: …`)
4. `patente` (`Patente: …`)
5. Slug extraído de `ficha_url` / `Enlace: …`

**Recomendación Vambe:** en cada conversación nueva, llamar al webhook pasando **`whatsapp_message`** con el texto completo del primer mensaje del cliente (o el cuerpo del chat). El servidor parsea solo las líneas que ya envía el botón de la web.

### Texto que envía hoy la ficha (ejemplo real)

```
Hola AutoDato, consulta sobre ficha certificada:

ID ficha: hyundai-santa-fe-2018-4k2m
Folio AutoDato: 12
Chasis: KMHxxxxx
Patente: ABCD12
Vehículo: HYUNDAI SANTA FE 2018
Enlace: https://autodato.cl/aprobado/hyundai-santa-fe-2018-4k2m

Necesito información sobre esta unidad revisada.
```

## Request recomendado para Vambe (`lookup-flat`)

```json
{
  "channel": "vambe",
  "whatsapp_message": "Hola AutoDato, consulta sobre ficha certificada:\n\nID ficha: hyundai-santa-fe-2018-4k2m\nFolio AutoDato: 12\n..."
}
```

Solo con mensaje basta; también puedes enviar campos explícitos:

```json
{
  "channel": "vambe",
  "public_slug": "hyundai-santa-fe-2018-4k2m",
  "folio": 12,
  "numero_chasis": "KMHxxxxx",
  "patente": "ABCD12",
  "ficha_url": "https://autodato.cl/aprobado/hyundai-santa-fe-2018-4k2m"
}
```

### Variante con objeto `reference` (`lookup`)

```json
{
  "action": "lookup",
  "channel": "vambe",
  "reference": {
    "public_slug": "hyundai-santa-fe-2018-4k2m"
  },
  "whatsapp_message": ""
}
```

## Respuesta exitosa (200)

```json
{
  "ok": true,
  "channel": "vambe",
  "matched_by": "public_slug",
  "reference_used": {
    "public_slug": "hyundai-santa-fe-2018-4k2m",
    "folio": 12,
    "numero_chasis": "KMHxxxxx",
    "patente": "ABCD12",
    "ficha_url": "https://autodato.cl/aprobado/hyundai-santa-fe-2018-4k2m",
    "parsed_from_message": true
  },
  "vehicle": {
    "public_slug": "hyundai-santa-fe-2018-4k2m",
    "folio": 12,
    "title": "HYUNDAI SANTA FE 2018",
    "marca": "HYUNDAI",
    "modelo": "SANTA FE",
    "ano": 2018,
    "patente": "ABCD12",
    "numero_chasis": "KMHxxxxx",
    "kilometraje_tablero": 85000,
    "kilometraje_real": 202000,
    "revisado_por": "Juan Pérez",
    "garantia_vendedor": false,
    "vendedor": {
      "nombre": "MALL COREANO",
      "telefono": null,
      "whatsapp": "56912345678"
    },
    "ubicacion": {
      "nombre": "Iquique",
      "direccion": "Av. …",
      "maps_url": "https://maps.google.com/…"
    },
    "precios": {
      "referencia": null,
      "referencia_texto": null,
      "financiado": null,
      "cuota_mensual": null,
      "nota": "Precios referenciales del vendedor; confirmar disponibilidad y monto con la automotora."
    },
    "ficha_url": "https://autodato.cl/aprobado/hyundai-santa-fe-2018-4k2m",
    "foto_portada_url": "https://xxxx.supabase.co/storage/v1/object/public/.../portada.jpg",
    "imagenes": {
      "portada": "https://xxxx.supabase.co/storage/v1/object/public/.../portada.jpg",
      "galeria": ["https://.../1.jpg", "https://.../2.jpg"]
    },
    "informe_resumen": {
      "conclusion": "Unidad en condiciones …",
      "informe_pdf": "https://…",
      "items": [
        { "key": "motor", "label": "Motor", "text": "…" }
      ]
    },
    "message_for_assistant": "Certificado AutoDato: HYUNDAI SANTA FE 2018. Folio de revisión: 12. …"
  }
}
```

**Campo clave para el prompt:** `vehicle.message_for_assistant` (texto listo para system prompt o contexto del LLM).

## Errores

| HTTP | `error_code` | Significado |
|------|----------------|-------------|
| 401 | — | Token inválido |
| 400 | `REFERENCE_REQUIRED` | Sin slug/folio/chasis/patente/URL/mensaje |
| 404 | `NOT_FOUND` | No hay ficha con esos datos |
| 404 | `VEHICLE_NOT_PUBLISHED` | Existe pero no está aprobada o venció |
| 409 | `AMBIGUOUS_MATCH` | Más de un vehículo; pedir ID ficha o enlace |
| 501/502 | `SUPABASE_*` | Servidor sin Supabase o error de lectura |

Ejemplo error:

```json
{
  "ok": false,
  "error_code": "NOT_FOUND",
  "message": "No encontramos un vehículo certificado con esos datos."
}
```

---

## Instrucciones para configurar en Vambe (copiar al asistente)

### 1. Webhook / herramienta HTTP

- **Nombre sugerido:** `autodato_buscar_ficha_aprobada`
- **URL:** `https://autodato.cl/api/vambe/aprobados/lookup-flat`
- **Método:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <ASISTENTE_PRECIOS_TOKEN>` *(mismo token que cotización AutoDato)*

### 2. Cuándo llamarlo

En el flujo de WhatsApp de **AutoDato (no vendedor)**:

1. Al **primer mensaje** del cliente (o cuando detectes “consulta sobre ficha certificada” / “Folio AutoDato” / enlace `autodato.cl/aprobado/`).
2. En **cada nueva consulta** si no tienes ya `public_slug` guardado en variables de conversación.
3. **No** llamarlo para cotización de servicios del taller (usa `/api/vambe/catalog/quote-flat`).

### 3. Cuerpo que debe armar Vambe

Prioridad:

1. Si tienes el texto del cliente → envía solo:

```json
{ "channel": "vambe", "whatsapp_message": "<texto completo del mensaje entrante>" }
```

2. Si ya extrajiste variables → añade campos planos (`public_slug`, `folio`, etc.).

### 4. Qué hacer con la respuesta

| Si `ok === true` | Acción |
|------------------|--------|
| Guardar en memoria de conversación | `vehicle.public_slug`, `vehicle.folio`, `vehicle.ficha_url` |
| Responder al cliente | Usar `informe_resumen` y datos técnicos; no inventar precio si `precios.referencia` es null |
| Venta / visita | Ofrecer contacto con **vendedor** (`vehicle.vendedor.whatsapp`) — AutoDato no vende el auto |
| Taller / post-venta | Ofrecer agendar servicio con flujo de cotización habitual |

| Si `error_code === NOT_FOUND` | Pedir al cliente el **enlace de la ficha** o escanear de nuevo el QR del sello. |
| Si `AMBIGUOUS_MATCH` | Mostrar `candidates` y pedir que confirme cuál auto (por folio o enlace). |

### 5. Prompt sugerido (fragmento)

```
Cuando el cliente escribe por WhatsApp tras "Contactar a AutoDato" desde una ficha certificada,
SIEMPRE llama primero a autodato_buscar_ficha_aprobada con whatsapp_message = mensaje completo del usuario.
Basa tus respuestas en vehicle.message_for_assistant e informe_resumen.
No prometas precio de venta ni disponibilidad sin confirmar con la automotora (vehicle.vendedor).
Si preguntan por comprar o probar el auto, orienta al WhatsApp del vendedor cuando exista vehicle.vendedor.whatsapp.
```

### 6. cURL de prueba

```bash
curl -s -X POST https://autodato.cl/api/vambe/aprobados/lookup-flat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d "{\"channel\":\"vambe\",\"public_slug\":\"TU-SLUG-DE-PRUEBA\"}"
```

### 7. Variables de entorno en Render (ya usadas por cotización)

| Variable | Necesaria |
|----------|-----------|
| `SUPABASE_URL` | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí (lectura aprobados, ignora borradores en lógica) |
| `ASISTENTE_PRECIOS_TOKEN` o `ASSISTANT_WEBHOOK_TOKEN` | Sí |
| `PUBLIC_SITE_URL` | Opcional (default `https://autodato.cl` en enlaces de respuesta) |

---

## Archivos en el repo

- `asistente-aprobados.js` — parser de mensaje + consulta Supabase + payload Vambe
- `server.js` — rutas `POST /api/vambe/aprobados/lookup` y `lookup-flat`
- `aprobados-cliente.js` — texto prellenado del botón «Contactar a AutoDato por WhatsApp»
