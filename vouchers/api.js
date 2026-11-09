// =====================================================================
//  Capa de datos: Supabase (producción) o localStorage (modo demo)
// =====================================================================
(function () {
  const CFG = window.APP_CONFIG;
  const BUCKET = "vouchers";
  const DEMO_KEY = "vouchers_demo_v1";
  let sb = null;

  function client() {
    if (CFG.DEMO) return null;
    if (!sb) {
      if (!window.supabase) throw new Error("No se pudo cargar Supabase. Revisa tu conexión.");
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return sb;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Reduce la foto antes de subirla (más rápido con datos móviles)
  async function compressImage(file, maxSide = 1600, quality = 0.8) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("No se pudo leer la imagen."));
        i.src = url;
      });
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      return await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function blobToDataURL(blob) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  }

  // ---------- Demo ----------
  const demo = {
    read() {
      try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; }
    },
    write(rows) {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)); }
      catch { throw new Error("El almacenamiento demo está lleno. Borra registros de prueba."); }
    },
  };

  // ---------- API pública ----------
  const API = {
    isDemo: !!CFG.DEMO,
    compressImage,

    async submitVoucher(data, file) {
      const blob = await compressImage(file);
      if (CFG.DEMO) {
        const small = await compressImage(file, 700, 0.6);
        const rows = demo.read();
        rows.unshift({
          id: uuid(),
          created_at: new Date().toISOString(),
          ...data,
          foto_path: await blobToDataURL(small),
        });
        demo.write(rows);
        await new Promise((r) => setTimeout(r, 600));
        return;
      }
      const c = client();
      const now = new Date();
      const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${uuid()}.jpg`;
      const up = await c.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (up.error) throw new Error("No se pudo subir la foto: " + up.error.message);
      const ins = await c.from("vouchers").insert({
        ...data,
        foto_path: path,
        dispositivo: navigator.userAgent.slice(0, 180),
      });
      if (ins.error) throw new Error("No se pudo guardar el registro: " + ins.error.message);
    },

    // Registra cada giro de la ruleta (auditoría). Devuelve el id del giro.
    async logSpin(giro) {
      const id = uuid();
      const row = { id, ...giro, dispositivo: navigator.userAgent.slice(0, 180) };
      if (CFG.DEMO) {
        try {
          const g = JSON.parse(localStorage.getItem("giros_demo") || "[]");
          g.unshift({ ...row, created_at: new Date().toISOString() });
          localStorage.setItem("giros_demo", JSON.stringify(g.slice(0, 2000)));
        } catch {}
        return id;
      }
      try {
        const { error } = await client().from("ruleta_giros").insert(row);
        if (error) console.warn("No se pudo registrar el giro:", error.message);
      } catch (e) { console.warn(e); }
      return id;
    },

    async listSpins() {
      if (CFG.DEMO) { try { return JSON.parse(localStorage.getItem("giros_demo") || "[]"); } catch { return []; } }
      const { data, error } = await client().from("ruleta_giros").select("*").order("created_at", { ascending: false }).limit(10000);
      if (error) throw new Error(error.message);
      return data;
    },

    // ---------- Precios de competencia ----------
    async submitPrecios(rows) {
      const visita = uuid();
      const items = rows.map((r) => ({ ...r, visita_id: visita }));
      if (CFG.DEMO) {
        const cur = (() => { try { return JSON.parse(localStorage.getItem("precios_demo") || "[]"); } catch { return []; } })();
        const now = new Date().toISOString();
        items.forEach((it) => cur.unshift({ id: uuid(), created_at: now, fecha: it.fecha || now.slice(0, 10), ...it }));
        localStorage.setItem("precios_demo", JSON.stringify(cur.slice(0, 5000)));
        await new Promise((r) => setTimeout(r, 400));
        return;
      }
      const { error } = await client().from("precios_competencia").insert(items);
      if (error) throw new Error("No se pudo guardar: " + error.message);
    },

    async listPrecios() {
      if (CFG.DEMO) { try { return JSON.parse(localStorage.getItem("precios_demo") || "[]"); } catch { return []; } }
      const c = client(), all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await c.from("precios_competencia").select("*").order("fecha", { ascending: false }).range(from, from + 999);
        if (error) throw new Error(error.message);
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    },

    async deleteVisita(visitaId) {
      if (CFG.DEMO) {
        const cur = (await API.listPrecios()).filter((r) => r.visita_id !== visitaId);
        localStorage.setItem("precios_demo", JSON.stringify(cur));
        return;
      }
      const { error } = await client().from("precios_competencia").delete().eq("visita_id", visitaId);
      if (error) throw new Error(error.message);
    },

    async getSession() {
      if (CFG.DEMO) return sessionStorage.getItem("demo_admin") ? { user: { email: "demo@admin" } } : null;
      const { data } = await client().auth.getSession();
      return data.session;
    },

    async signIn(email, password) {
      if (CFG.DEMO) { sessionStorage.setItem("demo_admin", "1"); return; }
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw new Error("Correo o contraseña incorrectos.");
    },

    async signOut() {
      if (CFG.DEMO) { sessionStorage.removeItem("demo_admin"); return; }
      await client().auth.signOut();
    },

    async listVouchers() {
      if (CFG.DEMO) return demo.read();
      const c = client();
      const all = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await c
          .from("vouchers")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + page - 1);
        if (error) throw new Error(error.message);
        all.push(...data);
        if (data.length < page) break;
      }
      return all;
    },

    // Devuelve { path: urlFirmada } para mostrar fotos privadas
    async photoUrls(paths) {
      const out = {};
      if (!paths.length) return out;
      if (CFG.DEMO) { paths.forEach((p) => (out[p] = p)); return out; }
      const c = client();
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { data, error } = await c.storage.from(BUCKET).createSignedUrls(chunk, 60 * 60);
        if (error) throw new Error(error.message);
        data.forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
      }
      return out;
    },

    // Configuración del panel (meta mensual por promotora y días de activación)
    async getPanelConfig() {
      const def = { meta_promotora_mes: 0, dias_activacion: [1, 2, 3, 4, 5, 6, 0] };
      if (CFG.DEMO) {
        try { return { ...def, ...JSON.parse(localStorage.getItem("panel_cfg_demo") || "{}") }; } catch { return def; }
      }
      const { data, error } = await client().from("panel_config").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return def;
      return data;
    },

    async savePanelConfig(cfg) {
      const row = { meta_promotora_mes: cfg.meta_promotora_mes, dias_activacion: cfg.dias_activacion, updated_at: new Date().toISOString() };
      if (CFG.DEMO) { localStorage.setItem("panel_cfg_demo", JSON.stringify(row)); return; }
      const { error } = await client().from("panel_config").update(row).eq("id", 1);
      if (error) throw new Error(error.message);
    },

    // ---------- Stock de premios entregado a promotoras ----------
    async listStock() {
      if (CFG.DEMO) { try { return JSON.parse(localStorage.getItem("stock_demo") || "[]"); } catch { return []; } }
      const { data, error } = await client().from("stock_movimientos").select("*")
        .order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);
      return data;
    },

    async addStock(items) {
      if (CFG.DEMO) {
        const cur = await API.listStock();
        const now = new Date().toISOString();
        items.forEach((it) => cur.unshift({ id: uuid(), created_at: now, registrado_por: "demo", ...it }));
        localStorage.setItem("stock_demo", JSON.stringify(cur));
        return;
      }
      const { error } = await client().from("stock_movimientos").insert(items);
      if (error) throw new Error(error.message);
    },

    async deleteStock(id) {
      if (CFG.DEMO) {
        const cur = (await API.listStock()).filter((r) => r.id !== id);
        localStorage.setItem("stock_demo", JSON.stringify(cur));
        return;
      }
      const { error } = await client().from("stock_movimientos").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    async deleteVoucher(row) {
      if (CFG.DEMO) { demo.write(demo.read().filter((r) => r.id !== row.id)); return; }
      const c = client();
      const { error } = await c.from("vouchers").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      await c.storage.from(BUCKET).remove([row.foto_path]);
    },
  };

  window.API = API;
})();
