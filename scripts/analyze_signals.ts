/**
 * analyze_signals.ts
 *
 * 전체 종목의 기술적 이상징후를 분석하여 src/db/{market}_signals/ 에 저장한다.
 *
 * 흐름:
 *   1. src/db/metadata/all_{market}_tickers.json  →  분석 대상 티커 목록
 *   2. src/db/{market}_tickers/{TICKER}.json      →  OHLCV prices 읽기
 *   3. analyzeSignals()                           →  신호 감지
 *   4. src/db/{market}_signals/signals_{n}.json   →  결과 저장
 *
 * 실행 예 (루트 디렉토리에서):
 *   server_node/node_modules/.bin/tsx scripts/analyze_signals.ts --market kr
 *   server_node/node_modules/.bin/tsx scripts/analyze_signals.ts --market us -n 100
 *   server_node/node_modules/.bin/tsx scripts/analyze_signals.ts --market kr --min-score 2
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeSignals } from "../src/library/shared/signals.ts";
import type { SignalSummary } from "../src/library/shared/signals.ts";
import type { OHLCV }        from "../src/library/shared/indicators.ts";

// ── 경로 설정 ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_DIR     = path.resolve(__dirname, "../src/db");

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  tickersJson: string;
  tickersDir:  string;
  signalsDir:  string;
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: {
    tickersJson: path.join(DB_DIR, "metadata", "all_us_tickers.json"),
    tickersDir:  path.join(DB_DIR, "us_tickers"),
    signalsDir:  path.join(DB_DIR, "us_signals"),
  },
  kr: {
    tickersJson: path.join(DB_DIR, "metadata", "all_kr_tickers.json"),
    tickersDir:  path.join(DB_DIR, "kr_tickers"),
    signalsDir:  path.join(DB_DIR, "kr_signals"),
  },
};

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface CliArgs {
  market:   string;
  n?:       number;    // 상위 N개 (없으면 전체)
  minScore: number;    // score 절댓값 최소 기준 (이 미만이면 저장 제외)
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

interface SignalsJson {
  generated_at:   string;
  market:         string;
  analyzed_count: number;
  skipped_count:  number;
  alerted_count:  number;  // score != 0 인 종목 수
  summary: {
    bullish_count: number;  // score > 0
    bearish_count: number;  // score < 0
    neutral_count: number;  // score == 0 이지만 스퀴즈 등 neutral 신호 있는 것
  };
  stocks: SignalSummary[];
}

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let market   = "kr";
  let n: number | undefined;
  let minScore = 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--market") {
      market = args[++i] ?? "kr";
    } else if (arg === "-n") {
      const val = parseInt(args[++i] ?? "", 10);
      if (!isNaN(val) && val > 0) n = val;
    } else if (arg === "--min-score") {
      const val = parseFloat(args[++i] ?? "0");
      if (!isNaN(val) && val >= 0) minScore = val;
    }
  }

  return { market, n, minScore };
}

// ── 티커 목록 읽기 ────────────────────────────────────────────────────────────

function loadTickers(config: MarketConfig, n?: number): string[] {
  const raw  = fs.readFileSync(config.tickersJson, "utf-8");
  const data = JSON.parse(raw) as { tickers: string[] };
  return n !== undefined ? data.tickers.slice(0, n) : data.tickers;
}

// ── 종목 OHLCV 읽기 ───────────────────────────────────────────────────────────

function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

function loadOHLCV(ticker: string, config: MarketConfig): OHLCV[] | null {
  const file = path.join(config.tickersDir, `${tickerToFilename(ticker)}.json`);
  if (!fs.existsSync(file)) return null;

  const raw  = fs.readFileSync(file, "utf-8");
  const data = JSON.parse(raw) as { prices: RawPrice[] };

  return data.prices.map(p => ({
    date:   p.date,
    open:   p.open,
    high:   p.high,
    low:    p.low,
    close:  p.close,
    volume: p.volume,
  }));
}

// ── 출력 파일명 ───────────────────────────────────────────────────────────────

function resolveOutputFile(config: MarketConfig, n?: number): string {
  const nPart = n !== undefined ? String(n) : "all";
  return path.join(config.signalsDir, `signals_${nPart}.json`);
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function nowStr(): string {
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
    console.error(`❌ 알 수 없는 마켓: ${args.market}`);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log(`  기술적 이상징후 신호 분석 [${args.market.toUpperCase()}]`);
  if (args.n)        console.log(`  대상: 상위 ${args.n}개`);
  if (args.minScore) console.log(`  최소 score 필터: ±${args.minScore}`);
  console.log("=".repeat(60));

  // 1. 티커 목록
  const tickers = loadTickers(config, args.n);
  log(`📋 분석 대상: ${tickers.length}개 티커`);

  const results:  SignalSummary[] = [];
  const skipped:  string[]        = [];

  // 2. 종목별 분석
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    const prefix = `[${String(i + 1).padStart(4)}/${tickers.length}] ${ticker.padEnd(12)}`;

    const ohlcv = loadOHLCV(ticker, config);
    if (!ohlcv || ohlcv.length < 30) {
      console.log(`${prefix} → SKIP (데이터 부족 또는 파일 없음)`);
      skipped.push(ticker);
      continue;
    }

    const summary = analyzeSignals(ticker, ohlcv);

    // minScore 필터 (score 절댓값)
    if (Math.abs(summary.score) < args.minScore && summary.alerts.length === 0) {
      continue;
    }

    // 콘솔 출력 (신호 있는 종목만)
    if (summary.alerts.length > 0) {
      const scoreStr  = summary.score > 0 ? `+${summary.score}` : String(summary.score);
      const alertList = summary.alerts.map(a => `[${a.direction[0]?.toUpperCase()}] ${a.label}`).join(" | ");
      console.log(`${prefix} score:${scoreStr.padStart(5)}  RSI:${String(summary.rsi?.toFixed(1) ?? "N/A").padStart(5)}  ${alertList}`);
    }

    results.push(summary);
  }

  // 3. 요약 집계
  const bullishCount = results.filter(r => r.score > 0).length;
  const bearishCount = results.filter(r => r.score < 0).length;
  const neutralCount = results.filter(r => r.score === 0 && r.alerts.length > 0).length;
  const alertedCount = results.filter(r => r.alerts.length > 0).length;

  console.log("\n" + "=".repeat(60));
  console.log(`✅ 완료: ${results.length}개 분석  ❌ 스킵: ${skipped.length}개`);
  console.log(`  🟢 매수 우세 (score > 0): ${bullishCount}개`);
  console.log(`  🔴 매도 우세 (score < 0): ${bearishCount}개`);
  console.log(`  ⚪ 중립 신호 있음:         ${neutralCount}개`);
  console.log(`  📣 신호 감지 총계:         ${alertedCount}개`);

  // 상위 매수/매도 종목 출력
  const topBullish = [...results]
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const topBearish = [...results]
    .filter(r => r.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  if (topBullish.length > 0) {
    console.log("\n  🟢 매수 신호 상위 5개:");
    topBullish.forEach(r => {
      console.log(`    ${r.ticker.padEnd(12)} score:+${r.score}  RSI:${r.rsi?.toFixed(1) ?? "N/A"}  MDD:${r.mdd}%`);
    });
  }

  if (topBearish.length > 0) {
    console.log("\n  🔴 매도 신호 상위 5개:");
    topBearish.forEach(r => {
      console.log(`    ${r.ticker.padEnd(12)} score:${r.score}  RSI:${r.rsi?.toFixed(1) ?? "N/A"}  MDD:${r.mdd}%`);
    });
  }

  // 4. JSON 저장
  const outputFile = resolveOutputFile(config, args.n);
  const output: SignalsJson = {
    generated_at:   nowStr(),
    market:         args.market,
    analyzed_count: results.length,
    skipped_count:  skipped.length,
    alerted_count:  alertedCount,
    summary: {
      bullish_count: bullishCount,
      bearish_count: bearishCount,
      neutral_count: neutralCount,
    },
    stocks: results.sort((a, b) => b.score - a.score),  // score 높은 순 정렬
  };

  fs.mkdirSync(config.signalsDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  log(`📁 저장 완료: ${outputFile}`);
}

main();
