/**
 * update_fear_and_greed.ts 테스트
 *
 * TC 계획:
 *   TC01  isUpdatedToday()     - 오늘 날짜 파일 → true (main() 스킵 경로)
 *   TC02  isUpdatedToday()     - 어제 날짜 → false (fetch 실행)
 *   TC03  isUpdatedToday()     - 파일 없음(throw) → false
 *   TC04  isUpdatedToday()     - updated_at 없음 → false
 *   TC05  getExecutablePath()  - PUPPETEER_EXECUTABLE_PATH 환경 변수 설정 → 해당 경로
 *   TC06  getExecutablePath()  - CI=true → /usr/bin/google-chrome
 *   TC07  getExecutablePath()  - 미설정 → undefined
 *   TC08  buildJson()          - 히스토리 없음 → 빈 배열 / round() 간접 검증
 *   TC09  buildJson()          - 히스토리 있음 → 변환·정렬 / round() 간접 검증
 *   TC16  buildJson()          - 같은 날짜 중복 항목 → 마지막 값(timestamp 최대)만 유지
 *   TC17  buildJson()          - 컴포넌트 있음 → components 7개 필드 추출 / 없음 → score:null, rating:"unknown"
 *   TC10  main()               - 오늘 업데이트 + no --force → 스킵 (puppeteer 미호출)
 *   TC11  main()               - 정상 경로 → writeFileSync + renameSync 호출
 *   TC12  main()               - API 응답 score 없음 → process.exit(1)
 *   TC13  main()               - --force 플래그 → 오늘 업데이트여도 실행
 *   TC14  main()               - request 인터셉트: image → abort, other → continue
 *   TC15  main()               - page.evaluate 실패(네트워크 오류) → process.exit(1)
 *
 * 설계 결정:
 *   round() 단위 테스트는 별도로 두지 않음.
 *   소스의 round()는 export되지 않으며, TC08·TC09에서 최종 JSON 값(score, historical.score)으로
 *   소스 실제 round() 로직을 간접 검증한다.
 *
 * Puppeteer 모킹 전략 (v2 - page.evaluate 방식):
 *   구현이 page.evaluate()로 브라우저 컨텍스트 안에서 직접 fetch를 호출하므로,
 *   page.evaluate mock이 API 응답 데이터를 반환하도록 설정한다.
 *   page.goto()는 CNN 페이지 방문(쿠키 획득)용으로 단순 resolve로 모킹한다.
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
// 전략: page.goto()는 쿠키 획득용으로 단순 resolve,
//       page.evaluate()가 실제 API 데이터를 반환하도록 모킹

const mockAbort    = vi.fn();
const mockContinue = vi.fn();
const mockPageSetRequestInterception = vi.fn().mockResolvedValue(undefined);
const mockPageGoto     = vi.fn().mockResolvedValue(undefined);
const mockPageEvaluate = vi.fn();
const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
const mockNewPage  = vi.fn();
const mockLaunch   = vi.fn();

vi.mock("puppeteer", () => ({
  default: {
    launch: (...a: unknown[]) => mockLaunch(...a),
  },
}));

// ── 헬퍼: 정상 API 응답 데이터 ───────────────────────────────────────────────

function makeCnnResponse(opts: { noScore?: boolean; hasHistorical?: boolean; hasDuplicates?: boolean; hasComponents?: boolean } = {}) {
  const componentData = {
    score:            65.0,
    rating:           "Greed",
    timestamp:        "2026-05-19T00:00:00.000Z",
    previous_close:   63.0,
    previous_1_week:  60.0,
    previous_1_month: 55.0,
    previous_1_year:  50.0,
  };
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
    ...(opts.hasDuplicates ? {
      fear_and_greed_historical: {
        data: [
          // 2026-05-19 가 두 번 등장 — 장중 업데이트 시뮬레이션
          { x: new Date("2026-05-19T10:00:00Z").getTime(), y: 60.0, rating: "Greed" },  // 이전 값
          { x: new Date("2026-05-19T16:00:00Z").getTime(), y: 63.5, rating: "Greed" },  // 마지막 값 → 유지
          { x: new Date("2026-05-18").getTime(),            y: 58.0, rating: "Neutral" },
        ],
      },
    } : {}),
    ...(opts.hasComponents ? {
      market_momentum_sp500: componentData,
      stock_price_strength:  componentData,
      stock_price_breadth:   componentData,
      put_call_options:      componentData,
      junk_bond_demand:      componentData,
      market_volatility_vix: componentData,
      safe_haven_demand:     componentData,
    } : {}),
  };
}

// ── 헬퍼: Puppeteer 목 페이지 초기화 ──────────────────────────────────────────
// page.evaluate()가 API 응답을 반환하도록 설정

function setupPuppeteerMock(
  apiResponse: unknown,
  opts: { evaluateThrows?: boolean } = {}
) {
  mockPageGoto.mockResolvedValue(undefined);

  if (opts.evaluateThrows) {
    mockPageEvaluate.mockRejectedValue(new Error("fetch failed from browser context"));
  } else {
    mockPageEvaluate.mockResolvedValue(apiResponse);
  }

  mockNewPage.mockResolvedValue({
    setRequestInterception: mockPageSetRequestInterception,
    on:       vi.fn(),  // request 핸들러 등록용 (TC14에서 별도 오버라이드)
    goto:     mockPageGoto,
    evaluate: mockPageEvaluate,
  });

  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close:   mockBrowserClose,
  });
}

// ── 날짜 헬퍼 ─────────────────────────────────────────────────────────────────

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
}

// ── TC01~04: isUpdatedToday() 간접 검증 (main() 통해) ─────────────────────────

describe("isUpdatedToday() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
  });

  it("TC01 - 오늘 날짜 파일 존재 → main() 스킵 (puppeteer 미호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: new Date().toISOString() })
    );
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("TC02 - 어제 날짜 파일 → 업데이트 실행 (puppeteer 호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: `${yesterdayStr()}T00:00:00.000Z` })
    );
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("TC03 - 파일 없음(throw) → false → 업데이트 실행", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("TC04 - updated_at 없음 → false → 업데이트 실행", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ score: 72 }));
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
  });
});

// ── TC05~07: getExecutablePath() 간접 검증 (puppeteer.launch 인수 통해) ────────

describe("getExecutablePath() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    delete process.env["PUPPETEER_EXECUTABLE_PATH"];
    delete process.env["CI"];
  });

  afterEach(() => {
    delete process.env["PUPPETEER_EXECUTABLE_PATH"];
    delete process.env["CI"];
  });

  it("TC05 - PUPPETEER_EXECUTABLE_PATH 설정 → launch에 해당 경로 전달", async () => {
    process.env["PUPPETEER_EXECUTABLE_PATH"] = "/opt/chromium/chrome";
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/opt/chromium/chrome" })
    );
  });

  it("TC06 - CI=true → launch에 /usr/bin/google-chrome 전달", async () => {
    process.env["CI"] = "true";
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/usr/bin/google-chrome" })
    );
  });

  it("TC07 - 환경변수 미설정 → launch에 executablePath=undefined 전달", async () => {
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: undefined })
    );
  });
});

// ── TC08~09: buildJson() 간접 검증 ───────────────────────────────────────────
// buildJson은 export 되지 않으므로 main() → saveJson(buildJson(raw)) 경로로 간접 검증
// writeFileSync에 전달된 JSON 내용을 파싱하여 검증

describe("buildJson() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
  });

  it("TC08 - 히스토리 없음 → historical 빈 배열", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasHistorical: false }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.historical).toEqual([]);
    expect(written.score).toBe(72.5);
    expect(written.rating).toBe("Greed");
  });

  it("TC09 - 히스토리 있음 → 오름차순 정렬 + 날짜 변환", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasHistorical: true }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.historical).toHaveLength(3);
    const dates = written.historical.map((h: { date: string }) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(written.historical[0]!.score).toBe(65);
  });

  it("TC16 - 같은 날짜 중복 항목 → 마지막 값(timestamp 최대)만 유지", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasDuplicates: true }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    // 2026-05-19 중복 2건 → 1건으로 dedup, 총 2건
    expect(written.historical).toHaveLength(2);
    const may19 = written.historical.find((h: { date: string }) => h.date === "2026-05-19");
    expect(may19).toBeDefined();
    // 16:00 항목(63.5)이 10:00 항목(60.0)을 덮어써야 함
    expect(may19!.score).toBe(63.5);
  });

  it("TC17 - 컴포넌트 있음 → components 7개 필드 추출", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasComponents: true }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    const keys = ["market_momentum", "stock_strength", "stock_breadth", "put_call", "junk_bond", "market_volatility", "safe_haven"];
    expect(Object.keys(written.components)).toEqual(keys);
    // 모든 컴포넌트가 score=65, rating="Greed" 로 추출되어야 함
    for (const key of keys) {
      expect(written.components[key].score).toBe(65);
      expect(written.components[key].rating).toBe("Greed");
    }
  });

  it("TC17b - 컴포넌트 없음 → score:null, rating:\"unknown\" 폴백", async () => {
    setupPuppeteerMock(makeCnnResponse());   // hasComponents 생략 → 컴포넌트 키 없음
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    const keys = ["market_momentum", "stock_strength", "stock_breadth", "put_call", "junk_bond", "market_volatility", "safe_haven"];
    for (const key of keys) {
      expect(written.components[key].score).toBeNull();
      expect(written.components[key].rating).toBe("unknown");
    }
  });
});

// ── TC10~15: main() 시나리오 ─────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC10 - 오늘 업데이트 + no --force → 스킵 (writeFileSync 미호출)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("TC11 - 정상 경로 → writeFileSync + renameSync 호출", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockRenameSync).toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("TC12 - API 응답에 score 없음 → process.exit(1)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse({ noScore: true }));
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 3000 });
    mockExit.mockRestore();
  });

  it("TC13 - --force 플래그 → 오늘 업데이트여도 fetch 실행", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    setupPuppeteerMock(makeCnnResponse());
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    expect(mockLaunch).toHaveBeenCalled();
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 3000 });
    process.argv = ["node", "script.ts"];
  });

  it("TC14 - request 인터셉트: image → abort, xhr → continue", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

    let reqHandler: ((req: unknown) => void) | undefined;
    const mockPageOn = vi.fn().mockImplementation((event: string, handler: unknown) => {
      if (event === "request") reqHandler = handler as (req: unknown) => void;
    });

    mockPageGoto.mockImplementation(async () => {
      // 다양한 요청 타입으로 핸들러 호출
      const makeReq = (type: string) => ({
        resourceType: () => type,
        abort:    mockAbort,
        continue: mockContinue,
      });
      if (reqHandler) {
        reqHandler(makeReq("image"));   // → abort
        reqHandler(makeReq("font"));    // → abort
        reqHandler(makeReq("media"));   // → abort
        reqHandler(makeReq("xhr"));     // → continue
        reqHandler(makeReq("script"));  // → continue
      }
    });

    mockPageEvaluate.mockResolvedValue(makeCnnResponse());

    mockNewPage.mockResolvedValue({
      setRequestInterception: mockPageSetRequestInterception,
      on:       mockPageOn,
      goto:     mockPageGoto,
      evaluate: mockPageEvaluate,
    });
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });

    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockAbort).toHaveBeenCalled(), { timeout: 3000 });

    expect(mockAbort).toHaveBeenCalledTimes(3);     // image, font, media
    expect(mockContinue).toHaveBeenCalledTimes(2);  // xhr, script
  });

  it("TC15 - page.evaluate 실패(네트워크 오류) → process.exit(1)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(null, { evaluateThrows: true });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.resetModules();
    await import("../fetch/update_fear_and_greed.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 3000 });
    mockExit.mockRestore();
  });
});
