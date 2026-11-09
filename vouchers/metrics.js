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
  let el = null, rows = [], cfg = { meta_promotora_mes: 0, dias_activacion: [1, 2, 3, 4, 5, 6, 0] };
  let state = { ym: todayKey().slice(0, 7), day: todayKey(), showCfg: false, cfgLoaded: false };

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

    const R = rows.map((r) => ({ ...r, _d: keyOf(r.created_at), _h: hourOf(r.created_at) }));
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
        mes, avg: pAvg, proj: pProj, activeDays,
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
        share: total ? tr.length / total : 0,
        sinReg: elapsedAct.filter((k) => !daysWith.has(k)).length,
      };
    }).sort((a, b) => b.mes - a.mes);

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
      today, days, actDays, elapsedAct, remainingAfterToday, isCurrent, total, prevSame, avg, proj, unique, dupPhones,
      perDay, best, dayRows, dayHours, promos, tiendas, ruleta, premios, premioNames, premioMatrix, sinPremio, hours, dowTot, dowCnt, alerts, meta,
      metaEquipo: meta * nPromos,
      metaDiariaEquipo: meta && actDays.length ? (meta * nPromos) / actDays.length : 0,
      coberturaHoy: tiendas.filter((t) => t.hoy > 0 && TIENDAS.some((x) => x.tienda === t.tienda)).length,
      promosActivasDia: new Set(dayRows.map((r) => r.promotora)).size,
    };
  }

  // ---------- Gráficos (SVG) ----------
  function dailyChart(m) {
    const W = 900, H = 220, P = { l: 34, r: 10, t: 14, b: 34 };
    const vals = m.days.map((k) => m.perDay[k]);
    const max = Math.max(1, ...vals, Math.ceil(m.metaDiariaEquipo));
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
      const v = m.perDay[k], x = P.l + i * bw;
      const act = m.actDays.includes(k);
      const cls = k === m.today ? "bar today" : k === state.day ? "bar sel" : k > m.today ? "bar future" : act ? "bar" : "bar off";
      if (!act) g += `<rect x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" class="offday"/>`;
      if (v > 0) g += `<rect x="${x + bw * 0.16}" y="${y(v)}" width="${bw * 0.68}" height="${y(0) - y(v)}" rx="3" class="${cls}"><title>${dLabel(k)}: ${v} voucher${v === 1 ? "" : "s"}</title></rect>`;
      if (v > 0 && bw > 18) g += `<text x="${x + bw / 2}" y="${y(v) - 4}" class="val" text-anchor="middle">${v}</text>`;
      const d = parseInt(k.slice(8), 10);
      if (d === 1 || d % 2 === 1 || bw > 26) g += `<text x="${x + bw / 2}" y="${H - P.b + 15}" class="axis${dowOf(k) === 0 ? " sun" : ""}" text-anchor="middle">${d}</text>`;
      g += `<rect x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-day="${k}" style="cursor:pointer"><title>${dLabel(k)}: ${v} — clic para ver el día</title></rect>`;
    });
    if (m.metaDiariaEquipo > 0) {
      const yy = y(m.metaDiariaEquipo);
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="goal"/><text x="${W - P.r}" y="${yy - 5}" class="goal-lbl" text-anchor="end">Meta diaria equipo: ${fmt1(m.metaDiariaEquipo)}</text>`;
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
        <div class="panel-head"><h3>Vouchers por día · ${esc(ymLabel(state.ym))}</h3>
          <span class="muted">${m.best ? `Mejor día: <b>${esc(dLabel(m.best))}</b> con ${m.perDay[m.best]}` : ""}</span></div>
        ${dailyChart(m)}
        <div class="legend"><span><i class="sw today"></i>Hoy</span><span><i class="sw sel"></i>Día seleccionado</span><span><i class="sw off"></i>Día sin activación</span>${m.metaDiariaEquipo ? '<span><i class="sw goal"></i>Meta diaria</span>' : ""}</div>
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
          <thead><tr><th>Promotora</th><th class="num">Hoy</th><th class="num">7 días</th><th class="num">Mes</th><th style="min-width:170px">Avance vs meta</th><th class="num">Ritmo necesario / día</th><th class="num">Proyección</th><th class="num">Constancia</th><th>Último registro</th><th>Estado</th></tr></thead>
          <tbody>${m.promos.length ? m.promos.map((p) => `
            <tr>
              <td><strong>${esc(p.promotora)}</strong><div class="muted small">${esc(p.tiendas.map((t) => t.replace(/^Sodimac\s+/i, "")).join(" · "))}</div></td>
              <td class="num">${p.hoy}</td><td class="num">${p.sem}</td><td class="num"><b>${p.mes}</b></td>
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
          <thead><tr><th>Tienda</th><th>Promotora</th><th class="num">Día sel.</th><th class="num">Mes</th><th style="min-width:160px">Participación</th><th class="num">Días sin registro</th></tr></thead>
          <tbody>${m.tiendas.map((t) => `
            <tr><td><strong>${esc(t.tienda)}</strong></td><td>${esc(t.promotora)}</td><td class="num">${t.hoy}</td><td class="num"><b>${t.mes}</b></td>
              <td><div class="prog"><div style="width:${t.share * 100}%"></div></div><div class="small muted">${pct(t.share)}</div></td>
              <td class="num">${t.sinReg ? `<span class="pill ${t.sinReg >= 3 ? "bad" : "warn"}">${t.sinReg}</span>` : '<span class="pill ok">0</span>'}</td></tr>`).join("")}</tbody>
        </table></div>
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
      const head = ["Promotora", "Tiendas", `Hoy (${state.day})`, "Últimos 7 días", `Mes (${state.ym})`, "Meta", "Avance %", "Ritmo necesario/día", "Proyección", "Constancia %", "Estado"];
      const lines = m.promos.map((p) => [p.promotora, p.tiendas.join(" / "), p.hoy, p.sem, p.mes, m.meta || "", isFinite(p.avance) ? Math.round(p.avance * 100) : "", isFinite(p.ritmo) ? p.ritmo.toFixed(1) : "", p.proj, m.elapsedAct.length ? Math.round((p.activeDays / m.elapsedAct.length) * 100) : "", ESTADO[p.estado][0]].map(q).join(";"));
      const tHead = ["Tienda", "Promotora", "Día sel.", "Mes", "Participación %", "Días sin registro"];
      const tLines = m.tiendas.map((t) => [t.tienda, t.promotora, t.hoy, t.mes, Math.round(t.share * 100), t.sinReg].map(q).join(";"));
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
