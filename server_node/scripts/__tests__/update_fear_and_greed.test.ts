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
 *   TC12  main()               - API 응답 score 없음 → Error throw
 *   TC13  main()               - --force 플래그 → 오늘 업데이트여도 실행
 *   TC14  main()               - request 인터셉트: image → abort, other → continue
 *   TC15  main()               - page.evaluate 실패(네트워크 오류) → Error throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "../fetch/update_fear_and_greed.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockRenameSync,
  mockAbort, mockContinue,
  mockPageSetRequestInterception, mockPageGoto, mockPageEvaluate,
  mockBrowserClose, mockNewPage, mockLaunch,
} = vi.hoisted(() => ({
  mockReadFileSync:  vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync:     vi.fn(),
  mockRenameSync:    vi.fn(),
  mockAbort:         vi.fn(),
  mockContinue:      vi.fn(),
  mockPageSetRequestInterception: vi.fn().mockResolvedValue(undefined),
  mockPageGoto:      vi.fn().mockResolvedValue(undefined),
  mockPageEvaluate:  vi.fn(),
  mockBrowserClose:  vi.fn().mockResolvedValue(undefined),
  mockNewPage:       vi.fn(),
  mockLaunch:        vi.fn(),
}));

// ── fs 모킹 ──────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
  },
}));

// ── Puppeteer 모킹 ────────────────────────────────────────────────────────────

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
          { x: new Date("2026-05-18").getTime(), y: 68.0, rating: "Greed" },
        ],
      },
    } : {}),
    ...(opts.hasDuplicates ? {
      fear_and_greed_historical: {
        data: [
          { x: new Date("2026-05-19T10:00:00Z").getTime(), y: 60.0, rating: "Greed" },
          { x: new Date("2026-05-19T16:00:00Z").getTime(), y: 63.5, rating: "Greed" },
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

// ── 헬퍼: Puppeteer 목 페이지 초기화 ─────────────────────────────────────────

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
    on:       vi.fn(),
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

// ── TC01~04: isUpdatedToday() 간접 검증 (main() 통해) ────────────────────────

describe("isUpdatedToday() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
  });

  it("TC01 - 오늘 날짜 파일 존재 → main() 스킵 (puppeteer 미호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: new Date().toISOString() })
    );
    await main();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("TC02 - 어제 날짜 파일 → 업데이트 실행 (puppeteer 호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: `${yesterdayStr()}T00:00:00.000Z` })
    );
    setupPuppeteerMock(makeCnnResponse());
    await main();
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("TC03 - 파일 없음(throw) → false → 업데이트 실행", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    await main();
    expect(mockLaunch).toHaveBeenCalled();
  });

  it("TC04 - updated_at 없음 → false → 업데이트 실행", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ score: 72 }));
    setupPuppeteerMock(makeCnnResponse());
    await main();
    expect(mockLaunch).toHaveBeenCalled();
  });
});

// ── TC05~07: getExecutablePath() 간접 검증 (puppeteer.launch 인수 통해) ───────

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
    await main();
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/opt/chromium/chrome" })
    );
  });

  it("TC06 - CI=true → launch에 /usr/bin/google-chrome 전달", async () => {
    process.env["CI"] = "true";
    await main();
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/usr/bin/google-chrome" })
    );
  });

  it("TC07 - 환경변수 미설정 → launch에 executablePath=undefined 전달", async () => {
    await main();
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: undefined })
    );
  });
});

// ── TC08~09·TC16·TC17: buildJson() 간접 검증 ────────────────────────────────

describe("buildJson() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
  });

  it("TC08 - 히스토리 없음 → historical 빈 배열", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasHistorical: false }));
    await main();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.historical).toEqual([]);
    expect(written.score).toBe(72.5);
    expect(written.rating).toBe("Greed");
  });

  it("TC09 - 히스토리 있음 → 오름차순 정렬 + 날짜 변환", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasHistorical: true }));
    await main();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.historical).toHaveLength(3);
    const dates = written.historical.map((h: { date: string }) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(written.historical[0]!.score).toBe(65);
  });

  it("TC16 - 같은 날짜 중복 항목 → 마지막 값(timestamp 최대)만 유지", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasDuplicates: true }));
    await main();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.historical).toHaveLength(2);
    const may19 = written.historical.find((h: { date: string }) => h.date === "2026-05-19");
    expect(may19).toBeDefined();
    expect(may19!.score).toBe(63.5);
  });

  it("TC17 - 컴포넌트 있음 → components 7개 필드 추출", async () => {
    setupPuppeteerMock(makeCnnResponse({ hasComponents: true }));
    await main();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    const keys = ["market_momentum", "stock_strength", "stock_breadth", "put_call", "junk_bond", "market_volatility", "safe_haven"];
    expect(Object.keys(written.components)).toEqual(keys);
    for (const key of keys) {
      expect(written.components[key].score).toBe(65);
      expect(written.components[key].rating).toBe("Greed");
    }
  });

  it("TC17b - 컴포넌트 없음 → score:null, rating:\"unknown\" 폴백", async () => {
    setupPuppeteerMock(makeCnnResponse());
    await main();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    const keys = ["market_momentum", "stock_strength", "stock_breadth", "put_call", "junk_bond", "market_volatility", "safe_haven"];
    for (const key of keys) {
      expect(written.components[key].score).toBeNull();
      expect(written.components[key].rating).toBe("unknown");
    }
  });
});

// ── TC10~15: main() 시나리오 ─────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC10 - 오늘 업데이트 + no --force → 스킵 (writeFileSync 미호출)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    await main();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("TC11 - 정상 경로 → writeFileSync + renameSync 호출", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse());
    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockRenameSync).toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("TC12 - API 응답에 score 없음 → Error throw", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(makeCnnResponse({ noScore: true }));
    await expect(main()).rejects.toThrow();
  });

  it("TC13 - --force 플래그 → 오늘 업데이트여도 fetch 실행", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    setupPuppeteerMock(makeCnnResponse());
    await main();
    expect(mockLaunch).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
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
      const makeReq = (type: string) => ({
        resourceType: () => type,
        abort:    mockAbort,
        continue: mockContinue,
      });
      if (reqHandler) {
        reqHandler(makeReq("image"));
        reqHandler(makeReq("font"));
        reqHandler(makeReq("media"));
        reqHandler(makeReq("xhr"));
        reqHandler(makeReq("script"));
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

    await main();
    expect(mockAbort).toHaveBeenCalledTimes(3);
    expect(mockContinue).toHaveBeenCalledTimes(2);
  });

  it("TC15 - page.evaluate 실패(네트워크 오류) → Error throw", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    setupPuppeteerMock(null, { evaluateThrows: true });
    await expect(main()).rejects.toThrow();
  });
});
