// =====================================================================
//  CONFIGURACIÓN · edita solo este archivo
// =====================================================================
window.APP_CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL: "https://vqmwzdowzvttfiiokynf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxbXd6ZG93enZ0dGZpaW9reW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MjUzMDQsImV4cCI6MjEwOTQwMTMwNH0.6dB8uUmNw-hpkLa-yLIF1C66D7Vutwk__ct5-cn2hjA",

  // Nombre que se muestra en la cabecera
  CAMPANA: "Activación Afix PVC · Sodimac",

  // Datos de la política de privacidad (Ley 29733). Los campos vacíos no se muestran.
  PRIVACIDAD: {
    VERSION: "v2-2026-11",                       // cambia si modificas el texto del consentimiento
    RESPONSABLE: "Artecola Perú",                // razón social del titular del banco de datos
    RUC: "",                                     // completar
    DOMICILIO: "",                               // completar
    CONTACTO: "nick.torres@artecola.com.pe",    // correo para pedir acceso, rectificación o eliminación
    CONSERVACION: "por un plazo de 72 meses desde su registro",
    UBICACION_SERVIDORES: "Brasil (São Paulo), a través del proveedor Supabase",
    REGISTRO_RNPDP: "",                          // código de inscripción del banco de datos, cuando lo tengan
  },

  // Premios que se entregan al cliente (desplegable del formulario)
  PREMIOS: [
    "Lapicero",
    "Adhesivo Gris 2 oz",
    "Adhesivo Dorado 2 oz",
    "Adhesivo Azul 2 oz",
  ],

  // Ruleta "Gira y gana": los 6 segmentos de la ruleta física, en sentido horario desde arriba.
  // tipo: lapicero | adhesivo | especial | ninguno. peso: probabilidad relativa (1 = igual que el resto).
  RULETA: [
    { tipo: "especial", titulo: "PREMIO ESPECIAL", detalle: "Un lapicero Afix + adhesivo Afix", estilo: "blanco", peso: 1 },
    { tipo: "lapicero", titulo: "GANASTE", detalle: "Un lapicero Afix", estilo: "morado", peso: 1 },
    { tipo: "ninguno",  titulo: "SIGUE", detalle: "Intentando", estilo: "morado2", peso: 1 },
    { tipo: "lapicero", titulo: "GANASTE", detalle: "Un lapicero Afix", estilo: "blanco", peso: 1 },
    { tipo: "adhesivo", titulo: "GANASTE", detalle: "Un adhesivo Afix", estilo: "lila", peso: 1 },
    { tipo: "lapicero", titulo: "GANASTE", detalle: "Un lapicero Afix", estilo: "morado", peso: 1 },
  ],
  SIN_PREMIO: "Sin premio (sigue intentando)",

  // Alerta de stock bajo cuando a una promotora le quedan esta cantidad o menos
  STOCK_MINIMO: 5,

  // Tiendas y promotora asignada. Al elegir la tienda, el formulario
  // muestra solo las promotoras de esa tienda.
  // Si una tienda tiene más de una promotora: promotoras: ["Ana", "Luz"]
  TIENDAS: [
    { tienda: "Sodimac Angamos Primavera (Surquillo)",        promotoras: ["Andrea Apaza"] },
    { tienda: "Sodimac Surquillo (Surquillo)",                promotoras: ["Elizabeth Pizarro"] },
    { tienda: "Sodimac Chacarilla (Santiago de Surco)",       promotoras: ["Elizabeth Pizarro"] },
    { tienda: "Sodimac Atocongo (SJM Open Plaza)",            promotoras: ["Sheyla Rojas"] },
    { tienda: "Sodimac Villa El Salvador",                    promotoras: ["Sheyla Rojas"] },
    { tienda: "Sodimac Ate (La Molina)",                      promotoras: ["Sheyla Rojas"] },
    { tienda: "Sodimac Javier Prado (La Victoria)",           promotoras: ["Rosa Rios"] },
    { tienda: "Sodimac San Miguel",                           promotoras: ["Rosa Rios"] },
    { tienda: "Sodimac Canta Callao (Open Plaza)",            promotoras: ["Cecilia Chipana"] },
    { tienda: "Sodimac Cono Norte (Mega Plaza Independencia)", promotoras: ["Cecilia Chipana"] },
    { tienda: "Sodimac Naranjal (Los Olivos)",                promotoras: ["Cecilia Chipana"] },
  ],
};

// Si las credenciales no se han configurado, la app funciona en MODO DEMO
// (los datos se guardan solo en este navegador, útil para probar).
window.APP_CONFIG.DEMO =
  !window.APP_CONFIG.SUPABASE_URL ||
  window.APP_CONFIG.SUPABASE_URL.includes("TU-PROYECTO") ||
  window.APP_CONFIG.SUPABASE_ANON_KEY === "TU-ANON-KEY";
