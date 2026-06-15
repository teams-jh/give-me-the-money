/**
 * 티커별 메타데이터 JSON 생성 (미국 / 국내 통합)
 *
 * 흐름:
 *   1. --market 에 해당하는 all_{market}_tickers.json 에서 티커 목록 로드
 *   2. 티커별 yahoo-finance2 quoteSummary + chart(4년, 배당 이벤트 포함) 조회
 *   3. src/db/{outputDir}/{TICKER}.json 저장 (원본 데이터만, 판단 로직 없음)
 *   4. 완료 후 all_{market}_tickers.json 을 시총 기준 재정렬
 *
 * 실행:
 *   npx tsx scripts/fetch/update_ticker_metadata.ts --market us          # 미국 전체
 *   npx tsx scripts/fetch/update_ticker_metadata.ts --market kr          # 국내 전체
 *   npx tsx scripts/fetch/update_ticker_metadata.ts --market us --force  # 강제 재다운로드
 *   npx tsx scripts/fetch/update_ticker_metadata.ts --market us --ticker AAPL
 *   npx tsx scripts/fetch/update_ticker_metadata.ts --market kr --ticker 005930.KS
 *
 * 사전 조건:
 *   npx tsx scripts/merge/merge_us_tickers.ts   # --market us
 *   npx tsx scripts/merge/merge_kr_tickers.ts   # --market kr
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinance from "yahoo-finance2";
import type { ChartResultArray, ChartResultArrayQuote } from "yahoo-finance2/modules/chart";

import { log, warn, err } from "../_lib/logger.ts";
import { round } from "../_lib/num.ts";
import { saveJsonAtomic, isUpdatedToday } from "../_lib/io.ts";
import { parseMarket, parseForce } from "../_lib/cli.ts";
import type { PriceRow, QuarterlyEarning } from "../../../src/library/shared/tickerTypes.ts";

const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
const yahooFinance  = new YahooFinance();

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

const DB_DIR          = path.resolve(__dirname, "../../../src/db");
const STOCK_INDEX_DIR = path.resolve(__dirname, "../../../src/db/stock_market_index");

interface MarketSource {
  label: string;   // count 키 접두사 (예: "kospi300" → kospi300_count)
  path:  string;   // 소스 JSON 절대 경로
}

interface MarketConfig {
  label:       string;          // 로그용 ("미국" | "국내")
  tickersJson: string;          // all_*_tickers.json 절대 경로
  outputDir:   string;          // 티커 JSON 저장 디렉토리 절대 경로
  sources:     MarketSource[];  // 구성종목 소스 파일 목록 (카운트 재계산용)
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: {
    label:       "미국",
    tickersJson: path.join(DB_DIR, "metadata", "all_us_tickers.json"),
    outputDir:   path.join(DB_DIR, "us/tickers"),
    sources: [
      { label: "top1000", path: path.join(STOCK_INDEX_DIR, "top1000_us_tickers.json") },
      { label: "manual",  path: path.join(STOCK_INDEX_DIR, "manual_us_tickers.json")  },
    ],
  },
  kr: {
    label:       "국내",
    tickersJson: path.join(DB_DIR, "metadata", "all_kr_tickers.json"),
    outputDir:   path.join(DB_DIR, "kr/tickers"),
    sources: [
      { label: "kospi300", path: path.join(STOCK_INDEX_DIR, "kospi300_tickers.json")  },
      { label: "kosdaq200", path: path.join(STOCK_INDEX_DIR, "kosdaq200_tickers.json") },
      { label: "manual",   path: path.join(STOCK_INDEX_DIR, "manual_kr_tickers.json") },
    ],
  },
};

const CONCURRENCY = 5;
const BATCH_DELAY = 3_000;   // ms

// chart() 조회 기간: TTM 계산을 위해 평균 대상(3년)보다 1년 더 조회
const FETCH_YEARS = 4;
// prices 배열에 저장하는 기간 (기존과 동일)
const STORE_YEARS = 3;
// 3년 평균 배당률 계산 대상 기간
const AVG_YEARS   = 3;

const QUOTE_SUMMARY_MODULES = [
  "price",
  "assetProfile",
  "defaultKeyStatistics",
  "summaryDetail",
  "financialData",
  "incomeStatementHistoryQuarterly",
] as const;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

/** yahoo-finance2 quoteSummary 에서 실제로 사용하는 필드만 정의 */
interface YfSummary {
  price?: {
    longName?:           string | null;
    shortName?:          string | null;
    exchangeName?:       string | null;
    exchange?:           string | null;
    currency?:           string | null;
    marketCap?:          number | null;
    regularMarketPrice?: number | null;
    marketState?:        string | null;
  };
  assetProfile?: {
    sector?:                string | null;
    industry?:              string | null;
    country?:               string | null;
    fullTimeEmployees?:     number | null;
    website?:               string | null;
    longBusinessSummary?:   string | null;
  };
  defaultKeyStatistics?: {
    sharesOutstanding?:        number | null;
    floatShares?:              number | null;
    pegRatio?:                 number | null;
    priceToBook?:              number | null;
    trailingEps?:              number | null;
    forwardEps?:               number | null;
    enterpriseValue?:          number | null;
    heldPercentInstitutions?:  number | null;
    heldPercentInsiders?:      number | null;
    shortRatio?:               number | null;
  };
  summaryDetail?: {
    previousClose?:     number | null;
    fiftyTwoWeekHigh?:  number | null;
    fiftyTwoWeekLow?:   number | null;
    beta?:              number | null;
    averageVolume?:     number | null;
    averageVolume10days?: number | null;
    trailingPE?:        number | null;
    forwardPE?:         number | null;
    dividendRate?:      number | null;
    dividendYield?:     number | null;
    payoutRatio?:       number | null;
  };
  financialData?: {
    currentPrice?:      number | null;
    profitMargins?:     number | null;
    grossMargins?:      number | null;
    operatingMargins?:  number | null;
    returnOnEquity?:    number | null;
    returnOnAssets?:    number | null;
    revenueGrowth?:     number | null;
    earningsGrowth?:    number | null;
  };
  incomeStatementHistoryQuarterly?: {
    incomeStatementHistory?: Array<{
      endDate?:   Date | null;
      netIncome?: number | null;
    }>;
  };
}

/** chart() 배당 이벤트 한 건 */
interface DividendEvent {
  date:   string;   // YYYY-MM-DD
  amount: number;   // 주당 배당금
}

/** fetchChartData() 반환값 */
interface ChartData {
  prices:    PriceRow[];        // FETCH_YEARS치 전체 (TTM 계산용)
  dividends: DividendEvent[];   // FETCH_YEARS치 배당 이벤트
}

// PriceRow, QuarterlyEarning → src/library/shared/tickerTypes.ts 에서 import

interface TickerData {
  ticker:     string;
  updated_at: string;
  info: {
    name:                string | null;
    kr_name:             string | null;  // 한글명 (국내주식만, 해외주식은 null)
    exchange:            string | null;
    currency:            string | null;
    sector:              string | null;
    industry:            string | null;
    country:             string | null;
    employees:           number | null;
    is_actively_trading: boolean | null;
  };
  market: {
    market_cap:          number | null;
    shares_outstanding:  number | null;
    float_shares:        number | null;
    price:               number | null;
    previous_close:      number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_low:  number | null;
    beta:                number | null;
  };
  liquidity: {
    avg_daily_volume_3m:  number | null;
    avg_daily_volume_10d: number | null;
  };
  valuation: {
    trailing_pe:      number | null;
    forward_pe:       number | null;
    peg_ratio:        number | null;
    price_to_book:    number | null;
    trailing_eps:     number | null;
    forward_eps:      number | null;
    enterprise_value: number | null;
  };
  profitability: {
    profit_margins:     number | null;
    gross_margins:      number | null;
    operating_margins:  number | null;
    roe:                number | null;
    roa:                number | null;
    revenue_growth:     number | null;
    earnings_growth:    number | null;
    quarterly_earnings: QuarterlyEarning[];
  };
  dividend: {
    rate:         number | null;
    yield:        number | null;
    payout_ratio: number | null;
    avg_yield_3y: number | null;   // 일별 TTM 배당수익률의 3년 평균 (무배당 시 null)
  };
  ownership: {
    held_pct_institutions: number | null;
    held_pct_insiders:     number | null;
    short_ratio:           number | null;
  };
  prices: PriceRow[];
}

type ProcessStatus =
  | { status: "ok";       priceCount: number }
  | { status: "intraday"; priceCount: number }
  | { status: "skipped"                      }
  | { status: "error";    message: string    };

// ── 유틸 ─────────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

export { round };

export function formatQuarter(date: Date | null | undefined): string | null {
  if (!date) return null;
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}Q${q}`;
}

// ── 1단계: 전체 티커 목록 로드 ───────────────────────────────────────

function loadTickers(config: MarketConfig): { tickers: string[]; nameMap: Record<string, string> } {
  if (!fs.existsSync(config.tickersJson)) {
    const scriptName = path.basename(config.tickersJson).replace("all_", "merge_").replace(".json", ".ts");
    throw new Error(
      `${config.tickersJson} 파일이 없습니다. ${scriptName} 를 먼저 실행하세요.`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(config.tickersJson, "utf8")) as {
    tickers: string[];
    name_map?: Record<string, string>;
  };
  log(`[${config.label}] 전체 티커 ${parsed.tickers.length}개 로드`);
  return { tickers: parsed.tickers, nameMap: parsed.name_map ?? {} };
}

// ── 2단계: 종목 데이터 조회 ──────────────────────────────────────────────────

async function fetchQuoteSummary(ticker: string): Promise<YfSummary> {
  return yahooFinance.quoteSummary(
    ticker,
    { modules: [...QUOTE_SUMMARY_MODULES] },
    { validateResult: false }
  ) as Promise<YfSummary>;
}

async function fetchChartData(ticker: string): Promise<ChartData> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - FETCH_YEARS);

  const chart = await yahooFinance.chart(
    ticker,
    {
      period1:  period1.toISOString().slice(0, 10),
      period2:  period2.toISOString().slice(0, 10),
      interval: "1d",
      events:   "div",   // 배당 이벤트 포함
    },
    { validateResult: false }
  ) as ChartResultArray;

  // 주가 파싱
  const prices: PriceRow[] = chart.quotes
    .filter((q: ChartResultArrayQuote) => q.close != null)
    .map((q: ChartResultArrayQuote) => ({
      date:      q.date.toISOString().slice(0, 10),
      open:      round(q.open   as number | null),
      high:      round(q.high   as number | null),
      low:       round(q.low    as number | null),
      close:     round(q.close  as number | null),
      adj_close: round((q as Record<string, unknown>).adjclose as number | null),
      volume:    (q.volume as number | null) ?? null,
    }));

  // 배당 이벤트 파싱
  // chart().events.dividends 는 버전에 따라 Array | Record 두 형태로 올 수 있음
  const rawDivs = chart.events?.dividends ?? [];
  const dividends: DividendEvent[] = (
    Array.isArray(rawDivs)
      ? rawDivs
      : Object.values(rawDivs as Record<string, { amount: number; date: Date }>)
  )
    .map((d) => ({
      date:   (d.date as Date).toISOString().slice(0, 10),
      amount: d.amount as number,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { prices, dividends };
}

// ── 오늘 OHLC 1봉만 조회 ─────────────────────────────────────────────────────

async function fetchTodayOhlc(ticker: string): Promise<PriceRow | null> {
  const today = new Date().toISOString().slice(0, 10);

  const chart = await yahooFinance.chart(
    ticker,
    {
      period1:  today,
      period2:  today,
      interval: "1d",
    },
    { validateResult: false }
  ) as ChartResultArray;

  const quote = chart.quotes.find(
    (q: ChartResultArrayQuote) => q.close != null
  );
  if (!quote) return null;

  return {
    date:      quote.date.toISOString().slice(0, 10),
    open:      round(quote.open   as number | null),
    high:      round(quote.high   as number | null),
    low:       round(quote.low    as number | null),
    close:     round(quote.close  as number | null),
    adj_close: round((quote as Record<string, unknown>).adjclose as number | null),
    volume:    (quote.volume as number | null) ?? null,
  };
}

// ── 오늘 봉 patch (prices 마지막 항목 교체 or append) ────────────────────────

function patchTodayPrice(file: string, todayRow: PriceRow): number {
  const data   = JSON.parse(fs.readFileSync(file, "utf8")) as TickerData;
  const prices = data.prices;

  const lastDate = prices.length > 0 ? prices[prices.length - 1]!.date : "";

  if (lastDate === todayRow.date) {
    // 오늘 봉이 이미 있으면 덮어쓰기 (장중 재호출마다 최신화)
    prices[prices.length - 1] = todayRow;
  } else {
    // 오늘 봉이 없으면 append (첫 장중 호출)
    prices.push(todayRow);
  }

  data.updated_at = new Date().toISOString();

  saveJsonAtomic(file, data);

  return prices.length;
}

// ── 3년 평균 배당률 (일별 TTM 방식) ─────────────────────────────────────────
//
// 각 거래일 t 마다:
//   TTM_t        = 직전 365일 배당금 합계
//   daily_yield_t = TTM_t / 종가_t
//
// avg_yield_3y = Σ daily_yield_t / N  (N = 최근 3년 거래일 수, 약 750)
//
// 무배당 종목(dividends 없음) → null 반환

export function calcAvgYield3y(
  allPrices: PriceRow[],
  dividends: DividendEvent[],
): number | null {
  if (dividends.length === 0) return null;

  // 평균 계산 대상: 최근 AVG_YEARS 년 거래일
  const avgStart = new Date();
  avgStart.setFullYear(avgStart.getFullYear() - AVG_YEARS);
  const avgStartStr = avgStart.toISOString().slice(0, 10);

  const targetPrices = allPrices.filter(
    (p) => p.date >= avgStartStr && p.close != null && p.close > 0
  );
  if (targetPrices.length === 0) return null;

  const sortedDivs = [...dividends].sort((a, b) => a.date.localeCompare(b.date));

  let yieldSum = 0;

  for (const price of targetPrices) {
    // TTM 윈도우: [date - 365일, date)
    const windowEnd   = price.date;
    const windowStart = new Date(price.date);
    windowStart.setDate(windowStart.getDate() - 365);
    const windowStartStr = windowStart.toISOString().slice(0, 10);

    const ttm = sortedDivs
      .filter((d) => d.date >= windowStartStr && d.date < windowEnd)
      .reduce((sum, d) => sum + d.amount, 0);

    yieldSum += ttm / price.close!;
  }

  const avg = yieldSum / targetPrices.length;
  return Math.round(avg * 10000) / 10000;
}



export function buildTickerJson(
  ticker:    string,
  summary:   YfSummary,
  allPrices: PriceRow[],        // FETCH_YEARS치 전체 (TTM 계산용)
  dividends: DividendEvent[],   // FETCH_YEARS치 배당 이벤트
  krName:    string | null = null,
): TickerData {
  const p   = summary.price                           ?? {};
  const ap  = summary.assetProfile                    ?? {};
  const ks  = summary.defaultKeyStatistics            ?? {};
  const sd  = summary.summaryDetail                   ?? {};
  const fd  = summary.financialData                   ?? {};
  const ish = summary.incomeStatementHistoryQuarterly ?? {};

  // 분기 순이익 (최신 4개)
  const quarterlyEarnings: QuarterlyEarning[] = (
    ish.incomeStatementHistory ?? []
  )
    .slice(0, 4)
    .map((q) => ({
      quarter:    formatQuarter(q.endDate ?? null),
      net_income: q.netIncome ?? null,
    }));

  // avg_yield_3y: 일별 TTM 배당수익률의 3년 평균
  const avg_yield_3y = calcAvgYield3y(allPrices, dividends);

  // JSON 저장용 prices: 최근 STORE_YEARS 치만 (기존과 동일)
  const storeStart = new Date();
  storeStart.setFullYear(storeStart.getFullYear() - STORE_YEARS);
  const storeStartStr = storeStart.toISOString().slice(0, 10);
  const prices = allPrices.filter((row) => row.date >= storeStartStr);

  return {
    ticker,
    updated_at: new Date().toISOString(),

    info: {
      name:                p.longName ?? p.shortName ?? null,
      kr_name:             krName,
      exchange:            p.exchangeName ?? p.exchange ?? null,
      currency:            p.currency    ?? null,
      sector:              ap.sector     ?? null,
      industry:            ap.industry   ?? null,
      country:             ap.country    ?? null,
      employees:           ap.fullTimeEmployees      ?? null,
      is_actively_trading: p.marketState != null ? p.marketState !== "POST" : null,
    },

    market: {
      market_cap:          p.marketCap          ?? null,
      shares_outstanding:  ks.sharesOutstanding  ?? null,
      float_shares:        ks.floatShares        ?? null,
      price:               p.regularMarketPrice ?? fd.currentPrice ?? null,
      previous_close:      sd.previousClose      ?? null,
      fifty_two_week_high: sd.fiftyTwoWeekHigh   ?? null,
      fifty_two_week_low:  sd.fiftyTwoWeekLow    ?? null,
      beta:                sd.beta               ?? null,
    },

    liquidity: {
      avg_daily_volume_3m:  sd.averageVolume        ?? null,
      avg_daily_volume_10d: sd.averageVolume10days  ?? null,
    },

    valuation: {
      trailing_pe:      sd.trailingPE      ?? null,
      forward_pe:       sd.forwardPE       ?? null,
      peg_ratio:        ks.pegRatio        ?? null,
      price_to_book:    ks.priceToBook     ?? null,
      trailing_eps:     ks.trailingEps     ?? null,
      forward_eps:      ks.forwardEps      ?? null,
      enterprise_value: ks.enterpriseValue ?? null,
    },

    profitability: {
      profit_margins:    fd.profitMargins    ?? null,
      gross_margins:     fd.grossMargins     ?? null,
      operating_margins: fd.operatingMargins ?? null,
      roe:               fd.returnOnEquity   ?? null,
      roa:               fd.returnOnAssets   ?? null,
      revenue_growth:    fd.revenueGrowth    ?? null,
      earnings_growth:   fd.earningsGrowth   ?? null,
      quarterly_earnings: quarterlyEarnings,
    },

    dividend: {
      rate:         sd.dividendRate  ?? null,
      yield:        sd.dividendYield ?? null,
      payout_ratio: sd.payoutRatio   ?? null,
      avg_yield_3y,
    },

    ownership: {
      held_pct_institutions: ks.heldPercentInstitutions ?? null,
      held_pct_insiders:     ks.heldPercentInsiders     ?? null,
      short_ratio:           ks.shortRatio              ?? null,
    },

    prices,
  };
}

// ── 4단계: 파일 저장 ──────────────────────────────────────────────────────────

/** Yahoo Finance 티커에서 파일명용 코드 추출 (005930.KS → 005930, AAPL → AAPL) */
export function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

function saveTickerJson(ticker: string, data: TickerData, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const name = tickerToFilename(ticker);
  const file = path.join(outputDir, `${name}.json`);
  saveJsonAtomic(file, data);   // atomic: 읽기 충돌 없음
}

// ── 5단계: 단일 티커 처리 ────────────────────────────────────────────────────

export { isUpdatedToday };

async function processTicker(ticker: string, force: boolean, outputDir: string, krName: string | null = null): Promise<ProcessStatus> {
  const file = path.join(outputDir, `${tickerToFilename(ticker)}.json`);

  if (!force && fs.existsSync(file) && isUpdatedToday(file)) {
    // 오늘 이미 풀 다운로드됨 → 오늘 OHLC 1봉만 갱신
    try {
      const todayRow = await fetchTodayOhlc(ticker);
      if (todayRow) {
        const count = patchTodayPrice(file, todayRow);
        return { status: "intraday", priceCount: count };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warn(`[INTRADAY FAIL] ${ticker} — ${msg}`);
    }
    // 장전/장후 또는 오류 → skipped
    // (기존 log 제거하고 아래로 fall-through)
    return { status: "skipped" };
  }

  try {
    const [summary, { prices: allPrices, dividends }] = await Promise.all([
      fetchQuoteSummary(ticker),
      fetchChartData(ticker),
    ]);

    const data = buildTickerJson(ticker, summary, allPrices, dividends, krName);
    saveTickerJson(ticker, data, outputDir);
    const storePrices = data.prices.length;
    return { status: "ok", priceCount: storePrices };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`[FAIL] ${ticker} — ${msg}`);
    return { status: "error", message: msg };
  }
}

// ── 시총 기준 재정렬 ──────────────────────────────────────────────────────────

interface AllTickersJson {
  updated_at:  string;
  source:      string;
  total_count: number;
  tickers:     string[];
  name_map?:   Record<string, string>;  // 한글명 매핑 (국내주식용)
  [key: string]: unknown;   // nasdaq100_count, russell1000_count 등 동적 카운트 필드
}

function sortAllTickersByMarketCap(config: MarketConfig): void {
  log(`=== [${config.label}] 시총 기준 재정렬 시작 ===`);

  const allJson = JSON.parse(
    fs.readFileSync(config.tickersJson, "utf8")
  ) as AllTickersJson;

  const caps: { ticker: string; cap: number }[] = [];

  for (const ticker of allJson.tickers) {
    const file = path.join(config.outputDir, `${tickerToFilename(ticker)}.json`);
    if (!fs.existsSync(file)) continue;

    const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
      market: { market_cap: number | null };
    };
    caps.push({ ticker, cap: data.market.market_cap ?? 0 });
  }

  caps.sort((a, b) => b.cap - a.cap);
  const sorted    = caps.map((c) => c.ticker);
  const sortedSet = new Set(sorted);

  // 파일이 존재하는 티커 기준으로 소스별 카운트 재계산
  const updatedCounts: Record<string, number> = {};
  for (const src of config.sources) {
    if (!fs.existsSync(src.path)) { updatedCounts[`${src.label}_count`] = 0; continue; }
    const srcJson = JSON.parse(fs.readFileSync(src.path, "utf8")) as { tickers: string[] };
    updatedCounts[`${src.label}_count`] = srcJson.tickers.filter(t => sortedSet.has(t)).length;
  }

  const output: AllTickersJson = {
    ...allJson,
    updated_at:  new Date().toISOString(),
    total_count: sorted.length,
    ...updatedCounts,
    tickers:     sorted,
  };

  fs.writeFileSync(config.tickersJson, JSON.stringify(output, null, 2), "utf8");
  log(`정렬 완료: ${sorted.length}개 (시총 기준 내림차순)`);
  log(`상위 5개: ${sorted.slice(0, 5).join(", ")}`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const args   = process.argv.slice(2);
  const force  = parseForce(args);
  const market = parseMarket(args, { default: "us" });
  const tIdx   = args.indexOf("--ticker");
  const single = tIdx !== -1 ? (args[tIdx + 1] ?? null) : null;

  const config = MARKET_CONFIG[market]!;

  log(`=== [${config.label}] 티커 메타데이터 업데이트 시작 ===`);

  const { tickers: allTks, nameMap } = loadTickers(config);
  const tickers = single ? [single.toUpperCase()] : allTks;
  const batches    = chunk(tickers, CONCURRENCY);
  const stats      = { ok: 0, intraday: 0, skipped: 0, error: 0 };
  let done = 0;

  for (const batch of batches) {
    const results = await Promise.all(batch.map((t) => processTicker(t, force, config.outputDir, nameMap[t] ?? null)));

    results.forEach((r, i) => {
      done++;
      stats[r.status] += 1;
      if (r.status === "ok") {
        log(`[${done}/${tickers.length}] ${batch[i] ?? ""} ✓  (주가 ${r.priceCount}일)`);
      } else if (r.status === "intraday") {
        log(`[${done}/${tickers.length}] ${batch[i] ?? ""} ↻  (장중 OHLC 갱신, ${r.priceCount}일)`);
      }
    });

    if (batches.indexOf(batch) < batches.length - 1) await sleep(BATCH_DELAY);
  }

  log(`\n=== 완료 ===`);
  log(`성공: ${stats.ok}  /  장중갱신: ${stats.intraday}  /  스킵: ${stats.skipped}  /  실패: ${stats.error}`);

  if (!single) {
    sortAllTickersByMarketCap(config);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    err(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
