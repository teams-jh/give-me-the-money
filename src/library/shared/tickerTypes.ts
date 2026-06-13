/**
 * 티커 원본(raw) JSON 타입 정의 (Issue #64)
 *
 * `src/db/{market}/tickers/{code}.json` 파일의 스키마.
 * 기존 analyze_signals / position_size 등에 중복 정의돼 있던 RawTicker 를
 * shared 계층의 단일 소스로 통합한다.
 */

export interface RawPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
}

export interface RawTicker {
  ticker: string;
  info: { name: string; kr_name?: string; sector: string };
  market: {
    price: number;
    fifty_two_week_high: number;
    fifty_two_week_low: number;
    beta: number | null;
  };
  liquidity: { avg_daily_volume_3m: number; avg_daily_volume_10d: number };
  valuation: {
    trailing_pe: number | null;
    price_to_book: number | null;
    peg_ratio: number | null;
  };
  profitability: {
    roe: number | null;
    roa: number | null;
    operating_margins: number | null;
    profit_margins: number | null;
    revenue_growth: number | null;
    quarterly_earnings: { quarter: string; net_income: number }[];
  };
  dividend: { yield: number | null; payout_ratio: number | null };
  ownership: {
    held_pct_insiders: number | null;
    held_pct_institutions: number | null;
    short_ratio: number | null;
  };
  prices: RawPrice[];
}

/** date/close 만 가진 경량 일봉 (트렌드 분석 등에서 사용) */
export interface DailyPrice {
  date: string;
  close: number;
}
