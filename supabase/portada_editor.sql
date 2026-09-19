-- Una sola New Query. Proyecto ya tiene portada_slides.

alter table portada_slides add column if not exists mostrar_boton boolean not null default false;
alter table portada_slides add column if not exists zoom numeric not null default 1;
alter table portada_slides add column if not exists pos_x numeric not null default 50;
alter table portada_slides add column if not exists pos_y numeric not null default 50;
