-- Vambe: cotizaciones persistentes + promociones temporales (ejecutar en Supabase SQL Editor).
-- El servidor usa SUPABASE_SERVICE_ROLE_KEY y no depende de RLS para escribir.

-- Si ya ejecutaste una versión anterior sin esta columna:
-- alter table cotizaciones add column if not exists ticket_idempotency_key text;

-- Cotizaciones / quotes
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'vambe',
  vehicle_json jsonb not null default '{}'::jsonb,
  request_json jsonb not null default '{}'::jsonb,
  lines_json jsonb not null default '[]'::jsonb,
  subtotal integer not null default 0,
  discount integer not null default 0,
  total integer not null default 0,
  currency text not null default 'CLP',
  catalog_version text not null default '',
  pricing_engine text not null default '1.0.0',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'open',
  idempotency_key text,
  client_ref text,
  created_ticket_code text,
  created_ticket_payload jsonb,
  ticket_idempotency_key text
);

create unique index if not exists idx_cotizaciones_channel_idempotency
  on cotizaciones (channel, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_cotizaciones_created on cotizaciones (created_at desc);

create unique index if not exists idx_cotizaciones_ticket_idem
  on cotizaciones (channel, ticket_idempotency_key)
  where ticket_idempotency_key is not null;

comment on table cotizaciones is 'Snapshots de cotización Vambe; el motor de precios es la fuente de verdad al crear/actualizar.';

-- Promociones temporales (Fase 4; si la tabla está vacía el motor no cambia)
create table if not exists promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  prioridad integer not null default 100,
  servicio_id text references servicios(id) on delete cascade,
  tipo_regla text not null default 'precio_fijo',
  precio_fijo integer,
  porcentaje_descuento numeric(6, 2),
  marca text,
  modelo text,
  ano_desde integer,
  ano_hasta integer,
  combustible text,
  cupos integer,
  cupos_usados integer not null default 0,
  condicion_combo_servicio_id text references servicios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_promociones_servicio on promociones (servicio_id) where activo = true;

-- Lectura pública/anónima opcional solo si queréis consultar desde el cliente (no recomendado). Por defecto sin políticas = solo service role.
alter table cotizaciones enable row level security;
alter table promociones enable row level security;

-- Sin políticas: anon/authenticated no ven datos; service_role bypass RLS.
