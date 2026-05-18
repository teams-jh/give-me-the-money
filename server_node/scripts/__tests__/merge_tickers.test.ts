/**
 * merge_tickers.ts 테스트
 *
 * TC 계획:
 *   TC01  mergeTickers - 2개 소스 정상 병합, 중복 제거, 알파벳 정렬 확인
 *   TC02  mergeTickers - 소스 파일 없음 → readFileSync 에러 전파
 *   TC03  mergeTickers - tickers 배열 없는 JSON → Error("tickers 배열 없음")
 *   TC04  mergeTickers - name_map 여러 소스 병합 (후 소스가 앞 소스 덮어씀)
 *   TC05  mergeTickers - name_map 없는 소스 → 출력 JSON에 name_map 없음
 *   TC06  mergeTickers - 단일 소스 정상 동작
 *   TC07  mergeTickers - 두 소스 모두 빈 tickers → merged = []
 *   TC08  log()        - 타임스탬프 [INFO] 접두사 포함 확인
 *   TC09  dedupeAndSort- 중복·순서 없는 배열 → 유니크·정렬
 *   TC10  mergeTickers - 출력 파일 counts 필드(label_count) 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";

// ── fs 모킹 ────────────────────────────────────────────────────────────────

const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();
const mockReadFileSync  = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync:     (...args: unknown[]) => mockMkdirSync(...args),
  },
}));

// ── 소스 import (mocks 적용 후) ────────────────────────────────────────────
import { mergeTickers, log } from "../merge/merge_tickers.js";

// ── ヘルパー ────────────────────────────────────────────────────────────────

function makeSrc(tickers: string[], nameMap?: Record<string, string>) {
  return JSON.stringify({ tickers, name_map: nameMap });
}

function captureOutput(): Record<string, unknown> {
  const call = mockWriteFileSync.mock.calls[0];
  if (!call) throw new Error("writeFileSync not called");
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

// ── テスト ─────────────────────────────────────────────────────────────────

describe("merge_tickers.ts", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── TC01: 2소스 정상 병합 ────────────────────────────────────────────────
  it("TC01 - 2개 소스 중복 제거·알파벳 정렬 후 병합", () => {
    mockReadFileSync
      .mockReturnValueOnce(makeSrc(["MSFT", "AAPL", "GOOG"]))
      .mockReturnValueOnce(makeSrc(["AMZN", "AAPL", "TSLA"]));

    mergeTickers({
      sources: [
        { path: "/fake/a.json", label: "srcA" },
        { path: "/fake/b.json", label: "srcB" },
      ],
      output: "/fake/out.json",
    });

    const out = captureOutput();
    expect(out.tickers).toEqual(["AAPL", "AMZN", "GOOG", "MSFT", "TSLA"]);
    expect(out.total_count).toBe(5);
  });

  // ── TC02: 소스 파일 없음 ─────────────────────────────────────────────────
  it("TC02 - 소스 파일 없음 → readFileSync 에러 전파", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    expect(() =>
      mergeTickers({
        sources: [{ path: "/nonexistent.json", label: "x" }],
        output:  "/fake/out.json",
      })
    ).toThrow("ENOENT");
  });

  // ── TC03: tickers 배열 없는 JSON ────────────────────────────────────────
  it("TC03 - tickers 배열 없는 JSON → 커스텀 에러", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ data: [] }));

    expect(() =>
      mergeTickers({
        sources: [{ path: "/bad.json", label: "bad" }],
        output:  "/fake/out.json",
      })
    ).toThrow("tickers 배열 없음");
  });

  // ── TC04: name_map 여러 소스 병합 ────────────────────────────────────────
  it("TC04 - name_map 병합 시 후 소스가 앞 소스를 덮어씀", () => {
    mockReadFileSync
      .mockReturnValueOnce(makeSrc(["AAPL"], { AAPL: "애플(구)" }))
      .mockReturnValueOnce(makeSrc(["MSFT"], { AAPL: "애플(신)", MSFT: "마이크로소프트" }));

    mergeTickers({
      sources: [
        { path: "/fake/a.json", label: "src1" },
        { path: "/fake/b.json", label: "src2" },
      ],
      output: "/fake/out.json",
    });

    const out = captureOutput() as { name_map: Record<string, string> };
    expect(out.name_map["AAPL"]).toBe("애플(신)");   // 후 소스가 덮어씀
    expect(out.name_map["MSFT"]).toBe("마이크로소프트");
  });

  // ── TC05: name_map 없는 소스 ────────────────────────────────────────────
  it("TC05 - 소스에 name_map 없으면 출력 JSON에도 name_map 없음", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ tickers: ["AAPL"] }));

    mergeTickers({
      sources: [{ path: "/fake/a.json", label: "src" }],
      output:  "/fake/out.json",
    });

    const out = captureOutput();
    expect(out).not.toHaveProperty("name_map");
  });

  // ── TC06: 단일 소스 ──────────────────────────────────────────────────────
  it("TC06 - 단일 소스 정상 동작", () => {
    mockReadFileSync.mockReturnValue(makeSrc(["ZZZ", "AAA"]));

    mergeTickers({
      sources: [{ path: "/fake/single.json", label: "single" }],
      output:  "/fake/out.json",
    });

    const out = captureOutput();
    expect(out.tickers).toEqual(["AAA", "ZZZ"]);
    expect(out.total_count).toBe(2);
  });

  // ── TC07: 빈 tickers ────────────────────────────────────────────────────
  it("TC07 - 두 소스 모두 빈 tickers → merged = []", () => {
    mockReadFileSync
      .mockReturnValueOnce(makeSrc([]))
      .mockReturnValueOnce(makeSrc([]));

    mergeTickers({
      sources: [
        { path: "/fake/a.json", label: "a" },
        { path: "/fake/b.json", label: "b" },
      ],
      output: "/fake/out.json",
    });

    const out = captureOutput();
    expect(out.tickers).toEqual([]);
    expect(out.total_count).toBe(0);
  });

  // ── TC08: log() ──────────────────────────────────────────────────────────
  it("TC08 - log() 타임스탬프 [INFO] 접두사 확인", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("테스트 메시지");
    const output = spy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(output).toContain("[INFO]");
    expect(output).toContain("테스트 메시지");
    spy.mockRestore();
  });

  // ── TC09: 중복 제거 + 정렬 (dedupeAndSort 간접 검증) ────────────────────
  it("TC09 - 동일 티커 중복 포함 시 유니크·정렬 확인", () => {
    mockReadFileSync
      .mockReturnValueOnce(makeSrc(["C", "A", "B", "A"]))
      .mockReturnValueOnce(makeSrc(["B", "D"]));

    mergeTickers({
      sources: [
        { path: "/fake/a.json", label: "p" },
        { path: "/fake/b.json", label: "q" },
      ],
      output: "/fake/out.json",
    });

    const out = captureOutput();
    expect(out.tickers).toEqual(["A", "B", "C", "D"]);
  });

  // ── TC10: label_count 필드 검증 ─────────────────────────────────────────
  it("TC10 - 출력 JSON에 label_count 필드 포함", () => {
    mockReadFileSync
      .mockReturnValueOnce(makeSrc(["A", "B", "C"]))
      .mockReturnValueOnce(makeSrc(["D", "E"]));

    mergeTickers({
      sources: [
        { path: "/fake/nasdaq100.json",  label: "nasdaq100"  },
        { path: "/fake/russell1000.json", label: "russell1000" },
      ],
      output: "/fake/out.json",
    });

    const out = captureOutput() as Record<string, unknown>;
    expect(out["nasdaq100_count"]).toBe(3);
    expect(out["russell1000_count"]).toBe(2);
  });
});
