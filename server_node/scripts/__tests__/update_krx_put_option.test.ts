/**
 * update_krx_put_option.ts 테스트
 *
 * TC 계획:
 *   TC01  isUpdatedToday()      - 오늘 날짜 파일 존재 시 main() 스킵 (puppeteer 미호출)
 *   TC02  isUpdatedToday()      - 어제 날짜 파일 존재 시 main() 스크래퍼 실행 (puppeteer 호출)
 *   TC03  isUpdatedToday()      - 파일 없음(ENOENT) 시 main() 스크래퍼 실행 (puppeteer 호출)
 *   TC04  main()                - 오늘 날짜여도 --force 플래그 있으면 스크래퍼 강제 실행
 *   TC05  main()                - 정상 동작 시 CSV 파싱을 거쳐 최종 JSON DB가 원자적으로 저장됨 (tmp -> json)
 *   TC06  main()                - CSV 헤더가 없거나 망가진 경우 process.exit(1) 오류 처리
 *   TC07  main()                - 스크래퍼 내부 예외 발생 시 스크린샷 시도 및 process.exit(1) 처리
 *   TC08  isUpdatedToday()      - JSON 파일에 updated_at 필드 없음 → false 반환 → 스크래퍼 실행
 *   TC09  getExecutablePath()   - PUPPETEER_EXECUTABLE_PATH 환경변수 → 해당 경로로 크롬 실행
 *   TC10  getExecutablePath()   - CI 환경변수 → /usr/bin/google-chrome 경로 사용
 *   TC11  getExecutablePath()   - Windows x86 크롬 경로만 존재 → 해당 경로 반환
 *   TC12  runScraper()          - KRX_ID/KRX_PW 환경변수 없음 → Error throw → process.exit(1)
 *   TC13  runScraper()          - console 핸들러 nppfs/NPPFS 포함 메시지 억제, 일반 메시지만 로그
 *   TC14  main()                - --debug 플래그 → 로그인·타겟 페이지 스크린샷 시도
 *   TC15  runScraper()          - 중복 세션 팝업 미감지(dupChecked=false) → else 분기 실행
 *   TC16  runScraper()          - hasDupModal evaluate 중 'destroyed' 에러 → 루프 즉시 break
 *   TC17  runScraper()          - URL이 login.jsp에 유지되면 loggedIn=false → 경고 로그 후 계속
 *   TC18  runScraper()          - popupVisible=true → 이용약관 자동 동의 처리 후 계속
 *   TC19  runScraper()          - URL에 MDCCOMS002 포함 → 동의 페이지 리다이렉트 자동 처리
 *   TC20  runScraper()          - JSESSIONID 외 쿠키 혼재 / JSESSIONID 없음 → 경고 로그
 *   TC21  runScraper()          - OTP 발급 1회 실패 → 재시도 후 성공
 *   TC22  runScraper()          - OTP 발급 3회 연속 실패 → throw → process.exit(1)
 *   TC23  parseAndSave()        - CSV 유효 라인 1줄 이하 → 파싱 에러 → process.exit(1)
 *   TC24  parseAndSave()        - 헤더 이전 메타 라인 존재 → 헤더 탐색 성공 후 정상 저장
 *   TC25  parseAndSave()        - row 날짜 셀 빈 문자열 → 해당 행 skip 후 정상 저장
 *   TC26  parseAndSave()        - rawDate 길이 8 아님 → 해당 행 skip 후 정상 저장
 *   TC27  parseAndSave()        - parseNum 빈 문자열 입력 → 0 반환
 *   TC28  parseAndSave()        - 유효 데이터 행 없음(historical=[]) → latest:null 로 저장
 *   TC29  main()                - Error 아닌 타입 throw → String() 변환 후 process.exit(1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import iconv from "iconv-lite";
import { main } from "../fetch/update_krx_put_option.ts";

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();
const mockRenameSync    = vi.fn();
const mockExistsSync    = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
    existsSync:    (...a: unknown[]) => mockExistsSync(...a),
  },
}));

// ── puppeteer 모킹 ─────────────────────────────────────────────────────────────

const mockCDPSend        = vi.fn();
const mockPageScreenshot = vi.fn();
const mockPageGoto       = vi.fn();
const mockPageClick      = vi.fn();
const mockPageType       = vi.fn();
const mockPageEvaluate   = vi.fn();
// per-test 제어가 필요한 page 메서드들
const mockPageUrl        = vi.fn();
const mockPageCookies    = vi.fn();
const mockPageOn         = vi.fn();
// puppeteer.launch 인수 검증용
const mockLaunch         = vi.fn();

const mockPage = {
  createCDPSession: async () => ({ send: mockCDPSend }),
  on:               mockPageOn,
  setUserAgent:     vi.fn(),
  evaluateOnNewDocument: vi.fn(),
  goto:             mockPageGoto,
  click:            mockPageClick,
  type:             mockPageType,
  evaluate:         mockPageEvaluate,
  url:              mockPageUrl,
  cookies:          mockPageCookies,
  screenshot:       mockPageScreenshot,
};

const mockBrowser = {
  defaultBrowserContext: () => ({ overridePermissions: vi.fn() }),
  newPage: async () => mockPage,
  close:   vi.fn(),
};

vi.mock("puppeteer", () => ({
  default: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

// ── 상수 & 헬퍼 ────────────────────────────────────────────────────────────────

/** 성공 URL – login.jsp/MDCCOMS002 미포함 → loggedIn=true */
const SUCCESS_URL =
  "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201050302";

const WIN_CHROME_X86 =
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

/** 기본 샘플 CSV (EUC-KR 인코딩 전 원문) */
const SAMPLE_CSV =
  '"일자","기관 합계","개인","외국인 합계","전체"\n' +
  '"2026/05/21","0.0","275.0","-299.0","0.0"';

/** CSV 문자열을 EUC-KR 바이트 배열로 변환하는 헬퍼 */
function makeCsvBytes(content: string = SAMPLE_CSV): number[] {
  return Array.from(iconv.encode(content, "euc-kr"));
}

/**
 * dupChecked=false 경로(hasDupModal 8회 false)로 정상 실행되는
 * page.evaluate() 시퀀스를 설정한다.
 *
 * 시퀀스:
 *   1~4  : performLoginSubmission 내부 evaluate (mbrId clear, pw clone, blur, jQuery click)
 *   5~12 : hasDupModal 감지 루프 8회 → 전부 false (dupChecked=false)
 *   13   : popupDiagnosis → { popupVisible: false }
 *   14+  : OTP/CSV 다운로드 → csvBytes
 */
function setupNormalEvaluate(csvBytes: number[] = makeCsvBytes()): void {
  mockPageEvaluate
    .mockResolvedValueOnce(undefined)   // 1: mbrId input clear
    .mockResolvedValueOnce(undefined)   // 2: pw 노드 클론(nProtect 우회)
    .mockResolvedValueOnce(undefined)   // 3: pw blur 이벤트
    .mockResolvedValueOnce(undefined)   // 4: jQuery 로그인 버튼 클릭
    .mockResolvedValueOnce(false)       // 5~12: hasDupModal 루프 8회 (전부 false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce({ popupVisible: false })  // 13: 팝업 진단
    .mockResolvedValue(csvBytes);                    // 14+: OTP/CSV
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("update_krx_put_option", () => {
  vi.setConfig({ testTimeout: 50000 });
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalSetTimeout: typeof global.setTimeout;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
    process.env.KRX_ID = "test-id";
    process.env.KRX_PW = "test-pw";

    originalSetTimeout = global.setTimeout;
    // @ts-ignore
    global.setTimeout = (fn: (...args: any[]) => void, _ms?: number, ...args: any[]) =>
      originalSetTimeout(fn, 0, ...args);

    vi.clearAllMocks();

    // ── 기본 모크 동작 ──────────────────────────────────────────
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockPageGoto.mockResolvedValue(null);
    mockPageClick.mockResolvedValue(null);
    mockPageType.mockResolvedValue(null);
    mockCDPSend.mockResolvedValue({});
    mockPageScreenshot.mockResolvedValue(Buffer.from([]));
    mockLaunch.mockResolvedValue(mockBrowser);
    mockPageUrl.mockReturnValue(SUCCESS_URL);
    mockPageCookies.mockResolvedValue([{ name: "JSESSIONID", value: "mock-session" }]);
    mockPageOn.mockImplementation(() => {});
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    exitSpy.mockRestore();

    const forceIdx = process.argv.indexOf("--force");
    if (forceIdx !== -1) process.argv.splice(forceIdx, 1);
    const debugIdx = process.argv.indexOf("--debug");
    if (debugIdx !== -1) process.argv.splice(debugIdx, 1);

    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.CI;
  });

  // ─────────────────────────────────────────────────────────────
  // TC01~TC07  기존 테스트
  // ─────────────────────────────────────────────────────────────

  it("TC01 오늘 날짜 updated_at 데이터가 있으면 스크래퍼가 실행되지 않는다", async () => {
    const today = new Date().toISOString();
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));

    await main();

    expect(mockPageGoto).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("TC02 어제 날짜 updated_at 데이터가 있으면 스크래퍼가 실행된다", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: yesterday }));
    mockPageEvaluate.mockResolvedValue(makeCsvBytes());

    await main();

    expect(mockPageGoto).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC03 저장된 JSON 파일이 아예 존재하지 않으면 스크래퍼가 정상 실행된다", async () => {
    mockExistsSync.mockReturnValue(false);
    mockPageEvaluate.mockResolvedValue(makeCsvBytes());

    await main();

    expect(mockPageGoto).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC04 오늘 수집 완료되었더라도 --force 플래그가 전달되면 강제 재수집한다", async () => {
    const today = new Date().toISOString();
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));
    process.argv.push("--force");
    mockPageEvaluate.mockResolvedValue(makeCsvBytes());

    await main();

    expect(mockPageGoto).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC05 다운로드 성공 시 CSV 데이터가 정상적으로 가공되어 JSON 파일로 원자적 저장된다", async () => {
    mockExistsSync.mockReturnValue(false);

    const csvContent =
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      '"2026/05/21","0.0","275.0","-299.0","0.0"\n' +
      '"2026/05/20","-4867.0","-1568.0","6585.0","0.0"';
    mockPageEvaluate.mockResolvedValue(makeCsvBytes(csvContent));

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockRenameSync).toHaveBeenCalled();

    const [savedPath, savedContent] = mockWriteFileSync.mock.calls[0];
    expect(savedPath).toContain("krx_put_option.json.tmp");

    const data = JSON.parse(savedContent);
    expect(data.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.latest).toEqual({
      date: "2026-05-21",
      retail: 275,
      foreigner: -299,
      institution: 0,
    });
    expect(data.historical).toHaveLength(2);
    expect(data.historical[0]).toEqual({
      date: "2026-05-20",
      retail: -1568,
      foreigner: 6585,
      institution: -4867,
    });
  });

  it("TC06 CSV 헤더가 훼손되었거나 매핑되지 않는 경우 에러 메시지와 함께 process.exit(1)로 비정상 종료된다", async () => {
    mockExistsSync.mockReturnValue(false);
    const badCsv = '"날짜","기관","개인","외국인"\n"2026/05/21","0.0","275.0","-299.0"';
    mockPageEvaluate.mockResolvedValue(makeCsvBytes(badCsv));

    await main();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("TC07 크롤러 동작 중 브라우저 에러 등 예외 발생 시 에러 스크린샷을 찍고 process.exit(1) 종료한다", async () => {
    mockExistsSync.mockReturnValue(false);
    mockPageGoto.mockRejectedValue(new Error("Browser disconnected unexpectedly"));

    await main();

    expect(mockPageScreenshot).toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ─────────────────────────────────────────────────────────────
  // TC08  isUpdatedToday() – updated_at 필드 없음
  // ─────────────────────────────────────────────────────────────

  it("TC08 JSON 파일에 updated_at 필드가 없으면 isUpdatedToday()가 false를 반환해 스크래퍼를 실행한다", async () => {
    // updated_at 키가 아예 없는 JSON
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({}));

    setupNormalEvaluate();
    await main();

    expect(mockPageGoto).toHaveBeenCalled();   // 스크래퍼 실행 확인
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC09~TC11  getExecutablePath() 브랜치
  // ─────────────────────────────────────────────────────────────

  it("TC09 PUPPETEER_EXECUTABLE_PATH 환경변수가 설정되어 있으면 해당 경로로 크롬을 실행한다", async () => {
    const customPath = "/opt/custom/chrome";
    process.env.PUPPETEER_EXECUTABLE_PATH = customPath;
    mockExistsSync.mockReturnValue(false);
    setupNormalEvaluate();

    await main();

    const launchOpts = mockLaunch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(launchOpts?.executablePath).toBe(customPath);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("TC10 CI 환경변수가 설정되어 있으면 /usr/bin/google-chrome 경로로 크롬을 실행한다", async () => {
    process.env.CI = "true";
    mockExistsSync.mockReturnValue(false);
    setupNormalEvaluate();

    await main();

    const launchOpts = mockLaunch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(launchOpts?.executablePath).toBe("/usr/bin/google-chrome");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("TC11 Windows 기본 크롬 경로가 없고 x86 경로만 존재하면 x86 경로를 실행 경로로 사용한다", async () => {
    // winChromeDefault → false, winChromeX86 → true, OUTPUT 파일 → false(스크래퍼 실행)
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.includes("Program Files (x86)")) return true;
      if (s.includes("Program Files\\Google")) return false;
      return false;
    });
    setupNormalEvaluate();

    await main();

    const launchOpts = mockLaunch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(launchOpts?.executablePath).toBe(WIN_CHROME_X86);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC12  KRX 자격증명 누락
  // ─────────────────────────────────────────────────────────────

  it("TC12 KRX_ID 또는 KRX_PW 환경변수가 없으면 에러를 발생시키고 process.exit(1)로 종료한다", async () => {
    delete process.env.KRX_ID;
    mockExistsSync.mockReturnValue(false);

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockPageGoto).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC13  console 핸들러 nppfs 필터
  // ─────────────────────────────────────────────────────────────

  it("TC13 console 핸들러는 nppfs/NPPFS 포함 메시지를 억제하고 일반 메시지만 로그한다", async () => {
    mockExistsSync.mockReturnValue(false);

    // page.on('console', handler) 등록 시 핸들러를 즉시 발동시켜 필터 분기를 커버
    mockPageOn.mockImplementation((event: string, handler: Function) => {
      if (event === "console") {
        handler({ text: () => "nppfs: nProtect 필터링 대상" });    // 억제돼야 함
        handler({ text: () => "NPPFS: 대문자도 필터링 대상" });    // 억제돼야 함
        handler({ text: () => "일반 브라우저 로그 메시지" });       // 로그돼야 함
      }
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setupNormalEvaluate();
    await main();

    const logged = consoleSpy.mock.calls.map(c => String(c[0] ?? ""));
    const browserLogs = logged.filter(m => m.includes("[브라우저 로그]"));

    // 일반 메시지만 로그됨
    expect(browserLogs).toHaveLength(1);
    expect(browserLogs[0]).toContain("일반 브라우저 로그 메시지");
    // nppfs/NPPFS 메시지는 로그에 없어야 함
    expect(browserLogs.some(m => m.includes("nppfs"))).toBe(false);
    expect(browserLogs.some(m => m.includes("NPPFS"))).toBe(false);

    consoleSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // TC14  --debug 플래그 → 스크린샷 시도
  // ─────────────────────────────────────────────────────────────

  it("TC14 --debug 플래그가 있으면 로그인 · 타겟 페이지 등 핵심 단계에서 스크린샷을 시도한다", async () => {
    mockExistsSync.mockReturnValue(false);
    process.argv.push("--debug");
    setupNormalEvaluate();

    await main();

    // debugMode=true 경로의 screenshot 호출: 로그인 입력 후 + 로그인 완료 후 + 타겟 페이지 = 최소 2회
    expect(mockPageScreenshot.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC15  dupChecked=false (else 분기)
  // ─────────────────────────────────────────────────────────────

  it("TC15 중복 세션 팝업이 감지되지 않으면 dupChecked=false로 else 경로(3초 대기)를 실행한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // setupNormalEvaluate는 hasDupModal 8회 false → dupChecked=false → else 분기
    setupNormalEvaluate();

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    // 2차 로그인이 없었으므로 launch는 1회
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────
  // TC16  hasDupModal evaluate – 'destroyed' 에러 → break
  // ─────────────────────────────────────────────────────────────

  it("TC16 hasDupModal 감지 루프 중 destroyed 에러가 발생하면 루프를 즉시 break하고 계속 진행한다", async () => {
    mockExistsSync.mockReturnValue(false);
    const csvBytes = makeCsvBytes();

    mockPageEvaluate
      .mockResolvedValueOnce(undefined)                                // 1: mbrId clear
      .mockResolvedValueOnce(undefined)                                // 2: pw clone
      .mockResolvedValueOnce(undefined)                                // 3: blur
      .mockResolvedValueOnce(undefined)                                // 4: jQuery click
      .mockRejectedValueOnce(new Error("Session destroyed"))           // 5: destroyed → break
      .mockResolvedValueOnce({ popupVisible: false })                  // 6: popupDiagnosis
      .mockResolvedValue(csvBytes);                                    // 7+: OTP/CSV

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC17  loggedIn=false (login.jsp 유지)
  // ─────────────────────────────────────────────────────────────

  it("TC17 30번 URL 체크 후에도 login.jsp에 남아있으면 loggedIn=false로 경고 로그를 남기고 계속 진행한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // 모든 url() 호출에 login.jsp 반환 → loggedIn=false
    mockPageUrl.mockReturnValue("https://data.krx.co.kr/login.jsp");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const csvBytes = makeCsvBytes();

    mockPageEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ popupVisible: false })
      .mockResolvedValue(csvBytes);

    await main();

    const logs = consoleSpy.mock.calls.map(c => String(c[0] ?? ""));
    expect(logs.some(m => m.includes("⚠️") && m.includes("아직 로그인 페이지"))).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // TC18  popupVisible=true → 이용약관 자동 동의
  // ─────────────────────────────────────────────────────────────

  it("TC18 이용약관 동의 팝업이 노출되면 자동 동의 절차 evaluate를 추가 호출하고 계속 진행한다", async () => {
    mockExistsSync.mockReturnValue(false);
    const csvBytes = makeCsvBytes();

    mockPageEvaluate
      .mockResolvedValueOnce(undefined)                  // 1~4: 1차 로그인
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(false)                      // 5~12: hasDupModal 8회 false
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ popupVisible: true })     // 13: 팝업 노출!
      .mockResolvedValueOnce(undefined)                  // 14: 팝업 동의 처리 evaluate
      .mockResolvedValue(csvBytes);                      // 15+: OTP/CSV

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    // 팝업 처리 evaluate(14번째)가 포함되어 최소 15회 호출
    expect(mockPageEvaluate.mock.calls.length).toBeGreaterThanOrEqual(15);
  });

  // ─────────────────────────────────────────────────────────────
  // TC19  MDCCOMS002 동의 페이지 리다이렉트 처리
  // ─────────────────────────────────────────────────────────────

  it("TC19 URL에 MDCCOMS002가 포함되면 동의 페이지 리다이렉트로 판단해 자동 동의 evaluate를 실행한다", async () => {
    mockExistsSync.mockReturnValue(false);

    // loggedIn 루프(1회): SUCCESS_URL → loggedIn=true
    // 이후 MDCCOMS002 체크: MDCCOMS002 URL 반환
    mockPageUrl
      .mockReturnValueOnce(SUCCESS_URL)
      .mockReturnValue("https://data.krx.co.kr/MDCCOMS002_S1.cmd");

    const csvBytes = makeCsvBytes();
    mockPageEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ popupVisible: false })    // 13: popupDiagnosis
      .mockResolvedValueOnce(undefined)                  // 14: MDCCOMS002 동의 처리 evaluate
      .mockResolvedValue(csvBytes);                      // 15+: OTP/CSV

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    // MDCCOMS002 동의 evaluate가 추가로 호출됐어야 함
    expect(mockPageEvaluate.mock.calls.length).toBeGreaterThanOrEqual(15);
  });

  // ─────────────────────────────────────────────────────────────
  // TC20  JSESSIONID 외 쿠키 혼재 / JSESSIONID 없음
  // ─────────────────────────────────────────────────────────────

  it("TC20 JSESSIONID 외 쿠키가 포함되거나 없으면 미확보 경고 로그를 남기고 OTP 발급을 계속 시도한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // OTHER 쿠키만 → cookies.some() 콜백 false 분기 실행(L368 br=0) + jsessionExists=false
    mockPageCookies.mockResolvedValue([{ name: "OTHER_COOKIE", value: "xyz" }]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setupNormalEvaluate();
    await main();

    const logs = consoleSpy.mock.calls.map(c => String(c[0] ?? ""));
    expect(logs.some(m => m.includes("❌ 실패"))).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // TC21  OTP 1회 실패 → 재시도 성공
  // ─────────────────────────────────────────────────────────────

  it("TC21 OTP 발급이 1회 실패 후 2번째 시도에서 성공하면 재시도 후 정상 저장된다", async () => {
    mockExistsSync.mockReturnValue(false);
    const csvBytes = makeCsvBytes();

    mockPageEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ popupVisible: false })
      .mockRejectedValueOnce(new Error("GenerateOTP HTTP 500")) // 1차 OTP 실패
      .mockResolvedValue(csvBytes);                             // 2차 OTP 성공

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC22  OTP 3회 연속 실패 → process.exit(1)
  // ─────────────────────────────────────────────────────────────

  it("TC22 OTP 발급이 3회 연속 실패하면 에러를 throw하고 process.exit(1)로 종료한다", async () => {
    mockExistsSync.mockReturnValue(false);

    mockPageEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ popupVisible: false })
      .mockRejectedValueOnce(new Error("OTP 실패 1차"))
      .mockRejectedValueOnce(new Error("OTP 실패 2차"))
      .mockRejectedValueOnce(new Error("OTP 실패 3차"));

    await main();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ─────────────────────────────────────────────────────────────
  // TC23  parseAndSave() – CSV 라인 1줄 이하
  // ─────────────────────────────────────────────────────────────

  it("TC23 CSV 유효 데이터 라인이 1줄 이하이면 파싱 에러 → process.exit(1)로 종료한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // 헤더만 1줄 → split/filter 후 lines.length = 1 < 2 → throw
    const singleLine = '"일자","개인","외국인","기관"';
    mockPageEvaluate.mockResolvedValue(makeCsvBytes(singleLine));

    await main();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ─────────────────────────────────────────────────────────────
  // TC24  parseAndSave() – 헤더 이전 메타 라인 존재 (L502 br=0)
  // ─────────────────────────────────────────────────────────────

  it("TC24 CSV 헤더 이전에 메타 라인이 있어도 '일자' 포함 행을 찾아 정상 파싱한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // 첫 줄이 메타 정보(L502 br=0 커버) → 두 번째 줄에 실제 헤더
    const csvWithMeta =
      '"메타데이터","버전","1.0"\n' +
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      '"2026/05/21","0.0","100.0","-50.0","0.0"';

    setupNormalEvaluate(makeCsvBytes(csvWithMeta));
    await main();

    const [, savedContent] = mockWriteFileSync.mock.calls[0];
    const data = JSON.parse(savedContent);
    expect(data.historical).toHaveLength(1);
    expect(data.historical[0]?.date).toBe("2026-05-21");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC25  parseAndSave() – row 날짜 셀 빈 문자열 → skip (L528 br=0)
  // ─────────────────────────────────────────────────────────────

  it("TC25 날짜 셀이 빈 문자열인 행은 skip되고 유효한 행만 historical에 추가된다", async () => {
    mockExistsSync.mockReturnValue(false);
    // 첫 번째 데이터 행의 날짜 셀이 빈 문자열(L528 br=0 커버)
    const csv =
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      ',"0.0","100.0","-50.0","0.0"\n' +           // 날짜 빈 → skip
      '"2026/05/21","0.0","275.0","-299.0","0.0"';

    setupNormalEvaluate(makeCsvBytes(csv));
    await main();

    const [, savedContent] = mockWriteFileSync.mock.calls[0];
    const data = JSON.parse(savedContent);
    expect(data.historical).toHaveLength(1);
    expect(data.historical[0]?.date).toBe("2026-05-21");
  });

  // ─────────────────────────────────────────────────────────────
  // TC26  parseAndSave() – rawDate 길이 8 아님 → skip (L536 br=0)
  // ─────────────────────────────────────────────────────────────

  it("TC26 날짜 문자열을 정규화하면 8자리가 아닌 행은 skip되고 유효한 행만 저장된다", async () => {
    mockExistsSync.mockReturnValue(false);
    // 'YYYY/MM' 형식 → 구분자 제거 후 6자리 → length !== 8 (L536 br=0 커버)
    const csv =
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      '"2026/05","0.0","100.0","-50.0","0.0"\n' +  // rawDate="202605"(6자리) → skip
      '"2026/05/21","0.0","275.0","-299.0","0.0"';

    setupNormalEvaluate(makeCsvBytes(csv));
    await main();

    const [, savedContent] = mockWriteFileSync.mock.calls[0];
    const data = JSON.parse(savedContent);
    expect(data.historical).toHaveLength(1);
    expect(data.historical[0]?.date).toBe("2026-05-21");
  });

  // ─────────────────────────────────────────────────────────────
  // TC27  parseAndSave() – parseNum 빈 문자열 → 0 (L539 br=0)
  // ─────────────────────────────────────────────────────────────

  it("TC27 parseNum에 빈 문자열이 전달되면 0을 반환한다 (기관 합계 셀이 빈 경우)", async () => {
    mockExistsSync.mockReturnValue(false);
    // 기관 합계(institution) 셀이 빈 문자열 (L539 br=0 커버)
    const csv =
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      '"2026/05/21","","275.0","-299.0","0.0"';

    setupNormalEvaluate(makeCsvBytes(csv));
    await main();

    const [, savedContent] = mockWriteFileSync.mock.calls[0];
    const data = JSON.parse(savedContent);
    expect(data.historical[0]?.institution).toBe(0);  // 빈 문자열 → 0
    expect(data.historical[0]?.retail).toBe(275);
  });

  // ─────────────────────────────────────────────────────────────
  // TC28  parseAndSave() – historical=[] → latest:null (L563/L566 br=1)
  // ─────────────────────────────────────────────────────────────

  it("TC28 유효 데이터 행이 전혀 없어 historical이 빈 배열이면 latest: null로 JSON이 저장된다", async () => {
    mockExistsSync.mockReturnValue(false);
    // 헤더는 있지만 데이터 행의 날짜가 모두 비어 historical=[] → latest=null (L563/L566 br=1)
    const csv =
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      ',"0.0","100.0","-50.0","0.0"';  // 날짜 없는 행만

    setupNormalEvaluate(makeCsvBytes(csv));
    await main();

    const [, savedContent] = mockWriteFileSync.mock.calls[0];
    const data = JSON.parse(savedContent);
    expect(data.latest).toBeNull();
    expect(data.historical).toHaveLength(0);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC29  main() catch – Error 아닌 타입 throw (L608 br=1)
  // ─────────────────────────────────────────────────────────────

  it("TC29 main() catch에서 Error 인스턴스가 아닌 타입이 throw되면 String()으로 변환 후 process.exit(1)한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // puppeteer.launch가 문자열을 throw → e instanceof Error = false (L608 br=1 커버)
    mockLaunch.mockRejectedValue("plain string error, not an Error instance");

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC30  runScraper() – hasDupModal catch: err.message falsy → && 단락 평가
  // ─────────────────────────────────────────────────────────────

  it("TC30 hasDupModal 루프 catch에서 message 없는 객체가 throw되면 && 단락되어 break 없이 루프를 계속한다", async () => {
    mockExistsSync.mockReturnValue(false);
    const csvBytes = makeCsvBytes();

    mockPageEvaluate
      .mockResolvedValueOnce(undefined)  // 1~4: 1차 로그인
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({})         // 5: message 없는 객체 throw → err.message=undefined → && 단락
      .mockResolvedValueOnce(false)      // 6~12: 나머지 hasDupModal 반복 (false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ popupVisible: false })  // 13: popupDiagnosis
      .mockResolvedValue(csvBytes);                    // 14+: OTP/CSV

    await main();

    // 루프가 중단 없이 완주 → 정상 저장
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // TC31  parseAndSave() – 필수 컬럼 인덱스 누락 (L546 br=0)
  // ─────────────────────────────────────────────────────────────

  it("TC31 CSV에 '일자'는 있지만 '개인' 등 필수 컬럼이 없으면 헤더 매핑 오류로 process.exit(1)한다", async () => {
    mockExistsSync.mockReturnValue(false);
    // '개인' 컬럼 없음 → retailIdx=-1 → "필수 헤더 매핑 오류" throw (L546 br=0 커버)
    const csvMissingColumn =
      '"일자","기관 합계","외국인 합계","전체"\n' +
      '"2026/05/21","0.0","-299.0","0.0"';
    mockPageEvaluate.mockResolvedValue(makeCsvBytes(csvMissingColumn));

    await main();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
