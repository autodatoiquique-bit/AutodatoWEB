-- Si es false, la ficha pública no muestra automotora, precios, mapa ni WA vendedor.
alter table vehiculos_aprobados add column if not exists mostrar_datos_vendedor boolean not null default true;

comment on column vehiculos_aprobados.mostrar_datos_vendedor is 'Publicar en vitrina datos de automotora, ubicación, precios y contacto vendedor';
