// =====================================================================
//  Ventas Sodimac por SKU y tienda (Excel mensual, carga manual)
//   · VentasUpload  → botón y historial de cargas en la pestaña Precios
//   · TiendasAdmin  → pestaña "Análisis tiendas" del admin (Afix vs. Oatey)
// =====================================================================
(function () {
  const CFG = window.APP_CONFIG;
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const MES_L = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const MES_RE = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11 };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nrm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const fmt = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("es-PE"));
  const pct = (n, sign = true) => (n == null || !isFinite(n) ? "—" : (sign && n > 0 ? "+" : "") + Math.round(n * 100) + "%");
  const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
  const shortSku = (d) => String(d || "").replace(/\.$/, "").replace(/^Pegamento\s+/i, "").replace(/\s+(Reg|Med)\.?$/i, "").trim();
  const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const fdc = (k) => (k ? (() => { const d = new Date(String(k).slice(0, 10) + "T12:00:00"); return `${d.getDate()} ${MES[d.getMonth()].toLowerCase()} ${d.getFullYear()}`; })() : "sin fecha");
  const fdt = (iso) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  // ---------- Carga perezosa de SheetJS ----------
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxP) xlsxP = new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; ko(new Error("No se pudo cargar el lector de Excel (revisa tu conexión).")); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }

  // ---------- Lectura del Excel crudo ----------
  // Formato esperado (hoja tipo "DATA VS PROM"): una fila por tienda × SKU, columnas de meses
  // abreviados (Ene, Feb, … Sept) antes de "Total general"/"Promedio" = venta mensual;
  // meses con nombre completo después de "Promedio" (Octubre, Noviembre) = avance del mes en curso.
  function monthOf(h) {
    const m = nrm(h).replace(/\.$/, "").match(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*$/);
    return m ? MES_RE[m[1]] : null;
  }

  function parseSheet(aoa, hoja) {
    let hr = -1;
    for (let i = 0; i < Math.min(15, aoa.length); i++) {
      const r = (aoa[i] || []).map(nrm);
      if (r.includes("tienda") && r.includes("sku")) { hr = i; break; }
    }
    if (hr < 0) return null;
    const H = aoa[hr].map((h) => String(h ?? "").trim());
    const N = H.map(nrm);
    const col = (f) => N.findIndex(f);
    const cT = col((h) => h === "tienda"), cS = col((h) => h === "sku");
    const cCT = col((h) => h.includes("cod") && h.includes("tienda"));
    const cD = col((h) => h.startsWith("descrip"));
    const cA = col((h) => h === "afix");
    const cAct = col((h) => h === "activo");
    const cTot = col((h) => h.startsWith("total")), cProm = col((h) => h.startsWith("promedio"));
    const limit = Math.max(cTot, cProm);

    const hist = [], av = [];
    H.forEach((h, i) => {
      const m = monthOf(h); if (m == null) return;
      const isAv = limit >= 0 ? i > limit : nrm(h).length > 5;
      if (isAv) { if (!av.some((x) => x.i === m)) av.push({ i: m, lbl: MES_L[m], col: i }); }
      else if (!hist.some((x) => x.i === m)) hist.push({ i: m, lbl: MES[m], col: i, head: h });
    });
    if (!hist.length) throw new Error(`En la hoja "${hoja}" no encontré columnas de meses (Ene, Feb, …).`);
    hist.sort((a, b) => a.i - b.i); av.sort((a, b) => a.i - b.i);

    const num = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
    const filas = [];
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const tRaw = String(row[cT] ?? "").trim(), sku = String(row[cS] ?? "").trim();
      if (!tRaw || !sku) continue;
      if (cAct >= 0 && nrm(row[cAct]) === "no") continue;
      const mt = tRaw.match(/^(\d+)\s*-\s*(.+)$/);
      filas.push({
        ct: cCT >= 0 && row[cCT] != null && row[cCT] !== "" ? String(row[cCT]) : mt ? mt[1] : "",
        t: (mt ? mt[2] : tRaw).trim(),
        sku,
        cod: cA >= 0 && row[cA] != null ? String(row[cA]) : "",
        d: cD >= 0 ? String(row[cD] ?? "").trim() : sku,
        m: hist.map((h) => num(row[h.col])),
        a: av.map((h) => num(row[h.col])),
      });
    }
    if (!filas.length) throw new Error(`La hoja "${hoja}" no tiene filas de tienda y SKU.`);

    // Mes incompleto: el último mes si vende < 60% de la mediana de los demás
    const tot = hist.map((_, k) => sum(filas.map((f) => f.m[k])));
    const meses = hist.map((h, k) => ({ i: h.i, lbl: h.lbl, head: h.head, parcial: false }));
    if (meses.length > 2) { const last = tot.length - 1; if (tot[last] < 0.6 * median(tot.slice(0, last))) meses[last].parcial = true; }
    const ordenRaro = hist.some((h, k) => k > 0 && h.col < hist[k - 1].col);
    return { meses, avance: av.map(({ i, lbl }) => ({ i, lbl })), filas, hoja, ordenRaro };
  }

  async function parseFile(file) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: "array" });
    const errs = [];
    for (const name of wb.SheetNames) {
      try {
        const aoa = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
        const p = parseSheet(aoa, name);
        if (p) return p;
      } catch (e) { errs.push(e.message); }
    }
    throw new Error(errs[0] || "No encontré una hoja con columnas 'Tienda' y 'SKU'.");
  }

  // ---------- Datos compartidos ----------
  let cargas = [], loaded = false, loading = false, err = "";
  const listeners = new Set();
  async function reload() {
    loading = true; err = ""; listeners.forEach((f) => f());
    try { cargas = (await API.listVentasCargas()).sort((a, b) => String(b.corte || "").localeCompare(String(a.corte || "")) || String(b.created_at).localeCompare(String(a.created_at))); loaded = true; } catch (e) { err = "No se pudieron leer las ventas: " + e.message; }
    loading = false; listeners.forEach((f) => f());
  }
  const ensure = () => (!loaded && !loading ? reload() : Promise.resolve());

  // Tiendas del Excel que tienen activación (están en config.TIENDAS)
  const cfgTiendas = (CFG.TIENDAS || []).map((t) => nrm(typeof t === "string" ? t : t.tienda));
  function enActivacion(nombre) {
    const k = nrm(nombre).replace(/^(sodimac|maestro|homecenter)\s+/, "");
    if (!k) return false;
    const re = new RegExp(`(^|[\\s(])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s)])`);
    return cfgTiendas.some((c) => re.test(c));
  }

  // =====================================================================
  //  Botón de carga (pestaña Precios)
  // =====================================================================
  let upEl = null, preview = null, upMsg = "", saving = false;

  function renderUpload() {
    if (!upEl) return;
    const last = cargas[0];
    let body = "";
    if (preview) {
      const p = preview.p;
      const tiendas = new Set(p.filas.map((f) => f.t)).size, skus = new Set(p.filas.map((f) => f.sku)).size;
      const tot = p.meses.map((_, k) => sum(p.filas.map((f) => f.m[k])));
      body = `
        <div class="alert-item info" style="margin-bottom:12px"><b>Vista previa · ${esc(preview.file)}</b><span>Hoja "${esc(p.hoja)}": ${p.filas.length} filas · ${tiendas} tiendas · ${skus} SKUs. Revisa los meses y guarda.</span></div>
        ${p.ordenRaro ? `<div class="alert-item warn" style="margin-bottom:12px"><b>Ojo:</b><span>Las columnas de meses no venían en orden en el Excel; las ordené por calendario.</span></div>` : ""}
        <div class="ind-toolbar" style="margin-bottom:12px">
          <div class="field"><label for="vAnio">Año de los datos</label><input id="vAnio" type="number" min="2020" max="2100" value="${preview.anio}" /></div>
          <div class="field"><label for="vCorte">Fecha de corte del avance Afix</label><input id="vCorte" type="date" value="${preview.corte}" /></div>
          <p class="small muted" style="margin:0;max-width:340px">La fecha de corte permite proyectar el cierre del mes y comparar con la carga de la semana anterior.</p>
        </div>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Marca · mes</th><th>Columna en Excel</th><th class="num">Unidades</th><th>¿Mes incompleto?</th></tr></thead><tbody>
          ${p.meses.map((m, k) => `<tr><td><strong>Oatey ${m.lbl}</strong></td><td class="muted">${esc(m.head)}</td><td class="num">${fmt(tot[k])}</td><td><label style="display:inline-flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" data-parc="${k}"${m.parcial ? " checked" : ""}/> parcial (corte a mitad de mes)</label></td></tr>`).join("")}
          ${p.avance.map((a, k) => `<tr><td><strong>Afix ${a.lbl}</strong></td><td class="muted">${esc(a.lbl)}</td><td class="num">${fmt(sum(p.filas.map((f) => f.a[k])))}</td><td class="muted">Avance a la fecha</td></tr>`).join("")}
        </tbody></table></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="vCancel">Cancelar</button>
          <button class="btn btn-primary" id="vSave"${saving ? " disabled" : ""}>${saving ? "Guardando…" : "Guardar y ver análisis"}</button>
        </div>`;
    } else {
      body = `
        <p class="small muted" style="margin:0 0 12px">Sube cada semana el Excel crudo de venta Sodimac (una fila por tienda × SKU): meses Ene, Feb, … = venta Oatey; columnas de avance (Octubre, Noviembre…) = venta Afix. Se guarda en el historial y el análisis de arriba se actualiza con la nueva carga.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-primary" id="vPick">📥 Cargar Excel de ventas por SKU</button>
          <input type="file" id="vFile" accept=".xlsx,.xls,.xlsm,.csv" class="hidden" />
          ${last ? `<span class="small muted">Última carga: <b>${esc(last.archivo)}</b> · corte ${fdc(last.corte)} · ${fdt(last.created_at)}</span>` : ""}
        </div>
        ${upMsg ? `<div class="alert-item ${upMsg.startsWith("✓") ? "info" : "bad"}" style="margin-top:12px"><span>${esc(upMsg)}</span></div>` : ""}
        ${cargas.length ? `<div class="table-wrap" style="margin-top:14px"><table class="ind-table"><thead><tr><th>Fecha de carga</th><th>Corte avance Afix</th><th>Archivo</th><th>Periodo</th><th class="num">Filas</th><th>Por</th><th></th></tr></thead><tbody>
          ${cargas.map((c) => `<tr><td class="nowrap">${fdt(c.created_at)}</td><td><input type="date" data-corte="${esc(c.id)}" value="${esc(c.corte || "")}" style="height:34px;border:1px solid var(--line);border-radius:8px;padding:0 8px"${c.corte ? "" : ' title="Falta la fecha de corte"'} /></td><td>${esc(c.archivo)}</td><td>${esc(c.periodo || "")}</td><td class="num">${c.filas}</td><td class="small muted">${esc(c.creado_por || "")}</td>
            <td><button class="icon-btn" data-cdel="${esc(c.id)}" title="Eliminar esta carga"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button></td></tr>`).join("")}
        </tbody></table></div>` : ""}`;
    }
    upEl.innerHTML = `<div class="card panel" id="ventasCard"><div class="panel-head"><h3>Ventas Sodimac por SKU y tienda</h3><span class="muted">Carga manual semanal · solo admins</span></div>${loading && !loaded ? '<div class="empty">Cargando…</div>' : err ? `<div class="empty">${esc(err)}</div>` : body}</div>`;

    const $ = (id) => upEl.querySelector("#" + id);
    if (preview) {
      $("vCancel").onclick = () => { preview = null; renderUpload(); };
      $("vAnio").onchange = (e) => { preview.anio = parseInt(e.target.value, 10) || preview.anio; };
      $("vCorte").onchange = (e) => { preview.corte = e.target.value || preview.corte; };
      upEl.querySelectorAll("[data-parc]").forEach((c) => (c.onchange = () => { preview.p.meses[+c.dataset.parc].parcial = c.checked; }));
      $("vSave").onclick = save;
    } else if ($("vPick")) {
      $("vPick").onclick = () => $("vFile").click();
      $("vFile").onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        upMsg = "Leyendo " + f.name + "…"; renderUpload();
        try {
          const p = await parseFile(f);
          const now = new Date(), y = now.getFullYear(), maxM = Math.max(...p.meses.map((m) => m.i));
          upMsg = ""; preview = { p, file: f.name, anio: maxM > now.getMonth() + 1 ? y - 1 : y, corte: todayLima() };
          setTimeout(() => document.getElementById("ventasCard")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        } catch (ex) { upMsg = "No se pudo leer el archivo: " + ex.message; }
        renderUpload();
      };
      upEl.querySelectorAll("[data-corte]").forEach((i) => (i.onchange = async () => {
        try { await API.updateVentasCarga(i.dataset.corte, { corte: i.value || null }); await reload(); } catch (ex) { alert("No se pudo guardar la fecha: " + ex.message); }
      }));
      upEl.querySelectorAll("[data-cdel]").forEach((b) => (b.onclick = async () => {
        const c = cargas.find((x) => x.id === b.dataset.cdel);
        if (!c || !confirm(`¿Eliminar la carga "${c.archivo}" (${c.periodo || ""})? El análisis usará la carga anterior.`)) return;
        try { await API.deleteVentasCarga(c.id); await reload(); } catch (ex) { alert("No se pudo eliminar: " + ex.message); }
      }));
    }
  }

  async function save() {
    const { p, file, anio, corte } = preview;
    const first = p.meses[0], last = p.meses[p.meses.length - 1];
    const periodo = `${first.lbl}–${last.lbl}${last.parcial ? " (parcial)" : ""} ${anio}`;
    const datos = { v: 1, anio, corte, hoja: p.hoja, marcas: { base: "Oatey", propia: "Afix" }, meses: p.meses.map(({ i, lbl, parcial }) => ({ i, lbl, parcial })), avance: p.avance, filas: p.filas };
    saving = true; renderUpload();
    try {
      await API.addVentasCarga({ archivo: file, anio, periodo, corte, filas: p.filas.length, datos });
      preview = null; upMsg = `✓ Carga guardada (${periodo}).`;
      await reload();
      st.carga = null; render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { alert("No se pudo guardar: " + e.message); }
    saving = false; renderUpload();
  }

  window.VentasUpload = {
    mount(c) { upEl = c; listeners.add(renderUpload); },
    async show() { renderUpload(); await ensure(); },
  };

  // =====================================================================
  //  Pestaña "Análisis tiendas"
  // =====================================================================
  let el = null;
  const st = { carga: null, alcance: "", tienda: "" };
  const META = (CFG.VENTAS && CFG.VENTAS.META_PARTICIPACION) || 0.2;
  // En el Excel "DATA VS PROM": meses Ene–Oct = venta OATEY por SKU Sodimac;
  // columnas de avance (Octubre, Noviembre, desde la hoja AVANCE AFIX) = venta AFIX del producto equivalente.
  const marcas = (D) => ({ base: (D.marcas && D.marcas.base) || "Oatey", propia: (D.marcas && D.marcas.propia) || "Afix" });
  const money = (n) => (n == null || !isFinite(n) ? "—" : "S/ " + Math.round(n).toLocaleString("es-PE"));
  const pp = (n) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + (n * 100).toFixed(1).replace(".", ",") + " pp");
  const pct1 = (n) => (n == null || !isFinite(n) ? "—" : (n * 100).toFixed(1).replace(".", ",") + "%");
  const shortT = (t) => String(t).replace(/^Sodimac\s+/i, "").replace(/^Maestro\s+(.+)$/i, "$1 (M)");

  // ---------- Precios (pestaña Precios) para valorizar en soles ----------
  let precios = null, preciosLoading = false;
  const skuKey = (s) => {
    const n = nrm(s), oz = (n.match(/(\d+)\s*oz/) || [])[1];
    const c = /cpvc|naranja/.test(n) ? "naranja" : /\baz(ul)?\b/.test(n) ? "azul" : /\bdor(ado)?\b/.test(n) ? "dorado" : /\bneg(ro)?\b/.test(n) ? "negro" : "";
    return oz && c ? `${oz}|${c}` : null;
  };
  function priceMap(rows) {
    const lim = new Date(); lim.setDate(lim.getDate() - 60); const L = lim.toISOString().slice(0, 10);
    const g = {};
    rows.filter((r) => r.disponible !== false && String(r.fecha).slice(0, 10) >= L).forEach((r) => {
      const v = r.precio_promo != null ? Number(r.precio_promo) : r.precio_regular != null ? Number(r.precio_regular) : null;
      const k = skuKey(r.sku), m = nrm(r.marca);
      if (v == null || !isFinite(v) || v <= 0 || !k) return;
      (g[m + "#" + k] = g[m + "#" + k] || []).push(v);
    });
    const out = {}; Object.entries(g).forEach(([k, xs]) => (out[k] = median(xs)));
    return out;
  }
  async function loadPrecios() {
    if (precios || preciosLoading) return; preciosLoading = true;
    try { precios = priceMap(await API.listPrecios()); } catch { precios = {}; }
    preciosLoading = false; render();
  }

  // ---------- Cálculo ----------
  function factorProy(corte, anio, mesI) {
    if (!corte) return null;
    const d = new Date(String(corte).slice(0, 10) + "T12:00:00");
    if (d.getFullYear() === anio && d.getMonth() === mesI) return new Date(anio, mesI + 1, 0).getDate() / d.getDate();
    if (d > new Date(anio, mesI + 1, 0)) return 1;
    return null;
  }

  function analyze(C) {
    const D = C.datos, MK = marcas(D), meses = D.meses, afx = D.avance || [];
    const full = meses.map((m, k) => (m.parcial ? null : k)).filter((k) => k != null);
    const lastFull = full[full.length - 1];
    const nA = afx.length, LA = nA - 1, PA = nA - 2;
    const corte = C.corte || D.corte || null;
    const fac = nA ? factorProy(corte, D.anio, afx[LA].i) : null;
    const P = precios || {};
    const pr = (marca, desc) => { const k = skuKey(desc); return k ? P[nrm(marca) + "#" + k] ?? null : null; };

    let F = D.filas.map((f) => ({ ...f, act: enActivacion(f.t), pA: pr(MK.propia, f.d), pO: pr(MK.base, f.d) }));
    const tiendasAll = [...new Set(F.map((f) => f.t))];
    if (st.alcance === "act") F = F.filter((f) => f.act);
    if (st.alcance === "ctrl") F = F.filter((f) => !f.act);
    if (st.tienda) F = F.filter((f) => f.t === st.tienda);

    const avgFull = (m) => (full.length ? sum(full.map((k) => m[k])) / full.length : 0);
    const trend = (m) => { const a = full.slice(-3), b = full.slice(-6, -3); if (!a.length || !b.length) return null; const x = sum(a.map((k) => m[k])) / a.length, y = sum(b.map((k) => m[k])) / b.length; return y ? x / y - 1 : null; };
    const shareOf = (a, o) => (a != null && a + o > 0 ? a / (a + o) : null);
    const rowStats = (f) => {
      const oProm = avgFull(f.m), aLast = nA ? f.a[LA] : 0, aProj = fac ? aLast * fac : aLast, target = (META / (1 - META)) * oProm;
      return { oProm, aLast, aProj, target, gapU: target - aProj, gapS: f.pA != null ? (target - aProj) * f.pA : null, oS: f.pO != null ? oProm * f.pO : null, aS: f.pA != null ? aProj * f.pA : null };
    };
    F.forEach((f) => Object.assign(f, rowStats(f)));
    const agg = (xs) => {
      const m = meses.map((_, k) => sum(xs.map((f) => f.m[k]))), a = afx.map((_, i) => sum(xs.map((f) => f.a[i])));
      const oProm = avgFull(m), aLast = nA ? a[LA] : null, aPrev = nA > 1 ? a[PA] : null, aProj = aLast != null ? (fac ? aLast * fac : aLast) : null;
      const sumN = (k) => { const v = xs.map((f) => f[k]).filter((x) => x != null); return v.length ? sum(v) : null; };
      return { m, a, oProm, oTrend: trend(m), oLast: lastFull != null ? m[lastFull] : null, aLast, aPrev, aProj, aGrow: aPrev ? aLast / aPrev - 1 : null,
        share: shareOf(aProj, oProm), sharePrev: aPrev != null ? shareOf(aPrev, oProm) : null, gapU: sum(xs.map((f) => f.gapU)),
        gapS: sumN("gapS"), oS: sumN("oS"), aS: sumN("aS"), conPrecio: xs.filter((f) => f.pA != null).length / Math.max(1, xs.length) };
    };
    const group = (keyF, labelF) => {
      const g = {}; F.forEach((f) => (g[keyF(f)] = g[keyF(f)] || []).push(f));
      return Object.entries(g).map(([k, xs]) => ({ k, lbl: labelF(xs[0]), act: xs[0].act, cod: xs[0].cod, pA: xs[0].pA, pO: xs[0].pO, filas: xs, ...agg(xs) }));
    };
    const tot = agg(F);
    const tiendas = group((f) => f.t, (f) => (f.ct ? f.ct + " - " : "") + f.t).sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
    const skus = group((f) => f.sku, (f) => f.d).sort((a, b) => b.oProm - a.oProm);

    const all = D.filas.map((f) => { const x = { ...f, act: enActivacion(f.t), pA: pr(MK.propia, f.d), pO: pr(MK.base, f.d) }; return Object.assign(x, rowStats(x)); });
    const actVs = { act: { n: new Set(all.filter((f) => f.act).map((f) => f.t)).size, ...agg(all.filter((f) => f.act)) }, ctrl: { n: new Set(all.filter((f) => !f.act).map((f) => f.t)).size, ...agg(all.filter((f) => !f.act)) } };

    // Semana anterior: carga previa (corte más antiguo) del mismo mes de avance
    let prev = null;
    if (corte && nA) {
      const older = cargas.filter((c) => c.id !== C.id && (c.corte || c.datos.corte) && (c.corte || c.datos.corte) < corte);
      const pc = older[0];
      if (pc) {
        const PD = pc.datos, pafx = PD.avance || [], pLA = pafx.length - 1;
        if (pLA >= 0) {
          const xs = PD.filas.filter((f) => (!st.alcance || (st.alcance === "act") === enActivacion(f.t)) && (!st.tienda || f.t === st.tienda));
          const pFull = PD.meses.map((m, k) => (m.parcial ? null : k)).filter((k) => k != null);
          const pO = pFull.length ? sum(xs.flatMap((f) => pFull.map((k) => f.m[k]))) / pFull.length : 0;
          const pa = sum(xs.map((f) => f.a[pLA])), pfac = factorProy(pc.corte || PD.corte, PD.anio, pafx[pLA].i);
          prev = { corte: pc.corte || PD.corte, mismoMes: pafx[pLA].i === afx[LA].i, aLast: pa, share: shareOf(pfac ? pa * pfac : pa, pO) };
        }
      }
    }

    // Evolución de la participación: cierres de meses previos + proyección de cada carga del mes en curso
    const evol = [];
    afx.slice(0, -1).forEach((a, i) => evol.push({ lbl: a.lbl.slice(0, 3), v: shareOf(tot.a[i], tot.oProm), tipo: "mes" }));
    if (nA) {
      const mismas = cargas.filter((c) => (c.corte || c.datos.corte) && (c.datos.avance || []).length && c.datos.avance[c.datos.avance.length - 1].i === afx[LA].i && (c.corte || c.datos.corte) <= (corte || "9999"))
        .sort((a, b) => String(a.corte || a.datos.corte).localeCompare(String(b.corte || b.datos.corte)));
      mismas.forEach((c) => {
        const PD = c.datos, pLA = PD.avance.length - 1;
        const xs = PD.filas.filter((f) => (!st.alcance || (st.alcance === "act") === enActivacion(f.t)) && (!st.tienda || f.t === st.tienda));
        const pFull = PD.meses.map((m, k) => (m.parcial ? null : k)).filter((k) => k != null);
        const pO = pFull.length ? sum(xs.flatMap((f) => pFull.map((k) => f.m[k]))) / pFull.length : 0;
        const pfac = factorProy(c.corte || PD.corte, PD.anio, PD.avance[pLA].i), pa = sum(xs.map((f) => f.a[pLA]));
        evol.push({ lbl: fdc(c.corte || PD.corte).replace(/ \d{4}$/, ""), v: shareOf(pfac ? pa * pfac : pa, pO), tipo: "semana" });
      });
      if (!mismas.length) evol.push({ lbl: afx[LA].lbl.slice(0, 3) + (fac ? " (proy.)" : " (a la fecha)"), v: tot.share, tipo: "semana" });
    }

    const sinAfix = nA ? F.filter((f) => !f.aLast && f.oProm >= 3).sort((a, b) => b.oProm - a.oProm) : [];
    const xMed = median(tiendas.map((t) => t.oProm));
    tiendas.forEach((t) => (t.cuad = t.oProm >= xMed ? (t.share >= META ? "Defender" : "Atacar") : t.share >= META ? "Mantener" : "Desarrollar"));
    return { MK, meses, afx, full, lastFull, LA, PA, nA, corte, fac, tot, tiendas, skus, actVs, prev, evol, sinAfix, tiendasAll, avgFull, xMed };
  }

  function acciones(A) {
    const X = A.MK.propia, O = A.MK.base, out = [];
    const atacar = A.tiendas.filter((t) => t.cuad === "Atacar").sort((a, b) => b.gapU - a.gapU).slice(0, 3);
    if (atacar.length) out.push({ t: `Atacar ${atacar.map((t) => shortT(t.k)).join(", ")}`, d: `Tiendas grandes con ${X} bajo la meta: ${O} vende ${fmt(sum(atacar.map((t) => t.oProm)))} u./mes y ${X} proyecta ${fmt(sum(atacar.map((t) => t.aProj)))}. Priorizar turnos de promotora y exhibición adicional.`, r: "Trade Marketing + Agencia Fuego" });
    const sk = A.skus.slice().sort((a, b) => (b.gapS ?? b.gapU) - (a.gapS ?? a.gapU))[0];
    if (sk && sk.gapU > 0) out.push({ t: `Empujar ${shortSku(sk.lbl)}`, d: `Es la mayor brecha a la meta: ${fmt(sk.gapU)} u./mes${sk.gapS != null ? ` (${money(sk.gapS)})` : ""}.${sk.pA != null && sk.pO != null ? ` ${X} a S/ ${sk.pA.toFixed(2)} vs. ${O} a S/ ${sk.pO.toFixed(2)}: ${sk.pA < sk.pO ? `usar el ${Math.round((1 - sk.pA / sk.pO) * 100)}% de ahorro como argumento de venta` : "revisar precio"}.` : ""}`, r: "Marketing" });
    if (A.sinAfix.length) out.push({ t: `Revisar stock en ${A.sinAfix.length} puntos sin venta ${X}`, d: `Combinaciones tienda × producto donde ${O} vende y ${X} no registró venta. Empezar por ${shortSku(A.sinAfix[0].d)} en ${shortT(A.sinAfix[0].t)} (${O} ${fmt(A.sinAfix[0].oProm)} u./mes).`, r: "Comercial / KAM Sodimac" });
    const { act, ctrl } = A.actVs;
    if (act.share != null && ctrl.share != null && ctrl.n && act.share > ctrl.share * 1.3 && !st.tienda) out.push({ t: "Evaluar activación en provincias", d: `Con activación ${X} llega a ${pct1(act.share)} de participación vs. ${pct1(ctrl.share)} sin activación (hipótesis: efecto promotoras).`, r: "Gerencia de Marketing" });
    return out.slice(0, 4);
  }

  // ---------- Gráficos ----------
  const semCls = (share) => (share == null ? "neu" : share >= META ? "ok" : share >= META * 0.6 ? "warn" : "bad");

  function scatter(A) {
    const W = 600, H = 360, P = { l: 48, r: 16, t: 16, b: 40 }, T = A.tiendas.filter((t) => t.share != null);
    const xMax = Math.max(1, ...T.map((t) => t.oProm)) * 1.08, yMax = Math.max(META * 1.6, ...T.map((t) => t.share)) * 1.1;
    const x = (v) => P.l + (v / xMax) * (W - P.l - P.r), y = (v) => H - P.b - (v / yMax) * (H - P.t - P.b);
    const xm = x(A.xMed), ym = y(META);
    let g = `<rect x="${xm}" y="${ym}" width="${W - P.r - xm}" height="${H - P.b - ym}" fill="#fbeaea" opacity=".7"/><rect x="${xm}" y="${P.t}" width="${W - P.r - xm}" height="${ym - P.t}" fill="#e5f5ec" opacity=".6"/>`;
    for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`; }
    for (let i = 0; i <= 4; i++) { const v = (xMax / 4) * i; g += `<text class="axis" x="${x(v)}" y="${H - P.b + 16}" text-anchor="middle">${fmt(v)}</text>`; }
    g += `<line x1="${xm}" x2="${xm}" y1="${P.t}" y2="${H - P.b}" stroke="#cfc5d6" stroke-dasharray="4 4"/><line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${ym}" y2="${ym}"/>`;
    g += `<text class="goal-lbl" x="${P.l + 4}" y="${ym - 5}">Meta ${Math.round(META * 100)}%</text>`;
    const q = (txt, xx, yy, anchor, col) => `<text x="${xx}" y="${yy}" text-anchor="${anchor}" font-size="11" font-weight="800" letter-spacing=".06em" fill="${col}">${txt}</text>`;
    g += q("DEFENDER", W - P.r - 6, P.t + 14, "end", "#1f8a4c") + q("ATACAR", W - P.r - 6, H - P.b - 8, "end", "#c93f3f") + q("MANTENER", xm - 6, P.t + 14, "end", "#6b6274") + q("DESARROLLAR", xm - 6, H - P.b - 8, "end", "#6b6274");
    g += `<text class="axis" x="${(P.l + W - P.r) / 2}" y="${H - 6}" text-anchor="middle">Tamaño de la tienda: venta ${A.MK.base} (u./mes)</text><text class="axis" transform="translate(12 ${(P.t + H - P.b) / 2}) rotate(-90)" text-anchor="middle">Participación ${A.MK.propia}</text>`;
    const placed = T.map((t) => ({ x0: x(t.oProm) - 8, x1: x(t.oProm) + 8, y: y(t.share) + 4 }));
    T.slice().sort((a, b) => b.share - a.share).forEach((t) => {
      const cx = x(t.oProm), cy = y(t.share), right = cx > W - 120, lw = shortT(t.k).length * 5.6 + 4;
      const x0 = right ? cx - 10 - lw : cx + 10;
      let ly = cy + 4;
      const hit = (yy) => placed.some((p) => Math.abs(p.y - yy) < 11 && x0 < p.x1 && x0 + lw > p.x0);
      for (let k = 1; k < 10 && hit(ly); k++) ly = cy + 4 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 11;
      placed.push({ x0, x1: x0 + lw, y: ly });
      if (Math.abs(ly - cy - 4) > 1) g += `<line x1="${cx}" y1="${cy}" x2="${right ? cx - 9 : cx + 9}" y2="${ly - 4}" stroke="#cfc5d6"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="7" fill="${t.act ? "var(--purple)" : "#9b93a3"}" stroke="#fff" stroke-width="1.5"><title>${esc(t.k)}: ${A.MK.base} ${fmt(t.oProm)} u./mes · ${A.MK.propia} ${fmt(t.aProj)} u. · participación ${pct1(t.share)}</title></circle>`;
      g += `<text x="${right ? cx - 10 : cx + 10}" y="${ly}" font-size="10.5" fill="#1d1424" text-anchor="${right ? "end" : "start"}">${esc(shortT(t.k))}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Matriz de prioridades por tienda">${g}</svg>
      <div class="legend"><span><i style="background:var(--purple)"></i>Con activación</span><span><i style="background:#9b93a3"></i>Sin activación</span><span><i style="background:#fbeaea"></i>Prioridad: grande y bajo meta</span></div>`;
  }

  function rankBars(A) {
    const T = A.tiendas.filter((t) => t.share != null), mx = Math.max(META * 1.4, ...T.map((t) => t.share));
    return `<div class="rank">${T.map((t) => `<div class="rank-row"><span class="name" title="${esc(t.lbl)}">${esc(shortT(t.k))}${t.act ? '<i class="act-dot" title="Con activación"></i>' : ""}</span>
      <div class="rank-track"><div class="rank-fill ${semCls(t.share)}" style="width:${(t.share / mx) * 100}%"></div><div class="rank-meta" style="left:${(META / mx) * 100}%"></div></div>
      <span class="n">${pct1(t.share)}</span></div>`).join("")}</div>
      <div class="legend"><span><i style="background:var(--ok)"></i>En meta</span><span><i style="background:#e0a21b"></i>Cerca (≥ ${Math.round(META * 60)}%)</span><span><i style="background:var(--coral)"></i>Lejos</span><span><i style="background:var(--coral);width:2px;height:12px;border-radius:0"></i>Meta ${Math.round(META * 100)}%</span></div>`;
  }

  function evolChart(A) {
    const pts = A.evol.filter((p) => p.v != null);
    if (!pts.length) return '<div class="empty">Sin datos de avance.</div>';
    const W = 560, H = 220, P = { l: 40, r: 16, t: 20, b: 30 }, n = pts.length, yMax = Math.max(META * 1.4, ...pts.map((p) => p.v)) * 1.15;
    const x = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r)), y = (v) => H - P.b - (v / yMax) * (H - P.t - P.b);
    let g = "";
    for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`; }
    g += `<line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${y(META)}" y2="${y(META)}"/><text class="goal-lbl" x="${W - P.r}" y="${y(META) - 5}" text-anchor="end">Meta ${Math.round(META * 100)}%</text>`;
    if (n > 1) g += `<polyline points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")}" fill="none" stroke="var(--purple)" stroke-width="2.5"/>`;
    pts.forEach((p, i) => (g += `<circle cx="${x(i)}" cy="${y(p.v)}" r="5" fill="${p.tipo === "mes" ? "#fff" : "var(--purple)"}" stroke="var(--purple)" stroke-width="2"/><text class="val" x="${x(i)}" y="${y(p.v) - 10}" text-anchor="middle">${pct1(p.v)}</text><text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.lbl)}</text>`));
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Evolución de la participación">${g}</svg>
      <div class="legend"><span><i style="background:#fff;border:2px solid var(--purple)"></i>Cierre de mes</span><span><i style="background:var(--purple)"></i>Corte semanal (proyección de cierre)</span></div>`;
  }

  function valueBars(A) {
    const S = A.skus.filter((s) => s.oS != null || s.aS != null).sort((a, b) => (b.oS || 0) - (a.oS || 0)).slice(0, 8);
    if (!S.length) return `<div class="empty">Aún no hay precios relevados para valorizar. Se toman de la pestaña Precios (mediana de los últimos 60 días).</div>`;
    const mx = Math.max(1, ...S.map((s) => Math.max(s.oS || 0, s.aS || 0)));
    return `<div class="vbars">${S.map((s) => `<div class="vrow"><div class="vname">${esc(shortSku(s.lbl))}<span>${s.gapS != null && s.gapS > 0 ? `brecha a meta ${money(s.gapS)}` : s.gapS != null ? "en meta" : "sin precio Afix"}</span></div>
      <div class="vtracks"><div class="vtrack"><div class="vfill o" style="width:${((s.oS || 0) / mx) * 100}%"></div><b>${money(s.oS)}</b></div><div class="vtrack"><div class="vfill a" style="width:${((s.aS || 0) / mx) * 100}%"></div><b>${money(s.aS)}</b></div></div></div>`).join("")}</div>
      <div class="legend"><span><i style="background:#9b93a3"></i>${A.MK.base} (mes promedio)</span><span><i style="background:var(--purple)"></i>${A.MK.propia} (${A.fac ? "proyección del mes" : "mes a la fecha"})</span></div>`;
  }

  function heat(A) {
    const T = A.tiendas.slice().sort((a, b) => b.oProm - a.oProm), S = A.skus.slice(0, 14);
    const cell = {}; T.forEach((t) => t.filas.forEach((f) => (cell[t.k + "|" + f.sku] = f)));
    return `<div class="table-wrap"><table class="ind-table heat"><thead><tr><th>Tienda</th>${S.map((s) => `<th class="num" title="${esc(s.lbl)}">${esc(shortSku(s.lbl).replace(/^Pvc\s+/i, "").replace(/^Soldadura Pvc\s+/i, "Sold. "))}</th>`).join("")}</tr></thead><tbody>
      ${T.map((t) => `<tr><td class="nowrap"><strong>${esc(shortT(t.k))}</strong></td>${S.map((s) => {
        const f = cell[t.k + "|" + s.k]; if (!f || !f.oProm) return '<td class="num muted">—</td>';
        const r = f.aProj / (f.aProj + f.oProm), bg = r >= META ? "#74119e" : r >= META * 0.6 ? "#a46bc0" : r >= META * 0.3 ? "#dcc8e7" : r > 0 ? "#f3e8f8" : "#fdecec";
        return `<td class="num" style="background:${bg};color:${r >= META * 0.6 ? "#fff" : "inherit"}" title="${esc(t.k)} · ${esc(s.lbl)}: ${A.MK.propia} ${fmt(f.aProj)} u. vs ${A.MK.base} ${f.oProm.toFixed(1)} u./mes">${Math.round(r * 100)}%</td>`;
      }).join("")}</tr>`).join("")}
    </tbody></table></div>`;
  }

  // ---------- Render ----------
  function render() {
    if (!el) return;
    if (!loaded) { el.innerHTML = `<div class="card panel" style="margin-top:-36px"><div class="empty">${loading ? "Cargando ventas…" : esc(err)}</div></div>`; return; }
    if (!cargas.length) {
      el.innerHTML = `<div class="card panel" style="margin-top:-36px"><div class="empty">Aún no hay ventas cargadas. Usa <b>📥 Cargar Excel de ventas por SKU</b> (abajo) para subir el primero.</div></div>`;
      return;
    }
    const C = cargas.find((c) => c.id === st.carga) || cargas[0]; st.carga = C.id;
    const A = analyze(C), T = A.tot, X = A.MK.propia, O = A.MK.base;
    const mesAv = A.nA ? MES_L[A.afx[A.LA].i] : "";
    const enMeta = A.tiendas.filter((t) => t.share != null && t.share >= META).length;
    const titular = A.nA
      ? `${X} ${A.fac ? "proyecta cerrar" : "lleva"} ${mesAv.toLowerCase()} con <span>${pct1(T.share)}</span> de participación frente a ${O}${T.aGrow != null ? ` y crece ${pct(T.aGrow)} vs. ${A.afx[A.PA].lbl.toLowerCase()}` : ""}.`
      : `Sin datos de ${X} en esta carga.`;
    const ac = acciones(A);
    const wk = A.prev;

    el.innerHTML = `
      <div class="exec">
        <div class="exec-top">
          <div>
            <div class="exec-kicker">Informe semanal · ${X} vs. ${O} en Sodimac · corte ${esc(fdc(A.corte))}${st.alcance === "act" ? " · tiendas con activación" : st.alcance === "ctrl" ? " · tiendas sin activación" : ""}${st.tienda ? " · " + esc(st.tienda) : ""}</div>
            <h2 class="exec-title">${titular}</h2>
          </div>
        </div>
        ${!A.corte ? `<div class="exec-warn">Falta la fecha de corte de esta carga: la participación se calcula con el avance a la fecha (sin proyectar). Agrégala en Precios → historial de cargas.</div>` : ""}
        <div class="exec-kpis">
          <div class="xk"><div class="xk-l"><i class="sem ${semCls(T.share)}"></i>Participación ${X}</div><div class="xk-v">${pct1(T.share)}</div><div class="xk-s">Meta ${Math.round(META * 100)}% · ${wk && wk.mismoMes ? `${pp(T.share - wk.share)} vs. semana anterior` : T.sharePrev != null ? `${A.afx[A.PA].lbl}: ${pct1(T.sharePrev)}` : ""}</div></div>
          <div class="xk"><div class="xk-l"><i class="sem ${T.aGrow == null ? "neu" : T.aGrow >= 0 ? "ok" : "bad"}"></i>${X} ${mesAv.toLowerCase()}</div><div class="xk-v">${fmt(A.fac ? T.aProj : T.aLast)}<small> u.</small></div><div class="xk-s">${A.fac ? `proyección · ${fmt(T.aLast)} u. a la fecha` : "a la fecha"}${wk && wk.mismoMes ? ` · +${fmt(T.aLast - wk.aLast)} u. en la semana` : ""}</div></div>
          <div class="xk"><div class="xk-l"><i class="sem ${T.gapU <= 0 ? "ok" : "bad"}"></i>Brecha a la meta</div><div class="xk-v">${T.gapU <= 0 ? "Cumplida" : T.gapS != null ? money(T.gapS) : fmt(T.gapU) + "<small> u.</small>"}</div><div class="xk-s">${T.gapU <= 0 ? `${fmt(-T.gapU)} u./mes sobre la meta` : `${fmt(T.gapU)} u./mes por capturar`}${T.gapS != null && T.conPrecio < 0.99 ? ` · precio en ${Math.round(T.conPrecio * 100)}% de SKUs` : ""}</div></div>
          <div class="xk"><div class="xk-l"><i class="sem ${enMeta >= A.tiendas.length / 2 ? "ok" : enMeta ? "warn" : "bad"}"></i>Tiendas en meta</div><div class="xk-v">${enMeta}<small> / ${A.tiendas.length}</small></div><div class="xk-s">${O} vende ${fmt(T.oProm)} u./mes${T.oS != null ? ` (${money(T.oS)})` : ""}</div></div>
        </div>
        ${ac.length ? `<div class="exec-acts"><div class="exec-acts-h">Prioridades de la semana</div><div class="acts">${ac.map((a, i) => `<div class="act"><span class="act-n">${i + 1}</span><div><b>${esc(a.t)}</b><p>${esc(a.d)}</p><span class="act-r">${esc(a.r)}</span></div></div>`).join("")}</div></div>` : ""}
      </div>

      <div class="card panel ind-toolbar">
        <div class="field"><label for="tCarga">Semana (carga)</label><select id="tCarga">${cargas.map((c) => `<option value="${esc(c.id)}"${c.id === C.id ? " selected" : ""}>Corte ${esc(fdc(c.corte || c.datos.corte))} · ${esc(c.archivo)}</option>`).join("")}</select></div>
        <div class="field"><label for="tAlc">Tiendas</label><select id="tAlc"><option value="">Todas (${A.tiendasAll.length})</option><option value="act"${st.alcance === "act" ? " selected" : ""}>Con activación ${X}</option><option value="ctrl"${st.alcance === "ctrl" ? " selected" : ""}>Sin activación</option></select></div>
        <div class="field"><label for="tTienda">Tienda</label><select id="tTienda"><option value="">Todas</option>${A.tiendasAll.slice().sort((a, b) => a.localeCompare(b, "es")).map((t) => `<option${t === st.tienda ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="tPrint">Imprimir / PDF</button>
        <button class="btn btn-ghost" id="tUp" title="Subir el Excel semanal de venta Sodimac">📥 Cargar Excel</button>
        <button class="btn btn-primary" id="tCsv">Exportar (CSV)</button>
      </div>

      ${!st.tienda ? `<div class="grid2">
        <div class="card panel"><div class="panel-head"><h3>Matriz de prioridades por tienda</h3><span class="muted">Dónde enfocar promotoras y exhibición</span></div>${scatter(A)}</div>
        <div class="card panel"><div class="panel-head"><h3>Participación ${X} por tienda</h3><span class="muted">${X} ÷ (${X} + ${O}) · ${A.fac ? "proyección del mes" : "a la fecha"}</span></div>${rankBars(A)}</div>
      </div>` : ""}

      <div class="grid2">
        <div class="card panel"><div class="panel-head"><h3>Evolución de la participación</h3><span class="muted">Cierres mensuales y cortes semanales</span></div>${evolChart(A)}</div>
        <div class="card panel"><div class="panel-head"><h3>¿Cuánto vale la brecha?</h3><span class="muted">Venta mensual en soles por producto · precios de góndola relevados</span></div>${valueBars(A)}</div>
      </div>

      ${A.nA && A.actVs.act.n && A.actVs.ctrl.n && !st.tienda && !st.alcance ? `<div class="card panel">
        <div class="panel-head"><h3>Efecto de la activación</h3><span class="muted">Participación ${X} por grupo de tiendas</span></div>
        <div class="duo">${[["Con activación", A.actVs.act, "var(--purple)"], ["Sin activación", A.actVs.ctrl, "#9b93a3"]].map(([n, g, c]) => `<div class="duo-c"><div class="duo-l">${n} · ${g.n} tiendas</div><div class="duo-v" style="color:${c}">${pct1(g.share)}</div><div class="duo-s">${A.nA > 1 ? `${A.afx[A.PA].lbl}: ${pct1(g.sharePrev)} → ${mesAv}: ${pct1(g.share)}` : ""}</div></div>`).join("")}</div>
        <p class="small muted" style="margin:10px 0 0">Hipótesis: la diferencia refleja el trabajo de las promotoras; validar con la misma fecha de corte en ambos grupos.</p>
      </div>` : ""}

      <details class="card panel det"><summary>Detalle por tienda</summary>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Tienda</th><th>Cuadrante</th><th class="num">${O} u./mes</th><th class="num">Tend. ${O}</th>${A.afx.map((a) => `<th class="num">${X} ${esc(a.lbl.slice(0, 3))}</th>`).join("")}${A.fac ? `<th class="num">${X} proy.</th>` : ""}<th class="num">Particip.</th><th class="num">Brecha u.</th><th class="num">Brecha S/</th></tr></thead><tbody>
          ${A.tiendas.map((t) => `<tr><td><strong>${esc(t.lbl)}</strong>${t.act ? ' <span class="pill ok">activación</span>' : ""}</td><td><span class="pill ${t.cuad === "Atacar" ? "bad" : t.cuad === "Defender" ? "ok" : "muted"}">${t.cuad}</span></td><td class="num">${fmt(t.oProm)}</td><td class="num">${pct(t.oTrend)}</td>${t.a.map((v) => `<td class="num">${fmt(v)}</td>`).join("")}${A.fac ? `<td class="num"><b>${fmt(t.aProj)}</b></td>` : ""}<td class="num"><span class="pill ${semCls(t.share) === "warn" ? "warn" : semCls(t.share)}">${pct1(t.share)}</span></td><td class="num">${fmt(Math.max(0, t.gapU))}</td><td class="num">${t.gapS != null ? money(Math.max(0, t.gapS)) : "—"}</td></tr>`).join("")}
        </tbody></table></div>
      </details>

      <details class="card panel det"><summary>Detalle por producto</summary>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Producto</th><th class="num">${O} u./mes</th><th class="num">Precio ${O}</th><th class="num">Precio ${X}</th>${A.afx.map((a) => `<th class="num">${X} ${esc(a.lbl.slice(0, 3))}</th>`).join("")}<th class="num">Particip.</th><th class="num">Brecha u.</th><th class="num">Brecha S/</th></tr></thead><tbody>
          ${A.skus.map((s) => `<tr><td><strong>${esc(s.lbl)}</strong><div class="small muted">SKU ${esc(s.k)}${s.cod ? ` · cód. ${X} ${esc(s.cod)}` : ""}</div></td><td class="num">${fmt(s.oProm)}</td><td class="num">${s.pO != null ? "S/ " + s.pO.toFixed(2) : "—"}</td><td class="num">${s.pA != null ? "S/ " + s.pA.toFixed(2) : "—"}</td>${s.a.map((v) => `<td class="num">${fmt(v)}</td>`).join("")}<td class="num"><span class="pill ${semCls(s.share)}">${pct1(s.share)}</span></td><td class="num">${fmt(Math.max(0, s.gapU))}</td><td class="num">${s.gapS != null ? money(Math.max(0, s.gapS)) : "—"}</td></tr>`).join("")}
        </tbody></table></div>
      </details>

      ${A.nA && A.tiendas.length > 1 ? `<details class="card panel det"><summary>Mapa tienda × producto (participación ${X})</summary>
        <p class="small muted">Morado = en meta · lila = cerca · rojo claro = ${X} sin venta.</p>${heat(A)}</details>` : ""}

      <details class="card panel det"${A.sinAfix.length ? "" : " hidden"}><summary>${X} sin venta donde ${O} sí vende (${A.sinAfix.length})</summary>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Tienda</th><th>Producto</th><th class="num">${O} u./mes</th>${A.nA > 1 ? `<th class="num">${X} ${esc(A.afx[A.PA].lbl)}</th>` : ""}</tr></thead><tbody>
          ${A.sinAfix.map((f) => `<tr><td>${esc(f.t)}${f.act ? ' <span class="pill ok">activación</span>' : ""}</td><td>${esc(f.d)}</td><td class="num">${f.oProm.toFixed(1)}</td>${A.nA > 1 ? `<td class="num">${fmt(f.a[A.PA])}</td>` : ""}</tr>`).join("")}
        </tbody></table></div>
      </details>

      <p class="small muted" style="margin:6px 4px 20px">Fuente: Excel de venta Sodimac (${esc(C.archivo)}). ${O}: venta mensual por SKU; ${X}: avance del producto equivalente al corte. Participación = ${X} ÷ (${X} + ${O} mes promedio de los meses completos). Proyección = avance × días del mes ÷ día de corte. Soles = unidades × precio de góndola mediano relevado por las promotoras (últimos 60 días). Meta configurable en config.js.</p>`;

    const $ = (id) => el.querySelector("#" + id);
    $("tCarga").onchange = (e) => { st.carga = e.target.value; st.tienda = ""; render(); };
    $("tAlc").onchange = (e) => { st.alcance = e.target.value; st.tienda = ""; render(); };
    $("tTienda").onchange = (e) => { st.tienda = e.target.value; render(); };
    $("tPrint").onclick = () => { el.querySelectorAll("details").forEach((d) => (d.open = true)); document.body.classList.add("print-tiendas"); window.print(); setTimeout(() => document.body.classList.remove("print-tiendas"), 500); };
    $("tUp").onclick = () => { document.getElementById("ventasCard")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("vFile")?.click(); };
    $("tCsv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const D = C.datos, dec = (n) => (n == null || !isFinite(n) ? "" : String(Math.round(n * 1000) / 1000).replace(".", ","));
      const head = ["Cod. tienda", "Tienda", "Activación", "SKU Sodimac", "Cod. " + X, "Producto", ...D.meses.map((m) => O + " " + m.lbl + (m.parcial ? " (parcial)" : "")), O + " prom. meses completos", ...(D.avance || []).map((a) => X + " " + a.lbl), X + " proyección", "Participación " + X, "Precio " + O, "Precio " + X, "Brecha a meta (u.)", "Brecha a meta (S/)"];
      const rows = analyze({ ...C }).tiendas.flatMap((t) => t.filas);
      const lines = rows.map((f) => [f.ct, f.t, f.act ? "Sí" : "No", f.sku, f.cod, f.d, ...f.m, dec(f.oProm), ...f.a, dec(f.aProj), dec(f.aProj + f.oProm ? f.aProj / (f.aProj + f.oProm) : null), dec(f.pO), dec(f.pA), dec(f.gapU), dec(f.gapS)].map(q).join(";"));
      const csv = "﻿" + head.map(q).join(";") + "\n" + lines.join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `afix_vs_oatey_corte_${C.corte || C.datos.corte || "sin_fecha"}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  window.TiendasAdmin = {
    mount(c) { el = c; listeners.add(render); },
    async show() { render(); await ensure(); loadPrecios(); },
    _parseSheet: parseSheet, // para pruebas
  };
})();
