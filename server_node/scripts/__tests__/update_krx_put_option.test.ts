/**
 * update_krx_put_option.ts 테스트
 *
 * TC 계획:
 *   TC01  isUpdatedToday() - 오늘 날짜 파일 존재 시 main() 스킵 (puppeteer 미호출)
 *   TC02  isUpdatedToday() - 어제 날짜 파일 존재 시 main() 스크래퍼 실행 (puppeteer 호출)
 *   TC03  isUpdatedToday() - 파일 없음(ENOENT) 시 main() 스크래퍼 실행 (puppeteer 호출)
 *   TC04  main()           - 오늘 날짜여도 --force 플래그 있으면 스크래퍼 강제 실행
 *   TC05  main()           - 정상 동작 시 CSV 파싱을 거쳐 최종 JSON DB가 원자적으로 저장됨 (tmp -> json)
 *   TC06  main()           - CSV 헤더가 없거나 망가진 경우 process.exit(1) 오류 처리
 *   TC07  main()           - 스크래퍼 내부 예외 발생 시 스크린샷 시도 및 process.exit(1) 처리
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

const mockCDPSend = vi.fn();
const mockPageScreenshot = vi.fn();
const mockPageGoto = vi.fn();
const mockPageClick = vi.fn();
const mockPageType = vi.fn();
const mockPageEvaluate = vi.fn();

const mockPage = {
  createCDPSession: async () => ({ send: mockCDPSend }),
  on: vi.fn(),
  setUserAgent: vi.fn(),
  evaluateOnNewDocument: vi.fn(),
  goto: mockPageGoto,
  click: mockPageClick,
  type: mockPageType,
  evaluate: mockPageEvaluate,
  url: () => "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201050302",
  cookies: async () => [{ name: 'JSESSIONID', value: 'mock-session' }],
  screenshot: mockPageScreenshot,
};

const mockBrowser = {
  defaultBrowserContext: () => ({
    overridePermissions: vi.fn(),
  }),
  newPage: async () => mockPage,
  close: vi.fn(),
};

vi.mock("puppeteer", () => ({
  default: {
    launch: async () => mockBrowser,
  },
}));

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("update_krx_put_option", () => {
  vi.setConfig({ testTimeout: 50000 });
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // process.exit 감시 및 가로채기
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
    
    // 환경변수 임시 가상 세팅
    process.env.KRX_ID = "test-id";
    process.env.KRX_PW = "test-pw";

    // 모크 초기화
    vi.clearAllMocks();

    // 기본 모크 동작 설정
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockPageGoto.mockResolvedValue(null);
    mockPageClick.mockResolvedValue(null);
    mockPageType.mockResolvedValue(null);
    mockCDPSend.mockResolvedValue({});
    mockPageScreenshot.mockResolvedValue(Buffer.from([]));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    // 프로세스 아규먼트 정리
    const forceIdx = process.argv.indexOf("--force");
    if (forceIdx !== -1) process.argv.splice(forceIdx, 1);
    const debugIdx = process.argv.indexOf("--debug");
    if (debugIdx !== -1) process.argv.splice(debugIdx, 1);
  });

  // ── TC01 ~ TC04: isUpdatedToday() & Skip Logic ──

  it("TC01 오늘 날짜 updated_at 데이터가 있으면 스크래퍼가 실행되지 않는다", async () => {
    const today = new Date().toISOString();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));

    await main();

    expect(mockPageGoto).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("TC02 어제 날짜 updated_at 데이터가 있으면 스크래퍼가 실행된다", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: yesterday }));

    // mockPage.evaluate 반환 설정 (정상 CSV 반환 모사)
    const csvContent = '"일자","기관 합계","개인","외국인 합계","전체"\n"2026/05/21","0.0","275.0","-299.0","0.0"';
    const csvBuffer = iconv.encode(csvContent, "euc-kr");
    mockPageEvaluate.mockResolvedValue(Array.from(csvBuffer));

    await main();

    expect(mockPageGoto).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC03 저장된 JSON 파일이 아예 존재하지 않으면 스크래퍼가 정상 실행된다", async () => {
    mockExistsSync.mockReturnValue(false); // 파일 없음

    const csvContent = '"일자","기관 합계","개인","외국인 합계","전체"\n"2026/05/21","0.0","275.0","-299.0","0.0"';
    const csvBuffer = iconv.encode(csvContent, "euc-kr");
    mockPageEvaluate.mockResolvedValue(Array.from(csvBuffer));

    await main();

    expect(mockPageGoto).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC04 오늘 수집 완료되었더라도 --force 플래그가 전달되면 강제 재수집한다", async () => {
    const today = new Date().toISOString();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));
    
    // --force 주입
    process.argv.push("--force");

    const csvContent = '"일자","기관 합계","개인","외국인 합계","전체"\n"2026/05/21","0.0","275.0","-299.0","0.0"';
    const csvBuffer = iconv.encode(csvContent, "euc-kr");
    mockPageEvaluate.mockResolvedValue(Array.from(csvBuffer));

    await main();

    expect(mockPageGoto).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  // ── TC05: CSV 파싱 및 DB 영속화 성공 ──

  it("TC05 다운로드 성공 시 CSV 데이터가 정상적으로 가공되어 JSON 파일로 원자적 저장된다", async () => {
    mockExistsSync.mockReturnValue(false);

    // 공백 헤더가 가미된 정상 데이터
    const csvContent = 
      '"일자","기관 합계","개인","외국인 합계","전체"\n' +
      '"2026/05/21","0.0","275.0","-299.0","0.0"\n' +
      '"2026/05/20","-4867.0","-1568.0","6585.0","0.0"';
    const csvBuffer = iconv.encode(csvContent, "euc-kr");
    mockPageEvaluate.mockResolvedValue(Array.from(csvBuffer));

    await main();

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockRenameSync).toHaveBeenCalled();

    // 저장되는 JSON 규격 확인
    const [savedPath, savedContent] = mockWriteFileSync.mock.calls[0];
    expect(savedPath).toContain("krx_put_option.json.tmp");
    
    const parsedData = JSON.parse(savedContent);
    expect(parsedData.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsedData.latest).toEqual({
      date: "2026-05-21",
      retail: 275,
      foreigner: -299,
      institution: 0,
    });
    expect(parsedData.historical).toHaveLength(2);
    expect(parsedData.historical[0]).toEqual({
      date: "2026-05-20",
      retail: -1568,
      foreigner: 6585,
      institution: -4867,
    });
  });

  // ── TC06 ~ TC07: 에러 핸들링 ──

  it("TC06 CSV 헤더가 훼손되었거나 매핑되지 않는 경우 에러 메시지와 함께 process.exit(1)로 비정상 종료된다", async () => {
    mockExistsSync.mockReturnValue(false);

    // '일자' 헤더가 누락된 망가진 데이터
    const badCsvContent = '"날짜","기관","개인","외국인"\n"2026/05/21","0.0","275.0","-299.0"';
    const csvBuffer = iconv.encode(badCsvContent, "euc-kr");
    mockPageEvaluate.mockResolvedValue(Array.from(csvBuffer));

    await main();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("TC07 크롤러 동작 중 브라우저 에러 등 예외 발생 시 에러 스크린샷을 찍고 process.exit(1) 종료한다", async () => {
    mockExistsSync.mockReturnValue(false);

    // goto 시 타임아웃/에러 발생 모사
    mockPageGoto.mockRejectedValue(new Error("Browser disconnected unexpectedly"));

    await main();

    // 에러 스크린샷 호출 확인
    expect(mockPageScreenshot).toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
