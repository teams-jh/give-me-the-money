/**
 * update_manual_tickers.ts 테스트 (KR / US 공용)
 *
 * TC 계획:
 *   [validateTicker - KR]
 *   TC01  유효한 코스피 티커 (.KS) → 오류 없음
 *   TC02  유효한 코스닥 티커 (.KQ) → 오류 없음
 *   TC03  숫자 부족 → Error
 *   TC04  잘못된 접미사 (.KX) → Error
 *   TC05  빈 문자열 → Error
 *
 *   [validateTicker - US]
 *   TC06  유효한 US 티커 (AAPL) → 오류 없음
 *   TC07  유효한 US 티커 클래스주 (BRK-B) → 오류 없음
 *   TC08  소문자 포함 → Error
 *   TC09  6자 초과 → Error
 *
 *   [add - KR]
 *   TC10  신규 KR 티커 + name → tickers·name_map 반영
 *   TC11  신규 KR 티커 name 없이 → tickers에만 반영
 *   TC12  중복 KR 티커 + name → name_map만 업데이트
 *   TC13  중복 KR 티커 name 없이 → writeFileSync 미호출
 *   TC14  추가 후 tickers 알파벳순 정렬
 *   TC15  잘못된 형식 → writeFileSync 미호출
 *
 *   [add - US]
 *   TC16  신규 US 티커 + name → tickers·name_map 반영
 *   TC17  잘못된 US 티커 형식 → writeFileSync 미호출
 *
 *   [remove]
 *   TC18  등록된 KR 티커 제거 → tickers·name_map 삭제
 *   TC19  미등록 티커 제거 → writeFileSync 미호출
 *   TC20  잘못된 형식 → writeFileSync 미호출
 *
 *   [list]
 *   TC21  등록 종목 있음 → console.log 출력
 *   TC22  등록 종목 없음 → "없습니다" 메시지 출력
 *
 *   [parseArgs]
 *   TC23  --market 누락 → process.exit(1)
 *   TC24  지원하지 않는 마켓 → process.exit(1)
 *   TC25  command 누락 → process.exit(1)
 *   TC26  add에 --ticker 누락 → process.exit(1)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateTicker, main } from "../fetch/update_manual_tickers.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockReadFileSync:  vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

// ── fs 모킹 ──────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

// validateTicker(ticker, config) — config는 tickerPattern만 사용
const KR_CONFIG = { tickerPattern: /^\d{6}\.(KS|KQ)$/, tickerExample: "005930.KS / 247540.KQ" };
const US_CONFIG = { tickerPattern: /^[A-Z0-9]{1,5}(-[A-Z])?$/, tickerExample: "AAPL / BRK-B" };

function makeManualJson(tickers: string[] = [], nameMap: Record<string, string> = {}) {
  return JSON.stringify({
    updated_at:  "2026-01-01T00:00:00.000Z",
    source:      "manual",
    source_url:  "",
    total_count: tickers.length,
    tickers,
    name_map: nameMap,
  });
}

function captureWrittenJson(): Record<string, unknown> {
  const call = mockWriteFileSync.mock.calls[0];
  if (!call) throw new Error("writeFileSync not called");
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

// ── TC01~05: validateTicker() - KR ───────────────────────────────────────────

describe("validateTicker() - KR", () => {
  it("TC01 - 유효한 코스피 티커 (.KS) → 오류 없음", () => {
    expect(() => validateTicker("005930.KS", KR_CONFIG as never)).not.toThrow();
  });

  it("TC02 - 유효한 코스닥 티커 (.KQ) → 오류 없음", () => {
    expect(() => validateTicker("247540.KQ", KR_CONFIG as never)).not.toThrow();
  });

  it("TC03 - 숫자 부족 → Error", () => {
    expect(() => validateTicker("12345.KS", KR_CONFIG as never)).toThrow("티커 형식이 올바르지 않습니다");
  });

  it("TC04 - 잘못된 접미사 (.KX) → Error", () => {
    expect(() => validateTicker("005930.KX", KR_CONFIG as never)).toThrow("티커 형식이 올바르지 않습니다");
  });

  it("TC05 - 빈 문자열 → Error", () => {
    expect(() => validateTicker("", KR_CONFIG as never)).toThrow("티커 형식이 올바르지 않습니다");
  });
});

// ── TC06~09: validateTicker() - US ───────────────────────────────────────────

describe("validateTicker() - US", () => {
  it("TC06 - 유효한 US 티커 (AAPL) → 오류 없음", () => {
    expect(() => validateTicker("AAPL", US_CONFIG as never)).not.toThrow();
  });

  it("TC07 - 클래스주 (BRK-B) → 오류 없음", () => {
    expect(() => validateTicker("BRK-B", US_CONFIG as never)).not.toThrow();
  });

  it("TC08 - 소문자 포함 → Error", () => {
    expect(() => validateTicker("aapl", US_CONFIG as never)).toThrow("티커 형식이 올바르지 않습니다");
  });

  it("TC09 - 6자 초과 → Error", () => {
    expect(() => validateTicker("TOOLONG", US_CONFIG as never)).toThrow("티커 형식이 올바르지 않습니다");
  });
});

// ── TC10~15: add 명령 - KR ────────────────────────────────────────────────────

describe("add 명령 - KR", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC10 - 신규 KR 티커 + name → tickers·name_map 반영", () => {
    process.argv = ["node", "s", "--market", "kr", "add", "--ticker", "352820.KS", "--name", "하이브"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureWrittenJson() as { tickers: string[]; name_map: Record<string, string>; total_count: number };
    expect(out.tickers).toContain("352820.KS");
    expect(out.name_map["352820.KS"]).toBe("하이브");
    expect(out.total_count).toBe(1);
  });

  it("TC11 - 신규 KR 티커 name 없이 → tickers에만 반영", () => {
    process.argv = ["node", "s", "--market", "kr", "add", "--ticker", "352820.KS"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    main();
    const out = captureWrittenJson() as { tickers: string[]; name_map: Record<string, string> };
    expect(out.tickers).toContain("352820.KS");
    expect(out.name_map["352820.KS"]).toBeUndefined();
  });

  it("TC12 - 중복 KR 티커 + name → name_map만 업데이트, tickers 중복 없음", () => {
    process.argv = ["node", "s", "--market", "kr", "add", "--ticker", "352820.KS", "--name", "하이브(수정)"];
    mockReadFileSync.mockReturnValue(makeManualJson(["352820.KS"], { "352820.KS": "하이브" }));
    main();
    const out = captureWrittenJson() as { tickers: string[]; name_map: Record<string, string> };
    expect(out.tickers.filter((t) => t === "352820.KS")).toHaveLength(1);
    expect(out.name_map["352820.KS"]).toBe("하이브(수정)");
  });

  it("TC13 - 중복 KR 티커 name 없이 → writeFileSync 미호출", () => {
    process.argv = ["node", "s", "--market", "kr", "add", "--ticker", "352820.KS"];
    mockReadFileSync.mockReturnValue(makeManualJson(["352820.KS"], { "352820.KS": "하이브" }));
    main();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("TC14 - 추가 후 tickers 알파벳순 정렬", () => {
    process.argv = ["node", "s", "--market", "kr", "add", "--ticker", "000080.KS"];
    mockReadFileSync.mockReturnValue(makeManualJson(["352820.KS"], { "352820.KS": "하이브" }));
    main();
    const out = captureWrittenJson() as { tickers: string[] };
    expect(out.tickers[0]).toBe("000080.KS");
    expect(out.tickers[1]).toBe("352820.KS");
  });

  it("TC15 - 잘못된 형식 → writeFileSync 미호출", () => {
    process.argv = ["node", "s", "--market", "kr", "add", "--ticker", "INVALID"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    expect(() => main()).toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ── TC16~17: add 명령 - US ────────────────────────────────────────────────────

describe("add 명령 - US", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC16 - 신규 US 티커 + name → tickers·name_map 반영", () => {
    process.argv = ["node", "s", "--market", "us", "add", "--ticker", "AAPL", "--name", "Apple"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    main();
    const out = captureWrittenJson() as { tickers: string[]; name_map: Record<string, string> };
    expect(out.tickers).toContain("AAPL");
    expect(out.name_map["AAPL"]).toBe("Apple");
  });

  it("TC17 - 잘못된 US 티커 형식 → writeFileSync 미호출", () => {
    process.argv = ["node", "s", "--market", "us", "add", "--ticker", "invalid"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    expect(() => main()).toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ── TC18~20: remove 명령 ─────────────────────────────────────────────────────

describe("remove 명령", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC18 - 등록된 KR 티커 제거 → tickers·name_map 삭제, total_count 감소", () => {
    process.argv = ["node", "s", "--market", "kr", "remove", "--ticker", "352820.KS"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["293490.KQ", "352820.KS"], { "293490.KQ": "카카오게임즈", "352820.KS": "하이브" }),
    );
    main();
    const out = captureWrittenJson() as { tickers: string[]; name_map: Record<string, string>; total_count: number };
    expect(out.tickers).not.toContain("352820.KS");
    expect(out.name_map["352820.KS"]).toBeUndefined();
    expect(out.total_count).toBe(1);
  });

  it("TC19 - 미등록 티커 제거 → writeFileSync 미호출", () => {
    process.argv = ["node", "s", "--market", "kr", "remove", "--ticker", "000080.KS"];
    mockReadFileSync.mockReturnValue(makeManualJson(["352820.KS"], { "352820.KS": "하이브" }));
    main();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("TC20 - 잘못된 형식 → writeFileSync 미호출", () => {
    process.argv = ["node", "s", "--market", "kr", "remove", "--ticker", "INVALID"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    expect(() => main()).toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ── TC21~22: list 명령 ────────────────────────────────────────────────────────

describe("list 명령", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC21 - 등록 종목 있음 → 티커·종목명 출력", () => {
    process.argv = ["node", "s", "--market", "kr", "list"];
    mockReadFileSync.mockReturnValue(makeManualJson(["352820.KS"], { "352820.KS": "하이브" }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    main();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("352820.KS");
    expect(output).toContain("하이브");
    logSpy.mockRestore();
  });

  it("TC22 - 등록 종목 없음 → '없습니다' 메시지 출력", () => {
    process.argv = ["node", "s", "--market", "us", "list"];
    mockReadFileSync.mockReturnValue(makeManualJson());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    main();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("없습니다");
    logSpy.mockRestore();
  });
});

// ── TC23~26: parseArgs() - 잘못된 인자 ──────────────────────────────────────

describe("parseArgs() - 잘못된 인자", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC23 - --market 누락 → process.exit(1)", () => {
    process.argv = ["node", "s", "add", "--ticker", "AAPL"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const mockErr  = vi.spyOn(console, "error").mockImplementation(() => {});
    try { main(); } catch { /* process.exit 이후 실행 계속 시 발생할 수 있는 예외 무시 */ }
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockErr.mockRestore();
  });

  it("TC24 - 지원하지 않는 마켓 → process.exit(1)", () => {
    process.argv = ["node", "s", "--market", "jp", "add", "--ticker", "7203.T"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const mockErr  = vi.spyOn(console, "error").mockImplementation(() => {});
    try { main(); } catch {}
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockErr.mockRestore();
  });

  it("TC25 - command 누락 → process.exit(1)", () => {
    process.argv = ["node", "s", "--market", "kr"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const mockErr  = vi.spyOn(console, "error").mockImplementation(() => {});
    try { main(); } catch {}
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockErr.mockRestore();
  });

  it("TC26 - add에 --ticker 누락 → process.exit(1)", () => {
    process.argv = ["node", "s", "--market", "us", "add"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const mockErr  = vi.spyOn(console, "error").mockImplementation(() => {});
    try { main(); } catch {}
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockErr.mockRestore();
  });
});
