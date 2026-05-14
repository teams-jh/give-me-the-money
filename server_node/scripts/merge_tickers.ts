/**
 * 티커 리스트 병합 공통 모듈
 *
 * 사용법:
 *   import { mergeTickers } from "./merge_tickers.js";
 *
 *   mergeTickers({
 *     sources: [
 *       { path: "/abs/path/to/a.json", label: "nasdaq100" },
 *       { path: "/abs/path/to/b.json", label: "russell1000" },
 *     ],
 *     output: "/abs/path/to/all_us_tickers.json",
 *   });
 */

import fs from "fs";
import path from "path";

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

export interface MergeSource {
  path:  string;   // JSON 파일 절대 경로
  label: string;   // 출력 JSON 의 카운트 키 접두사 (예: "nasdaq100" → nasdaq100_count)
}

export interface MergeConfig {
  sources: MergeSource[];   // 입력 소스 (2개 이상 가능)
  output:  string;          // 출력 파일 절대 경로
}

interface SourceTickerJson {
  tickers: string[];
  [key: string]: unknown;
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

export function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 핵심 함수 ─────────────────────────────────────────────────────────────────

function readTickers(filePath: string): string[] {
  const raw  = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as SourceTickerJson;

  if (!Array.isArray(data.tickers)) {
    throw new Error(`tickers 배열 없음: ${filePath}`);
  }

  return data.tickers;
}

function dedupeAndSort(lists: string[][]): string[] {
  const merged = Array.from(new Set(lists.flat()));
  merged.sort();
  return merged;
}

export function mergeTickers(config: MergeConfig): void {
  const { sources, output } = config;

  log(`=== 티커 병합 시작: ${path.basename(output)} ===`);

  // 각 소스 읽기
  const sourceTickers = sources.map(({ path: p, label }) => {
    const tickers = readTickers(p);
    log(`${label}: ${tickers.length}개`);
    return { label, tickers };
  });

  const totalBefore = sourceTickers.reduce((s, x) => s + x.tickers.length, 0);
  log(`중복 제거 전 합계: ${totalBefore}개`);

  // 중복 제거 & 정렬
  const merged = dedupeAndSort(sourceTickers.map((x) => x.tickers));
  log(`중복 제거 후: ${merged.length}개`);

  // 출력 JSON 구성 (각 소스별 카운트 동적 추가)
  const counts: Record<string, number> = {};
  for (const { label, tickers } of sourceTickers) {
    counts[`${label}_count`] = tickers.length;
  }

  const sourceNames = sources.map((s) => path.basename(s.path)).join(" + ");

  const outputJson = {
    updated_at:  new Date().toISOString(),
    source:      sourceNames,
    total_count: merged.length,
    ...counts,
    tickers: merged,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(outputJson, null, 2), "utf8");
  log(`저장 완료: ${output}`);
  log(`=== 병합 완료 ===`);
}
