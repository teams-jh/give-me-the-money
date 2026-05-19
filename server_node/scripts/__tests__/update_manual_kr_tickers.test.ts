/**
 * update_manual_kr_tickers.ts 테스트
 *
 * TC 계획:
 *   [validateTicker]
 *   TC01  유효한 코스피 티커 (.KS) → 오류 없음
 *   TC02  유효한 코스닥 티커 (.KQ) → 오류 없음
 *   TC03  잘못된 형식 (숫자 부족) → Error 발생
 *   TC04  잘못된 접미사 (.KX)     → Error 발생
 *   TC05  빈 문자열               → Error 발생
 *
 *   [add]
 *   TC06  신규 티커 + name 추가 → tickers·name_map에 반영, total_count 증가
 *   TC07  신규 티커 name 없이 추가 → tickers에만 반영
 *   TC08  중복 티커 + name → name_map만 업데이트, tickers 중복 없음
 *   TC09  중복 티커 name 없이 → 변경 없음 (writeFileSync 미호출)
 *   TC10  추가 후 tickers 알파벳순 정렬
 *   TC11  잘못된 형식 티커 → Error 발생, writeFileSync 미호출
 *
 *   [remove]
 *   TC12  등록된 티커 제거 → tickers·name_map에서 삭제, total_count 감소
 *   TC13  미등록 티커 제거 → writeFileSync 미호출
 *   TC14  잘못된 형식 티커 → Error 발생
 *
 *   [list]
 *   TC15  등록 종목 있음 → console.log 출력
 *   TC16  등록 종목 없음 → "없습니다" 메시지 출력
 *
 *   [parseArgs]
 *   TC17  명령 누락 → process.exit(1) 호출
 *   TC18  add 명령에 --ticker 누락 → process.exit(1) 호출
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

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

// ── validateTicker (순수 함수 인라인 재현) ────────────────────────────────────

function validateTicker(ticker: string): void {
  const pattern = /^\d{6}\.(KS|KQ)$/;
  if (!pattern.test(ticker)) {
    throw new Error(`티커 형식이 올바르지 않습니다: "${ticker}"`);
  }
}

describe("validateTicker()", () => {
  it("TC01 - 유효한 코스피 티커 (.KS) → 오류 없음", () => {
    expect(() => validateTicker("005930.KS")).not.toThrow();
  });

  it("TC02 - 유효한 코스닥 티커 (.KQ) → 오류 없음", () => {
    expect(() => validateTicker("247540.KQ")).not.toThrow();
  });

  it("TC03 - 숫자가 6자리 미만 → Error 발생", () => {
    expect(() => validateTicker("12345.KS")).toThrow("티커 형식이 올바르지 않습니다");
  });

  it("TC04 - 잘못된 접미사 (.KX) → Error 발생", () => {
    expect(() => validateTicker("005930.KX")).toThrow("티커 형식이 올바르지 않습니다");
  });

  it("TC05 - 빈 문자열 → Error 발생", () => {
    expect(() => validateTicker("")).toThrow("티커 형식이 올바르지 않습니다");
  });
});

// ── add ──────────────────────────────────────────────────────────────────────

describe("add 명령", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("TC06 - 신규 티커 + name 추가 → tickers·name_map 반영, total_count 증가", async () => {
    process.argv = ["node", "script.ts", "add", "--ticker", "352820.KS", "--name", "하이브"];
    mockReadFileSync.mockReturnValue(makeManualJson());

    await import("../fetch/update_manual_kr_tickers.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureWrittenJson() as {
      tickers: string[];
      name_map: Record<string, string>;
      total_count: number;
    };
    expect(out.tickers).toContain("352820.KS");
    expect(out.name_map["352820.KS"]).toBe("하이브");
    expect(out.total_count).toBe(1);
  });

  it("TC07 - 신규 티커 name 없이 추가 → tickers에만 반영, name_map 비어있음", async () => {
    process.argv = ["node", "script.ts", "add", "--ticker", "352820.KS"];
    mockReadFileSync.mockReturnValue(makeManualJson());

    await import("../fetch/update_manual_kr_tickers.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureWrittenJson() as {
      tickers: string[];
      name_map: Record<string, string>;
    };
    expect(out.tickers).toContain("352820.KS");
    expect(out.name_map["352820.KS"]).toBeUndefined();
  });

  it("TC08 - 중복 티커 + name → name_map만 업데이트, tickers 중복 없음", async () => {
    process.argv = ["node", "script.ts", "add", "--ticker", "352820.KS", "--name", "하이브(수정)"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["352820.KS"], { "352820.KS": "하이브" }),
    );

    await import("../fetch/update_manual_kr_tickers.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureWrittenJson() as {
      tickers: string[];
      name_map: Record<string, string>;
    };
    expect(out.tickers.filter((t) => t === "352820.KS")).toHaveLength(1);
    expect(out.name_map["352820.KS"]).toBe("하이브(수정)");
  });

  it("TC09 - 중복 티커 name 없이 → writeFileSync 미호출", async () => {
    process.argv = ["node", "script.ts", "add", "--ticker", "352820.KS"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["352820.KS"], { "352820.KS": "하이브" }),
    );

    await import("../fetch/update_manual_kr_tickers.js");

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("TC10 - 추가 후 tickers 알파벳순 정렬", async () => {
    process.argv = ["node", "script.ts", "add", "--ticker", "000080.KS"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["352820.KS"], { "352820.KS": "하이브" }),
    );

    await import("../fetch/update_manual_kr_tickers.js");

    const out = captureWrittenJson() as { tickers: string[] };
    expect(out.tickers[0]).toBe("000080.KS");
    expect(out.tickers[1]).toBe("352820.KS");
  });

  it("TC11 - 잘못된 형식 티커 → process.exit(1), writeFileSync 미호출", async () => {
    process.argv = ["node", "script.ts", "add", "--ticker", "INVALID"];
    mockReadFileSync.mockReturnValue(makeManualJson());

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    await import("../fetch/update_manual_kr_tickers.js").catch(() => {});

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe("remove 명령", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("TC12 - 등록된 티커 제거 → tickers·name_map 삭제, total_count 감소", async () => {
    process.argv = ["node", "script.ts", "remove", "--ticker", "352820.KS"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["293490.KQ", "352820.KS"], {
        "293490.KQ": "카카오게임즈",
        "352820.KS": "하이브",
      }),
    );

    await import("../fetch/update_manual_kr_tickers.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureWrittenJson() as {
      tickers: string[];
      name_map: Record<string, string>;
      total_count: number;
    };
    expect(out.tickers).not.toContain("352820.KS");
    expect(out.name_map["352820.KS"]).toBeUndefined();
    expect(out.total_count).toBe(1);
  });

  it("TC13 - 미등록 티커 제거 → writeFileSync 미호출", async () => {
    process.argv = ["node", "script.ts", "remove", "--ticker", "000080.KS"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["352820.KS"], { "352820.KS": "하이브" }),
    );

    await import("../fetch/update_manual_kr_tickers.js");

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("TC14 - 잘못된 형식 티커 → process.exit(1), writeFileSync 미호출", async () => {
    process.argv = ["node", "script.ts", "remove", "--ticker", "INVALID"];
    mockReadFileSync.mockReturnValue(makeManualJson());

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    await import("../fetch/update_manual_kr_tickers.js").catch(() => {});

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe("list 명령", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("TC15 - 등록 종목 있음 → 티커 목록 console.log 출력", async () => {
    process.argv = ["node", "script.ts", "list"];
    mockReadFileSync.mockReturnValue(
      makeManualJson(["352820.KS"], { "352820.KS": "하이브" }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../fetch/update_manual_kr_tickers.js");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("352820.KS");
    expect(output).toContain("하이브");
    logSpy.mockRestore();
  });

  it("TC16 - 등록 종목 없음 → '없습니다' 메시지 출력", async () => {
    process.argv = ["node", "script.ts", "list"];
    mockReadFileSync.mockReturnValue(makeManualJson());

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../fetch/update_manual_kr_tickers.js");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("없습니다");
    logSpy.mockRestore();
  });
});

// ── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs() - 잘못된 인자", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("TC17 - 명령 누락 → process.exit(1) 호출", async () => {
    process.argv = ["node", "script.ts"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    await import("../fetch/update_manual_kr_tickers.js").catch(() => {});

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("TC18 - add 명령에 --ticker 누락 → process.exit(1) 호출", async () => {
    process.argv = ["node", "script.ts", "add"];
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    await import("../fetch/update_manual_kr_tickers.js").catch(() => {});

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
