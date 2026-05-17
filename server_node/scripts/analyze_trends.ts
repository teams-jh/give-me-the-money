/**
 * analyze_trends.ts
 *
 * 전체 종목의 주가 추세를 분류하여 src/db/{market}_trend/ 디렉토리에 저장한다.
 *
 * 흐름:
 *   1. src/db/metadata/all_{market}_tickers.json  →  분석 대상 티커 목록
 *   2. src/db/{market}_tickers/{TICKER}.json      →  일봉 prices 읽기
 *   3. 기간 커팅  →  다운샘플(주봉/월봉)  →  classifyTrend()
 *   4. src/db/{market}_trend/trend_{n}_{period}.json 저장
 *
 * 실행 예:
 *   npx tsx server_node/scripts/analyze_trends.ts --market us
 *   npx tsx server_node/scripts/analyze_trends.ts --market kr -n 100
 *   npx tsx server_node/scripts/analyze_trends.ts --market us --period 1y
 *   npx tsx server_node/scripts/analyze_trends.ts --market kr -n 50 --period 3m
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classifyTrend } from "../../src/library/shared/classifyTrend.js";
import type { PriceSeries, TrendResult, TrendType } from "../../src/library/shared/classifyTrend.js";

// ── 경로 설정 ─────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, "../../src/db");

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  tickersJson: string;
  tickersDir:  string;
  trendDir:    string;
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: {
    tickersJson: path.join(DB_DIR, "metadata", "all_us_tickers.json"),
    tickersDir:  path.join(DB_DIR, "us_tickers"),
    trendDir:    path.join(DB_DIR, "us_trend"),
  },
  kr: {
    tickersJson: path.join(DB_DIR, "metadata", "all_kr_tickers.json"),
    tickersDir:  path.join(DB_DIR, "kr_tickers"),
    trendDir:    path.join(DB_DIR, "kr_trend"),
  },
};

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

type PeriodOption = "3m" | "1y" | "2y" | "3y";

interface CliArgs {
  market:  string;
  n:       number | undefined;   // 상위 N개 (없으면 전체)
  period:  PeriodOption | undefined;
}

interface RawPrice {
  date:      string;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  adj_close: number;
  volume:    number;
}

interface DailyPrice {
  date:  string;   // "YYYY-MM-DD"
  close: number;
}

interface StockTrend {
  ticker:        string;
  trend:         TrendType;
  slopePct:      number;
  r2:            number;
  slopeEarlyPct: number;
  slopeLatePct:  number;
  totalReturn:   number;
}

interface TrendJson {
  generated_at:   string;
  period:         string;
  analyzed_count: number;
  skipped_count:  number;
  summary: Record<TrendType, number>;
  stocks:  StockTrend[];
}

// ── 설정 상수 ─────────────────────────────────────────────────────────────────

/** period → 몇 일 전까지 커팅하는가 */
const PERIOD_DAYS: Record<PeriodOption, number> = {
  "3m": 90,
  "1y": 365,
  "2y": 730,
  "3y": 1095,
};

/** period → 다운샘플 단위 */
const PERIOD_INTERVAL: Record<PeriodOption, "weekly" | "monthly"> = {
  "3m": "weekly",
  "1y": "monthly",
  "2y": "monthly",
  "3y": "monthly",
};

/** period → classifyTrend minPts */
const PERIOD_MIN_PTS: Record<PeriodOption, number> = {
  "3m": 8,
  "1y": 10,
  "2y": 18,
  "3y": 24,
};

// 전기간: 주봉, minPts 8
const DEFAULT_INTERVAL = "weekly" as const;
const DEFAULT_MIN_PTS  = 8;

// ── 출력 파일명 결정 ──────────────────────────────────────────────────────────

/** -n / --period 조합으로 출력 파일명 결정
 *  예) -n 100 --period 1y  →  trend_100_1y.json
 *      -n 500              →  trend_500_all.json
 *      (옵션 없음)          →  trend_all_all.json
 */
function resolveOutputFile(config: MarketConfig, n: number | undefined, period: PeriodOption | undefined): string {
  const nPart      = n      !== undefined ? String(n) : "all";
  const periodPart = period !== undefined ? period    : "all";
  return path.join(config.trendDir, `trend_${nPart}_${periodPart}.json`);
}

// ── Step 0: CLI 파싱 ──────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let market: string            = "us";
  let n:      number | undefined      = undefined;
  let period: PeriodOption | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--market") {
      market = args[++i] ?? "us";
    } else if (arg === "-n") {
      const val = args[++i];
      const parsed = val !== undefined ? parseInt(val, 10) : NaN;
      if (isNaN(parsed) || parsed <= 0) {
        console.error("❌ -n 옵션은 양의 정수여야 합니다.");
        process.exit(1);
      }
      n = parsed;
    } else if (arg === "--period") {
      const val = args[++i];
      if (val !== "3m" && val !== "1y" && val !== "2y" && val !== "3y") {
        console.error("❌ --period 옵션은 3m | 1y | 2y | 3y 중 하나여야 합니다.");
        process.exit(1);
      }
      period = val;
    }
  }

  return { market, n, period };
}

// ── Step 1: 티커 목록 읽기 ────────────────────────────────────────────────────

function loadTickers(config: MarketConfig, n: number | undefined): string[] {
  const raw  = fs.readFileSync(config.tickersJson, "utf-8");
  const data = JSON.parse(raw) as { tickers: string[] };
  const all  = data.tickers;
  return n !== undefined ? all.slice(0, n) : all;
}

// ── Step 2: 일봉 prices 읽기 ──────────────────────────────────────────────────

/** Yahoo Finance 티커에서 파일명용 코드 추출 (005930.KS → 005930, AAPL → AAPL) */
function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

function loadPrices(ticker: string, config: MarketConfig): DailyPrice[] | null {
  const file = path.join(config.tickersDir, `${tickerToFilename(ticker)}.json`);
  if (!fs.existsSync(file)) return null;

  const raw  = fs.readFileSync(file, "utf-8");
  const data = JSON.parse(raw) as { prices: RawPrice[] };

  return data.prices.map((p) => ({ date: p.date, close: p.close }));
}

// ── Step 3-A: 기간 커팅 ───────────────────────────────────────────────────────

function filterByPeriod(prices: DailyPrice[], period: PeriodOption): DailyPrice[] {
  if (prices.length === 0) return prices;

  // 마지막 날짜 기준으로 cutoff 계산
  const lastDate = new Date(prices[prices.length - 1]!.date);
  const cutoff   = new Date(lastDate);
  cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period]);

  return prices.filter((p) => new Date(p.date) >= cutoff);
}

// ── Step 3-B: 다운샘플 (일봉 → 주봉/월봉) ─────────────────────────────────────

/**
 * 날짜 문자열에서 ISO 주 키(YYYY-WNN) 반환.
 * 간단하게 월요일 기준 주차를 직접 계산한다.
 */
function toWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  // 월요일을 주의 시작으로 맞춤
  const day      = (d.getDay() + 6) % 7;          // 0=Mon … 6=Sun
  const monday   = new Date(d);
  monday.setDate(d.getDate() - day);

  const y  = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;                       // 월요일 날짜를 키로 사용
}

/** 일봉 배열 → 주봉 (각 주의 마지막 거래일 close) */
function toWeekly(prices: DailyPrice[]): DailyPrice[] {
  const map = new Map<string, DailyPrice>();
  for (const p of prices) {
    map.set(toWeekKey(p.date), p);   // 같은 주면 뒤에 오는 값으로 덮어씀
  }
  return Array.from(map.values());   // Map 삽입순 = 날짜순 유지
}

/** 일봉 배열 → 월봉 (각 달의 마지막 거래일 close) */
function toMonthly(prices: DailyPrice[]): DailyPrice[] {
  const map = new Map<string, DailyPrice>();
  for (const p of prices) {
    const key = p.date.slice(0, 7);  // "YYYY-MM"
    map.set(key, p);                 // 같은 달이면 뒤에 오는 값으로 덮어씀
  }
  return Array.from(map.values());
}

function downsample(
  prices: DailyPrice[],
  interval: "weekly" | "monthly",
): DailyPrice[] {
  return interval === "weekly" ? toWeekly(prices) : toMonthly(prices);
}

// ── Step 3-C: PriceSeries 변환 ────────────────────────────────────────────────

function toPriceSeries(prices: DailyPrice[]): PriceSeries {
  return {
    labels: prices.map((p) => p.date),
    values: prices.map((p) => p.close),
  };
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs();

  const config = MARKET_CONFIG[args.market];
  if (!config) {
    console.error(`❌ 알 수 없는 마켓: ${args.market}. 사용 가능: ${Object.keys(MARKET_CONFIG).join(", ")}`);
    process.exit(1);
  }

  const periodLabel = args.period ?? "전기간";
  const interval    = args.period ? PERIOD_INTERVAL[args.period] : DEFAULT_INTERVAL;
  const minPts      = args.period ? PERIOD_MIN_PTS[args.period]  : DEFAULT_MIN_PTS;

  console.log("=".repeat(60));
  console.log(`  전체 종목 주가 추세 분석 [${args.market.toUpperCase()}]`);
  console.log(`  기간: ${periodLabel}  |  봉: ${interval}  |  minPts: ${minPts}`);
  if (args.n !== undefined) console.log(`  대상: 상위 ${args.n}개`);
  console.log("=".repeat(60));

  // 1. 티커 목록
  const tickers = loadTickers(config, args.n);
  log(`📋 분석 대상: ${tickers.length}개 티커`);

  // 2~5. 종목별 분석
  const stocks:   StockTrend[] = [];
  const skipped:  string[]     = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    const prefix = `[${String(i + 1).padStart(4)}/${tickers.length}] ${ticker.padEnd(10)}`;

    // 2. 일봉 읽기
    const rawPrices = loadPrices(ticker, config);
    if (rawPrices === null || rawPrices.length === 0) {
      console.log(`${prefix} → SKIP (파일 없음)`);
      skipped.push(ticker);
      continue;
    }

    // 3-A. 기간 커팅
    const cut = args.period ? filterByPeriod(rawPrices, args.period) : rawPrices;

    // 3-B. 다운샘플
    const sampled = downsample(cut, interval);

    // 3-C. PriceSeries 변환 + 추세 분류
    const series: PriceSeries     = toPriceSeries(sampled);
    const result: TrendResult | null = classifyTrend(series, minPts);

    if (result === null) {
      console.log(`${prefix} → SKIP (데이터 부족: ${sampled.length}봉 < ${minPts})`);
      skipped.push(ticker);
      continue;
    }

    console.log(
      `${prefix} → ${result.trend.padEnd(10)}` +
      `  slope:${String(result.slopePct).padStart(7)}%` +
      `  r2:${result.r2}` +
      `  ret:${result.totalReturn}%`,
    );

    stocks.push({
      ticker,
      trend:         result.trend,
      slopePct:      result.slopePct,
      r2:            result.r2,
      slopeEarlyPct: result.slopeEarlyPct,
      slopeLatePct:  result.slopeLatePct,
      totalReturn:   result.totalReturn,
    });
  }

  // 6. 요약
  const summary: Record<TrendType, number> = {
    bullish:    0,
    bearish:    0,
    sideways:   0,
    recovering: 0,
  };
  for (const s of stocks) summary[s.trend]++;

  console.log("\n" + "=".repeat(60));
  console.log(`✅ 완료: ${stocks.length}개  ❌ 스킵: ${skipped.length}개`);
  console.log(`  강세(bullish):    ${summary.bullish}개`);
  console.log(`  하락(bearish):    ${summary.bearish}개`);
  console.log(`  횡보(sideways):   ${summary.sideways}개`);
  console.log(`  반등(recovering): ${summary.recovering}개`);

  // 7. trend_{n}_{period}.json 저장
  const outputFile = resolveOutputFile(config, args.n, args.period);
  const output: TrendJson = {
    generated_at:   now(),
    period:         periodLabel,
    analyzed_count: stocks.length,
    skipped_count:  skipped.length,
    summary,
    stocks,
  };

  fs.mkdirSync(config.trendDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  log(`📁 저장 완료: ${outputFile}`);
}

main();
