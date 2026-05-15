/**
 * 티커별 메타데이터 JSON 생성 (미국 / 국내 통합)
 *
 * 흐름:
 *   1. --market 에 해당하는 all_{market}_tickers.json 에서 티커 목록 로드
 *   2. 티커별 yahoo-finance2 quoteSummary + historical(3년) 조회
 *   3. src/db/{outputDir}/{TICKER}.json 저장 (원본 데이터만, 판단 로직 없음)
 *   4. 완료 후 all_{market}_tickers.json 을 시총 기준 재정렬
 *
 * 실행:
 *   npx tsx server_node/scripts/update_ticker_metadata.ts --market us          # 미국 전체
 *   npx tsx server_node/scripts/update_ticker_metadata.ts --market kr          # 국내 전체
 *   npx tsx server_node/scripts/update_ticker_metadata.ts --market us --force  # 강제 재다운로드
 *   npx tsx server_node/scripts/update_ticker_metadata.ts --market us --ticker AAPL
 *   npx tsx server_node/scripts/update_ticker_metadata.ts --market kr --ticker 005930.KS
 *
 * 사전 조건:
 *   npx tsx server_node/scripts/merge_us_tickers.ts   # --market us
 *   npx tsx server_node/scripts/merge_kr_tickers.ts   # --market kr
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinance from "yahoo-finance2";
import type { HistoricalRowHistory } from "yahoo-finance2/dist/esm/src/modules/historical.js";

const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
const yahooFinance  = new YahooFinance();

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db");

interface MarketConfig {
  label:       string;   // 로그용 ("미국" | "국내")
  tickersJson: string;   // all_*_tickers.json 절대 경로
  outputDir:   string;   // 티커 JSON 저장 디렉토리 절대 경로
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: {
    label:       "미국",
    tickersJson: path.join(DB_DIR, "metadata", "all_us_tickers.json"),
    outputDir:   path.join(DB_DIR, "us_tickers"),
  },
  kr: {
    label:       "국내",
    tickersJson: path.join(DB_DIR, "metadata", "all_kr_tickers.json"),
    outputDir:   path.join(DB_DIR, "kr_tickers"),
  },
};

const CONCURRENCY = 5;
const BATCH_DELAY = 3_000;   // ms
const PRICE_YEARS = 3;

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

interface PriceRow {
  date:      string;
  open:      number | null;
  high:      number | null;
  low:       number | null;
  close:     number | null;
  adj_close: number | null;
  volume:    number | null;
}

interface QuarterlyEarning {
  quarter:    string | null;
  net_income: number | null;
}

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
  };
  ownership: {
    held_pct_institutions: number | null;
    held_pct_insiders:     number | null;
    short_ratio:           number | null;
  };
  prices: PriceRow[];
}

type ProcessStatus =
  | { status: "ok";      priceCount: number }
  | { status: "skipped"                     }
  | { status: "error";   message: string    };

// ── 유틸 ─────────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function log(msg: string):  void { console.log(`${new Date().toISOString()} [INFO]  ${msg}`); }
function warn(msg: string): void { console.warn(`${new Date().toISOString()} [WARN]  ${msg}`); }
function err(msg: string):  void { console.error(`${new Date().toISOString()} [ERROR] ${msg}`); }

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

function round(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}

function formatQuarter(date: Date | null | undefined): string | null {
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

async function fetchPriceHistory(ticker: string): Promise<PriceRow[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - PRICE_YEARS);

  const rows = await yahooFinance.historical(
    ticker,
    {
      period1:  period1.toISOString().slice(0, 10),
      period2:  period2.toISOString().slice(0, 10),
      interval: "1d",
    },
    { validateResult: false }
  );

  return rows.map((row: HistoricalRowHistory) => {
    const { date, open, high, low, close, adjClose, volume } = row;
    return {
      date:      date.toISOString().slice(0, 10),
      open:      round(open),
      high:      round(high),
      low:       round(low),
      close:     round(close),
      adj_close: round(adjClose),
      volume:    volume ?? null,
    };
  });
}

// ── 3단계: JSON 구조 빌드 ────────────────────────────────────────────────────

function buildTickerJson(
  ticker:  string,
  summary: YfSummary,
  prices:  PriceRow[],
  krName:  string | null = null,
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
function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

function saveTickerJson(ticker: string, data: TickerData, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const name = tickerToFilename(ticker);
  const file = path.join(outputDir, `${name}.json`);
  const tmp  = path.join(outputDir, `${name}.tmp.json`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);   // atomic: 읽기 충돌 없음
}

// ── 5단계: 단일 티커 처리 ────────────────────────────────────────────────────

function isUpdatedToday(file: string): boolean {
  try {
    const data        = JSON.parse(fs.readFileSync(file, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today       = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch {
    return false;
  }
}

async function processTicker(ticker: string, force: boolean, outputDir: string, krName: string | null = null): Promise<ProcessStatus> {
  const file = path.join(outputDir, `${tickerToFilename(ticker)}.json`);

  if (!force && fs.existsSync(file) && isUpdatedToday(file)) {
    log(`[SKIP] ${ticker} — 오늘 이미 다운로드됨 (--force 로 재다운로드 가능)`);
    return { status: "skipped" };
  }

  try {
    const [summary, prices] = await Promise.all([
      fetchQuoteSummary(ticker),
      fetchPriceHistory(ticker),
    ]);

    const data = buildTickerJson(ticker, summary, prices, krName);
    saveTickerJson(ticker, data, outputDir);
    return { status: "ok", priceCount: prices.length };

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
  const sorted = caps.map((c) => c.ticker);

  const output: AllTickersJson = {
    ...allJson,
    updated_at: new Date().toISOString(),
    tickers:    sorted,
  };

  fs.writeFileSync(config.tickersJson, JSON.stringify(output, null, 2), "utf8");
  log(`정렬 완료: ${sorted.length}개 (시총 기준 내림차순)`);
  log(`상위 5개: ${sorted.slice(0, 5).join(", ")}`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args   = process.argv.slice(2);
  const force  = args.includes("--force");
  const tIdx   = args.indexOf("--ticker");
  const single = tIdx !== -1 ? (args[tIdx + 1] ?? null) : null;
  const mIdx   = args.indexOf("--market");
  const market = mIdx !== -1 ? (args[mIdx + 1] ?? "us") : "us";

  const config = MARKET_CONFIG[market];
  if (!config) {
    err(`알 수 없는 마켓: ${market}. 사용 가능: ${Object.keys(MARKET_CONFIG).join(", ")}`);
    process.exit(1);
  }

  log(`=== [${config.label}] 티커 메타데이터 업데이트 시작 ===`);

  const { tickers: allTks, nameMap } = loadTickers(config);
  const tickers = single ? [single.toUpperCase()] : allTks;
  const batches    = chunk(tickers, CONCURRENCY);
  const stats      = { ok: 0, skipped: 0, error: 0 };
  let done = 0;

  for (const batch of batches) {
    const results = await Promise.all(batch.map((t) => processTicker(t, force, config.outputDir, nameMap[t] ?? null)));

    results.forEach((r, i) => {
      done++;
      stats[r.status] += 1;
      if (r.status === "ok") {
        log(`[${done}/${tickers.length}] ${batch[i] ?? ""} ✓  (주가 ${r.priceCount}일)`);
      }
    });

    if (batches.indexOf(batch) < batches.length - 1) await sleep(BATCH_DELAY);
  }

  log(`\n=== 완료 ===`);
  log(`성공: ${stats.ok}  /  스킵: ${stats.skipped}  /  실패: ${stats.error}`);

  if (!single) {
    sortAllTickersByMarketCap(config);
  }
}

main().catch((e: unknown) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
