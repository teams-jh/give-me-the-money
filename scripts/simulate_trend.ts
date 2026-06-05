/**
 * simulate_trend.ts
 *
 * 전체 종목의 추세선 시뮬레이션을 실행하여 결과를 JSON으로 저장한다.
 * 추세 지표 페이지(trend-indicators-view)와 동일한 알고리즘(trendSim.ts)을 사용한다.
 *
 * 흐름:
 *   1. scripts/simulate_trend.config.json 읽기
 *   2. 마켓 루프 (us, kr 순차 실행)
 *   3. 기간 루프 → 티커 루프 → runTickerSim()
 *   4. 패턴 필터 → AND 교집합 (intersectSimResults)
 *   5. src/db/{market}/trend_sim/sim_{market}_{periods}_{datetime}.json 저장
 *   6. python3 scripts/simulate_trend_chart.py {json경로} 호출
 *
 * 실행 예 (루트 디렉토리에서):
 *   npx tsx scripts/simulate_trend.ts
 *   npx tsx scripts/simulate_trend.ts --market us
 *   npx tsx scripts/simulate_trend.ts --market kr
 */

import fs            from "fs";
import path          from "path";
import { spawnSync }  from "child_process";
import { fileURLToPath } from "url";

import {
  PERIOD_BARS,
  runTickerSim,
  sortSimResults,
  applyPatternFilter,
  convertToWeeklyBars,
} from "../src/library/shared/trendSim.ts";
import type { SimResult, PeriodConfig, PeriodKey } from "../src/library/shared/trendSim.ts";
import { intersectSimResults } from "../src/library/shared/signals.ts";
import type { TrendSimFinalResult } from "../src/library/shared/signals.ts";

// ── 경로 설정 ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, "..");
const DB_DIR     = path.join(ROOT_DIR, "src/db");

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  tickersJson: string;
  tickersDir:  string;
  simDir:      string;
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: {
    tickersJson: path.join(DB_DIR, "metadata", "all_us_tickers.json"),
    tickersDir:  path.join(DB_DIR, "us/tickers"),
    simDir:      path.join(DB_DIR, "us/trend_sim"),
  },
  kr: {
    tickersJson: path.join(DB_DIR, "metadata", "all_kr_tickers.json"),
    tickersDir:  path.join(DB_DIR, "kr/tickers"),
    simDir:      path.join(DB_DIR, "kr/trend_sim"),
  },
};

interface PatternFilterConfig {
  enabled:   boolean;
  minTouches: number;
}

interface MarketSimConfig {
  market:        string;
  n:             number | null;
  periods:       PeriodKey[];
  periodConfigs: Partial<Record<PeriodKey, PeriodConfig>>;
  patternFilter: PatternFilterConfig;
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

interface SimOutput {
  generated_at: string;
  market:       string;
  config:       MarketSimConfig;
  result_count: number;
  results:      TrendSimFinalResult<SimResult>[];
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

export function now(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function datetimeTag(): string {
  return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "").slice(0, 15).replace(/(\d{8})(\d{6})/, "$1_$2");
}

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

export function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

export function parseArgs(): { market: string | null } {
  const args = process.argv.slice(2);
  let market: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--market") market = args[++i] ?? null;
  }
  return { market };
}

// ── config 로드 ───────────────────────────────────────────────────────────────

export function loadConfig(market: string | null): MarketSimConfig[] {
  const configPath = path.join(__dirname, "simulate_trend.config.json");
  if (!fs.existsSync(configPath)) {
    console.error(`❌ config 파일이 없습니다: ${configPath}`);
    process.exit(1);
  }
  const all: MarketSimConfig[] = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return market ? all.filter(c => c.market === market) : all;
}

// ── 날짜 자동 계산 ────────────────────────────────────────────────────────────

/**
 * filterStartDate/filterEndDate가 빈 문자열이면
 * prices의 마지막 날짜 기준으로 자동 채운다.
 *   filterEndDate   == "" → prices 마지막 날짜
 *   filterStartDate == "" → prices 마지막 날짜 -3 거래일
 */
export function resolveDates(cfg: PeriodConfig, dates: string[]): PeriodConfig {
  if (dates.length === 0) return cfg;
  const lastDate  = dates[dates.length - 1]!;
  const minus3    = dates[Math.max(0, dates.length - 1 - 3)]!;

  return {
    ...cfg,
    trendStartDate:  cfg.trendStartDate  || dates[0]!,
    trendEndDate:    cfg.trendEndDate    || lastDate,
    filterEndDate:   cfg.filterEndDate   || lastDate,
    filterStartDate: cfg.filterStartDate || minus3,
  };
}

// ── 마켓 1개 시뮬레이션 ───────────────────────────────────────────────────────

function runMarketSim(cfg: MarketSimConfig): void {
  const marketConfig = MARKET_CONFIG[cfg.market];
  if (!marketConfig) {
    console.error(`❌ 알 수 없는 마켓: ${cfg.market}`);
    return;
  }

  console.log("=".repeat(60));
  console.log(`  추세 시뮬레이션 [${cfg.market.toUpperCase()}]`);
  console.log(`  기간: ${cfg.periods.join(" + ")}  |  AND 교집합`);
  if (cfg.n) console.log(`  대상: 상위 ${cfg.n}개`);
  console.log("=".repeat(60));

  // 1. 티커 목록
  const allTickers: string[] = JSON.parse(
    fs.readFileSync(marketConfig.tickersJson, "utf-8")
  ).tickers;
  const tickers = cfg.n != null ? allTickers.slice(0, cfg.n) : allTickers;
  log(`📋 분석 대상: ${tickers.length}개 티커`);

  // 2. 기간 루프
  const resultsByPeriod: Partial<Record<PeriodKey, SimResult[]>> = {};

  for (const period of cfg.periods) {
    const periodCfg = cfg.periodConfigs[period];
    if (!periodCfg) {
      console.warn(`⚠️  periodConfigs["${period}"] 없음, 건너뜀`);
      continue;
    }

    const days    = PERIOD_BARS[periodCfg.barUnit ?? "daily"][period];
    const results: SimResult[] = [];
    let   skipped = 0;

    log(`\n📅 기간: ${period} (${days}봉)`);

    // 3. 티커 루프
    for (let i = 0; i < tickers.length; i++) {
      const ticker  = tickers[i]!;
      const file    = path.join(marketConfig.tickersDir, `${tickerToFilename(ticker)}.json`);
      const prefix  = `[${String(i + 1).padStart(4)}/${tickers.length}] ${ticker.padEnd(12)}`;

      if (!fs.existsSync(file)) {
        console.log(`${prefix} → SKIP (파일 없음)`);
        skipped++;
        continue;
      }

      const raw      = JSON.parse(fs.readFileSync(file, "utf-8"));
      const info     = raw.info || {};
      const name     = cfg.market === "kr"
        ? info.kr_name || info.name || ""
        : info.name || "";

      const rawPrices: RawPrice[] = raw.prices ?? [];
      if (rawPrices.length === 0) {
        console.log(`${prefix} → SKIP (prices 없음)`);
        skipped++;
        continue;
      }

      // barUnit 변환 + 슬라이싱
      const allPrices = rawPrices.map(p => ({
        date:  p.date,
        open:  p.open,
        high:  p.high,
        low:   p.low,
        close: p.close,
      }));
      const bars  = periodCfg.barUnit === "weekly"
        ? convertToWeeklyBars(allPrices as any[]) as typeof allPrices
        : allPrices;
      const slice = bars.slice(-days);

      // 날짜 자동 채우기
      const dates     = slice.map(p => p.date);
      const resolvedCfg = resolveDates(periodCfg, dates);

      // 시뮬레이션
      const simResult = runTickerSim(ticker, name, slice, resolvedCfg);
      if (simResult) {
        results.push(simResult);
        console.log(
          `${prefix} → 터치:${String(simResult.touchCount).padStart(2)} 돌파:${String(simResult.breakoutCount).padStart(2)} 기울기:${simResult.slopeType}`
        );
      } else {
        skipped++;
      }
    }

    sortSimResults(results);
    resultsByPeriod[period] = results;
    log(`✅ ${period} 완료: ${results.length}개  ❌ 스킵: ${skipped}개`);
  }

  // 4. 패턴 필터 (기간별 독립 적용)
  if (cfg.patternFilter.enabled) {
    log(`\n🔍 패턴 필터 적용 (최소 터치: ${cfg.patternFilter.minTouches}회)`);
    for (const period of cfg.periods) {
      const periodCfg  = cfg.periodConfigs[period];
      const parsedStart = periodCfg?.filterStartDate
        ? new Date(periodCfg.filterStartDate).getTime() : 0;
      const filterStart = isNaN(parsedStart) ? 0 : parsedStart;
      const before = resultsByPeriod[period]?.length ?? 0;
      resultsByPeriod[period] = applyPatternFilter(
        resultsByPeriod[period] ?? [],
        filterStart,
        cfg.patternFilter.minTouches,
      );
      log(`  ${period}: ${before}개 → ${resultsByPeriod[period]!.length}개`);
    }
  }

  // 5. AND 교집합
  const finalResults = intersectSimResults(resultsByPeriod);
  log(`\n🎯 AND 교집합 결과: ${finalResults.length}개 종목`);

  // 6. JSON 저장
  const tag      = datetimeTag();
  const periodStr = cfg.periods.join("+");
  const filename  = `sim_${cfg.market}_${periodStr}_${tag}.json`;
  const outDir    = marketConfig.simDir;
  const outPath   = path.join(outDir, filename);

  fs.mkdirSync(outDir, { recursive: true });

  const output: SimOutput = {
    generated_at: now(),
    market:       cfg.market,
    config:       cfg,
    result_count: finalResults.length,
    results:      finalResults,
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  log(`📁 JSON 저장: ${outPath}`);

  // 7. PNG 렌더링
  const chartScript = path.join(__dirname, "simulate_trend_chart.py");
  if (fs.existsSync(chartScript)) {
    log(`🎨 PNG 렌더링 시작...`);
    try {
      const { status, error } = spawnSync("python3", [chartScript, outPath], { stdio: "inherit" });
      if (error) throw error;
      if (status !== 0) throw new Error(`Exit code: ${status}`);
    } catch (e) {
      console.error(`❌ PNG 렌더링 실패:`, e);
    }
  } else {
    console.warn(`⚠️  ${chartScript} 없음 — PNG 렌더링 건너뜀`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const { market } = parseArgs();
  const configs    = loadConfig(market);

  if (configs.length === 0) {
    console.error(`❌ 실행할 config 없음 (--market ${market})`);
    process.exit(1);
  }

  for (const cfg of configs) {
    runMarketSim(cfg);
  }

  console.log("\n" + "=".repeat(60));
  log("🏁 전체 완료");
}

const _isEntry = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (_isEntry) main();
