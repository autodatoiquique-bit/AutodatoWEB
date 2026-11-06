-- Corrección: servicios de refrigerante no deben quedar en familia cambio_aceite.
-- La regla previa emparejaba la marca "Valvoline" en líquidos que no son aceite motor (p. ej. ZEREX).
-- Requisito: columnas desde servicio_familias_vambe.sql y función merge_service_family_array
--   de servicio_familias_vambe_datos_iniciales.sql (o ejecutar después de ese script).

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

-- Quitar cambio_aceite donde el texto es refrigerante/coolant (incl. Valvoline ZEREX, sin tocar código ni nombre).
update public.servicios s
set service_families = public.remove_service_family(coalesce(s.service_families, '[]'::jsonb), 'cambio_aceite')
where coalesce(s.activo, true) = true
  and (
    lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ 'refrigerante|liquido\s+de\s+enfri|anticongelante|coolant|zerex'
    or (
      lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) ~ 'valvoline'
      and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '')) !~ 'aceite|5w|10w|w30|w40|0w'
    )
  );

-- Familia explícita para refrigerante (discovery por service_family=cambio_refrigerante).
update public.servicios s
set service_families = public.merge_service_family_array(coalesce(s.service_families, '[]'::jsonb), 'cambio_refrigerante')
where coalesce(s.activo, true) = true
  and lower(coalesce(s.nombre, '') || ' ' || coalesce(s.resumen, '') || ' ' || coalesce(s.detalle, '')) ~ 'refrigerante|liquido\s+de\s+enfri|anticongelante|coolant|zerex';

-- Opcional tras verificación:
-- drop function if exists public.remove_service_family(jsonb, text);
