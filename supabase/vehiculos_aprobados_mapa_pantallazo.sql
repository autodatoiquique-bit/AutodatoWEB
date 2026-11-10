-- Opcional: los datos del pantallazo viven en informe (mapa_imagen, mapa_off_x, mapa_off_y, mapa_zoom).
-- Este script solo documenta los campos; no es obligatorio si ya usas informe jsonb.

comment on column vehiculos_aprobados.informe is
  'JSON: escaner, PDF, conclusión, mapa_imagen (pantallazo Maps), mapa_off_x/y, mapa_zoom';
