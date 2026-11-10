-- WhatsApp del técnico certificador (visible en ficha junto a «Revisado por»).
alter table vehiculos_aprobados add column if not exists revisado_whatsapp text;

comment on column vehiculos_aprobados.revisado_whatsapp is 'WhatsApp del certificador (contacto desde ficha pública)';
