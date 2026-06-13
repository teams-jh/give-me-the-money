/**
 * analyze_signals.ts
 *
 * 전체 종목의 기술적 + 펀더멘털 이상징후를 통합 분석하여
 * src/db/{market}_signals/ 에 저장한다.
 *
 * 흐름:
 *   1. src/db/metadata/all_{market}_tickers.json  →  티커 목록
 *   2. src/db/{market}_tickers/{TICKER}.json      →  전체 ticker 데이터 로드
 *   3. analyzeSignals(OHLCV)                      →  기술적 신호
 *   4. analyzeFundamentals(FundamentalData)        →  펀더멘털 신호
 *   5. 두 결과 통합 → totalScore / techScore / fundScore
 *   6. src/db/{market}_signals/signals_{n}.json   →  저장
 *
 * 실행 예 (루트 디렉토리에서):
 *   server_node/node_modules/.bin/tsx scripts/analyze_signals.ts --market kr
 *   server_node/node_modules/.bin/tsx scripts/analyze_signals.ts --market us -n 100
 *   server_node/node_modules/.bin/tsx scripts/analyze_signals.ts --market kr --min-score 2
 */

import path from "path";
import { fileURLToPath } from "url";

import { analyzeSignals }        from "../src/library/shared/signals.ts";
import { analyzeFundamentals }   from "../src/library/shared/fundamentals.ts";
import type { SignalSummary }     from "../src/library/shared/signals.ts";
import { loadTickerList, loadTicker, saveJson } from "../src/library/shared/tickerRepository.ts";
import { toOHLCV, toFundamentalData }           from "../src/library/shared/tickerMapper.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_DIR     = path.resolve(__dirname, "../src/db");

/** 출력(signals) 디렉토리만 스크립트가 관리. 티커 로드 경로는 Repository 가 일원화 (#64) */
const SIGNALS_DIR: Record<string, string> = {
  us: path.join(DB_DIR, "us/signals"),
  kr: path.join(DB_DIR, "kr/signals"),
};

interface CliArgs { market: string; n?: number; minScore: number; }

export interface CombinedSignalResult {
  ticker: string; name: string; sector: string;
  totalScore: number; techScore: number; fundScore: number;
  rsi: number | null; macd: number | null; bandWidth: number | null;
  volRatio: number | null; atr: number | null; stopLoss: number | null;
  mdd: number; high52w: number | null; low52w: number | null;
  stochK: number | null; roc20: number | null; mfi: number | null;
  adx: number | null; supertrendDir: "bullish" | "bearish" | null;
  pe: number | null; pb: number | null; roe: number | null;
  roa: number | null; dividendYield: number | null;
  insiderPct: number | null; shortRatio: number | null; earningsTrend: string;
  alerts: SignalSummary["alerts"];
}

interface SignalsJson {
  generated_at: string; market: string; analyzed_count: number; skipped_count: number; alerted_count: number;
  summary: { bullish_count: number; bearish_count: number; neutral_count: number; avg_tech_score: number; avg_fund_score: number; };
  stocks: CombinedSignalResult[];
}

export function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let market = "kr"; let n: number | undefined; let minScore = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--market")     { market   = args[++i] ?? "kr"; }
    else if (arg === "-n")      { const v = parseInt(args[++i] ?? "", 10); if (!isNaN(v)) n = v; }
    else if (arg === "--min-score") { const v = parseFloat(args[++i] ?? "0"); if (!isNaN(v)) minScore = v; }
  }
  return { market, n, minScore };
}

export function resolveOutputFile(market: string, n?: number): string {
  return path.join(SIGNALS_DIR[market]!, `signals_${n !== undefined ? String(n) : "all"}.json`);
}

export function nowStr(): string { return new Date().toISOString().slice(0, 16).replace("T", " "); }
export function round1(v: number): number { return Math.round(v * 10) / 10; }

function main(): void {
  const args   = parseArgs();
  if (!SIGNALS_DIR[args.market]) { console.error(`❌ 알 수 없는 마켓: ${args.market}`); process.exit(1); }

  console.log("=".repeat(65));
  console.log(`  기술적 + 펀더멘털 이상징후 통합 분석 [${args.market.toUpperCase()}]`);
  if (args.n)        console.log(`  대상: 상위 ${args.n}개`);
  if (args.minScore) console.log(`  최소 |score| 필터: ${args.minScore}`);
  console.log("=".repeat(65));

  const tickers = loadTickerList(args.market, undefined, args.n);
  console.log(`\n📋 분석 대상: ${tickers.length}개 티커\n`);

  const results: CombinedSignalResult[] = [];
  const skipped: string[]               = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    const prefix = `[${String(i + 1).padStart(4)}/${tickers.length}] ${ticker.padEnd(12)}`;

    const raw = loadTicker(args.market, ticker);
    if (!raw || raw.prices.length < 30) { console.log(`${prefix} → SKIP`); skipped.push(ticker); continue; }

    const ohlcv    = toOHLCV(raw);
    const techSum  = analyzeSignals(ticker, ohlcv);
    const fundData = toFundamentalData(raw);
    const fundSum  = analyzeFundamentals(ticker, fundData);
    const totalScore = round1(techSum.score + fundSum.score);

    const allAlerts = [...techSum.alerts, ...fundSum.alerts];
    if (Math.abs(totalScore) < args.minScore && allAlerts.length === 0) continue;

    if (allAlerts.length > 0) {
      const scoreStr = totalScore > 0 ? `+${totalScore}` : String(totalScore);
      const techStr  = techSum.score > 0 ? `+${techSum.score}` : String(techSum.score);
      const fundStr  = fundSum.score > 0 ? `+${fundSum.score}` : String(fundSum.score);
      const labels   = allAlerts.filter(a => a.scoreAffecting).map(a => `[${a.direction[0]?.toUpperCase()}] ${a.label}`).join(" | ");
      console.log(`${prefix} total:${scoreStr.padStart(5)} (T:${techStr} F:${fundStr})  RSI:${String(techSum.rsi?.toFixed(1) ?? "N/A").padStart(5)}  ${labels || "(정보성만)"}`);
    }

    results.push({
      ticker, name: raw.info.kr_name ?? raw.info.name, sector: raw.info.sector,
      totalScore, techScore: techSum.score, fundScore: fundSum.score,
      rsi: techSum.rsi, macd: techSum.macd, bandWidth: techSum.bandWidth,
      volRatio: techSum.volRatio, atr: techSum.atr, stopLoss: techSum.stopLoss,
      mdd: techSum.mdd, high52w: techSum.high52w, low52w: techSum.low52w,
      stochK: techSum.stochK, roc20: techSum.roc20, mfi: techSum.mfi,
      adx: techSum.adx, supertrendDir: techSum.supertrendDir,
      pe: fundSum.pe, pb: fundSum.pb, roe: fundSum.roe,
      roa: fundSum.roa, dividendYield: fundSum.dividendYield,
      insiderPct: fundSum.insiderPct, shortRatio: fundSum.shortRatio,
      earningsTrend: fundSum.earningsTrend,
      alerts: allAlerts,
    });
  }

  const bullishCount = results.filter(r => r.totalScore > 0).length;
  const bearishCount = results.filter(r => r.totalScore < 0).length;
  const neutralCount = results.filter(r => r.totalScore === 0 && r.alerts.length > 0).length;
  const alertedCount = results.filter(r => r.alerts.length > 0).length;
  const avgTech = results.length ? round1(results.reduce((s, r) => s + r.techScore, 0) / results.length) : 0;
  const avgFund = results.length ? round1(results.reduce((s, r) => s + r.fundScore, 0) / results.length) : 0;

  const sorted     = [...results].sort((a, b) => b.totalScore - a.totalScore);
  const topBullish = sorted.filter(r => r.totalScore > 0).slice(0, 5);
  const topBearish = sorted.filter(r => r.totalScore < 0).reverse().slice(0, 5);

  console.log("\n" + "=".repeat(65));
  console.log(`✅ 완료: ${results.length}개  ❌ 스킵: ${skipped.length}개`);
  console.log(`  🟢 매수: ${bullishCount}개  🔴 매도: ${bearishCount}개  ⚪ 중립: ${neutralCount}개  📣 신호: ${alertedCount}개`);
  console.log(`  기술 avg score: ${avgTech}  /  펀더 avg score: ${avgFund}`);

  if (topBullish.length) {
    console.log("\n  🟢 매수 신호 상위 5개:");
    topBullish.forEach(r => console.log(`    ${r.ticker.padEnd(12)} total:+${r.totalScore} (T:${r.techScore > 0 ? `+${r.techScore}` : r.techScore} F:${r.fundScore > 0 ? `+${r.fundScore}` : r.fundScore})  RSI:${r.rsi?.toFixed(1) ?? "N/A"}  earn:${r.earningsTrend}`));
  }
  if (topBearish.length) {
    console.log("\n  🔴 매도 신호 상위 5개:");
    topBearish.forEach(r => console.log(`    ${r.ticker.padEnd(12)} total:${r.totalScore} (T:${r.techScore} F:${r.fundScore})  RSI:${r.rsi?.toFixed(1) ?? "N/A"}  earn:${r.earningsTrend}`));
  }

  const outputFile = resolveOutputFile(args.market, args.n);
  const output: SignalsJson = {
    generated_at: nowStr(), market: args.market,
    analyzed_count: results.length, skipped_count: skipped.length, alerted_count: alertedCount,
    summary: { bullish_count: bullishCount, bearish_count: bearishCount, neutral_count: neutralCount, avg_tech_score: avgTech, avg_fund_score: avgFund },
    stocks: sorted,
  };

  saveJson(outputFile, output);
  console.log(`\n📁 저장 완료: ${outputFile}`);
}

const _isEntrySignals = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;
if (_isEntrySignals) main();