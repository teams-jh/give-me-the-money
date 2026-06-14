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
  DEFAULT_FILTER_LOOKBACK_BARS,
  runTickerSim,
  sortSimResults,
  applyPatternFilter,
  convertToWeeklyBars,
  resolvePeriodDates,
  resolveFilterStartMs,
} from "../src/library/shared/trendSim.ts";
import type { SimResult, PeriodConfig, PeriodKey } from "../src/library/shared/trendSim.ts";
import { intersectSimResults } from "../src/library/shared/signals.ts";
import type { TrendSimFinalResult } from "../src/library/shared/signals.ts";
import { log } from "../server_node/scripts/_lib/logger.ts";
import { loadTickerList, loadTicker, saveJson } from "../src/library/shared/tickerRepository.ts";
import { parseN, VALID_MARKETS } from "./_lib/cli.ts";

// ── 경로 설정 ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, "..");
const DB_DIR     = path.join(ROOT_DIR, "src/db");

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface MarketConfig {
  simDir: string;
}

/** 출력(trend_sim) 디렉토리만 스크립트가 관리. 티커 로드 경로는 Repository 가 일원화 (#64) */
const MARKET_CONFIG: Record<string, MarketConfig> = {
  us: { simDir: path.join(DB_DIR, "us/trend_sim") },
  kr: { simDir: path.join(DB_DIR, "kr/trend_sim") },
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

export function dateTag(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");  // YYYYMMDD
}

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

export function parseArgs(): { market: string | null; n: number | null } {
  const args = process.argv.slice(2);
  const n    = parseN(args) ?? null;

  const mIdx  = args.indexOf("--market");
  let market: string | null = mIdx !== -1 ? (args[mIdx + 1] ?? null) : null;

  if (market !== null && !(VALID_MARKETS as readonly string[]).includes(market)) {
    console.error(`❌ 알 수 없는 마켓: ${market}. 사용 가능: ${VALID_MARKETS.join(", ")}`);
    process.exit(1);
  }

  return { market, n };
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
//
// 날짜 자동 채우기 로직은 src/library/shared/trendSim.ts 의
// resolvePeriodDates / resolveFilterStartMs 로 일원화되었다.
// (웹 use-trend-simulation 과 동일 함수를 공유하여 싱크를 보장)

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
  const tickers = loadTickerList(cfg.market, undefined, cfg.n ?? undefined);
  log(`📋 분석 대상: ${tickers.length}개 티커`);

  // 2. 기간 루프
  const resultsByPeriod:    Partial<Record<PeriodKey, SimResult[]>> = {};
  const dailyDatesByPeriod: Partial<Record<PeriodKey, string[]>>    = {}; // 패턴 필터용 일봉 dates

  for (const period of cfg.periods) {
    const periodCfg = cfg.periodConfigs[period];
    if (!periodCfg) {
      console.warn(`⚠️  periodConfigs["${period}"] 없음, 건너뜀`);
      continue;
    }

    const days    = PERIOD_BARS[periodCfg.barUnit ?? "daily"][period];
    const results: SimResult[] = [];
    let   skipped = 0;
    let   datePrinted = false;  // 날짜 로그는 첫 유효 티커 기준 1회만 출력

    log(`\n📅 기간: ${period} (${days}봉)`);

    // 3. 티커 루프
    for (let i = 0; i < tickers.length; i++) {
      const ticker  = tickers[i]!;
      const prefix  = `[${String(i + 1).padStart(4)}/${tickers.length}] ${ticker.padEnd(12)}`;

      const raw = loadTicker(cfg.market, ticker);
      if (raw === null) {
        console.log(`${prefix} → SKIP (파일 없음)`);
        skipped++;
        continue;
      }

      const info     = raw.info || {};
      const name     = cfg.market === "kr"
        ? info.kr_name || info.name || ""
        : info.name || "";

      const rawPrices = raw.prices ?? [];
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

      // 날짜 자동 채우기 (종목별 dates 기준 — 공통 함수)
      // dailyDates: 주봉 변환 전 일봉 원본 → filterStart를 "N거래일 전"으로 정확히 계산
      // (주봉 slice의 dates[-N]은 N주 전이 되어 버그 발생하는 것을 방지)
      const dailyDates  = allPrices.map(p => p.date);
      const dates       = slice.map(p => p.date);
      const resolvedCfg = resolvePeriodDates(periodCfg, dates, DEFAULT_FILTER_LOOKBACK_BARS, dailyDates);

      // 패턴 필터에서도 일봉 기준 filterStart를 쓸 수 있도록 첫 티커의 dailyDates 보관
      if (!dailyDatesByPeriod[period]) {
        dailyDatesByPeriod[period] = dailyDates;
      }

      // 첫 유효 티커 기준으로 날짜 로그 1회 출력
      if (!datePrinted) {
        log(`📆 날짜 (${ticker} 기준)`);
        log(`   trendStart:  ${resolvedCfg.trendStartDate}`);
        log(`   trendEnd:    ${resolvedCfg.trendEndDate}`);
        log(`   filterStart: ${resolvedCfg.filterStartDate}`);
        log(`   filterEnd:   ${resolvedCfg.filterEndDate}`);
        datePrinted = true;
      }

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
      const periodCfg = cfg.periodConfigs[period];
      if (!periodCfg) continue;

      // filterStartDate가 빈 문자열이면 resolveFilterStartMs가
      // 종목별 dates 기준으로 동일하게 자동 산출 (공통 함수)
      // dailyDates 전달 → 주봉 기간도 "N거래일 전" 기준으로 정확히 계산
      let filterStartMs = 0;
      const firstResult = resultsByPeriod[period]?.[0];
      if (firstResult) {
        const dates      = firstResult.prices.map((p: { date: string }) => p.date);
        const dailyDates = dailyDatesByPeriod[period];
        filterStartMs = resolveFilterStartMs(periodCfg, dates, DEFAULT_FILTER_LOOKBACK_BARS, dailyDates);
      }

      const before = resultsByPeriod[period]?.length ?? 0;
      resultsByPeriod[period] = applyPatternFilter(
        resultsByPeriod[period] ?? [],
        filterStartMs,
        cfg.patternFilter.minTouches,
      );
      log(`  ${period}: ${before}개 → ${resultsByPeriod[period]!.length}개`);
    }
  }

  // 5. AND 교집합
  const finalResults = intersectSimResults(resultsByPeriod);
  log(`\n🎯 AND 교집합 결과: ${finalResults.length}개 종목`);

  // 6. JSON 저장
  const tag      = dateTag();
  const periodStr = cfg.periods.join("+");
  const filename  = `sim_${cfg.market}_${periodStr}_${tag}.json`;
  const outDir    = marketConfig.simDir;
  const outPath   = path.join(outDir, filename);

  const output: SimOutput = {
    generated_at: now(),
    market:       cfg.market,
    config:       cfg,
    result_count: finalResults.length,
    results:      finalResults,
  };
  saveJson(outPath, output);
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
  const { market, n } = parseArgs();
  const configs = loadConfig(market);

  if (configs.length === 0) {
    console.error(`❌ 실행할 config 없음 (--market ${market})`);
    process.exit(1);
  }

  // CLI --n 옵션이 있으면 config의 n을 덮어씀
  for (const cfg of configs) {
    if (n !== null) cfg.n = n;
    runMarketSim(cfg);
  }

  console.log("\n" + "=".repeat(60));
  log("🏁 전체 완료");
}

const _isEntry = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (_isEntry) main();
