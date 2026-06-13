/**
 * analyze_market_breadth.ts
 *
 * 시장 전체 bullish 비율 시계열을 계산하여 저장한다.
 *
 * 실행 예 (루트 디렉토리에서):
 *   server_node/node_modules/.bin/tsx scripts/analyze_market_breadth.ts --market kr
 *   server_node/node_modules/.bin/tsx scripts/analyze_market_breadth.ts --market us --period 1y
 *   server_node/node_modules/.bin/tsx scripts/analyze_market_breadth.ts --market kr --step 10
 */

import path from "path";
import { fileURLToPath } from "url";

import { calcMarketBreadth, buildSnapshotDates, getMarketCondition } from "../src/library/shared/breadth.ts";
import type { MarketBreadthResult } from "../src/library/shared/breadth.ts";
import type { StockInput } from "../src/library/shared/sector.ts";
import { loadTickerList, loadTicker, saveJson } from "../src/library/shared/tickerRepository.ts";
import { toDailyPrices } from "../src/library/shared/tickerMapper.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_DIR     = path.resolve(__dirname, "../src/db");

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  breadthDir: string;
}

/** 출력(breadth) 디렉토리만 스크립트가 관리. 티커 로드 경로는 Repository 가 일원화 (#64) */
const MARKET_CONFIG: Record<string, MarketConfig> = {
  kr: { breadthDir: path.join(DB_DIR, "kr/breadth") },
  us: { breadthDir: path.join(DB_DIR, "us/breadth") },
};

// lookback 거래일 수
const LOOKBACK: Record<string, number> = {
  "3m": 63,
  "6m": 126,
  "1y": 252,
};

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

interface CliArgs {
  market: string;
  period: string;   // "3m" | "6m" | "1y"
  step:   number;   // 스냅샷 간격 (거래일)
}

export function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let market = "kr", period = "3m", step = 5;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === "--market") { market = args[++i] ?? "kr"; }
    else if (a === "--period") { period = args[++i] ?? "3m"; }
    else if (a === "--step")   { const v = parseInt(args[++i] ?? "5", 10); if (!isNaN(v) && v > 0) step = v; }
  }

  if (!MARKET_CONFIG[market] || !LOOKBACK[period]) {
    console.error(`\n❌ 사용법:\n  --market kr|us  --period 3m|6m|1y  [--step N]\n`);
    process.exit(1);
  }
  return { market, period, step };
}

// ── 데이터 로드 ───────────────────────────────────────────────────────────────

export function loadStocks(market: string): StockInput[] {
  const tickers = loadTickerList(market);
  const stocks: StockInput[] = [];

  for (const ticker of tickers) {
    const raw = loadTicker(market, ticker);
    if (!raw || !raw.prices || raw.prices.length < 10) continue;
    stocks.push({
      ticker: raw.ticker,
      sector: raw.info?.sector ?? "Unknown",
      prices: toDailyPrices(raw),
    });
  }
  return stocks;
}

// ── 콘솔 출력 헬퍼 ───────────────────────────────────────────────────────────

export function colorNet(n: number): string {
  const s = (n >= 0 ? `+${n.toFixed(1)}` : `${n.toFixed(1)}`).padStart(7);
  if (n >  20) return `\x1b[32m${s}\x1b[0m`;
  if (n >   0) return `\x1b[36m${s}\x1b[0m`;
  if (n < -20) return `\x1b[31m${s}\x1b[0m`;
  return `\x1b[33m${s}\x1b[0m`;
}

export function sparkBar(pct: number, width = 10): string {
  const filled = Math.round(pct / 100 * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// netBreadth 를 ASCII 바 차트로 표시 (중앙 0 기준)
export function netBar(net: number, halfWidth = 15): string {
  const pos    = net >= 0;
  const filled = Math.round(Math.min(Math.abs(net), 50) / 50 * halfWidth);
  if (pos) return " ".repeat(halfWidth) + "│" + "\x1b[32m█\x1b[0m".repeat(filled) + " ".repeat(halfWidth - filled);
  return " ".repeat(halfWidth - filled) + "\x1b[31m█\x1b[0m".repeat(filled) + "│" + " ".repeat(halfWidth);
}

// ── main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args   = parseArgs();
  const config = MARKET_CONFIG[args.market]!;
  const lookback = LOOKBACK[args.period]!;

  console.log("=".repeat(70));
  console.log(`  📊 시장 breadth 분석 [${args.market.toUpperCase()}]  기간: ${args.period}  스냅샷 간격: ${args.step}거래일`);
  console.log("=".repeat(70));

  // 1. 데이터 로드
  console.log("\n데이터 로드 중...");
  const stocks = loadStocks(args.market);
  console.log(`  ✅ ${stocks.length}개 종목 로드`);

  // 2. 전체 거래일 목록 추출 (가장 긴 종목 기준)
  const allDatesSet = new Set<string>();
  for (const s of stocks) s.prices.forEach(p => allDatesSet.add(p.date));
  const allDates = Array.from(allDatesSet).sort();
  console.log(`  📅 거래일: ${allDates[0]} ~ ${allDates[allDates.length - 1]}  (${allDates.length}일)`);

  // 3. 스냅샷 날짜 생성 (lookback 이후부터 step 간격)
  const snapDates = buildSnapshotDates(allDates, args.step, lookback);
  console.log(`  🎯 스냅샷: ${snapDates.length}개  (${snapDates[0]} ~ ${snapDates[snapDates.length - 1]})`);

  // 4. 시장 breadth 계산
  console.log("\n계산 중...");
  const t0     = Date.now();
  const result = calcMarketBreadth(stocks, snapDates, lookback);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✅ 완료 (${elapsed}초)  스냅샷 ${result.snapshots.length}개\n`);

  const snaps = result.snapshots;
  if (snaps.length === 0) { console.error("❌ 스냅샷 없음"); process.exit(1); }

  // ── 5-A. 현재 (최신) 상태 ──────────────────────────────────────────────────
  const latest = snaps[snaps.length - 1]!;
  const cond   = getMarketCondition(latest.netBreadth);

  console.log("─".repeat(70));
  console.log(`  현재 시장 상태  [${latest.date}]`);
  console.log("─".repeat(70));
  console.log(`  강세(bullish)   ${sparkBar(latest.bullish)}  ${latest.bullish.toFixed(1)}%`);
  console.log(`  약세(bearish)   ${sparkBar(latest.bearish)}  ${latest.bearish.toFixed(1)}%`);
  console.log(`  횡보(sideways)  ${sparkBar(latest.sideways)}  ${latest.sideways.toFixed(1)}%`);
  console.log(`  반등(recovering)${sparkBar(latest.recovering)}  ${latest.recovering.toFixed(1)}%`);
  console.log(`\n  netBreadth:  ${colorNet(latest.netBreadth)}  →  ${cond}`);
  console.log(`  집계 종목:   ${latest.total}개\n`);

  // ── 5-B. 최근 16주 추이 ───────────────────────────────────────────────────
  const recent = snaps.slice(-16);
  console.log("─".repeat(70));
  console.log("  최근 추이 (netBreadth 바 차트)");
  console.log(`  ${"날짜".padEnd(12)} ${"bull%".padStart(6)} ${"bear%".padStart(6)} ${"net".padStart(6)}  ${"◄약세".padStart(16)}│${"강세►".padEnd(16)}  상태`);
  console.log("─".repeat(70));

  for (const s of recent) {
    const condLabel = getMarketCondition(s.netBreadth);
    console.log(
      `  ${s.date}  ${s.bullish.toFixed(1).padStart(5)}%  ${s.bearish.toFixed(1).padStart(5)}%` +
      `  ${colorNet(s.netBreadth)}  ${netBar(s.netBreadth)}  ${condLabel}`
    );
  }

  // ── 5-C. 극단값 및 전환점 ─────────────────────────────────────────────────
  const maxSnap = snaps.reduce((a, b) => b.netBreadth > a.netBreadth ? b : a);
  const minSnap = snaps.reduce((a, b) => b.netBreadth < a.netBreadth ? b : a);

  // 전환점: netBreadth 부호가 바뀌는 지점
  const turningPoints: { date: string; from: number; to: number }[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1]!;
    const curr = snaps[i]!;
    if ((prev.netBreadth >= 0) !== (curr.netBreadth >= 0)) {
      turningPoints.push({ date: curr.date, from: prev.netBreadth, to: curr.netBreadth });
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log("  📌 주요 기록");
  console.log(`  최고 netBreadth: ${colorNet(maxSnap.netBreadth)}  (${maxSnap.date})  → ${getMarketCondition(maxSnap.netBreadth)}`);
  console.log(`  최저 netBreadth: ${colorNet(minSnap.netBreadth)}  (${minSnap.date})  → ${getMarketCondition(minSnap.netBreadth)}`);

  if (turningPoints.length > 0) {
    console.log(`\n  강세↔약세 전환점 (${turningPoints.length}회):`);
    for (const tp of turningPoints.slice(-5)) {  // 최근 5개만
      const dir = tp.to > 0 ? "\x1b[32m약세→강세\x1b[0m" : "\x1b[31m강세→약세\x1b[0m";
      console.log(`    ${tp.date}  ${dir}  (${colorNet(tp.from)} → ${colorNet(tp.to)})`);
    }
  }

  // ── 6. JSON 저장 ──────────────────────────────────────────────────────────
  const outFile = path.join(config.breadthDir, `breadth_${args.period}.json`);

  const output = {
    generated_at: new Date().toISOString().slice(0, 16).replace("T", " "),
    market:       args.market,
    period:       args.period,
    lookback,
    step:         args.step,
    total_stocks: stocks.length,
    snapshots:    result.snapshots,
  };

  saveJson(outFile, output);
  console.log(`\n📁 저장 완료: ${outFile}  (${result.snapshots.length}개 스냅샷)\n`);
}

const _isEntryBreadth = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;
if (_isEntryBreadth) main();
