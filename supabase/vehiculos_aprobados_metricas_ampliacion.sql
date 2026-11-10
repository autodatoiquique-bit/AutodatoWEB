-- Métricas extra: Maps, compartir, visitas web/enlace (sin QR).
-- Ejecutar en Supabase SQL Editor después de vehiculos_aprobados_metricas.sql

alter table vehiculos_aprobados add column if not exists metricas_web integer not null default 0;
alter table vehiculos_aprobados add column if not exists metricas_maps integer not null default 0;
alter table vehiculos_aprobados add column if not exists metricas_compartir integer not null default 0;

comment on column vehiculos_aprobados.metricas_web is 'Visitas a la ficha sin ?src=qr (catálogo, enlace), aprox. una por sesión';
comment on column vehiculos_aprobados.metricas_maps is 'Clics en abrir Google Maps desde la ficha';
comment on column vehiculos_aprobados.metricas_compartir is 'Veces que compartieron la ficha (nativo o copiar enlace)';

create or replace function incrementar_metrica_aprobado(p_slug text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo = 'qr' then
    update vehiculos_aprobados
    set metricas_qr = coalesce(metricas_qr, 0) + 1, updated_at = now()
    where public_slug = trim(p_slug) and estado = 'aprobado';
  elsif p_tipo = 'whatsapp' then
    update vehiculos_aprobados
    set metricas_whatsapp = coalesce(metricas_whatsapp, 0) + 1, updated_at = now()
    where public_slug = trim(p_slug) and estado = 'aprobado';
  elsif p_tipo = 'web' then
    update vehiculos_aprobados
    set metricas_web = coalesce(metricas_web, 0) + 1, updated_at = now()
    where public_slug = trim(p_slug) and estado = 'aprobado';
  elsif p_tipo = 'maps' then
    update vehiculos_aprobados
    set metricas_maps = coalesce(metricas_maps, 0) + 1, updated_at = now()
    where public_slug = trim(p_slug) and estado = 'aprobado';
  elsif p_tipo = 'compartir' then
    update vehiculos_aprobados
    set metricas_compartir = coalesce(metricas_compartir, 0) + 1, updated_at = now()
    where public_slug = trim(p_slug) and estado = 'aprobado';
  end if;
end;
$$;

grant execute on function incrementar_metrica_aprobado(text, text) to anon, authenticated;
