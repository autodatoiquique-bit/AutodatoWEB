-- Nombre del técnico que revisó la unidad (muestra en ficha pública).
alter table vehiculos_aprobados add column if not exists revisado_por text;

comment on column vehiculos_aprobados.revisado_por is 'Técnico AutoDato que certificó la revisión (visible en vitrina)';
