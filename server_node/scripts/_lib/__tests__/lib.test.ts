/**
 * _lib 공통 모듈 테스트 (logger / num / io)
 *
 * TC 계획:
 *   [logger]
 *   TC01  log()   - "ISO타임스탬프 [INFO] msg" 형식으로 console.log 호출
 *   TC02  warn()  - "[WARN]" 레벨로 console.warn 호출
 *   TC03  err()   - "[ERROR]" 레벨로 console.error 호출
 *   [num]
 *   TC04  round() - 양수 소수점 2자리 반올림 (12.3456 → 12.35)
 *   TC05  round() - 음수 반올림 (-1.005 인근 값 포함)
 *   TC06  round() - null → null
 *   TC07  round() - undefined → null
 *   TC08  round() - NaN → null
 *   TC09  round() - 정수 입력 → 그대로
 *   [io.isUpdatedToday]
 *   TC10  updated_at 이 오늘 → true
 *   TC11  updated_at 이 어제 → false
 *   TC12  파일 없음(readFileSync throw) → false
 *   TC13  updated_at 필드 없음 → false
 *   TC14  손상된 JSON → false
 *   [io.saveJsonAtomic]
 *   TC15  tmp 경로에 writeFileSync 후 renameSync(tmp → 최종) 순서로 호출
 *   TC16  JSON.stringify(data, null, 2) + utf8 로 직렬화
 *
 * 모킹 전략: 기존 스크립트 테스트와 동일하게 fs 모듈 전체를 vi.mock 으로 교체.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockRenameSync    = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
  },
}));

import { log, warn, err } from "../logger.ts";
import { round } from "../num.ts";
import { isUpdatedToday, saveJsonAtomic } from "../io.ts";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── logger ───────────────────────────────────────────────────────────────────

describe("logger", () => {
  it("TC01 - log(): ISO 타임스탬프 + [INFO] 형식", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("hello");
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(ISO_RE);
    expect(line).toMatch(/\[INFO\] hello$/);
  });

  it("TC02 - warn(): [WARN] 레벨로 console.warn 호출", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn("careful");
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(ISO_RE);
    expect(line).toMatch(/\[WARN\] careful$/);
  });

  it("TC03 - err(): [ERROR] 레벨로 console.error 호출", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    err("boom");
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(ISO_RE);
    expect(line).toMatch(/\[ERROR\] boom$/);
  });
});

// ── num ──────────────────────────────────────────────────────────────────────

describe("num.round", () => {
  it("TC04 - 양수 소수점 2자리 반올림", () => {
    expect(round(12.3456)).toBe(12.35);
    expect(round(0.005)).toBe(0.01);
  });

  it("TC05 - 음수 반올림", () => {
    expect(round(-12.344)).toBe(-12.34);
    expect(round(-12.346)).toBe(-12.35);
  });

  it("TC06 - null → null", () => {
    expect(round(null)).toBeNull();
  });

  it("TC07 - undefined → null", () => {
    expect(round(undefined)).toBeNull();
  });

  it("TC08 - NaN → null", () => {
    expect(round(NaN)).toBeNull();
  });

  it("TC09 - 정수 입력 → 그대로", () => {
    expect(round(42)).toBe(42);
  });
});

// ── io.isUpdatedToday ────────────────────────────────────────────────────────

describe("io.isUpdatedToday", () => {
  const FILE = "/fake/output.json";

  it("TC10 - updated_at 이 오늘 → true", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: new Date().toISOString() }),
    );
    expect(isUpdatedToday(FILE)).toBe(true);
    expect(mockReadFileSync).toHaveBeenCalledWith(FILE, "utf8");
  });

  it("TC11 - updated_at 이 어제 → false", () => {
    const y = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: y }));
    expect(isUpdatedToday(FILE)).toBe(false);
  });

  it("TC12 - 파일 없음(throw) → false", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(isUpdatedToday(FILE)).toBe(false);
  });

  it("TC13 - updated_at 필드 없음 → false", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ foo: 1 }));
    expect(isUpdatedToday(FILE)).toBe(false);
  });

  it("TC14 - 손상된 JSON → false", () => {
    mockReadFileSync.mockReturnValue("{not json");
    expect(isUpdatedToday(FILE)).toBe(false);
  });
});

// ── io.saveJsonAtomic ────────────────────────────────────────────────────────

describe("io.saveJsonAtomic", () => {
  it("TC15 - tmp 쓰기 → rename 순서 보장", () => {
    const order: string[] = [];
    mockWriteFileSync.mockImplementation(() => order.push("write"));
    mockRenameSync.mockImplementation(() => order.push("rename"));

    saveJsonAtomic("/fake/out.json", { a: 1 });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/fake/out.json.tmp",
      JSON.stringify({ a: 1 }, null, 2),
      "utf8",
    );
    expect(mockRenameSync).toHaveBeenCalledWith("/fake/out.json.tmp", "/fake/out.json");
    expect(order).toEqual(["write", "rename"]);
  });

  it("TC16 - JSON pretty(2-space) 직렬화", () => {
    saveJsonAtomic("/fake/out.json", { nested: { b: 2 } });
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toBe(JSON.stringify({ nested: { b: 2 } }, null, 2));
  });
});
