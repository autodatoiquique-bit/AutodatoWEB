/**
 * Catálogo de equipamiento — fichas Aprobados AutoDato (admin + vitrina pública).
 */
"use strict";

const APROBADO_EQUIPAMIENTO_CATALOGO = [
  {
    id: "confort",
    titulo: "Confort y climatización",
    items: [
      { id: "clima_bizona", label: "Climatizador automático bizona" },
      { id: "clima_trizona", label: "Climatizador trizona con control independiente trasero" },
      { id: "ac_difusores_2_3", label: "Aire acondicionado con difusores para 2da y 3ra corrida" },
      { id: "asientos_del_calefaccionados", label: "Asientos delanteros calefaccionados" },
      { id: "asientos_tras_calefaccionados", label: "Asientos traseros calefaccionados (2da corrida)" },
      { id: "asientos_del_ventilacion", label: "Asientos delanteros con ventilación activa (frío)" },
      { id: "butaca_cond_electrica_memoria", label: "Butaca del conductor con ajuste eléctrico y memoria de posición" },
      { id: "butaca_copiloto_electrica", label: "Butaca del copiloto con ajuste eléctrico" },
      { id: "soporte_lumbar_electrico", label: "Butaca con soporte lumbar eléctrico" },
      { id: "tapiceria_cuero", label: "Tapicería completa en cuero" },
      { id: "volante_calefaccionado", label: "Volante calefaccionado" },
      { id: "techo_panoramico", label: "Techo panorámico con apertura eléctrica (Sunroof)" },
      { id: "cortinas_parasol_puertas", label: "Cortinas parasol retráctiles integradas en puertas traseras" },
      { id: "vidrios_tinte_privacidad", label: "Vidrios con tinte de privacidad de fábrica" },
    ],
  },
  {
    id: "tecnologia",
    titulo: "Tecnología, audio y energía",
    items: [
      { id: "toma_220v", label: "Toma de corriente de 220V / 200W integrada de fábrica (Inversor AC)" },
      { id: "pantalla_multimedia", label: "Pantalla táctil multimedia central" },
      { id: "carplay_android_auto", label: "Conectividad Apple CarPlay y Android Auto" },
      { id: "bluetooth", label: "Conexión Bluetooth para llamadas y audio streaming" },
      { id: "cargador_inalambrico", label: "Cargador inalámbrico para smartphone en consola central" },
      { id: "usb_rapido", label: "Puertos USB de carga rápida en consola frontal y plazas traseras" },
      { id: "audio_premium", label: "Sistema de audio premium (parlantes y subwoofer de fábrica)" },
      { id: "tablero_digital", label: "Tablero de instrumentos con pantalla digital configurable" },
      { id: "mandos_volante", label: "Mandos de audio y telefonía al volante" },
      { id: "crucero_volante", label: "Control de velocidad crucero en volante" },
      { id: "crucero_adaptativo_scc", label: "Control de crucero adaptativo inteligente (SCC)" },
    ],
  },
  {
    id: "accesorios",
    titulo: "Accesorios y conveniencia",
    items: [
      { id: "smart_key", label: "Llave inteligente con apertura por proximidad (Smart Key)" },
      { id: "start_stop", label: "Botón de encendido y apagado de motor (Start/Stop Engine)" },
      { id: "encendido_remoto", label: "Encendido remoto de motor desde la llave" },
      { id: "espejos_abatibles_calefaccionados", label: "Espejos laterales abatibles eléctricamente con calefacción" },
      { id: "retrovisor_electrocromico", label: "Espejo retrovisor interior electrocrómico (antiencandilamiento)" },
      { id: "freno_epb", label: "Freno de estacionamiento electrónico (EPB)" },
      { id: "auto_hold", label: "Función Auto-Hold (freno asistido para detenciones en semáforos)" },
      { id: "porton_electrico", label: "Portón trasero con apertura y cierre eléctrico / manos libres" },
      { id: "paddle_shift", label: "Levas de cambio al volante (Paddle Shift)" },
      { id: "drive_mode", label: "Selector de modos de conducción (Drive Mode: Eco / Normal / Sport / Smart)" },
    ],
  },
  {
    id: "seguridad",
    titulo: "Seguridad y asistencias a la conducción",
    items: [
      { id: "camara_retroceso", label: "Cámara de retroceso con líneas de guiado dinámicas" },
      { id: "camara_360", label: "Sistema de cámaras de visión 360° (vista de pájaro)" },
      { id: "sensores_estacionamiento_tras", label: "Sensores de estacionamiento traseros" },
      { id: "sensores_estacionamiento_del", label: "Sensores de estacionamiento delanteros" },
      { id: "faros_led_xenon", label: "Luces delanteras con proyector Full LED / Xenón" },
      { id: "luces_automaticas", label: "Encendido automático de luces (sensor de luminosidad)" },
      { id: "sensor_lluvia", label: "Sensor de lluvia (activación automática de limpiaparabrisas)" },
      { id: "punto_ciego_bsd", label: "Sensor de punto ciego en espejos retrovisores (BSD)" },
      { id: "rcta", label: "Alerta de tráfico cruzado trasero (RCTA)" },
      { id: "lka", label: "Asistente de mantenimiento de carril (LKA)" },
      { id: "hac", label: "Asistente de arranque en pendientes (HAC)" },
      { id: "dbc", label: "Control de frenado en bajadas pronunciadas (DBC)" },
      { id: "bloqueo_4wd", label: "Bloqueo de diferencial 4x4 (4WD Lock)" },
      { id: "isofix", label: "Anclajes ISOFIX para sillas infantiles en plazas traseras" },
    ],
  },
  {
    id: "espacio",
    titulo: "Espacio, habitabilidad y exterior",
    items: [
      { id: "asientos_7_pax", label: "Configuración de 3 corridas de asientos (capacidad para 7 pasajeros)" },
      { id: "segunda_corrida_deslizante", label: "Segunda corrida de asientos deslizante y reclinable" },
      { id: "asientos_abatibles_60_40", label: "Asientos traseros abatibles 60/40 en piso plano" },
      { id: "llantas_aleacion", label: "Llantas de aleación de aluminio originales" },
      { id: "barras_techo", label: "Barras de techo longitudinales integradas de fábrica" },
      { id: "neblineros", label: "Neblineros delanteros LED / halógenos" },
      { id: "rueda_repuesto_completa", label: "Rueda de repuesto de tamaño completo con llanta original" },
    ],
  },
];

/** @returns {Set<string>} */
function idsEquipamientoAprobadoSet(ids) {
  const out = new Set();
  if (!Array.isArray(ids)) return out;
  ids.forEach((x) => {
    const id = String(x || "").trim();
    if (id) out.add(id);
  });
  return out;
}
