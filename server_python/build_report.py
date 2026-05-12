"""
stock_data.json + screener_cache.json → 인터랙티브 HTML 리포트
탭 1: 추세 분석 (기간 전환 가능)
탭 2: S&P 500 편입/편출 스크리너
"""

import json
from pathlib import Path
from collections import Counter


def build_report(stock_json   = "stock_data.json",
                 screener_json= "screener_cache.json",
                 out_path     = "output/us_stock_trend_analysis.html"):

    with open(stock_json, encoding="utf-8") as f:
        sdata = json.load(f)
    stocks     = sdata["stocks"]
    generated  = sdata.get("generated_at", "")
    periods    = sdata.get("periods", {"3m":"3개월","1y":"1년","2y":"2년","3y":"3년"})
    counts_3y  = Counter(s["periods"]["3y"]["trend"] for s in stocks)
    stocks_js  = json.dumps(stocks,  ensure_ascii=False)
    periods_js = json.dumps(periods, ensure_ascii=False)

    # 스크리너 데이터 (없으면 빈 구조)
    if Path(screener_json).exists():
        with open(screener_json, encoding="utf-8") as f:
            scr = json.load(f)
    else:
        scr = {"screened_at": "데이터 없음",
               "inclusion_candidates": [], "exclusion_risks": []}

    scr_at  = scr.get("screened_at", "")
    inc_js  = json.dumps(scr.get("inclusion_candidates", []), ensure_ascii=False)
    exc_js  = json.dumps(scr.get("exclusion_risks",      []), ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>미국 탑 100 기업 주가 추세 분석</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --green:#22c55e;--green-bg:#f0fdf4;--green-bd:#86efac;
  --yellow:#d97706;--yellow-bg:#fffbeb;--yellow-bd:#fcd34d;
  --red:#ef4444;--red-bg:#fef2f2;--red-bd:#fca5a5;
  --blue:#3b82f6;--blue-bg:#eff6ff;--blue-bd:#93c5fd;
  --orange:#f97316;--orange-bg:#fff7ed;--orange-bd:#fdba74;
  --purple:#8b5cf6;--purple-bg:#f5f3ff;--purple-bd:#c4b5fd;
  --surface:#f8fafc;--card:#fff;--text:#111827;--text2:#64748b;
  --radius:12px;--shadow:0 1px 8px rgba(0,0,0,.08)
}}
body{{font-family:'Segoe UI',-apple-system,sans-serif;background:#f1f5f9;color:var(--text)}}

/* ── 헤더 ── */
.header{{background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;padding:24px 24px 18px}}
.header h1{{font-size:1.5rem;font-weight:700;margin-bottom:4px}}
.header p{{font-size:.78rem;color:#94a3b8}}
.badge-m{{display:inline-block;margin-top:7px;background:rgba(99,102,241,.3);
  border:1px solid rgba(99,102,241,.5);border-radius:6px;padding:3px 10px;
  font-size:.71rem;color:#c7d2fe}}

/* ── 메인 탭 ── */
.main-tabs{{background:#1e293b;padding:0 24px;display:flex;gap:2px}}
.mtab-btn{{padding:12px 22px;font-size:.88rem;font-weight:600;color:#94a3b8;
  border:none;background:none;cursor:pointer;
  border-bottom:3px solid transparent;transition:.15s;white-space:nowrap}}
.mtab-btn:hover{{color:#e2e8f0}}
.mtab-btn.active{{color:#fff;border-bottom-color:#6366f1}}

/* ── 탭 패널 ── */
.tab-panel{{display:none}}.tab-panel.active{{display:block}}

/* ── 기간 탭 (추세 분석 내) ── */
.period-bar{{background:#f1f5f9;border-bottom:1px solid #e2e8f0;
  padding:0 24px;display:flex;align-items:center;gap:4px}}
.period-bar .plabel{{font-size:.73rem;color:#64748b;margin-right:8px}}
.ptab{{padding:9px 18px;font-size:.83rem;font-weight:600;color:#94a3b8;
  border:none;background:none;cursor:pointer;
  border-bottom:3px solid transparent;transition:.15s}}
.ptab:hover{{color:#334155}}
.ptab.active{{color:#6366f1;border-bottom-color:#6366f1}}

/* ── 요약 카드 ── */
.summary{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
  padding:14px 24px;max-width:1440px;margin:0 auto}}
.scard{{background:var(--card);border-radius:var(--radius);padding:14px 16px;
  box-shadow:var(--shadow);cursor:pointer;border:2px solid transparent;transition:.18s}}
.scard:hover,.scard.active{{border-color:var(--ac);box-shadow:0 4px 16px rgba(0,0,0,.1)}}
.scard .ico{{font-size:1.4rem;margin-bottom:4px}}
.scard .lbl{{font-size:.85rem;font-weight:700;color:var(--ac)}}
.scard .cnt{{font-size:1.7rem;font-weight:800;line-height:1.1}}
.scard .dsc{{font-size:.67rem;color:var(--text2);margin-top:2px;line-height:1.4}}
.scard.g{{--ac:var(--green)}}.scard.y{{--ac:var(--yellow)}}
.scard.r{{--ac:var(--red)}}.scard.b{{--ac:var(--blue)}}

/* ── 컨트롤 ── */
.controls{{max-width:1440px;margin:0 auto;padding:0 24px 10px;
  display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.srch{{flex:1;min-width:150px;position:relative}}
.srch input{{width:100%;padding:7px 12px 7px 30px;border:1.5px solid #e2e8f0;
  border-radius:8px;font-size:.82rem;background:#fff;outline:none;transition:.2s}}
.srch input:focus{{border-color:#6366f1}}
.srch .ico{{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:.78rem}}
select{{padding:7px 11px;border:1.5px solid #e2e8f0;border-radius:8px;
  font-size:.82rem;background:#fff;cursor:pointer;outline:none}}
.stat{{font-size:.74rem;color:var(--text2);margin-left:auto;white-space:nowrap}}

/* ── 카드 그리드 ── */
.grid{{max-width:1440px;margin:0 auto;padding:0 24px 32px;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(305px,1fr));gap:13px}}
.card{{background:var(--card);border-radius:var(--radius);padding:14px 14px 10px;
  box-shadow:var(--shadow);transition:.18s;border-left:4px solid var(--ca);cursor:pointer}}
.card:hover{{box-shadow:0 5px 20px rgba(0,0,0,.1);transform:translateY(-1px)}}
.card.t-bullish{{--ca:var(--green)}}.card.t-sideways{{--ca:var(--yellow)}}
.card.t-bearish{{--ca:var(--red)}}.card.t-recovering{{--ca:var(--blue)}}
.ch{{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}}
.tk{{font-size:1rem;font-weight:800;letter-spacing:.02em}}
.tbadge{{font-size:.63rem;font-weight:700;padding:2px 7px;border-radius:14px;
  display:flex;align-items:center;gap:2px}}
.tbadge.t-bullish{{background:var(--green-bg);color:#16a34a;border:1px solid var(--green-bd)}}
.tbadge.t-sideways{{background:var(--yellow-bg);color:#b45309;border:1px solid var(--yellow-bd)}}
.tbadge.t-bearish{{background:var(--red-bg);color:var(--red);border:1px solid var(--red-bd)}}
.tbadge.t-recovering{{background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-bd)}}
.nm{{font-size:.72rem;color:var(--text2);margin-bottom:1px}}
.sc{{font-size:.63rem;color:#9ca3af}}
.mets{{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:8px 0 4px}}
.met{{text-align:center;padding:5px 2px;background:var(--surface);border-radius:7px}}
.met .v{{font-size:.78rem;font-weight:700}}
.met .l{{font-size:.55rem;color:var(--text2);margin-top:1px}}
.pos{{color:#16a34a}}.neg{{color:var(--red)}}.neu{{color:var(--text2)}}
.cw{{height:76px;margin-top:6px}}

/* ── 스크리너 탭 ── */
.scr-wrap{{max-width:1440px;margin:0 auto;padding:20px 24px 40px;
  display:grid;grid-template-columns:1fr 1fr;gap:20px}}
.scr-panel{{background:var(--card);border-radius:var(--radius);
  box-shadow:var(--shadow);overflow:hidden}}
.scr-head{{padding:14px 18px;font-weight:700;font-size:.95rem;display:flex;
  align-items:center;gap:8px;border-bottom:1px solid #f1f5f9}}
.scr-head.inc{{background:#f0fdf4;color:#15803d}}
.scr-head.exc{{background:#fef2f2;color:#b91c1c}}
.scr-meta{{font-size:.7rem;font-weight:400;color:var(--text2);margin-left:auto}}
.scr-filter{{padding:10px 14px;background:var(--surface);
  border-bottom:1px solid #f1f5f9;display:flex;gap:8px;flex-wrap:wrap}}
.scr-filter input{{flex:1;min-width:100px;padding:5px 10px;
  border:1px solid #e2e8f0;border-radius:6px;font-size:.78rem;outline:none}}
.zone-btn{{padding:4px 10px;border-radius:6px;font-size:.72rem;font-weight:600;
  cursor:pointer;border:1.5px solid transparent;transition:.15s}}
.zone-btn.all{{border-color:#cbd5e1;color:var(--text2);background:#fff}}
.zone-btn.all.on{{background:#334155;color:#fff;border-color:#334155}}
.zone-btn.green{{border-color:var(--green);color:var(--green);background:var(--green-bg)}}
.zone-btn.green.on{{background:var(--green);color:#fff}}
.zone-btn.watch{{border-color:var(--yellow);color:var(--yellow);background:var(--yellow-bg)}}
.zone-btn.watch.on{{background:var(--yellow);color:#fff}}
.risk-btn{{padding:4px 10px;border-radius:6px;font-size:.72rem;font-weight:600;
  cursor:pointer;border:1.5px solid transparent;transition:.15s}}
.risk-btn.all{{border-color:#cbd5e1;color:var(--text2);background:#fff}}
.risk-btn.all.on{{background:#334155;color:#fff;border-color:#334155}}
.risk-btn.high{{border-color:var(--red);color:var(--red);background:var(--red-bg)}}
.risk-btn.high.on{{background:var(--red);color:#fff}}
.risk-btn.medium{{border-color:var(--orange);color:var(--orange);background:var(--orange-bg)}}
.risk-btn.medium.on{{background:var(--orange);color:#fff}}
.risk-btn.low{{border-color:var(--yellow);color:var(--yellow);background:var(--yellow-bg)}}
.risk-btn.low.on{{background:var(--yellow);color:#fff}}
.scr-list{{max-height:640px;overflow-y:auto}}
.scr-item{{padding:12px 16px;border-bottom:1px solid #f8fafc;transition:.12s;cursor:default}}
.scr-item:hover{{background:#fafafa}}
.scr-item-head{{display:flex;align-items:center;gap:8px;margin-bottom:5px}}
.scr-tk{{font-weight:800;font-size:.9rem}}
.scr-nm{{font-size:.75rem;color:var(--text2)}}
.zone-tag{{font-size:.63rem;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:auto}}
.zone-tag.green{{background:var(--green-bg);color:#16a34a;border:1px solid var(--green-bd)}}
.zone-tag.watch{{background:var(--yellow-bg);color:#b45309;border:1px solid var(--yellow-bd)}}
.risk-tag{{font-size:.63rem;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:auto}}
.risk-tag.high{{background:var(--red-bg);color:var(--red);border:1px solid var(--red-bd)}}
.risk-tag.medium{{background:var(--orange-bg);color:var(--orange);border:1px solid var(--orange-bd)}}
.risk-tag.low{{background:var(--yellow-bg);color:#b45309;border:1px solid var(--yellow-bd)}}
.scr-metrics{{display:flex;gap:6px;flex-wrap:wrap;font-size:.7rem;color:var(--text2);margin-bottom:4px}}
.scr-metrics span{{background:var(--surface);padding:2px 6px;border-radius:5px}}
.scr-flags{{display:flex;flex-direction:column;gap:2px}}
.flag-item{{font-size:.68rem;padding:2px 0}}
.flag-item.fail{{color:#b91c1c}}
.flag-item.pass{{color:#15803d}}
.signal-item{{font-size:.68rem;color:#9a3412;padding:2px 0;
  padding-left:10px;position:relative}}
.signal-item::before{{content:"⚠";position:absolute;left:0}}
.empty-msg{{padding:32px;text-align:center;color:var(--text2);font-size:.85rem}}

/* ── 모달 (추세 분석) ── */
.ov{{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);
  z-index:1000;align-items:center;justify-content:center}}
.ov.open{{display:flex}}
.modal{{background:#fff;border-radius:16px;width:min(700px,96vw);
  max-height:92vh;overflow-y:auto;padding:24px;
  box-shadow:0 24px 60px rgba(0,0,0,.25);position:relative}}
.modal h2{{font-size:1.3rem;font-weight:800;margin-bottom:3px}}
.modal .sub{{font-size:.78rem;color:var(--text2);margin-bottom:10px}}
.modal-tabs{{display:flex;gap:4px;margin-bottom:12px;
  border-bottom:2px solid #f1f5f9;padding-bottom:2px}}
.modtab{{padding:6px 14px;font-size:.8rem;font-weight:600;color:var(--text2);
  border:none;background:none;cursor:pointer;
  border-bottom:3px solid transparent;margin-bottom:-4px;transition:.15s}}
.modtab.active{{color:#6366f1;border-bottom-color:#6366f1}}
.mc{{height:220px;margin:8px 0 12px}}
.mm{{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px}}
.mmk{{background:var(--surface);padding:10px;border-radius:9px;text-align:center}}
.mmk .v{{font-size:1rem;font-weight:800}}
.mmk .l{{font-size:.63rem;color:var(--text2);margin-top:2px}}
.reg-box{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;
  padding:10px 14px;font-size:.77rem;line-height:1.9}}
.reg-box b{{color:#334155}}
.xbtn{{position:absolute;top:14px;right:18px;font-size:1.3rem;cursor:pointer;
  color:var(--text2);background:none;border:none}}

@media(max-width:900px){{.scr-wrap{{grid-template-columns:1fr}}}}
@media(max-width:640px){{
  .summary{{grid-template-columns:repeat(2,1fr)}}
  .grid{{grid-template-columns:1fr}}
  .mm{{grid-template-columns:repeat(2,1fr)}}
  .mets{{grid-template-columns:repeat(2,1fr)}}
}}
</style>
</head>
<body>

<div class="header">
  <h1>📈 미국 상장 탑 100 기업 주가 추세 분석</h1>
  <p>yfinance 실데이터 · 생성: {generated}</p>
  <span class="badge-m">📐 분류: 선형회귀 slope + R² + 전/후반 기울기</span>
</div>

<!-- 메인 탭 -->
<div class="main-tabs">
  <button class="mtab-btn active" onclick="switchMain('trend',this)">📈 추세 분석</button>
  <button class="mtab-btn"        onclick="switchMain('screener',this)">📋 S&P 500 편입/편출</button>
</div>

<!-- ══════════════════════ 탭 1: 추세 분석 ══════════════════════ -->
<div id="panel-trend" class="tab-panel active">

  <div class="period-bar">
    <span class="plabel">분석 기간</span>
    <button class="ptab" data-pid="3m"  onclick="switchPeriod('3m',this)">3개월</button>
    <button class="ptab" data-pid="1y"  onclick="switchPeriod('1y',this)">1년</button>
    <button class="ptab" data-pid="2y"  onclick="switchPeriod('2y',this)">2년</button>
    <button class="ptab active" data-pid="3y" onclick="switchPeriod('3y',this)">3년</button>
  </div>

  <div class="summary">
    <div class="scard g active" onclick="filt('bullish',this)">
      <div class="ico">🟢</div><div class="lbl">강세장 (Bullish)</div>
      <div class="cnt" id="cnt-bullish">{counts_3y['bullish']}</div>
      <div class="dsc">slope↑ · R² 양호 · 우상향 추세선</div>
    </div>
    <div class="scard y" onclick="filt('sideways',this)">
      <div class="ico">🟡</div><div class="lbl">횡보장 (Sideways)</div>
      <div class="cnt" id="cnt-sideways">{counts_3y['sideways']}</div>
      <div class="dsc">기울기 약함 · R² 낮음 · 방향 불명확</div>
    </div>
    <div class="scard r" onclick="filt('bearish',this)">
      <div class="ico">🔴</div><div class="lbl">하락장 (Bearish)</div>
      <div class="cnt" id="cnt-bearish">{counts_3y['bearish']}</div>
      <div class="dsc">slope↓ · R² 양호 · 우하향 추세선</div>
    </div>
    <div class="scard b" onclick="filt('recovering',this)">
      <div class="ico">🔵</div><div class="lbl">반등 중 (Recovering)</div>
      <div class="cnt" id="cnt-recovering">{counts_3y['recovering']}</div>
      <div class="dsc">전반↓ → 후반↑ (V/U자 전환)</div>
    </div>
  </div>

  <div class="controls">
    <div class="srch"><span class="ico">🔍</span>
      <input id="si" type="text" placeholder="종목 검색..." oninput="render()">
    </div>
    <select id="sf" onchange="render()">
      <option value="">전체 섹터</option>
      <option>Technology</option><option>Healthcare</option><option>Financials</option>
      <option>Consumer Disc.</option><option>Consumer Staples</option><option>Industrials</option>
      <option>Energy</option><option>Materials</option><option>Real Estate</option>
      <option>Utilities</option><option>Communication</option>
    </select>
    <select id="ss" onchange="render()">
      <option value="">정렬: 기본</option>
      <option value="slope_d">slope 높은순</option>
      <option value="slope_a">slope 낮은순</option>
      <option value="r2_d">R² 높은순</option>
      <option value="ret_d">수익률 높은순</option>
    </select>
    <div class="stat" id="st"></div>
  </div>
  <div class="grid" id="grid"></div>
</div>

<!-- ══════════════════ 탭 2: 편입/편출 스크리너 ══════════════════ -->
<div id="panel-screener" class="tab-panel">
  <div class="scr-wrap">

    <!-- 편입 후보 -->
    <div class="scr-panel">
      <div class="scr-head inc">
        <span>✅ 편입 후보</span>
        <span style="font-size:.72rem;font-weight:400;margin-left:6px">S&P 400 → S&P 500 후보</span>
        <span class="scr-meta">스크리닝: {scr_at}</span>
      </div>
      <div class="scr-filter">
        <input id="inc-search" type="text" placeholder="검색..." oninput="renderInc()">
        <button class="zone-btn all on"   id="zone-all"   onclick="setZone('all')">전체</button>
        <button class="zone-btn green"    id="zone-green" onclick="setZone('green')">🟢 Green</button>
        <button class="zone-btn watch"    id="zone-watch" onclick="setZone('watch')">🟡 Watch</button>
      </div>
      <div class="scr-list" id="inc-list"></div>
    </div>

    <!-- 편출 위험 -->
    <div class="scr-panel">
      <div class="scr-head exc">
        <span>⚠️ 편출 위험</span>
        <span style="font-size:.72rem;font-weight:400;margin-left:6px">현재 S&P 500 편입 종목</span>
        <span class="scr-meta">스크리닝: {scr_at}</span>
      </div>
      <div class="scr-filter">
        <input id="exc-search" type="text" placeholder="검색..." oninput="renderExc()">
        <button class="risk-btn all on"    id="risk-all"    onclick="setRisk('all')">전체</button>
        <button class="risk-btn high"      id="risk-high"   onclick="setRisk('high')">🔴 High</button>
        <button class="risk-btn medium"    id="risk-medium" onclick="setRisk('medium')">🟠 Medium</button>
        <button class="risk-btn low"       id="risk-low"    onclick="setRisk('low')">🟡 Low</button>
      </div>
      <div class="scr-list" id="exc-list"></div>
    </div>

  </div>
</div>

<!-- 모달 -->
<div class="ov" id="ov" onclick="closeOv(event)">
  <div class="modal">
    <button class="xbtn" onclick="document.getElementById('ov').classList.remove('open')">✕</button>
    <h2 id="mt">-</h2><div class="sub" id="ms">-</div>
    <div id="mb"></div>
    <div class="modal-tabs" id="modtabs"></div>
    <div class="mc"><canvas id="mc"></canvas></div>
    <div class="mm" id="mm"></div>
    <div class="reg-box" id="mr"></div>
  </div>
</div>

<script>
const S   = {stocks_js};
const PM  = {periods_js};
const INC = {inc_js};
const EXC = {exc_js};

const TM = {{
  bullish:    {{ko:"강세장",  e:"🟢", c:"#22c55e", f:"rgba(34,197,94,.12)"}},
  sideways:   {{ko:"횡보장",  e:"🟡", c:"#d97706", f:"rgba(217,119,6,.10)"}},
  bearish:    {{ko:"하락장",  e:"🔴", c:"#ef4444", f:"rgba(239,68,68,.10)"}},
  recovering: {{ko:"반등 중", e:"🔵", c:"#3b82f6", f:"rgba(59,130,246,.10)"}},
}};

let curPeriod = "3y", curTrend = "bullish";
let minis = {{}}, mInst = null, mModalPid = "3y", mTicker = null;
let zoneFilter = "all", riskFilter = "all";

const cv = v => v>0?`<span class="pos">+${{v}}%</span>`:v<0?`<span class="neg">${{v}}%</span>`:`<span class="neu">${{v}}%</span>`;
const fv = v => v>0?`<span class="pos">+${{v}}</span>`:v<0?`<span class="neg">${{v}}</span>`:`<span class="neu">${{v}}</span>`;

// ── 메인 탭 전환 ─────────────────────────────────────────────────────
function switchMain(tab, el) {{
  document.querySelectorAll('.mtab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
}}

// ── 기간 전환 ─────────────────────────────────────────────────────────
function switchPeriod(pid, el) {{
  curPeriod = pid;
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  updateCounts(); render();
}}
function updateCounts() {{
  const cnt = {{bullish:0,sideways:0,bearish:0,recovering:0}};
  S.forEach(s => {{ const p=s.periods[curPeriod]; if(p) cnt[p.trend]++; }});
  ['bullish','sideways','bearish','recovering'].forEach(t =>
    document.getElementById('cnt-'+t).textContent = cnt[t]);
}}

// ── 추세 카드 ─────────────────────────────────────────────────────────
function getList() {{
  const q=document.getElementById('si').value.toLowerCase();
  const sc=document.getElementById('sf').value;
  const st=document.getElementById('ss').value;
  let L=S.filter(s=>{{
    const p=s.periods[curPeriod]; if(!p) return false;
    return (!curTrend||p.trend===curTrend)
        &&(!q||s.ticker.toLowerCase().includes(q)||s.name.toLowerCase().includes(q))
        &&(!sc||s.sector===sc);
  }});
  if(st==='slope_d') L.sort((a,b)=>b.periods[curPeriod].slope_pct-a.periods[curPeriod].slope_pct);
  else if(st==='slope_a') L.sort((a,b)=>a.periods[curPeriod].slope_pct-b.periods[curPeriod].slope_pct);
  else if(st==='r2_d')    L.sort((a,b)=>b.periods[curPeriod].r2-a.periods[curPeriod].r2);
  else if(st==='ret_d')   L.sort((a,b)=>b.periods[curPeriod].total_return-a.periods[curPeriod].total_return);
  return L;
}}
function render() {{
  Object.values(minis).forEach(c=>c.destroy()); minis={{}};
  const L=getList();
  document.getElementById('st').textContent=`${{L.length}}개 표시 / 전체 ${{S.length}}개`;
  document.getElementById('grid').innerHTML=L.map(s=>{{
    const p=s.periods[curPeriod], m=TM[p.trend];
    return `<div class="card t-${{p.trend}}" onclick="openM('${{s.ticker}}')">
      <div class="ch">
        <div><div class="tk">${{s.ticker}}</div><div class="nm">${{s.name}}</div><div class="sc">${{s.sector}}</div></div>
        <div class="tbadge t-${{p.trend}}">${{m.e}} ${{m.ko}}</div>
      </div>
      <div class="mets">
        <div class="met"><div class="v">${{fv(p.slope_pct)}}<span style="font-size:.5rem">/봉</span></div><div class="l">slope</div></div>
        <div class="met"><div class="v">${{p.r2}}</div><div class="l">R²</div></div>
        <div class="met"><div class="v">${{cv(p.total_return)}}</div><div class="l">수익률</div></div>
        <div class="met"><div class="v">${{PM[curPeriod]}}</div><div class="l">기간</div></div>
      </div>
      <div class="cw"><canvas id="mc-${{s.ticker}}"></canvas></div>
    </div>`;
  }}).join('');
  L.forEach(s=>{{
    const el=document.getElementById('mc-'+s.ticker); if(!el) return;
    const p=s.periods[curPeriod], m=TM[p.trend];
    minis[s.ticker]=new Chart(el,{{type:'line',
      data:{{labels:p.chart_labels,datasets:[
        {{data:p.chart_data,borderColor:m.c,backgroundColor:m.f,borderWidth:1.8,pointRadius:0,fill:true,tension:0.3,order:2}},
        {{data:p.regression,borderColor:'rgba(100,116,139,.5)',borderWidth:1.5,borderDash:[4,3],pointRadius:0,fill:false,tension:0,order:1}}
      ]}},
      options:{{responsive:true,maintainAspectRatio:false,animation:false,
        plugins:{{legend:{{display:false}},tooltip:{{enabled:false}}}},
        scales:{{x:{{display:false}},y:{{display:false,grace:'8%'}}}}}}
    }});
  }});
}}
function filt(t,el) {{
  document.querySelectorAll('.scard').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); curTrend=t; render();
}}

// ── 스크리너: 편입 후보 ───────────────────────────────────────────────
function setZone(z) {{
  zoneFilter=z;
  ['all','green','watch'].forEach(x=>{{
    const b=document.getElementById('zone-'+x);
    if(b) b.classList.toggle('on', x===z);
  }});
  renderInc();
}}
function renderInc() {{
  const q=document.getElementById('inc-search').value.toLowerCase();
  let L=INC.filter(c=>
    (!q||c.ticker.toLowerCase().includes(q)||c.name.toLowerCase().includes(q))
    &&(zoneFilter==='all'||c.zone===zoneFilter)
  );
  if(!L.length){{document.getElementById('inc-list').innerHTML='<div class="empty-msg">해당하는 종목 없음</div>';return;}}
  document.getElementById('inc-list').innerHTML=L.map(c=>{{
    const zc=c.zone==='green'?'green':'watch';
    const zl=c.zone==='green'?'🟢 Green zone':'🟡 Watch zone';
    const passHtml=c.passed.map(p=>`<div class="flag-item pass">✓ ${{p}}</div>`).join('');
    const flagHtml=c.flags.map(f=>`<div class="flag-item fail">✗ ${{f}}</div>`).join('');
    return `<div class="scr-item">
      <div class="scr-item-head">
        <span class="scr-tk">${{c.ticker}}</span>
        <span class="scr-nm">${{c.name}}</span>
        <span class="zone-tag ${{zc}}">${{zl}}</span>
      </div>
      <div class="scr-metrics">
        <span>💰 ${{c.market_cap_b}}B</span>
        <span>🏭 ${{c.sector}}</span>
        ${{c.float_ratio?`<span>Float ${{(c.float_ratio*100).toFixed(0)}}%</span>`:''}}
        ${{c.prof_qtrs!=null?`<span>흑자 ${{c.prof_qtrs}}/4분기</span>`:''}}
        ${{c.liquidity?`<span>유동성 ${{c.liquidity}}</span>`:''}}
      </div>
      <div class="scr-flags">${{passHtml}}${{flagHtml}}</div>
    </div>`;
  }}).join('');
}}

// ── 스크리너: 편출 위험 ───────────────────────────────────────────────
function setRisk(r) {{
  riskFilter=r;
  ['all','high','medium','low'].forEach(x=>{{
    const b=document.getElementById('risk-'+x);
    if(b) b.classList.toggle('on', x===r);
  }});
  renderExc();
}}
function renderExc() {{
  const q=document.getElementById('exc-search').value.toLowerCase();
  let L=EXC.filter(e=>
    (!q||e.ticker.toLowerCase().includes(q)||e.name.toLowerCase().includes(q))
    &&(riskFilter==='all'||e.risk_level===riskFilter)
  );
  if(!L.length){{document.getElementById('exc-list').innerHTML='<div class="empty-msg">해당하는 종목 없음</div>';return;}}
  document.getElementById('exc-list').innerHTML=L.map(e=>{{
    const rl={{high:'🔴 High',medium:'🟠 Medium',low:'🟡 Low'}}[e.risk_level];
    const sigHtml=e.signals.map(s=>`<div class="signal-item">${{s}}</div>`).join('');
    return `<div class="scr-item">
      <div class="scr-item-head">
        <span class="scr-tk">${{e.ticker}}</span>
        <span class="scr-nm">${{e.name}}</span>
        <span class="risk-tag ${{e.risk_level}}">${{rl}}</span>
      </div>
      <div class="scr-metrics">
        <span>💰 ${{e.market_cap_b}}B</span>
        <span>🏭 ${{e.sector}}</span>
        ${{e.prof_qtrs!=null?`<span>흑자 ${{e.prof_qtrs}}/4분기</span>`:''}}
        ${{e.ttm_ni_b!=null?`<span>TTM NI $${{e.ttm_ni_b}}B</span>`:''}}
      </div>
      <div class="scr-flags">${{sigHtml}}</div>
    </div>`;
  }}).join('');
}}

// ── 모달 ──────────────────────────────────────────────────────────────
function openM(ticker) {{
  mTicker=ticker; mModalPid=curPeriod;
  const s=S.find(x=>x.ticker===ticker); if(!s) return;
  document.getElementById('mt').textContent=`${{s.ticker}}  ${{s.name}}`;
  document.getElementById('ms').textContent=`${{s.sector}} · 현재가 $${{s.current_price}}`;
  document.getElementById('modtabs').innerHTML=Object.entries(PM).map(([pid,label])=>
    `<button class="modtab${{pid===mModalPid?' active':''}}" onclick="switchModPid('${{pid}}',this)">${{label}}</button>`
  ).join('');
  renderModal(s,mModalPid);
  document.getElementById('ov').classList.add('open');
}}
function switchModPid(pid,el) {{
  mModalPid=pid;
  document.querySelectorAll('.modtab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const s=S.find(x=>x.ticker===mTicker); if(s) renderModal(s,pid);
}}
function renderModal(s,pid) {{
  const p=s.periods[pid], m=TM[p.trend];
  document.getElementById('mb').innerHTML=`<span class="tbadge t-${{p.trend}}">${{m.e}} ${{m.ko}}</span><br><br>`;
  document.getElementById('mm').innerHTML=`
    <div class="mmk"><div class="v">${{fv(p.slope_pct)}}<small>/봉</small></div><div class="l">slope</div></div>
    <div class="mmk"><div class="v">${{p.r2}}</div><div class="l">R²</div></div>
    <div class="mmk"><div class="v">${{cv(p.total_return)}}</div><div class="l">기간 수익률</div></div>
    <div class="mmk"><div class="v">${{PM[pid]}}</div><div class="l">분석 기간</div></div>`;
  document.getElementById('mr').innerHTML=`
    <b>📐 추세선 — ${{PM[pid]}}</b><br>
    전반 기울기: <b>${{p.slope_early_pct>0?'▲ +':'▼ '}}${{p.slope_early_pct}}%/봉</b><br>
    후반 기울기: <b>${{p.slope_late_pct>0?'▲ +':'▼ '}}${{p.slope_late_pct}}%/봉</b><br>
    추세 명확도: <b>R² = ${{p.r2}}</b>
    ${{p.trend==='recovering'?'<br>⚡ <b>전반 하락 → 후반 반등 전환</b>':''}}`;
  if(mInst){{mInst.destroy();mInst=null;}}
  mInst=new Chart(document.getElementById('mc'),{{type:'line',
    data:{{labels:p.chart_labels,datasets:[
      {{label:`${{s.ticker}} (${{PM[pid]}}, 정규화)`,data:p.chart_data,borderColor:m.c,backgroundColor:m.f,borderWidth:2.5,pointRadius:2,fill:true,tension:0.3,order:2}},
      {{label:'추세선',data:p.regression,borderColor:'#64748b',borderWidth:2,borderDash:[5,4],pointRadius:0,fill:false,tension:0,order:1}}
    ]}},
    options:{{responsive:true,maintainAspectRatio:false,
      plugins:{{legend:{{position:'top',labels:{{font:{{size:11}},boxWidth:18}}}},
        tooltip:{{callbacks:{{label:c=>` ${{c.parsed.y.toFixed(1)}} (기준=100)`}}}}}},
      scales:{{x:{{ticks:{{maxTicksLimit:12,font:{{size:10}}}},grid:{{color:'#f1f5f9'}}}},
               y:{{ticks:{{font:{{size:10}},callback:v=>v.toFixed(0)}},grid:{{color:'#f1f5f9'}}}}}}}}
  }});
}}
function closeOv(e){{if(e.target===document.getElementById('ov')) document.getElementById('ov').classList.remove('open');}}

// ── 초기화 ────────────────────────────────────────────────────────────
updateCounts(); render(); renderInc(); renderExc();
</script>
</body>
</html>"""

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ HTML 리포트 생성: {out_path}")


if __name__ == "__main__":
    build_report()
