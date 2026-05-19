/**
 * VIX(변동성 지수) 데이터 업데이트
 *
 * Yahoo Finance에서 ^VIX 티커로 최근 3년치 일봉 데이터를 다운로드하고
 * fear_and_greed.json 과 동일한 구조로 src/db/market_sentiment/vix.json 에 저장한다.
 *
 * VIX rating 기준:
 *   < 15  → "low"      (시장 안정)
 *   15~25 → "moderate" (보통 변동성)
 *   25~35 → "high"     (높은 불안)
 *   ≥ 35  → "extreme"  (극단적 공포)
 *
 * 스킵 조건:
 *   - vix.json 의 updated_at 이 오늘 날짜이면 건너뜀
 *   - --force 플래그로 강제 재다운로드 가능
 *
 * 실행:
 *   npx tsx scripts/fetch/update_vix.ts
 *   npx tsx scripts/fetch/update_vix.ts --force
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YahooFinance from "yahoo-finance2";

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const yahooFinance = new YahooFinance();

// ── 설정 ─────────────────────────────────────────────────────────────────────

const VIX_TICKER  = "^VIX";
const OUTPUT_DIR  = path.resolve(__dirname, "../../../src/db/market_sentiment");
const OUTPUT      = path.join(OUTPUT_DIR, "vix.json");
const PRICE_YEARS = 3;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface QuoteRow {
  date:     Date;
  open:     number | null;
  high:     number | null;
  low:      number | null;
  close:    number | null;
  adjclose: number | null;
  volume:   number | null;
}

interface ChartResponse {
  quotes: QuoteRow[];
}

interface HistoricalRow {
  date:   string;
  score:  number;
  rating: string;
}

export interface VixJson {
  updated_at:       string;
  score:            number | null;
  rating:           string;
  previous_close:   number | null;
  previous_1_week:  number | null;
  previous_1_month: number | null;
  previous_1_year:  number | null;
  historical:       HistoricalRow[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

export function round(v: number | null | undefined): number | null {
  if (v == null || isNaN(v as number)) return null;
  return Math.round((v as number) * 100) / 100;
}

export function getVixRating(score: number): string {
  if (score < 15) return "low";
  if (score < 25) return "moderate";
  if (score < 35) return "high";
  return "extreme";
}

/** vix.json 의 updated_at 이 오늘 날짜면 true */
function isUpdatedToday(): boolean {
  try {
    const data       = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today       = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch {
    return false;
  }
}

// ── 1단계: Yahoo Finance 데이터 수집 ─────────────────────────────────────────

async function fetchVix(): Promise<ChartResponse> {
  log(`Yahoo Finance에서 ${VIX_TICKER} 데이터 수집 중...`);

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - PRICE_YEARS);

  const result = await yahooFinance.chart(VIX_TICKER, {
    period1: period1.toISOString().slice(0, 10),
    interval: "1d",
  });

  log(`데이터 수신 완료: ${result.quotes.length}개 쿼트`);
  return result as ChartResponse;
}

// ── 2단계: JSON 빌드 ──────────────────────────────────────────────────────────

export function buildJson(raw: ChartResponse): VixJson {
  const sorted = [...raw.quotes]
    .filter((q) => q.close != null)
    .map((q) => ({
      date:  q.date.toISOString().slice(0, 10),
      close: q.close as number,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    throw new Error("유효한 close 데이터가 없습니다.");
  }

  const latest       = sorted[sorted.length - 1];
  const prevClose    = sorted[sorted.length - 2]  ?? null;

  // 1주일(5 영업일), 1개월(21 영업일), 1년(252 영업일) 전 기준점
  const prev1Week    = sorted[sorted.length - 6]  ?? null;
  const prev1Month   = sorted[sorted.length - 22] ?? null;
  const prev1Year    = sorted[sorted.length - 253] ?? null;

  const historical: HistoricalRow[] = sorted.map((row) => ({
    date:   row.date,
    score:  round(row.close),
    rating: getVixRating(row.close),
  }));

  const currentScore = round(latest?.close ?? null);
  const currentRating = latest ? getVixRating(latest.close) : "moderate";

  return {
    updated_at:       new Date().toISOString(),
    score:            currentScore,
    rating:           currentRating,
    previous_close:   round(prevClose?.close ?? null),
    previous_1_week:  round(prev1Week?.close ?? null),
    previous_1_month: round(prev1Month?.close ?? null),
    previous_1_year:  round(prev1Year?.close ?? null),
    historical,
  };
}

// ── 3단계: 파일 저장 ──────────────────────────────────────────────────────────

function saveJson(data: VixJson): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tmp = OUTPUT + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, OUTPUT);

  log(`저장 완료: ${OUTPUT}`);
  log(`현재 VIX:  ${data.score} (${data.rating})`);
  log(`전일 종가: ${data.previous_close}`);
  log(`1주일 전:  ${data.previous_1_week}`);
  log(`1개월 전:  ${data.previous_1_month}`);
  log(`1년 전:    ${data.previous_1_year}`);
  log(`히스토리:  ${data.historical.length}개 데이터 포인트`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  log("=== VIX 데이터 업데이트 시작 ===");

  if (!force && isUpdatedToday()) {
    log("오늘 이미 업데이트됨 — 건너뜀 (재다운로드: --force 플래그 사용)");
    log("=== 스킵 ===");
    return;
  }

  try {
    const raw  = await fetchVix();

    if (!raw.quotes || raw.quotes.length === 0) {
      throw new Error("가격 데이터가 없습니다.");
    }

    const data = buildJson(raw);
    saveJson(data);

    log("=== 업데이트 완료 ===");
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

// 직접 실행될 때만 main() 호출 (import 시에는 자동 실행 안 함)
const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
