-- Si ya creaste vehiculos_aprobados con el script inicial, ejecuta SOLO este archivo.

alter table vehiculos_aprobados add column if not exists version text;
alter table vehiculos_aprobados add column if not exists color text;
alter table vehiculos_aprobados add column if not exists carroceria text;
alter table vehiculos_aprobados add column if not exists transmision text;
alter table vehiculos_aprobados add column if not exists combustible text;
alter table vehiculos_aprobados add column if not exists traccion text;
alter table vehiculos_aprobados add column if not exists airbags integer;
alter table vehiculos_aprobados add column if not exists asientos integer;
alter table vehiculos_aprobados add column if not exists duenos integer;
alter table vehiculos_aprobados add column if not exists precio_financiado integer;
alter table vehiculos_aprobados add column if not exists cuota_referencia integer;
alter table vehiculos_aprobados add column if not exists ahorro_referencia integer;
alter table vehiculos_aprobados add column if not exists garantia_vendedor boolean not null default false;
alter table vehiculos_aprobados add column if not exists ubicacion_nombre text;
alter table vehiculos_aprobados add column if not exists ubicacion_direccion text;
alter table vehiculos_aprobados add column if not exists ubicacion_maps text;
alter table vehiculos_aprobados add column if not exists descripcion text;
alter table vehiculos_aprobados add column if not exists video_url text;
alter table vehiculos_aprobados add column if not exists whatsapp_contacto text;
alter table vehiculos_aprobados add column if not exists galeria jsonb not null default '[]'::jsonb;
alter table vehiculos_aprobados add column if not exists detalles_esteticos jsonb not null default '[]'::jsonb;
alter table vehiculos_aprobados add column if not exists cilindrada text;
alter table vehiculos_aprobados add column if not exists modelo_motor text;
alter table vehiculos_aprobados add column if not exists equipamiento jsonb not null default '[]'::jsonb;

comment on column vehiculos_aprobados.origen is 'País de importación (Japón, Corea, etc.)';
comment on column vehiculos_aprobados.equipamiento is 'Array JSON de ids de equipamiento marcados en admin';
comment on column vehiculos_aprobados.cilindrada is 'Cilindrada motor (ej. 2.0 L, 1998 cc)';
comment on column vehiculos_aprobados.modelo_motor is 'Código o modelo de motor (ej. D4HA)';
comment on column vehiculos_aprobados.combustible is 'Tipo combustible (bencina, diésel, etc.)';
comment on column vehiculos_aprobados.galeria is 'Array JSON: [{url, orden}] fotos vitrina';
comment on column vehiculos_aprobados.detalles_esteticos is 'Array JSON: [{url, caption}] imperfecciones visibles';
comment on column vehiculos_aprobados.informe is 'JSON: escaner_imagenes, informe_pdf, conclusion, observaciones_tecnicas';
