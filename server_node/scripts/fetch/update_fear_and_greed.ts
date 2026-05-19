/**
 * Fear & Greed Index 데이터 업데이트
 *
 * CNN Fear & Greed API에서 현재 공포·탐욕 지수와 히스토리컬 데이터를 가져와
 * src/db/market_sentiment/fear_and_greed.json 에 저장한다.
 *
 * 스킵 조건:
 *   - fear_and_greed.json 의 updated_at 이 오늘 날짜이면 건너뜀
 *   - --force 플래그로 강제 재다운로드 가능
 *
 * 실행:
 *   npx tsx scripts/fetch/update_fear_and_greed.ts
 *   npx tsx scripts/fetch/update_fear_and_greed.ts --force
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const CNN_URL    = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const OUTPUT_DIR = path.resolve(__dirname, "../../src/db/market_sentiment");
const OUTPUT     = path.join(OUTPUT_DIR, "fear_and_greed.json");

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":     "application/json",
  "Referer":    "https://edition.cnn.com/markets/fear-and-greed",
};

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface FearAndGreedCurrent {
  score:            number;
  rating:           string;   // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  timestamp:        string;
  previous_close:   number;
  previous_1_week:  number;
  previous_1_month: number;
  previous_1_year:  number;
}

interface HistoricalPoint {
  x:      number;   // Unix timestamp (ms)
  y:      number;   // score
  rating: string;
}

interface CnnApiResponse {
  fear_and_greed:             FearAndGreedCurrent;
  fear_and_greed_historical?: { data: HistoricalPoint[] };
  [key: string]: unknown;
}

interface HistoricalRow {
  date:   string;
  score:  number;
  rating: string;
}

interface FearAndGreedJson {
  updated_at:       string;
  score:            number;
  rating:           string;
  previous_close:   number;
  previous_1_week:  number;
  previous_1_month: number;
  previous_1_year:  number;
  historical:       HistoricalRow[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function round(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}

/** fear_and_greed.json 의 updated_at 이 오늘 날짜면 true */
function isUpdatedToday(): boolean {
  try {
    const data       = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today       = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch {
    return false;   // 파일 없음 → 스킵하지 않음
  }
}

// ── 1단계: API 호출 ───────────────────────────────────────────────────────────

async function fetchFearAndGreed(): Promise<CnnApiResponse> {
  log("CNN Fear & Greed Index 데이터 다운로드 중...");

  const response = await fetch(CNN_URL, { method: "GET", headers: FETCH_HEADERS });

  if (!response.ok) {
    throw new Error(`HTTP 오류: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as CnnApiResponse;

  // 응답 구조 검증
  if (typeof data.fear_and_greed?.score !== "number") {
    throw new Error("API 응답 구조 이상: fear_and_greed.score 없음");
  }

  log("다운로드 완료");
  return data;
}

// ── 2단계: JSON 빌드 ──────────────────────────────────────────────────────────

function buildJson(raw: CnnApiResponse): FearAndGreedJson {
  const fg = raw.fear_and_greed;

  // 히스토리컬: Unix ms → ISO date 변환, 오름차순 정렬
  const historical: HistoricalRow[] = (raw.fear_and_greed_historical?.data ?? [])
    .map((d) => ({
      date:   new Date(d.x).toISOString().slice(0, 10),
      score:  round(d.y) ?? d.y,
      rating: d.rating,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    updated_at:       new Date().toISOString(),
    score:            round(fg.score)            ?? fg.score,
    rating:           fg.rating,
    previous_close:   round(fg.previous_close)   ?? fg.previous_close,
    previous_1_week:  round(fg.previous_1_week)  ?? fg.previous_1_week,
    previous_1_month: round(fg.previous_1_month) ?? fg.previous_1_month,
    previous_1_year:  round(fg.previous_1_year)  ?? fg.previous_1_year,
    historical,
  };
}

// ── 3단계: 파일 저장 ──────────────────────────────────────────────────────────

function saveJson(data: FearAndGreedJson): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // tmp → rename: 파일 쓰기 중 crash 방지 (atomic write)
  const tmp = OUTPUT + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, OUTPUT);

  log(`저장 완료: ${OUTPUT}`);
  log(`현재 지수:  ${data.score} (${data.rating})`);
  log(`전일 종가:  ${data.previous_close}`);
  log(`1주일 전:  ${data.previous_1_week}`);
  log(`1개월 전:  ${data.previous_1_month}`);
  log(`1년 전:    ${data.previous_1_year}`);
  log(`히스토리:  ${data.historical.length}개 데이터 포인트`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  log("=== Fear & Greed Index 업데이트 시작 ===");

  if (!force && isUpdatedToday()) {
    log("오늘 이미 업데이트됨 — 건너뜀 (재다운로드: --force 플래그 사용)");
    log("=== 스킵 ===");
    return;
  }

  const raw  = await fetchFearAndGreed();
  const data = buildJson(raw);
  saveJson(data);

  log("=== 업데이트 완료 ===");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
