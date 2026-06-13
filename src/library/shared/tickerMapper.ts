/**
 * 티커 원본(RawTicker) → 도메인 타입 매퍼 (Issue #64)
 *
 * fs 의존이 전혀 없는 순수 변환 함수. analyze_signals / analyze_trends 등에
 * 중복 구현돼 있던 toOHLCV / toFundamentalData / (date,close) 추출을 통합한다.
 */

import type { FundamentalData, QuarterlyEarning } from "./fundamentals.ts";
import type { OHLCV } from "./indicators.ts";
import type { DailyPrice, RawTicker } from "./tickerTypes.ts";

/** prices → OHLCV 배열 (adj_close 는 분석에서 사용하지 않으므로 제외) */
export function toOHLCV(raw: RawTicker): OHLCV[] {
  return raw.prices.map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));
}

/** prices → date/close 만 가진 경량 일봉 배열 (트렌드 분석용) */
export function toDailyPrices(raw: RawTicker): DailyPrice[] {
  return raw.prices.map((p) => ({ date: p.date, close: p.close }));
}

/** 중첩된 valuation/profitability/dividend/ownership 을 평탄한 FundamentalData 로 변환 */
export function toFundamentalData(raw: RawTicker): FundamentalData {
  return {
    pe: raw.valuation.trailing_pe,
    pb: raw.valuation.price_to_book,
    pegRatio: raw.valuation.peg_ratio,
    roe: raw.profitability.roe,
    roa: raw.profitability.roa,
    operatingMargin: raw.profitability.operating_margins,
    profitMargins: raw.profitability.profit_margins,
    revenueGrowth: raw.profitability.revenue_growth,
    quarterlyEarnings: (raw.profitability.quarterly_earnings ?? []) as QuarterlyEarning[],
    dividendYield: raw.dividend?.yield ?? null,
    payoutRatio: raw.dividend?.payout_ratio ?? null,
    insiderPct: raw.ownership.held_pct_insiders,
    institutionPct: raw.ownership.held_pct_institutions,
    shortRatio: raw.ownership.short_ratio,
  };
}
