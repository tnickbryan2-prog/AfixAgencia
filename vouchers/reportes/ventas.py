"""Afix vs. Oatey en Sodimac para el reporte semanal (misma lógica que la pestaña Análisis tiendas del admin).

Datos: data["ventas"] = últimas cargas del Excel (tabla ventas_cargas) y data["precios_ref"] = precio mediano por marca/SKU.
En el Excel, los meses Ene–Oct son venta OATEY por SKU Sodimac y las columnas de avance (Octubre, Noviembre…) son venta AFIX.
"""
import re, html, unicodedata, calendar, datetime as dt
from statistics import median

esc = lambda s: html.escape(str(s if s is not None else ""))
MES_L = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
META = 0.20
CFG_TIENDAS = []


def load_config(js_text, tiendas):
    global META, CFG_TIENDAS
    m = re.search(r"META_PARTICIPACION:\s*([0-9.]+)", js_text or "")
    if m: META = float(m.group(1))
    CFG_TIENDAS = [nrm(t) for t in tiendas]


def nrm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip()


def en_activacion(nombre):
    k = re.sub(r"^(sodimac|maestro|homecenter)\s+", "", nrm(nombre))
    if not k: return False
    rx = re.compile(r"(^|[\s(])" + re.escape(k) + r"($|[\s)])")
    return any(rx.search(c) for c in CFG_TIENDAS)


def sku_key(s):
    n = nrm(s); oz = re.search(r"(\d+)\s*oz", n)
    c = "naranja" if re.search(r"cpvc|naranja", n) else "azul" if re.search(r"\baz(ul)?\b", n) else "dorado" if re.search(r"\bdor(ado)?\b", n) else "negro" if re.search(r"\bneg(ro)?\b", n) else ""
    return f"{oz.group(1)}|{c}" if oz and c else None


def short_sku(d): return re.sub(r"\s+(Reg|Med)\.?$", "", re.sub(r"^Pegamento\s+", "", str(d or "").rstrip("."), flags=re.I), flags=re.I).strip()
def short_t(t): return re.sub(r"^Maestro\s+(.+)$", r"\1 (M)", re.sub(r"^Sodimac\s+", "", str(t)), flags=re.I)
def fmt(n): return "—" if n is None else f"{round(n):,}"
def pct1(x): return "—" if x is None else f"{x*100:.1f}%".replace(".", ",")
def pctg(x): return "—" if x is None else ("+" if x > 0 else "") + f"{round(x*100)}%"
def money(x): return "—" if x is None else f"S/ {round(x):,}"
def fdc(k):
    if not k: return "sin fecha"
    d = dt.date.fromisoformat(str(k)[:10]); return f"{d.day} {MES[d.month-1]} {d.year}"


def factor(corte, anio, mes_i):
    if not corte: return None
    d = dt.date.fromisoformat(str(corte)[:10])
    last = calendar.monthrange(anio, mes_i + 1)[1]
    if d.year == anio and d.month == mes_i + 1: return last / d.day
    if d > dt.date(anio, mes_i + 1, last): return 1.0
    return None


def _share(a, o): return a / (a + o) if a is not None and (a + o) > 0 else None


def _carga_share(c):
    D = c["datos"]; afx = D.get("avance") or []
    if not afx: return None
    full = [k for k, m in enumerate(D["meses"]) if not m.get("parcial")]
    o = sum(f["m"][k] for f in D["filas"] for k in full) / len(full) if full else 0
    a = sum(f["a"][-1] for f in D["filas"]); fac = factor(c.get("corte") or D.get("corte"), D["anio"], afx[-1]["i"])
    return {"corte": c.get("corte") or D.get("corte"), "mes": afx[-1]["i"], "a": a, "share": _share(a * fac if fac else a, o)}


def compute(data):
    cargas = data.get("ventas") or []
    if not cargas: return None
    C = cargas[0]; D = C["datos"]; afx = D.get("avance") or []
    if not afx: return None
    P = {}
    for r in data.get("precios_ref") or []:
        k = sku_key(r["s"])
        if k and r.get("p") is not None: P[nrm(r["m"]) + "#" + k] = float(r["p"])
    base, propia = (D.get("marcas") or {}).get("base", "Oatey"), (D.get("marcas") or {}).get("propia", "Afix")
    full = [k for k, m in enumerate(D["meses"]) if not m.get("parcial")]
    corte = C.get("corte") or D.get("corte"); LA = len(afx) - 1; PA = LA - 1
    fac = factor(corte, D["anio"], afx[LA]["i"])
    tgt = META / (1 - META)
    rows = []
    for f in D["filas"]:
        o = sum(f["m"][k] for k in full) / len(full) if full else 0
        a = f["a"][LA]; ap = a * fac if fac else a
        pA, pO = P.get(nrm(propia) + "#" + (sku_key(f["d"]) or "")), P.get(nrm(base) + "#" + (sku_key(f["d"]) or ""))
        rows.append({**f, "act": en_activacion(f["t"]), "o": o, "a_last": a, "a_prev": f["a"][PA] if PA >= 0 else None, "ap": ap, "gapU": tgt * o - ap,
                     "gapS": (tgt * o - ap) * pA if pA is not None else None, "oS": o * pO if pO is not None else None, "aS": ap * pA if pA is not None else None, "pA": pA, "pO": pO})

    def agg(xs):
        o = sum(r["o"] for r in xs); a = sum(r["a_last"] for r in xs); ap = sum(r["ap"] for r in xs)
        prev = sum(r["a_prev"] or 0 for r in xs) if PA >= 0 else None
        sn = lambda k: (sum(r[k] for r in xs if r[k] is not None) if any(r[k] is not None for r in xs) else None)
        return {"o": o, "a": a, "ap": ap, "prev": prev, "share": _share(ap, o), "share_prev": _share(prev, o) if prev is not None else None,
                "grow": (a / prev - 1) if prev else None, "gapU": sum(r["gapU"] for r in xs), "gapS": sn("gapS"), "oS": sn("oS"), "aS": sn("aS")}

    def group(key):
        g = {}
        for r in rows: g.setdefault(r[key], []).append(r)
        return [{"k": k, "act": xs[0]["act"], "d": xs[0]["d"], "pA": xs[0]["pA"], "pO": xs[0]["pO"], **agg(xs)} for k, xs in g.items()]

    tot = agg(rows)
    tiendas = sorted(group("t"), key=lambda t: -(t["share"] or 0))
    skus = sorted(group("sku"), key=lambda s: -s["o"])
    xmed = median([t["o"] for t in tiendas]) if tiendas else 0
    for t in tiendas:
        big = t["o"] >= xmed; ok = (t["share"] or 0) >= META
        t["cuad"] = ("Defender" if ok else "Atacar") if big else ("Mantener" if ok else "Desarrollar")
    act = agg([r for r in rows if r["act"]]); ctrl = agg([r for r in rows if not r["act"]])
    act["n"] = len({r["t"] for r in rows if r["act"]}); ctrl["n"] = len({r["t"] for r in rows if not r["act"]})

    prev = None
    if corte:
        older = [c for c in cargas[1:] if (c.get("corte") or c["datos"].get("corte")) and (c.get("corte") or c["datos"].get("corte")) < corte]
        if older:
            ps = _carga_share(older[0])
            if ps: prev = {**ps, "mismo_mes": ps["mes"] == afx[LA]["i"]}
    sin = sorted([r for r in rows if not r["a_last"] and r["o"] >= 3], key=lambda r: -r["o"])

    acc = []
    atk = sorted([t for t in tiendas if t["cuad"] == "Atacar"], key=lambda t: -t["gapU"])[:3]
    if atk: acc.append({"t": "Atacar " + ", ".join(short_t(t["k"]) for t in atk), "d": f"Tiendas grandes con {propia} bajo la meta: {base} vende {fmt(sum(t['o'] for t in atk))} u./mes y {propia} proyecta {fmt(sum(t['ap'] for t in atk))}. Priorizar promotora y exhibición.", "r": "Trade Marketing + Agencia Fuego"})
    sk = max(skus, key=lambda s: s["gapS"] if s["gapS"] is not None else s["gapU"]) if skus else None
    if sk and sk["gapU"] > 0:
        extra = ""
        if sk["pA"] is not None and sk["pO"] is not None:
            extra = f" {propia} a S/ {sk['pA']:.2f} vs. {base} a S/ {sk['pO']:.2f}: " + (f"usar el {round((1 - sk['pA']/sk['pO'])*100)}% de ahorro como argumento." if sk["pA"] < sk["pO"] else "revisar precio.")
        acc.append({"t": "Empujar " + short_sku(sk["d"]), "d": f"Mayor brecha a la meta: {fmt(sk['gapU'])} u./mes" + (f" ({money(sk['gapS'])})" if sk["gapS"] is not None else "") + "." + extra, "r": "Marketing"})
    if sin: acc.append({"t": f"Revisar stock en {len(sin)} puntos sin venta {propia}", "d": f"Empezar por {short_sku(sin[0]['d'])} en {short_t(sin[0]['t'])} ({base} {fmt(sin[0]['o'])} u./mes).", "r": "Comercial / KAM Sodimac"})
    if act["share"] is not None and ctrl["share"] is not None and ctrl["n"] and act["share"] > ctrl["share"] * 1.3:
        acc.append({"t": "Evaluar activación en provincias", "d": f"Con activación {pct1(act['share'])} vs. {pct1(ctrl['share'])} sin activación (hipótesis: efecto promotoras).", "r": "Gerencia de Marketing"})

    return {"base": base, "propia": propia, "archivo": C.get("archivo"), "corte": corte, "fac": fac, "mes": MES_L[afx[LA]["i"]], "mes_prev": MES_L[afx[PA]["i"]] if PA >= 0 else None,
            "tot": tot, "tiendas": tiendas, "skus": skus, "act": act, "ctrl": ctrl, "prev": prev, "sin": sin, "acc": acc[:4], "xmed": xmed,
            "en_meta": sum(1 for t in tiendas if (t["share"] or 0) >= META), "meta": META}


def summary_text(v):
    if not v: return "AFIX VS OATEY: no hay cargas del Excel de ventas (pestaña Precios)."
    t = v["tot"]; L = [f"AFIX VS OATEY (Excel {v['archivo']}, corte {fdc(v['corte'])}, meta {pct1(v['meta'])})"]
    L.append(f"Participación {v['propia']} {v['mes']}: {pct1(t['share'])} ({'proyección' if v['fac'] else 'a la fecha'}) | {v['mes_prev']}: {pct1(t['share_prev'])} | {v['propia']} {fmt(t['a'])} u. a la fecha, proyección {fmt(t['ap'])} | {v['base']} {fmt(t['o'])} u./mes")
    if v["prev"]: L.append(f"Semana anterior (corte {fdc(v['prev']['corte'])}): participación {pct1(v['prev']['share'])}, {v['propia']} {fmt(v['prev']['a'])} u.")
    L.append(("Meta cumplida: " + fmt(-t['gapU']) + " u./mes sobre la meta" if t['gapU'] <= 0 else f"Brecha a meta: {fmt(t['gapU'])} u./mes ({money(t['gapS'])})") + f" | tiendas en meta {v['en_meta']}/{len(v['tiendas'])}")
    L.append(f"Activación: {pct1(v['act']['share'])} ({v['act']['n']} tiendas) vs sin activación {pct1(v['ctrl']['share'])} ({v['ctrl']['n']})")
    L.append("Tiendas: " + ", ".join(f"{short_t(x['k'])} {pct1(x['share'])} [{x['cuad']}]" for x in v["tiendas"]))
    L.append("Acciones automáticas: " + " | ".join(a["t"] for a in v["acc"]))
    return "\n".join(L)


# ------------------------------------------------------------------ PDF (página 4)
CSS = """
.vx { background: linear-gradient(125deg, #2a0a3a 0%, #560c76 45%, #74119e 85%); color: #fff; border-radius: 13px; padding: 12px 14px; }
.vx .k { font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
.vx h2 { font-size: 16px; margin: 4px 0 10px; line-height: 1.25; } .vx h2 span { color: #ffd166; }
.vx .g { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.vx .c { background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.15); border-radius: 10px; padding: 8px 9px; }
.vx .c .l { font-size: 8.5px; font-weight: 700; opacity: .85; } .vx .c .v { font-size: 19px; font-weight: 800; letter-spacing: -.4px; } .vx .c .s { font-size: 8px; opacity: .78; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; } .dot.ok { background: #3ddc84; } .dot.warn { background: #ffc94d; } .dot.bad { background: #ff6b6b; }
.rk { display: grid; gap: 3.5px; } .rk .r { display: grid; grid-template-columns: 82px 1fr 34px; gap: 6px; align-items: center; font-size: 9px; }
.rk .tr { position: relative; height: 8px; background: #f3f0f5; border-radius: 99px; } .rk .f { height: 100%; border-radius: 99px; } .rk .m { position: absolute; top: -2px; bottom: -2px; width: 1.5px; background: #c93f3f; }
.rk .n { text-align: right; font-weight: 800; }
.f.ok { background: #1f8a4c; } .f.warn { background: #e0a21b; } .f.bad { background: #c93f3f; }
.acts4 { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; } .acts4 .a { display: flex; gap: 7px; } .acts4 .a i { flex: none; width: 18px; height: 18px; border-radius: 6px; background: #74119e; color: #fff; font-style: normal; font-weight: 800; display: grid; place-items: center; font-size: 9.5px; }
.acts4 b { font-size: 10px; } .acts4 p { margin: 1px 0 2px; font-size: 8.8px; color: #6b6274; } .acts4 .r { font-size: 8px; font-weight: 700; color: #74119e; }
"""


def _sem(s, meta): return "ok" if s is not None and s >= meta else "warn" if s is not None and s >= meta * 0.6 else "bad"


def scatter(v):
    W, H, l, r, t, b = 400, 262, 34, 8, 10, 30
    T = [x for x in v["tiendas"] if x["share"] is not None]
    xmax = max([1] + [x["o"] for x in T]) * 1.08; ymax = max([v["meta"] * 1.6] + [x["share"] for x in T]) * 1.1
    X = lambda q: l + q / xmax * (W - l - r); Y = lambda q: H - b - q / ymax * (H - t - b)
    xm, ym = X(v["xmed"]), Y(v["meta"])
    g = f'<rect x="{xm}" y="{ym}" width="{W-r-xm}" height="{H-b-ym}" fill="#fbeaea"/><rect x="{xm}" y="{t}" width="{W-r-xm}" height="{ym-t}" fill="#e5f5ec" opacity=".7"/>'
    for i in range(5):
        q = ymax / 4 * i; g += f'<line class="grid" x1="{l}" x2="{W-r}" y1="{Y(q)}" y2="{Y(q)}"/><text class="ax sm" x="{l-5}" y="{Y(q)+3}" text-anchor="end">{round(q*100)}%</text>'
        q = xmax / 4 * i; g += f'<text class="ax sm" x="{X(q)}" y="{H-b+13}" text-anchor="middle">{fmt(q)}</text>'
    g += f'<line x1="{xm}" x2="{xm}" y1="{t}" y2="{H-b}" stroke="#cfc5d6" stroke-dasharray="4 4"/><line x1="{l}" x2="{W-r}" y1="{ym}" y2="{ym}" stroke="#c93f3f" stroke-dasharray="5 4"/>'
    g += f'<text x="{l+3}" y="{ym-4}" font-size="9" font-weight="700" fill="#c93f3f">Meta {round(v["meta"]*100)}%</text>'
    for txt, xx, yy, col in [("DEFENDER", W-r-4, t+11, "#1f8a4c"), ("ATACAR", W-r-4, H-b-6, "#c93f3f"), ("MANTENER", xm-4, t+11, "#6b6274"), ("DESARROLLAR", xm-4, H-b-6, "#6b6274")]:
        g += f'<text x="{xx}" y="{yy}" text-anchor="end" font-size="9" font-weight="800" fill="{col}">{txt}</text>'
    g += f'<text class="ax sm" x="{(l+W-r)/2}" y="{H-4}" text-anchor="middle">Tamaño de tienda: venta {esc(v["base"])} (u./mes)</text>'
    placed = [(X(x["o"]) - 7, X(x["o"]) + 7, Y(x["share"]) + 3) for x in T]
    for x in sorted(T, key=lambda q: -q["share"]):
        cx, cy = X(x["o"]), Y(x["share"]); lab = short_t(x["k"]); lw = len(lab) * 4.6 + 4; right = cx > W - 95
        x0 = cx - 9 - lw if right else cx + 9; ly = cy + 3
        hit = lambda yy: any(abs(p[2] - yy) < 10 and x0 < p[1] and x0 + lw > p[0] for p in placed)
        k = 1
        while hit(ly) and k < 10:
            ly = cy + 3 + (1 if k % 2 else -1) * ((k + 1) // 2) * 10; k += 1
        placed.append((x0, x0 + lw, ly))
        g += f'<circle cx="{cx}" cy="{cy}" r="5.5" fill="{"#74119e" if x["act"] else "#9b93a3"}" stroke="#fff" stroke-width="1.2"/>'
        g += f'<text x="{cx-9 if right else cx+9}" y="{ly}" font-size="9" fill="#1d1424" text-anchor="{"end" if right else "start"}">{esc(lab)}</text>'
    return f'<svg viewBox="0 0 {W} {H}" class="chart">{g}</svg>'


def render_page(v, foot):
    if not v:
        return ""
    t = v["tot"]; X, O = v["propia"], v["base"]; meta = v["meta"]
    wk = v["prev"]
    tit = f'{X} {"proyecta cerrar" if v["fac"] else "lleva"} {v["mes"].lower()} con <span>{pct1(t["share"])}</span> de participación frente a {O}' + (f' y crece {pctg(t["grow"])} vs. {v["mes_prev"].lower()}' if t["grow"] is not None else "") + "."
    k1 = f'Meta {round(meta*100)}% · ' + (f'{(t["share"]-wk["share"])*100:+.1f} pp vs. semana anterior'.replace(".", ",") if wk and wk["mismo_mes"] and wk["share"] is not None else f'{v["mes_prev"]}: {pct1(t["share_prev"])}')
    k2 = (f'proyección · {fmt(t["a"])} u. a la fecha' if v["fac"] else "a la fecha") + (f' · +{fmt(t["a"]-wk["a"])} u. en la semana' if wk and wk["mismo_mes"] else "")
    gap_v = "Cumplida" if t["gapU"] <= 0 else (money(t["gapS"]) if t["gapS"] is not None else fmt(t["gapU"]) + " u.")
    gap_s = f'{fmt(-t["gapU"])} u./mes sobre la meta' if t["gapU"] <= 0 else f'{fmt(t["gapU"])} u./mes por capturar'
    mx = max([meta * 1.4] + [x["share"] or 0 for x in v["tiendas"]])
    rk = "".join(f'<div class="r"><span>{esc(short_t(x["k"]))}{" ●" if x["act"] else ""}</span><div class="tr"><div class="f {_sem(x["share"], meta)}" style="width:{(x["share"] or 0)/mx*100:.1f}%"></div><div class="m" style="left:{meta/mx*100:.1f}%"></div></div><span class="n">{pct1(x["share"])}</span></div>' for x in v["tiendas"])
    S = sorted([s for s in v["skus"] if s["oS"] is not None or s["aS"] is not None], key=lambda s: -(s["oS"] or 0))[:6]
    srow = "".join(f'<tr><td><b>{esc(short_sku(s["d"]))}</b></td><td class="n">{fmt(s["o"])}</td><td class="n">{fmt(s["ap"])}</td><td class="n"><span class="pill {_sem(s["share"], meta)}">{pct1(s["share"])}</span></td><td class="n">{money(s["oS"])}</td><td class="n">{money(s["aS"])}</td><td class="n"><b>{money(max(0, s["gapS"])) if s["gapS"] is not None else "—"}</b></td></tr>' for s in S)
    acts = "".join(f'<div class="a"><i>{i+1}</i><div><b>{esc(a["t"])}</b><p>{esc(a["d"])}</p><span class="r">{esc(a["r"])}</span></div></div>' for i, a in enumerate(v["acc"]))
    A, Cc = v["act"], v["ctrl"]
    return f"""
    <div class="page"><div class="hdr sm"><div class="row"><div class="mark">A</div><div><h2>{esc(X)} vs. {esc(O)} en Sodimac</h2><p>Venta Sodimac por tienda y producto · corte {esc(fdc(v["corte"]))}</p></div></div></div>
      <div class="body">
        <div class="vx"><div class="k">Participación de mercado · {esc(X)} ÷ ({esc(X)} + {esc(O)})</div><h2>{tit}</h2>
          <div class="g">
            <div class="c"><div class="l"><i class="dot {_sem(t['share'], meta)}"></i>Participación {esc(X)}</div><div class="v">{pct1(t['share'])}</div><div class="s">{k1}</div></div>
            <div class="c"><div class="l"><i class="dot {'ok' if (t['grow'] or 0) >= 0 else 'bad'}"></i>{esc(X)} {esc(v['mes'].lower())}</div><div class="v">{fmt(t['ap'])} u.</div><div class="s">{k2}</div></div>
            <div class="c"><div class="l"><i class="dot {'ok' if t['gapU'] <= 0 else 'bad'}"></i>Brecha a la meta</div><div class="v">{gap_v}</div><div class="s">{gap_s}</div></div>
            <div class="c"><div class="l"><i class="dot {'ok' if v['en_meta'] >= len(v['tiendas'])/2 else 'warn' if v['en_meta'] else 'bad'}"></i>Tiendas en meta</div><div class="v">{v['en_meta']}<small style="font-size:11px;opacity:.7"> / {len(v['tiendas'])}</small></div><div class="s">{esc(O)} {fmt(t['o'])} u./mes{(' · ' + money(t['oS'])) if t['oS'] is not None else ''}</div></div>
          </div></div>
        <div class="grid2 sec">
          <div class="card"><h3>Matriz de prioridades por tienda <span>● con activación</span></h3>{scatter(v)}</div>
          <div class="card"><h3>Participación por tienda <span>línea roja = meta {round(meta*100)}%</span></h3><div class="rk">{rk}</div>
            <div class="legend"><span><i style="background:#1f8a4c"></i>En meta</span><span><i style="background:#e0a21b"></i>Cerca</span><span><i style="background:#c93f3f"></i>Lejos</span></div>
            <p class="xs mut" style="margin:8px 0 0">Con activación ({A['n']}): <b>{pct1(A['share'])}</b> · sin activación ({Cc['n']}): <b>{pct1(Cc['share'])}</b>.</p></div>
        </div>
        <div class="card sec"><h3>¿Cuánto vale la brecha? <span>{esc(O)}: mes promedio · {esc(X)}: {"proyección" if v["fac"] else "a la fecha"} · precios de góndola relevados</span></h3>
          <table><thead><tr><th>Producto</th><th class="n">{esc(O)} u./mes</th><th class="n">{esc(X)} u.</th><th class="n">Particip.</th><th class="n">{esc(O)} S/</th><th class="n">{esc(X)} S/</th><th class="n">Brecha a meta</th></tr></thead><tbody>{srow}</tbody></table></div>
        <div class="card sec"><h3>Prioridades {esc(X)} vs. {esc(O)} para la semana</h3><div class="acts4">{acts}</div></div>
        <p class="mut xs" style="margin-top:5px">Fuente: Excel Sodimac ({esc(v['archivo'])}). Participación = {esc(X)} ÷ ({esc(X)} + {esc(O)} mes promedio). Proyección = avance × días del mes ÷ día de corte. Causas = hipótesis.</p>
      </div>{foot}
    </div>"""


# ------------------------------------------------------------------ EMAIL
def render_email_section(v, sec, tbl, th, td, bar):
    if not v: return ""
    t = v["tot"]; X, O = v["propia"], v["base"]; meta = v["meta"]
    col = lambda s: {"ok": "#1f8a4c", "warn": "#d99a1e", "bad": "#c93f3f"}[_sem(s, meta)]
    head = (f'<div style="background:#3d0d55;color:#fff;border-radius:10px;padding:14px 16px;margin-bottom:10px">'
            f'<div style="font-size:11px;opacity:.75;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Corte {esc(fdc(v["corte"]))} · meta {round(meta*100)}%</div>'
            f'<div style="font-size:18px;font-weight:800;margin-top:4px">{esc(X)} {"proyecta" if v["fac"] else "lleva"} <span style="color:#ffd166">{pct1(t["share"])}</span> de participación en {esc(v["mes"].lower())}'
            + (f' ({pctg(t["grow"])} vs. {esc(v["mes_prev"].lower())})' if t["grow"] is not None else "") + "</div>"
            f'<div style="font-size:12.5px;opacity:.85;margin-top:4px">{esc(X)} {fmt(t["ap"])} u. · {esc(O)} {fmt(t["o"])} u./mes · brecha a meta {"cumplida" if t["gapU"] <= 0 else (money(t["gapS"]) if t["gapS"] is not None else fmt(t["gapU"]) + " u.")} · tiendas en meta {v["en_meta"]}/{len(v["tiendas"])}</div></div>')
    mx = max([meta * 1.4] + [x["share"] or 0 for x in v["tiendas"]])
    rows = "".join("<tr>" + td(f'<b>{esc(short_t(x["k"]))}</b>' + (' <span style="color:#74119e">●</span>' if x["act"] else ""), "width:130px")
                   + f'<td style="padding:5px 8px;border-bottom:1px solid #f0ecf3">{bar((x["share"] or 0) / mx, col(x["share"]))}</td>'
                   + td(f'<b style="color:{col(x["share"])}">{pct1(x["share"])}</b>', "text-align:right;width:60px") + td(esc(x["cuad"]), "font-size:11px;color:#6b6274;width:80px") + "</tr>" for x in v["tiendas"])
    acts = "".join(f'<tr><td style="padding:6px 0;font-size:13px"><b>{i+1}. {esc(a["t"])}</b><br><span style="font-size:12px;color:#6b6274">{esc(a["d"])} · <b style="color:#74119e">{esc(a["r"])}</b></span></td></tr>' for i, a in enumerate(v["acc"]))
    return sec(f"{esc(X)} vs. {esc(O)} en Sodimac", head + tbl("<tr>" + th("Tienda") + th(f"Participación {esc(X)} (● activación)") + th("", "right") + th("Cuadrante") + "</tr>", rows)
               + f'<div style="font-size:13px;font-weight:800;margin:12px 0 4px">Prioridades de la semana</div><table role="presentation" width="100%">{acts}</table>')
