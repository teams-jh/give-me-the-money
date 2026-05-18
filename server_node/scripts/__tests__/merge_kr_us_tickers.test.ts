/**
 * merge_kr_tickers.ts / merge_us_tickers.ts 테스트
 *
 * TC 계획 (merge_kr_tickers):
 *   TC01  kospi300 + kosdaq200 → all_kr_tickers.json 병합
 *   TC02  name_map 두 소스 병합 확인
 *   TC03  kospi300 파일 없음 → readFileSync 에러 전파
 *
 * TC 계획 (merge_us_tickers):
 *   TC04  top1000 단일 소스 → all_us_tickers.json 생성
 *   TC05  top1000 파일 없음 → readFileSync 에러 전파
 *   TC06  name_map 존재 시 그대로 전달
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
  },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function captureOutput(): Record<string, unknown> {
  const call = mockWriteFileSync.mock.calls[0];
  if (!call) throw new Error("writeFileSync not called");
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

// ── merge_kr_tickers 테스트 ───────────────────────────────────────────────────

describe("merge_kr_tickers.ts", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC01 - kospi300 + kosdaq200 → all_kr_tickers.json 병합 생성", async () => {
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        tickers: ["005930.KS", "000660.KS"],
        name_map: { "005930.KS": "삼성전자", "000660.KS": "SK하이닉스" },
      }))
      .mockReturnValueOnce(JSON.stringify({
        tickers: ["035720.KQ", "003550.KQ"],
        name_map: { "035720.KQ": "카카오", "003550.KQ": "LG" },
      }));

    await import("../merge/merge_kr_tickers.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureOutput();
    expect(out.tickers).toContain("005930.KS");
    expect(out.tickers).toContain("035720.KQ");
    const expectedKeys = ["005930.KS", "000660.KS", "035720.KQ", "003550.KQ"].sort();
    expect(out.tickers).toEqual(expectedKeys);
  });

  it("TC02 - name_map 두 소스 병합", async () => {
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        tickers: ["005930.KS"],
        name_map: { "005930.KS": "삼성전자" },
      }))
      .mockReturnValueOnce(JSON.stringify({
        tickers: ["035720.KQ"],
        name_map: { "035720.KQ": "카카오" },
      }));

    await import("../merge/merge_kr_tickers.js");

    const out = captureOutput() as { name_map: Record<string, string> };
    expect(out.name_map["005930.KS"]).toBe("삼성전자");
    expect(out.name_map["035720.KQ"]).toBe("카카오");
  });

  it("TC03 - kospi300 파일 없음 → readFileSync 에러 전파", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    await expect(import("../merge/merge_kr_tickers.js")).rejects.toThrow();
  });
});

// ── merge_us_tickers 테스트 ───────────────────────────────────────────────────

describe("merge_us_tickers.ts", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC04 - top1000 단일 소스 → all_us_tickers.json 생성", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      tickers: ["AAPL", "MSFT", "NVDA"],
      name_map: { AAPL: "애플", MSFT: "마이크로소프트", NVDA: "엔비디아" },
    }));

    await import("../merge/merge_us_tickers.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const out = captureOutput();
    expect((out.tickers as string[]).sort()).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("TC05 - top1000 파일 없음 → 에러 전파", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT: no such file"); });
    await expect(import("../merge/merge_us_tickers.js")).rejects.toThrow("ENOENT");
  });

  it("TC06 - name_map 존재 시 출력 JSON에 포함", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      tickers: ["GOOG"],
      name_map: { GOOG: "구글" },
    }));

    await import("../merge/merge_us_tickers.js");

    const out = captureOutput() as { name_map: Record<string, string> };
    expect(out.name_map["GOOG"]).toBe("구글");
  });
});
