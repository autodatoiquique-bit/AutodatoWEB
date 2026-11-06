-- Metadatos de familias de servicio para Vambe (descubrimiento sin hardcode).
-- Ejecutar en Supabase → SQL Editor cuando corresponda.

-- Columna JSON: lista de slugs estables, ej. ["cambio_aceite","descarbonizacion"]
alter table if exists servicios
  add column if not exists service_families jsonb default '[]'::jsonb;

-- Prioridad opcional para ordenar candidatos (mayor = más relevante en empates)
alter table if exists servicios
  add column if not exists priority integer;

-- Litros de aceite (u otro fluido) a nivel de servicio cuando no vaya por compatibilidad por modelo
alter table if exists servicios
  add column if not exists oil_liters numeric;

-- Tags libres (opcional); el prefijo "family:slug" se trata como familia adicional
alter table if exists servicios
  add column if not exists tags jsonb default '[]'::jsonb;

comment on column servicios.service_families is
  'Slugs estables para POST /api/vambe/catalog/compatible-services (ej. cambio_aceite).';
