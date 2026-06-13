/**
 * 개선 전후 동작 비교 (parity) 테스트 — Issue #62
 *
 * 목적: 리팩토링 전 각 fetch 스크립트에 인라인으로 존재하던 구현을
 *       "그대로 복사"해 두고, 신규 _lib 모듈이 모든 입력에 대해
 *       완전히 동일한 출력을 내는지 검증한다.
 *
 * TC 계획:
 *   TC01  round 패리티     - 수치 엣지케이스 매트릭스에서 구버전과 완전 일치
 *   TC02  round 패리티     - null/undefined/NaN/Infinity 처리 일치
 *   TC03  isUpdatedToday   - 오늘/어제/내일/필드없음/손상JSON/파일없음 전부 일치
 *   TC04  saveJsonAtomic   - 구버전 인라인 패턴과 동일한 fs 호출(경로·내용·순서)
 *   TC05  log 포맷 패리티  - 구버전 표준형(`ISO [INFO] msg`)과 출력 일치
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import fs from "fs";
import { round } from "../num.ts";
import { isUpdatedToday, saveJsonAtomic } from "../io.ts";
import { log } from "../logger.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 리팩토링 이전 구현 (update_vix.ts / update_dollar_index.ts 등에서 원문 복사) ──

/** [구버전] round — update_vix.ts:77, update_dollar_index.ts:114 등 6곳 동일 */
function legacyRound(v: number | null | undefined): number | null {
  if (v == null || isNaN(v as number)) return null;
  return Math.round((v as number) * 100) / 100;
}

/** [구버전] isUpdatedToday — update_ticker_metadata.ts:575 (파라미터형 표준) */
function legacyIsUpdatedToday(file: string): boolean {
  try {
    const data        = JSON.parse(fs.readFileSync(file, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today       = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch {
    return false;
  }
}

/** [구버전] atomic save — update_vix.ts:168-170 등 7곳 동일 패턴 */
function legacySave(OUTPUT: string, data: unknown): void {
  const tmp = OUTPUT + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, OUTPUT);
}

/** [구버전] log — fetch 11곳 표준형 (포맷 문자열만 비교용으로 추출) */
function legacyLogLine(msg: string, now: Date): string {
  return `${now.toISOString()} [INFO] ${msg}`;
}

// ── 패리티 검증 ───────────────────────────────────────────────────────────────

describe("parity: round (구버전 인라인 vs _lib/num)", () => {
  it("TC01 - 수치 매트릭스 완전 일치", () => {
    const cases = [
      0, 1, -1, 0.1, 0.005, -0.005, 12.3456, -12.3456, 99.994, 99.995,
      1e10, -1e10, 0.0049, 1234.5678, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER,
    ];
    for (const v of cases) {
      expect(round(v), `round(${v})`).toBe(legacyRound(v));
    }
  });

  it("TC02 - null/undefined/NaN/Infinity 처리 일치", () => {
    const cases: (number | null | undefined)[] = [null, undefined, NaN, Infinity, -Infinity];
    for (const v of cases) {
      expect(round(v), `round(${v})`).toBe(legacyRound(v));
    }
  });
});

describe("parity: isUpdatedToday (구버전 인라인 vs _lib/io)", () => {
  const FILE = "/fake/x.json";

  function bothWith(content: string | (() => never)): [boolean, boolean] {
    if (typeof content === "function") {
      mockReadFileSync.mockImplementation(content);
    } else {
      mockReadFileSync.mockReturnValue(content);
    }
    const next = isUpdatedToday(FILE);
    const prev = legacyIsUpdatedToday(FILE);
    return [next, prev];
  }

  it("TC03 - 오늘/어제/내일/필드없음/손상JSON/파일없음 전부 일치", () => {
    const today    = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400e3).toISOString();
    const tomorrow  = new Date(Date.now() + 86400e3).toISOString();

    const scenarios: [string, string | (() => never)][] = [
      ["오늘",        JSON.stringify({ updated_at: today })],
      ["어제",        JSON.stringify({ updated_at: yesterday })],
      ["내일",        JSON.stringify({ updated_at: tomorrow })],
      ["필드 없음",   JSON.stringify({ foo: 1 })],
      ["빈 문자열",   JSON.stringify({ updated_at: "" })],
      ["손상 JSON",   "{broken"],
      ["파일 없음",   () => { throw new Error("ENOENT"); }],
    ];

    for (const [name, content] of scenarios) {
      const [next, prev] = bothWith(content);
      expect(next, `시나리오: ${name}`).toBe(prev);
    }
  });
});

describe("parity: saveJsonAtomic (구버전 인라인 vs _lib/io)", () => {
  it("TC04 - fs 호출 인자(경로·직렬화·인코딩)와 순서 완전 일치", () => {
    const data = { updated_at: "2026-06-12", score: 12.34, list: [1, 2] };

    legacySave("/fake/a.json", data);
    const legacyWrite  = mockWriteFileSync.mock.calls[0];
    const legacyRename = mockRenameSync.mock.calls[0];

    vi.clearAllMocks();

    saveJsonAtomic("/fake/a.json", data);
    const nextWrite  = mockWriteFileSync.mock.calls[0];
    const nextRename = mockRenameSync.mock.calls[0];

    expect(nextWrite).toEqual(legacyWrite);
    expect(nextRename).toEqual(legacyRename);
  });
});

describe("parity: log 포맷 (구버전 표준형 vs _lib/logger)", () => {
  it("TC05 - 동일 시각 기준 출력 문자열 일치", () => {
    const fixed = new Date("2026-06-12T01:02:03.456Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixed);

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("parity check");
    expect(spy.mock.calls[0][0]).toBe(legacyLogLine("parity check", fixed));

    vi.useRealTimers();
    spy.mockRestore();
  });
});
