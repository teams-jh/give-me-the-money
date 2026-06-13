/**
 * 고아 티커 JSON 파일 정리
 *
 * quarterly 워크플로우로 지수 구성종목이 바뀔 때, 편출된 종목의
 * 티커 JSON 파일이 src/db/{market}/tickers/ 에 잔류하는 문제를 처리한다.
 *
 * 활성 티커 기준: src/db/metadata/all_{market}_tickers.json 의 tickers 배열
 * 고아 파일    : 위 목록에 없는 src/db/{market}/tickers/*.json
 *
 * 실행:
 *   npx tsx scripts/cleanup/cleanup_orphan_tickers.ts --market all           # 삭제 실행
 *   npx tsx scripts/cleanup/cleanup_orphan_tickers.ts --market us            # US만
 *   npx tsx scripts/cleanup/cleanup_orphan_tickers.ts --market kr            # KR만
 *   npx tsx scripts/cleanup/cleanup_orphan_tickers.ts --market all --dry-run # 목록만 출력
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { log, warn } from "../_lib/logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, "../../../src/db");

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface MarketMeta {
  tickers: string[];
}

interface MarketConfig {
  label:       string;   // 로그용
  metaJson:    string;   // all_{market}_tickers.json 경로
  tickersDir:  string;   // src/db/{market}/tickers/ 경로
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

export { log, warn };

/**
 * 티커 문자열 → 파일명 (확장자 제외)
 * KR: "005930.KS" → "005930"
 * US: "AAPL"      → "AAPL"
 * update_ticker_metadata.ts 의 tickerToFilename() 과 동일 로직 유지
 */
function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

// ── 핵심 로직 ─────────────────────────────────────────────────────────────────

interface CleanupResult {
  market:   string;
  orphans:  string[];   // 고아 파일 절대 경로 목록
  deleted:  number;
  skipped:  number;     // dry-run 시 삭제 건너뜀
}

export function cleanupMarket(config: MarketConfig, dryRun: boolean): CleanupResult {
  const { label, metaJson, tickersDir } = config;

  log(`=== [${label}] 고아 티커 정리 시작 ===`);

  // 1. 활성 티커 파일명 집합 로드
  if (!fs.existsSync(metaJson)) {
    warn(`메타 파일 없음, 건너뜀: ${metaJson}`);
    return { market: label, orphans: [], deleted: 0, skipped: 0 };
  }

  const meta       = JSON.parse(fs.readFileSync(metaJson, "utf8")) as MarketMeta;
  const activeNames = new Set(meta.tickers.map(tickerToFilename));
  log(`활성 티커: ${activeNames.size}개`);

  // 2. 디렉토리의 실제 파일 목록
  if (!fs.existsSync(tickersDir)) {
    warn(`티커 디렉토리 없음, 건너뜀: ${tickersDir}`);
    return { market: label, orphans: [], deleted: 0, skipped: 0 };
  }

  const files = fs.readdirSync(tickersDir).filter((f) => f.endsWith(".json"));
  log(`디렉토리 파일: ${files.length}개`);

  // 3. 고아 파일 탐지
  const orphanFiles = files
    .filter((f) => !activeNames.has(f.replace(".json", "")))
    .map((f) => path.join(tickersDir, f));

  log(`고아 파일: ${orphanFiles.length}개`);

  if (orphanFiles.length === 0) {
    log(`[${label}] 고아 파일 없음 — 정리 불필요`);
    return { market: label, orphans: [], deleted: 0, skipped: 0 };
  }

  // 4. 삭제 (또는 dry-run 출력)
  let deleted = 0;
  let skipped = 0;

  for (const filePath of orphanFiles) {
    const name = path.basename(filePath);
    if (dryRun) {
      log(`[DRY-RUN] 삭제 예정: ${name}`);
      skipped++;
    } else {
      fs.rmSync(filePath);
      log(`삭제: ${name}`);
      deleted++;
    }
  }

  log(`=== [${label}] 완료 — 삭제 ${deleted}개 / dry-run 건너뜀 ${skipped}개 ===`);

  return { market: label, orphans: orphanFiles, deleted, skipped };
}

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

const MARKET_CONFIGS: Record<string, MarketConfig> = {
  us: {
    label:      "US",
    metaJson:   path.join(DB_DIR, "metadata", "all_us_tickers.json"),
    tickersDir: path.join(DB_DIR, "us", "tickers"),
  },
  kr: {
    label:      "KR",
    metaJson:   path.join(DB_DIR, "metadata", "all_kr_tickers.json"),
    tickersDir: path.join(DB_DIR, "kr", "tickers"),
  },
};

// ── 진입점 ────────────────────────────────────────────────────────────────────

export function parseArgs(): { market: string; dryRun: boolean } {
  const args       = process.argv.slice(2);
  const marketIdx  = args.indexOf("--market");
  const market     =
    marketIdx !== -1 && args[marketIdx + 1] && !args[marketIdx + 1].startsWith("-")
      ? args[marketIdx + 1]
      : "all";
  const dryRun = args.includes("--dry-run");
  return { market, dryRun };
}

export function main(): void {
  const { market, dryRun } = parseArgs();

  if (dryRun) {
    log("※ DRY-RUN 모드 — 실제 파일은 삭제되지 않습니다");
  }

  const targets =
    market === "all"
      ? Object.values(MARKET_CONFIGS)
      : [MARKET_CONFIGS[market]];

  if (!targets || targets.some((t) => t === undefined)) {
    console.error(`알 수 없는 --market 값: ${market} (us / kr / all 중 하나)`);
    process.exit(1);
  }

  const results: CleanupResult[] = [];
  for (const config of targets) {
    results.push(cleanupMarket(config, dryRun));
  }

  // 최종 요약
  log("=== 전체 요약 ===");
  let totalDeleted = 0;
  let totalSkipped = 0;
  for (const r of results) {
    log(`[${r.market}] 고아 ${r.orphans.length}개 → 삭제 ${r.deleted} / 건너뜀 ${r.skipped}`);
    totalDeleted += r.deleted;
    totalSkipped += r.skipped;
  }
  log(`합계 — 삭제 ${totalDeleted}개 / 건너뜀 ${totalSkipped}개`);

  if (dryRun && (totalSkipped > 0)) {
    log("※ --dry-run 제거 후 재실행하면 위 파일들이 삭제됩니다");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
