/**
 * Fear & Greed Index 데이터 업데이트
 *
 * Puppeteer(Headless Chrome)로 CNN 공포·탐욕 페이지를 열어 쿠키·세션을 획득한 뒤,
 * 브라우저 컨텍스트 안에서 직접 fetch()로 API를 호출해 데이터를 수집한다.
 *
 * CNN dataviz API는 Cloudflare로 보호되어 단순 fetch/curl은 403이 발생한다.
 * 페이지 방문으로 인증 쿠키를 얻은 후 브라우저 내부에서 API를 직접 호출한다.
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

import fs        from "fs";
import path      from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const CNN_PAGE_URL = "https://edition.cnn.com/markets/fear-and-greed";
const CNN_API_URL  = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const OUTPUT_DIR   = path.resolve(__dirname, "../../../src/db/market_sentiment");
const OUTPUT       = path.join(OUTPUT_DIR, "fear_and_greed.json");

const PAGE_TIMEOUT_MS = 30_000;   // CNN 페이지 로드 최대 시간
const API_TIMEOUT_MS  = 20_000;   // 브라우저 내부 fetch 최대 시간

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

/** 7개 하위 지표 각각의 응답 구조 (FearAndGreedCurrent 와 동일 형태) */
interface CnnApiComponent {
  score:            number;
  rating:           string;
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
  fear_and_greed:              FearAndGreedCurrent;
  fear_and_greed_historical?:  { data: HistoricalPoint[] };
  // 7개 하위 지표 컴포넌트
  market_momentum_sp500?:      CnnApiComponent;
  stock_price_strength?:       CnnApiComponent;
  stock_price_breadth?:        CnnApiComponent;
  put_call_options?:           CnnApiComponent;
  junk_bond_demand?:           CnnApiComponent;
  market_volatility_vix?:      CnnApiComponent;
  safe_haven_demand?:          CnnApiComponent;
  [key: string]: unknown;
}

interface HistoricalRow {
  date:   string;
  score:  number;
  rating: string;
}

interface ComponentScore {
  score:  number | null;
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
  components: {
    market_momentum:   ComponentScore;   // market_momentum_sp500
    stock_strength:    ComponentScore;   // stock_price_strength
    stock_breadth:     ComponentScore;   // stock_price_breadth
    put_call:          ComponentScore;   // put_call_options
    junk_bond:         ComponentScore;   // junk_bond_demand
    market_volatility: ComponentScore;   // market_volatility_vix
    safe_haven:        ComponentScore;   // safe_haven_demand
  };
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

/** CnnApiComponent → ComponentScore 변환 (필드 누락 시 score: null, rating: "unknown") */
function extractComponent(c: CnnApiComponent | undefined): ComponentScore {
  if (!c) return { score: null, rating: "unknown" };
  return {
    score:  round(c.score) ?? null,
    rating: c.rating,
  };
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

// ── 1단계: Puppeteer - 페이지 방문 후 브라우저 내부 fetch ────────────────────

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
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();

    // 불필요한 리소스 차단 (이미지·폰트·미디어) → 로드 속도 개선
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "image" || t === "font" || t === "media") req.abort();
      else req.continue();
    });

    // 1) CNN 공포·탐욕 페이지 방문 → Cloudflare 통과 + 쿠키·세션 획득
    log(`CNN 페이지 방문 중: ${CNN_PAGE_URL}`);
    await page.goto(CNN_PAGE_URL, {
      waitUntil: "domcontentloaded",
      timeout:   PAGE_TIMEOUT_MS,
    });
    log("페이지 로드 완료 — 쿠키 획득");

    // 2) 브라우저 컨텍스트 안에서 직접 API fetch 실행
    //    (Cloudflare 쿠키가 자동으로 포함되므로 403 없이 통과)
    log(`브라우저 내부에서 API 호출 중: ${CNN_API_URL}`);
    const data = await page.evaluate(
      async (apiUrl: string, timeoutMs: number): Promise<CnnApiResponse> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(apiUrl, {
            headers: {
              "Accept":  "application/json",
              "Referer": "https://edition.cnn.com/markets/fear-and-greed",
            },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as CnnApiResponse;
        } finally {
          clearTimeout(timer);
        }
      },
      CNN_API_URL,
      API_TIMEOUT_MS
    );

    // 응답 구조 검증
    if (typeof data.fear_and_greed?.score !== "number") {
      throw new Error("API 응답 구조 이상: fear_and_greed.score 없음");
    }

    log("API 데이터 수신 완료");
    return data;

  } finally {
    await browser.close();
    log("브라우저 종료");
  }
}

// ── 2단계: JSON 빌드 ──────────────────────────────────────────────────────────

function buildJson(raw: CnnApiResponse): FearAndGreedJson {
  const fg = raw.fear_and_greed;

  // 히스토리컬: Unix ms → ISO date 변환, 날짜별 마지막 값만 유지(dedup), 오름차순 정렬
  // CNN API는 장중에도 점수를 갱신하므로 같은 날짜에 여러 항목이 올 수 있음.
  // timestamp(x) 오름차순으로 처리하면 나중 항목이 Map을 덮어써 마지막 값만 남음.
  const deduped = new Map<string, HistoricalRow>();
  (raw.fear_and_greed_historical?.data ?? [])
    .sort((a, b) => a.x - b.x)
    .forEach((d) => {
      const date = new Date(d.x).toISOString().slice(0, 10);
      deduped.set(date, {
        date,
        score:  round(d.y) ?? d.y,
        rating: d.rating,
      });
    });
  const historical: HistoricalRow[] = [...deduped.values()]
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    updated_at:       new Date().toISOString(),
    score:            round(fg.score)            ?? fg.score,
    rating:           fg.rating,
    previous_close:   round(fg.previous_close)   ?? fg.previous_close,
    previous_1_week:  round(fg.previous_1_week)  ?? fg.previous_1_week,
    previous_1_month: round(fg.previous_1_month) ?? fg.previous_1_month,
    previous_1_year:  round(fg.previous_1_year)  ?? fg.previous_1_year,
    components: {
      market_momentum:   extractComponent(raw.market_momentum_sp500),
      stock_strength:    extractComponent(raw.stock_price_strength),
      stock_breadth:     extractComponent(raw.stock_price_breadth),
      put_call:          extractComponent(raw.put_call_options),
      junk_bond:         extractComponent(raw.junk_bond_demand),
      market_volatility: extractComponent(raw.market_volatility_vix),
      safe_haven:        extractComponent(raw.safe_haven_demand),
    },
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
  const c = data.components;
  log(`[컴포넌트] 모멘텀:${c.market_momentum.score}  강도:${c.stock_strength.score}  폭:${c.stock_breadth.score}  풋콜:${c.put_call.score}  정크본드:${c.junk_bond.score}  변동성:${c.market_volatility.score}  안전자산:${c.safe_haven.score}`);
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
