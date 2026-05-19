/**
 * Fear & Greed Index 데이터 업데이트
 *
 * Puppeteer(Headless Chrome)로 CNN 공포·탐욕 페이지를 열어
 * 브라우저가 내부적으로 호출하는 API 응답을 인터셉트한 뒤
 * src/db/market_sentiment/fear_and_greed.json 에 저장한다.
 *
 * CNN dataviz API는 Cloudflare로 보호되어 단순 fetch/curl은 403이 발생한다.
 * 실제 브라우저를 통해 우회한다.
 *
 * 스킵 조건:
 *   - fear_and_greed.json 의 updated_at 이 오늘 날짜이면 건너뜀
 *   - --force 플래그로 강제 재다운로드 가능
 *
 * 사전 준비:
 *   npm install puppeteer       ← 최초 1회 (Chromium 자동 다운로드 포함)
 *
 * 실행:
 *   npx tsx scripts/fetch/update_fear_and_greed.ts
 *   npx tsx scripts/fetch/update_fear_and_greed.ts --force
 */

import fs      from "fs";
import path    from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const CNN_PAGE_URL = "https://edition.cnn.com/markets/fear-and-greed";
const API_URL_PART = "fearandgreed/graphdata";   // 인터셉트 대상 URL 키워드
const OUTPUT_DIR   = path.resolve(__dirname, "../../src/db/market_sentiment");
const OUTPUT       = path.join(OUTPUT_DIR, "fear_and_greed.json");

const TIMEOUT_MS   = 30_000;   // 페이지 로드 + API 응답 대기 최대 시간

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

// ── 1단계: Puppeteer로 브라우저 인터셉트 ────────────────────────────────────

/** CI(GitHub Actions) 환경에서는 사전 설치된 Google Chrome을 사용한다 */
function getExecutablePath(): string | undefined {
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    return process.env["PUPPETEER_EXECUTABLE_PATH"];
  }
  // GitHub Actions ubuntu-latest에는 google-chrome이 사전 설치돼 있음
  if (process.env["CI"]) {
    return "/usr/bin/google-chrome";
  }
  return undefined;   // 로컬: puppeteer 번들 Chromium 자동 사용
}

async function fetchFearAndGreed(): Promise<CnnApiResponse> {
  log("Headless Chrome 실행 중...");

  const executablePath = getExecutablePath();
  if (executablePath) log(`브라우저 경로: ${executablePath}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",             // CI/Docker 환경 필수
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",  // GitHub Actions 메모리 제한 대응
    ],
  });

  try {
    const page = await browser.newPage();

    // 불필요한 리소스(이미지·폰트·미디어) 차단 → 속도 개선
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "image" || type === "font" || type === "media") {
        req.abort();
      } else {
        req.continue();
      }
    });

    // API 응답을 캡처할 Promise를 페이지 이동 전에 등록
    const apiDataPromise = new Promise<CnnApiResponse>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`API 응답 타임아웃 (${TIMEOUT_MS / 1000}초)`)),
        TIMEOUT_MS
      );

      page.on("response", async (res) => {
        if (!res.url().includes(API_URL_PART)) return;

        clearTimeout(timer);
        try {
          const json = (await res.json()) as CnnApiResponse;
          resolve(json);
        } catch (e) {
          reject(new Error(`API 응답 파싱 실패: ${String(e)}`));
        }
      });
    });

    // CNN 공포·탐욕 페이지 접속 → Cloudflare 통과 + 브라우저가 API 자동 호출
    log(`페이지 접속 중: ${CNN_PAGE_URL}`);
    await page.goto(CNN_PAGE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

    // 인터셉트한 API 응답 대기
    const data = await apiDataPromise;

    // 응답 구조 검증
    if (typeof data.fear_and_greed?.score !== "number") {
      throw new Error("API 응답 구조 이상: fear_and_greed.score 없음");
    }

    log("API 응답 캡처 완료");
    return data;

  } finally {
    await browser.close();
    log("브라우저 종료");
  }
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
