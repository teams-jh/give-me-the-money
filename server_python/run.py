"""
run.py  ─  원클릭 실행
  1. 유니버스 조회     (Wikipedia + yfinance 시가총액)
  2. 주가 추세 분석   (3M/1Y/2Y/3Y 4개 기간)
  3. S&P 500 스크리닝 (편입 후보 + 편출 위험)
  4. HTML 리포트 생성

Usage:
  python run.py                          # 전체 실행
  python run.py --skip-trend             # 스크리닝만
  python run.py --skip-screener          # 추세 분석만
  python run.py --no-cache               # 캐시 전부 무시
  python run.py --force-universe         # 유니버스만 재조회
"""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="US Stock Analyzer")
    parser.add_argument("-n",               type=int,  default=100)
    parser.add_argument("--skip-trend",     action="store_true")
    parser.add_argument("--skip-screener",  action="store_true")
    parser.add_argument("--no-cache",       action="store_true")
    parser.add_argument("--force-universe", action="store_true")
    args = parser.parse_args()

    # ── Step 1: 추세 분석 ──
    if not args.skip_trend:
        print("\n── Step 1/3  주가 추세 분석 ─────────────────────────────")
        from analyze_stocks import main as run_trend
        import sys
        orig = sys.argv
        sys.argv = ["analyze_stocks.py", "-n", str(args.n)]
        if args.no_cache or args.force_universe:
            sys.argv.append("--force")
        run_trend()
        sys.argv = orig
    else:
        if not Path("stock_data.json").exists():
            print("❌ stock_data.json 없음. --skip-trend 없이 실행하세요.")
            return

    # ── Step 2: S&P 500 스크리닝 ──
    if not args.skip_screener:
        print("\n── Step 2/3  S&P 500 편입/편출 스크리닝 ─────────────────")
        from sp500_screener import run_screener
        run_screener(use_cache=not args.no_cache)
    else:
        if not Path("screener_cache.json").exists():
            Path("screener_cache.json").write_text(
                '{"screened_at":"데이터 없음","inclusion_candidates":[],"exclusion_risks":[]}',
                encoding="utf-8"
            )

    # ── Step 3: HTML 생성 ──
    print("\n── Step 3/3  HTML 리포트 생성 ───────────────────────────")
    from build_report import build_report
    build_report()

    print("\n🎉 완료!  output/us_stock_trend_analysis.html 을 열어보세요.")


if __name__ == "__main__":
    main()
