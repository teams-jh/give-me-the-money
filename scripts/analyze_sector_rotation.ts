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

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { calcSectorRotation, calcSectorStrengthRotation } from "../src/library/shared/sector.ts";
import type { StockInput, SectorRotationResult, SectorStrengthResult } from "../src/library/shared/sector.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_DIR     = path.resolve(__dirname, "../src/db");

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  tickersDir: string;
  sectorDir:  string;
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  kr: {
    tickersDir: path.join(DB_DIR, "kr_tickers"),
    sectorDir:  path.join(DB_DIR, "kr_sector"),
  },
  us: {
    tickersDir: path.join(DB_DIR, "us_tickers"),
    sectorDir:  path.join(DB_DIR, "us_sector"),
  },
};

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

interface CliArgs {
  market:   string;
  quarters: number | null;   // 최근 N분기만 표시 (null = 전체)
}

function parseArgs(): CliArgs {
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

function loadStocks(tickersDir: string): StockInput[] {
  const files = fs.readdirSync(tickersDir).filter(f => f.endsWith(".json"));
  const stocks: StockInput[] = [];

  for (const file of files) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(tickersDir, file), "utf-8")
    ) as {
      ticker: string;
      info:   { sector: string };
      prices: { date: string; close: number }[];
    };

    if (!raw.prices || raw.prices.length < 10) continue;

    stocks.push({
      ticker: raw.ticker,
      sector: raw.info.sector ?? "Unknown",
      prices: raw.prices.map(p => ({ date: p.date, close: p.close })),
    });
  }

  return stocks;
}

// ── 출력 헬퍼 ─────────────────────────────────────────────────────────────────

/** 숫자를 색상 코드로 감싸기 (양수=초록, 음수=빨강) */
function colorReturn(v: number | null): string {
  if (v === null) return "  N/A  ";
  const str = (v >= 0 ? `+${v.toFixed(1)}` : `${v.toFixed(1)}`).padStart(7);
  if (v > 3)  return `\x1b[32m${str}%\x1b[0m`;   // 초록
  if (v > 0)  return `\x1b[36m${str}%\x1b[0m`;   // 청록
  if (v < -3) return `\x1b[31m${str}%\x1b[0m`;   // 빨강
  return `\x1b[33m${str}%\x1b[0m`;               // 노랑
}

/** 순위 변동 화살표 */
function rankChangeMark(change: number | null): string {
  if (change === null) return "  ";
  if (change > 0)  return `\x1b[32m▲${change}\x1b[0m`;
  if (change < 0)  return `\x1b[31m▼${Math.abs(change)}\x1b[0m`;
  return "─ ";
}

// ── main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args   = parseArgs();
  const config = MARKET_CONFIG[args.market];
  if (!config) {
    console.error(`❌ 알 수 없는 마켓: ${args.market}`);
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log(`  📊 섹터 로테이션 분석 [${args.market.toUpperCase()}]`);
  console.log("=".repeat(70));

  // 1. 데이터 로드
  console.log("\n데이터 로드 중...");
  const stocks = loadStocks(config.tickersDir);
  console.log(`  ✅ ${stocks.length}개 종목 로드 완료`);

  // 2. 수익률 기반 섹터 로테이션 계산
  const result = calcSectorRotation(stocks, 3, true);

  // 3. 추세 강도 기반 섹터 랭킹 계산 (classifyTrend 재활용)
  console.log("추세 강도 계산 중 (classifyTrend 분기별 재계산)...");
  const strengthResult = calcSectorStrengthRotation(stocks, 3, true);
  console.log("  ✅ 강도 분석 완료\n");

  // 최근 N분기 필터
  let { quarters, rankings } = result;
  let strengthRankings = strengthResult.rankings;
  if (args.quarters !== null) {
    quarters = quarters.slice(-args.quarters);
    rankings = rankings.filter(r => quarters.includes(r.quarter));
    strengthRankings = strengthRankings.filter(r => quarters.includes(r.quarter));
  }

  const { sectors, sectorSeries } = result;

  // ── 3-A. 분기별 랭킹 테이블 ──────────────────────────────────────────────
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

  // ── 3-B. 섹터별 랭킹 추이 히트맵 ────────────────────────────────────────
  console.log(`${"─".repeat(70)}`);
  console.log("  🔄 섹터별 분기 랭킹 추이 (순위 숫자)");
  console.log(`${"─".repeat(70)}\n`);

  // 헤더
  const headerCols = quarters.map(q => q.padStart(8)).join(" ");
  console.log(`  ${"섹터".padEnd(28)} ${headerCols}`);
  console.log(`  ${"─".repeat(28)} ${"─".repeat(quarters.length * 9)}`);

  for (const sector of sectors) {
    const series = sectorSeries[sector];
    if (!series) continue;

    // 이 섹터의 ranks 중에서 quarters에 해당하는 것만 추출
    const rankCols = quarters.map((q, i) => {
      const qIdx = result.quarters.indexOf(q);
      const rank = series.ranks[qIdx] ?? null;
      if (rank === null) return "    -   ";
      // 랭킹 색상 (1-2위: 초록, 꼴찌권: 빨강)
      const totalSectors = rankings.find(r => r.quarter === q)?.rows.length ?? 0;
      let colored: string;
      if (rank <= 2)                          colored = `\x1b[32m${rank}위\x1b[0m`;
      else if (rank >= totalSectors - 1)      colored = `\x1b[31m${rank}위\x1b[0m`;
      else                                    colored = `${rank}위`;
      return colored.padStart(8);
    }).join(" ");

    const secLabel = sector.padEnd(28);
    console.log(`  ${secLabel} ${rankCols}`);
  }

  // ── 3-C. 섹터별 수익률 시계열 ────────────────────────────────────────────
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

    const secLabel = sector.padEnd(28);
    console.log(`  ${secLabel} ${retCols}`);
  }

  // ── 3-D. 요약 인사이트 ────────────────────────────────────────────────────
  if (quarters.length >= 2) {
    const lastQ     = quarters[quarters.length - 1]!;
    const prevQ     = quarters[quarters.length - 2]!;
    const lastRank  = rankings.find(r => r.quarter === lastQ)?.rows ?? [];
    const prevRank  = rankings.find(r => r.quarter === prevQ)?.rows ?? [];

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

  // ── 3-E. 추세 강도 랭킹 (slope × R²) ───────────────────────────────────────
  console.log(`${"─".repeat(70)}`);
  console.log("  📐 분기별 섹터 추세 강도 랭킹 (slope × R²)");
  console.log("     ※ 수익률 기준이 아닌 추세의 방향성 × 일관성 기준");
  console.log(`${"─".repeat(70)}\n`);

  // 강도 순위 추이표
  const sHeaders = strengthResult.quarters
    .filter(q => quarters.includes(q))
    .map(q => q.padStart(8)).join(" ");
  console.log(`  ${"섹터".padEnd(28)} ${sHeaders}`);
  console.log(`  ${"─".repeat(28)} ${"─".repeat(quarters.length * 9)}`);

  for (const sector of strengthResult.sectors) {
    const series = strengthResult.strengthSeries[sector];
    if (!series) continue;
    const rankCols = quarters.map(q => {
      const qIdx = strengthResult.quarters.indexOf(q);
      const rank = series.ranks[qIdx] ?? null;
      const score = series.scores[qIdx] ?? null;
      if (rank === null) return "    -   ";
      const totalSectors = strengthRankings.find(r => r.quarter === q)?.rows.length ?? 0;
      let colored: string;
      if (rank <= 2)                     colored = `[32m${rank}위[0m`;
      else if (rank >= totalSectors - 1) colored = `[31m${rank}위[0m`;
      else                               colored = `${rank}위`;
      const scoreStr = score !== null ? (score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2)) : "";
      return `${colored}(${scoreStr})`.padStart(14);
    }).join(" ");
    console.log(`  ${sector.padEnd(28)} ${rankCols}`);
  }

  // 수익률 vs 강도 비교 (최근 2분기)
  if (quarters.length >= 2) {
    const lastQ = quarters[quarters.length - 1]!;
    const retTop3    = rankings.find(r => r.quarter === lastQ)?.rows.slice(0, 3).map(r => r.sector) ?? [];
    const strengthTop3 = strengthRankings.find(r => r.quarter === lastQ)?.rows.slice(0, 3).map(r => r.sector) ?? [];
    const onlyInRet  = retTop3.filter(s => !strengthTop3.includes(s));
    const onlyInStr  = strengthTop3.filter(s => !retTop3.includes(s));

    if (onlyInRet.length > 0 || onlyInStr.length > 0) {
      console.log(`\n${"─".repeat(70)}`);
      console.log(`  🔍 ${lastQ} 수익률 vs 추세강도 상위 3개 비교`);
      console.log(`${"─".repeat(70)}`);
      console.log(`  수익률 Top3:  ${retTop3.join("  >  ")}`);
      console.log(`  강도   Top3:  ${strengthTop3.join("  >  ")}`);
      if (onlyInRet.length)  console.log(`  \x1b[33m⚠ 수익률↑ but 추세약함:\x1b[0m  ${onlyInRet.join(", ")} (단기 급등 주의)`);
      if (onlyInStr.length)  console.log(`  \x1b[32m✓ 추세강함 but 수익률낮음:\x1b[0m ${onlyInStr.join(", ")} (지속 가능성 높음)`);
    }
  }

  // ── 4. JSON 저장 ──────────────────────────────────────────────────────────
  fs.mkdirSync(config.sectorDir, { recursive: true });
  const outputFile = path.join(config.sectorDir, "rotation.json");

  const output = {
    generated_at:    new Date().toISOString().slice(0, 16).replace("T", " "),
    market:          args.market,
    quarters:        result.quarters,
    sectors:         result.sectors,
    // 수익률 기반
    returnRankings:  result.rankings,
    returnSeries:    result.sectorSeries,
    // 추세 강도 기반 (slope × R²)
    strengthRankings: strengthResult.rankings,
    strengthSeries:   strengthResult.strengthSeries,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n📁 저장 완료: ${outputFile}`);
  console.log(`   분기 수: ${result.quarters.length}개  /  섹터 수: ${result.sectors.length}개\n`);
}

main();
