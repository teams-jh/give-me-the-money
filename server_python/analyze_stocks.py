"""
미국 상장 탑 N 기업 주가 추세 분석기
- yfinance로 4개 기간(3M/1Y/2Y/3Y) 데이터 동시 수집
- 선형회귀 기울기(slope) + R² + 전/후반 기울기로 추세 분류
- 결과를 stock_data.json 으로 저장
"""

import yfinance as yf
import pandas as pd
import numpy as np
from scipy import stats
from datetime import datetime
from collections import Counter
import json, time, argparse

from fetch_universe import get_top_n


# ── 기간 설정 ────────────────────────────────────────────────────────
# key        : HTML 탭 ID
# yf_period  : yfinance period 파라미터
# interval   : 봉 단위 (3M는 주봉, 나머지 월봉)
# min_pts    : 분류에 필요한 최소 데이터 포인트 수
# label      : 표시 이름

PERIODS = {
    "3m": dict(yf_period="3mo", interval="1wk", min_pts=8,  label="3개월"),
    "1y": dict(yf_period="1y",  interval="1mo", min_pts=10, label="1년"),
    "2y": dict(yf_period="2y",  interval="1mo", min_pts=18, label="2년"),
    "3y": dict(yf_period="3y",  interval="1mo", min_pts=24, label="3년"),
}


# ── 데이터 수집 ──────────────────────────────────────────────────────
def fetch_close(ticker: str, yf_period: str, interval: str) -> pd.Series | None:
    try:
        hist = yf.Ticker(ticker).history(period=yf_period, interval=interval)
        if hist.empty:
            return None
        return hist["Close"].dropna()
    except Exception as e:
        print(f"  ⚠ {ticker} ({yf_period}): {e}")
        return None


# ── 추세 분류 (선형회귀 기반) ────────────────────────────────────────
def classify_trend(prices: pd.Series, min_pts: int) -> dict | None:
    """
    slope_pct  : 전체 기울기 (평균가 대비 %/봉)
    r2         : 결정계수 — 추세 명확도
    slope_early: 전반 2/3 기울기
    slope_late : 후반 1/3 기울기  → 반등 감지
    """
    if prices is None or len(prices) < min_pts:
        return None

    vals = prices.values
    n    = len(vals)
    x    = np.arange(n, dtype=float)

    slope_all, intercept, r_val, *_ = stats.linregress(x, vals)
    r2        = round(r_val ** 2, 3)
    slope_pct = round(slope_all / vals.mean() * 100, 3)

    split   = max(4, int(n * 2 / 3))
    s_e, *_ = stats.linregress(x[:split], vals[:split])
    s_l, *_ = stats.linregress(x[split:], vals[split:])
    slope_e = round(s_e / vals[:split].mean() * 100, 3)
    slope_l = round(s_l / vals[split:].mean() * 100, 3)

    # 분류
    if   slope_e < -0.2 and slope_l > 0.4:          trend = "recovering"
    elif slope_pct >  0.3 and r2 >= 0.35:            trend = "bullish"
    elif slope_pct < -0.3 and r2 >= 0.35:            trend = "bearish"
    else:                                             trend = "sideways"

    # 수익률 (보조)
    total_ret = round((vals[-1] / vals[0] - 1) * 100, 1)

    # 정규화 가격 + 회귀선 (base = 100)
    base     = vals[0]
    norm     = [round(v / base * 100, 2) for v in vals]
    reg_norm = [round((intercept + slope_all * i) / base * 100, 2) for i in x]
    labels   = [dt.strftime("%Y-%m-%d") for dt in prices.index]

    return {
        "trend":           trend,
        "slope_pct":       slope_pct,
        "r2":              r2,
        "slope_early_pct": slope_e,
        "slope_late_pct":  slope_l,
        "total_return":    total_ret,
        "chart_labels":    labels,
        "chart_data":      norm,
        "regression":      reg_norm,
    }


# ── 메인 ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-n",      type=int, default=100,  help="분석 종목 수")
    parser.add_argument("--force", action="store_true",    help="유니버스 캐시 무시")
    args = parser.parse_args()

    print("=" * 62)
    print(f"  미국 탑 {args.n} 기업 주가 추세 분석  —  4개 기간 동시 계산")
    print(f"  기간: {' / '.join(p['label'] for p in PERIODS.values())}")
    print("=" * 62)

    universe = get_top_n(n=args.n, force_refresh=args.force)
    print(f"\n📋 분석 대상: {len(universe)}개 종목\n")

    results  = []
    failures = []

    for i, (ticker, name, sector) in enumerate(universe, 1):
        print(f"[{i:3d}/{args.n}] {ticker:7s} {name[:22]:22s}", end="")

        # 4개 기간 데이터 수집
        period_data = {}
        ok = True
        for pid, cfg in PERIODS.items():
            prices = fetch_close(ticker, cfg["yf_period"], cfg["interval"])
            info   = classify_trend(prices, cfg["min_pts"])
            if info is None:
                ok = False
                break
            period_data[pid] = info

        if not ok:
            print(" → SKIP")
            failures.append(ticker)
            continue

        # 현재가 (3y 데이터 마지막값)
        current_price = round(period_data["3y"]["chart_data"][-1]
                              * fetch_close(ticker, "3y", "1mo").iloc[0] / 100, 2)

        # 기간별 추세 요약 출력
        summary = "  ".join(
            f"{pid}:{period_data[pid]['trend'][:4]}" for pid in PERIODS
        )
        print(f" → {summary}")

        results.append({
            "ticker":        ticker,
            "name":          name,
            "sector":        sector,
            "current_price": round(fetch_close(ticker, "3y", "1mo").iloc[-1], 2),
            "periods":       period_data,
        })

        time.sleep(0.4)

    # ── 요약 (3Y 기준) ──
    counts = Counter(r["periods"]["3y"]["trend"] for r in results)
    print("\n" + "=" * 62)
    print(f"✅ 완료: {len(results)}개  ❌ 실패: {len(failures)}개  (3Y 기준)")
    for k, label in [("bullish","강세"),("sideways","횡보"),
                     ("bearish","하락"),("recovering","반등")]:
        print(f"  {label}: {counts[k]:3d}개")

    out = {
        "generated_at":    datetime.now().strftime("%Y-%m-%d %H:%M"),
        "classify_method": "linear_regression_slope_r2",
        "periods":         {k: v["label"] for k, v in PERIODS.items()},
        "stocks":          results,
    }
    with open("stock_data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\n📁 stock_data.json 저장 완료")


if __name__ == "__main__":
    main()
