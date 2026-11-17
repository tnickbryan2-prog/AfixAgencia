// =====================================================================
//  Ventas Sodimac por SKU y tienda (Excel mensual, carga manual)
//   · VentasUpload  → botón y historial de cargas en la pestaña Precios
//   · TiendasAdmin  → pestaña "Análisis tiendas" del admin
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
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Mes</th><th>Columna en Excel</th><th class="num">Unidades</th><th>¿Mes incompleto?</th></tr></thead><tbody>
          ${p.meses.map((m, k) => `<tr><td><strong>${m.lbl}</strong></td><td class="muted">${esc(m.head)}</td><td class="num">${fmt(tot[k])}</td><td><label style="display:inline-flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" data-parc="${k}"${m.parcial ? " checked" : ""}/> parcial (corte a mitad de mes)</label></td></tr>`).join("")}
          ${p.avance.map((a, k) => `<tr><td><strong>Avance ${a.lbl}</strong></td><td class="muted">${esc(a.lbl)}</td><td class="num">${fmt(sum(p.filas.map((f) => f.a[k])))}</td><td class="muted">Mes en curso</td></tr>`).join("")}
        </tbody></table></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="vCancel">Cancelar</button>
          <button class="btn btn-primary" id="vSave"${saving ? " disabled" : ""}>${saving ? "Guardando…" : "Guardar y ver análisis"}</button>
        </div>`;
    } else {
      body = `
        <p class="small muted" style="margin:0 0 12px">Sube cada mes el Excel crudo de venta Sodimac (una fila por tienda × SKU con columnas Ene, Feb, …). Se guarda en el historial y el resumen aparece en la pestaña <b>Análisis tiendas</b>.</p>
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
    const datos = { v: 1, anio, hoja: p.hoja, meses: p.meses.map(({ i, lbl, parcial }) => ({ i, lbl, parcial })), avance: p.avance, filas: p.filas };
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

  function analyze(D) {
    const meses = D.meses, full = meses.map((m, k) => (m.parcial ? null : k)).filter((k) => k != null);
    const lastFull = full[full.length - 1];
    let F = D.filas.map((f) => ({ ...f, act: enActivacion(f.t) }));
    const tiendasAll = [...new Set(F.map((f) => f.t))];
    if (st.alcance === "act") F = F.filter((f) => f.act);
    if (st.alcance === "ctrl") F = F.filter((f) => !f.act);
    if (st.tienda) F = F.filter((f) => f.t === st.tienda);

    const totMes = meses.map((_, k) => sum(F.map((f) => f.m[k])));
    const totFull = sum(full.map((k) => totMes[k]));
    const prom = full.length ? totFull / full.length : 0;
    const win = (arr, k0, n) => { const ks = full.filter((k) => k <= k0).slice(-n); return ks.length ? sum(ks.map((k) => arr[k])) / ks.length : null; };
    const l3 = (arr) => win(arr, lastFull, 3);
    const p3 = (arr) => { const ks = full.slice(-6, -3); return ks.length ? sum(ks.map((k) => arr[k])) / ks.length : null; };
    const trend = (arr) => { const a = l3(arr), b = p3(arr); return a != null && b ? a / b - 1 : null; };

    const groupBy = (keyF, labelF) => {
      const g = {};
      F.forEach((f) => { const k = keyF(f); const x = g[k] = g[k] || { k, lbl: labelF(f), act: f.act, m: meses.map(() => 0), a: (D.avance || []).map(() => 0), filas: [] }; f.m.forEach((v, i) => (x.m[i] += v)); f.a.forEach((v, i) => (x.a[i] += v)); x.filas.push(f); });
      return Object.values(g).map((x) => {
        const t = sum(full.map((k) => x.m[k])), p = full.length ? t / full.length : 0;
        return { ...x, tot: t, prom: p, last: lastFull != null ? x.m[lastFull] : null, vsProm: p && lastFull != null ? x.m[lastFull] / p - 1 : null, trend: trend(x.m), share: totFull ? t / totFull : 0, avPct: x.a.map((v) => (p ? v / p : null)) };
      }).sort((a, b) => b.tot - a.tot);
    };
    const tiendas = groupBy((f) => f.t, (f) => (f.ct ? f.ct + " - " : "") + f.t);
    const skus = groupBy((f) => f.sku, (f) => f.d);

    // Activación vs. resto (con todas las tiendas, sin filtro de alcance)
    const all = D.filas.map((f) => ({ ...f, act: enActivacion(f.t) }));
    const grp = (flag) => { const xs = all.filter((f) => f.act === flag); const p = full.length ? sum(xs.flatMap((f) => full.map((k) => f.m[k]))) / full.length : 0; return { n: new Set(xs.map((f) => f.t)).size, prom: p, av: (D.avance || []).map((_, i) => sum(xs.map((f) => f.a[i]))), trend: trend(meses.map((_, k) => sum(xs.map((f) => f.m[k])))) }; };
    const actVs = { act: grp(true), ctrl: grp(false) };

    // Quiebres: tienda × SKU sin venta en alguno de los últimos 3 meses completos
    const ult3 = full.slice(-3);
    const quiebres = F.map((f) => ({ f, ceros: ult3.filter((k) => !f.m[k]).map((k) => meses[k].lbl), prom: full.length ? sum(full.map((k) => f.m[k])) / full.length : 0 }))
      .filter((x) => x.ceros.length).sort((a, b) => b.prom - a.prom);

    return { meses, full, lastFull, totMes, totFull, prom, trendTot: trend(totMes), tiendas, skus, actVs, quiebres, tiendasAll, av: D.avance || [], avTot: (D.avance || []).map((_, i) => sum(F.map((f) => f.a[i]))) };
  }

  function insights(A) {
    const out = [], M = (k) => A.meses[k].lbl;
    if (A.lastFull != null) out.push(`<b>Venta acumulada:</b> ${fmt(A.totFull)} u. en ${A.full.length} meses completos (${M(A.full[0])}–${M(A.lastFull)}), promedio ${fmt(A.prom)} u./mes. ${M(A.lastFull)} cerró en ${fmt(A.totMes[A.lastFull])} u. (${pct(A.totMes[A.lastFull] / A.prom - 1)} vs. promedio).`);
    if (A.trendTot != null) out.push(`<b>Tendencia:</b> últimos 3 meses ${pct(A.trendTot)} frente a los 3 anteriores.`);
    const parc = A.meses.findIndex((m) => m.parcial);
    if (parc >= 0) out.push(`<b>${M(parc)} es parcial:</b> lleva ${fmt(A.totMes[parc])} u. (${pct(A.totMes[parc] / A.prom, false)} de un mes promedio); no se compara con meses completos.`);
    if (A.tiendas.length > 1) {
      const top = A.tiendas[0], top3 = A.tiendas.slice(0, 3), low = A.tiendas[A.tiendas.length - 1];
      out.push(`<b>Concentración:</b> ${top3.map((t) => esc(t.k)).join(", ")} suman ${pct(sum(top3.map((t) => t.share)), false)} de la venta. La de menor venta es ${esc(low.k)} (${fmt(low.prom)} u./mes).`);
      const up = A.tiendas.filter((t) => t.trend != null).sort((a, b) => b.trend - a.trend);
      if (up.length > 2) out.push(`<b>Crecen más:</b> ${up.slice(0, 2).map((t) => `${esc(t.k)} (${pct(t.trend)})`).join(", ")}. <b>Caen más:</b> ${up.slice(-2).reverse().map((t) => `${esc(t.k)} (${pct(t.trend)})`).join(", ")}.`);
    }
    if (A.skus.length > 1) {
      const s = A.skus, cae = s.filter((x) => x.trend != null && x.trend < -0.1 && x.share > 0.02);
      out.push(`<b>Mix:</b> ${esc(shortSku(s[0].lbl))} (${pct(s[0].share, false)}) y ${esc(shortSku(s[1].lbl))} (${pct(s[1].share, false)}) explican ${pct(s[0].share + s[1].share, false)} de la venta.${cae.length ? ` En caída: ${cae.map((x) => `${esc(shortSku(x.lbl))} (${pct(x.trend)})`).join(", ")}.` : ""}`);
    }
    const { act, ctrl } = A.actVs, n = A.av.length;
    if (n && act.n && ctrl.n && act.prom && ctrl.prom) {
      const ia = act.av[n - 1] / act.prom, ic = ctrl.av[n - 1] / ctrl.prom;
      out.push(`<b>Avance ${A.av[n - 1].lbl}:</b> las ${act.n} tiendas con activación llevan ${pct(ia, false)} de su mes promedio vs. ${pct(ic, false)} en las ${ctrl.n} sin activación${n > 1 ? ` (en ${A.av[n - 2].lbl}: ${pct(act.av[n - 2] / act.prom, false)} vs. ${pct(ctrl.av[n - 2] / ctrl.prom, false)})` : ""}. Hipótesis: efecto de la activación; confirmar con la fecha de corte del avance.`);
    }
    if (A.quiebres.length) out.push(`<b>Posibles quiebres:</b> ${A.quiebres.length} combinaciones tienda × SKU sin venta en algún mes reciente; la más relevante es ${esc(shortSku(A.quiebres[0].f.d))} en ${esc(A.quiebres[0].f.t)} (${A.quiebres[0].ceros.join(", ")}).`);
    return out;
  }

  function chartMeses(A) {
    const W = 720, H = 220, P = { l: 44, r: 12, t: 16, b: 26 }, n = A.meses.length;
    const max = Math.max(1, ...A.totMes) * 1.12, bw = (W - P.l - P.r) / n;
    const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    let g = "";
    for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
    A.meses.forEach((m, i) => {
      const v = A.totMes[i], x = P.l + i * bw;
      g += `<rect x="${x + bw * 0.16}" y="${y(v)}" width="${bw * 0.68}" height="${H - P.b - y(v)}" rx="3" class="bar${m.parcial ? " off" : i === A.lastFull ? " today" : ""}"><title>${m.lbl}${m.parcial ? " (parcial)" : ""}: ${fmt(v)} u.</title></rect>`;
      g += `<text class="val" x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle">${fmt(v)}</text><text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${m.lbl}${m.parcial ? "*" : ""}</text>`;
    });
    if (A.prom) g += `<line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${y(A.prom)}" y2="${y(A.prom)}"/><text class="goal-lbl" x="${W - P.r}" y="${y(A.prom) - 5}" text-anchor="end">Promedio ${fmt(A.prom)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Venta mensual">${g}</svg>`;
  }

  const spark = (vals, parcial) => {
    const W = 90, H = 24, n = vals.length, max = Math.max(1, ...vals);
    const pts = vals.map((v, i) => `${(i / Math.max(1, n - 1)) * (W - 4) + 2},${H - 2 - (v / max) * (H - 4)}`);
    const solid = parcial ? pts.slice(0, -1) : pts;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${solid.join(" ")}" fill="none" stroke="var(--purple)" stroke-width="1.6"/>${parcial && n > 1 ? `<polyline points="${pts.slice(-2).join(" ")}" fill="none" stroke="#cbb6d6" stroke-width="1.6" stroke-dasharray="3 2"/>` : ""}</svg>`;
  };
  const trendPill = (t) => (t == null ? '<span class="muted">—</span>' : `<span class="pill ${t > 0.05 ? "ok" : t < -0.05 ? "bad" : "muted"}">${pct(t)}</span>`);

  function heat(A) {
    const T = A.tiendas, S = A.skus.slice(0, 14);
    const cell = {}; T.forEach((t) => t.filas.forEach((f) => (cell[t.k + "|" + f.sku] = f)));
    const val = (t, s) => { const f = cell[t.k + "|" + s.k]; return f && A.full.length ? sum(A.full.map((k) => f.m[k])) / A.full.length : null; };
    return `<div class="table-wrap"><table class="ind-table heat"><thead><tr><th>Tienda</th>${S.map((s) => `<th class="num" title="${esc(s.lbl)}">${esc(shortSku(s.lbl).replace(/^Pvc\s+/i, "").replace(/^Soldadura Pvc\s+/i, "Sold. "))}</th>`).join("")}</tr></thead><tbody>
      ${T.map((t) => `<tr><td class="nowrap"><strong>${esc(t.k)}</strong></td>${S.map((s) => {
        const v = val(t, s); if (v == null) return '<td class="num muted">—</td>';
        const r = s.prom && T.length ? v / (s.prom / T.length) : 0; // vs. promedio de tienda para ese SKU
        const bg = r >= 1.3 ? "#74119e" : r >= 1.05 ? "#a46bc0" : r >= 0.8 ? "#dcc8e7" : r >= 0.5 ? "#f3e8f8" : "#fdecec";
        return `<td class="num" style="background:${bg};color:${r >= 1.05 ? "#fff" : "inherit"}" title="${esc(t.k)} · ${esc(s.lbl)}: ${v.toFixed(1)} u./mes (${pct(r - 1)} vs. tienda promedio)">${v < 10 ? v.toFixed(1) : fmt(v)}</td>`;
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
    const A = analyze(C.datos);
    const lastLbl = A.lastFull != null ? A.meses[A.lastFull].lbl : "—";
    const nAv = A.av.length, avLbl = nAv ? A.av[nAv - 1].lbl : "";
    const avTot = nAv ? A.avTot[nAv - 1] : null;
    const { act, ctrl } = A.actVs;

    el.innerHTML = `
      <div class="kpis">
        <div class="card kpi accent"><div class="lbl">Venta acumulada</div><div class="val">${fmt(A.totFull)}</div><div class="sub">unidades · ${A.full.length} meses completos ${C.datos.anio}</div></div>
        <div class="card kpi"><div class="lbl">Promedio mensual</div><div class="val">${fmt(A.prom)}</div><div class="sub">${lastLbl}: ${fmt(A.lastFull != null ? A.totMes[A.lastFull] : null)} u. <span class="${A.lastFull != null && A.totMes[A.lastFull] >= A.prom ? "up" : "down"}">${A.lastFull != null ? pct(A.totMes[A.lastFull] / A.prom - 1) : ""}</span></div></div>
        <div class="card kpi"><div class="lbl">Tendencia 3 meses</div><div class="val ${A.trendTot != null && A.trendTot < 0 ? "" : ""}">${pct(A.trendTot)}</div><div class="sub">últimos 3 vs. 3 anteriores</div></div>
        <div class="card kpi warn"><div class="lbl">${nAv ? "Avance " + esc(avLbl) : "Tiendas"}</div><div class="val">${nAv ? fmt(avTot) : A.tiendas.length}</div><div class="sub">${nAv ? `${pct(A.prom ? avTot / A.prom : null, false)} de un mes promedio` : "con venta"}</div></div>
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
        <div class="panel-head"><h3>Resumen del análisis</h3><span class="muted">${esc(C.archivo)} · ${esc(C.periodo || "")}${st.alcance || st.tienda ? " · filtrado" : ""}</span></div>
        <ul style="margin:0;padding-left:18px;line-height:1.55;font-size:14px">${insights(A).map((x) => `<li style="margin-bottom:6px">${x}</li>`).join("")}</ul>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Venta mensual (unidades)</h3><span class="muted">* mes parcial · línea = promedio de meses completos</span></div>
        ${chartMeses(A)}
      </div>

      ${nAv && act.n && ctrl.n && !st.tienda ? `<div class="card panel">
        <div class="panel-head"><h3>Activación vs. tiendas sin activación</h3><span class="muted">Avance del mes como % de su venta mensual promedio</span></div>
        <div class="bars wide">${A.av.map((a, i) => [["Con activación (" + act.n + ")", act, i], ["Sin activación (" + ctrl.n + ")", ctrl, i]].map(([n, g]) => { const r = g.prom ? g.av[i] / g.prom : 0; return `<div class="bar-row"><span class="name">${esc(a.lbl)} · ${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, r * 100)}%;${g === ctrl ? "background:#a46bc0" : ""}"></div></div><span class="n">${pct(r, false)}</span></div>`; }).join("")).join("")}</div>
        <p class="small muted" style="margin:10px 0 0">Promedio mensual: con activación ${fmt(act.prom)} u. · sin activación ${fmt(ctrl.prom)} u. Tendencia 3m: ${pct(act.trend)} vs. ${pct(ctrl.trend)}. La comparación es válida solo si ambos avances tienen la misma fecha de corte.</p>
      </div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>Ranking de tiendas</h3><span class="muted">Meses completos · tendencia = últimos 3 vs. 3 anteriores</span></div>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>Tienda</th><th class="num">Total</th><th class="num">Prom./mes</th><th class="num">${esc(lastLbl)}</th><th class="num">vs. prom.</th><th class="num">Tendencia</th><th>Participación</th>${A.av.map((a) => `<th class="num">Avance ${esc(a.lbl.slice(0, 3))}</th>`).join("")}<th>Evolución</th></tr></thead><tbody>
          ${A.tiendas.map((t) => `<tr><td><strong>${esc(t.lbl)}</strong>${t.act ? ' <span class="pill ok">activación</span>' : ""}</td><td class="num"><b>${fmt(t.tot)}</b></td><td class="num">${fmt(t.prom)}</td><td class="num">${fmt(t.last)}</td><td class="num">${trendPill(t.vsProm)}</td><td class="num">${trendPill(t.trend)}</td>
            <td style="min-width:110px"><div class="bar-track"><div class="bar-fill" style="width:${(t.share / (A.tiendas[0].share || 1)) * 100}%"></div></div><span class="small muted">${pct(t.share, false)}</span></td>
            ${t.a.map((v, i) => `<td class="num">${fmt(v)}<div class="small muted">${pct(t.avPct[i], false)}</div></td>`).join("")}<td>${spark(t.m, A.meses[A.meses.length - 1].parcial)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Mix de SKUs</h3><span class="muted">Participación en unidades · tendencia 3 meses</span></div>
        <div class="table-wrap"><table class="ind-table"><thead><tr><th>SKU</th><th>Producto</th><th class="num">Total</th><th class="num">Prom./mes</th><th>Participación</th><th class="num">Tendencia</th>${A.av.map((a) => `<th class="num">Avance ${esc(a.lbl.slice(0, 3))}</th>`).join("")}</tr></thead><tbody>
          ${A.skus.map((s) => `<tr><td class="small muted">${esc(s.k)}</td><td><strong>${esc(s.lbl)}</strong></td><td class="num"><b>${fmt(s.tot)}</b></td><td class="num">${fmt(s.prom)}</td>
            <td style="min-width:120px"><div class="bar-track"><div class="bar-fill" style="width:${(s.share / (A.skus[0].share || 1)) * 100}%"></div></div><span class="small muted">${pct(s.share, false)}</span></td><td class="num">${trendPill(s.trend)}</td>${s.a.map((v) => `<td class="num">${fmt(v)}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
      </div>

      ${A.tiendas.length > 1 ? `<div class="card panel">
        <div class="panel-head"><h3>Mapa tienda × SKU</h3><span class="muted">Unidades promedio por mes · color vs. la tienda promedio en ese SKU (morado = sobre el promedio, rojo claro = muy por debajo)</span></div>
        ${heat(A)}
      </div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>Posibles quiebres de venta</h3><span class="muted">Tienda × SKU sin venta en alguno de los últimos 3 meses completos</span></div>
        ${A.quiebres.length ? `<div class="table-wrap"><table class="ind-table"><thead><tr><th>Tienda</th><th>Producto</th><th class="num">Prom./mes</th><th>Meses en cero</th></tr></thead><tbody>
          ${A.quiebres.slice(0, 25).map((q) => `<tr><td>${esc(q.f.t)}</td><td>${esc(q.f.d)}</td><td class="num">${q.prom.toFixed(1)}</td><td>${q.ceros.map((c) => `<span class="pill bad">${c}</span>`).join(" ")}</td></tr>`).join("")}
        </tbody></table></div>${A.quiebres.length > 25 ? `<p class="small muted">… y ${A.quiebres.length - 25} más (ver CSV).</p>` : ""}` : '<div class="empty">Sin meses en cero en los últimos 3 meses.</div>'}
      </div>`;

    const $ = (id) => el.querySelector("#" + id);
    $("tCarga").onchange = (e) => { st.carga = e.target.value; st.tienda = ""; render(); };
    $("tAlc").onchange = (e) => { st.alcance = e.target.value; st.tienda = ""; render(); };
    $("tTienda").onchange = (e) => { st.tienda = e.target.value; render(); };
    $("tReload").onclick = () => reload();
    $("tCsv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const D = C.datos;
      const head = ["Cod. tienda", "Tienda", "Activación", "SKU", "Cod. Afix", "Producto", ...D.meses.map((m) => m.lbl + (m.parcial ? " (parcial)" : "")), "Prom. meses completos", ...(D.avance || []).map((a) => "Avance " + a.lbl)];
      const lines = D.filas.map((f) => [f.ct, f.t, enActivacion(f.t) ? "Sí" : "No", f.sku, f.cod, f.d, ...f.m, A.full.length ? (sum(A.full.map((k) => f.m[k])) / A.full.length).toFixed(1).replace(".", ",") : "", ...f.a].map(q).join(";"));
      const csv = "﻿" + head.map(q).join(";") + "\n" + lines.join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `ventas_sodimac_${(C.periodo || "").replace(/[^\w]+/g, "_")}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  window.TiendasAdmin = {
    mount(c) { el = c; listeners.add(render); },
    async show() { render(); await ensure(); },
    _parseSheet: parseSheet, _analyze: analyze, _insights: insights, // para pruebas
  };
})();
