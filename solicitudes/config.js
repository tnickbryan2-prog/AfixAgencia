// =====================================================================
//  SOLICITUDES DE TRABAJO · configuración (edita solo este archivo)
//  La conexión a Supabase se toma de ../vouchers/config.js
// =====================================================================
window.SOLICITUDES_CONFIG = {
  // Correo que recibe el aviso de cada solicitud nueva.
  // La PRIMERA vez que alguien envíe una solicitud, FormSubmit manda a este
  // correo un mensaje de activación: ábrelo y confirma para que empiecen a llegar.
  NOTIFY_EMAIL: "nick.torres@artecola.com.pe",

  // Quién coordina (aparece en el formulario y en la solicitud formal)
  COORDINADOR: "NickT. · Jefe de Marketing",

  AREAS: [
    "Gerencia General",
    "Gerencia Comercial",
    "Desarrollo Humano (DH)",
    "Ventas B2B",
    "Ventas B2C / Canal tradicional",
    "Trade Marketing",
    "Producción / Planta",
    "Otra área",
  ],

  TIPOS: [
    "Publicación en redes sociales",
    "Pieza gráfica / diseño",
    "Video (TikTok / Reel)",
    "Comunicado interno",
    "Material de punto de venta (trade)",
    "Presentación / reporte",
    "Campaña completa",
    "Otro",
  ],

  PRIORIDADES: ["Baja", "Normal", "Alta", "Urgente"],
  ESTADOS: ["Recibida", "En evaluación", "Formalizada", "En curso", "Entregada", "Rechazada"],
};
