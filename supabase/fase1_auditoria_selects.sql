-- Fase 1 — Auditoría de solo lectura (ejecutar en Supabase SQL Editor, producción o staging).
-- No modifica datos. Copiar resultados al informe en docs/fase1-auditoria-produccion.md
--
-- NOTA: En algunos proyectos la tabla public.servicios NO tiene columna numero_serie
-- (el código 0003 lo aporta catalogo-canales.json en Storage). Este script no usa numero_serie.

-- 0) Estructura: todas las columnas de servicios (y tablas relacionadas)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'servicios'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'complementos'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'promociones'
order by ordinal_position;

-- 1) Servicios cuyo id ES el código operativo ('0003', '0004', '0011')
-- Si no devuelve filas, en tu BD los ids pueden ser descarb/ckp/... : usar bloque 1b y Storage catalogo-canales.json para numero_serie.
select id, nombre, precio, activo, tipo, service_families, tags,
       substring(concat_ws(' ', nombre, resumen, detalle) from 1 for 200) as texto_corto
from public.servicios
where id in ('0003', '0004', '0011')
order by id;

-- 1b) Búsqueda por texto (aceite / refrigerante) para mapear id real ↔ código en extras
select id, nombre, precio, activo, service_families,
       substring(concat_ws(' ', nombre, resumen, detalle) from 1 for 200) as texto_corto
from public.servicios
where coalesce(activo, true) = true
  and (
    lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'zerex|mst|\bxl|aceite|cambio.*aceite'
    or lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'refrigerante|coolant|anticongelante'
  )
order by nombre;

-- 2) Descarbonización y CKP por ids de semilla (confirmar en prod)
select id, nombre, precio, activo, tipo, service_families, tags
from public.servicios
where id in ('descarb', 'ckp')
order by id;

-- 3) Texto descarbon / CKP (si los ids no son descarb/ckp)
select id, nombre, precio, activo, service_families,
       substring(concat_ws(' ', nombre, resumen, detalle) from 1 for 120) as texto_corto
from public.servicios
where coalesce(activo, true) = true
  and (
    lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'descarbon'
    or lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'ckp|sensor.*cigüeñal|cigueñal|crankshaft'
  )
order by nombre;

-- 4) Complementos: padre descarbonización → CKP (ajustar ids si en prod difieren)
select c.servicio_id, p.nombre as padre_nombre, c.asociado_id, a.nombre as asociado_nombre,
       c.precio_combo, c.etiqueta
from public.complementos c
join public.servicios p on p.id = c.servicio_id
join public.servicios a on a.id = c.asociado_id
where (c.servicio_id = 'descarb' and c.asociado_id = 'ckp')
   or (lower(p.nombre) ~ 'descarbon' and lower(a.nombre) ~ 'ckp');

-- 5) Complementos que involucran descarb o ckp
select *
from public.complementos
where servicio_id in ('descarb', 'ckp') or asociado_id in ('descarb', 'ckp')
order by servicio_id, asociado_id;

-- 6) Refrigerante / ZEREX
select id, nombre, precio, activo, service_families, tags
from public.servicios
where coalesce(activo, true) = true
  and lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'refrigerante|zerex|anticongelante|coolant|l[ií]quido\s+de\s+enfri'
order by nombre;

-- 7) cambio_aceite en service_families pero parece refrigerante (diagnóstico)
select id, nombre, service_families,
       substring(concat_ws(' ', nombre, resumen, detalle) from 1 for 160) as texto_corto
from public.servicios
where coalesce(activo, true) = true
  and service_families @> '["cambio_aceite"]'::jsonb
  and (
    lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'refrigerante|zerex|anticongelante|coolant|l[ií]quido\s+de\s+enfri'
    or (
      lower(concat_ws(' ', nombre, resumen)) ~ 'valvoline'
      and lower(concat_ws(' ', nombre, resumen)) !~ 'aceite|5w|10w|w30|w40|0w'
    )
  );

-- 8) Promociones activas (servicios descarb, ckp, refrigerante por id)
select *
from public.promociones
where activo = true
  and servicio_id in (select id from public.servicios where id in ('descarb', 'ckp', 'refrigerante'))
order by prioridad, nombre
limit 50;

-- OPCIONAL — solo si en tu proyecto existe public.servicios.numero_serie:
-- with codigos as (select * from (values ('0003'::text), ('0004'::text), ('0011'::text)) t(cod))
-- select s.id, s.numero_serie, lpad(s.numero_serie::text, 4, '0') as codigo_display, s.nombre, s.precio, s.service_families
-- from public.servicios s join codigos c on lpad(s.numero_serie::text, 4, '0') = c.cod;
