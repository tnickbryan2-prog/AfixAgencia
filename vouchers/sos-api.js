// =====================================================================
//  Share of Shelf · capa de datos (Supabase) compartida por
//  sos.html (promotoras) y sos-admin.html (administrador)
// =====================================================================
(function () {
  const CFG = window.APP_CONFIG;
  const BUCKET = "sos";
  let sb = null;
  function client() {
    if (!sb) {
      if (!window.supabase) throw new Error("No se pudo cargar Supabase. Revisa tu conexión.");
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    }
    return sb;
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo leer la imagen.")); i.src = src; }); }
  async function resize(img, max, q) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
    return { blob, w: c.width, h: c.height, canvas: c };
  }
  // Revisa luz, nitidez y orientación antes de enviar
  function quality(cv) {
    try {
      const W = 320, H = Math.round(cv.height * W / cv.width), c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"); g.drawImage(cv, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data;
      const L = new Float32Array(W * H); let sum = 0;
      for (let i = 0; i < W * H; i++) { const v = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]; L[i] = v; sum += v; }
      const mean = sum / (W * H); let s = 0, s2 = 0, n = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const lap = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - W] - L[i + W]; s += lap; s2 += lap * lap; n++; }
      const varL = s2 / n - (s / n) ** 2, out = [];
      if (mean < 55) out.push("muy oscura"); if (mean > 215) out.push("sobreexpuesta"); if (varL < 45) out.push("borrosa o movida");
      if (cv.height > cv.width * 1.25) out.push("vertical: para góndolas anchas usa horizontal");
      return out;
    } catch { return []; }
  }
  async function prepPhoto(file) {
    const u = URL.createObjectURL(file);
    try { const img = await loadImg(u); const r = await resize(img, 1600, .85); return { blob: r.blob, url: URL.createObjectURL(r.blob), w: r.w, h: r.h, q: quality(r.canvas) }; }
    finally { URL.revokeObjectURL(u); }
  }

  const SOS = {
    client, uuid, prepPhoto, quality, loadImg, resize,

    // Sube fotos, crea el registro y dispara el análisis. Devuelve el id.
    async submit(meta, photos, origen = "promotora") {
      const c = client(), id = uuid(), now = new Date();
      const base = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${id}`;
      const fotos = [];
      for (let i = 0; i < photos.length; i++) {
        const path = `${base}-${i + 1}.jpg`;
        const up = await c.storage.from(BUCKET).upload(path, photos[i].blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) throw new Error("No se pudo subir la foto " + (i + 1) + ": " + up.error.message);
        fotos.push(path);
      }
      const ins = await c.from("sos_analisis").insert({
        id, origen, fotos,
        promotora: meta.promotora || null, tienda: meta.tienda, canal: meta.canal || null, ciudad: meta.ciudad || null,
        categoria: meta.categoria || null, meta: meta.meta ?? null, ancho: meta.ancho || null, niveles: meta.niveles || null,
        ojos: meta.ojos || "auto", calidad: photos.map((p) => p.q || []), dispositivo: navigator.userAgent.slice(0, 180),
      });
      if (ins.error) throw new Error("No se pudo guardar el envío: " + ins.error.message);
      // Copia liviana en base64 para el Analizador de claude.ai (lee por SQL)
      for (let i = 0; i < photos.length; i++) {
        const img = await loadImg(photos[i].url); const r = await resize(img, 1280, .8);
        const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(r.blob); });
        const f = await c.from("sos_fotos").insert({ analisis_id: id, idx: i + 1, mime: "image/jpeg", b64 });
        if (f.error) throw new Error("No se pudo guardar la foto " + (i + 1) + ": " + f.error.message);
      }
      SOS.lastModo = null;
      try { const r = await SOS.analyze(id); SOS.lastModo = r?.modo || "auto"; } catch {}
      return id;
    },
    async analyze(id, force = false) {
      const { data, error } = await client().functions.invoke("sos-analizar", { body: { id, force } });
      if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch {} throw new Error(msg); }
      return data;
    },

    // ----- Admin -----
    async isAdmin() {
      const c = client(); const { data: s } = await c.auth.getSession(); if (!s.session) return false;
      const { data } = await c.from("sos_config").select("id").eq("id", 1).maybeSingle(); return !!data;
    },
    async session() { const { data } = await client().auth.getSession(); return data.session; },
    async signIn(email, password) { const { error } = await client().auth.signInWithPassword({ email, password }); if (error) throw new Error("Correo o contraseña incorrectos."); },
    async getConfig() { const { data, error } = await client().from("sos_config").select("data").eq("id", 1).single(); if (error) throw new Error(error.message); return data.data; },
    async saveConfig(d) { const { error } = await client().from("sos_config").update({ data: d, updated_at: new Date().toISOString() }).eq("id", 1); if (error) throw new Error(error.message); },
    async list() {
      const c = client(), all = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await c.from("sos_analisis").select("*").order("created_at", { ascending: false }).range(from, from + 499);
        if (error) throw new Error(error.message); all.push(...data); if (data.length < 500) break;
      }
      return all;
    },
    async get(id) { const { data, error } = await client().from("sos_analisis").select("*").eq("id", id).single(); if (error) throw new Error(error.message); return data; },
    async saveAjustes(id, ajustes) { const { error } = await client().from("sos_analisis").update({ ajustes }).eq("id", id); if (error) throw new Error(error.message); },
    async remove(row) {
      const c = client(); const { error } = await c.from("sos_analisis").delete().eq("id", row.id); if (error) throw new Error(error.message);
      if (row.fotos?.length) await c.storage.from(BUCKET).remove(row.fotos);
    },
    async photoUrls(paths) {
      const out = {}; if (!paths.length) return out;
      const { data, error } = await client().storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
      if (error) throw new Error(error.message); data.forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; }); return out;
    },
  };
  window.SOS = SOS;
})();
