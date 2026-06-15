/**
 * 달러인덱스(US Dollar Index, DXY) 데이터 업데이트
 *
 * Yahoo Finance에서 DX-Y.NYB 티커로 최근 3년치 일봉 데이터를 다운로드하고
 * USDKRW.json 과 동일한 구조로 src/db/fx/USD.json 에 저장한다.
 *
 * 활용 목적:
 *   - USDKRW(원달러 환율)와 비교하여 달러 자체의 강세인지 원화 약세인지 구분
 *   - USD Index 상승 + USDKRW 상승 → 달러 자체 강세
 *   - USD Index 보합 + USDKRW 상승 → 원화 약세
 *
 * 스킵 조건:
 *   - USD.json 의 updated_at 이 오늘 날짜이면 건너뜀
 *   - --force 플래그로 강제 재다운로드 가능
 *
 * 실행:
 *   npx tsx scripts/fetch/update_dollar_index.ts
 *   npx tsx scripts/fetch/update_dollar_index.ts --force
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { log } from "../_lib/logger.ts";
import { saveJsonAtomic, isUpdatedToday } from "../_lib/io.ts";
import { parseForce } from "../_lib/cli.ts";
import { fetchDailyPrices, calcMarketInfo } from "../_gateway/priceGateway.ts";
import type { PriceRow } from "../../../src/library/shared/tickerTypes.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DXY_TICKER  = "DX-Y.NYB";       // Yahoo Finance 달러인덱스 현물 티커
const OUTPUT_DIR  = path.resolve(__dirname, "../../../src/db/fx");
const OUTPUT      = path.join(OUTPUT_DIR, "USD.json");
const PRICE_YEARS = 3;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

// PriceRow → src/library/shared/tickerTypes.ts 에서 import

interface DxyJson {
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

// calcMarketInfo 는 게이트웨이로 이동 — 하위 호환을 위해 re-export
export { calcMarketInfo } from "../_gateway/priceGateway.ts";

// ── 1단계: 일봉 가격 데이터 다운로드 ─────────────────────────────────────────

async function fetchPrices(): Promise<PriceRow[]> {
  return fetchDailyPrices(DXY_TICKER, PRICE_YEARS);
}

// ── 2단계: JSON 빌드 ──────────────────────────────────────────────────────────

export function buildJson(prices: PriceRow[]): DxyJson {
  const market = calcMarketInfo(prices);

  return {
    ticker:     "USDI",
    updated_at: new Date().toISOString(),

    info: {
      name:                "US Dollar Index",
      exchange:            "NYB",
      currency:            "USD",
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

// ── 3단계: 파일 저장 ──────────────────────────────────────────────────────────

function saveJson(data: DxyJson): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  saveJsonAtomic(OUTPUT, data);

  log(`저장 완료: ${OUTPUT}`);
  log(`달러인덱스 현재값: ${data.market.price}`);
  log(`52주 고가: ${data.market.fifty_two_week_high}`);
  log(`52주 저가: ${data.market.fifty_two_week_low}`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const force = parseForce(process.argv.slice(2));

  log("=== US Dollar Index 데이터 업데이트 시작 ===");

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
