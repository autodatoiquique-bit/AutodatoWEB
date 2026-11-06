-- Fase 1 — Migración idempotente: familias Vambe + complemento descarbonización → CKP
-- Requisitos: ejecutar antes (una sola vez en el proyecto) si no existen:
--   supabase/servicio_familias_vambe.sql
--   funciones merge/remove en servicio_familias_vambe_datos_iniciales.sql y servicio_familias_vambe_fix_refrigerante.sql
--
-- NO modifica: id, nombre, resumen, detalle, precio, numero_serie, tipo.
-- SÍ actualiza: service_families (jsonb), y fila en complementos (upsert).
--
-- Antes de ejecutar: completar informe en docs/fase1-auditoria-produccion.md y verificar ids reales.

begin;

-- Asegurar funciones auxiliares (definiciones idempotentes create or replace)
create or replace function public.merge_service_family_array(p_families jsonb, p_slug text)
returns jsonb
language plpgsql
immutable
as $$
declare
  arr text[] := array[]::text[];
  x text;
  sl text;
begin
  sl := nullif(trim(coalesce(p_slug, '')), '');
  if p_families is not null and jsonb_typeof(p_families) = 'array' then
    for x in select jsonb_array_elements_text(p_families)
    loop
      if x is null or x = '' then continue; end if;
      if not exists (select 1 from unnest(arr) u where lower(u) = lower(x)) then
        arr := arr || x;
      end if;
    end loop;
  end if;
  if sl is not null then
    if not exists (select 1 from unnest(arr) u where lower(u) = lower(sl)) then
      arr := arr || sl;
    end if;
  end if;
  return to_jsonb(arr);
end;
$$;

create or replace function public.remove_service_family(p_families jsonb, p_slug text)
returns jsonb
language plpgsql
immutable
as $$
declare
  arr text[] := array[]::text[];
  x text;
  sl text;
begin
  sl := lower(nullif(trim(coalesce(p_slug, '')), ''));
  if p_families is not null and jsonb_typeof(p_families) = 'array' then
    for x in select jsonb_array_elements_text(p_families)
    loop
      if x is null or x = '' then continue; end if;
      if sl is not null and lower(trim(x)) = sl then continue; end if;
      if not exists (select 1 from unnest(arr) u where lower(u) = lower(x)) then
        arr := arr || x;
      end if;
    end loop;
  end if;
  return to_jsonb(arr);
end;
$$;

-- Validación rápida (falla explícita si faltan columnas habituales)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'servicios' and column_name = 'service_families'
  ) then
    raise exception 'Falta columna servicios.service_families; ejecutar supabase/servicio_familias_vambe.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PRE: trazabilidad (solo lectura en log de Supabase; opcional copiar resultados)
-- ---------------------------------------------------------------------------
-- Descomenta para registrar estado antes:
-- select id, numero_serie, nombre, precio, service_families from public.servicios where id in ('descarb','ckp','refrigerante') or numero_serie in (3,4,11);

-- ---------------------------------------------------------------------------
-- B) Refrigerante mal etiquetado como cambio_aceite (incl. ZEREX / Valvoline no aceite)
-- ---------------------------------------------------------------------------
update public.servicios s
set service_families = public.remove_service_family(coalesce(s.service_families, '[]'::jsonb), 'cambio_aceite')
where coalesce(s.activo, true) = true
  and (
    lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, ''))
      ~ 'refrigerante|liquido\s+de\s+enfri|anticongelante|coolant|zerex'
    or (
      lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'valvoline'
      and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'aceite|5w|10w|w30|w40|0w'
    )
  );

update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'cambio_refrigerante')
where coalesce(s.activo, true) = true
  and (
    lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, ''))
      ~ 'refrigerante|liquido\s+de\s+enfri|anticongelante|coolant|zerex'
    or (
      lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'valvoline'
      and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'aceite|5w|10w|w30|w40|0w'
    )
  );

-- ---------------------------------------------------------------------------
-- C) CKP: familia para compatible-services (sensor_ckp), sin tocar precio
--    Ajusta el predicado si en prod el id no es 'ckp' (usar subconsulta por texto).
-- ---------------------------------------------------------------------------
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'sensor_ckp')
where coalesce(s.activo, true) = true
  and s.id = 'ckp';

-- Ejemplo si el id difiere: descomentar y comentar el bloque anterior
-- update public.servicios s
-- set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'sensor_ckp')
-- where coalesce(s.activo, true) = true
--   and lower(concat_ws(' ', nombre, resumen, detalle)) ~ '\bckp\b'
--   and lower(nombre) !~ 'refrigerante';

-- ---------------------------------------------------------------------------
-- D) Descarbonización: familia descarbonizacion explícita (id descarb o detección por texto)
-- ---------------------------------------------------------------------------
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'descarbonizacion')
where coalesce(s.activo, true) = true
  and s.tipo = 'oferta'
  and (
    s.id = 'descarb'
    or (
      lower(concat_ws(' ', nombre, resumen, detalle)) ~ 'descarbon'
      and lower(concat_ws(' ', nombre, resumen)) !~ 'aceite'
    )
  );

-- ---------------------------------------------------------------------------
-- E) Complemento descarbonización → CKP precio 160000 (idempotente upsert)
--     Si servicio padre no es 'descarb', reemplazar por subconsulta documentada en docs/
-- ---------------------------------------------------------------------------
insert into public.complementos (servicio_id, asociado_id, precio_combo, etiqueta)
values ('descarb', 'ckp', 160000, 'con descarbonización')
on conflict (servicio_id, asociado_id) do update
set precio_combo = excluded.precio_combo,
    etiqueta = excluded.etiqueta
where complementos.precio_combo is distinct from excluded.precio_combo
   or complementos.etiqueta is distinct from excluded.etiqueta;

-- ---------------------------------------------------------------------------
-- POST: validaciones (deben devolver 0 filas problemáticas)
-- ---------------------------------------------------------------------------
-- Refrigerante con cambio_aceite aún (no debería)
select 'POST_FAIL_refrigerante_con_cambio_aceite' as check_id, s.id, s.numero_serie, s.nombre, s.service_families
from public.servicios s
where coalesce(s.activo, true) = true
  and s.service_families @> '["cambio_aceite"]'::jsonb
  and (
    lower(concat_ws(' ', s.nombre, s.resumen, s.detalle)) ~ 'refrigerante|zerex|anticongelante|coolant|l[ií]quido\s+de\s+enfri'
    or (
      lower(concat_ws(' ', s.nombre, s.resumen)) ~ 'valvoline'
      and lower(concat_ws(' ', s.nombre, s.resumen)) !~ 'aceite|5w|10w|w30|w40|0w'
    )
  );

-- Complemento descarb→ckp
select 'POST_CHECK_complemento_descarb_ckp' as check_id, c.*
from public.complementos c
where c.servicio_id = 'descarb' and c.asociado_id = 'ckp';

commit;
