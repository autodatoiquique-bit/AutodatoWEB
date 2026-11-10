-- Folio consecutivo + kilometraje tablero/real (ejecutar después de la tabla base).

create sequence if not exists vehiculos_aprobados_folio_seq start 1;

alter table vehiculos_aprobados add column if not exists folio integer;
alter table vehiculos_aprobados add column if not exists kilometraje_tablero integer;
alter table vehiculos_aprobados add column if not exists kilometraje_real integer;

with numbered as (
  select id, row_number() over (order by created_at nulls last, id) as n
  from vehiculos_aprobados
  where folio is null
)
update vehiculos_aprobados v
set folio = numbered.n
from numbered
where v.id = numbered.id;

select setval(
  'vehiculos_aprobados_folio_seq',
  greatest(coalesce((select max(folio) from vehiculos_aprobados), 0), 1),
  true
);

alter table vehiculos_aprobados
  alter column folio set default nextval('vehiculos_aprobados_folio_seq');

create unique index if not exists idx_vehiculos_aprobados_folio
  on vehiculos_aprobados (folio);

comment on column vehiculos_aprobados.folio is 'Número consecutivo visible en informe y QR';
comment on column vehiculos_aprobados.kilometraje_tablero is 'Km indicados en el tablero del vehículo';
comment on column vehiculos_aprobados.kilometraje_real is 'Km estimados/reales según revisión AutoDato';

-- Opcional: vitrina puede seguir leyendo kilometraje legacy
update vehiculos_aprobados
set kilometraje_tablero = coalesce(kilometraje_tablero, kilometraje)
where kilometraje is not null and kilometraje_tablero is null;

update vehiculos_aprobados
set kilometraje_real = coalesce(kilometraje_real, kilometraje_tablero, kilometraje)
where kilometraje_real is null
  and coalesce(kilometraje_tablero, kilometraje) is not null;
