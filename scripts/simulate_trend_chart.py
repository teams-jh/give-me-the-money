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
import math
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

# ── 설정 ─────────────────────────────────────────────────────────────────────

COLS        = 4       # 한 행에 카드 수
CARD_W      = 5.0     # 카드 너비 (인치)
CARD_H      = 4.2     # 카드 높이 (인치)
CANDLE_UP   = "#EF5350"   # 양봉 (한국식: 빨강)
CANDLE_DOWN = "#42A5F5"   # 음봉 (한국식: 파랑)
RESIST_COLOR = "#FF6B6B"  # 저항선
SUPPORT_COLOR = "#4ECDC4" # 지지선
ZIGZAG_COLOR  = "#FFE66D" # 지그재그선
BG_COLOR    = "#1A1A2E"   # 카드 배경
GRID_COLOR  = "#2D2D4E"   # 그리드
TEXT_COLOR  = "#E0E0E0"   # 기본 텍스트

MARKER_COLORS = {
    ("close", "touch"):    "#FFD700",  # 노란색
    ("high",  "touch"):    "#FF8C00",  # 주황색
    ("close", "breakout"): "#9B59B6",  # 보라색
    ("high",  "breakout"): "#C39BD3",  # 연보라색
}

SLOPE_LABELS = {
    "positive": ("↗", "#EF5350"),
    "negative": ("↘", "#42A5F5"),
    "flat":     ("→", "#AAAAAA"),
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
    ax.tick_params(colors=TEXT_COLOR, labelsize=5.5)
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%y/%m"))
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    plt.setp(ax.xaxis.get_majorticklabels(), rotation=30, ha="right", fontsize=5)
    ax.yaxis.set_tick_params(labelsize=5.5)
    ax.grid(True, color=GRID_COLOR, linewidth=0.4, alpha=0.5)

    if not prices:
        ax.text(0.5, 0.5, "데이터 없음", transform=ax.transAxes,
                ha="center", va="center", color=TEXT_COLOR)
        return

    # 캔들스틱
    draw_candlestick(ax, prices)

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
            fontsize=8, fontweight="bold", color=TEXT_COLOR,
            va="top", ha="left")
    # 기울기 배지
    slope_text = f"{slope_sym} {slope_val:+.1f}%"
    ax.text(0.98, 0.98, slope_text, transform=ax.transAxes,
            fontsize=6.5, fontweight="bold", color=slope_color,
            va="top", ha="right")
    # 종목명
    ax.text(0.02, 0.91, name[:22], transform=ax.transAxes,
            fontsize=5.5, color="#AAAAAA", va="top", ha="left")

    # 기간별 터치/돌파 통계
    y_offset = 0.84
    for p in periods:
        stat = period_stats.get(p)
        if not stat:
            continue
        label = f"{p}: 터치 {stat.get('touchCount', 0)}  돌파 {stat.get('breakoutCount', 0)}"
        ax.text(0.02, y_offset, label, transform=ax.transAxes,
                fontsize=5.2, color="#CCCCCC", va="top", ha="left")
        y_offset -= 0.07


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

    results    = data.get("results", [])
    market     = data.get("market", "")
    config     = data.get("config") or {}
    periods    = config.get("periods", ["1y"])
    generated  = data.get("generated_at", "")

    # trendAlgo는 첫 번째 period config에서 가져옴
    period_configs   = config.get("periodConfigs") or {}
    first_period_cfg = period_configs.get(periods[0] if periods else "1y") or {}
    trend_algo = first_period_cfg.get("trendAlgo", "swing")

    if not results:
        print("⚠️  결과 없음 — PNG 생성 건너뜀")
        sys.exit(0)

    n     = len(results)
    rows  = math.ceil(n / COLS)
    extra = 1  # 타이틀 행

    fig_w = COLS * CARD_W
    fig_h = CARD_H * rows + 0.8 * extra

    fig = plt.figure(figsize=(fig_w, fig_h), facecolor="#0F0F23")
    fig.subplots_adjust(
        left=0.04, right=0.96,
        top=1 - (0.6 / fig_h),
        bottom=0.04,
        hspace=0.55, wspace=0.12,
    )

    # 타이틀
    period_str = " + ".join(periods)
    title = (
        f"추세선 시뮬레이션  [{market.upper()}]  {period_str}  —  {n}개 종목  |  {generated}"
    )
    fig.text(0.5, 1 - (0.3 / fig_h), title, ha="center", va="top",
             color=TEXT_COLOR, fontsize=10, fontweight="bold")

    # 카드 그리기
    for idx, result in enumerate(results):
        ax = fig.add_subplot(rows, COLS, idx + 1)
        render_card(ax, result, periods, trend_algo)

    # 범례
    patches = make_legend_patches()
    fig.legend(handles=patches, loc="lower center", ncol=len(patches),
               fontsize=6.5, facecolor="#1A1A2E", edgecolor=GRID_COLOR,
               labelcolor=TEXT_COLOR, framealpha=0.9,
               bbox_to_anchor=(0.5, 0.005))

    # 저장
    png_path = json_path.with_suffix(".png")
    fig.savefig(png_path, dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"🖼️  PNG 저장: {png_path}")


if __name__ == "__main__":
    main()
