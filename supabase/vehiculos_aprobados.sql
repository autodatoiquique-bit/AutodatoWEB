-- Aprobados AutoDato: vehículos revisados (sello QR + ficha pública).
-- Ejecutar en Supabase SQL Editor (instalación nueva).

create sequence if not exists vehiculos_aprobados_folio_seq start 1;

create table if not exists vehiculos_aprobados (
  id uuid primary key default gen_random_uuid(),
  public_slug text not null unique,
  marca text not null,
  modelo text not null,
  version text,
  ano integer,
  patente text,
  color text,
  carroceria text,
  transmision text,
  combustible text,
  traccion text,
  cilindrada text,
  modelo_motor text,
  airbags integer,
  asientos integer,
  duenos integer,
  folio integer unique default nextval('vehiculos_aprobados_folio_seq'),
  kilometraje integer,
  kilometraje_tablero integer,
  kilometraje_real integer,
  precio_referencia integer,
  precio_financiado integer,
  cuota_referencia integer,
  ahorro_referencia integer,
  garantia_vendedor boolean not null default false,
  origen text,
  vendedor_nombre text,
  vendedor_telefono text,
  whatsapp_contacto text,
  ubicacion_nombre text,
  ubicacion_direccion text,
  ubicacion_maps text,
  descripcion text,
  equipamiento jsonb not null default '[]'::jsonb,
  video_url text,
  estado text not null default 'borrador',
  notas_internas text,
  foto_portada text,
  galeria jsonb not null default '[]'::jsonb,
  detalles_esteticos jsonb not null default '[]'::jsonb,
  informe jsonb not null default '{}'::jsonb,
  aprobado_at timestamptz,
  vigente_hasta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehiculos_aprobados_estado_check check (
    estado in ('borrador', 'en_revision', 'aprobado', 'rechazado', 'vencido')
  )
);

create index if not exists idx_vehiculos_aprobados_estado on vehiculos_aprobados (estado);
create index if not exists idx_vehiculos_aprobados_created on vehiculos_aprobados (created_at desc);

comment on table vehiculos_aprobados is 'Catálogo de autos con sello Aprobado por AutoDato (QR → ficha pública).';

alter table vehiculos_aprobados enable row level security;

drop policy if exists vehiculos_aprobados_public_read on vehiculos_aprobados;
drop policy if exists vehiculos_aprobados_admin on vehiculos_aprobados;

create policy vehiculos_aprobados_public_read on vehiculos_aprobados for select
  using (
    estado = 'aprobado'
    and (vigente_hasta is null or vigente_hasta > now())
  );

create policy vehiculos_aprobados_admin on vehiculos_aprobados for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
