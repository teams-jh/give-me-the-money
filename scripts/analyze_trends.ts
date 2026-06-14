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
 *   npx tsx scripts/analyze_trends.ts --market us
 *   npx tsx scripts/analyze_trends.ts --market kr -n 100
 *   npx tsx scripts/analyze_trends.ts --market us --period 1y
 *   npx tsx scripts/analyze_trends.ts --market kr -n 50 --period 3m
 */

import path from "path";
import { fileURLToPath } from "url";
import { classifyTrend } from "../src/library/shared/classifyTrend.ts";
import type { PriceSeries, TrendType } from "../src/library/shared/classifyTrend.ts";
import { log } from "../server_node/scripts/_lib/logger.ts";
import { parseMarket, parseN } from "./_lib/cli.ts";
import { loadTickerList, loadTicker, saveJson } from "../src/library/shared/tickerRepository.ts";
import { toDailyPrices } from "../src/library/shared/tickerMapper.ts";

// ── 경로 설정 ─────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, "../src/db");

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  trendDir: string;
}

/** 출력(trend) 디렉토리만 스크립트가 관리. 티커 로드 경로는 Repository 가 일원화 (#64) */
const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: { trendDir: path.join(DB_DIR, "us/trend") },
  kr: { trendDir: path.join(DB_DIR, "kr/trend") },
};

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

type PeriodOption = "3m" | "1y" | "2y" | "3y";

interface CliArgs {
  market:  string;
  n:       number | undefined;   // 상위 N개 (없으면 전체)
  period:  PeriodOption | undefined;
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
export function resolveOutputFile(market: string, n: number | undefined, period: PeriodOption | undefined): string {
  const nPart      = n      !== undefined ? String(n) : "all";
  const periodPart = period !== undefined ? period    : "all";
  return path.join(MARKET_CONFIG[market]!.trendDir, `trend_${nPart}_${periodPart}.json`);
}

// ── Step 0: CLI 파싱 ──────────────────────────────────────────────────────────

export function parseArgs(): CliArgs {
  const args   = process.argv.slice(2);
  const market = parseMarket(args, "us");
  const n      = parseN(args);

  let period: PeriodOption | undefined = undefined;
  const pIdx = args.indexOf("--period");
  if (pIdx !== -1) {
    const val = args[pIdx + 1];
    if (val !== "3m" && val !== "1y" && val !== "2y" && val !== "3y") {
      console.error("❌ --period 옵션은 3m | 1y | 2y | 3y 중 하나여야 합니다.");
      process.exit(1);
    }
    period = val;
  }

  return { market, n, period };
}

// ── Step 1: 티커 목록 읽기 (Repository 위임) ──────────────────────────────────

export function loadTickers(market: string, n: number | undefined): string[] {
  return loadTickerList(market, undefined, n);
}

// ── Step 2: 일봉 prices 읽기 (Repository 위임) ────────────────────────────────

export function loadPrices(market: string, ticker: string): DailyPrice[] | null {
  const raw = loadTicker(market, ticker);
  return raw ? toDailyPrices(raw) : null;
}

// ── Step 3-A: 기간 커팅 ───────────────────────────────────────────────────────

export function filterByPeriod(prices: DailyPrice[], period: PeriodOption): DailyPrice[] {
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
export function toWeekKey(dateStr: string): string {
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
export function toWeekly(prices: DailyPrice[]): DailyPrice[] {
  const map = new Map<string, DailyPrice>();
  for (const p of prices) {
    map.set(toWeekKey(p.date), p);   // 같은 주면 뒤에 오는 값으로 덮어씀
  }
  return Array.from(map.values());   // Map 삽입순 = 날짜순 유지
}

/** 일봉 배열 → 월봉 (각 달의 마지막 거래일 close) */
export function toMonthly(prices: DailyPrice[]): DailyPrice[] {
  const map = new Map<string, DailyPrice>();
  for (const p of prices) {
    const key = p.date.slice(0, 7);  // "YYYY-MM"
    map.set(key, p);                 // 같은 달이면 뒤에 오는 값으로 덮어씀
  }
  return Array.from(map.values());
}

export function downsample(
  prices: DailyPrice[],
  interval: "weekly" | "monthly",
): DailyPrice[] {
  return interval === "weekly" ? toWeekly(prices) : toMonthly(prices);
}

// ── Step 3-C: PriceSeries 변환 ────────────────────────────────────────────────

export function toPriceSeries(prices: DailyPrice[]): PriceSeries {
  return {
    labels: prices.map((p) => p.date),
    values: prices.map((p) => p.close),
  };
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

export function now(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

// ── 유스케이스 ────────────────────────────────────────────────────────────────

/** runTrendAnalysis() 반환 타입: 집계 포함 순수 데이터 */
export interface TrendAnalysisResult {
  stocks:      StockTrend[];
  skipped:     string[];
  summary:     Record<TrendType, number>;
  periodLabel: string;
  interval:    "weekly" | "monthly";
  minPts:      number;
}

/**
 * 핵심 분석 로직. console / 파일 I/O 에 의존하지 않아 단위 테스트 가능.
 *
 * @param market  - "kr" | "us"
 * @param tickers - 분석할 티커 목록
 * @param period  - 기간 옵션 (없으면 전기간)
 */
export function runTrendAnalysis(
  market:  string,
  tickers: string[],
  period:  PeriodOption | undefined,
): TrendAnalysisResult {
  const periodLabel = period ?? "전기간";
  const interval    = period ? PERIOD_INTERVAL[period] : DEFAULT_INTERVAL;
  const minPts      = period ? PERIOD_MIN_PTS[period]  : DEFAULT_MIN_PTS;

  const stocks:  StockTrend[] = [];
  const skipped: string[]     = [];

  for (const ticker of tickers) {
    const rawPrices = loadPrices(market, ticker);
    if (rawPrices === null || rawPrices.length === 0) {
      skipped.push(ticker);
      continue;
    }

    const cut     = period ? filterByPeriod(rawPrices, period) : rawPrices;
    const sampled = downsample(cut, interval);
    const series  = toPriceSeries(sampled);
    const result  = classifyTrend(series, minPts);

    if (result === null) {
      skipped.push(ticker);
      continue;
    }

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

  const summary: Record<TrendType, number> = {
    bullish: 0, bearish: 0, sideways: 0, recovering: 0,
  };
  for (const s of stocks) summary[s.trend]++;

  return { stocks, skipped, summary, periodLabel, interval, minPts };
}

// ── 프레젠테이션 ──────────────────────────────────────────────────────────────

/**
 * 분석 결과를 콘솔에 출력한다.
 * 도메인 로직을 건드리지 않고 포맷만 변경 가능.
 */
export function printTrendReport(
  result: TrendAnalysisResult,
  opts:   { market: string; n?: number },
): void {
  const { stocks, skipped, summary, periodLabel, interval, minPts } = result;

  console.log("=".repeat(60));
  console.log(`  전체 종목 주가 추세 분석 [${opts.market.toUpperCase()}]`);
  console.log(`  기간: ${periodLabel}  |  봉: ${interval}  |  minPts: ${minPts}`);
  if (opts.n !== undefined) console.log(`  대상: 상위 ${opts.n}개`);
  console.log("=".repeat(60));

  for (const s of stocks) {
    console.log(
      `  ${s.ticker.padEnd(10)} → ${s.trend.padEnd(10)}` +
      `  slope:${String(s.slopePct).padStart(7)}%` +
      `  r2:${s.r2}` +
      `  ret:${s.totalReturn}%`,
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ 완료: ${stocks.length}개  ❌ 스킵: ${skipped.length}개`);
  console.log(`  강세(bullish):    ${summary.bullish}개`);
  console.log(`  하락(bearish):    ${summary.bearish}개`);
  console.log(`  횡보(sideways):   ${summary.sideways}개`);
  console.log(`  반등(recovering): ${summary.recovering}개`);
}

// ── 엔트리 ────────────────────────────────────────────────────────────────────

function main(): void {
  const args   = parseArgs();
  const config = MARKET_CONFIG[args.market]!;

  const tickers  = loadTickers(args.market, args.n);
  const analysis = runTrendAnalysis(args.market, tickers, args.period);

  printTrendReport(analysis, { market: args.market, ...(args.n !== undefined && { n: args.n }) });

  const outputFile = resolveOutputFile(args.market, args.n, args.period);
  const output: TrendJson = {
    generated_at:   now(),
    period:         analysis.periodLabel,
    analyzed_count: analysis.stocks.length,
    skipped_count:  analysis.skipped.length,
    summary:        analysis.summary,
    stocks:         analysis.stocks,
  };

  saveJson(outputFile, output);
  log(`📁 저장 완료: ${outputFile}`);
}

const _isEntryTrends = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;
if (_isEntryTrends) main();