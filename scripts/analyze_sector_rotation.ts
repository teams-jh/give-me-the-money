/**
 * analyze_sector_rotation.ts
 *
 * 분기별 섹터 강도를 랭킹하여 섹터 로테이션을 분석한다.
 *
 * 실행 예 (루트 디렉토리에서):
 *   server_node/node_modules/.bin/tsx scripts/analyze_sector_rotation.ts --market kr
 *   server_node/node_modules/.bin/tsx scripts/analyze_sector_rotation.ts --market us
 *   server_node/node_modules/.bin/tsx scripts/analyze_sector_rotation.ts --market kr --quarters 6
 */

import path from "path";
import { fileURLToPath } from "url";
import { calcSectorRotation, calcSectorStrengthRotation } from "../src/library/shared/sector.ts";
import type { StockInput, SectorRotationResult, SectorStrengthResult } from "../src/library/shared/sector.ts";
import { loadTickerList, loadTicker, saveJson } from "../src/library/shared/tickerRepository.ts";
import { toDailyPrices } from "../src/library/shared/tickerMapper.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_DIR     = path.resolve(__dirname, "../src/db");

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  sectorDir: string;
}

/** 출력(sector) 디렉토리만 스크립트가 관리. 티커 로드 경로는 Repository 가 일원화 (#64) */
const MARKET_CONFIG: Record<string, MarketConfig> = {
  kr: { sectorDir: path.join(DB_DIR, "kr/sector") },
  us: { sectorDir: path.join(DB_DIR, "us/sector") },
};

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

interface CliArgs {
  market:   string;
  quarters: number | null;   // 최근 N분기만 표시 (null = 전체)
}

export function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let market   = "kr";
  let quarters: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === "--market")   { market   = args[++i] ?? "kr"; }
    else if (a === "--quarters") {
      const v = parseInt(args[++i] ?? "", 10);
      if (!isNaN(v) && v > 0) quarters = v;
    }
  }
  return { market, quarters };
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

// ── 출력 헬퍼 ─────────────────────────────────────────────────────────────────

/** 숫자를 색상 코드로 감싸기 (양수=초록, 음수=빨강) */
export function colorReturn(v: number | null): string {
  if (v === null) return "  N/A  ";
  const str = (v >= 0 ? `+${v.toFixed(1)}` : `${v.toFixed(1)}`).padStart(7);
  if (v > 3)  return `\x1b[32m${str}%\x1b[0m`;   // 초록
  if (v > 0)  return `\x1b[36m${str}%\x1b[0m`;   // 청록
  if (v < -3) return `\x1b[31m${str}%\x1b[0m`;   // 빨강
  return `\x1b[33m${str}%\x1b[0m`;               // 노랑
}

/** 순위 변동 화살표 */
export function rankChangeMark(change: number | null): string {
  if (change === null) return "  ";
  if (change > 0)  return `\x1b[32m▲${change}\x1b[0m`;
  if (change < 0)  return `\x1b[31m▼${Math.abs(change)}\x1b[0m`;
  return "─ ";
}

// ── 유스케이스 ────────────────────────────────────────────────────────────────

/** runSectorRotationAnalysis() 반환 타입 */
export interface SectorRotationAnalysisResult {
  result:           SectorRotationResult;
  strengthResult:   SectorStrengthResult;
  quarters:         string[];
  rankings:         SectorRotationResult["rankings"];
  strengthRankings: SectorStrengthResult["rankings"];
}

/**
 * 핵심 분석 로직. console / 파일 I/O 에 의존하지 않아 단위 테스트 가능.
 */
export function runSectorRotationAnalysis(
  _market:   string,
  stocks:    StockInput[],
  quartersN: number | null,
): SectorRotationAnalysisResult {
  const result         = calcSectorRotation(stocks, 3, true);
  const strengthResult = calcSectorStrengthRotation(stocks, 3, true);

  let quarters         = result.quarters;
  let rankings         = result.rankings;
  let strengthRankings = strengthResult.rankings;

  if (quartersN !== null) {
    quarters         = quarters.slice(-quartersN);
    rankings         = rankings.filter(r => quarters.includes(r.quarter));
    strengthRankings = strengthRankings.filter(r => quarters.includes(r.quarter));
  }

  return { result, strengthResult, quarters, rankings, strengthRankings };
}

// ── 프레젠테이션 ──────────────────────────────────────────────────────────────

/**
 * 분석 결과를 콘솔에 출력한다.
 */
export function printSectorRotationReport(
  analysis: SectorRotationAnalysisResult,
  opts:     { market: string; stocks: StockInput[] },
): void {
  const { result, strengthResult, quarters, rankings, strengthRankings } = analysis;
  const { sectors, sectorSeries } = result;

  console.log("=".repeat(70));
  console.log(`  📊 섹터 로테이션 분석 [${opts.market.toUpperCase()}]`);
  console.log("=".repeat(70));
  console.log(`\n  ✅ ${opts.stocks.length}개 종목 로드 완료\n`);

  const headerCols = quarters.map(q => q.padStart(8)).join(" ");

  // 3-A. 분기별 랭킹 테이블
  console.log(`\n${"─".repeat(70)}`);
  console.log("  📋 분기별 섹터 랭킹 (수익률 기준 정렬)");
  console.log(`${"─".repeat(70)}\n`);
  for (const qRank of rankings) {
    const label = qRank.complete ? qRank.quarter : `${qRank.quarter}*`;
    console.log(`  【${label}】`);
    for (const row of qRank.rows) {
      const rankStr  = `${row.rank}위`.padStart(4);
      const sec      = row.sector.padEnd(28);
      const ret      = colorReturn(row.avgReturn);
      const change   = rankChangeMark(row.rankChange);
      const cnt      = `${row.stockCount}종목`.padStart(6);
      const posRatio = `(상승 ${Math.round(row.positiveRatio * 100)}%)`;
      console.log(`  ${rankStr}  ${sec} ${ret}  ${change}  ${cnt} ${posRatio}`);
    }
    console.log();
  }

  // 3-B. 섹터별 랭킹 추이
  console.log(`${"─".repeat(70)}`);
  console.log("  🔄 섹터별 분기 랭킹 추이 (순위 숫자)");
  console.log(`${"─".repeat(70)}\n`);
  console.log(`  ${"섹터".padEnd(28)} ${headerCols}`);
  console.log(`  ${"─".repeat(28)} ${"─".repeat(quarters.length * 9)}`);
  for (const sector of sectors) {
    const series = sectorSeries[sector];
    if (!series) continue;
    const rankCols = quarters.map((q) => {
      const qIdx = result.quarters.indexOf(q);
      const rank = series.ranks[qIdx] ?? null;
      if (rank === null) return "    -   ";
      const totalSectors = rankings.find(r => r.quarter === q)?.rows.length ?? 0;
      const rankStr = `${rank}위`.padStart(4);
      if (rank <= 2)                     return `\x1b[32m${rankStr}\x1b[0m    `;
      else if (rank >= totalSectors - 1) return `\x1b[31m${rankStr}\x1b[0m    `;
      else                               return rankStr.padStart(8);
    }).join(" ");
    console.log(`  ${sector.padEnd(28)} ${rankCols}`);
  }

  // 3-C. 섹터별 수익률 시계열
  console.log(`\n${"─".repeat(70)}`);
  console.log("  📈 섹터별 분기 수익률 (%)");
  console.log(`${"─".repeat(70)}\n`);
  console.log(`  ${"섹터".padEnd(28)} ${headerCols}`);
  console.log(`  ${"─".repeat(28)} ${"─".repeat(quarters.length * 9)}`);
  for (const sector of sectors) {
    const series = sectorSeries[sector];
    if (!series) continue;
    const retCols = quarters.map((q) => {
      const qIdx = result.quarters.indexOf(q);
      const ret  = series.returns[qIdx] ?? null;
      return colorReturn(ret).padStart(8);
    }).join(" ");
    console.log(`  ${sector.padEnd(28)} ${retCols}`);
  }

  // 3-D. 요약 인사이트
  if (quarters.length >= 2) {
    const lastQ    = quarters[quarters.length - 1]!;
    const prevQ    = quarters[quarters.length - 2]!;
    const lastRank = rankings.find(r => r.quarter === lastQ)?.rows ?? [];
    const bigRisers  = lastRank.filter(r => (r.rankChange ?? 0) >= 3);
    const bigFallers = lastRank.filter(r => (r.rankChange ?? 0) <= -3);
    if (bigRisers.length > 0 || bigFallers.length > 0) {
      console.log(`\n${"─".repeat(70)}`);
      console.log(`  💡 최근 로테이션 신호 (${prevQ} → ${lastQ})`);
      console.log(`${"─".repeat(70)}`);
      bigRisers.forEach(r =>
        console.log(`  \x1b[32m▲ 급상승\x1b[0m  ${r.sector.padEnd(28)}  ${r.rankChange! > 0 ? `+${r.rankChange}` : r.rankChange}단계 상승  (${colorReturn(r.avgReturn)})`)
      );
      bigFallers.forEach(r =>
        console.log(`  \x1b[31m▼ 급하락\x1b[0m  ${r.sector.padEnd(28)}  ${r.rankChange}단계 하락  (${colorReturn(r.avgReturn)})`)
      );
    }
  }

  // 3-E. 추세 강도 랭킹
  console.log(`${"─".repeat(70)}`);
  console.log("  📐 분기별 섹터 추세 강도 랭킹 (slope × R²)");
  console.log(`${"─".repeat(70)}\n`);
  const sHeaders = quarters.map(q => q.padStart(14)).join(" ");
  console.log(`  ${"섹터".padEnd(28)} ${sHeaders}`);
  console.log(`  ${"─".repeat(28)} ${"─".repeat(quarters.length * 15)}`);
  for (const sector of strengthResult.sectors) {
    const series = strengthResult.strengthSeries[sector];
    if (!series) continue;
    const rankCols = quarters.map(q => {
      const qIdx  = strengthResult.quarters.indexOf(q);
      const rank  = series.ranks[qIdx]  ?? null;
      const score = series.scores[qIdx] ?? null;
      if (rank === null) return "      -       ";
      const totalSectors = strengthRankings.find(r => r.quarter === q)?.rows.length ?? 0;
      const rankStr  = `${rank}위`;
      const scoreStr = score !== null ? (score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2)) : "";
      const plain    = `${rankStr}(${scoreStr})`.padStart(14);
      if (rank <= 2)                     return `\x1b[32m${rankStr}\x1b[0m(${scoreStr})`.padStart(14 + 9); // ANSI 보정
      else if (rank >= totalSectors - 1) return `\x1b[31m${rankStr}\x1b[0m(${scoreStr})`.padStart(14 + 9);
      else                               return plain;
    }).join(" ");
    console.log(`  ${sector.padEnd(28)} ${rankCols}`);
  }

  if (quarters.length >= 2) {
    const lastQ        = quarters[quarters.length - 1]!;
    const retTop3      = rankings.find(r => r.quarter === lastQ)?.rows.slice(0, 3).map(r => r.sector) ?? [];
    const strengthTop3 = strengthRankings.find(r => r.quarter === lastQ)?.rows.slice(0, 3).map(r => r.sector) ?? [];
    const onlyInRet    = retTop3.filter(s => !strengthTop3.includes(s));
    const onlyInStr    = strengthTop3.filter(s => !retTop3.includes(s));
    if (onlyInRet.length > 0 || onlyInStr.length > 0) {
      console.log(`\n${"─".repeat(70)}`);
      console.log(`  🔍 ${lastQ} 수익률 vs 추세강도 상위 3개 비교`);
      console.log(`${"─".repeat(70)}`);
      console.log(`  수익률 Top3:  ${retTop3.join("  >  ")}`);
      console.log(`  강도   Top3:  ${strengthTop3.join("  >  ")}`);
      if (onlyInRet.length) console.log(`  \x1b[33m⚠ 수익률↑ but 추세약함:\x1b[0m  ${onlyInRet.join(", ")} (단기 급등 주의)`);
      if (onlyInStr.length) console.log(`  \x1b[32m✓ 추세강함 but 수익률낮음:\x1b[0m ${onlyInStr.join(", ")} (지속 가능성 높음)`);
    }
  }
}

// ── 엔트리 ────────────────────────────────────────────────────────────────────

function main(): void {
  const args   = parseArgs();
  const config = MARKET_CONFIG[args.market];
  if (!config) {
    console.error(`❌ 알 수 없는 마켓: ${args.market}`);
    process.exit(1);
  }

  const stocks   = loadStocks(args.market);
  const analysis = runSectorRotationAnalysis(args.market, stocks, args.quarters);

  printSectorRotationReport(analysis, { market: args.market, stocks });

  const outputFile = path.join(config.sectorDir, "rotation.json");
  const output = {
    generated_at:     new Date().toISOString().slice(0, 16).replace("T", " "),
    market:           args.market,
    quarters:         analysis.result.quarters,
    sectors:          analysis.result.sectors,
    returnRankings:   analysis.result.rankings,
    returnSeries:     analysis.result.sectorSeries,
    strengthRankings: analysis.strengthResult.rankings,
    strengthSeries:   analysis.strengthResult.strengthSeries,
  };

  saveJson(outputFile, output);
  console.log(`\n📁 저장 완료: ${outputFile}`);
  console.log(`   분기 수: ${analysis.result.quarters.length}개  /  섹터 수: ${analysis.result.sectors.length}개\n`);
}

const _isEntrySector = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;
if (_isEntrySector) main();
