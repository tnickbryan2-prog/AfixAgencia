// Edge Function: analiza con Claude las fotos de góndola de un registro de sos_analisis.
// La promotora solo puede disparar el análisis de su envío recién creado (una vez).
// El administrador puede reanalizar cualquier registro.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function isAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await sb.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (!email) return false;
  const { data: rows } = await sb.from("admin_emails").select("email");
  return !!rows?.some((r: { email: string }) => r.email.toLowerCase() === email);
}

type Cfg = { own: string[]; comp: string[]; meta: number; modelo: string; max_por_hora: number; pop: { t: string }[] };

function prompt(row: Record<string, any>, cfg: Cfg, n: number) {
  const own = cfg.own.join(", ") || "ninguna";
  const rival = cfg.comp[0] || "no indicado";
  return `Eres un auditor senior de trade marketing en retail peruano (ferreterías, home centers, mercados). Analiza ${n > 1 ? `las ${n} fotos adjuntas: son tramos CONSECUTIVOS de la MISMA góndola, ordenados de izquierda a derecha (imagen 0 = primera)` : "la foto adjunta de una góndola"}.

Contexto:
- Tienda: ${row.tienda}
- Categoría declarada: ${row.categoria || "no indicada (detéctala)"}
- MARCAS PRIORITARIAS (identifícalas con máxima precisión, revisa cada empaque): ${[...cfg.own, ...cfg.comp].join(", ")}. Marca propia del cliente: ${own}. Rival principal: ${rival}.
- Además, detecta y nombra TODAS las demás marcas presentes en la góndola (por logo, empaque, color o texto legible), aunque no estén en la lista. No las agrupes como "Otras" si puedes leer el nombre.
- Ancho real informado: ${row.ancho ? row.ancho + " m" : "no informado (estímalo contando módulos/parantes; un módulo estándar mide ~1 m)"}
- Niveles informados: ${row.niveles || "no informado (cuéntalos)"}

Cómo medir:
1. Numera las repisas de arriba hacia abajo (nivel 1 = la superior).
2. En cada nivel, estima qué % del ANCHO LINEAL del frente ocupa cada marca, y qué % está vacío (hueco/quiebre). En cada nivel, marcas + vacío = 100.
3. Cuenta frentes (facings: unidades visibles al frente) y SKUs distintos (presentación/tamaño/color distintos) por marca.
4. Marca como "en_nivel_ojos" si la marca está en el nivel a la altura de los ojos (~1.4–1.6 m, normalmente nivel 2 o 3).
5. "bloque_marca" = true si la marca está agrupada en un bloque vertical u horizontal contiguo y claro.
6. Lee precios en góndola si son legibles (en soles).
7. Cajas: rectángulos normalizados 0–1 (x,y = esquina superior izquierda; w,h = ancho/alto) relativos a la imagen indicada en "img". Una caja por bloque contiguo de una marca en un nivel. Máx. 10 cajas por marca.
8. Si no reconoces una marca, agrúpala como "No identificada". No inventes datos: si no se ve, deja la lista vacía o null.
9. MATERIAL POP ACTUAL: lista cada pieza visible (cenefa, stopper, wobbler, afiche, faldón, exhibidor, marcaprecio, etc.), su marca, su estado (bueno | deteriorado | mal ubicado | tapado) y su caja.
10. OPORTUNIDADES POP para la marca propia (${own}): actúa como especialista en visual merchandising. Busca espacios CONCRETOS en la foto donde instalar material POP: bordes de repisa sin señalización frente al bloque propio, bloques propios que se pierden visualmente, zonas donde el rival tiene POP y la marca propia no, huecos que se pueden ordenar, base de la góndola, laterales/cabecera y pasillo. Usa SOLO estos tipos de pieza: ${cfg.pop.map((c) => c.t).join(" | ")}. Para cada oportunidad da el punto (x,y = centro, normalizado 0–1) en la imagen "img" donde se instalaría, la cantidad y medidas sugeridas. Ordena de mayor a menor impacto. Máximo 8. Nunca propongas POP para marcas de la competencia.
11. PLANOGRAMA SUGERIDO: propone una redistribución realista por nivel (sin eliminar competidores; ganando espacio de huecos y del rival principal; priorizando el nivel de ojos para la marca propia y su SKU de mayor rotación).

Responde SOLO con un objeto JSON válido (sin markdown) con esta forma exacta:
{
 "foto_apta": true,
 "problemas_foto": ["..."],
 "categoria_detectada": "texto",
 "modulos_estimados": 0,
 "ancho_estimado_m": 0,
 "niveles": 0,
 "nivel_ojos": 2,
 "marcas": [{"marca":"Nombre","fabricante":"texto o null","frentes":0,"skus":0,"niveles_presentes":[1,2],"en_nivel_ojos":true,"bloque_marca":true,"precios":[{"sku":"texto","precio":0}],"cajas":[{"img":0,"x":0,"y":0,"w":0,"h":0,"nivel":1}]}],
 "niveles_detalle": [{"nivel":1,"vacio_pct":0,"participacion":[{"marca":"Nombre","pct":0}]}],
 "quiebres": [{"nivel":1,"marca":"Nombre o null","descripcion":"texto"}],
 "material_pop": [{"tipo":"texto","marca":"Nombre","estado":"bueno|deteriorado|mal ubicado|tapado","img":0,"x":0,"y":0,"w":0,"h":0}],
 "oportunidades_pop": [{"tipo":"uno del catálogo","ubicacion":"dónde exactamente","nivel":2,"img":0,"x":0.5,"y":0.5,"prioridad":"alta|media|baja","objetivo":"visibilidad|bloque de marca|precio|impulso|recuperar espacio","por_que":"evidencia observada en la foto","impacto":"resultado esperado","cantidad":1,"medidas":"ej. 100 x 8 cm"}],
 "planograma_sugerido": [{"nivel":1,"vacio_pct":0,"participacion":[{"marca":"Nombre","pct":0}]}],
 "planograma_logica": "por qué esta redistribución",
 "hallazgos": ["observación concreta y accionable"],
 "recomendaciones": ["acción concreta para la marca propia"],
 "confianza": "alta|media|baja",
 "nota_confianza": "qué limita la precisión"
}`;
}

async function analizar(id: string) {
  const fail = (msg: string) => sb.from("sos_analisis").update({ estado: "error", error: msg.slice(0, 500) }).eq("id", id);
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return await fail("Falta configurar la clave de la API de Claude (secreto ANTHROPIC_API_KEY en Supabase).");
    const [{ data: row }, { data: cfgRow }] = await Promise.all([
      sb.from("sos_analisis").select("*").eq("id", id).single(),
      sb.from("sos_config").select("data").eq("id", 1).single(),
    ]);
    const cfg = cfgRow!.data as Cfg;
    const content: unknown[] = [];
    for (const path of row!.fotos as string[]) {
      const { data: blob, error } = await sb.storage.from("sos").download(path);
      if (error || !blob) return await fail("No se pudo leer una foto: " + (error?.message || path));
      const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      content.push({ type: "image", source: { type: "base64", media_type: type, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) } });
    }
    content.push({ type: "text", text: prompt(row!, cfg, (row!.fotos as string[]).length) });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 170_000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo || "claude-sonnet-5-5", max_tokens: 12000, messages: [{ role: "user", content }] }),
    });
    clearTimeout(timer);
    const body = await res.json();
    if (!res.ok) return await fail(`API de Claude (${res.status}): ${body?.error?.message || "error"}`);
    const text = (body.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    let ai: any;
    try { ai = JSON.parse(text.slice(a, b + 1)); } catch { return await fail("La IA no devolvió un JSON válido. Reintenta el análisis."); }
    if (!ai || !Array.isArray(ai.marcas)) return await fail("La respuesta de la IA no tiene el formato esperado.");
    await sb.from("sos_analisis").update({ estado: "listo", error: null, ai, modelo: body.model || cfg.modelo, analizado_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    await fail((e as Error)?.name === "AbortError" ? "El análisis tardó demasiado. Reintenta." : "Error inesperado: " + ((e as Error)?.message || e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Datos inválidos" }, 400); }
  const id = String(body?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Id inválido" }, 400);

  // Sin clave de API: el envío queda en cola y se analiza desde el Analizador de claude.ai
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ ok: true, estado: "pendiente", modo: "manual" }, 202);

  const admin = await isAdmin(req);
  const { data: row } = await sb.from("sos_analisis").select("id,estado,intentos,created_at").eq("id", id).maybeSingle();
  if (!row) return json({ error: "No existe el análisis" }, 404);

  let from: string[];
  if (admin) {
    from = body.force ? ["pendiente", "error", "listo"] : ["pendiente", "error"];
  } else {
    const fresh = Date.now() - new Date(row.created_at).getTime() < 15 * 60 * 1000;
    if (row.estado !== "pendiente" || row.intentos > 0 || !fresh) return json({ error: "Este envío ya fue procesado." }, 409);
    const { data: cfgRow } = await sb.from("sos_config").select("data").eq("id", 1).single();
    const max = Number(cfgRow?.data?.max_por_hora) || 30;
    const { count } = await sb.from("sos_analisis").select("id", { count: "exact", head: true })
      .gt("intentos", 0).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count || 0) >= max) {
      await sb.from("sos_analisis").update({ estado: "error", error: "Límite de análisis por hora alcanzado. El administrador puede reintentarlo." }).eq("id", id);
      return json({ error: "Límite por hora alcanzado" }, 429);
    }
    from = ["pendiente"];
  }
  // Reclamo atómico: evita dos análisis simultáneos del mismo envío
  const { data: claimed } = await sb.from("sos_analisis")
    .update({ estado: "procesando", intentos: (row.intentos || 0) + 1, error: null })
    .eq("id", id).in("estado", from).eq("intentos", row.intentos).select("id");
  if (!claimed?.length) return json({ error: "El análisis ya está en proceso." }, 409);

  EdgeRuntime.waitUntil(analizar(id));
  return json({ ok: true, estado: "procesando" }, 202);
});
