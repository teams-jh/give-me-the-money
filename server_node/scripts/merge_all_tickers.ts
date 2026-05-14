/**
 * 미국 전체 티커 리스트 병합
 *
 * 흐름:
 *   1. src/db/metadata/nasdaq100_tickers.json 읽기
 *   2. src/db/metadata/russell1000_tickers.json 읽기
 *   3. 두 리스트를 중복 없이 합쳐 알파벳순 정렬
 *   4. src/db/metadata/all_us_tickers.json 저장
 *
 * 실행:
 *   npx tsx server_node/scripts/merge_all_tickers.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const METADATA_DIR     = path.resolve(__dirname, "../../src/db/metadata");
const NASDAQ100_PATH   = path.join(METADATA_DIR, "nasdaq100_tickers.json");
const RUSSELL1000_PATH = path.join(METADATA_DIR, "russell1000_tickers.json");
const OUTPUT           = path.join(METADATA_DIR, "all_us_tickers.json");

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface TickerJson {
  tickers: string[];
  [key: string]: unknown;
}

interface AllTickersJson {
  updated_at:   string;
  source:       string;
  total_count:  number;
  nasdaq100_count:  number;
  russell1000_count: number;
  tickers:      string[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 1단계: JSON 파일 읽기 ─────────────────────────────────────────────────────

function readTickerJson(filePath: string): string[] {
  const raw  = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as TickerJson;

  if (!Array.isArray(data.tickers)) {
    throw new Error(`${filePath} 에 tickers 배열이 없습니다.`);
  }

  return data.tickers;
}

// ── 2단계: 중복 제거 및 병합 ──────────────────────────────────────────────────

function mergeTickers(a: string[], b: string[]): string[] {
  const merged = Array.from(new Set([...a, ...b]));
  merged.sort();
  return merged;
}

// ── 3단계: JSON 저장 ──────────────────────────────────────────────────────────

function saveJson(
  tickers: string[],
  nasdaq100Count: number,
  russell1000Count: number
): void {
  fs.mkdirSync(METADATA_DIR, { recursive: true });

  const output: AllTickersJson = {
    updated_at:        new Date().toISOString(),
    source:            "nasdaq100_tickers.json + russell1000_tickers.json",
    total_count:       tickers.length,
    nasdaq100_count:   nasdaq100Count,
    russell1000_count: russell1000Count,
    tickers,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  log(`JSON 저장 완료: ${OUTPUT}  (${tickers.length}개)`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

function main(): void {
  log("=== 미국 전체 티커 리스트 병합 시작 ===");

  const nasdaq100Tickers  = readTickerJson(NASDAQ100_PATH);
  const russell1000Tickers = readTickerJson(RUSSELL1000_PATH);

  log(`NASDAQ 100 티커 수: ${nasdaq100Tickers.length}개`);
  log(`Russell 1000 티커 수: ${russell1000Tickers.length}개`);
  log(`중복 제거 전 합계: ${nasdaq100Tickers.length + russell1000Tickers.length}개`);

  const merged = mergeTickers(nasdaq100Tickers, russell1000Tickers);

  log(`중복 제거 후 티커 수: ${merged.length}개`);
  log(`상위 5개: ${merged.slice(0, 5).join(", ")}`);

  saveJson(merged, nasdaq100Tickers.length, russell1000Tickers.length);
  log("=== 병합 완료 ===");
}

main();
