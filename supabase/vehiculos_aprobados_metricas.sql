-- Métricas vitrina: visitas enlace/QR y clics WhatsApp vendedor.
-- Ejecutar en Supabase SQL Editor.

alter table vehiculos_aprobados add column if not exists metricas_qr integer not null default 0;
alter table vehiculos_aprobados add column if not exists metricas_whatsapp integer not null default 0;

comment on column vehiculos_aprobados.metricas_qr is 'Visitas a la ficha pública (QR/enlace), aprox. una por sesión';
comment on column vehiculos_aprobados.metricas_whatsapp is 'Clics en Consultar por WhatsApp desde la ficha';

create or replace function incrementar_metrica_aprobado(p_slug text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo = 'qr' then
    update vehiculos_aprobados
    set metricas_qr = coalesce(metricas_qr, 0) + 1,
        updated_at = now()
    where public_slug = trim(p_slug)
      and estado = 'aprobado';
  elsif p_tipo = 'whatsapp' then
    update vehiculos_aprobados
    set metricas_whatsapp = coalesce(metricas_whatsapp, 0) + 1,
        updated_at = now()
    where public_slug = trim(p_slug)
      and estado = 'aprobado';
  end if;
end;
$$;

grant execute on function incrementar_metrica_aprobado(text, text) to anon, authenticated;
