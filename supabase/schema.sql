-- Pegar todo esto en Supabase → SQL Editor → Run (una vez).

create table if not exists servicios (
  id text primary key,
  tipo text not null default 'oferta',
  nombre text not null,
  resumen text default '',
  detalle text default '',
  foto text default '',
  galeria jsonb default '[]'::jsonb,
  videos jsonb default '[]'::jsonb,
  precio integer,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists complementos (
  servicio_id text not null references servicios(id) on delete cascade,
  asociado_id text not null references servicios(id) on delete cascade,
  precio_combo integer not null,
  etiqueta text default '',
  primary key (servicio_id, asociado_id)
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  payload jsonb not null,
  patente text,
  telefono text,
  created_at timestamptz default now()
);

alter table servicios enable row level security;
alter table complementos enable row level security;
alter table tickets enable row level security;

drop policy if exists servicios_read on servicios;
drop policy if exists servicios_write on servicios;
drop policy if exists complementos_read on complementos;
drop policy if exists complementos_write on complementos;
drop policy if exists tickets_insert on tickets;
drop policy if exists tickets_admin_read on tickets;

create policy servicios_read on servicios for select using (true);
create policy servicios_write on servicios for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy complementos_read on complementos for select using (true);
create policy complementos_write on complementos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy tickets_insert on tickets for insert with check (true);
create policy tickets_admin_read on tickets for select
  using (auth.role() = 'authenticated');

create or replace function norm_patente(v text)
returns text language sql immutable as $$
  select regexp_replace(upper(coalesce(v, '')), '[\s.\-]', '', 'g');
$$;

create or replace function norm_fono(v text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(v, ''), '\D', '', 'g'), '^56', '');
$$;

create or replace function buscar_ticket(p_patente text, p_telefono text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select payload
  from tickets
  where norm_patente(patente) = norm_patente(p_patente)
    and norm_fono(telefono) = norm_fono(p_telefono)
  order by created_at desc
  limit 1;
$$;

revoke all on function buscar_ticket(text, text) from public;
grant execute on function buscar_ticket(text, text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('servicios', 'servicios', true)
on conflict (id) do nothing;

drop policy if exists fotos_public on storage.objects;
drop policy if exists fotos_admin_ins on storage.objects;
drop policy if exists fotos_admin_upd on storage.objects;
drop policy if exists fotos_admin_del on storage.objects;

create policy fotos_public on storage.objects
  for select using (bucket_id = 'servicios');
create policy fotos_admin_ins on storage.objects
  for insert with check (bucket_id = 'servicios' and auth.role() = 'authenticated');
create policy fotos_admin_upd on storage.objects
  for update using (bucket_id = 'servicios' and auth.role() = 'authenticated');
create policy fotos_admin_del on storage.objects
  for delete using (bucket_id = 'servicios' and auth.role() = 'authenticated');

insert into servicios (id, tipo, nombre, resumen, detalle, foto, precio) values
  ('descarb', 'oferta', 'Descarbonización de sistemas de admisión', 'Limpieza profunda de admisión para recuperar respuesta y consumo.', 'Trabajo preventivo de admisión. En el catálogo ves el precio de lista. Los descuentos aparecen solo cuando ya elegiste un servicio y armas combo.', 'imagenes/scanner.jpg', 240000),
  ('refrigerante', 'oferta', 'Cambio de refrigerante ZEREX Valvoline', 'Recambio de refrigerante ZEREX Valvoline.', 'Precio de lista $90.000. Si ya tienes descarbonización en el carrito, baja a $50.000.', 'imagenes/aceite.jpg', 90000),
  ('ckp', 'oferta', 'Cambio de sensor CKP original', 'Sensor CKP original.', 'Precio de lista $220.000. Junto con la descarbonización baja a $160.000.', 'imagenes/frenos.jpg', 220000),
  ('termostato', 'oferta', 'Cambio de termostato', 'Cambio de termostato.', 'Precio de lista $80.000. Junto con el cambio de refrigerante baja a $65.000.', 'imagenes/alineacion.jpg', 80000),
  ('filtro-aire', 'oferta', 'Cambio de filtro de aire', 'Filtro de aire.', 'Precio de lista $17.500. Junto con la descarbonización baja a $15.000.', 'imagenes/ruta.jpg', 17500),
  ('aceite-valvoline', 'oferta', 'Cambio de aceite Valvoline 5W30 MST', 'Aceite Valvoline 5W30 MST.', 'Precio de lista $165.000. Con la descarbonización baja a $134.000.', 'imagenes/aceite.jpg', 165000),
  ('diag-escaner', 'diagnostico', 'Diagnóstico escáner (check engine, pérdida de potencia)', 'Scanner para check engine y pérdida de potencia.', 'Lectura de fallas, check engine y pérdida de potencia.', 'imagenes/scanner.jpg', 49990),
  ('diag-suspension', 'diagnostico', 'Diagnóstico de suspensión, dirección o frenos', 'Revisión de suspensión, dirección o frenos.', 'Diagnóstico de suspensión, dirección o frenos.', 'imagenes/frenos.jpg', 44990),
  ('diag-fugas', 'diagnostico', 'Diagnóstico de fugas y sonidos de motor (mecánica general)', 'Fugas y sonidos de motor. Mecánica general.', 'Diagnóstico de fugas y ruidos de motor.', 'imagenes/alineacion.jpg', 44990)
on conflict (id) do nothing;

insert into complementos (servicio_id, asociado_id, precio_combo, etiqueta) values
  ('descarb', 'refrigerante', 50000, 'con descarbonización'),
  ('descarb', 'ckp', 160000, 'con descarbonización'),
  ('descarb', 'filtro-aire', 15000, 'con descarbonización'),
  ('descarb', 'aceite-valvoline', 134000, 'con descarbonización'),
  ('refrigerante', 'termostato', 65000, 'con cambio de refrigerante')
on conflict do nothing;

create table if not exists portada_slides (
  id text primary key,
  foto text not null,
  servicio_id text references servicios(id) on delete set null,
  btn_texto text default 'Agregar al carrito',
  btn_x numeric not null default 50,
  btn_y numeric not null default 72,
  orden integer not null default 0
);

alter table portada_slides enable row level security;

drop policy if exists portada_read on portada_slides;
drop policy if exists portada_write on portada_slides;

create policy portada_read on portada_slides for select using (true);
create policy portada_write on portada_slides for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
