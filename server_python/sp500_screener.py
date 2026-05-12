"""
sp500_screener.py  ─  S&P 500 편입/편출 추정 스크리너

데이터 소스
-----------
현재 S&P 500  : Wikipedia (List of S&P 500 companies)
편입 후보 풀  : Wikipedia (List of S&P 400 companies) ← 시총 상위 mid-cap
재무 데이터   : yfinance  (fast_info + quarterly_income_stmt)

편입 기준 (S&P 위원회 공개 기준 재현)
---------------------------------------
  ① 시총   ≥ $20.5B         (Green zone), $15B~$20.5B (Watch zone)
  ② 미국 법인 + NYSE/NASDAQ/CBOE 상장
  ③ 유동주식 비율 (Float)   ≥ 50 %
  ④ 최근 4분기 연속 흑자    (가장 중요한 재무 기준)
  ⑤ 최근 분기도 흑자
  ⑥ 연간 거래대금 / 시총    ≥ 1.0  (유동성)
  ⑦ 상장 후 12개월 이상 경과

편출 신호 (위원회 재량이므로 "위험 신호" 수준)
-----------------------------------------------
  🔴 HIGH  : 시총 $8B 이하로 하락  OR  TTM 순이익 마이너스
  🟠 MEDIUM: 최근 분기 적자 전환  OR  시총 $8B~$15B 급락
  🟡 LOW   : 유동성 비율 0.5 이하  OR  float 비율 급감
"""

import json
import io
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests
import pandas as pd
import yfinance as yf

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

def _read_wiki_table(url: str) -> list:
    resp = requests.get(url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    return pd.read_html(io.StringIO(resp.text))

# ── 상수 ─────────────────────────────────────────────────────────────
CAP_GREEN     = 20_500_000_000   # 편입 Green zone 시총 기준
CAP_WATCH     = 15_000_000_000   # 편입 Watch zone 시총 기준
CAP_EXCL_HIGH =  8_000_000_000   # 편출 High risk 시총
CAP_EXCL_MED  = 15_000_000_000   # 편출 Medium risk 시총

FLOAT_MIN     = 0.50             # 유동주식 비율 최소
LIQUIDITY_MIN = 1.0              # 연간 거래대금/시총 최소

US_EXCHANGES  = {"NYQ", "NMS", "NGM", "NCM", "PCX", "ASE", "BTS"}
US_COUNTRIES  = {"United States", "USA", ""}

CACHE_FILE    = Path("screener_cache.json")
CACHE_TTL     = 3                # 캐시 유효기간 (일)

API_DELAY     = 0.4              # 종목간 딜레이 (초)
BATCH_SIZE    = 30               # 시총 1차 필터 배치 크기


# ── 유니버스 로드 ────────────────────────────────────────────────────
def _load_sp500() -> set[str]:
    """Wikipedia에서 S&P 500 현재 구성 종목 티커 집합 반환"""
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    df  = _read_wiki_table(url)[0]
    return set(df["Symbol"].str.replace(r"\.", "-", regex=True).tolist())


def _load_sp400() -> list[tuple]:
    """Wikipedia에서 S&P 400 Mid-cap 종목 반환 (편입 후보 풀)"""
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies"
    df  = _read_wiki_table(url)[0]
    df.columns = df.columns.str.strip()

    # 컬럼명이 버전마다 다를 수 있으므로 유연하게 처리
    sym_col  = next(c for c in df.columns if "symbol" in c.lower() or "ticker" in c.lower())
    name_col = next(c for c in df.columns if "security" in c.lower() or "company" in c.lower() or "name" in c.lower())
    sec_col  = next((c for c in df.columns if "sector" in c.lower()), None)

    df["_ticker"] = df[sym_col].str.replace(r"\.", "-", regex=True)
    df["_name"]   = df[name_col]
    df["_sector"] = df[sec_col] if sec_col else "Unknown"

    sector_map = {
        "Information Technology": "Technology",
        "Health Care":            "Healthcare",
        "Consumer Discretionary": "Consumer Disc.",
        "Consumer Staples":       "Consumer Staples",
        "Communication Services": "Communication",
    }
    df["_sector"] = df["_sector"].replace(sector_map)
    return list(zip(df["_ticker"], df["_name"], df["_sector"]))


# ── 개별 종목 기본 데이터 수집 ───────────────────────────────────────
def _get_fundamentals(ticker: str) -> dict | None:
    try:
        tk   = yf.Ticker(ticker)
        fi   = tk.fast_info
        info = tk.info

        market_cap    = getattr(fi, "market_cap", 0) or info.get("marketCap", 0) or 0
        float_shares  = info.get("floatShares",   0) or 0
        total_shares  = info.get("sharesOutstanding", 0) or 0
        float_ratio   = (float_shares / total_shares) if total_shares > 0 else 0

        exchange      = info.get("exchange", "")
        country       = info.get("country",  "")
        first_epoch   = info.get("firstTradeDateEpochUtc", 0) or 0
        days_listed   = (time.time() - first_epoch) / 86400 if first_epoch else 9_999

        avg_vol       = info.get("averageVolume", 0) or 0
        price         = getattr(fi, "last_price", 0) or info.get("regularMarketPrice", 0) or 0
        annual_traded = avg_vol * price * 252
        liquidity     = annual_traded / market_cap if market_cap > 0 else 0

        # 분기 순이익
        prof_qtrs = None
        recent_ok = None
        ttm_ni    = None
        try:
            inc = tk.quarterly_income_stmt
            if not inc.empty:
                ni_row = None
                for lbl in ["Net Income", "Net Income Common Stockholders"]:
                    if lbl in inc.index:
                        ni_row = inc.loc[lbl]
                        break
                if ni_row is not None:
                    vals      = ni_row.dropna().values[:4]   # 최근 4분기
                    prof_qtrs = int(sum(1 for v in vals if v > 0))
                    recent_ok = bool(vals[0] > 0) if len(vals) > 0 else None
                    ttm_ni    = float(sum(vals)) if len(vals) == 4 else None
        except Exception:
            pass

        return {
            "market_cap":   market_cap,
            "market_cap_b": round(market_cap / 1e9, 1),
            "float_ratio":  round(float_ratio,  3),
            "exchange":     exchange,
            "country":      country,
            "days_listed":  int(days_listed),
            "prof_qtrs":    prof_qtrs,
            "recent_ok":    recent_ok,
            "ttm_ni":       ttm_ni,
            "liquidity":    round(liquidity, 2),
            "price":        round(price, 2),
        }
    except Exception:
        return None


# ── 편입 후보 평가 ────────────────────────────────────────────────────
def _eval_inclusion(fund: dict) -> dict | None:
    mc = fund["market_cap"]
    if mc < CAP_WATCH:
        return None

    zone   = "green" if mc >= CAP_GREEN else "watch"
    flags  = []     # 미충족 항목
    passed = []     # 충족 항목

    # ① 시총
    passed.append(f"시총 ${fund['market_cap_b']}B")

    # ② 거래소/국가
    if fund["exchange"] not in US_EXCHANGES and fund["country"] not in US_COUNTRIES:
        flags.append("미국 거래소 미확인")
    else:
        passed.append("미국 상장")

    # ③ 유동주식 비율
    if fund["float_ratio"] > 0:
        if fund["float_ratio"] < FLOAT_MIN:
            flags.append(f"Float {fund['float_ratio']:.0%} (기준 50%↑)")
        else:
            passed.append(f"Float {fund['float_ratio']:.0%}")

    # ④⑤ 분기 흑자
    if fund["prof_qtrs"] is not None:
        if fund["prof_qtrs"] < 4:
            flags.append(f"4분기 흑자 {fund['prof_qtrs']}/4회 미충족")
        else:
            passed.append("4분기 연속 흑자")
        if fund["recent_ok"] is False:
            flags.append("최근 분기 적자")
        elif fund["recent_ok"] is True:
            passed.append("최근 분기 흑자")

    # ⑥ 유동성
    if fund["liquidity"] > 0:
        if fund["liquidity"] < LIQUIDITY_MIN:
            flags.append(f"유동성비율 {fund['liquidity']:.2f} (기준 1.0↑)")
        else:
            passed.append(f"유동성 {fund['liquidity']:.2f}")

    # ⑦ 상장 기간
    if fund["days_listed"] < 365:
        flags.append(f"상장 {fund['days_listed']}일 (12개월 미달)")
    else:
        passed.append(f"상장 {fund['days_listed']//365}년차")

    return {
        "zone":          zone,
        "flags":         flags,
        "passed":        passed,
        "criteria_met":  len(flags) == 0,
    }


# ── 편출 위험 평가 ────────────────────────────────────────────────────
def _eval_exclusion(fund: dict) -> dict | None:
    signals    = []
    risk_level = None

    mc = fund["market_cap"]

    if mc < CAP_EXCL_HIGH:
        signals.append(f"시총 ${fund['market_cap_b']}B — 편출 임계 이하")
        risk_level = "high"
    elif mc < CAP_EXCL_MED:
        signals.append(f"시총 ${fund['market_cap_b']}B — 중간 위험 구간")
        risk_level = risk_level or "medium"

    if fund["ttm_ni"] is not None and fund["ttm_ni"] < 0:
        signals.append(f"TTM 순이익 마이너스 (${fund['ttm_ni']/1e9:.2f}B)")
        risk_level = "high"

    if fund["recent_ok"] is False:
        signals.append("최근 분기 적자 전환")
        risk_level = risk_level or "medium"

    if fund["liquidity"] > 0 and fund["liquidity"] < 0.5:
        signals.append(f"유동성비율 {fund['liquidity']:.2f} — 매우 낮음")
        risk_level = risk_level or "low"

    if fund["float_ratio"] > 0 and fund["float_ratio"] < 0.35:
        signals.append(f"Float {fund['float_ratio']:.0%} — 유통주식 급감 의심")
        risk_level = risk_level or "low"

    if not signals:
        return None

    return {"signals": signals, "risk_level": risk_level}


# ── 메인 스크리너 ─────────────────────────────────────────────────────
def run_screener(use_cache: bool = True) -> dict:

    # 캐시 확인
    if use_cache and CACHE_FILE.exists():
        try:
            cached = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            saved  = datetime.fromisoformat(cached["screened_at"])
            if datetime.now() - saved < timedelta(days=CACHE_TTL):
                print(f"✅ 스크리너 캐시 사용 ({CACHE_TTL}일 TTL)")
                return cached
        except Exception:
            pass

    print("=" * 62)
    print("  S&P 500 편입/편출 스크리너")
    print("  소스: Wikipedia S&P 500 + S&P 400")
    print("=" * 62)

    # 유니버스 로드
    print("\n📡 S&P 500 목록 로드 중...")
    sp500 = _load_sp500()
    print(f"   현재 S&P 500 구성 종목: {len(sp500)}개")

    print("📡 S&P 400 목록 로드 중 (편입 후보 풀)...")
    sp400 = _load_sp400()
    print(f"   S&P 400 Mid-cap: {len(sp400)}개")

    inclusion_candidates = []
    exclusion_risks      = []

    # ── 편입 후보 스크리닝 (S&P 400 → S&P 500 미편입 종목) ──────────
    print(f"\n🔍 편입 후보 스크리닝 ({len(sp400)}개 S&P 400 종목)...")
    candidates_raw = [(t, n, s) for t, n, s in sp400 if t not in sp500]
    print(f"   S&P 500 미편입: {len(candidates_raw)}개 대상")

    for i, (ticker, name, sector) in enumerate(candidates_raw, 1):
        print(f"  [{i:3d}/{len(candidates_raw)}] {ticker:8s}", end=" → ")

        fund = _get_fundamentals(ticker)
        if fund is None:
            print("데이터 없음")
            time.sleep(API_DELAY)
            continue

        result = _eval_inclusion(fund)
        if result is None:
            print(f"시총 ${fund['market_cap_b']}B — 기준 미달")
            time.sleep(API_DELAY)
            continue

        status = "✅ 기준충족" if result["criteria_met"] else f"⚠ 미충족 {len(result['flags'])}건"
        print(f"{result['zone'].upper():5s} | {status}")

        inclusion_candidates.append({
            "ticker":       ticker,
            "name":         name,
            "sector":       sector,
            "price":        fund["price"],
            "market_cap_b": fund["market_cap_b"],
            "float_ratio":  fund["float_ratio"],
            "prof_qtrs":    fund["prof_qtrs"],
            "liquidity":    fund["liquidity"],
            "days_listed":  fund["days_listed"],
            "zone":         result["zone"],
            "criteria_met": result["criteria_met"],
            "flags":        result["flags"],
            "passed":       result["passed"],
        })
        time.sleep(API_DELAY)

    # ── 편출 위험 스크리닝 (현재 S&P 500 전체) ───────────────────────
    print(f"\n🔍 편출 위험 스크리닝 ({len(sp500)}개 S&P 500 종목)...")
    sp500_list = list(sp500)

    for i, ticker in enumerate(sp500_list, 1):
        print(f"  [{i:3d}/{len(sp500_list)}] {ticker:8s}", end=" → ")

        fund = _get_fundamentals(ticker)
        if fund is None:
            print("데이터 없음")
            time.sleep(API_DELAY)
            continue

        result = _eval_exclusion(fund)
        if result is None:
            print(f"정상 (${fund['market_cap_b']}B)")
            time.sleep(API_DELAY)
            continue

        print(f"⚠ {result['risk_level'].upper()} | {', '.join(result['signals'][:2])}")

        exclusion_risks.append({
            "ticker":       ticker,
            "name":         fund.get("name",   ticker),
            "sector":       fund.get("sector", "Unknown"),
            "price":        fund["price"],
            "market_cap_b": fund["market_cap_b"],
            "prof_qtrs":    fund["prof_qtrs"],
            "recent_ok":    fund["recent_ok"],
            "ttm_ni_b":     round(fund["ttm_ni"] / 1e9, 2) if fund["ttm_ni"] else None,
            "liquidity":    fund["liquidity"],
            "risk_level":   result["risk_level"],
            "signals":      result["signals"],
        })
        time.sleep(API_DELAY)

    # ── 정렬 ──
    inclusion_candidates.sort(key=lambda x: (
        0 if x["zone"] == "green" else 1,
        not x["criteria_met"],
        -x["market_cap_b"]
    ))
    exclusion_risks.sort(key=lambda x: (
        {"high": 0, "medium": 1, "low": 2}[x["risk_level"]],
        x["market_cap_b"]
    ))

    # ── 요약 ──
    green = sum(1 for c in inclusion_candidates if c["zone"] == "green")
    watch = sum(1 for c in inclusion_candidates if c["zone"] == "watch")
    crit  = sum(1 for c in inclusion_candidates if c["criteria_met"])
    h     = sum(1 for e in exclusion_risks if e["risk_level"] == "high")
    m     = sum(1 for e in exclusion_risks if e["risk_level"] == "medium")

    print("\n" + "=" * 62)
    print(f"📋 편입 후보: {len(inclusion_candidates)}개 "
          f"(Green {green} / Watch {watch} / 기준충족 {crit})")
    print(f"⚠  편출 위험: {len(exclusion_risks)}개 "
          f"(High {h} / Medium {m})")

    out = {
        "screened_at":           datetime.now().strftime("%Y-%m-%d %H:%M"),
        "sp500_count":           len(sp500),
        "inclusion_candidates":  inclusion_candidates,
        "exclusion_risks":       exclusion_risks,
    }

    CACHE_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2),
                          encoding="utf-8")
    print("📁 screener_cache.json 저장 완료")
    return out


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--no-cache", action="store_true", help="캐시 무시")
    args = p.parse_args()
    run_screener(use_cache=not args.no_cache)
