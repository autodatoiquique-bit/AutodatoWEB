-- Estado RESERVADO: visible en vitrina como Aprobado.

alter table vehiculos_aprobados drop constraint if exists vehiculos_aprobados_estado_check;

alter table vehiculos_aprobados add constraint vehiculos_aprobados_estado_check check (
  estado in ('borrador', 'en_revision', 'aprobado', 'reservado', 'rechazado', 'vencido')
);

drop policy if exists vehiculos_aprobados_public_read on vehiculos_aprobados;

create policy vehiculos_aprobados_public_read on vehiculos_aprobados for select
  using (
    estado in ('aprobado', 'reservado')
    and (vigente_hasta is null or vigente_hasta > now())
  );

-- Métricas: mismo tratamiento que aprobado
create or replace function incrementar_metrica_aprobado(p_slug text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo = 'qr' then
    update vehiculos_aprobados set metricas_qr = coalesce(metricas_qr, 0) + 1
    where public_slug = trim(p_slug) and estado in ('aprobado', 'reservado');
  elsif p_tipo = 'whatsapp' then
    update vehiculos_aprobados set metricas_whatsapp = coalesce(metricas_whatsapp, 0) + 1
    where public_slug = trim(p_slug) and estado in ('aprobado', 'reservado');
  elsif p_tipo = 'web' then
    update vehiculos_aprobados set metricas_web = coalesce(metricas_web, 0) + 1
    where public_slug = trim(p_slug) and estado in ('aprobado', 'reservado');
  elsif p_tipo = 'maps' then
    update vehiculos_aprobados set metricas_maps = coalesce(metricas_maps, 0) + 1
    where public_slug = trim(p_slug) and estado in ('aprobado', 'reservado');
  elsif p_tipo = 'compartir' then
    update vehiculos_aprobados set metricas_compartir = coalesce(metricas_compartir, 0) + 1
    where public_slug = trim(p_slug) and estado in ('aprobado', 'reservado');
  end if;
end;
$$;

grant execute on function incrementar_metrica_aprobado(text, text) to anon, authenticated;
