-- Ajuste: metricas_qr = solo escaneos QR (?src=qr en la URL del código).
-- Opcional si ya corriste vehiculos_aprobados_metricas.sql (solo actualiza el comentario).

comment on column vehiculos_aprobados.metricas_qr is 'Escaneos del QR impreso (?src=qr), aprox. una por sesión';
