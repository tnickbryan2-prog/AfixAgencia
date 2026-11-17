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
    try { cargas = await API.listVentasCargas(); loaded = true; } catch (e) { err = "No se pudieron leer las ventas: " + e.message; }
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
        <p class="small muted" style="margin:0 0 12px">Sube cada mes el Excel crudo de venta Sodimac (una fila por tienda × SKU): meses Ene, Feb, … = venta Oatey; columnas de avance (Octubre, Noviembre…) = venta Afix. Se guarda en el historial y el resumen aparece en la pestaña <b>Análisis tiendas</b>.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-primary" id="vPick">📥 Cargar Excel de ventas por SKU</button>
          <input type="file" id="vFile" accept=".xlsx,.xls,.xlsm,.csv" class="hidden" />
          ${last ? `<span class="small muted">Última carga: <b>${esc(last.archivo)}</b> · ${esc(last.periodo || "")} · ${fdt(last.created_at)}</span>` : ""}
        </div>
        ${upMsg ? `<div class="alert-item ${upMsg.startsWith("✓") ? "info" : "bad"}" style="margin-top:12px"><span>${esc(upMsg)}</span></div>` : ""}
        ${cargas.length ? `<div class="table-wrap" style="margin-top:14px"><table class="ind-table"><thead><tr><th>Fecha de carga</th><th>Archivo</th><th>Periodo</th><th class="num">Filas</th><th>Por</th><th></th></tr></thead><tbody>
          ${cargas.map((c) => `<tr><td class="nowrap">${fdt(c.created_at)}</td><td>${esc(c.archivo)}</td><td>${esc(c.periodo || "")}</td><td class="num">${c.filas}</td><td class="small muted">${esc(c.creado_por || "")}</td>
            <td><button class="icon-btn" data-cdel="${esc(c.id)}" title="Eliminar esta carga"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button></td></tr>`).join("")}
        </tbody></table></div>` : ""}`;
    }
    upEl.innerHTML = `<div class="card panel" id="ventasCard"><div class="panel-head"><h3>Ventas Sodimac por SKU y tienda</h3><span class="muted">Carga manual mensual · solo admins</span></div>${loading && !loaded ? '<div class="empty">Cargando…</div>' : err ? `<div class="empty">${esc(err)}</div>` : body}</div>`;

    const $ = (id) => upEl.querySelector("#" + id);
    if (preview) {
      $("vCancel").onclick = () => { preview = null; renderUpload(); };
      $("vAnio").onchange = (e) => { preview.anio = parseInt(e.target.value, 10) || preview.anio; };
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
          upMsg = ""; preview = { p, file: f.name, anio: maxM > now.getMonth() + 1 ? y - 1 : y };
        } catch (ex) { upMsg = "No se pudo leer el archivo: " + ex.message; }
        renderUpload();
      };
      upEl.querySelectorAll("[data-cdel]").forEach((b) => (b.onclick = async () => {
        const c = cargas.find((x) => x.id === b.dataset.cdel);
        if (!c || !confirm(`¿Eliminar la carga "${c.archivo}" (${c.periodo || ""})? El análisis usará la carga anterior.`)) return;
        try { await API.deleteVentasCarga(c.id); await reload(); } catch (ex) { alert("No se pudo eliminar: " + ex.message); }
      }));
    }
  }

  async function save() {
    const { p, file, anio } = preview;
    const first = p.meses[0], last = p.meses[p.meses.length - 1];
    const periodo = `${first.lbl}–${last.lbl}${last.parcial ? " (parcial)" : ""} ${anio}`;
    const datos = { v: 1, anio, hoja: p.hoja, marcas: { base: "Oatey", propia: "Afix" }, meses: p.meses.map(({ i, lbl, parcial }) => ({ i, lbl, parcial })), avance: p.avance, filas: p.filas };
    saving = true; renderUpload();
    try {
      await API.addVentasCarga({ archivo: file, anio, periodo, filas: p.filas.length, datos });
      preview = null; upMsg = `✓ Carga guardada (${periodo}). Ya puedes verla en Análisis tiendas.`;
      await reload();
      document.querySelector('#tabs .tab[data-tab="tiendas"]')?.click();
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
  // En el Excel "DATA VS PROM": meses Ene–Oct = venta OATEY por SKU Sodimac;
  // columnas de avance (Octubre, Noviembre, desde la hoja AVANCE AFIX) = venta AFIX del producto equivalente.
  const marcas = (D) => ({ base: (D.marcas && D.marcas.base) || "Oatey", propia: (D.marcas && D.marcas.propia) || "Afix" });

  function analyze(D) {
    const meses = D.meses, afx = D.avance || [];
    const full = meses.map((m, k) => (m.parcial ? null : k)).filter((k) => k != null);
    const lastFull = full[full.length - 1];
    const nA = afx.length, LA = nA - 1, PA = nA - 2;
    let F = D.filas.map((f) => ({ ...f, act: enActivacion(f.t) }));
    const tiendasAll = [...new Set(F.map((f) => f.t))];
    if (st.alcance === "act") F = F.filter((f) => f.act);
    if (st.alcance === "ctrl") F = F.filter((f) => !f.act);
    if (st.tienda) F = F.filter((f) => f.t === st.tienda);

    const avgFull = (m) => (full.length ? sum(full.map((k) => m[k])) / full.length : 0);
    const trend = (m) => { const a = full.slice(-3), b = full.slice(-6, -3); if (!a.length || !b.length) return null; const x = sum(a.map((k) => m[k])) / a.length, y = sum(b.map((k) => m[k])) / b.length; return y ? x / y - 1 : null; };
    const stats = (m, a) => {
      const oProm = avgFull(m), aLast = nA ? a[LA] : null, aPrev = nA > 1 ? a[PA] : null;
      return { oTot: sum(full.map((k) => m[k])), oProm, oLast: lastFull != null ? m[lastFull] : null, oTrend: trend(m), aLast, aPrev,
        aGrow: aPrev ? aLast / aPrev - 1 : null, ratio: oProm ? aLast / oProm : null, ratioPrev: oProm && aPrev != null ? aPrev / oProm : null,
        share: aLast != null && aLast + oProm ? aLast / (aLast + oProm) : null, gap: oProm - (aLast || 0) };
    };
    const group = (keyF, labelF) => {
      const g = {};
      F.forEach((f) => { const k = keyF(f); const x = g[k] = g[k] || { k, lbl: labelF(f), act: f.act, cod: f.cod, m: meses.map(() => 0), a: afx.map(() => 0), filas: [] }; f.m.forEach((v, i) => (x.m[i] += v)); f.a.forEach((v, i) => (x.a[i] += v)); x.filas.push(f); });
      return Object.values(g).map((x) => ({ ...x, ...stats(x.m, x.a) }));
    };
    const tot = { m: meses.map((_, k) => sum(F.map((f) => f.m[k]))), a: afx.map((_, i) => sum(F.map((f) => f.a[i]))) };
    Object.assign(tot, stats(tot.m, tot.a));
    const tiendas = group((f) => f.t, (f) => (f.ct ? f.ct + " - " : "") + f.t).sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
    const skus = group((f) => f.sku, (f) => f.d).sort((a, b) => b.oProm - a.oProm);

    const all = D.filas.map((f) => ({ ...f, act: enActivacion(f.t) }));
    const grp = (flag) => { const xs = all.filter((f) => f.act === flag); const m = meses.map((_, k) => sum(xs.map((f) => f.m[k]))), a = afx.map((_, i) => sum(xs.map((f) => f.a[i]))); return { n: new Set(xs.map((f) => f.t)).size, ...stats(m, a), a }; };
    const actVs = { act: grp(true), ctrl: grp(false) };

    // Afix sin venta (último mes) donde Oatey sí vende
    const sinAfix = nA ? F.map((f) => ({ f, oProm: avgFull(f.m), aLast: f.a[LA] })).filter((x) => !x.aLast && x.oProm >= 3).sort((a, b) => b.oProm - a.oProm) : [];
    return { meses, afx, full, lastFull, LA, PA, tot, tiendas, skus, actVs, sinAfix, tiendasAll, avgFull };
  }

  function insights(A, MK) {
    const out = [], O = MK.base, X = MK.propia, nA = A.afx.length, T = A.tot;
    if (nA) {
      const L = A.afx[A.LA].lbl;
      out.push(`<b>${X} ${L}:</b> ${fmt(T.aLast)} u. a la fecha de corte, equivalente al ${pct(T.ratio, false)} de lo que ${O} vende en un mes promedio (${fmt(T.oProm)} u.). Participación estimada de ${X}: <b>${pct(T.share, false)}</b>.${nA > 1 ? ` En ${A.afx[A.PA].lbl} fue ${fmt(T.aPrev)} u. (${pct(T.ratioPrev, false)} de ${O}); crecimiento ${pct(T.aGrow)}.` : ""}`);
    }
    if (A.lastFull != null) out.push(`<b>${O} (referencia):</b> ${fmt(T.oProm)} u./mes en ${A.full.length} meses completos; tendencia 3 meses ${pct(T.oTrend)}. ${A.meses[A.lastFull].lbl} cerró en ${fmt(T.oLast)} u.${A.meses.some((m) => m.parcial) ? ` ${A.meses.find((m) => m.parcial).lbl} es parcial y no se compara.` : ""}`);
    const ts = A.tiendas.filter((t) => t.ratio != null);
    if (nA && ts.length > 2) {
      out.push(`<b>Dónde ${X} compite mejor:</b> ${ts.slice(0, 3).map((t) => `${esc(t.k)} (${pct(t.ratio, false)} de ${O})`).join(", ")}. <b>Más rezagadas:</b> ${ts.slice(-3).reverse().map((t) => `${esc(t.k)} (${pct(t.ratio, false)})`).join(", ")}.`);
    }
    if (nA && A.skus.length > 1) {
      const s = A.skus.filter((x) => x.oProm >= 20), best = s.slice().sort((a, b) => b.ratio - a.ratio)[0], gap = A.skus.slice().sort((a, b) => b.gap - a.gap)[0];
      if (best && gap) out.push(`<b>Por producto:</b> ${X} está más cerca de ${O} en ${esc(shortSku(best.lbl))} (${pct(best.ratio, false)}). La mayor brecha en unidades es ${esc(shortSku(gap.lbl))}: ${O} vende ${fmt(gap.oProm)} u./mes vs. ${fmt(gap.aLast)} de ${X}; es la principal oportunidad.`);
    }
    const { act, ctrl } = A.actVs;
    if (nA && act.n && ctrl.n && act.ratio != null && ctrl.ratio != null) out.push(`<b>Activación:</b> en las ${act.n} tiendas con activación ${X} llega al ${pct(act.ratio, false)} de ${O}, frente a ${pct(ctrl.ratio, false)} en las ${ctrl.n} sin activación${nA > 1 ? ` (en ${A.afx[A.PA].lbl}: ${pct(act.ratioPrev, false)} vs. ${pct(ctrl.ratioPrev, false)})` : ""}. Hipótesis: efecto de las promotoras; confirmar con la misma fecha de corte.`);
    if (A.sinAfix.length) out.push(`<b>${X} sin venta donde ${O} sí vende:</b> ${A.sinAfix.length} combinaciones tienda × producto en ${A.afx[A.LA].lbl}; la más grande es ${esc(shortSku(A.sinAfix[0].f.d))} en ${esc(A.sinAfix[0].f.t)} (${O} ${fmt(A.sinAfix[0].oProm)} u./mes). Revisar stock y exhibición.`);
    return out;
  }

  function chart(A, MK) {
    const W = 720, H = 230, P = { l: 44, r: 12, t: 18, b: 26 };
    const idx = [...new Set([...A.meses.map((m) => m.i), ...A.afx.map((a) => a.i)])].sort((a, b) => a - b);
    const oBy = {}, aBy = {}; A.meses.forEach((m, k) => (oBy[m.i] = { v: A.tot.m[k], parcial: m.parcial })); A.afx.forEach((a, k) => (aBy[a.i] = A.tot.a[k]));
    const max = Math.max(1, ...idx.map((i) => Math.max(oBy[i]?.v || 0, aBy[i] || 0))) * 1.12, bw = (W - P.l - P.r) / idx.length;
    const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    let g = "";
    for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
    idx.forEach((i, n) => {
      const x = P.l + n * bw, o = oBy[i], a = aBy[i], both = o && a != null, w = both ? bw * 0.36 : bw * 0.6;
      if (o) { const xo = both ? x + bw * 0.12 : x + bw * 0.2; g += `<rect x="${xo}" y="${y(o.v)}" width="${w}" height="${H - P.b - y(o.v)}" rx="3" fill="${o.parcial ? "#d9d4dc" : "#9b93a3"}"><title>${MK.base} ${MES[i]}${o.parcial ? " (parcial)" : ""}: ${fmt(o.v)} u.</title></rect><text class="val" x="${xo + w / 2}" y="${y(o.v) - 4}" text-anchor="middle">${fmt(o.v)}</text>`; }
      if (a != null) { const xa = both ? x + bw * 0.52 : x + bw * 0.2; g += `<rect x="${xa}" y="${y(a)}" width="${w}" height="${H - P.b - y(a)}" rx="3" fill="var(--purple)"><title>${MK.propia} ${MES[i]}: ${fmt(a)} u.</title></rect><text class="val" x="${xa + w / 2}" y="${y(a) - 4}" text-anchor="middle" fill="var(--purple)">${fmt(a)}</text>`; }
      g += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${MES[i]}${o && o.parcial ? "*" : ""}</text>`;
    });
    if (A.tot.oProm) g += `<line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${y(A.tot.oProm)}" y2="${y(A.tot.oProm)}" style="stroke:#9b93a3"/><text class="axis" x="${W - P.r}" y="${y(A.tot.oProm) - 5}" text-anchor="end">Promedio ${MK.base} ${fmt(A.tot.oProm)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${MK.base} vs ${MK.propia} por mes">${g}</svg>
      <div class="small muted" style="display:flex;gap:16px;margin-top:6px"><span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#9b93a3"></span> ${MK.base}</span><span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--purple)"></span> ${MK.propia}</span><span>* mes parcial</span></div>`;
  }

  const ratioPill = (r) => (r == null ? '<span class="muted">—</span>' : `<span class="pill ${r >= 0.25 ? "ok" : r >= 0.1 ? "warn" : "bad"}">${pct(r, false)}</span>`);
  const trendPill = (t) => (t == null ? '<span class="muted">—</span>' : `<span class="pill ${t > 0.05 ? "ok" : t < -0.05 ? "bad" : "muted"}">${pct(t)}</span>`);
  const vsBar = (o, a, maxO) => `<div style="display:grid;gap:3px;min-width:120px"><div class="bar-track" style="height:8px"><div class="bar-fill" style="width:${(o / maxO) * 100}%;background:#9b93a3"></div></div><div class="bar-track" style="height:8px"><div class="bar-fill" style="width:${((a || 0) / maxO) * 100}%"></div></div></div>`;

  function heat(A, MK) {
    const T = A.tiendas.slice().sort((a, b) => b.oProm - a.oProm), S = A.skus.slice(0, 14);
    const cell = {}; T.forEach((t) => t.filas.forEach((f) => (cell[t.k + "|" + f.sku] = f)));
    return `<div class="table-wrap"><table class="ind-table heat"><thead><tr><th>Tienda</th>${S.map((s) => `<th class="num" title="${esc(s.lbl)}">${esc(shortSku(s.lbl).replace(/^Pvc\s+/i, "").replace(/^Soldadura Pvc\s+/i, "Sold. "))}</th>`).join("")}</tr></thead><tbody>
      ${T.map((t) => `<tr><td class="nowrap"><strong>${esc(t.k)}</strong></td>${S.map((s) => {
        const f = cell[t.k + "|" + s.k]; if (!f) return '<td class="num muted">—</td>';
        const o = A.avgFull(f.m), a = f.a[A.LA] || 0; if (!o) return `<td class="num muted">${a ? fmt(a) : "—"}</td>`;
        const r = a / o, bg = r >= 0.4 ? "#74119e" : r >= 0.2 ? "#a46bc0" : r >= 0.1 ? "#dcc8e7" : r > 0 ? "#f3e8f8" : "#fdecec";
        return `<td class="num" style="background:${bg};color:${r >= 0.2 ? "#fff" : "inherit"}" title="${esc(t.k)} · ${esc(s.lbl)}: ${MK.propia} ${fmt(a)} u. vs ${MK.base} ${o.toFixed(1)} u./mes">${Math.round(r * 100)}%</td>`;
      }).join("")}</tr>`).join("")}
    </tbody></table></div>`;
  }

  function render() {
    if (!el) return;
    if (!loaded) { el.innerHTML = `<div class="card panel" style="margin-top:-36px"><div class="empty">${loading ? "Cargando ventas…" : esc(err)}</div></div>`; return; }
    if (!cargas.length) {
      el.innerHTML = `<div class="card panel" style="margin-top:-36px"><div class="empty">Aún no hay ventas cargadas. Ve a la pestaña <b>Precios</b> y usa <b>📥 Cargar Excel de ventas por SKU</b>.</div></div>`;
      return;
    }
    const C = cargas.find((c) => c.id === st.carga) || cargas[0]; st.carga = C.id;
    const MK = marcas(C.datos), O = MK.base, X = MK.propia;
    const A = analyze(C.datos), T = A.tot, nA = A.afx.length;
    const LL = nA ? A.afx[A.LA].lbl : "", PL = nA > 1 ? A.afx[A.PA].lbl : "";
    const { act, ctrl } = A.actVs;
    const maxT = Math.max(1, ...A.tiendas.map((t) => Math.max(t.oProm, t.aLast || 0)));
    const maxS = Math.max(1, ...A.skus.map((t) => Math.max(t.oProm, t.aLast || 0)));

    el.innerHTML = `
      <div class="kpis">
        <div class="card kpi accent"><div class="lbl">${X} ${esc(LL)}</div><div class="val">${fmt(T.aLast)}</div><div class="sub">unidades a la fecha${nA > 1 ? ` · <span class="${T.aGrow >= 0 ? "up" : "down"}">${pct(T.aGrow)}</span> vs. ${esc(PL)}` : ""}</div></div>
        <div class="card kpi"><div class="lbl">${O} promedio mensual</div><div class="val">${fmt(T.oProm)}</div><div class="sub">${A.full.length} meses completos · tendencia ${pct(T.oTrend)}</div></div>
        <div class="card kpi"><div class="lbl">${X} vs. ${O}</div><div class="val">${pct(T.ratio, false)}</div><div class="sub">${X} ${esc(LL)} ÷ ${O} mes promedio</div></div>
        <div class="card kpi warn"><div class="lbl">Participación ${X}</div><div class="val">${pct(T.share, false)}</div><div class="sub">${X} ÷ (${X} + ${O}) · estimada</div></div>
      </div>

      <div class="card panel ind-toolbar">
        <div class="field"><label for="tCarga">Carga</label><select id="tCarga">${cargas.map((c) => `<option value="${esc(c.id)}"${c.id === C.id ? " selected" : ""}>${esc(c.periodo || c.archivo)} · ${fdt(c.created_at)}</option>`).join("")}</select></div>
        <div class="field"><label for="tAlc">Tiendas</label><select id="tAlc"><option value="">Todas (${A.tiendasAll.length})</option><option value="act"${st.alcance === "act" ? " selected" : ""}>Con activación Afix</option><option value="ctrl"${st.alcance === "ctrl" ? " selected" : ""}>Sin activación</option></select></div>
        <div class="field"><label for="tTienda">Tienda</label><select id="tTienda"><option value="">Todas</option>${A.tiendasAll.slice().sort((a, b) => a.localeCompare(b, "es")).map((t) => `<option${t === st.tienda ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="tReload">Actualizar</button>
        <button class="btn btn-primary" id="tCsv">Exportar (CSV)</button>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Resumen: ${X} vs. ${O}</h3><span class="muted">${esc(C.archivo)}${st.alcance || st.tienda ? " · filtrado" : ""}</span></div>
        <ul style="margin:0;padding-left:18px;line-height:1.55;font-size:14px">${insights(A, MK).map((x) => `<li style="margin-bottom:6px">${x}</li>`).join("")}</ul>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>${O} vs. ${X} por mes (unidades)</h3><span class="muted">${O}: venta mensual Sodimac · ${X}: avance a la fecha de corte</span></div>
        ${chart(A, MK)}
      </div>

      ${nA && act.n && ctrl.n && !st.tienda ? `<div class="card panel">
        <div class="panel-head"><h3>Activación: ${X} como % de ${O}</h3><span class="muted">${X} del mes ÷ ${O} mes promedio, por grupo de tiendas</span></div>
        <div class="bars wide">${A.afx.map((a, i) => [["Con activación (" + act.n + ")", act], ["Sin activación (" + ctrl.n + ")", ctrl]].map(([n, g]) => { const r = g.oProm ? g.a[i] / g.oProm : 0; return `<div class="bar-row"><span class="name">${esc(a.lbl)} · ${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, r * 300)}%;${g === ctrl ? "background:#a46bc0" : ""}"></div></div><span class="n">${pct(r, false)}</span></div>`; }).join("")).join("")}</div>
        <p class="small muted" style="margin:10px 0 0">${O} promedio: con activación ${fmt(act.oProm)} u./mes · sin activación ${fmt(ctrl.oProm)} u./mes. ${X} ${esc(LL)}: ${fmt(act.aLast)} vs. ${fmt(ctrl.aLast)} u. Barra a escala ×3 para que se vean las diferencias.</p>
      </div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>Tiendas: ${X} vs. ${O}</h3><span class="muted">Ordenado por ${X} como % de ${O} · gris = ${O} mes promedio, morado = ${X} ${esc(LL)}</span></div>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Tienda</th><th class="num">${O} prom./mes</th><th class="num">Tend. ${O}</th>${A.afx.map((a) => `<th class="num">${X} ${esc(a.lbl.slice(0, 3))}</th>`).join("")}<th class="num">Crec. ${X}</th><th>Comparativo</th><th class="num">${X} vs. ${O}</th><th class="num">Particip.</th></tr></thead><tbody>
          ${A.tiendas.map((t) => `<tr><td><strong>${esc(t.lbl)}</strong>${t.act ? ' <span class="pill ok">activación</span>' : ""}</td><td class="num">${fmt(t.oProm)}</td><td class="num">${trendPill(t.oTrend)}</td>${t.a.map((v) => `<td class="num"><b>${fmt(v)}</b></td>`).join("")}<td class="num">${trendPill(t.aGrow)}</td><td>${vsBar(t.oProm, t.aLast, maxT)}</td><td class="num">${ratioPill(t.ratio)}</td><td class="num">${pct(t.share, false)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Productos: ${X} vs. ${O}</h3><span class="muted">SKU Sodimac ${O} y su equivalente ${X} · ordenado por tamaño de ${O}</span></div>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Producto</th><th class="num">${O} prom./mes</th><th class="num">Tend. ${O}</th>${A.afx.map((a) => `<th class="num">${X} ${esc(a.lbl.slice(0, 3))}</th>`).join("")}<th>Comparativo</th><th class="num">${X} vs. ${O}</th><th class="num">Brecha u./mes</th></tr></thead><tbody>
          ${A.skus.map((s) => `<tr><td><strong>${esc(s.lbl)}</strong><div class="small muted">SKU ${esc(s.k)}${s.cod ? ` · cód. ${X} ${esc(s.cod)}` : ""}</div></td><td class="num">${fmt(s.oProm)}</td><td class="num">${trendPill(s.oTrend)}</td>${s.a.map((v) => `<td class="num"><b>${fmt(v)}</b></td>`).join("")}<td>${vsBar(s.oProm, s.aLast, maxS)}</td><td class="num">${ratioPill(s.ratio)}</td><td class="num">${fmt(Math.max(0, s.gap))}</td></tr>`).join("")}
        </tbody></table></div>
      </div>

      ${nA && A.tiendas.length > 1 ? `<div class="card panel">
        <div class="panel-head"><h3>Mapa tienda × producto: ${X} como % de ${O}</h3><span class="muted">${X} ${esc(LL)} ÷ ${O} mes promedio · morado ≥ 20% · lila 10–20% · rojo claro = ${X} sin venta</span></div>
        ${heat(A, MK)}
      </div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>${X} sin venta donde ${O} sí vende</h3><span class="muted">${esc(LL)} · ${O} ≥ 3 u./mes · revisar stock, código activo y exhibición</span></div>
        ${A.sinAfix.length ? `<div class="table-wrap"><table class="ind-table"><thead><tr><th>Tienda</th><th>Producto</th><th class="num">${O} prom./mes</th>${nA > 1 ? `<th class="num">${X} ${esc(PL)}</th>` : ""}</tr></thead><tbody>
          ${A.sinAfix.slice(0, 30).map((q) => `<tr><td>${esc(q.f.t)}${q.f.act ? ' <span class="pill ok">activación</span>' : ""}</td><td>${esc(q.f.d)}</td><td class="num">${q.oProm.toFixed(1)}</td>${nA > 1 ? `<td class="num">${fmt(q.f.a[A.PA])}</td>` : ""}</tr>`).join("")}
        </tbody></table></div>${A.sinAfix.length > 30 ? `<p class="small muted">… y ${A.sinAfix.length - 30} más (ver CSV).</p>` : ""}` : `<div class="empty">${X} vendió en todas las combinaciones donde ${O} vende.</div>`}
      </div>`;

    const $ = (id) => el.querySelector("#" + id);
    $("tCarga").onchange = (e) => { st.carga = e.target.value; st.tienda = ""; render(); };
    $("tAlc").onchange = (e) => { st.alcance = e.target.value; st.tienda = ""; render(); };
    $("tTienda").onchange = (e) => { st.tienda = e.target.value; render(); };
    $("tReload").onclick = () => reload();
    $("tCsv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const D = C.datos, dec = (n) => (n == null || !isFinite(n) ? "" : String(Math.round(n * 1000) / 1000).replace(".", ","));
      const head = ["Cod. tienda", "Tienda", "Activación", "SKU Sodimac", "Cod. " + X, "Producto", ...D.meses.map((m) => O + " " + m.lbl + (m.parcial ? " (parcial)" : "")), O + " prom. meses completos", ...(D.avance || []).map((a) => X + " " + a.lbl), X + " vs " + O];
      const lines = D.filas.map((f) => { const o = A.avgFull(f.m), a = (D.avance || []).length ? f.a[f.a.length - 1] : null; return [f.ct, f.t, enActivacion(f.t) ? "Sí" : "No", f.sku, f.cod, f.d, ...f.m, dec(o), ...f.a, o ? dec(a / o) : ""].map(q).join(";"); });
      const csv = "﻿" + head.map(q).join(";") + "\n" + lines.join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `afix_vs_oatey_${(C.periodo || "").replace(/[^\w]+/g, "_")}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  window.TiendasAdmin = {
    mount(c) { el = c; listeners.add(render); },
    async show() { render(); await ensure(); },
    _parseSheet: parseSheet, // para pruebas
  };
})();
