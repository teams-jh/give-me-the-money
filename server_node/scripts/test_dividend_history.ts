/**
 * 배당 히스토리 조회 테스트
 *
 * 목적:
 *   yahoo-finance2의 chart() API로 배당 이벤트를 가져오고
 *   3년 평균 배당률 계산 가능성 확인
 *
 *   (historical()은 deprecated → chart() 사용 권장)
 *   참고: https://github.com/gadicc/yahoo-finance2/issues/795
 *
 * 실행:
 *   npx tsx scripts/test_dividend_history.ts
 *   npx tsx scripts/test_dividend_history.ts --ticker MSFT
 *   npx tsx scripts/test_dividend_history.ts --ticker 005930.KS
 */

import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/esm/src/modules/chart.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical"],
});

const PRICE_YEARS = 3;

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface DividendEvent {
  date:   string;   // YYYY-MM-DD
  amount: number;   // 주당 배당금
}

interface PriceRow {
  date:  string;
  close: number;
}

interface YearSummary {
  year:       number;
  total_paid: number;   // 연도 내 배당금 합계
  avg_price:  number;   // 연도 내 평균 종가
  yield:      number;   // total_paid / avg_price
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function getPeriod(years: number): { period1: string; period2: string } {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - years);
  return {
    period1: period1.toISOString().slice(0, 10),
    period2: period2.toISOString().slice(0, 10),
  };
}

// ── chart() 한 번 호출로 주가 + 배당 이벤트 동시 조회 ────────────────────────

async function fetchChartData(ticker: string): Promise<ChartResultArray> {
  const { period1, period2 } = getPeriod(PRICE_YEARS);

  return yahooFinance.chart(
    ticker,
    {
      period1,
      period2,
      interval: "1d",
      events:   "div",   // 배당 이벤트 포함
    },
    { validateResult: false }
  );
}

// ── 배당 이벤트 파싱 ──────────────────────────────────────────────────────────

function extractDividends(chart: ChartResultArray): DividendEvent[] {
  // chart().events.dividends 는 Record<string, ChartEventDividend>
  const divMap = chart.events?.dividends ?? {};

  if (Array.isArray(divMap)) {
    // Array 형태인 경우 (ChartResultArray.events.dividends)
    return (divMap as { amount: number; date: Date }[]).map((d) => ({
      date:   d.date.toISOString().slice(0, 10),
      amount: d.amount,
    }));
  }

  // Object(Record) 형태인 경우 (ChartEventsObject.dividends)
  return Object.values(divMap as Record<string, { amount: number; date: Date }>).map((d) => ({
    date:   d.date.toISOString().slice(0, 10),
    amount: d.amount,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// ── 주가 파싱 ────────────────────────────────────────────────────────────────

function extractPrices(chart: ChartResultArray): PriceRow[] {
  return chart.quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date:  q.date.toISOString().slice(0, 10),
      close: q.close as number,
    }));
}

// ── 연도별 집계 ────────────────────────────────────────────────────────────────

function buildYearSummaries(
  dividendEvents: DividendEvent[],
  prices: PriceRow[]
): YearSummary[] {
  // 연도별 배당금 합산
  const divByYear = new Map<number, number>();
  for (const ev of dividendEvents) {
    const year = new Date(ev.date).getFullYear();
    divByYear.set(year, (divByYear.get(year) ?? 0) + ev.amount);
  }

  // 연도별 평균 종가 계산
  const pricesByYear = new Map<number, number[]>();
  for (const p of prices) {
    const year = new Date(p.date).getFullYear();
    if (!pricesByYear.has(year)) pricesByYear.set(year, []);
    pricesByYear.get(year)!.push(p.close);
  }

  const avgPriceByYear = new Map<number, number>();
  for (const [year, closes] of pricesByYear) {
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    avgPriceByYear.set(year, avg);
  }

  // 배당금이 있는 연도만 집계
  const years = [...divByYear.keys()].sort();
  return years.map((year) => {
    const total_paid = round4(divByYear.get(year)!);
    const avg_price  = round4(avgPriceByYear.get(year) ?? 0);
    const yld        = avg_price > 0 ? round4(total_paid / avg_price) : 0;
    return { year, total_paid, avg_price, yield: yld };
  });
}

// ── 3년 평균 배당률 ──────────────────────────────────────────────────────────

function calcAvgYield3y(summaries: YearSummary[]): number | null {
  const currentYear = new Date().getFullYear();
  // 진행 중인 현재 연도 제외 (불완전한 데이터)
  const complete = summaries.filter((s) => s.year < currentYear);
  const recent3  = complete.slice(-3);
  if (recent3.length === 0) return null;
  const avg = recent3.reduce((a, s) => a + s.yield, 0) / recent3.length;
  return round4(avg);
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args   = process.argv.slice(2);
  const tIdx   = args.indexOf("--ticker");
  const ticker = tIdx !== -1 ? (args[tIdx + 1] ?? "AAPL") : "AAPL";

  console.log(`\n========== ${ticker} 배당 히스토리 테스트 ==========\n`);

  // 1) chart() 한 번으로 주가 + 배당 이벤트 동시 조회
  console.log("▶ 1. chart() API 호출 (주가 + 배당 이벤트)");
  const chartData = await fetchChartData(ticker);
  console.log(`   meta.symbol   : ${chartData.meta.symbol}`);
  console.log(`   meta.currency : ${chartData.meta.currency}`);
  console.log(`   quotes 수     : ${chartData.quotes.length}일`);
  console.log(`   events 키     : ${JSON.stringify(Object.keys(chartData.events ?? {}))}`);

  // 2) 배당 이벤트 파싱
  console.log("\n▶ 2. 배당 이벤트 파싱");
  const dividendEvents = extractDividends(chartData);
  console.log(`   총 ${dividendEvents.length}건`);
  if (dividendEvents.length > 0) {
    console.log("   최근 8건:");
    dividendEvents.slice(-8).forEach((e) =>
      console.log(`     ${e.date}  배당 $${e.amount}`)
    );
  } else {
    console.log("   ⚠️  배당 이벤트 없음 (무배당 종목일 수 있음)");
  }

  // 3) 주가 파싱
  console.log("\n▶ 3. 주가 파싱");
  const prices = extractPrices(chartData);
  if (prices.length > 0) {
    console.log(`   기간: ${prices[0]!.date} ~ ${prices.at(-1)!.date}  (${prices.length}일)`);
  }

  // 4) 연도별 집계
  console.log("\n▶ 4. 연도별 배당률");
  const summaries = buildYearSummaries(dividendEvents, prices);
  if (summaries.length === 0) {
    console.log("   ⚠️  집계 가능한 배당 데이터 없음");
  } else {
    console.log("   year  total_paid   avg_price    yield");
    summaries.forEach((s) =>
      console.log(
        `   ${s.year}    $${s.total_paid.toFixed(4).padStart(7)}    $${s.avg_price.toFixed(2).padStart(8)}    ${(s.yield * 100).toFixed(3)}%`
      )
    );
  }

  // 5) 3년 평균 배당률
  const avg3y = calcAvgYield3y(summaries);
  console.log("\n▶ 5. 3년 평균 배당률 (현재 연도 제외)");
  if (avg3y !== null) {
    console.log(`   avg_yield_3y = ${(avg3y * 100).toFixed(3)}%  (raw: ${avg3y})`);
  } else {
    console.log("   ⚠️  완전한 연도 데이터 3개 미만");
  }

  console.log("\n========================================\n");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
