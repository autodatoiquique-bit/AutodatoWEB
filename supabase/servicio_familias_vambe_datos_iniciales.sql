-- Población idempotente de service_families (slugs Vambe) en public.servicios.
-- Requisito: columnas desde supabase/servicio_familias_vambe.sql
-- Revisá los resultados en Table Editor; los patrones son conservadores.

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

-- Descarbonización
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'descarbonizacion')
where coalesce(s.activo, true) = true
  and s.tipo = 'oferta'
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ 'descarbon'
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'aceite';

-- Diagnóstico
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'diagnostico')
where coalesce(s.activo, true) = true
  and s.tipo = 'diagnostico';

-- Filtro de aire
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'filtro_aire')
where coalesce(s.activo, true) = true
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'filtro.*aire|aire.*filtro';

-- Filtro de combustible
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'filtro_combustible')
where coalesce(s.activo, true) = true
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'filtro.*combustible|combustible.*filtro';

-- Correa de accesorios / poly v
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'correa_accesorios')
where coalesce(s.activo, true) = true
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'correa.*accesorio|poly\s*v';

-- Cambio de aceite (excluye transmisión y líquido refrigerante; Valvoline solo si es aceite 5w/10w/etc.)
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'cambio_aceite')
where coalesce(s.activo, true) = true
  and s.tipo = 'oferta'
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'cambio.*aceite|aceite.*motor|5w30|5w-30|5w-|10w-|0w-|w30|w40'
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'transmisi|cvt|caja'
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) !~ 'refrigerante|liquido\s+de\s+enfri|anticongelante|coolant|zerex'
  and not (
    lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'valvoline'
    and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'aceite|5w|10w|w30|w40|0w'
  );

-- Cambio de refrigerante / líquido de enfriamiento
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'cambio_refrigerante')
where coalesce(s.activo, true) = true
  and (
    lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ 'refrigerante|liquido\s+de\s+enfri|anticongelante|coolant|zerex'
    or (
      lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'valvoline'
      and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'aceite|5w|10w|w30|w40|0w'
    )
  );

-- Mantención 10.000 km (solo texto explícito: 10.000, 10000 km, 10k km)
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'mantencion_10k')
where coalesce(s.activo, true) = true
  and s.tipo = 'oferta'
  and (
    lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ '10[\.\s]*000'
    or lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ '10000\s*km'
    or lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ '10k\s*km'
  );

-- Opcional tras verificación:
-- drop function if exists public.merge_service_family_array(jsonb, text);
