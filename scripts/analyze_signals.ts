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

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { analyzeSignals }        from "../src/library/shared/signals.ts";
import { analyzeFundamentals }   from "../src/library/shared/fundamentals.ts";
import type { SignalSummary }     from "../src/library/shared/signals.ts";
import type { FundamentalData, FundamentalSummary, QuarterlyEarning } from "../src/library/shared/fundamentals.ts";
import type { OHLCV }             from "../src/library/shared/indicators.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_DIR     = path.resolve(__dirname, "../src/db");

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

interface CliArgs { market: string; n?: number; minScore: number; }

interface RawPrice { date: string; open: number; high: number; low: number; close: number; adj_close: number; volume: number; }

interface RawTicker {
  ticker: string;
  info:   { name: string; kr_name?: string; sector: string; };
  market: { price: number; fifty_two_week_high: number; fifty_two_week_low: number; beta: number | null; };
  liquidity: { avg_daily_volume_3m: number; avg_daily_volume_10d: number; };
  valuation:    { trailing_pe: number | null; price_to_book: number | null; };
  profitability: { roe: number | null; operating_margins: number | null; revenue_growth: number | null; quarterly_earnings: { quarter: string; net_income: number }[]; };
  ownership:    { held_pct_insiders: number | null; held_pct_institutions: number | null; short_ratio: number | null; };
  prices: RawPrice[];
}

export interface CombinedSignalResult {
  ticker: string; name: string; sector: string;
  totalScore: number; techScore: number; fundScore: number;
  rsi: number | null; macd: number | null; bandWidth: number | null;
  volRatio: number | null; atr: number | null; stopLoss: number | null;
  mdd: number; high52w: number | null; low52w: number | null;
  stochK: number | null; roc20: number | null; mfi: number | null;
  adx: number | null; supertrendDir: "bullish" | "bearish" | null;
  pe: number | null; pb: number | null; roe: number | null;
  insiderPct: number | null; shortRatio: number | null; earningsTrend: string;
  alerts: SignalSummary["alerts"];
}

interface SignalsJson {
  generated_at: string; market: string; analyzed_count: number; skipped_count: number; alerted_count: number;
  summary: { bullish_count: number; bearish_count: number; neutral_count: number; avg_tech_score: number; avg_fund_score: number; };
  stocks: CombinedSignalResult[];
}

function parseArgs(): CliArgs {
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

function loadTickers(config: MarketConfig, n?: number): string[] {
  const raw  = fs.readFileSync(config.tickersJson, "utf-8");
  const data = JSON.parse(raw) as { tickers: string[] };
  return n !== undefined ? data.tickers.slice(0, n) : data.tickers;
}

function tickerToFilename(ticker: string): string { return ticker.split(".")[0] ?? ticker; }

function loadTicker(ticker: string, config: MarketConfig): RawTicker | null {
  const file = path.join(config.tickersDir, `${tickerToFilename(ticker)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as RawTicker;
}

function toOHLCV(raw: RawTicker): OHLCV[] {
  return raw.prices.map(p => ({ date: p.date, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume }));
}

function toFundamentalData(raw: RawTicker): FundamentalData {
  return {
    pe: raw.valuation.trailing_pe, pb: raw.valuation.price_to_book,
    roe: raw.profitability.roe, operatingMargin: raw.profitability.operating_margins,
    revenueGrowth: raw.profitability.revenue_growth,
    quarterlyEarnings: (raw.profitability.quarterly_earnings ?? []) as QuarterlyEarning[],
    insiderPct: raw.ownership.held_pct_insiders,
    institutionPct: raw.ownership.held_pct_institutions,
    shortRatio: raw.ownership.short_ratio,
  };
}

function resolveOutputFile(config: MarketConfig, n?: number): string {
  return path.join(config.signalsDir, `signals_${n !== undefined ? String(n) : "all"}.json`);
}

function nowStr(): string { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function round1(v: number): number { return Math.round(v * 10) / 10; }

function main(): void {
  const args   = parseArgs();
  const config = MARKET_CONFIG[args.market];
  if (!config) { console.error(`❌ 알 수 없는 마켓: ${args.market}`); process.exit(1); }

  console.log("=".repeat(65));
  console.log(`  기술적 + 펀더멘털 이상징후 통합 분석 [${args.market.toUpperCase()}]`);
  if (args.n)        console.log(`  대상: 상위 ${args.n}개`);
  if (args.minScore) console.log(`  최소 |score| 필터: ${args.minScore}`);
  console.log("=".repeat(65));

  const tickers = loadTickers(config, args.n);
  console.log(`\n📋 분석 대상: ${tickers.length}개 티커\n`);

  const results: CombinedSignalResult[] = [];
  const skipped: string[]               = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    const prefix = `[${String(i + 1).padStart(4)}/${tickers.length}] ${ticker.padEnd(12)}`;

    const raw = loadTicker(ticker, config);
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

  const outputFile = resolveOutputFile(config, args.n);
  const output: SignalsJson = {
    generated_at: nowStr(), market: args.market,
    analyzed_count: results.length, skipped_count: skipped.length, alerted_count: alertedCount,
    summary: { bullish_count: bullishCount, bearish_count: bearishCount, neutral_count: neutralCount, avg_tech_score: avgTech, avg_fund_score: avgFund },
    stocks: sorted,
  };

  fs.mkdirSync(config.signalsDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n📁 저장 완료: ${outputFile}`);
}

main();
