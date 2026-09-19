-- Pegar en Supabase → SQL Editor → Run (una vez, proyecto ya creado).
-- Deja guardar y mostrar los flyers de portada.

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
