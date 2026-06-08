"""
simulate_trend_chart.py

simulate_trend.ts 가 생성한 JSON을 읽어 종목별 차트를 PNG로 렌더링한다.

출력:
  - JSON과 동일 경로, 동일 파일명 .png
  - N×4 그리드 레이아웃

마커 색상:
  - close touch    → 노란색  (#FFD700)
  - high touch     → 주황색  (#FF8C00)
  - close breakout → 보라색  (#9B59B6)
  - high breakout  → 연보라색 (#C39BD3)

실행:
  python3 scripts/simulate_trend_chart.py src/db/us/trend_sim/sim_us_1y_20250605_120000.json
"""

import sys
import json
from pathlib import Path
from datetime import datetime

import matplotlib
matplotlib.use("Agg")  # 헤드리스 환경
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import matplotlib.dates as mdates
from matplotlib.collections import LineCollection
import numpy as np

# ── 한글 폰트 설정 ────────────────────────────────────────────────────────────
# font.sans-serif 목록 앞에 한글 폰트 후보를 prepend → matplotlib 폴백 자동 적용
# 폰트명 공백 여부가 OS마다 다를 수 있으므로 두 가지 형태를 모두 포함
_KR_FONT_CANDIDATES = [
    "NanumGothic", "Nanum Gothic",
    "NanumBarunGothic", "Nanum Barun Gothic",
    "NanumSquare", "Nanum Square",
]
plt.rcParams["font.sans-serif"] = _KR_FONT_CANDIDATES + list(plt.rcParams["font.sans-serif"])
plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["axes.unicode_minus"] = False  # 마이너스 기호 깨짐 방지

# ── 설정 ─────────────────────────────────────────────────────────────────────

CARD_W      = 10.0    # 차트 너비 (인치) — 종목 1장 기준
CARD_H      = 6.0     # 차트 높이 (인치)
CANDLE_UP   = "#D32F2F"   # 양봉 (한국식: 빨강 — 라이트모드용 진한 빨강)
CANDLE_DOWN = "#1565C0"   # 음봉 (한국식: 파랑 — 라이트모드용 진한 파랑)
RESIST_COLOR = "#E53935"  # 저항선
SUPPORT_COLOR = "#00897B" # 지지선
ZIGZAG_COLOR  = "#F9A825" # 지그재그선
BG_COLOR    = "#FAFAFA"   # 카드 배경 (라이트)
GRID_COLOR  = "#E0E0E0"   # 그리드 (연회색)
TEXT_COLOR  = "#212121"   # 기본 텍스트 (진한 검정)
FIG_BG      = "#F5F5F5"   # 전체 figure 배경

MARKER_COLORS = {
    ("close", "touch"):    "#F9A825",  # 진한 노란색 (라이트모드 가시성)
    ("high",  "touch"):    "#E65100",  # 진한 주황색
    ("close", "breakout"): "#6A1B9A",  # 진한 보라색
    ("high",  "breakout"): "#AB47BC",  # 중간 보라색
}

SLOPE_LABELS = {
    "positive": ("↗", "#D32F2F"),
    "negative": ("↘", "#1565C0"),
    "flat":     ("→", "#757575"),
}

# ── 유틸 ─────────────────────────────────────────────────────────────────────

def ts_to_date(ts_ms: int):
    """Unix ms → matplotlib date number"""
    from datetime import timezone
    return mdates.date2num(datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc))


def draw_candlestick(ax, prices: list, color_up=CANDLE_UP, color_down=CANDLE_DOWN):
    """OHLC 캔들스틱을 ax에 그린다."""
    for p in prices:
        try:
            dt   = mdates.date2num(datetime.strptime(p["date"], "%Y-%m-%d"))
            o, h, l, c = p["open"], p["high"], p["low"], p["close"]
            color = color_up if c >= o else color_down
            # 몸통
            body_y = min(o, c)
            body_h = abs(c - o) or (h - l) * 0.01
            ax.bar(dt, body_h, bottom=body_y, width=0.6,
                   color=color, linewidth=0)
            # 꼬리
            ax.plot([dt, dt], [l, h], color=color, linewidth=0.6)
        except Exception:
            pass


def draw_trendline(ax, data: list, color: str, linestyle="-", linewidth=1.2, label=None):
    """저항선/지지선 좌표 [{x, y}] 를 ax에 그린다."""
    if not data or len(data) < 2:
        return
    xs = [ts_to_date(d["x"]) for d in data if d.get("y") is not None]
    ys = [d["y"] for d in data if d.get("y") is not None]
    if len(xs) < 2:
        return
    ax.plot(xs, ys, color=color, linestyle=linestyle,
            linewidth=linewidth, label=label, alpha=0.9)


def draw_zigzag(ax, data: list, color=ZIGZAG_COLOR):
    """지그재그 좌표를 ax에 그린다."""
    if not data or len(data) < 2:
        return
    xs = [ts_to_date(d["x"]) for d in data]
    ys = [d["y"] for d in data]
    ax.plot(xs, ys, color=color, linewidth=1.0, linestyle="--", alpha=0.8)


def draw_markers(ax, touch_points: list, filtered_touch_points: list | None):
    """터치/돌파 마커를 ax에 그린다."""
    points = filtered_touch_points if filtered_touch_points is not None else touch_points
    for tp in points:
        key   = (tp.get("priceType", "close"), tp.get("type", "touch"))
        color = MARKER_COLORS.get(key, "#FFFFFF")
        x     = ts_to_date(tp["x"])
        y     = tp["y"]
        marker = "^" if tp.get("type") == "breakout" else "o"
        ax.scatter(x, y, color=color, s=25, marker=marker,
                   zorder=5, linewidths=0.5, edgecolors="white")


# ── 카드 렌더링 ──────────────────────────────────────────────────────────────

def render_card(ax, result: dict, periods: list, trendAlgo: str):
    """결과 1개를 ax에 렌더링한다."""
    sim   = result.get("longestPeriodResult", {})
    ticker = result.get("ticker", "")
    name   = result.get("name", "")
    period_stats = result.get("periodStats", {})

    prices = sim.get("prices", [])
    slope_type = sim.get("slopeType", "flat")
    slope_val  = sim.get("slope", 0.0)

    ax.set_facecolor(BG_COLOR)
    ax.tick_params(colors=TEXT_COLOR, labelsize=9)
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%y/%m"))
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
    plt.setp(ax.xaxis.get_majorticklabels(), rotation=30, ha="right", fontsize=8)
    ax.yaxis.set_tick_params(labelsize=9)
    ax.grid(True, color=GRID_COLOR, linewidth=0.6, alpha=0.8)

    if not prices:
        ax.text(0.5, 0.5, "데이터 없음", transform=ax.transAxes,
                ha="center", va="center", color=TEXT_COLOR)
        return

    # 캔들스틱 — 추세선이 log 가격 기준으로 계산되므로 캔들도 log 변환하여 동일 스케일로 표시
    log_prices = [
        {**p, "open":  np.log(p["open"]),
               "high":  np.log(p["high"]),
               "low":   np.log(p["low"]),
               "close": np.log(p["close"])}
        for p in prices
    ]
    draw_candlestick(ax, log_prices)

    # 추세선
    if trendAlgo == "zigzag" and sim.get("zigzagData"):
        draw_zigzag(ax, sim["zigzagData"])
    else:
        if sim.get("supportData"):
            draw_trendline(ax, sim["supportData"],   SUPPORT_COLOR, linestyle="--")
        if sim.get("resistanceData"):
            draw_trendline(ax, sim["resistanceData"], RESIST_COLOR,  linestyle="-")

    # 마커
    draw_markers(ax, sim.get("touchPoints", []), sim.get("filteredTouchPoints"))

    # y축 범위
    highs  = [p["high"]  for p in prices if p.get("high") is not None]
    lows   = [p["low"]   for p in prices if p.get("low")  is not None]
    if highs and lows:
        margin = (max(highs) - min(lows)) * 0.05
        ax.set_ylim(min(lows) - margin, max(highs) + margin)

    # ── 헤더 텍스트 (ax 좌표계) ──────────────────────────────────────────
    slope_sym, slope_color = SLOPE_LABELS.get(slope_type, ("→", "#AAAAAA"))

    # 티커
    ax.text(0.02, 0.98, ticker, transform=ax.transAxes,
            fontsize=14, fontweight="bold", color=TEXT_COLOR,
            va="top", ha="left")
    # 기울기 배지
    slope_text = f"{slope_sym} {slope_val:+.1f}%"
    ax.text(0.98, 0.98, slope_text, transform=ax.transAxes,
            fontsize=11, fontweight="bold", color=slope_color,
            va="top", ha="right")
    # 종목명
    ax.text(0.02, 0.93, name[:30], transform=ax.transAxes,
            fontsize=9, color="#616161", va="top", ha="left")

    # 기간별 터치/돌파 통계
    y_offset = 0.87
    for p in periods:
        stat = period_stats.get(p)
        if not stat:
            continue
        label = f"{p}: 터치 {stat.get('touchCount', 0)}  돌파 {stat.get('breakoutCount', 0)}"
        ax.text(0.02, y_offset, label, transform=ax.transAxes,
                fontsize=8, color="#424242", va="top", ha="left")
        y_offset -= 0.06


# ── 범례 패치 ────────────────────────────────────────────────────────────────

def make_legend_patches():
    return [
        mpatches.Patch(color=MARKER_COLORS[("close", "touch")],    label="close touch"),
        mpatches.Patch(color=MARKER_COLORS[("high",  "touch")],    label="high touch"),
        mpatches.Patch(color=MARKER_COLORS[("close", "breakout")], label="close breakout"),
        mpatches.Patch(color=MARKER_COLORS[("high",  "breakout")], label="high breakout"),
        mpatches.Patch(color=RESIST_COLOR,  label="저항선"),
        mpatches.Patch(color=SUPPORT_COLOR, label="지지선"),
    ]


# ── 메인 ─────────────────────────────────────────────────────────────────────

def render_single(result: dict, periods: list, trend_algo: str,
                  market: str, generated: str) -> plt.Figure:
    """종목 1개짜리 figure를 생성하고 반환한다."""
    fig, ax = plt.subplots(figsize=(CARD_W, CARD_H), facecolor=FIG_BG)
    fig.subplots_adjust(left=0.08, right=0.97, top=0.97, bottom=0.14)

    render_card(ax, result, periods, trend_algo)

    # 하단 색상 범례
    patches = make_legend_patches()
    fig.legend(handles=patches, loc="lower right", ncol=1,
               fontsize=7, facecolor="#FFFFFF", edgecolor="#BDBDBD",
               labelcolor=TEXT_COLOR, framealpha=0.95,
               bbox_to_anchor=(0.99, 0.01))

    # 하단 터치/돌파 집계 (해당 종목만)
    period_stats = result.get("periodStats", {})
    lines = []
    for p in periods:
        stat = period_stats.get(p)
        if stat:
            lines.append(f"[{p}]  터치 {stat.get('touchCount', 0)}회  돌파 {stat.get('breakoutCount', 0)}회")
    if lines:
        fig.text(0.01, 0.01, "\n".join(lines),
                 ha="left", va="bottom", fontsize=7, color=TEXT_COLOR,
                 linespacing=1.5,
                 bbox=dict(boxstyle="round,pad=0.3",
                           facecolor="#FFFFFF", edgecolor="#BDBDBD", alpha=0.95))

    return fig


def main():
    if len(sys.argv) < 2:
        print("사용법: python3 simulate_trend_chart.py <json_path>")
        sys.exit(1)

    json_path = Path(sys.argv[1])
    if not json_path.exists():
        print(f"❌ 파일 없음: {json_path}")
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    results   = data.get("results", [])
    market    = data.get("market", "")
    config    = data.get("config") or {}
    periods   = config.get("periods", ["1y"])
    generated = data.get("generated_at", "")

    # trendAlgo는 첫 번째 period config에서 가져옴
    period_configs   = config.get("periodConfigs") or {}
    first_period_cfg = period_configs.get(periods[0] if periods else "1y") or {}
    trend_algo = first_period_cfg.get("trendAlgo", "swing")

    if not results:
        print("⚠️  결과 없음 — PNG 생성 건너뜀")
        sys.exit(0)

    # 출력 디렉토리 = JSON과 동일 경로, 동일 파일명 접두어
    stem = json_path.stem  # e.g. sim_us_3m+1y_20250605_120000
    out_dir = json_path.parent

    saved = []
    for result in results:
        ticker = result.get("ticker", "unknown")
        fig = render_single(result, periods, trend_algo, market, generated)
        png_path = out_dir / f"{stem}_{ticker}.png"
        fig.savefig(png_path, dpi=200, bbox_inches="tight", facecolor=FIG_BG)
        plt.close(fig)
        saved.append(str(png_path))
        print(f"🖼️  PNG 저장: {png_path}")

    print(f"✅ 총 {len(saved)}개 PNG 생성 완료")


if __name__ == "__main__":
    main()
