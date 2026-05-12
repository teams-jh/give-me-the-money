"""
fetch_universe.py  ─  동적 유니버스 생성기

흐름
----
1. Wikipedia → S&P 500 전체 503개 종목 + 섹터 정보
2. yfinance fast_info → 시가총액 배치 조회
3. 시가총액 내림차순 정렬 → Top N 반환

캐시
----
universe_cache.json 에 저장 (TTL: 7일)
GitHub Actions에서 매 실행마다 재조회하지 않도록 최적화
"""

import json
import time
import re
from datetime import datetime, timedelta
from pathlib import Path

import io
import requests
import pandas as pd
import yfinance as yf

# Wikipedia 요청용 헤더 (urllib 기본값은 403 차단됨)
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

def _read_wiki_table(url: str) -> list:
    """requests로 Wikipedia HTML 가져온 뒤 pd.read_html 파싱"""
    resp = requests.get(url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    return pd.read_html(io.StringIO(resp.text))

CACHE_FILE = Path("universe_cache.json")
CACHE_TTL_DAYS = 7          # 캐시 유효기간 (일)
BATCH_DELAY    = 0.5        # 배치 간 딜레이 (초)
BATCH_SIZE     = 20         # 1회 시가총액 조회 묶음 크기


# ── S&P 500 목록 조회 ───────────────────────────────────────────────
def _fetch_sp500_from_wikipedia() -> pd.DataFrame:
    """
    Wikipedia에서 S&P 500 구성 종목 가져오기
    반환 컬럼: ticker, name, sector
    """
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    tables = _read_wiki_table(url)
    df = tables[0][["Symbol", "Security", "GICS Sector"]].copy()
    df.columns = ["ticker", "name", "sector"]

    # BRK.B → BRK-B (yfinance 형식)
    df["ticker"] = df["ticker"].str.replace(r"\.", "-", regex=True)

    # 섹터명 단축 매핑
    sector_map = {
        "Information Technology":          "Technology",
        "Health Care":                     "Healthcare",
        "Financials":                      "Financials",
        "Consumer Discretionary":          "Consumer Disc.",
        "Consumer Staples":                "Consumer Staples",
        "Industrials":                     "Industrials",
        "Communication Services":          "Communication",
        "Energy":                          "Energy",
        "Materials":                       "Materials",
        "Real Estate":                     "Real Estate",
        "Utilities":                       "Utilities",
    }
    df["sector"] = df["sector"].map(sector_map).fillna(df["sector"])
    return df.reset_index(drop=True)


# ── 시가총액 배치 조회 ──────────────────────────────────────────────
def _fetch_market_caps(tickers: list[str]) -> dict[str, int]:
    """
    yfinance fast_info 로 시가총액 배치 조회
    fast_info 는 .info 보다 훨씬 빠름 (캐시 레이어 없이 단일 필드 조회)
    """
    caps = {}
    total = len(tickers)

    for i in range(0, total, BATCH_SIZE):
        batch = tickers[i : i + BATCH_SIZE]
        for tk in batch:
            try:
                fi = yf.Ticker(tk).fast_info
                caps[tk] = int(getattr(fi, "market_cap", 0) or 0)
            except Exception:
                caps[tk] = 0

        done = min(i + BATCH_SIZE, total)
        print(f"  시가총액 조회 중... {done:3d}/{total}", end="\r")
        time.sleep(BATCH_DELAY)

    print(f"  시가총액 조회 완료: {total}개{' ' * 20}")
    return caps


# ── 캐시 유효성 확인 ────────────────────────────────────────────────
def _is_cache_valid() -> bool:
    if not CACHE_FILE.exists():
        return False
    try:
        data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        saved_at = datetime.fromisoformat(data["saved_at"])
        return datetime.now() - saved_at < timedelta(days=CACHE_TTL_DAYS)
    except Exception:
        return False


def _load_cache() -> list[tuple]:
    data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return [tuple(row) for row in data["universe"]]


def _save_cache(universe: list[tuple]) -> None:
    payload = {
        "saved_at": datetime.now().isoformat(),
        "universe": [list(row) for row in universe],
    }
    CACHE_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── 퍼블릭 API ──────────────────────────────────────────────────────
def get_top_n(n: int = 100, force_refresh: bool = False) -> list[tuple]:
    """
    미국 시가총액 상위 N개 종목 반환
    Returns list of (ticker, name, sector)

    Parameters
    ----------
    n             : 반환할 종목 수 (기본 100)
    force_refresh : True면 캐시 무시하고 재조회
    """
    if not force_refresh and _is_cache_valid():
        cached = _load_cache()
        print(f"✅ 캐시 사용 (유효기간 {CACHE_TTL_DAYS}일): {len(cached[:n])}개 반환")
        return cached[:n]

    print("📡 Wikipedia → S&P 500 목록 조회 중...")
    df = _fetch_sp500_from_wikipedia()
    print(f"   S&P 500 종목 수: {len(df)}개")

    print("📊 yfinance → 시가총액 조회 중...")
    caps = _fetch_market_caps(df["ticker"].tolist())

    df["market_cap"] = df["ticker"].map(caps).fillna(0).astype(int)
    df = df[df["market_cap"] > 0]                          # 조회 실패 제거
    df = df.sort_values("market_cap", ascending=False)     # 시가총액 내림차순

    universe = [(row.ticker, row.name, row.sector)
                for row in df.head(n).itertuples()]

    _save_cache(universe)   # 결과 캐시 저장
    print(f"✅ 유니버스 확정: Top {len(universe)}개 (캐시 저장 완료)")
    return universe


# ── CLI 단독 실행 ───────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="미국 시가총액 Top N 종목 조회")
    parser.add_argument("-n",       type=int,  default=100, help="종목 수 (기본 100)")
    parser.add_argument("--force",  action="store_true",    help="캐시 무시하고 재조회")
    args = parser.parse_args()

    universe = get_top_n(n=args.n, force_refresh=args.force)

    print(f"\n{'순위':>4}  {'티커':<8}  {'회사명':<30}  {'섹터'}")
    print("-" * 68)
    for rank, (ticker, name, sector) in enumerate(universe, 1):
        print(f"{rank:>4}  {ticker:<8}  {name[:30]:<30}  {sector}")
