-- Una sola New Query.

alter table portada_slides add column if not exists scale_x numeric not null default 1;
alter table portada_slides add column if not exists scale_y numeric not null default 1;
alter table portada_slides add column if not exists off_x numeric not null default 0;
alter table portada_slides add column if not exists off_y numeric not null default 0;
alter table portada_slides add column if not exists dir_x numeric not null default 50;
alter table portada_slides add column if not exists dir_y numeric not null default 76;
alter table portada_slides add column if not exists wa_x numeric not null default 50;
alter table portada_slides add column if not exists wa_y numeric not null default 84;
alter table portada_slides add column if not exists dots_x numeric not null default 50;
alter table portada_slides add column if not exists dots_y numeric not null default 68;
