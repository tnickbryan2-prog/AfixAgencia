// =====================================================================
//  CONFIGURACIÓN · edita solo este archivo
// =====================================================================
window.APP_CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL: "https://vqmwzdowzvttfiiokynf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxbXd6ZG93enZ0dGZpaW9reW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MjUzMDQsImV4cCI6MjEwOTQwMTMwNH0.6dB8uUmNw-hpkLa-yLIF1C66D7Vutwk__ct5-cn2hjA",

  // Nombre que se muestra en la cabecera
  CAMPANA: "Activación Afix PVC · Sodimac",

  // Premios que se entregan al cliente (desplegable del formulario)
  PREMIOS: [
    "Lapicero",
    "Adhesivo Gris 2 oz",
    "Adhesivo Dorado 2 oz",
    "Adhesivo Azul 2 oz",
  ],

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
