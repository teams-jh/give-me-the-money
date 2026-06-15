/**
 * Yahoo Finance 가격 데이터 게이트웨이 (Issue #74)
 *
 * update_fx_rate / update_dollar_index / update_vix 등 fetch 스크립트가
 * yahoo-finance2 SDK를 직접 호출하고 있던 의존을 이 모듈 하나로 격리한다.
 *
 * 외부에서 Yahoo Finance 교체·목킹이 필요할 때 이 파일만 수정하면 된다.
 *
 * export:
 *   fetchDailyPrices(ticker, years) — 일봉 PriceRow[] 반환
 *   calcMarketInfo(prices)          — 현재가·52주 고저 계산
 */

import YahooFinance from "yahoo-finance2";

import { round } from "../_lib/num.ts";
import { log }   from "../_lib/logger.ts";
import type { PriceRow } from "../../../src/library/shared/tickerTypes.ts";

const yahooFinance = new YahooFinance();

// ── 내부 타입 ─────────────────────────────────────────────────────────────────

interface YahooQuoteRow {
  date:     Date;
  open:     number | null;
  high:     number | null;
  low:      number | null;
  close:    number | null;
  adjclose: number | null;
  volume:   number | null;
}

export interface MarketInfo {
  price:               number | null;
  previous_close:      number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low:  number | null;
}

// ── fetchDailyPrices ──────────────────────────────────────────────────────────

/**
 * Yahoo Finance .chart() 로 일봉 가격 데이터를 가져와 PriceRow[] 로 변환한다.
 *
 * - null close 행 제거 (당일 미확정 데이터 등)
 * - open/high/low/close/adj_close 를 round() 로 소수점 2자리 처리
 * - adjclose 없으면 close 로 대체
 *
 * @param ticker Yahoo Finance 티커 (예: "KRW=X", "DX-Y.NYB", "^VIX")
 * @param years  소급 기간(년), 오늘 기준
 */
export async function fetchDailyPrices(
  ticker: string,
  years:  number,
): Promise<PriceRow[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - years);

  const p1Str = period1.toISOString().slice(0, 10);
  const p2Str = period2.toISOString().slice(0, 10);

  log(`[${ticker}] 일봉 데이터 다운로드 중... (${p1Str} ~ ${p2Str})`);

  const result = await yahooFinance.chart(
    ticker,
    {
      period1:  p1Str,
      period2:  p2Str,
      interval: "1d",
    },
    { validateResult: false },
  );

  const allRows = (result.quotes ?? []) as YahooQuoteRow[];
  log(`[${ticker}] 다운로드 완료: ${allRows.length}개 거래일 (null close 제거 전)`);

  const rows = allRows.filter((row) => row.close != null);
  log(`[${ticker}] 유효 데이터: ${rows.length}개 거래일`);

  return rows.map((row) => ({
    date:      new Date(row.date).toISOString().slice(0, 10),
    open:      round(row.open),
    high:      round(row.high),
    low:       round(row.low),
    close:     round(row.close),
    adj_close: round(row.adjclose ?? row.close),
    volume:    row.volume ?? null,
  }));
}

// ── calcMarketInfo ────────────────────────────────────────────────────────────

/**
 * PriceRow[] 에서 현재가·전일종가·52주 고저를 계산한다.
 *
 * - 52주 기준점은 실행 시점이 아닌 데이터 최신일(latest.date) 기준
 * - prices 가 빈 배열이면 모든 값 null 반환
 */
export function calcMarketInfo(prices: PriceRow[]): MarketInfo {
  if (prices.length === 0) {
    return {
      price:               null,
      previous_close:      null,
      fifty_two_week_high: null,
      fifty_two_week_low:  null,
    };
  }

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1]!;
  const prev   = sorted[sorted.length - 2] ?? null;

  const oneYearAgo = new Date(latest.date + "T00:00:00Z");
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  const yearStr = oneYearAgo.toISOString().slice(0, 10);

  const yearPrices = sorted.filter((p) => p.date >= yearStr);

  const highs = yearPrices.map((p) => p.high).filter((v): v is number => v !== null);
  const lows  = yearPrices.map((p) => p.low).filter((v): v is number => v !== null);

  return {
    price:               latest.close,
    previous_close:      prev?.close ?? null,
    fifty_two_week_high: highs.length > 0 ? Math.max(...highs) : null,
    fifty_two_week_low:  lows.length  > 0 ? Math.min(...lows)  : null,
  };
}
