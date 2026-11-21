// =====================================================================
//  Pestaña Precios competencia (admin) · comparativo por fin de semana
// =====================================================================
(function () {
  const CFG = window.APP_CONFIG, PC = CFG.PRECIOS || {};
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (n == null || !isFinite(n) ? "—" : "S/ " + Number(n).toFixed(2));
  const pct = (n) => (isFinite(n) ? (n > 0 ? "+" : "") + Math.round(n * 100) + "%" : "—");
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const D = (k) => new Date(String(k).slice(0, 10) + "T12:00:00");
  const key = (d) => d.toISOString().slice(0, 10);
  const weekOf = (k) => { const d = D(k); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return key(d); }; // lunes
  const weekLabel = (wk) => { const s = D(wk), sat = new Date(s), sun = new Date(s); sat.setDate(s.getDate() + 5); sun.setDate(s.getDate() + 6); return `Fin de semana ${sat.getDate()}–${sun.getDate()} ${MES[sun.getMonth()]} ${sun.getFullYear()}`; };
  const fd = (k) => { const d = D(k); return `${["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`; };
  const norm = (m) => String(m || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  let el = null, rows = [], loaded = false, loading = false, err = "";
  let st = { wk: null, tienda: "" };

  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const eff = (r) => (r.precio_promo != null ? Number(r.precio_promo) : r.precio_regular != null ? Number(r.precio_regular) : null);

  function compute() {
    const R = rows.map((r) => ({ ...r, marcaN: norm(r.marca), wk: weekOf(r.fecha) }));
    const weeks = [...new Set(R.map((r) => r.wk))].sort().reverse();
    if (!st.wk || !weeks.includes(st.wk)) st.wk = weeks[0] || weekOf(key(new Date()));
    const prevWk = (() => { const d = D(st.wk); d.setDate(d.getDate() - 7); return key(d); })();
    const inW = (wk) => R.filter((r) => r.wk === wk && (!st.tienda || r.tienda === st.tienda));
    const W = inW(st.wk), P = inW(prevWk);

    const marcas = [...new Set(W.map((r) => r.marcaN))].sort((a, b) => (a === "Afix" ? -1 : b === "Afix" ? 1 : a.localeCompare(b, "es")));
    const skus = [...new Set([...(PC.SKUS || []), ...W.map((r) => r.sku)])];

    // Por SKU × marca: promedio del precio efectivo (oferta si hay, si no regular), entre tiendas
    // Precio atípico (con 3+ tiendas): más de 3 veces o menos de un tercio de la mediana del SKU
    // → probable error de digitación; se muestra marcado y no entra al promedio.
    function agg(list, sku, marca) {
      const all = list.filter((r) => r.sku === sku && r.marcaN === marca);
      const xs = all.filter((r) => r.disponible !== false && eff(r) != null).map((r) => ({ ...r, ef: eff(r) }));
      const ref = median(xs.map((x) => x.ef));
      xs.forEach((r) => { r.ref = ref; r.atipico = xs.length >= 3 && ref > 0 && (r.ef / ref > 3 || r.ef / ref < 1 / 3); });
      const ok = xs.filter((r) => !r.atipico), ef = (ok.length ? ok : xs).map((r) => r.ef);
      const top = ok.length ? ok.reduce((a, b) => (b.ef > a.ef ? b : a)) : null;
      return { n: ef.length, avg: ef.length ? ef.reduce((a, b) => a + b, 0) / ef.length : null, min: ef.length ? Math.min(...ef) : null, max: ef.length ? Math.max(...ef) : null,
        promo: xs.some((r) => r.promo_tipo || r.precio_promo != null), na: all.filter((r) => r.disponible === false).length, rows: all, atipicos: xs.filter((r) => r.atipico), top };
    }
    const matrix = skus.map((sku) => {
      const cells = marcas.map((m) => ({ m, ...agg(W, sku, m), prev: agg(P, sku, m).avg }));
      const afix = cells.find((c) => c.m === "Afix");
      const comp = cells.filter((c) => c.m !== "Afix" && c.avg != null);
      const minComp = comp.length ? Math.min(...comp.map((c) => c.avg)) : null;
      const allAvg = cells.filter((c) => c.avg != null).map((c) => c.avg);
      return { sku, cells, best: allAvg.length > 1 ? Math.min(...allAvg) : null, brecha: afix && afix.avg != null && minComp != null ? (afix.avg - minComp) / minComp : null };
    }).filter((r) => r.cells.some((c) => c.n || c.na));

    const promos = W.filter((r) => r.promo_tipo || r.precio_promo != null || (r.comentario && /\d\s*x\s*\d|%|promo|oferta|regalo/i.test(r.comentario)))
      .sort((a, b) => a.marcaN.localeCompare(b.marcaN, "es") || a.sku.localeCompare(b.sku, "es"));

    const visitas = Object.values(R.filter((r) => r.wk === st.wk).reduce((acc, r) => {
      const v = acc[r.visita_id] = acc[r.visita_id] || { id: r.visita_id, fecha: r.fecha, tienda: r.tienda, promotora: r.promotora, marca: r.marcaN, n: 0, t: r.created_at };
      v.n++; return acc;
    }, {})).sort((a, b) => String(b.t).localeCompare(String(a.t)));

    const tiendasCfg = (CFG.TIENDAS || []).map((t) => (typeof t === "string" ? t : t.tienda));
    const tiendasRel = new Set(R.filter((r) => r.wk === st.wk).map((r) => r.tienda));
    return { weeks, W, marcas, matrix, promos, visitas, tiendasCfg, tiendasRel, prevWk, comp: marcas.filter((m) => m !== "Afix") };
  }

  function render() {
    if (!el) return;
    if (!loaded) { el.innerHTML = `<div class="card panel" style="margin-top:-36px"><div class="empty">${loading ? "Cargando precios…" : esc(err)}</div></div>`; return; }
    const m = compute();
    const conBrecha = m.matrix.filter((r) => r.brecha != null);
    const masCaro = conBrecha.filter((r) => r.brecha > 0.02).length, masBarato = conBrecha.filter((r) => r.brecha < -0.02).length;
    const tiendasOpt = [...new Set([...m.tiendasCfg, ...rows.map((r) => r.tienda)])];

    el.innerHTML = `
      <div class="kpis">
        <div class="card kpi accent"><div class="lbl">Relevamientos</div><div class="val">${m.visitas.length}</div><div class="sub">${esc(weekLabel(st.wk))}</div></div>
        <div class="card kpi"><div class="lbl">Tiendas relevadas</div><div class="val">${m.tiendasRel.size}<small> / ${m.tiendasCfg.length}</small></div><div class="sub">${m.tiendasCfg.length - [...m.tiendasRel].filter((t) => m.tiendasCfg.includes(t)).length} tiendas sin relevar</div></div>
        <div class="card kpi"><div class="lbl">Marcas competidoras</div><div class="val">${m.comp.length}</div><div class="sub">${esc(m.comp.slice(0, 4).join(" · ") || "—")}</div></div>
        <div class="card kpi warn"><div class="lbl">Promociones detectadas</div><div class="val">${m.promos.length}</div><div class="sub">SKUs con oferta o promoción</div></div>
      </div>

      <div class="card panel ind-toolbar">
        <div class="field"><label for="pWk">Semana</label><select id="pWk">${(m.weeks.length ? m.weeks : [st.wk]).map((w) => `<option value="${w}"${w === st.wk ? " selected" : ""}>${esc(weekLabel(w))}</option>`).join("")}</select></div>
        <div class="field"><label for="pTienda">Tienda</label><select id="pTienda"><option value="">Todas</option>${tiendasOpt.map((t) => `<option${t === st.tienda ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="pVentas" title="Subir el Excel mensual de venta Sodimac por SKU y tienda">📥 Cargar ventas por SKU</button>
        <button class="btn btn-ghost" id="pReload">Actualizar</button>
        <button class="btn btn-primary" id="pCsv">Exportar precios (CSV)</button>
      </div>

      ${(() => { const at = m.matrix.flatMap((r, ri) => r.cells.flatMap((c, ci) => c.atipicos.map((x) => ({ x, ri, ci, sku: r.sku })))); return at.length ? `<div class="alerts"><div class="alert-item bad"><b>⚠ ${at.length} precio${at.length === 1 ? "" : "s"} atípico${at.length === 1 ? "" : "s"} (probable error de digitación, no entra${at.length === 1 ? "" : "n"} al promedio):</b><span>${at.map((a) => `<a href="#" class="lnk" data-cell="${a.ri}|${a.ci}">${esc(a.x.marcaN)} ${esc(a.sku.replace(/^Pegamento\s+/i, ""))}: <b>${money(a.x.ef)}</b> en ${esc(a.x.tienda.replace(/^Sodimac\s+/i, ""))} (${esc(a.x.promotora)}, ${esc(fd(a.x.fecha))})</a>`).join(" · ")}</span></div></div>` : ""; })()}
      ${conBrecha.length ? `<div class="alerts"><div class="alert-item ${masCaro > masBarato ? "bad" : "info"}"><b>Afix vs. la competencia más barata:</b><span>Afix está más caro en ${masCaro} SKU${masCaro === 1 ? "" : "s"}, más barato en ${masBarato} y a la par en ${conBrecha.length - masCaro - masBarato} (precio efectivo promedio, con oferta si la hay).</span></div></div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>Comparativo de precios por SKU</h3><span class="muted">Precio efectivo promedio entre tiendas (oferta si hay; si no, regular) · ▲▼ vs. semana anterior · verde = más barato</span></div>
        ${m.matrix.length ? `<div class="table-wrap"><table class="ind-table price-table">
          <thead><tr><th>SKU</th>${m.marcas.map((x) => `<th class="num">${esc(x)}</th>`).join("")}<th class="num">Afix vs. más barato</th></tr></thead>
          <tbody>${m.matrix.map((r, ri) => `<tr><td><strong>${esc(r.sku.replace(/^Pegamento\s+/i, ""))}</strong></td>${r.cells.map((c, ci) => {
            if (!c.n) return c.na ? `<td class="num muted clk" data-cell="${ri}|${ci}" title="Ver tiendas"><span class="pill neu">No hay</span></td>` : `<td class="num muted">—</td>`;
            const d = c.prev != null && c.avg != null ? (c.avg - c.prev) / c.prev : null;
            return `<td class="num clk ${r.best != null && Math.abs(c.avg - r.best) < 0.005 ? "cheap" : ""}" data-cell="${ri}|${ci}" title="Clic para ver el precio de cada tienda"><b>${money(c.avg)}</b>${c.promo ? ' <span class="pill warn">promo</span>' : ""}${c.atipicos.length ? ` <span class="pill bad" title="Precio atípico excluido del promedio">⚠ ${c.atipicos.length}</span>` : ""}
              <div class="small muted">${c.n > 1 ? `${money(c.min)}–${money(c.max)} · ${c.n} tiendas` : "1 tienda"}${c.n > 1 && c.top ? ` · más alto: ${esc(c.top.tienda.replace(/^Sodimac\s+/i, ""))}` : ""}${d != null && Math.abs(d) >= 0.01 ? ` · <span class="${d > 0 ? "up-r" : "down-g"}">${d > 0 ? "▲" : "▼"}${Math.abs(Math.round(d * 100))}%</span>` : ""}</div></td>`;
          }).join("")}<td class="num">${r.brecha == null ? '<span class="muted">—</span>' : `<span class="pill ${r.brecha > 0.02 ? "bad" : r.brecha < -0.02 ? "ok" : "neu"}">${pct(r.brecha)}</span>`}</td></tr>`).join("")}</tbody>
        </table></div>` : `<div class="empty">Aún no hay precios registrados para esta semana. Las promotoras los cargan en la pestaña 💲 Precios del formulario.</div>`}
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Promociones de la competencia</h3><span class="muted">${esc(weekLabel(st.wk))}</span></div>
        ${m.promos.length ? `<div class="table-wrap"><table class="ind-table"><thead><tr><th>Marca</th><th>SKU</th><th>Promoción</th><th class="num">Regular</th><th class="num">Oferta</th><th>Tienda</th><th>Comentario</th><th>Fecha</th></tr></thead><tbody>
          ${m.promos.map((r) => `<tr><td><strong>${esc(r.marcaN)}</strong></td><td>${esc(r.sku.replace(/^Pegamento\s+/i, ""))}</td><td>${r.promo_tipo ? `<span class="pill warn">${esc(r.promo_tipo)}</span>` : "—"}</td><td class="num">${money(r.precio_regular)}</td><td class="num"><b>${money(r.precio_promo)}</b></td><td class="small">${esc(r.tienda.replace(/^Sodimac\s+/i, ""))}</td><td class="muted">${esc(r.comentario || "")}</td><td class="nowrap small">${esc(fd(r.fecha))}</td></tr>`).join("")}
        </tbody></table></div>` : '<div class="empty">Sin promociones registradas esta semana.</div>'}
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Relevamientos de la semana</h3><span class="muted">Una fila por marca registrada en una tienda</span></div>
        ${m.visitas.length ? `<div class="table-wrap"><table class="ind-table"><thead><tr><th>Fecha</th><th>Tienda</th><th>Promotora</th><th>Marca</th><th class="num">SKUs</th><th></th></tr></thead><tbody>
          ${m.visitas.map((v) => `<tr><td class="nowrap">${esc(fd(v.fecha))}</td><td>${esc(v.tienda)}</td><td>${esc(v.promotora)}</td><td><strong>${esc(v.marca)}</strong></td><td class="num">${v.n}</td>
            <td><button class="icon-btn" data-vdel="${esc(v.id)}" title="Eliminar este relevamiento"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button></td></tr>`).join("")}
        </tbody></table></div>` : '<div class="empty">Sin relevamientos esta semana.</div>'}
        ${m.tiendasCfg.filter((t) => !m.tiendasRel.has(t)).length ? `<p class="small muted" style="margin:10px 0 0"><b>Sin relevar:</b> ${esc(m.tiendasCfg.filter((t) => !m.tiendasRel.has(t)).map((t) => t.replace(/^Sodimac\s+/i, "")).join(" · "))}</p>` : ""}
      </div>`;

    const $ = (id) => el.querySelector("#" + id);
    $("pWk").onchange = (e) => { st.wk = e.target.value; render(); };
    $("pTienda").onchange = (e) => { st.tienda = e.target.value; render(); };
    $("pReload").onclick = () => reload();
    el.querySelectorAll("[data-cell]").forEach((x) => (x.onclick = (e) => { e.preventDefault(); const [ri, ci] = x.dataset.cell.split("|").map(Number); openCell(m.matrix[ri], m.matrix[ri].cells[ci]); }));
    $("pVentas").onclick = () => { const c = document.getElementById("ventasCard"); c?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("vFile")?.click(); };
    el.querySelectorAll("[data-vdel]").forEach((b) => (b.onclick = async () => {
      const v = m.visitas.find((x) => x.id === b.dataset.vdel);
      if (!v || !confirm(`¿Eliminar el relevamiento de ${v.marca} en ${v.tienda} (${fd(v.fecha)}, ${v.n} SKUs)?`)) return;
      try { await API.deleteVisita(v.id); await reload(); } catch (e) { alert("No se pudo eliminar: " + e.message); }
    }));
    $("pCsv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["Fecha", "Semana (lunes)", "Tienda", "Promotora", "Marca", "SKU", "Disponible", "Precio regular", "Precio oferta", "Precio efectivo", "Promoción", "Comentario"];
      const data = rows.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      const lines = data.map((r) => [String(r.fecha).slice(0, 10), weekOf(r.fecha), r.tienda, r.promotora, norm(r.marca), r.sku, r.disponible === false ? "No" : "Sí",
        r.precio_regular ?? "", r.precio_promo ?? "", eff(r) ?? "", r.promo_tipo || "", r.comentario || ""].map(q).join(";"));
      const csv = "﻿" + head.map(q).join(";") + "\n" + lines.join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `precios_competencia_${key(new Date())}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  // ---------- Pop-up: precio de cada tienda para un SKU × marca ----------
  function openCell(r, c) {
    let box = document.getElementById("pModal");
    if (!box) {
      box = document.createElement("div"); box.id = "pModal"; box.className = "pmodal hidden";
      document.body.appendChild(box);
      box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("[data-close]")) box.classList.add("hidden"); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") box.classList.add("hidden"); });
    }
    const list = c.rows.slice().sort((a, b) => (eff(b) ?? -1) - (eff(a) ?? -1));
    const at = new Set(c.atipicos.map((x) => x.id)), refOf = Object.fromEntries(c.atipicos.map((x) => [x.id, x.ref]));
    const vals = list.filter((x) => x.disponible !== false && eff(x) != null && !at.has(x.id)).map(eff);
    let hi = vals.length > 1 ? Math.max(...vals) : null, lo = vals.length > 1 ? Math.min(...vals) : null;
    if (hi != null && hi - lo < 0.005) hi = lo = null; // todas iguales: no hay más alto ni más bajo
    box.innerHTML = `<div class="pmodal-card" role="dialog" aria-modal="true" aria-label="Precios por tienda">
      <div class="pmodal-head"><div><div class="small muted">${esc(weekLabel(st.wk))}${st.tienda ? " · " + esc(st.tienda) : ""}</div><h3>${esc(c.m)} · ${esc(r.sku.replace(/^Pegamento\s+/i, ""))}</h3>
        <div class="small muted">Promedio ${money(c.avg)}${hi != null ? ` · rango ${money(lo)}–${money(hi)} · diferencia ${money(hi - lo)} (${Math.round((hi / lo - 1) * 100)}%)` : ""}</div></div>
        <button class="icon-btn" data-close title="Cerrar">✕</button></div>
      <div class="table-wrap"><table class="ind-table pm-table"><thead><tr><th>Tienda</th><th>Promotora</th><th>Fecha</th><th class="num">Regular</th><th class="num">Oferta</th><th class="num">Efectivo</th><th>Observación</th><th></th></tr></thead><tbody>
        ${list.map((x) => { const v = eff(x), a = at.has(x.id), isHi = !a && hi != null && v === hi, isLo = !a && lo != null && v === lo;
          return `<tr class="${a ? "row-bad" : isHi ? "row-hi" : ""}"><td class="pm-t"><strong>${esc(x.tienda)}</strong></td><td data-l="Promotora">${esc(x.promotora)}</td><td class="nowrap" data-l="Fecha">${esc(fd(x.fecha))}</td>
            <td class="num" data-l="Regular">${money(x.precio_regular)}</td><td class="num" data-l="Oferta">${money(x.precio_promo)}</td><td class="num pm-ef" data-l="Efectivo"><b>${x.disponible === false ? '<span class="pill neu">No hay</span>' : money(v)}</b></td>
            <td class="pm-obs">${a ? `<span class="pill bad">⚠ atípico: ${v > refOf[x.id] ? Math.round(v / refOf[x.id]) + "× la" : "muy por debajo de la"} mediana (${money(refOf[x.id])})</span>` : isHi ? '<span class="pill warn">▲ precio más alto</span>' : isLo ? '<span class="pill ok">▼ precio más bajo</span>' : ""}${x.promo_tipo ? ` <span class="pill warn">${esc(x.promo_tipo)}</span>` : ""}${x.comentario ? `<div class="small muted">${esc(x.comentario)}</div>` : ""}${x.editado_at ? `<div class="small" style="color:var(--purple)">✎ Corregido por ${esc(x.editado_por || "admin")} el ${esc(fd(String(x.editado_at).slice(0, 10)))}${x.valor_original ? ` · antes: ${x.valor_original.disponible === false ? "No hay" : money(x.valor_original.precio_promo ?? x.valor_original.precio_regular)}` : ""}</div>` : ""}</td>
            <td class="pm-del nowrap"><button class="icon-btn" data-pedit="${esc(x.id)}" title="Corregir este precio"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="icon-btn" data-pdel="${esc(x.id)}" title="Eliminar este precio (si fue un error)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button></td></tr>`; }).join("")}
      </tbody></table></div>
      <div id="pmEdit"></div>
      <p class="small muted" style="margin:10px 0 0">Efectivo = oferta si la hay; si no, regular. Un precio atípico (más de 3 veces o menos de un tercio de la mediana, cuando hay 3 o más tiendas) se excluye del promedio. Si es un error, corrígelo con el lápiz (queda registrado quién lo cambió y el valor original) o elimínalo.</p>
    </div>`;
    box.querySelectorAll("[data-pedit]").forEach((b) => (b.onclick = () => {
      const x = list.find((y) => y.id === b.dataset.pedit); if (!x) return;
      const ed = box.querySelector("#pmEdit");
      ed.innerHTML = `<div class="pm-form"><div class="pm-form-h">Corregir precio · <b>${esc(x.tienda)}</b> <span class="muted">(${esc(x.promotora)}, ${esc(fd(x.fecha))})</span></div>
        <div class="ind-toolbar">
          <div class="field"><label for="peReg">Precio regular (S/)</label><input id="peReg" type="number" inputmode="decimal" min="0" step="0.01" value="${x.precio_regular ?? ""}" /></div>
          <div class="field"><label for="peOf">Precio oferta (S/)</label><input id="peOf" type="number" inputmode="decimal" min="0" step="0.01" value="${x.precio_promo ?? ""}" placeholder="Sin oferta" /></div>
          <div class="field"><label><input id="peNa" type="checkbox"${x.disponible === false ? " checked" : ""}/> No hay en góndola</label></div>
          <div class="spacer"></div>
          <button class="btn btn-ghost" id="peCancel">Cancelar</button><button class="btn btn-primary" id="peSave">Guardar corrección</button>
        </div><div id="peMsg" class="small" style="color:var(--coral);margin-top:6px"></div></div>`;
      ed.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const g = (id) => ed.querySelector("#" + id);
      g("peCancel").onclick = () => (ed.innerHTML = "");
      g("peSave").onclick = async () => {
        const na = g("peNa").checked, reg = g("peReg").value === "" ? null : Number(g("peReg").value), of = g("peOf").value === "" ? null : Number(g("peOf").value);
        if (!na && (reg == null || !(reg > 0))) return (g("peMsg").textContent = "Ingresa un precio regular mayor a 0, o marca «No hay en góndola».");
        if (of != null && !(of > 0)) return (g("peMsg").textContent = "La oferta debe ser mayor a 0 (o déjala vacía).");
        if (!na && of != null && of >= reg) return (g("peMsg").textContent = "La oferta debe ser menor que el precio regular.");
        const antes = x.disponible === false ? "No hay" : money(eff(x)), despues = na ? "No hay" : money(of ?? reg);
        if (!confirm(`¿Corregir ${x.marcaN} ${x.sku} en ${x.tienda}?\n${antes} → ${despues}`)) return;
        g("peSave").disabled = true;
        try { await API.updatePrecio(x.id, na ? { disponible: false, precio_regular: null, precio_promo: null } : { disponible: true, precio_regular: reg, precio_promo: of }); await reload(); reopen(r.sku, c.m); }
        catch (e) { g("peMsg").textContent = "No se pudo guardar: " + e.message; g("peSave").disabled = false; }
      };
    }));
    box.querySelectorAll("[data-pdel]").forEach((b) => (b.onclick = async () => {
      const x = list.find((y) => y.id === b.dataset.pdel);
      if (!x || !confirm(`¿Eliminar el precio ${money(eff(x))} de ${x.marcaN} ${x.sku} en ${x.tienda} (${x.promotora}, ${fd(x.fecha)})?`)) return;
      try { await API.deletePrecio(x.id); box.classList.add("hidden"); await reload(); } catch (e) { alert("No se pudo eliminar: " + e.message); }
    }));
    box.classList.remove("hidden");
  }

  function reopen(sku, marca) {
    const m = compute(), r = m.matrix.find((x) => x.sku === sku), c = r && r.cells.find((x) => x.m === marca);
    if (r && c) openCell(r, c); else document.getElementById("pModal")?.classList.add("hidden");
  }

  async function reload() {
    loading = true; err = ""; render();
    try { rows = await API.listPrecios(); loaded = true; } catch (e) { err = "No se pudieron cargar los precios: " + e.message; }
    loading = false; render();
  }

  window.PreciosAdmin = {
    mount(c) { el = c; },
    async show() { if (!loaded && !loading) await reload(); else render(); },
  };
})();
