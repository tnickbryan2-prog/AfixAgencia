// =====================================================================
//  Pestaña Stock de premios · trazabilidad promotora ↔ cliente
//  Saldo = entregado a la promotora − devoluciones − entregado a clientes
// =====================================================================
(function () {
  const CFG = window.APP_CONFIG;
  const MIN = Number(CFG.STOCK_MINIMO ?? 5);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("es-PE");
  const pct = (n) => (isFinite(n) ? Math.round(n * 100) + "%" : "—");
  const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const fDate = (k) => { const [y, m, d] = String(k).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };

  const TIENDAS = (CFG.TIENDAS || []).map((t) => (typeof t === "string" ? { tienda: t, promotoras: [] } : t));
  const PROMOS_CFG = CFG.PROMOTORAS && CFG.PROMOTORAS.length ? CFG.PROMOTORAS : [...new Set(TIENDAS.flatMap((t) => t.promotoras || []))];

  let el = null, vouchers = [], movs = [], loaded = false, loading = false, err = "";
  let filt = { promotora: "", premio: "" };
  let draft = { fecha: todayKey(), tipo: "entrega", promotora: "", qty: {}, nota: "" };

  // "Lapicero + Adhesivo Gris 2 oz" descuenta ambos artículos; "Sin premio" no descuenta nada
  const SIN = CFG.SIN_PREMIO || "Sin premio (sigue intentando)";
  function components(premio) {
    if (!premio || premio === SIN) return [];
    return premio.split(" + ").map((x) => x.trim()).filter(Boolean);
  }
  function premiosList() {
    return [...new Set([...(CFG.PREMIOS || []), ...movs.map((m) => m.premio), ...vouchers.flatMap((v) => components(v.premio))])];
  }
  function promosList() {
    return [...new Set([...PROMOS_CFG, ...movs.map((m) => m.promotora), ...vouchers.filter((v) => components(v.premio).length).map((v) => v.promotora)])];
  }

  function compute() {
    const premios = premiosList(), promos = promosList();
    const cell = {};
    promos.forEach((p) => { cell[p] = {}; premios.forEach((z) => (cell[p][z] = { rec: 0, dev: 0, cli: 0 })); });
    movs.forEach((m) => {
      const c = cell[m.promotora] && cell[m.promotora][m.premio];
      if (!c) return;
      if (m.tipo === "devolucion") c.dev += m.cantidad; else c.rec += m.cantidad;
    });
    vouchers.forEach((v) => {
      components(v.premio).forEach((z) => {
        const c = cell[v.promotora] && cell[v.promotora][z];
        if (c) c.cli++;
      });
    });
    const tot = { rec: 0, dev: 0, cli: 0 };
    const byPremio = {};
    premios.forEach((z) => (byPremio[z] = { rec: 0, dev: 0, cli: 0 }));
    promos.forEach((p) => premios.forEach((z) => {
      const c = cell[p][z];
      c.saldo = c.rec - c.dev - c.cli;
      ["rec", "dev", "cli"].forEach((k) => { tot[k] += c[k]; byPremio[z][k] += c[k]; });
    }));
    tot.saldo = tot.rec - tot.dev - tot.cli;
    premios.forEach((z) => (byPremio[z].saldo = byPremio[z].rec - byPremio[z].dev - byPremio[z].cli));

    const neg = [], low = [];
    promos.forEach((p) => {
      const n = premios.filter((z) => cell[p][z].saldo < 0).map((z) => `${z} ${cell[p][z].saldo}`);
      const l = premios.filter((z) => cell[p][z].saldo >= 0 && cell[p][z].rec > 0 && cell[p][z].saldo <= MIN).map((z) => `${z}: ${cell[p][z].saldo}`);
      if (n.length) neg.push(`${p} (${n.join(", ")})`);
      if (l.length) low.push(`${p} (${l.join(", ")})`);
    });
    return { premios, promos, cell, tot, byPremio, neg, low };
  }

  function cellClass(c) {
    if (c.saldo < 0) return "neg";
    if (c.rec === 0 && c.cli === 0) return "empty";
    if (c.saldo <= MIN) return "low";
    return "okc";
  }

  function render() {
    if (!el) return;
    if (!loaded) {
      el.innerHTML = `<div class="card panel" style="margin-top:-36px"><div class="empty">${loading ? "Cargando stock…" : esc(err || "")}</div></div>`;
      return;
    }
    const m = compute();
    const promosOpts = m.promos.map((p) => `<option value="${esc(p)}"${p === draft.promotora ? " selected" : ""}>${esc(p)}</option>`).join("");
    const hist = movs.filter((r) => (!filt.promotora || r.promotora === filt.promotora) && (!filt.premio || r.premio === filt.premio));

    el.innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="lbl">Entregado a promotoras</div><div class="val">${fmtN(m.tot.rec - m.tot.dev)}</div>
          <div class="sub">${fmtN(m.tot.rec)} entregados${m.tot.dev ? ` · ${fmtN(m.tot.dev)} devueltos` : ""}</div></div>
        <div class="card kpi accent"><div class="lbl">Entregado a clientes</div><div class="val">${fmtN(m.tot.cli)}</div>
          <div class="sub">Según vouchers registrados</div></div>
        <div class="card kpi"><div class="lbl">Saldo en manos de promotoras</div><div class="val ${m.tot.saldo < 0 ? "neg-txt" : ""}">${fmtN(m.tot.saldo)}</div>
          <div class="sub">Premios que deberían tener hoy</div></div>
        <div class="card kpi"><div class="lbl">Uso del stock</div><div class="val">${pct(m.tot.cli / (m.tot.rec - m.tot.dev))}</div>
          <div class="sub">Entregado a clientes / recibido</div></div>
      </div>

      ${m.neg.length ? `<div class="alerts"><div class="alert-item bad"><b>${m.neg.length} promotora${m.neg.length > 1 ? "s" : ""} con saldo negativo (${m.neg.length > 1 ? "entregaron" : "entregó"} más de lo que ${m.neg.length > 1 ? "recibieron" : "recibió"})</b><span>${esc(m.neg.join(" · "))}. Falta registrar una entrega o hay un error en un voucher.</span></div></div>` : ""}
      ${m.low.length ? `<div class="alerts"><div class="alert-item warn"><b>Stock bajo (${MIN} o menos)</b><span>${esc(m.low.join(" · "))}</span></div></div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>Registrar movimiento de stock</h3><span class="muted">Anota cada entrega de premios a una promotora (o lo que te devuelve)</span></div>
        <div class="stock-form">
          <div class="field"><label for="sFecha">Fecha</label><input id="sFecha" type="date" value="${esc(draft.fecha)}" /></div>
          <div class="field"><label for="sTipo">Tipo</label>
            <select id="sTipo"><option value="entrega"${draft.tipo === "entrega" ? " selected" : ""}>Entrega a promotora</option><option value="devolucion"${draft.tipo === "devolucion" ? " selected" : ""}>Devolución de promotora</option></select></div>
          <div class="field"><label for="sPromo">Promotora</label>
            <select id="sPromo"><option value="">Selecciona…</option>${promosOpts}</select></div>
        </div>
        <div class="qty-grid">${m.premios.map((z, i) => `
          <div class="field"><label for="sq${i}">${esc(z)}</label>
            <input id="sq${i}" data-premio="${esc(z)}" class="sq" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${draft.qty[z] || ""}" /></div>`).join("")}
        </div>
        <div class="stock-form">
          <div class="field grow"><label for="sNota">Nota (opcional)</label><input id="sNota" maxlength="200" placeholder="Ej. Guía de remisión 001-234, entregado por Fuego" value="${esc(draft.nota)}" /></div>
          <div class="stock-save"><span class="muted" id="sMsg"></span><button class="btn btn-primary" id="sSave">Guardar movimiento</button></div>
        </div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Saldo por promotora</h3><span class="muted">Saldo = recibido − devuelto − entregado a clientes</span></div>
        <div class="table-wrap"><table class="ind-table stock-table">
          <thead><tr><th>Promotora</th>${m.premios.map((z) => `<th class="num">${esc(z)}</th>`).join("")}<th class="num">Total</th></tr></thead>
          <tbody>${m.promos.map((p) => {
            const rowT = { rec: 0, dev: 0, cli: 0, saldo: 0 };
            const cells = m.premios.map((z) => {
              const c = m.cell[p][z]; ["rec", "dev", "cli", "saldo"].forEach((k) => (rowT[k] += c[k]));
              return `<td class="num ${cellClass(c)}"><div class="saldo">${c.saldo}</div><div class="det">rec. ${c.rec - c.dev} · cli. ${c.cli}</div></td>`;
            }).join("");
            const tiendasP = [...new Set(vouchers.filter((v) => v.promotora === p).map((v) => v.tienda.replace(/^Sodimac\s+/i, "")))];
            return `<tr><td><strong>${esc(p)}</strong>${tiendasP.length ? `<div class="muted small">${esc(tiendasP.join(" · "))}</div>` : ""}</td>${cells}
              <td class="num ${rowT.saldo < 0 ? "neg" : ""}"><div class="saldo">${rowT.saldo}</div><div class="det">rec. ${rowT.rec - rowT.dev} · cli. ${rowT.cli}</div></td></tr>`;
          }).join("")}
            <tr class="total-row"><td><strong>Total</strong></td>${m.premios.map((z) => { const b = m.byPremio[z]; return `<td class="num"><div class="saldo">${b.saldo}</div><div class="det">rec. ${b.rec - b.dev} · cli. ${b.cli}</div></td>`; }).join("")}
              <td class="num"><div class="saldo">${m.tot.saldo}</div><div class="det">rec. ${m.tot.rec - m.tot.dev} · cli. ${m.tot.cli}</div></td></tr>
          </tbody>
        </table></div>
        <div class="legend"><span><i class="sw st-ok"></i>Con stock</span><span><i class="sw st-low"></i>Stock bajo (≤ ${MIN})</span><span><i class="sw st-neg"></i>Saldo negativo</span></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Historial de movimientos</h3><span class="muted">${hist.length} de ${movs.length} movimientos</span></div>
        <div class="toolbar">
          <div class="field"><label for="hPromo">Promotora</label><select id="hPromo"><option value="">Todas</option>${m.promos.map((p) => `<option${p === filt.promotora ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
          <div class="field"><label for="hPremio">Premio</label><select id="hPremio"><option value="">Todos</option>${m.premios.map((z) => `<option${z === filt.premio ? " selected" : ""}>${esc(z)}</option>`).join("")}</select></div>
          <div class="grow"></div>
          <button class="btn btn-ghost" id="sReload">Actualizar</button>
          <button class="btn btn-primary" id="sCsv">Exportar stock (CSV)</button>
        </div>
        <div class="table-wrap"><table class="ind-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Promotora</th><th>Premio</th><th class="num">Cantidad</th><th>Nota</th><th>Registrado por</th><th></th></tr></thead>
          <tbody>${hist.length ? hist.map((r) => `<tr>
              <td class="nowrap">${esc(fDate(r.fecha))}</td>
              <td><span class="pill ${r.tipo === "devolucion" ? "warn" : "ok"}">${r.tipo === "devolucion" ? "Devolución" : "Entrega"}</span></td>
              <td>${esc(r.promotora)}</td><td>${esc(r.premio)}</td>
              <td class="num"><b>${r.tipo === "devolucion" ? "−" : "+"}${fmtN(r.cantidad)}</b></td>
              <td class="muted">${esc(r.nota || "")}</td>
              <td class="muted small">${esc(r.registrado_por || "")}</td>
              <td><button class="icon-btn" data-sdel="${esc(r.id)}" title="Eliminar movimiento">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button></td>
            </tr>`).join("") : `<tr><td colspan="8" class="empty">Aún no hay movimientos registrados. Usa el formulario de arriba para anotar la primera entrega de premios.</td></tr>`}</tbody>
        </table></div>
      </div>`;
    bind(m);
  }

  function bind(m) {
    const $ = (id) => el.querySelector("#" + id);
    const keep = () => {
      draft.fecha = $("sFecha").value; draft.tipo = $("sTipo").value; draft.promotora = $("sPromo").value; draft.nota = $("sNota").value;
      el.querySelectorAll(".sq").forEach((i) => (draft.qty[i.dataset.premio] = i.value));
    };
    ["sFecha", "sTipo", "sPromo", "sNota"].forEach((id) => $(id).addEventListener("change", keep));
    el.querySelectorAll(".sq").forEach((i) => i.addEventListener("input", keep));

    $("sSave").onclick = async () => {
      keep();
      const msg = $("sMsg");
      const items = Object.entries(draft.qty)
        .map(([premio, v]) => ({ premio, cantidad: parseInt(v, 10) || 0 }))
        .filter((x) => x.cantidad > 0)
        .map((x) => ({ ...x, fecha: draft.fecha || todayKey(), tipo: draft.tipo, promotora: draft.promotora, nota: draft.nota.trim() || null }));
      if (!draft.promotora) { msg.textContent = "Selecciona la promotora."; return; }
      if (!items.length) { msg.textContent = "Ingresa al menos una cantidad."; return; }
      const resumen = items.map((i) => `${i.cantidad} ${i.premio}`).join(", ");
      if (!confirm(`${draft.tipo === "devolucion" ? "Devolución de" : "Entrega a"} ${draft.promotora} (${fDate(draft.fecha)}):\n${resumen}\n\n¿Registrar?`)) return;
      $("sSave").disabled = true; msg.textContent = "Guardando…";
      try {
        await API.addStock(items);
        draft = { fecha: draft.fecha, tipo: "entrega", promotora: draft.promotora, qty: {}, nota: "" };
        await reload();
        const m2 = el.querySelector("#sMsg"); if (m2) m2.textContent = `✓ Registrado: ${resumen}`;
      } catch (e) {
        msg.textContent = "No se pudo guardar: " + e.message;
        $("sSave").disabled = false;
      }
    };

    $("hPromo").onchange = (e) => { filt.promotora = e.target.value; render(); };
    $("hPremio").onchange = (e) => { filt.premio = e.target.value; render(); };
    $("sReload").onclick = () => reload();
    el.querySelectorAll("[data-sdel]").forEach((b) => (b.onclick = async () => {
      const r = movs.find((x) => x.id === b.dataset.sdel);
      if (!r || !confirm(`¿Eliminar el movimiento: ${r.tipo === "devolucion" ? "devolución" : "entrega"} de ${r.cantidad} ${r.premio} (${r.promotora}, ${fDate(r.fecha)})?`)) return;
      try { await API.deleteStock(r.id); await reload(); } catch (e) { alert("No se pudo eliminar: " + e.message); }
    }));

    $("sCsv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head1 = ["Promotora", ...m.premios.flatMap((z) => [`${z} recibido`, `${z} a clientes`, `${z} saldo`])];
      const l1 = m.promos.map((p) => [p, ...m.premios.flatMap((z) => { const c = m.cell[p][z]; return [c.rec - c.dev, c.cli, c.saldo]; })].map(q).join(";"));
      const head2 = ["Fecha", "Tipo", "Promotora", "Premio", "Cantidad", "Nota", "Registrado por"];
      const l2 = movs.map((r) => [String(r.fecha).slice(0, 10), r.tipo === "devolucion" ? "Devolución" : "Entrega", r.promotora, r.premio, r.tipo === "devolucion" ? -r.cantidad : r.cantidad, r.nota || "", r.registrado_por || ""].map(q).join(";"));
      const csv = "﻿" + "SALDO POR PROMOTORA\n" + head1.map(q).join(";") + "\n" + l1.join("\n") + "\n\nHISTORIAL DE MOVIMIENTOS\n" + head2.map(q).join(";") + "\n" + l2.join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `stock_premios_${todayKey()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  async function reload() {
    loading = true; err = "";
    try { movs = await API.listStock(); loaded = true; }
    catch (e) { err = "No se pudo cargar el stock: " + e.message; }
    loading = false;
    render();
  }

  window.Stock = {
    mount(container) { el = container; },
    setVouchers(r) { vouchers = r || []; if (loaded) render(); },
    async show() { if (!loaded && !loading) { render(); await reload(); } else render(); },
  };
})();
