/**
 * 원달러 환율(USD/KRW) 데이터 업데이트
 *
 * Yahoo Finance에서 KRW=X 티커로 최근 3년치 일봉 환율 데이터를 다운로드하고
 * 주식 티커 JSON과 동일한 구조로 src/db/fx/USDKRW.json 에 저장한다.
 *
 * 스킵 조건:
 *   - USDKRW.json 의 updated_at 이 오늘 날짜이면 건너뜀
 *   - --force 플래그로 강제 재다운로드 가능
 *
 * 실행:
 *   npx tsx scripts/fetch/update_fx_rate.ts
 *   npx tsx scripts/fetch/update_fx_rate.ts --force
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinance from "yahoo-finance2";

import { log } from "../_lib/logger.ts";
import { round } from "../_lib/num.ts";
import { saveJsonAtomic, isUpdatedToday } from "../_lib/io.ts";
import { parseForce } from "../_lib/cli.ts";

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const yahooFinance = new YahooFinance();

// ── 설정 ─────────────────────────────────────────────────────────────────────

const FX_TICKER  = "KRW=X";          // Yahoo Finance USD/KRW 티커
const OUTPUT_DIR = path.resolve(__dirname, "../../../src/db/fx");
const OUTPUT     = path.join(OUTPUT_DIR, "USDKRW.json");
const PRICE_YEARS = 3;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface PriceRow {
  date:      string;
  open:      number | null;
  high:      number | null;
  low:       number | null;
  close:     number | null;
  adj_close: number | null;
  volume:    number | null;
}

interface FxJson {
  ticker:     string;
  updated_at: string;
  info: {
    name:                string;
    exchange:            string;
    currency:            string;
    sector:              null;
    industry:            null;
    country:             null;
    employees:           null;
    is_actively_trading: boolean;
  };
  market: {
    market_cap:          null;
    shares_outstanding:  null;
    float_shares:        null;
    price:               number | null;
    previous_close:      number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_low:  number | null;
    beta:                null;
  };
  liquidity: {
    avg_daily_volume_3m:  null;
    avg_daily_volume_10d: null;
  };
  valuation: {
    trailing_pe:      null;
    forward_pe:       null;
    peg_ratio:        null;
    price_to_book:    null;
    trailing_eps:     null;
    forward_eps:      null;
    enterprise_value: null;
  };
  profitability: {
    profit_margins:     null;
    gross_margins:      null;
    operating_margins:  null;
    roe:                null;
    roa:                null;
    revenue_growth:     null;
    earnings_growth:    null;
    quarterly_earnings: [];
  };
  dividend: {
    rate:         null;
    yield:        null;
    payout_ratio: null;
  };
  ownership: {
    held_pct_institutions: null;
    held_pct_insiders:     null;
    short_ratio:           null;
  };
  prices: PriceRow[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

export { round };

// ── 1단계: 일봉 가격 데이터 다운로드 ─────────────────────────────────────────

async function fetchPrices(): Promise<PriceRow[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - PRICE_YEARS);

  log(`환율 데이터 다운로드 중... (${period1.toISOString().slice(0, 10)} ~ ${period2.toISOString().slice(0, 10)})`);

  const result = await yahooFinance.chart(
    FX_TICKER,
    {
      period1:  period1.toISOString().slice(0, 10),
      period2:  period2.toISOString().slice(0, 10),
      interval: "1d",
    },
    { validateResult: false }
  );

  const allRows = result.quotes ?? [];
  log(`다운로드 완료: ${allRows.length}개 거래일 (null close 제거 전)`);

  // close가 null인 행 제거 (당일 미확정 데이터 등)
  const rows = allRows.filter((row) => row.close != null);
  log(`유효 데이터: ${rows.length}개 거래일`);

  return rows.map((row) => ({
    date:      new Date(row.date).toISOString().slice(0, 10),
    open:      round(row.open),
    high:      round(row.high),
    low:       round(row.low),
    close:     round(row.close),
    adj_close: round(row.adjclose ?? row.close),  // 환율은 수정종가 = 종가
    volume:    row.volume ?? null,
  }));
}

// ── 2단계: 현재가 정보 계산 ───────────────────────────────────────────────────

export function calcMarketInfo(prices: PriceRow[]) {
  if (prices.length === 0) {
    return { price: null, previous_close: null, fifty_two_week_high: null, fifty_two_week_low: null };
  }

  const sorted    = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const latest    = sorted[sorted.length - 1]!;
  const prev      = sorted[sorted.length - 2] ?? null;

  // 52주(약 252 거래일) 범위
  const oneYearAgo = new Date(latest.date);  // 실행 시점이 아닌 데이터 최신일 기준
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
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

// ── 3단계: JSON 빌드 ──────────────────────────────────────────────────────────

export function buildJson(prices: PriceRow[]): FxJson {
  const market = calcMarketInfo(prices);

  return {
    ticker:     "USDKRW",
    updated_at: new Date().toISOString(),

    info: {
      name:                "US Dollar / Korean Won",
      exchange:            "CCY",
      currency:            "KRW",
      sector:              null,
      industry:            null,
      country:             null,
      employees:           null,
      is_actively_trading: true,
    },

    market: {
      market_cap:          null,
      shares_outstanding:  null,
      float_shares:        null,
      price:               market.price,
      previous_close:      market.previous_close,
      fifty_two_week_high: market.fifty_two_week_high,
      fifty_two_week_low:  market.fifty_two_week_low,
      beta:                null,
    },

    liquidity: {
      avg_daily_volume_3m:  null,
      avg_daily_volume_10d: null,
    },

    valuation: {
      trailing_pe:      null,
      forward_pe:       null,
      peg_ratio:        null,
      price_to_book:    null,
      trailing_eps:     null,
      forward_eps:      null,
      enterprise_value: null,
    },

    profitability: {
      profit_margins:     null,
      gross_margins:      null,
      operating_margins:  null,
      roe:                null,
      roa:                null,
      revenue_growth:     null,
      earnings_growth:    null,
      quarterly_earnings: [],
    },

    dividend: {
      rate:         null,
      yield:        null,
      payout_ratio: null,
    },

    ownership: {
      held_pct_institutions: null,
      held_pct_insiders:     null,
      short_ratio:           null,
    },

    prices,
  };
}

// ── 4단계: 파일 저장 ──────────────────────────────────────────────────────────

function saveJson(data: FxJson): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  saveJsonAtomic(OUTPUT, data);

  log(`저장 완료: ${OUTPUT}`);
  log(`현재 환율: ${data.market.price} KRW/USD`);
  log(`52주 고가: ${data.market.fifty_two_week_high}`);
  log(`52주 저가: ${data.market.fifty_two_week_low}`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const force = parseForce(process.argv.slice(2));

  log("=== USD/KRW 환율 데이터 업데이트 시작 ===");

  // 오늘 이미 업데이트된 파일이 있으면 스킵 (--force 로 우회 가능)
  if (!force && isUpdatedToday(OUTPUT)) {
    log("오늘 이미 업데이트됨 — 건너뜀 (재다운로드: --force 플래그 사용)");
    log("=== 스킵 ===");
    return;
  }

  const prices = await fetchPrices();

  if (prices.length < 100) {
    throw new Error(`데이터가 너무 적습니다 (${prices.length}개). Yahoo Finance 응답을 확인하세요.`);
  }

  const data = buildJson(prices);
  saveJson(data);

  log("=== 업데이트 완료 ===");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
