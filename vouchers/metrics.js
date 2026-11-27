// =====================================================================
//  Pestaña Indicadores · KPIs del mes y del día, avance por promotora
// =====================================================================
(function () {
  const CFG = window.APP_CONFIG;
  const TZ = "America/Lima";
  const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtN = (n) => Number(n).toLocaleString("es-PE");
  const fmt1 = (n) => Number(n).toLocaleString("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pct = (n) => (isFinite(n) ? Math.round(n * 100) + "%" : "—");

  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false });
  const keyOf = (iso) => dayFmt.format(new Date(iso));
  const hourOf = (iso) => parseInt(hourFmt.format(new Date(iso)), 10) % 24;
  const todayKey = () => dayFmt.format(new Date());
  const nowHour = () => hourOf(new Date().toISOString());
  const dowOf = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
  const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n, 12)); return t.toISOString().slice(0, 10); };
  const monthDays = (ym) => { const [y, m] = ym.split("-").map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`); };
  const prevYM = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
  const ymLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}`; };
  const dLabel = (key) => { const [, m, d] = key.split("-").map(Number); return `${DOW[dowOf(key)]} ${d} ${MESES[m - 1].slice(0, 3)}`; };
  const ago = (iso) => {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return `hace ${d} día${d === 1 ? "" : "s"}`;
  };

  const TIENDAS = (CFG.TIENDAS || []).map((t) => (typeof t === "string" ? { tienda: t, promotoras: [] } : t));

  let spins = [];
  const ss = (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } };
  let el = null, rows = [], cfg = { meta_promotora_mes: 0, dias_activacion: [1, 2, 3, 4, 5, 6, 0] };
  let state = { ym: todayKey().slice(0, 7), day: todayKey(), showCfg: false, cfgLoaded: false, view: ["equipo", "tienda", "ruta"].includes(ss("m_view")) ? ss("m_view") : "equipo", tienda: ss("m_tienda") };

  // ---------- Cálculos ----------
  function compute() {
    const today = todayKey();
    const days = monthDays(state.ym);
    const isAct = (k) => cfg.dias_activacion.includes(dowOf(k));
    const actDays = days.filter(isAct);
    const isCurrent = state.ym === today.slice(0, 7);
    const isFuture = state.ym > today.slice(0, 7);
    const cutoff = isCurrent ? today : isFuture ? "0000" : days[days.length - 1];
    const elapsedAct = actDays.filter((k) => k <= cutoff);
    const remainingAfterToday = actDays.filter((k) => k > cutoff);
    const remainingInclToday = actDays.filter((k) => k >= (isCurrent ? today : "9999"));

    const R = rows.map((r) => ({ ...r, _d: keyOf(r.created_at), _h: hourOf(r.created_at), _u: Number(r.unidades) || (Array.isArray(r.productos) ? r.productos.reduce((a, x) => a + (Number(x.cantidad) || 0), 0) : 0) }));
    const sumU = (list) => list.reduce((a, r) => a + r._u, 0);
    const inMonth = R.filter((r) => r._d.startsWith(state.ym));
    const total = inMonth.length;

    // Mes anterior al mismo corte (para comparar justo)
    const pYM = prevYM(state.ym);
    const cutDay = isCurrent ? parseInt(today.slice(8), 10) : 31;
    const prevSame = R.filter((r) => r._d.startsWith(pYM) && parseInt(r._d.slice(8), 10) <= cutDay).length;

    const avg = elapsedAct.length ? total / elapsedAct.length : 0;
    const proj = Math.round(total + avg * remainingAfterToday.length);

    const phones = {};
    inMonth.forEach((r) => (phones[r.telefono] = (phones[r.telefono] || 0) + 1));
    const unique = Object.keys(phones).length;
    const dupPhones = Object.values(phones).filter((n) => n > 1).length;

    const perDay = {};
    days.forEach((k) => (perDay[k] = 0));
    inMonth.forEach((r) => perDay[r._d]++);
    let best = null;
    days.forEach((k) => { if (perDay[k] > 0 && (!best || perDay[k] > perDay[best])) best = k; });

    // Día seleccionado
    const dayRows = R.filter((r) => r._d === state.day);
    const dayHours = dayRows.map((r) => r.created_at).sort();

    // Promotoras (asignadas en config + las que aparezcan en datos)
    // Las promotoras rotan: sus tiendas salen de los registros del mes
    const promoTiendas = {};
    (CFG.PROMOTORAS && CFG.PROMOTORAS.length ? CFG.PROMOTORAS : TIENDAS.flatMap((t) => t.promotoras || [])).forEach((p) => (promoTiendas[p] = []));
    inMonth.forEach((r) => { promoTiendas[r.promotora] = [...new Set([...(promoTiendas[r.promotora] || []), r.tienda])]; });

    const meta = Number(cfg.meta_promotora_mes) || 0;
    const last7Start = addDays(state.day, -6);
    const promos = Object.keys(promoTiendas).map((p) => {
      const pr = R.filter((r) => r.promotora === p);
      const prM = pr.filter((r) => r._d.startsWith(state.ym));
      const mes = prM.length;
      const activeDays = new Set(prM.map((r) => r._d)).size;
      const pAvg = elapsedAct.length ? mes / elapsedAct.length : 0;
      const pProj = Math.round(mes + pAvg * remainingAfterToday.length);
      const last = pr.length ? pr.reduce((a, b) => (a.created_at > b.created_at ? a : b)).created_at : null;
      let estado = "sin-meta";
      if (meta > 0) estado = mes >= meta ? "cumplida" : pProj >= meta ? "en-meta" : pProj >= meta * 0.8 ? "riesgo" : "atrasada";
      return {
        promotora: p,
        tiendas: promoTiendas[p],
        hoy: pr.filter((r) => r._d === state.day).length,
        sem: pr.filter((r) => r._d >= last7Start && r._d <= state.day).length,
        mes, avg: pAvg, proj: pProj, activeDays, unidades: sumU(prM),
        avance: meta ? mes / meta : NaN,
        ritmo: meta && remainingInclToday.length ? Math.max(0, meta - mes) / remainingInclToday.length : NaN,
        last, estado,
      };
    }).sort((a, b) => b.mes - a.mes || b.hoy - a.hoy);

    // Tiendas
    const tiendaNames = [...new Set([...TIENDAS.map((t) => t.tienda), ...inMonth.map((r) => r.tienda)])];
    const tiendas = tiendaNames.map((t) => {
      const tr = inMonth.filter((r) => r.tienda === t);
      const daysWith = new Set(tr.map((r) => r._d));
      return {
        tienda: t,
        promotora: [...new Set(tr.map((r) => r.promotora))].join(", ") || "—",
        hoy: R.filter((r) => r.tienda === t && r._d === state.day).length,
        mes: tr.length,
        unidades: sumU(tr),
        share: total ? tr.length / total : 0,
        sinReg: elapsedAct.filter((k) => !daysWith.has(k)).length,
      };
    }).sort((a, b) => b.mes - a.mes);

    // Ventas registradas: unidades de productos Afix comprados por los participantes
    const conProd = inMonth.filter((r) => Array.isArray(r.productos) && r.productos.length);
    const skuMap = {}, skuDia = {};
    conProd.forEach((r) => r.productos.forEach((x) => {
      skuMap[x.sku] = (skuMap[x.sku] || 0) + (Number(x.cantidad) || 0);
      if (r._d === state.day) skuDia[x.sku] = (skuDia[x.sku] || 0) + (Number(x.cantidad) || 0);
    }));
    const ventas = {
      unidades: sumU(inMonth), unidadesDia: sumU(dayRows.map((r) => R.find((x) => x.id === r.id) || r)),
      conProd: conProd.length, promedio: conProd.length ? sumU(conProd) / conProd.length : 0,
      skus: Object.entries(skuMap).sort((a, b) => b[1] - a[1]).map(([sku, u]) => ({ sku, u, dia: skuDia[sku] || 0 })),
    };

    // Premios entregados
    const premioNames = [...new Set([...(CFG.PREMIOS || []), ...inMonth.map((r) => r.premio).filter(Boolean)])];
    const premios = premioNames.map((pz) => ({
      premio: pz,
      mes: inMonth.filter((r) => r.premio === pz).length,
      dia: dayRows.filter((r) => r.premio === pz).length,
    }));
    const sinPremio = inMonth.filter((r) => !r.premio).length;
    const premioMatrix = tiendas.map((t) => ({
      tienda: t.tienda,
      vals: premioNames.map((pz) => inMonth.filter((r) => r.tienda === t.tienda && r.premio === pz).length),
    }));

    // Ruleta: giros del mes vs vouchers registrados con giro
    const RUL = CFG.RULETA || [];
    const spinsM = spins.filter((g) => keyOf(g.created_at).startsWith(state.ym));
    const usados = new Set(inMonth.map((r) => r.giro_id).filter(Boolean));
    const tipos = [...new Set(RUL.map((x) => x.tipo))];
    const pesoTot = RUL.reduce((a, x) => a + (Number(x.peso) || 0), 0) || 1;
    const ruleta = {
      giros: spinsM.length,
      conRegistro: spinsM.filter((g) => usados.has(g.id)).length,
      vouchersConGiro: inMonth.filter((r) => r.giro_id).length,
      dist: tipos.map((t) => ({
        tipo: t,
        n: spinsM.filter((g) => g.resultado === t).length,
        esperado: RUL.filter((x) => x.tipo === t).reduce((a, x) => a + (Number(x.peso) || 0), 0) / pesoTot,
      })),
      porPromo: Object.entries(spinsM.reduce((acc, g) => {
        const k = g.promotora || "Sin promotora";
        acc[k] = acc[k] || { giros: 0, sinReg: 0, esp: 0 };
        acc[k].giros++; if (!usados.has(g.id)) acc[k].sinReg++; if (g.resultado === "especial") acc[k].esp++;
        return acc;
      }, {})).sort((a, b) => b[1].giros - a[1].giros),
    };

    // Horas y días de la semana (mes)
    const hours = {};
    for (let h = 7; h <= 22; h++) hours[h] = 0;
    inMonth.forEach((r) => { if (hours[r._h] !== undefined) hours[r._h]++; });
    const dowTot = [0, 0, 0, 0, 0, 0, 0], dowCnt = [0, 0, 0, 0, 0, 0, 0];
    inMonth.forEach((r) => dowTot[dowOf(r._d)]++);
    elapsedAct.forEach((k) => dowCnt[dowOf(k)]++);

    // Alertas
    const alerts = [];
    if (isCurrent && state.day === today) {
      const h = nowHour();
      if (h >= 11) {
        const sin = tiendas.filter((t) => TIENDAS.some((x) => x.tienda === t.tienda) && t.hoy === 0).map((t) => t.tienda);
        if (sin.length) alerts.push({ lvl: "warn", t: `${sin.length} tienda${sin.length > 1 ? "s" : ""} sin registros hoy`, d: sin.join(" · ") });
      }
      if (h >= 10 && h <= 21) {
        const quietas = promos.filter((p) => p.hoy > 0 && p.last && Date.now() - new Date(p.last) > 3 * 3600e3).map((p) => p.promotora);
        if (quietas.length) alerts.push({ lvl: "info", t: "Sin registros en las últimas 3 horas", d: quietas.join(" · ") });
      }
    }
    if (dupPhones) alerts.push({ lvl: "warn", t: `${dupPhones} teléfono${dupPhones > 1 ? "s" : ""} repetido${dupPhones > 1 ? "s" : ""} en el mes`, d: "Revisa en Registros si son vouchers distintos del mismo cliente o un duplicado." });
    const sinAcepta = inMonth.filter((r) => r.acepta_datos === false).length;
    if (sinAcepta) alerts.push({ lvl: "warn", t: `${sinAcepta} registro${sinAcepta > 1 ? "s" : ""} sin aceptación de datos`, d: "Registrados antes de activar el check. Conviene depurarlos." });
    if (meta > 0 && isCurrent) {
      const atr = promos.filter((p) => p.estado === "atrasada").map((p) => p.promotora);
      if (atr.length) alerts.push({ lvl: "bad", t: `${atr.length} promotora${atr.length > 1 ? "s" : ""} con proyección menor al 80% de su meta`, d: atr.join(" · ") + " · revisa su presencia en tienda y horario." });
    }

    const nPromos = promos.length || 1;
    return {
      R, cfgDias: cfg.dias_activacion, today, days, actDays, elapsedAct, remainingAfterToday, isCurrent, total, prevSame, avg, proj, unique, dupPhones,
      perDay, best, dayRows, dayHours, promos, tiendas, ruleta, ventas, premios, premioNames, premioMatrix, sinPremio, hours, dowTot, dowCnt, alerts, meta,
      metaEquipo: meta * nPromos,
      metaDiariaEquipo: meta && actDays.length ? (meta * nPromos) / actDays.length : 0,
      coberturaHoy: tiendas.filter((t) => t.hoy > 0 && TIENDAS.some((x) => x.tienda === t.tienda)).length,
      promosActivasDia: new Set(dayRows.map((r) => r.promotora)).size,
    };
  }

  // ---------- Gráficos (SVG) ----------
  function dailyChart(m, perDay = m.perDay, metaDia = m.metaDiariaEquipo, metaLbl = "Meta diaria equipo") {
    const W = 900, H = 220, P = { l: 34, r: 10, t: 14, b: 34 };
    const vals = m.days.map((k) => perDay[k]);
    const max = Math.max(1, ...vals, Math.ceil(metaDia || 0));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((st) => max / st <= 5) || 1000;
    const ticks = Math.ceil(max / step);
    const niceMax = ticks * step;
    const bw = (W - P.l - P.r) / m.days.length;
    const y = (v) => P.t + (H - P.t - P.b) * (1 - v / niceMax);
    let g = "";
    for (let i = 0; i <= ticks; i++) {
      const v = step * i, yy = y(v);
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="grid"/><text x="${P.l - 6}" y="${yy + 4}" class="axis" text-anchor="end">${Math.round(v)}</text>`;
    }
    m.days.forEach((k, i) => {
      const v = perDay[k], x = P.l + i * bw;
      const act = m.actDays.includes(k);
      const cls = k === m.today ? "bar today" : k === state.day ? "bar sel" : k > m.today ? "bar future" : act ? "bar" : "bar off";
      if (!act) g += `<rect x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" class="offday"/>`;
      if (v > 0) g += `<rect x="${x + bw * 0.16}" y="${y(v)}" width="${bw * 0.68}" height="${y(0) - y(v)}" rx="3" class="${cls}"><title>${dLabel(k)}: ${v} voucher${v === 1 ? "" : "s"}</title></rect>`;
      if (v > 0 && bw > 18) g += `<text x="${x + bw / 2}" y="${y(v) - 4}" class="val" text-anchor="middle">${v}</text>`;
      const d = parseInt(k.slice(8), 10);
      if (d === 1 || d % 2 === 1 || bw > 26) g += `<text x="${x + bw / 2}" y="${H - P.b + 15}" class="axis${dowOf(k) === 0 ? " sun" : ""}" text-anchor="middle">${d}</text>`;
      g += `<rect x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-day="${k}" style="cursor:pointer"><title>${dLabel(k)}: ${v} — clic para ver el día</title></rect>`;
    });
    if (metaDia > 0) {
      const yy = y(metaDia);
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="goal"/><text x="${W - P.r}" y="${yy - 5}" class="goal-lbl" text-anchor="end">${metaLbl}: ${fmt1(metaDia)}</text>`;
    }
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" class="base"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Vouchers por día">${g}</svg>`;
  }

  function columnChart(labels, values, opts = {}) {
    const W = 440, H = 170, P = { l: 8, r: 8, t: 18, b: 26 };
    const max = Math.max(1, ...values);
    const bw = (W - P.l - P.r) / labels.length;
    const top = values.indexOf(Math.max(...values));
    let g = "";
    labels.forEach((lb, i) => {
      const v = values[i], h = (H - P.t - P.b) * (v / max), x = P.l + i * bw;
      if (v > 0) g += `<rect x="${x + bw * 0.14}" y="${H - P.b - h}" width="${bw * 0.72}" height="${h}" rx="3" class="bar${i === top && v > 0 ? " today" : ""}"><title>${lb}: ${opts.fmt ? opts.fmt(v) : v}</title></rect>`;
      if (v > 0) g += `<text x="${x + bw / 2}" y="${H - P.b - h - 4}" class="val" text-anchor="middle">${opts.fmt ? opts.fmt(v) : v}</text>`;
      g += `<text x="${x + bw / 2}" y="${H - P.b + 15}" class="axis" text-anchor="middle">${lb}</text>`;
    });
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="base"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg>`;
  }


  // ---------- Avance diario por tienda ----------
  const short = (t) => String(t).replace(/^Sodimac\s+/i, "");
  const asignadas = (t) => (TIENDAS.find((x) => x.tienda === t) || {}).promotoras || [];

  function storeData(m, tienda) {
    const rowsT = m.R.filter((r) => r.tienda === tienda && r._d.startsWith(state.ym));
    const perDay = {};
    m.days.forEach((k) => (perDay[k] = 0));
    rowsT.forEach((r) => { if (perDay[r._d] !== undefined) perDay[r._d]++; });
    const byDay = {};
    rowsT.forEach((r) => {
      const d = (byDay[r._d] = byDay[r._d] || { n: 0, promos: {}, times: [] });
      d.n++; d.promos[r.promotora] = (d.promos[r.promotora] || 0) + 1; d.times.push(r.created_at);
    });
    const asig = asignadas(tienda);
    const meta = m.meta;
    let metaDia = 0;
    if (meta && asig.length && m.actDays.length) {
      const nT = TIENDAS.filter((x) => (x.promotoras || []).includes(asig[0])).length || 1;
      metaDia = meta / nT / m.actDays.length;
    }
    let best = null;
    m.days.forEach((k) => { if (perDay[k] > 0 && (!best || perDay[k] > perDay[best])) best = k; });
    const visitDays = m.elapsedAct.filter((k) => perDay[k] > 0).length;
    const quien = {};
    rowsT.forEach((r) => (quien[r.promotora] = (quien[r.promotora] || 0) + 1));
    // Días a listar: los de activación transcurridos y cualquier día con registros
    const lista = m.days.filter((k) => byDay[k] || m.elapsedAct.includes(k)).sort().reverse();
    return {
      tienda, perDay, byDay, asig, metaDia, best, lista,
      total: rowsT.length, visitDays,
      avg: m.elapsedAct.length ? rowsT.length / m.elapsedAct.length : 0,
      avgVisita: visitDays ? rowsT.length / visitDays : 0,
      sinReg: m.elapsedAct.filter((k) => !perDay[k]).length,
      quien: Object.entries(quien).sort((a, b) => b[1] - a[1]),
    };
  }

  function storeView(m) {
    const names = [...new Set([...TIENDAS.map((t) => t.tienda), ...m.R.filter((r) => r._d.startsWith(state.ym)).map((r) => r.tienda)])];
    if (!names.includes(state.tienda)) state.tienda = names[0] || "";
    const opts = names.map((t) => `<option value="${esc(t)}"${t === state.tienda ? " selected" : ""}>${esc(t)}</option>`).join("");
    if (!state.tienda) return '<div class="empty" style="padding:18px">No hay tiendas configuradas.</div>';
    const d = storeData(m, state.tienda);
    const dayRow = (k) => {
      const x = d.byDay[k];
      const sel = k === state.day ? ' class="row-hi"' : "";
      if (!x) return `<tr${sel}><td class="nowrap">${esc(dLabel(k))}</td><td class="num"><span class="muted">0</span></td><td><span class="pill muted">Sin registro</span></td><td class="muted">—</td></tr>`;
      const ts = x.times.slice().sort();
      return `<tr${sel}><td class="nowrap">${esc(dLabel(k))}</td><td class="num"><b>${x.n}</b></td>
        <td>${Object.entries(x.promos).map(([p, n]) => `<span class="promo-chip${d.asig.length && !d.asig.includes(p) ? " otra" : ""}">${esc(p)}${Object.keys(x.promos).length > 1 ? ` · ${n}` : ""}</span>`).join(" ")}</td>
        <td class="nowrap muted">${hourFmtHM(ts[0])}${ts.length > 1 ? " – " + hourFmtHM(ts[ts.length - 1]) : ""}</td></tr>`;
    };
    return `
      <div class="store-pick">
        <div class="field"><label for="mTienda">Tienda</label><select id="mTienda">${opts}</select></div>
        <div class="store-asig"><span class="muted small">Promotora asignada</span><b>${d.asig.length ? esc(d.asig.join(", ")) : "Sin asignar"}</b></div>
      </div>
      <div class="store-kpis">
        <div><span class="lbl">Vouchers del mes</span><b>${fmtN(d.total)}</b></div>
        <div><span class="lbl">Promedio por día</span><b>${fmt1(d.avg)}</b><small>${fmt1(d.avgVisita)} en días con registro</small></div>
        <div><span class="lbl">Días sin registro</span><b class="${d.sinReg >= 3 ? "t-bad" : d.sinReg ? "t-warn" : ""}">${d.sinReg}</b><small>de ${m.elapsedAct.length} de activación</small></div>
        <div><span class="lbl">Mejor día</span><b>${d.best ? esc(dLabel(d.best)) : "—"}</b><small>${d.best ? d.perDay[d.best] + " vouchers" : "&nbsp;"}</small></div>
      </div>
      ${dailyChart(m, d.perDay, d.metaDia, "Meta diaria tienda")}
      <div class="legend"><span><i class="sw today"></i>Hoy</span><span><i class="sw sel"></i>Día seleccionado</span><span><i class="sw off"></i>Día sin activación</span>${d.metaDia ? '<span><i class="sw goal"></i>Meta diaria de la tienda (meta de la promotora ÷ sus tiendas)</span>' : ""}</div>
      ${d.quien.length ? `<p class="insight">Registraron en esta tienda este mes: ${d.quien.map(([p, n]) => `<b>${esc(p)}</b> (${n})`).join(" · ")}${d.asig.length && d.quien.some(([p]) => !d.asig.includes(p)) ? ' · <span class="promo-chip otra">en naranja</span> = promotora distinta a la asignada' : ""}</p>` : ""}
      <div class="table-wrap" style="margin-top:12px"><table class="ind-table">
        <thead><tr><th>Día</th><th class="num">Vouchers</th><th>Promotora en tienda</th><th>Horario</th></tr></thead>
        <tbody>${d.lista.length ? d.lista.map(dayRow).join("") : '<tr><td colspan="4" class="empty">Sin días de activación aún en este mes</td></tr>'}</tbody>
      </table></div>`;
  }

  // ---------- Ruta sugerida por promotora (según avance) ----------
  function peakStart(hours) {
    let best = 0, bh = 0;
    for (let h = 7; h <= 20; h++) { const s = (hours[h] || 0) + (hours[h + 1] || 0) + (hours[h + 2] || 0); if (s > best) { best = s; bh = h; } }
    return best ? bh : null;
  }

  function routePlan(m) {
    const ref = m.isCurrent ? m.today : m.days[m.days.length - 1];
    const isAct = (k) => m.cfgDias.includes(dowOf(k));
    const range = (a, b) => { const out = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; };
    const w14 = range(addDays(ref, -13), ref).filter(isAct);
    const w7 = range(addDays(ref, -6), ref).filter(isAct);
    const p7 = range(addDays(ref, -13), addDays(ref, -7)).filter(isAct);
    const cnt = (t, ks) => { const set = new Set(ks); return m.R.filter((r) => r.tienda === t && set.has(r._d)).length; };

    const stats = TIENDAS.map((x) => {
      const t = x.tienda;
      const n14 = cnt(t, w14), n7 = cnt(t, w7), np7 = cnt(t, p7);
      const days14 = new Set(m.R.filter((r) => r.tienda === t && w14.includes(r._d)).map((r) => r._d));
      const last = m.R.filter((r) => r.tienda === t && r._d <= ref).reduce((a, r) => (!a || r._d > a ? r._d : a), null);
      const since = last ? range(addDays(last, 1), ref).filter(isAct).length : null;
      return { tienda: t, promos: x.promotoras || [], n14, n7, np7, avg14: w14.length ? n14 / w14.length : 0, gap14: w14.filter((k) => !days14.has(k)).length, last, since };
    });
    const act = stats.filter((s) => s.n14 > 0).map((s) => s.avg14).sort((a, b) => a - b);
    const bench = act.length ? act[Math.floor(act.length / 2)] : 1;

    stats.forEach((s) => {
      const perf = Math.max(0, Math.min(1, 1 - s.avg14 / (bench || 1)));
      const gap = w14.length ? s.gap14 / w14.length : 0;
      const trend = s.np7 > 0 ? Math.max(0, Math.min(1, (s.np7 - s.n7) / s.np7)) : 0;
      const rec = s.since === null ? 1 : Math.min(1, s.since / 5);
      s.score = Math.round(perf * 45 + gap * 30 + trend * 15 + rec * 10);
      s.prio = s.score >= 60 ? "Alta" : s.score >= 35 ? "Media" : "Baja";
      const why = [];
      if (s.last === null) why.push("sin vouchers registrados");
      else if (s.since >= 2) why.push(`${s.since} días de activación sin registro`);
      if (s.n14 > 0) why.push(`${fmt1(s.avg14)}/día vs ${fmt1(bench)} de la tienda típica`);
      if (s.gap14 && s.last !== null) why.push(`${s.gap14} de ${w14.length} días en cero (14 días)`);
      if (s.np7 > 0 && s.n7 < s.np7) why.push(`cayó ${pct((s.np7 - s.n7) / s.np7)} vs semana previa`);
      if (s.np7 > 0 && s.n7 > s.np7) why.push(`subió ${pct((s.n7 - s.np7) / s.np7)} vs semana previa`);
      s.why = why;
    });

    // Semana siguiente (lunes a domingo) con los días de activación
    let mon = addDays(ref, 1);
    while (dowOf(mon) !== 1) mon = addDays(mon, 1);
    const week = range(mon, addDays(mon, 6)).filter(isAct);
    // Días con más tráfico histórico primero (promedio del equipo por día de la semana)
    const dowAvg = (k) => { const d = dowOf(k); return m.dowCnt[d] ? m.dowTot[d] / m.dowCnt[d] : 0; };
    const byTraffic = week.slice().sort((a, b) => dowAvg(b) - dowAvg(a) || a.localeCompare(b));

    const promoNames = [...new Set(TIENDAS.flatMap((t) => t.promotoras || []))];
    const plans = promoNames.map((p) => {
      const st = stats.filter((s) => s.promos.includes(p)).sort((a, b) => b.score - a.score);
      const n = week.length, k = st.length;
      const alloc = st.map(() => 0);
      if (k === 1) alloc[0] = n;
      else if (k > 1 && n) {
        const base = n >= k ? 1 : 0;
        if (base) alloc.fill(1);
        let rest = n - base * k;
        const w = st.map((s) => 0.4 + s.score / 100);
        const sw = w.reduce((a, b) => a + b, 0);
        const exact = w.map((x) => (rest * x) / sw);
        exact.forEach((x, i) => (alloc[i] += Math.floor(x)));
        rest -= exact.reduce((a, x) => a + Math.floor(x), 0);
        exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).slice(0, rest).forEach(([, i]) => alloc[i]++);
      }
      // Asigna los días de mayor tráfico a las tiendas con mayor necesidad, alternando para no repetir seguido
      const queue = [];
      const left = alloc.slice();
      while (queue.length < n && left.some((x) => x > 0)) st.forEach((s, i) => { if (left[i] > 0) { queue.push(i); left[i]--; } });
      const dayMap = {};
      byTraffic.forEach((k, j) => { if (queue[j] !== undefined) dayMap[k] = st[queue[j]].tienda; });
      const agenda = week.map((k) => ({ k, tienda: dayMap[k] || null, prio: (st.find((s) => s.tienda === dayMap[k]) || {}).prio }));
      const total14 = st.reduce((a, s) => a + s.n14, 0);
      return { promotora: p, tiendas: st, alloc, agenda, total14 };
    }).sort((a, b) => Math.max(...b.tiendas.map((s) => s.score), 0) - Math.max(...a.tiendas.map((s) => s.score), 0));

    return { ref, mon, week, bench, w14: w14.length, plans, peak: peakStart(m.hours) };
  }

  const PRIO_CLS = { Alta: "bad", Media: "warn", Baja: "ok" };
  function routeView(m) {
    const r = routePlan(m);
    if (!r.plans.length) return '<div class="empty" style="padding:18px">Asigna tiendas a las promotoras en config.js para armar la ruta.</div>';
    const wk = r.week.length ? `${dLabel(r.week[0])} – ${dLabel(r.week[r.week.length - 1])}` : "—";
    return `
      <p class="insight" style="margin:0 0 12px">Ruta para la semana <b>${esc(wk)}</b>, según el avance de los últimos 14 días (al ${esc(dLabel(r.ref))}).
        Cada tienda recibe un <b>puntaje de necesidad</b> (0–100): rendimiento por día frente a la tienda típica (${fmt1(r.bench)} vouchers/día), días en cero, caída vs la semana previa y días desde el último registro.
        Las tiendas con más necesidad reciben más días y los días de mayor tráfico${r.peak !== null ? `; refuerza la franja <b>${r.peak}:00 – ${r.peak + 3}:00</b>` : ""}. Es una propuesta: valídala con la agencia.</p>
      <div class="route-grid">${r.plans.map((p) => `
        <div class="route-card">
          <div class="route-head"><b>${esc(p.promotora)}</b><span class="muted small">${p.total14} vouchers en 14 días · ${p.tiendas.length} tienda${p.tiendas.length === 1 ? "" : "s"}</span></div>
          ${p.tiendas.map((s, i) => `
            <div class="route-store">
              <div class="rs-top"><span class="pill ${PRIO_CLS[s.prio]}">${s.prio}</span><b>${esc(short(s.tienda))}</b><span class="rs-days">${p.alloc[i]} día${p.alloc[i] === 1 ? "" : "s"}</span></div>
              <div class="prog"><div class="${PRIO_CLS[s.prio]}" style="width:${s.score}%"></div></div>
              <div class="small muted">Necesidad ${s.score}/100 · ${s.n14} vouchers en 14 días${s.why.length ? " · " + esc(s.why.join(" · ")) : ""}</div>
            </div>`).join("")}
          <div class="route-week">${p.agenda.map((a) => `<div class="rw-day${a.tienda ? " p-" + (PRIO_CLS[a.prio] || "ok") : ""}"><span>${esc(dLabel(a.k).replace(/ \w+$/, ""))}</span><b>${a.tienda ? esc(short(a.tienda)) : "—"}</b></div>`).join("")}</div>
        </div>`).join("")}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-ghost" id="mRutaCsv">Exportar ruta (CSV)</button></div>`;
  }

  function exportRoute(m) {
    const r = routePlan(m);
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Promotora", "Fecha", "Día", "Tienda", "Prioridad", "Necesidad (0-100)", "Vouchers 14 días", "Motivo"];
    const lines = [];
    r.plans.forEach((p) => p.agenda.forEach((a) => {
      const s = p.tiendas.find((x) => x.tienda === a.tienda) || {};
      lines.push([p.promotora, a.k, DOW[dowOf(a.k)], a.tienda || "", s.prio || "", s.score ?? "", s.n14 ?? "", (s.why || []).join(" · ")].map(q).join(";"));
    }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + head.map(q).join(";") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `ruta_promotoras_${r.week[0] || r.ref}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Render ----------
  const ESTADO = {
    "cumplida": ["Meta cumplida", "ok"],
    "en-meta": ["En camino", "ok"],
    "riesgo": ["En riesgo", "warn"],
    "atrasada": ["Atrasada", "bad"],
    "sin-meta": ["Define meta", "muted"],
  };

  function monthOptions() {
    const set = new Set(rows.map((r) => keyOf(r.created_at).slice(0, 7)));
    set.add(todayKey().slice(0, 7));
    return [...set].sort().reverse();
  }

  function render() {
    if (!el) return;
    const m = compute();
    const delta = m.prevSame ? (m.total - m.prevSame) / m.prevSame : NaN;
    const dayTotal = m.dayRows.length;
    const dayVsAvg = m.avg ? dayTotal / m.avg - 1 : NaN;
    const avanceEquipo = m.metaEquipo ? m.total / m.metaEquipo : NaN;

    el.innerHTML = `
      <div class="kpis">
        <div class="card kpi accent"><div class="lbl">Vouchers · ${esc(ymLabel(state.ym))}</div><div class="val">${fmtN(m.total)}</div>
          <div class="sub">${isFinite(delta) ? `<span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${pct(Math.abs(delta))}</span> vs mes anterior al mismo día` : "Sin datos del mes anterior"}</div></div>
        <div class="card kpi"><div class="lbl">Promedio por día</div><div class="val">${fmt1(m.avg)}</div>
          <div class="sub">${m.elapsedAct.length} de ${m.actDays.length} días de activación</div></div>
        <div class="card kpi"><div class="lbl">Proyección cierre de mes</div><div class="val">${fmtN(m.proj)}</div>
          <div class="sub">${m.metaEquipo ? `Meta equipo ${fmtN(m.metaEquipo)} · ${pct(m.proj / m.metaEquipo)}` : "Al ritmo actual"}</div></div>
        <div class="card kpi"><div class="lbl">Clientes únicos</div><div class="val">${fmtN(m.unique)}</div>
          <div class="sub">${m.total ? `${pct(1 - m.unique / m.total)} de registros con teléfono repetido` : "&nbsp;"}</div></div>
      </div>

      <div class="card panel ind-toolbar">
        <div class="field"><label for="mMes">Mes</label>
          <select id="mMes">${monthOptions().map((ym) => `<option value="${ym}"${ym === state.ym ? " selected" : ""}>${ymLabel(ym)}</option>`).join("")}</select></div>
        <div class="field"><label for="mDia">Día a revisar</label><input id="mDia" type="date" value="${state.day}" /></div>
        <div class="spacer"></div>
        ${m.metaEquipo ? `<div class="team-goal"><div class="lbl">Avance meta del equipo</div><div class="prog big"><div style="width:${Math.min(100, avanceEquipo * 100)}%"></div></div><div class="sub"><b>${fmtN(m.total)}</b> de ${fmtN(m.metaEquipo)} · ${pct(avanceEquipo)}</div></div>` : ""}
        <button class="btn btn-ghost" id="mCfgBtn">${m.meta ? "Meta: " + m.meta + " por promotora" : "Definir meta"}</button>
        <button class="btn btn-primary" id="mCsv">Exportar resumen</button>
      </div>

      <div class="card panel cfg-panel ${state.showCfg ? "" : "hidden"}" id="mCfg">
        <h3>Configuración de metas</h3>
        <div class="cfg-grid">
          <div class="field"><label for="cMeta">Meta mensual por promotora (vouchers)</label>
            <input id="cMeta" type="number" min="0" step="1" value="${m.meta || ""}" placeholder="Ej. 120" /></div>
          <div class="field"><label>Días de activación (para promedios y proyección)</label>
            <div class="dow-pick">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" value="${d}" ${cfg.dias_activacion.includes(d) ? "checked" : ""}/> ${DOW[d]}</label>`).join("")}</div></div>
        </div>
        <div class="cfg-actions"><span class="muted" id="cMsg"></span><button class="btn btn-primary" id="cSave">Guardar</button></div>
      </div>

      ${m.alerts.length ? `<div class="alerts">${m.alerts.map((a) => `<div class="alert-item ${a.lvl}"><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div>`).join("")}</div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>${state.view === "ruta" ? "Ruta sugerida por promotora" : `Vouchers por día · ${esc(ymLabel(state.ym))}`}</h3>
          <div class="seg" role="tablist" aria-label="Vista">
            <button type="button" data-view="equipo" class="${state.view === "equipo" ? "on" : ""}">Equipo</button>
            <button type="button" data-view="tienda" class="${state.view === "tienda" ? "on" : ""}">Por tienda</button>
            <button type="button" data-view="ruta" class="${state.view === "ruta" ? "on" : ""}">Ruta sugerida</button>
          </div></div>
        ${state.view === "tienda" ? storeView(m) : state.view === "ruta" ? routeView(m) : `
        ${m.best ? `<p class="muted small" style="margin:-4px 0 6px">Mejor día: <b>${esc(dLabel(m.best))}</b> con ${m.perDay[m.best]}</p>` : ""}
        ${dailyChart(m)}
        <div class="legend"><span><i class="sw today"></i>Hoy</span><span><i class="sw sel"></i>Día seleccionado</span><span><i class="sw off"></i>Día sin activación</span>${m.metaDiariaEquipo ? '<span><i class="sw goal"></i>Meta diaria</span>' : ""}</div>`}
      </div>

      <div class="kpis day-kpis">
        <div class="card kpi"><div class="lbl">Vouchers · ${esc(dLabel(state.day))}</div><div class="val">${dayTotal}</div>
          <div class="sub">${isFinite(dayVsAvg) && m.avg ? `<span class="${dayVsAvg >= 0 ? "up" : "down"}">${dayVsAvg >= 0 ? "▲" : "▼"} ${pct(Math.abs(dayVsAvg))}</span> vs promedio del mes` : "&nbsp;"}</div></div>
        <div class="card kpi"><div class="lbl">Promotoras activas</div><div class="val">${m.promosActivasDia}<small> / ${m.promos.length}</small></div><div class="sub">Con al menos 1 registro</div></div>
        <div class="card kpi"><div class="lbl">Tiendas con registros</div><div class="val">${m.tiendas.filter((t) => t.hoy > 0).length}<small> / ${TIENDAS.length || m.tiendas.length}</small></div><div class="sub">Cobertura del día</div></div>
        <div class="card kpi"><div class="lbl">Horario de registros</div><div class="val sm">${m.dayHours.length ? `${hourFmtHM(m.dayHours[0])} – ${hourFmtHM(m.dayHours[m.dayHours.length - 1])}` : "—"}</div><div class="sub">Primer y último voucher</div></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Avance por promotora</h3><span class="muted">Hoy = día seleccionado · 7 días = semana que termina ese día</span></div>
        <div class="table-wrap"><table class="ind-table">
          <thead><tr><th>Promotora</th><th class="num">Hoy</th><th class="num">7 días</th><th class="num">Mes</th><th class="num">Unid. mes</th><th style="min-width:170px">Avance vs meta</th><th class="num">Ritmo necesario / día</th><th class="num">Proyección</th><th class="num">Constancia</th><th>Último registro</th><th>Estado</th></tr></thead>
          <tbody>${m.promos.length ? m.promos.map((p) => `
            <tr>
              <td><strong>${esc(p.promotora)}</strong><div class="muted small">${esc(p.tiendas.map((t) => t.replace(/^Sodimac\s+/i, "")).join(" · "))}</div></td>
              <td class="num">${p.hoy}</td><td class="num">${p.sem}</td><td class="num"><b>${p.mes}</b></td><td class="num">${p.unidades || '<span class="muted">0</span>'}</td>
              <td>${m.meta ? `<div class="prog"><div class="${ESTADO[p.estado][1]}" style="width:${Math.min(100, p.avance * 100)}%"></div></div><div class="small muted">${p.mes} / ${m.meta} · ${pct(p.avance)}</div>` : '<span class="muted small">Sin meta</span>'}</td>
              <td class="num">${isFinite(p.ritmo) ? fmt1(p.ritmo) : "—"}</td>
              <td class="num">${p.proj}</td>
              <td class="num" title="Días con registros / días de activación transcurridos">${m.elapsedAct.length ? pct(p.activeDays / m.elapsedAct.length) : "—"}</td>
              <td class="nowrap muted">${p.last ? esc(ago(p.last)) : "—"}</td>
              <td><span class="pill ${ESTADO[p.estado][1]}">${ESTADO[p.estado][0]}</span></td>
            </tr>`).join("") : `<tr><td colspan="10" class="empty">Sin promotoras configuradas</td></tr>`}</tbody>
        </table></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Rendimiento por tienda</h3><span class="muted">Días sin registro = días de activación del mes con 0 vouchers</span></div>
        <div class="table-wrap"><table class="ind-table">
          <thead><tr><th>Tienda</th><th>Promotora</th><th class="num">Día sel.</th><th class="num">Mes</th><th class="num">Unid. mes</th><th style="min-width:160px">Participación</th><th class="num">Días sin registro</th></tr></thead>
          <tbody>${m.tiendas.map((t) => `
            <tr><td><strong>${esc(t.tienda)}</strong></td><td>${esc(t.promotora)}</td><td class="num">${t.hoy}</td><td class="num"><b>${t.mes}</b></td><td class="num">${t.unidades || '<span class="muted">0</span>'}</td>
              <td><div class="prog"><div style="width:${t.share * 100}%"></div></div><div class="small muted">${pct(t.share)}</div></td>
              <td class="num">${t.sinReg ? `<span class="pill ${t.sinReg >= 3 ? "bad" : "warn"}">${t.sinReg}</span>` : '<span class="pill ok">0</span>'}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Ventas registradas por SKU · ${esc(ymLabel(state.ym))}</h3><span class="muted">Unidades Afix que compraron los participantes</span></div>
        <div class="prize-cards">
          <div class="prize"><div class="lbl">Unidades vendidas</div><div class="val">${fmtN(m.ventas.unidades)}</div><div class="sub">${fmtN(m.ventas.unidadesDia)} el ${esc(dLabel(state.day))}</div></div>
          <div class="prize"><div class="lbl">Unidades por voucher</div><div class="val">${fmt1(m.ventas.promedio)}</div><div class="sub">${m.ventas.conProd} vouchers con productos</div></div>
          <div class="prize"><div class="lbl">SKU más vendido</div><div class="val" style="font-size:17px;line-height:1.25">${m.ventas.skus[0] ? esc(m.ventas.skus[0].sku.replace(/^Pegamento\s+/i, "")) : "—"}</div><div class="sub">${m.ventas.skus[0] ? m.ventas.skus[0].u + " unidades" : "&nbsp;"}</div></div>
        </div>
        ${m.ventas.skus.length ? `<div class="bars" style="margin-top:14px">${m.ventas.skus.map((x) => `<div class="bar-row"><span class="name" title="${esc(x.sku)}">${esc(x.sku.replace(/^Pegamento\s+/i, ""))}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.u / m.ventas.skus[0].u) * 100}%"></div></div><span class="n">${x.u}</span></div>`).join("")}</div>`
          : '<div class="empty" style="padding:18px">Aún no hay vouchers con productos registrados este mes.</div>'}
        ${m.ventas.conProd < m.total ? `<p class="small muted" style="margin:10px 0 0">${m.total - m.ventas.conProd} voucher(s) del mes se registraron antes de pedir los productos y no suman unidades.</p>` : ""}
      </div>

      <div class="card panel">
        <div class="panel-head"><h3>Premios entregados · ${esc(ymLabel(state.ym))}</h3>
          <span class="muted">${m.sinPremio ? `${m.sinPremio} registro${m.sinPremio > 1 ? "s" : ""} anterior${m.sinPremio > 1 ? "es" : ""} sin premio` : "Útil para controlar el stock por tienda"}</span></div>
        <div class="prize-cards">${m.premios.map((pz) => {
          const tot = m.premios.reduce((a, b) => a + b.mes, 0) || 1;
          return `<div class="prize"><div class="lbl">${esc(pz.premio)}</div><div class="val">${fmtN(pz.mes)}</div>
            <div class="prog"><div style="width:${(pz.mes / tot) * 100}%"></div></div>
            <div class="sub">${pct(pz.mes / tot)} del mes · ${pz.dia} el ${esc(dLabel(state.day))}</div></div>`;
        }).join("")}</div>
        <div class="table-wrap" style="margin-top:14px"><table class="ind-table">
          <thead><tr><th>Tienda</th>${m.premioNames.map((pz) => `<th class="num">${esc(pz)}</th>`).join("")}<th class="num">Total</th></tr></thead>
          <tbody>${m.premioMatrix.map((t) => `<tr><td><strong>${esc(t.tienda)}</strong></td>${t.vals.map((v) => `<td class="num">${v || '<span class="muted">0</span>'}</td>`).join("")}<td class="num"><b>${t.vals.reduce((a, b) => a + b, 0)}</b></td></tr>`).join("")}
            <tr class="total-row"><td><strong>Total</strong></td>${m.premios.map((pz) => `<td class="num"><b>${pz.mes}</b></td>`).join("")}<td class="num"><b>${m.premios.reduce((a, b) => a + b.mes, 0)}</b></td></tr>
          </tbody>
        </table></div>
      </div>

      ${(CFG.RULETA || []).length ? `<div class="card panel">
        <div class="panel-head"><h3>Ruleta Gira y Gana · ${esc(ymLabel(state.ym))}</h3><span class="muted">Control de giros: cada voucher debería tener un giro</span></div>
        <div class="prize-cards">
          <div class="prize"><div class="lbl">Giros realizados</div><div class="val">${fmtN(m.ruleta.giros)}</div><div class="sub">${m.ruleta.vouchersConGiro} vouchers registrados con ruleta</div></div>
          <div class="prize"><div class="lbl">Giros sin voucher</div><div class="val" style="color:${m.ruleta.giros - m.ruleta.conRegistro > 0 ? "var(--coral)" : "var(--purple)"}">${fmtN(m.ruleta.giros - m.ruleta.conRegistro)}</div><div class="sub">Descartados o aún sin registrar</div></div>
          ${m.ruleta.dist.map((d) => `<div class="prize"><div class="lbl">${esc({lapicero:"Lapicero",adhesivo:"Adhesivo",especial:"Premio especial",ninguno:"Sigue intentando"}[d.tipo] || d.tipo)}</div><div class="val">${d.n}</div>
            <div class="prog"><div style="width:${m.ruleta.giros ? (d.n / m.ruleta.giros) * 100 : 0}%"></div></div>
            <div class="sub">${m.ruleta.giros ? pct(d.n / m.ruleta.giros) : "—"} real · ${pct(d.esperado)} esperado</div></div>`).join("")}
        </div>
        ${m.ruleta.porPromo.length ? `<div class="table-wrap" style="margin-top:14px"><table class="ind-table"><thead><tr><th>Promotora</th><th class="num">Giros</th><th class="num">Sin voucher</th><th class="num">Premios especiales</th></tr></thead><tbody>
          ${m.ruleta.porPromo.map(([p, x]) => `<tr><td><strong>${esc(p)}</strong></td><td class="num">${x.giros}</td><td class="num">${x.sinReg ? `<span class="pill ${x.sinReg >= 3 ? "bad" : "warn"}">${x.sinReg}</span>` : '<span class="pill ok">0</span>'}</td><td class="num">${x.esp}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
      </div>` : ""}

      <div class="two-col">
        <div class="card panel"><div class="panel-head"><h3>Horas pico</h3><span class="muted">Vouchers del mes por hora</span></div>
          ${columnChart(Object.keys(m.hours).map((h) => h + "h"), Object.values(m.hours))}
          <p class="insight">${insightHours(m.hours)}</p></div>
        <div class="card panel"><div class="panel-head"><h3>Días de la semana</h3><span class="muted">Promedio de vouchers por día</span></div>
          ${columnChart([1, 2, 3, 4, 5, 6, 0].map((d) => DOW[d]), [1, 2, 3, 4, 5, 6, 0].map((d) => (m.dowCnt[d] ? m.dowTot[d] / m.dowCnt[d] : 0)), { fmt: (v) => fmt1(v) })}
          <p class="insight">${insightDow(m)}</p></div>
      </div>`;

    bind(m);
  }

  function hourFmtHM(iso) {
    return new Intl.DateTimeFormat("es-PE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  }
  function insightHours(hours) {
    const e = Object.entries(hours).filter(([, v]) => v > 0);
    if (!e.length) return "Aún no hay datos suficientes.";
    const tot = e.reduce((a, [, v]) => a + v, 0);
    let best = 0, bh = 0;
    for (let h = 7; h <= 20; h++) { const s = (hours[h] || 0) + (hours[h + 1] || 0) + (hours[h + 2] || 0); if (s > best) { best = s; bh = h; } }
    return `La franja <b>${bh}:00 – ${bh + 3}:00</b> concentra el <b>${pct(best / tot)}</b> de los registros. Asegura presencia de promotoras en ese horario.`;
  }
  function insightDow(m) {
    const avgs = [0, 1, 2, 3, 4, 5, 6].map((d) => (m.dowCnt[d] ? m.dowTot[d] / m.dowCnt[d] : 0));
    const mx = Math.max(...avgs);
    if (!mx) return "Aún no hay datos suficientes.";
    const d = avgs.indexOf(mx);
    const pos = avgs.filter((v, i) => m.dowCnt[i] > 0 && v > 0);
    const mn = Math.min(...pos), dm = avgs.indexOf(mn);
    return mn < mx ? `El <b>${DOW[d]}</b> es el día más productivo (${fmt1(mx)} por día); el <b>${DOW[dm]}</b> el más bajo (${fmt1(mn)}).` : `El <b>${DOW[d]}</b> es el día más productivo.`;
  }

  function bind(m) {
    const $ = (id) => el.querySelector("#" + id);
    $("mMes").onchange = (e) => {
      state.ym = e.target.value;
      state.day = state.ym === todayKey().slice(0, 7) ? todayKey() : monthDays(state.ym).slice(-1)[0];
      render();
    };
    $("mDia").onchange = (e) => { if (e.target.value) { state.day = e.target.value; state.ym = state.day.slice(0, 7); render(); } };
    el.querySelectorAll("[data-day]").forEach((r) => r.addEventListener("click", () => { state.day = r.dataset.day; render(); }));
    el.querySelectorAll(".seg [data-view]").forEach((b) => (b.onclick = () => { state.view = b.dataset.view; try { sessionStorage.setItem("m_view", state.view); } catch {} render(); }));
    if ($("mTienda")) $("mTienda").onchange = (e) => { state.tienda = e.target.value; try { sessionStorage.setItem("m_tienda", state.tienda); } catch {} render(); };
    if ($("mRutaCsv")) $("mRutaCsv").onclick = () => exportRoute(m);
    $("mCfgBtn").onclick = () => { state.showCfg = !state.showCfg; $("mCfg").classList.toggle("hidden", !state.showCfg); };
    $("cSave").onclick = async () => {
      const meta = Math.max(0, parseInt($("cMeta").value || "0", 10) || 0);
      const dias = [...el.querySelectorAll(".dow-pick input:checked")].map((i) => parseInt(i.value, 10));
      if (!dias.length) { $("cMsg").textContent = "Elige al menos un día."; return; }
      $("cSave").disabled = true; $("cMsg").textContent = "Guardando…";
      try {
        await API.savePanelConfig({ meta_promotora_mes: meta, dias_activacion: dias });
        cfg = { meta_promotora_mes: meta, dias_activacion: dias };
        state.showCfg = false;
        render();
      } catch (err) {
        $("cMsg").textContent = "No se pudo guardar: " + err.message;
        $("cSave").disabled = false;
      }
    };
    $("mCsv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["Promotora", "Tiendas", `Hoy (${state.day})`, "Últimos 7 días", `Mes (${state.ym})`, "Unidades mes", "Meta", "Avance %", "Ritmo necesario/día", "Proyección", "Constancia %", "Estado"];
      const lines = m.promos.map((p) => [p.promotora, p.tiendas.join(" / "), p.hoy, p.sem, p.mes, p.unidades, m.meta || "", isFinite(p.avance) ? Math.round(p.avance * 100) : "", isFinite(p.ritmo) ? p.ritmo.toFixed(1) : "", p.proj, m.elapsedAct.length ? Math.round((p.activeDays / m.elapsedAct.length) * 100) : "", ESTADO[p.estado][0]].map(q).join(";"));
      const tHead = ["Tienda", "Promotora", "Día sel.", "Mes", "Unidades mes", "Participación %", "Días sin registro"];
      const tLines = m.tiendas.map((t) => [t.tienda, t.promotora, t.hoy, t.mes, t.unidades, Math.round(t.share * 100), t.sinReg].map(q).join(";"));
      const csv = "﻿" + head.map(q).join(";") + "\n" + lines.join("\n") + "\n\n" + tHead.map(q).join(";") + "\n" + tLines.join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `resumen_promotoras_${state.ym}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  window.Metrics = {
    mount(container) { el = container; },
    async setRows(r) {
      rows = r || [];
      if (!state.cfgLoaded) {
        try { cfg = await API.getPanelConfig(); } catch {}
        state.cfgLoaded = true;
      }
      try { spins = API.listSpins ? await API.listSpins() : []; } catch { spins = []; }
      render();
    },
    render,
  };
})();
