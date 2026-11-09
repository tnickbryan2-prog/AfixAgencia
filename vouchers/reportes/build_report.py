#!/usr/bin/env python3
"""Reporte semanal de vouchers Afix · Sodimac (PDF con branding del portal).

Uso:
  python build_report.py metrics data.json [--config vouchers/config.js]
      -> imprime el resumen de KPIs para redactar el análisis
  python build_report.py render data.json analysis.json salida.pdf [--config vouchers/config.js]
  python build_report.py email  data.json analysis.json correo.html [--config vouchers/config.js]
"""
import json, sys, html, datetime as dt
from collections import Counter, defaultdict

TIENDAS = {
    "Sodimac Angamos Primavera (Surquillo)": ["Andrea Apaza"],
    "Sodimac Surquillo (Surquillo)": ["Elizabeth Pizarro"],
    "Sodimac Chacarilla (Santiago de Surco)": ["Elizabeth Pizarro"],
    "Sodimac Atocongo (SJM Open Plaza)": ["Sheyla Rojas"],
    "Sodimac Villa El Salvador": ["Sheyla Rojas"],
    "Sodimac Ate (La Molina)": ["Sheyla Rojas"],
    "Sodimac Javier Prado (La Victoria)": ["Rosa Rios"],
    "Sodimac San Miguel": ["Rosa Rios"],
    "Sodimac Canta Callao (Open Plaza)": ["Cecilia Chipana"],
    "Sodimac Cono Norte (Mega Plaza Independencia)": ["Cecilia Chipana"],
    "Sodimac Naranjal (Los Olivos)": ["Cecilia Chipana"],
}
PREMIOS = ["Lapicero", "Adhesivo Gris 2 oz", "Adhesivo Dorado 2 oz", "Adhesivo Azul 2 oz"]
STOCK_MIN = 5
SIN_PREMIO = "Sin premio (sigue intentando)"
def components(z):
    if not z or z == SIN_PREMIO or str(z).lower().startswith("sin premio"): return []
    return [x.strip() for x in str(z).split(" + ") if x.strip()]
DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]  # isoweekday-1
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_L = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

def load_portal_config(path):
    """Lee TIENDAS, PREMIOS y STOCK_MINIMO del config.js del portal para no duplicarlos."""
    global TIENDAS, PREMIOS, STOCK_MIN
    import re, os
    if not path or not os.path.exists(path): return False
    js = open(path, encoding="utf-8").read()
    t = re.findall(r'tienda:\s*"([^"]+)"\s*,\s*promotoras:\s*\[([^\]]*)\]', js)
    if t: TIENDAS = {name: re.findall(r'"([^"]+)"', ps) for name, ps in t}
    pz = re.search(r'PREMIOS:\s*\[([^\]]*)\]', js)
    if pz: PREMIOS = re.findall(r'"([^"]+)"', pz.group(1)) or PREMIOS
    mn = re.search(r'STOCK_MINIMO:\s*(\d+)', js)
    if mn: STOCK_MIN = int(mn.group(1))
    return True

D = lambda s: dt.date.fromisoformat(str(s)[:10])
esc = lambda s: html.escape(str(s if s is not None else ""))
def pct(x): return "—" if x is None else f"{round(x*100)}%"
def var(a, b):
    if not b: return None
    return (a - b) / b
def fd(d): return f"{d.day} {MESES[d.month-1]}"

# ------------------------------------------------------------------ cálculo
def compute(data):
    s, e = D(data["semana_inicio"]), D(data["semana_fin"])
    ps, pe = s - dt.timedelta(days=7), s - dt.timedelta(days=1)
    days = [s + dt.timedelta(days=i) for i in range(7)]
    meta_mes = int(data.get("meta_promotora_mes") or 0)
    act_pg = set(data.get("dias_activacion") or [1,2,3,4,5,6,0])  # 0=domingo (JS)
    is_act = lambda d: (d.isoweekday() % 7) in act_pg
    # meta semanal = meta mensual × (días de activación de la semana / días de activación del mes de la semana)
    def act_in_month(y, m):
        d0 = dt.date(y, m, 1); n = 0
        while d0.month == m:
            n += is_act(d0); d0 += dt.timedelta(days=1)
        return n or 1
    meta_sem = 0.0
    if meta_mes:
        for d in days:
            if is_act(d): meta_sem += meta_mes / act_in_month(d.year, d.month)

    V = [dict(v, f=D(v["f"])) for v in data.get("vouchers", [])]
    W = [v for v in V if s <= v["f"] <= e]
    P = [v for v in V if ps <= v["f"] <= pe]

    promos = list(dict.fromkeys([p for ps_ in TIENDAS.values() for p in ps_] + [v["p"] for v in W]))
    tiendas = list(dict.fromkeys(list(TIENDAS.keys()) + [v["t"] for v in W]))

    per_day = Counter(v["f"] for v in W); per_day_p = Counter(v["f"] + dt.timedelta(days=7) for v in P)
    inicio = D(data["inicio_campana"]) if data.get("inicio_campana") else s
    act_days = [d for d in days if is_act(d) and d >= inicio]
    k_cnt = Counter(v["k"] for v in W)

    prom_rows = []
    for p in promos:
        pw = [v for v in W if v["p"] == p]; pp = [v for v in P if v["p"] == p]
        dias = len({v["f"] for v in pw})
        best = Counter(v["f"] for v in pw).most_common(1)
        cumpl = (len(pw) / meta_sem) if meta_sem else None
        estado = "Sin meta"
        if cumpl is not None:
            estado = "Cumplió" if cumpl >= 1 else ("En riesgo" if cumpl >= .8 else "Bajo meta")
        prom_rows.append(dict(
            promotora=p, tiendas=sorted({v["t"] for v in pw}),
            semana=len(pw), previa=len(pp), var=var(len(pw), len(pp)),
            meta=round(meta_sem) if meta_sem else None, cumpl=cumpl, estado=estado,
            constancia=(dias / len(act_days)) if act_days else None, dias=dias,
            prom_dia=len(pw) / (len(act_days) or 7),
            mejor_dia=(f"{DOW[best[0][0].isoweekday()-1]} {best[0][0].day} ({best[0][1]})" if best else "—"),
        ))
    prom_rows.sort(key=lambda r: (-r["semana"], r["promotora"]))

    tot = len(W)
    tie_rows = []
    for t in tiendas:
        tw = [v for v in W if v["t"] == t]; tp = [v for v in P if v["t"] == t]
        tie_rows.append(dict(
            tienda=t, promotora=", ".join(sorted({v["p"] for v in tw})) or "—",
            semana=len(tw), previa=len(tp), var=var(len(tw), len(tp)),
            share=(len(tw) / tot) if tot else 0,
            sin_reg=sum(1 for d in act_days if not any(v["f"] == d for v in tw)),
        ))
    tie_rows.sort(key=lambda r: (-r["semana"], r["tienda"]))

    premios_names = list(dict.fromkeys(PREMIOS + [c for v in W for c in components(v.get("z"))]))
    premios_sem = {z: sum(components(v.get("z")).count(z) for v in W) for z in premios_names}

    # stock al cierre de la semana
    rec = defaultdict(int); cli = defaultdict(int); cli_sem = defaultdict(int)
    for r in data.get("stock", []): rec[(r["p"], r["z"])] += int(r.get("rec") or 0) - int(r.get("dev") or 0)
    for r in data.get("clientes_premio", []):
        for c in components(r["z"]): cli[(r["p"], c)] += int(r["n"])
    for v in W:
        for c in components(v.get("z")): cli_sem[(v["p"], c)] += 1
    stock_rows, alertas_stock = [], []
    for p in promos:
        cells = []
        for z in premios_names:
            saldo = rec[(p, z)] - cli[(p, z)]
            uso = cli_sem[(p, z)]
            cob = (saldo / uso) if uso > 0 and saldo > 0 else None  # semanas de cobertura
            cells.append(dict(premio=z, rec=rec[(p, z)], cli=cli[(p, z)], saldo=saldo, uso_sem=uso, cobertura=cob))
            if saldo < 0: alertas_stock.append(f"{p}: {z} en {saldo} (entregó más de lo recibido)")
            elif rec[(p, z)] > 0 and (saldo <= STOCK_MIN or (cob is not None and cob < 1)):
                alertas_stock.append(f"{p}: {z} quedan {saldo}" + (f" (~{cob:.1f} semanas al ritmo actual)" if cob else ""))
        stock_rows.append(dict(promotora=p, cells=cells, saldo=sum(c["saldo"] for c in cells)))

    hours = Counter(v["h"] for v in W)
    dow_cnt = Counter(v["f"].isoweekday() - 1 for v in W)

    return dict(
        s=s, e=e, ps=ps, pe=pe, days=days, act_days=act_days, inicio=inicio,
        total=tot, previa=len(P), var=var(tot, len(P)),
        prom_dia=tot / (len(act_days) or 7),
        unicos=len(k_cnt), repetidos=sum(1 for n in k_cnt.values() if n > 1),
        sin_acepta=sum(1 for v in W if v.get("a") is False),
        meta_mes=meta_mes, meta_sem_equipo=round(meta_sem * len([p for p in promos if any(p in x for x in TIENDAS.values())] or promos)) if meta_sem else None,
        tiendas_activas=sum(1 for r in tie_rows if r["semana"] > 0 and r["tienda"] in TIENDAS), n_tiendas=len(TIENDAS),
        promos_activas=sum(1 for r in prom_rows if r["semana"] > 0), n_promos=len(promos),
        per_day=per_day, per_day_p=per_day_p,
        best_day=max(days, key=lambda d: per_day[d]) if tot else None,
        prom_rows=prom_rows, tie_rows=tie_rows,
        premios_names=premios_names, premios_sem=premios_sem, premios_tot=sum(premios_sem.values()),
        stock_rows=stock_rows, alertas_stock=alertas_stock,
        hours=hours, dow_cnt=dow_cnt, total_historico=data.get("total_historico"),
    )

def summary_text(m):
    L = [f"SEMANA {m['s']} a {m['e']} (previa {m['ps']} a {m['pe']})",
         f"Vouchers: {m['total']} | previa: {m['previa']} | variación: {pct(m['var'])}",
         f"Promedio por día de activación: {m['prom_dia']:.1f} | días de activación contados: {len(m['act_days'])} (inicio de campaña {m['inicio']})",
         f"Clientes únicos: {m['unicos']} | teléfonos repetidos: {m['repetidos']} | sin aceptación: {m['sin_acepta']}",
         f"Meta mensual por promotora: {m['meta_mes'] or 'no definida'} | meta semanal equipo: {m['meta_sem_equipo'] or '—'}",
         f"Tiendas activas: {m['tiendas_activas']}/{m['n_tiendas']} | promotoras activas: {m['promos_activas']}/{m['n_promos']}",
         "Por día: " + ", ".join(f"{DOW[d.isoweekday()-1]} {d.day}: {m['per_day'][d]} (previa {m['per_day_p'][d]})" for d in m["days"]),
         "", "PROMOTORAS:"]
    for r in m["prom_rows"]:
        L.append(f"- {r['promotora']}: {r['semana']} (previa {r['previa']}, var {pct(r['var'])}), meta sem {r['meta'] or '—'}, cumpl {pct(r['cumpl'])}, "
                 f"constancia {r['dias']}/{len(m['act_days'])} días, mejor día {r['mejor_dia']}, estado {r['estado']}")
    L.append("\nTIENDAS:")
    for r in m["tie_rows"]:
        L.append(f"- {r['tienda']} ({r['promotora']}): {r['semana']} (previa {r['previa']}, var {pct(r['var'])}), share {pct(r['share'])}, días sin registro {r['sin_reg']}")
    L.append("\nPREMIOS SEMANA: " + ", ".join(f"{z}: {n}" for z, n in m["premios_sem"].items()))
    L.append("STOCK AL CIERRE:")
    for r in m["stock_rows"]:
        L.append(f"- {r['promotora']}: " + ", ".join(f"{c['premio']} saldo {c['saldo']} (uso sem {c['uso_sem']})" for c in r["cells"]))
    L.append("ALERTAS STOCK: " + ("; ".join(m["alertas_stock"]) or "ninguna"))
    hrs = sorted(m["hours"].items())
    L.append("HORAS: " + ", ".join(f"{h}h:{n}" for h, n in hrs))
    L.append("DÍA SEMANA: " + ", ".join(f"{DOW[i]}:{m['dow_cnt'][i]}" for i in range(7)))
    return "\n".join(L)

# ------------------------------------------------------------------ SVG
def svg_week(m):
    W_, H_, l, r, t, b = 680, 210, 30, 10, 16, 36
    vals = [m["per_day"][d] for d in m["days"]]; prev = [m["per_day_p"][d] for d in m["days"]]
    mx = max([1] + vals + prev)
    step = next(s_ for s_ in [1, 2, 5, 10, 20, 25, 50, 100, 200, 500] if mx / s_ <= 5)
    top = step * -(-mx // step)
    y = lambda v: t + (H_ - t - b) * (1 - v / top)
    bw = (W_ - l - r) / 7
    g = []
    for i in range(int(top // step) + 1):
        yy = y(i * step); g.append(f'<line x1="{l}" x2="{W_-r}" y1="{yy:.1f}" y2="{yy:.1f}" class="grid"/><text x="{l-6}" y="{yy+4:.1f}" class="ax" text-anchor="end">{i*step}</text>')
    for i, d in enumerate(m["days"]):
        x = l + i * bw
        if d not in m["act_days"]: g.append(f'<rect x="{x:.1f}" y="{t}" width="{bw:.1f}" height="{H_-t-b}" class="off"/>')
        pv, v = prev[i], vals[i]
        if pv: g.append(f'<rect x="{x+bw*.14:.1f}" y="{y(pv):.1f}" width="{bw*.3:.1f}" height="{y(0)-y(pv):.1f}" rx="2" class="prev"/>')
        if v:
            g.append(f'<rect x="{x+bw*.46:.1f}" y="{y(v):.1f}" width="{bw*.4:.1f}" height="{y(0)-y(v):.1f}" rx="3" class="cur"/>')
            g.append(f'<text x="{x+bw*.66:.1f}" y="{y(v)-4:.1f}" class="val" text-anchor="middle">{v}</text>')
        g.append(f'<text x="{x+bw/2:.1f}" y="{H_-b+15}" class="ax" text-anchor="middle">{DOW[i]} {d.day}</text>')
    g.append(f'<line x1="{l}" x2="{W_-r}" y1="{y(0):.1f}" y2="{y(0):.1f}" class="base"/>')
    return f'<svg viewBox="0 0 {W_} {H_}" class="chart">{"".join(g)}</svg>'

def svg_cols(labels, values, hi=True):
    W_, H_, l, r, t, b = 330, 150, 6, 6, 16, 22
    mx = max([1] + values); bw = (W_ - l - r) / len(labels); g = []
    top = values.index(max(values)) if values and max(values) > 0 else -1
    for i, (lb, v) in enumerate(zip(labels, values)):
        h = (H_ - t - b) * v / mx; x = l + i * bw
        if v:
            g.append(f'<rect x="{x+bw*.15:.1f}" y="{H_-b-h:.1f}" width="{bw*.7:.1f}" height="{h:.1f}" rx="2" class="{"cur" if (hi and i==top) else "soft"}"/>')
            g.append(f'<text x="{x+bw/2:.1f}" y="{H_-b-h-3:.1f}" class="val sm" text-anchor="middle">{v}</text>')
        g.append(f'<text x="{x+bw/2:.1f}" y="{H_-b+13}" class="ax sm" text-anchor="middle">{lb}</text>')
    g.append(f'<line x1="{l}" x2="{W_-r}" y1="{H_-b}" y2="{H_-b}" class="base"/>')
    return f'<svg viewBox="0 0 {W_} {H_}" class="chart">{"".join(g)}</svg>'

# ------------------------------------------------------------------ HTML
CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1d1424; font-size: 10.5px; line-height: 1.42; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; min-height: 297mm; padding: 0 0 12mm; page-break-after: always; position: relative; background: #f7f5f9; }
.page:last-child { page-break-after: auto; }
.hdr { background: linear-gradient(120deg, #74119e 0%, #560c76 65%, #c93f3f 140%); color: #fff; padding: 11mm 13mm 16mm; }
.hdr.sm { padding: 7mm 13mm 12mm; }
.hdr .row { display: flex; align-items: center; gap: 12px; }
.mark { width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,.18); display: grid; place-items: center; font-weight: 800; font-size: 16px; }
.hdr h1 { margin: 0; font-size: 21px; letter-spacing: -.3px; }
.hdr h2 { margin: 0; font-size: 15px; }
.hdr p { margin: 2px 0 0; opacity: .86; font-size: 11px; }
.hdr .tag { margin-left: auto; background: rgba(255,255,255,.16); border-radius: 999px; padding: 6px 12px; font-weight: 700; font-size: 11px; }
.body { padding: 0 13mm; margin-top: -9mm; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card { background: #fff; border: 1px solid #e7e1ec; border-radius: 11px; padding: 11px 12px; box-shadow: 0 1px 2px rgba(29,20,36,.05); }
.kpi .l { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #6b6274; font-weight: 700; }
.kpi .v { font-size: 22px; font-weight: 800; letter-spacing: -.5px; margin-top: 2px; }
.kpi .v small { font-size: 12px; color: #6b6274; font-weight: 600; }
.kpi.acc .v { color: #74119e; }
.kpi .s { font-size: 9px; color: #6b6274; }
.up { color: #1f8a4c; font-weight: 700; } .down { color: #c93f3f; font-weight: 700; }
.sec { margin-top: 10px; }
h3 { font-size: 12px; margin: 0 0 7px; display: flex; justify-content: space-between; align-items: baseline; }
h3 span { font-size: 9px; color: #6b6274; font-weight: 500; }
.exec li { margin: 0 0 5px; }
.exec ul { margin: 0; padding-left: 16px; font-size: 11px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .04em; color: #6b6274; padding: 5px 6px; border-bottom: 1px solid #e7e1ec; background: #fbfafc; }
td { padding: 5px 6px; border-bottom: 1px solid #f0ecf3; vertical-align: middle; }
.n { text-align: right; font-variant-numeric: tabular-nums; }
.mut { color: #6b6274; } .xs { font-size: 8.5px; }
.pill { display: inline-block; font-size: 8.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.ok { background: #e5f5ec; color: #1f8a4c; } .warn { background: #fdf3dc; color: #9a6a00; } .bad { background: #fbeaea; color: #c93f3f; } .neu { background: #f0edf2; color: #6b6274; }
.bar { height: 6px; background: #f3e8f8; border-radius: 99px; overflow: hidden; min-width: 60px; }
.bar > i { display: block; height: 100%; background: #74119e; border-radius: 99px; }
.bar > i.ok { background: #1f8a4c; } .bar > i.warn { background: #d99a1e; } .bar > i.bad { background: #c93f3f; }
.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: #ece6f0; } .chart .base { stroke: #cfc5d6; }
.chart .ax { font-size: 10px; fill: #6b6274; } .chart .ax.sm { font-size: 9px; }
.chart .val { font-size: 10px; fill: #1d1424; font-weight: 700; } .chart .val.sm { font-size: 9px; }
.chart .cur { fill: #74119e; } .chart .prev { fill: #d9c6e4; } .chart .soft { fill: #a46bc0; } .chart .off { fill: #f6f3f8; }
.legend { display: flex; gap: 12px; font-size: 8.5px; color: #6b6274; margin-top: 4px; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.st td.sneg { background: #fbeaea; color: #c93f3f; font-weight: 800; }
.st td.slow { background: #fffaf0; color: #9a6a00; font-weight: 800; }
.st td.sok { color: #1f8a4c; font-weight: 800; }
.alert { border-radius: 9px; padding: 7px 10px; font-size: 9.5px; margin-bottom: 6px; border: 1px solid #f2e2b8; background: #fffaf0; }
.alert b { color: #8a5d00; }
.find { border-left: 3px solid #74119e; padding: 6px 10px; background: #fff; border-radius: 0 9px 9px 0; margin-bottom: 7px; }
.find b { display: block; font-size: 11px; margin-bottom: 2px; }
.find.coral { border-color: #c93f3f; }
.act td { font-size: 10px; }
.prio { font-weight: 800; }
.foot { position: absolute; bottom: 5mm; left: 13mm; right: 13mm; font-size: 8px; color: #8a8191; display: flex; justify-content: space-between; }
"""

def kpi(label, val, sub="", acc=False):
    return f'<div class="card kpi{" acc" if acc else ""}"><div class="l">{esc(label)}</div><div class="v">{val}</div><div class="s">{sub}</div></div>'

def delta(x, txt="vs semana previa"):
    if x is None: return f'<span class="mut">Sin datos de la semana previa</span>'
    return f'<span class="{"up" if x >= 0 else "down"}">{"▲" if x >= 0 else "▼"} {pct(abs(x))}</span> {txt}'

def render_html(m, a, generado):
    rng = f"{fd(m['s'])} al {fd(m['e'])} {m['e'].year}"
    foot = lambda n: f'<div class="foot"><span>Artecola Perú · Marketing · Reporte semanal de vouchers Afix – Sodimac</span><span>Semana {esc(rng)} · Pág. {n}</span></div>'
    hdr_sm = lambda title: f'<div class="hdr sm"><div class="row"><div class="mark">A</div><div><h2>{esc(title)}</h2><p>Semana del {esc(rng)}</p></div></div></div>'

    meta_txt = ""
    if m["meta_sem_equipo"]:
        c = m["total"] / m["meta_sem_equipo"]
        meta_txt = kpi("Cumplimiento meta semanal", pct(c), f'{m["total"]} de {m["meta_sem_equipo"]} vouchers (equipo)')
    else:
        meta_txt = kpi("Cumplimiento meta semanal", "—", "Meta no definida en el panel")

    # Página 1 — resumen ejecutivo
    p1 = f"""
    <div class="page">
      <div class="hdr"><div class="row"><div class="mark">A</div>
        <div><h1>Reporte semanal · Activación Afix PVC</h1><p>Sodimac Lima · Semana del {esc(rng)}</p></div>
        <div class="tag">Para Gerencia</div></div></div>
      <div class="body">
        <div class="grid4">
          {kpi("Vouchers de la semana", m["total"], delta(m["var"]), True)}
          {kpi("Promedio por día", f'{m["prom_dia"]:.1f}', f'{len(m["act_days"])} días de activación')}
          {meta_txt}
          {kpi("Clientes únicos", m["unicos"], f'{m["repetidos"]} teléfono(s) repetido(s)')}
        </div>
        <div class="grid4 sec">
          {kpi("Tiendas con registros", f'{m["tiendas_activas"]}<small> / {m["n_tiendas"]}</small>', "Cobertura de la semana")}
          {kpi("Promotoras activas", f'{m["promos_activas"]}<small> / {m["n_promos"]}</small>', "Con al menos 1 voucher")}
          {kpi("Premios entregados", m["premios_tot"], " · ".join(f'{esc(z.replace(" 2 oz",""))} {n}' for z, n in m["premios_sem"].items() if n) or "—")}
          {kpi("Mejor día", (f'{DOW[m["best_day"].isoweekday()-1]} {m["best_day"].day}' if m["best_day"] else "—"), (f'{m["per_day"][m["best_day"]]} vouchers' if m["best_day"] else ""))}
        </div>
        <div class="card sec exec"><h3>Resumen ejecutivo</h3><ul>{"".join(f"<li>{x}</li>" for x in a.get("resumen", []))}</ul></div>
        <div class="card sec"><h3>Vouchers por día <span>Semana actual vs semana previa</span></h3>{svg_week(m)}
          <div class="legend"><span><i style="background:#74119e"></i>Semana {esc(fd(m['s']))}–{esc(fd(m['e']))}</span><span><i style="background:#d9c6e4"></i>Semana previa</span><span><i style="background:#f6f3f8;border:1px solid #e7e1ec"></i>Día sin activación o antes del inicio</span></div></div>
      </div>{foot(1)}
    </div>"""

    # Página 2 — promotoras y tiendas
    def est_cls(e): return {"Cumplió": "ok", "En riesgo": "warn", "Bajo meta": "bad"}.get(e, "neu")
    prow = "".join(f"""<tr><td><b>{esc(r['promotora'])}</b><div class="mut xs">{esc(' · '.join(t.replace('Sodimac ','') for t in r['tiendas']))}</div></td>
      <td class="n"><b>{r['semana']}</b></td><td class="n">{r['previa']}</td><td class="n">{('<span class="up">+' if (r['var'] or 0)>=0 else '<span class="down">')+pct(r['var'])+'</span>' if r['var'] is not None else '<span class="mut">—</span>'}</td>
      <td class="n">{r['meta'] or '—'}</td>
      <td>{(f'<div class="bar"><i class="{est_cls(r["estado"])}" style="width:{min(100,(r["cumpl"] or 0)*100):.0f}%"></i></div><div class="xs mut">{pct(r["cumpl"])}</div>') if r['cumpl'] is not None else '<span class="mut xs">Sin meta</span>'}</td>
      <td class="n">{r['dias']}/{len(m['act_days'])}</td><td class="n">{r['prom_dia']:.1f}</td><td class="xs">{esc(r['mejor_dia'])}</td>
      <td><span class="pill {est_cls(r['estado'])}">{esc(r['estado'])}</span></td></tr>""" for r in m["prom_rows"])
    trow = "".join(f"""<tr><td><b>{esc(r['tienda'])}</b></td><td class="mut">{esc(r['promotora'])}</td><td class="n"><b>{r['semana']}</b></td><td class="n">{r['previa']}</td>
      <td class="n">{('<span class="up">+' if (r['var'] or 0)>=0 else '<span class="down">')+pct(r['var'])+'</span>' if r['var'] is not None else '<span class="mut">—</span>'}</td>
      <td><div class="bar"><i style="width:{r['share']*100:.0f}%"></i></div><div class="xs mut">{pct(r['share'])}</div></td>
      <td class="n">{'<span class="pill ok">0</span>' if r['sin_reg']==0 else f'<span class="pill {"bad" if r["sin_reg"]>=3 else "warn"}">{r["sin_reg"]}</span>'}</td></tr>""" for r in m["tie_rows"])
    p2 = f"""
    <div class="page">{hdr_sm("Desempeño por promotora y tienda")}
      <div class="body">
        <div class="card"><h3>Ranking de promotoras <span>Meta semanal = meta mensual prorrateada por días de activación</span></h3>
          <table><thead><tr><th>Promotora</th><th class="n">Semana</th><th class="n">Previa</th><th class="n">Var.</th><th class="n">Meta</th><th style="width:90px">Cumplimiento</th><th class="n">Constancia</th><th class="n">Prom./día</th><th>Mejor día</th><th>Estado</th></tr></thead><tbody>{prow}</tbody></table></div>
        <div class="card sec"><h3>Rendimiento por tienda <span>Días sin registro = días de activación con 0 vouchers</span></h3>
          <table><thead><tr><th>Tienda</th><th>Promotora</th><th class="n">Semana</th><th class="n">Previa</th><th class="n">Var.</th><th style="width:90px">Participación</th><th class="n">Días sin registro</th></tr></thead><tbody>{trow}</tbody></table></div>
        <div class="grid2 sec">
          <div class="card"><h3>Horas pico <span>Vouchers por hora</span></h3>{svg_cols([f"{h}h" for h in range(9,22)], [m['hours'].get(h,0) for h in range(9,22)])}</div>
          <div class="card"><h3>Días de la semana <span>Vouchers por día</span></h3>{svg_cols(DOW, [m['dow_cnt'].get(i,0) for i in range(7)])}</div>
        </div>
      </div>{foot(2)}
    </div>"""

    # Página 3 — premios, stock, hallazgos y acciones
    def scls(c):
        if c["saldo"] < 0: return "sneg"
        if c["rec"] > 0 and (c["saldo"] <= STOCK_MIN or (c["cobertura"] is not None and c["cobertura"] < 1)): return "slow"
        if c["rec"] > 0: return "sok"
        return "mut"
    srow = "".join(f"""<tr><td><b>{esc(r['promotora'])}</b></td>{''.join(f'<td class="n {scls(c)}">{c["saldo"]}<div class="xs mut" style="font-weight:400">uso sem. {c["uso_sem"]}</div></td>' for c in r['cells'])}<td class="n"><b>{r['saldo']}</b></td></tr>""" for r in m["stock_rows"])
    neg = [x for x in m["alertas_stock"] if "entregó más" in x]; low = [x for x in m["alertas_stock"] if x not in neg]
    alerts = ""
    if neg: alerts += f'<div class="alert" style="background:#fbeaea;border-color:#f1c9c9"><b style="color:#c93f3f">Saldo negativo (falta registrar entregas):</b> {esc(" · ".join(x.replace(" (entregó más de lo recibido)","") for x in neg))}</div>'
    if low: alerts += f'<div class="alert"><b>Reponer pronto:</b> {esc(" · ".join(low))}</div>' 
    finds = "".join(f'<div class="find"><b>{esc(f.get("titulo",""))}</b>{esc(f.get("detalle",""))}</div>' for f in a.get("hallazgos", []))
    mejoras = "".join(f'<div class="find coral"><b>{esc(f.get("titulo",""))}</b>{esc(f.get("detalle",""))}</div>' for f in a.get("mejoras", []))
    acts = "".join(f"""<tr><td class="prio">{i+1}</td><td><b>{esc(x.get('accion',''))}</b><div class="mut xs">{esc(x.get('impacto',''))}</div></td><td>{esc(x.get('responsable',''))}</td><td>{esc(x.get('plazo',''))}</td>
      <td><span class="pill {'bad' if x.get('prioridad','').lower()=='alta' else 'warn' if x.get('prioridad','').lower()=='media' else 'neu'}">{esc(x.get('prioridad',''))}</span></td></tr>""" for i, x in enumerate(a.get("acciones", [])))
    p3 = f"""
    <div class="page">{hdr_sm("Premios, stock y plan de acción")}
      <div class="body">
        <div class="card"><h3>Stock de premios al cierre de la semana <span>Saldo = recibido − entregado a clientes · amarillo: ≤{STOCK_MIN} o menos de 1 semana de cobertura</span></h3>
          <table class="st"><thead><tr><th>Promotora</th>{''.join(f'<th class="n">{esc(z)}</th>' for z in m['premios_names'])}<th class="n">Total</th></tr></thead><tbody>{srow}</tbody></table>
          <div style="margin-top:7px">{alerts}</div></div>
        <div class="grid2 sec">
          <div><h3 style="margin-top:4px">Hallazgos de la semana</h3>{finds}</div>
          <div><h3 style="margin-top:4px">Puntos de mejora</h3>{mejoras}</div>
        </div>
        <div class="card sec act"><h3>Acciones recomendadas para la próxima semana</h3>
          <table><thead><tr><th>#</th><th>Acción</th><th>Responsable</th><th>Plazo</th><th>Prioridad</th></tr></thead><tbody>{acts}</tbody></table></div>
        <p class="mut xs" style="margin-top:8px">Fuente: portal de registro de vouchers (Supabase). Generado el {esc(generado)}. Constancia = días con al menos un voucher sobre días de activación. Datos de clientes anonimizados.</p>
      </div>{foot(3)}
    </div>"""
    return f'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte semanal vouchers {esc(rng)}</title><style>{CSS}</style></head><body>{p1}{p2}{p3}</body></html>'


# ------------------------------------------------------------------ EMAIL (HTML compatible con Gmail/Outlook)
def render_email(m, a, generado):
    P, C, INK, MUT, LINE, SOFT = "#74119e", "#c93f3f", "#1d1424", "#6b6274", "#e7e1ec", "#f3e8f8"
    rng = f"{fd(m['s'])} al {fd(m['e'])} {m['e'].year}"
    td = lambda x, st="": f'<td style="padding:7px 8px;border-bottom:1px solid #f0ecf3;font-size:13px;{st}">{x}</td>'
    th = lambda x, al="left": f'<th align="{al}" style="padding:7px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:{MUT};background:#fbfafc;border-bottom:1px solid {LINE};">{x}</th>'
    def bar(frac, color=P):
        w = max(0, min(100, round((frac or 0) * 100)))
        return (f'<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:{SOFT};border-radius:6px"><tr>'
                + (f'<td width="{w}%" style="background:{color};height:8px;border-radius:6px;font-size:0;line-height:0">&nbsp;</td>' if w else "")
                + f'<td style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr></table>')
    def dlt(x):
        if x is None: return f'<span style="color:{MUT}">—</span>'
        return f'<span style="color:{"#1f8a4c" if x >= 0 else C};font-weight:700">{"▲" if x >= 0 else "▼"} {pct(abs(x))}</span>'
    def card(label, val, sub):
        return (f'<td width="25%" valign="top" style="padding:4px"><table role="presentation" width="100%" style="background:#fff;border:1px solid {LINE};border-radius:10px"><tr><td style="padding:12px">'
                f'<div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:{MUT};font-weight:700">{label}</div>'
                f'<div style="font-size:24px;font-weight:800;color:{INK};margin-top:2px">{val}</div><div style="font-size:11px;color:{MUT}">{sub}</div></td></tr></table></td>')
    est_col = {"Cumplió": "#1f8a4c", "En riesgo": "#d99a1e", "Bajo meta": C}
    meta_v = pct(m["total"] / m["meta_sem_equipo"]) if m["meta_sem_equipo"] else "—"
    meta_s = f'{m["total"]} de {m["meta_sem_equipo"]}' if m["meta_sem_equipo"] else "Meta no definida"
    maxd = max([1] + [m["per_day"][d] for d in m["days"]])
    days = "".join(f'<tr>{td(f"{DOW[d.isoweekday()-1]} {d.day}", "width:70px;color:"+MUT)}<td style="padding:5px 8px;border-bottom:1px solid #f0ecf3">{bar(m["per_day"][d]/maxd)}</td>{td("<b>"+str(m["per_day"][d])+"</b>", "text-align:right;width:40px")}{td(str(m["per_day_p"][d]), "text-align:right;width:50px;color:"+MUT)}</tr>' for d in m["days"])
    prom = "".join("<tr>" + td(f'<b>{esc(r["promotora"])}</b><br><span style="font-size:11px;color:{MUT}">{esc(" · ".join(t.replace("Sodimac ","") for t in r["tiendas"]))}</span>')
        + td(f'<b>{r["semana"]}</b>', "text-align:right") + td(str(r["previa"]), "text-align:right;color:"+MUT) + td(dlt(r["var"]), "text-align:right")
        + td((bar(r["cumpl"], est_col.get(r["estado"], P)) + f'<span style="font-size:11px;color:{MUT}">{pct(r["cumpl"])} de {r["meta"]}</span>') if r["cumpl"] is not None else f'<span style="color:{MUT};font-size:11px">Sin meta</span>', "width:110px")
        + td(f'{r["dias"]}/{len(m["act_days"])}', "text-align:right")
        + td(f'<span style="color:{est_col.get(r["estado"], MUT)};font-weight:700">{esc(r["estado"])}</span>') + "</tr>" for r in m["prom_rows"])
    tie = "".join("<tr>" + td(f'<b>{esc(r["tienda"].replace("Sodimac ",""))}</b><br><span style="font-size:11px;color:{MUT}">{esc(r["promotora"])}</span>')
        + td(f'<b>{r["semana"]}</b>', "text-align:right") + td(dlt(r["var"]), "text-align:right")
        + td(bar(r["share"]) + f'<span style="font-size:11px;color:{MUT}">{pct(r["share"])}</span>', "width:100px")
        + td(f'<span style="color:{"#1f8a4c" if r["sin_reg"]==0 else (C if r["sin_reg"]>=3 else "#9a6a00")};font-weight:700">{r["sin_reg"]}</span>', "text-align:right") + "</tr>" for r in m["tie_rows"])
    def scol(c):
        if c["saldo"] < 0: return C
        if c["rec"] > 0 and (c["saldo"] <= STOCK_MIN or (c["cobertura"] is not None and c["cobertura"] < 1)): return "#9a6a00"
        return "#1f8a4c" if c["rec"] > 0 else MUT
    stock = "".join("<tr>" + td(f'<b>{esc(r["promotora"])}</b>') + "".join(td(f'<b style="color:{scol(c)}">{c["saldo"]}</b>', "text-align:right") for c in r["cells"]) + td(f'<b>{r["saldo"]}</b>', "text-align:right") + "</tr>" for r in m["stock_rows"])
    alert = (f'<p style="margin:8px 0 0;font-size:12px;background:#fffaf0;border:1px solid #f2e2b8;border-radius:8px;padding:8px 10px"><b style="color:#8a5d00">Alertas de stock:</b> {esc(" · ".join(m["alertas_stock"]))}</p>') if m["alertas_stock"] else ""
    lst = lambda items, color: "".join(f'<tr><td style="border-left:3px solid {color};background:#fff;padding:8px 12px;border-radius:0 8px 8px 0"><b style="font-size:13px">{esc(x.get("titulo",""))}</b><br><span style="font-size:12.5px;color:{INK}">{esc(x.get("detalle",""))}</span></td></tr><tr><td style="height:6px;font-size:0">&nbsp;</td></tr>' for x in items)
    pcol = lambda p: {"alta": C, "media": "#d99a1e"}.get((p or "").lower(), MUT)
    acts = "".join("<tr>" + td(f'<b>{i+1}</b>', "width:20px") + td(f'<b>{esc(x.get("accion",""))}</b><br><span style="font-size:11px;color:{MUT}">{esc(x.get("impacto",""))}</span>')
        + td(esc(x.get("responsable",""))) + td(esc(x.get("plazo",""))) + td(f'<b style="color:{pcol(x.get("prioridad"))}">{esc(x.get("prioridad",""))}</b>') + "</tr>" for i, x in enumerate(a.get("acciones", [])))
    sec = lambda title, inner: (f'<tr><td style="padding:6px 16px"><table role="presentation" width="100%" style="background:#fff;border:1px solid {LINE};border-radius:12px"><tr><td style="padding:14px">'
        f'<div style="font-size:15px;font-weight:800;color:{INK};margin-bottom:8px">{title}</div>{inner}</td></tr></table></td></tr>')
    tbl = lambda head, body: f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">{head}{body}</table>'
    best = f'{DOW[m["best_day"].isoweekday()-1]} {m["best_day"].day}' if m["best_day"] else "—"
    return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f7f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:{INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f9"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%">
<tr><td style="background:{P};background-image:linear-gradient(120deg,#74119e 0%,#560c76 65%,#c93f3f 140%);padding:24px 20px;color:#fff">
  <div style="font-size:12px;opacity:.85;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Artecola Perú · Reporte para Gerencia</div>
  <div style="font-size:22px;font-weight:800;margin-top:4px">Activación Afix PVC · Sodimac</div>
  <div style="font-size:14px;opacity:.9;margin-top:2px">Semana del {esc(rng)}</div></td></tr>
<tr><td style="padding:12px 12px 0"><table role="presentation" width="100%"><tr>
  {card("Vouchers", m["total"], dlt(m["var"]) + " vs previa")}{card("Prom. por día", f'{m["prom_dia"]:.1f}', f'{len(m["act_days"])} días')}{card("Meta semanal", meta_v, meta_s)}{card("Clientes únicos", m["unicos"], f'{m["repetidos"]} repetidos')}
</tr><tr>
  {card("Tiendas activas", f'{m["tiendas_activas"]}/{m["n_tiendas"]}', "con registros")}{card("Promotoras activas", f'{m["promos_activas"]}/{m["n_promos"]}', "con registros")}{card("Premios", m["premios_tot"], "entregados")}{card("Mejor día", best, (f'{m["per_day"][m["best_day"]]} vouchers' if m["best_day"] else ""))}
</tr></table></td></tr>
{sec("Resumen ejecutivo", '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.5">' + "".join(f'<li style="margin-bottom:6px">{x}</li>' for x in a.get("resumen", [])) + "</ul>")}
{sec("Vouchers por día", tbl("<tr>"+th("Día")+th("")+th("Semana","right")+th("Previa","right")+"</tr>", days))}
{sec("Ranking de promotoras", tbl("<tr>"+th("Promotora")+th("Sem.","right")+th("Prev.","right")+th("Var.","right")+th("Meta")+th("Const.","right")+th("Estado")+"</tr>", prom))}
{sec("Rendimiento por tienda", tbl("<tr>"+th("Tienda")+th("Sem.","right")+th("Var.","right")+th("Particip.")+th("Días sin reg.","right")+"</tr>", tie))}
{sec("Stock de premios al cierre", tbl("<tr>"+th("Promotora")+"".join(th(esc(z.replace(" 2 oz","").replace("Adhesivo ","Adh. ")),"right") for z in m["premios_names"])+th("Total","right")+"</tr>", stock) + alert)}
{sec("Hallazgos de la semana", f'<table role="presentation" width="100%">{lst(a.get("hallazgos", []), P)}</table>')}
{sec("Puntos de mejora", f'<table role="presentation" width="100%">{lst(a.get("mejoras", []), C)}</table>')}
{sec("Acciones recomendadas", tbl("<tr>"+th("#")+th("Acción")+th("Responsable")+th("Plazo")+th("Prioridad")+"</tr>", acts))}
<tr><td style="padding:14px 18px 26px;font-size:11px;color:{MUT}">Fuente: portal de registro de vouchers. Generado el {esc(generado)}. Datos de clientes anonimizados. El PDF de este reporte está disponible en Claude.</td></tr>
</table></td></tr></table></body></html>"""

def to_pdf(html_str, out):
    tmp = out.rsplit(".", 1)[0] + ".html"
    open(tmp, "w", encoding="utf-8").write(html_str)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page()
            pg.goto("file://" + __import__("os").path.abspath(tmp)); pg.wait_for_timeout(300)
            pg.pdf(path=out, format="A4", print_background=True, margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
            b.close()
        return
    except Exception as e:
        print("Playwright no disponible (" + str(e)[:80] + "), probando WeasyPrint…", file=sys.stderr)
    from weasyprint import HTML
    HTML(string=html_str).write_pdf(out)

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--config" in args:
        i = args.index("--config"); ok = load_portal_config(args[i + 1]); del args[i:i + 2]
        print(("Config del portal cargada: " if ok else "config.js no encontrado, uso valores por defecto: ") + f"{len(TIENDAS)} tiendas, {len(PREMIOS)} premios", file=sys.stderr)
    sys.argv = [sys.argv[0]] + args
    cmd = sys.argv[1]
    data = json.load(open(sys.argv[2], encoding="utf-8"))
    if isinstance(data, list): data = data[0]
    if "data" in data and isinstance(data["data"], (dict, str)): data = data["data"] if isinstance(data["data"], dict) else json.loads(data["data"])
    m = compute(data)
    if cmd == "metrics":
        print(summary_text(m))
    elif cmd == "render":
        a = json.load(open(sys.argv[3], encoding="utf-8"))
        gen = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).strftime("%d/%m/%Y %H:%M") + " (Lima)"
        to_pdf(render_html(m, a, gen), sys.argv[4])
        print("PDF generado:", sys.argv[4])
    elif cmd == "email":
        a = json.load(open(sys.argv[3], encoding="utf-8"))
        gen = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).strftime("%d/%m/%Y %H:%M") + " (Lima)"
        out = render_email(m, a, gen)
        open(sys.argv[4], "w", encoding="utf-8").write(out)
        print(f"Email HTML generado: {sys.argv[4]} ({len(out)//1024} KB)")
