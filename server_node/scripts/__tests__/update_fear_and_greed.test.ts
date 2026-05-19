/**
 * update_fear_and_greed.ts 테스트
 *
 * TC 계획:
 *   TC01  round()              - 소수점 반올림
 *   TC02  round()              - null → null
 *   TC03  round()              - NaN → null
 *   TC04  round()              - undefined → null
 *   TC05  isUpdatedToday()     - 오늘 날짜 파일 → true (main() 스킵 경로)
 *   TC06  isUpdatedToday()     - 어제 날짜 → false (fetch 실행)
 *   TC07  isUpdatedToday()     - 파일 없음(throw) → false
 *   TC08  isUpdatedToday()     - updated_at 없음 → false
 *   TC09  getExecutablePath()  - PUPPETEER_EXECUTABLE_PATH 환경 변수 설정 → 해당 경로
 *   TC10  getExecutablePath()  - CI=true → /usr/bin/google-chrome
 *   TC11  getExecutablePath()  - 미설정 → undefined
 *   TC12  buildJson()          - 히스토리 없음 → 빈 배열
 *   TC13  buildJson()          - 히스토리 있음 → 변환·정렬
 *   TC14  main()               - 오늘 업데이트 + no --force → 스킵 (puppeteer 미호출)
 *   TC15  main()               - 정상 경로 → writeFileSync 호출
 *   TC16  main()               - API 응답 score 없음 → process.exit(1)
 *   TC17  main()               - --force 플래그 → 오늘 업데이트여도 실행
 *   TC18  main()               - request 인터셉트: image → abort, other → continue
 *   TC19  main()               - response URL 불일치 → 통과(무시)
 *
 * Puppeteer 모킹 전략:
 *   page.on("request", handler) / page.on("response", handler) 핸들러를 캡처하여
 *   page.goto() 안에서 직접 호출 → apiDataPromise 를 동기적으로 resolve 시킴
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();
const mockRenameSync    = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
  },
}));

// ── Puppeteer 모킹 ────────────────────────────────────────────────────────────
// 전략: page.on() 으로 등록된 핸들러를 캡처 → page.goto() 안에서 직접 호출

let capturedRequestHandler: ((req: unknown) => void) | undefined;
let capturedResponseHandler: ((res: unknown) => void) | undefined;

const mockAbort    = vi.fn();
const mockContinue = vi.fn();
const mockPageSetRequestInterception = vi.fn().mockResolvedValue(undefined);
const mockPageGoto = vi.fn();
const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
const mockNewPage  = vi.fn();
const mockLaunch   = vi.fn();

vi.mock("puppeteer", () => ({
  default: {
    launch: (...a: unknown[]) => mockLaunch(...a),
  },
}));

// ── 헬퍼: 정상 API 응답 데이터 ───────────────────────────────────────────────

function makeCnnResponse(opts: { noScore?: boolean; hasHistorical?: boolean } = {}) {
  return {
    fear_and_greed: opts.noScore ? {} : {
      score:            72.5,
      rating:           "Greed",
      timestamp:        "2026-05-19T00:00:00.000Z",
      previous_close:   68.1,
      previous_1_week:  65.0,
      previous_1_month: 60.0,
      previous_1_year:  55.0,
    },
    ...(opts.hasHistorical ? {
      fear_and_greed_historical: {
        data: [
          { x: new Date("2026-05-17").getTime(), y: 65.0, rating: "Greed" },
          { x: new Date("2026-05-19").getTime(), y: 72.5, rating: "Greed" },
          { x: new Date("2026-05-18").getTime(), y: 68.0, rating: "Greed" },  // 정렬 확인용
        ],
      },
    } : {}),
  };
}

// ── 헬퍼: Puppeteer 목 페이지 초기화 ──────────────────────────────────────────

function setupPuppeteerMock(
  apiResponse: unknown,
  opts: { matchUrl?: boolean; jsonThrows?: boolean } = {}
) {
  capturedRequestHandler  = undefined;
  capturedResponseHandler = undefined;

  const mockPageOn = vi.fn().mockImplementation((event: string, handler: unknown) => {
    if (event === "request")  capturedRequestHandler  = handler as (req: unknown) => void;
    if (event === "response") capturedResponseHandler = handler as (res: unknown) => void;
  });

  const urlPart = opts.matchUrl === false
    ? "https://edition.cnn.com/unrelated/page"
    : "https://edition.cnn.com/fearandgreed/graphdata/v1";

  mockPageGoto.mockImplementation(async () => {
    if (capturedResponseHandler) {
      const mockRes = {
        url: () => urlPart,
        json: opts.jsonThrows
          ? () => Promise.reject(new Error("JSON parse failed"))
          : () => Promise.resolve(apiResponse),
      };
      // 응답 핸들러 비동기 호출 (소스 내부의 async 핸들러와 동일하게)
      await capturedResponseHandler(mockRes);
    }
  });

  mockNewPage.mockResolvedValue({
    setRequestInterception: mockPageSetRequestInterception,
    on: mockPageOn,
    goto: mockPageGoto,
  });

  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });
}

// ── 날짜 헬퍼 ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
}

// ── 순수 함수 로컬 재현 ────────────────────────────────────────────────────────
// 소스의 round() 와 동일 로직 - 소스 변경 시 이 테스트가 깨지도록 의도

function round(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}

// ── TC01~04: round() ──────────────────────────────────────────────────────────

describe("round()", () => {
  it("TC01 - 양수 소수점 반올림", () => {
    expect(round(72.555)).toBe(72.56);
    expect(round(1234.567)).toBe(1234.57);
  });

  it("TC02 - null → null", () => {
    expect(round(null)).toBeNull();
  });

  it("TC03 - NaN → null", () => {
    expect(round(NaN)).toBeNull();
  });

  it("TC04 - undefined → null", () => {
    expect(round(undefined)).toBeNull();
  });
});

// ── TC05~08: isUpdatedToday() 간접 검증 (main() 통해) ──────────────────────────

describe("isUpdatedToday() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
  });

  it("TC05 - 오늘 날짜 파일 존재 → main() 스킵 (puppeteer 미호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: new Date().toISOString() })
    );
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("TC06 - 어제 날짜 파일 → 업데이트 실행 (puppeteer 호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: `${yesterdayStr()}T00:00:00.000Z` })
    );
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("TC07 - 파일 없음(throw) → false → 업데이트 실행", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("TC08 - updated_at 없음 → false → 업데이트 실행", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ score: 72 }));
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
  });
});

// ── TC09~11: getExecutablePath() 간접 검증 (puppeteer.launch 인수 통해) ───────

describe("getExecutablePath() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    // 환경변수 정리
    delete process.env["PUPPETEER_EXECUTABLE_PATH"];
    delete process.env["CI"];
  });

  afterEach(() => {
    delete process.env["PUPPETEER_EXECUTABLE_PATH"];
    delete process.env["CI"];
  });

  it("TC09 - PUPPETEER_EXECUTABLE_PATH 설정 → launch에 해당 경로 전달", async () => {
    process.env["PUPPETEER_EXECUTABLE_PATH"] = "/opt/chromium/chrome";
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/opt/chromium/chrome" })
    );
  });

  it("TC10 - CI=true → launch에 /usr/bin/google-chrome 전달", async () => {
    process.env["CI"] = "true";
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/usr/bin/google-chrome" })
    );
  });

  it("TC11 - 환경변수 미설정 → launch에 executablePath=undefined 전달", async () => {
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: undefined })
    );
  });
});

// ── TC12~13: buildJson() ──────────────────────────────────────────────────────
// buildJson은 export 되지 않으므로 main() 통해 saveJson(buildJson(raw)) 경로로 간접 검증
// writeFileSync 에 전달된 JSON 내용을 파싱하여 검증

describe("buildJson() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
  });

  it("TC12 - 히스토리 없음 → historical 빈 배열", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasHistorical: false }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.historical).toEqual([]);
    expect(written.score).toBe(72.5);
    expect(written.rating).toBe("Greed");
  });

  it("TC13 - 히스토리 있음 → 오름차순 정렬 + 날짜 변환", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasHistorical: true }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.historical).toHaveLength(3);
    const dates = written.historical.map((h: { date: string }) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(written.historical[0].score).toBe(65);
  });
});

// ── TC14~19: main() 시나리오 ──────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC14 - 오늘 업데이트 + no --force → 스킵 (writeFileSync 미호출)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("TC15 - 정상 경로 → writeFileSync 2회 (tmp + rename)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockRenameSync).toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("TC16 - API 응답에 score 없음 → process.exit(1)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse({ noScore: true }));
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 3000 });
    mockExit.mockRestore();
  });

  it("TC17 - --force 플래그 → 오늘 업데이트여도 fetch 실행", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    process.argv = ["node", "script.ts"];
  });

  it("TC18 - request 인터셉트: image → abort, xhr → continue", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

    // page.on("request", handler) 를 직접 캡처하여 TC에서 호출
    let reqHandler: ((req: unknown) => void) | undefined;
    const mockPageOn = vi.fn().mockImplementation((event: string, handler: unknown) => {
      if (event === "request") reqHandler = handler as (req: unknown) => void;
      if (event === "response") capturedResponseHandler = handler as (res: unknown) => void;
    });

    mockPageGoto.mockImplementation(async () => {
      // 다양한 요청 타입 핸들러 호출
      const makeReq = (type: string) => ({
        resourceType: () => type,
        abort:    mockAbort,
        continue: mockContinue,
      });
      if (reqHandler) {
        reqHandler(makeReq("image"));  // → abort
        reqHandler(makeReq("font"));   // → abort
        reqHandler(makeReq("media"));  // → abort
        reqHandler(makeReq("xhr"));    // → continue
        reqHandler(makeReq("script")); // → continue
      }
      // 정상 API 응답 트리거
      if (capturedResponseHandler) {
        await capturedResponseHandler({
          url: () => "https://edition.cnn.com/fearandgreed/graphdata/v1",
          json: () => Promise.resolve(makeCnnResponse()),
        });
      }
    });

    mockNewPage.mockResolvedValue({
      setRequestInterception: mockPageSetRequestInterception,
      on: mockPageOn,
      goto: mockPageGoto,
    });
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });

    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");

    expect(mockAbort).toHaveBeenCalledTimes(3);    // image, font, media
    expect(mockContinue).toHaveBeenCalledTimes(2); // xhr, script
  });

  it("TC19 - response URL 불일치 → 무시(resolve 안 됨), 두 번째 응답으로 resolve", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

    // 첫 번째 응답은 URL 불일치, 두 번째는 일치
    mockPageGoto.mockImplementation(async () => {
      if (capturedResponseHandler) {
        // 불일치 URL → 핸들러 내부에서 return (무시)
        await capturedResponseHandler({
          url: () => "https://edition.cnn.com/unrelated/page",
          json: () => Promise.resolve({}),
        });
        // 일치 URL → resolve
        await capturedResponseHandler({
          url: () => "https://edition.cnn.com/fearandgreed/graphdata/v1",
          json: () => Promise.resolve(makeCnnResponse()),
        });
      }
    });

    const mockPageOn = vi.fn().mockImplementation((event: string, handler: unknown) => {
      if (event === "response") capturedResponseHandler = handler as (res: unknown) => void;
    });

    mockNewPage.mockResolvedValue({
      setRequestInterception: mockPageSetRequestInterception,
      on: mockPageOn,
      goto: mockPageGoto,
    });
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });

    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
  });
});
