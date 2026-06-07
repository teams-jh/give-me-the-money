/**
 * cleanup_orphan_tickers.ts 테스트
 *
 * TC 계획:
 *   TC01  cleanupMarket - 고아 파일 탐지 후 정상 삭제
 *   TC02  cleanupMarket - dry-run 모드: 탐지만 하고 삭제 없음
 *   TC03  cleanupMarket - 고아 파일 없음 → 삭제 0건, rmSync 미호출
 *   TC04  cleanupMarket - 메타 파일 없음 → 조기 반환 (orphans=[])
 *   TC05  cleanupMarket - 티커 디렉토리 없음 → 조기 반환 (orphans=[])
 *   TC06  cleanupMarket - KR 티커 파일명 변환: "005930.KS" → "005930"
 *   TC07  log()         - 타임스탬프 [INFO] 접두사 포함 확인
 *   TC08  warn()        - 타임스탬프 [WARN] 접두사 포함 확인
 *   TC09  parseArgs     - --market 값 정상 파싱
 *   TC10  parseArgs     - --market 뒤에 값 없이 플래그가 오면 기본값 "all"
 *   TC11  parseArgs     - --dry-run 플래그 파싱
 *   TC12  parseArgs     - 인자 없으면 기본값 { market: "all", dryRun: false }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockExistsSync, mockReadFileSync, mockReaddirSync, mockRmSync,
} = vi.hoisted(() => ({
  mockExistsSync:   vi.fn(),
  mockReadFileSync:  vi.fn(),
  mockReaddirSync:   vi.fn(),
  mockRmSync:        vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    existsSync:   (...args: unknown[]) => mockExistsSync(...args),
    readFileSync:  (...args: unknown[]) => mockReadFileSync(...args),
    readdirSync:   (...args: unknown[]) => mockReaddirSync(...args),
    rmSync:        (...args: unknown[]) => mockRmSync(...args),
  },
}));

// ── 소스 import (mocks 적용 후) ────────────────────────────────────────────
import {
  cleanupMarket,
  log,
  warn,
  parseArgs,
} from "../cleanup/cleanup_orphan_tickers.js";

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

function makeMetaJson(tickers: string[]): string {
  return JSON.stringify({ tickers });
}

const FAKE_CONFIG = {
  label:      "TEST",
  metaJson:   "/fake/meta/all_test_tickers.json",
  tickersDir: "/fake/db/test/tickers",
};

// ── 테스트 ─────────────────────────────────────────────────────────────────

describe("cleanup_orphan_tickers.ts", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── TC01: 정상 삭제 ──────────────────────────────────────────────────────
  it("TC01 - 고아 파일 탐지 후 정상 삭제", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeMetaJson(["AAPL", "MSFT"]));
    mockReaddirSync.mockReturnValue(["AAPL.json", "MSFT.json", "DEAD.json"]);

    const result = cleanupMarket(FAKE_CONFIG, false);

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]).toContain("DEAD.json");
    expect(result.deleted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockRmSync).toHaveBeenCalledTimes(1);
    expect(mockRmSync).toHaveBeenCalledWith(
      path.join(FAKE_CONFIG.tickersDir, "DEAD.json")
    );
  });

  // ── TC02: dry-run ────────────────────────────────────────────────────────
  it("TC02 - dry-run 모드: 고아 탐지만 하고 실제 삭제 없음", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeMetaJson(["AAPL"]));
    mockReaddirSync.mockReturnValue(["AAPL.json", "GHOST.json"]);

    const result = cleanupMarket(FAKE_CONFIG, true);

    expect(result.orphans).toHaveLength(1);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  // ── TC03: 고아 없음 ──────────────────────────────────────────────────────
  it("TC03 - 고아 파일 없음 → 삭제 0건, rmSync 미호출", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeMetaJson(["AAPL", "MSFT"]));
    mockReaddirSync.mockReturnValue(["AAPL.json", "MSFT.json"]);

    const result = cleanupMarket(FAKE_CONFIG, false);

    expect(result.orphans).toHaveLength(0);
    expect(result.deleted).toBe(0);
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  // ── TC04: 메타 파일 없음 ─────────────────────────────────────────────────
  it("TC04 - 메타 파일 없음 → 조기 반환 (orphans=[])", () => {
    mockExistsSync.mockReturnValueOnce(false);

    const result = cleanupMarket(FAKE_CONFIG, false);

    expect(result.orphans).toHaveLength(0);
    expect(result.deleted).toBe(0);
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  // ── TC05: 티커 디렉토리 없음 ─────────────────────────────────────────────
  it("TC05 - 티커 디렉토리 없음 → 조기 반환 (orphans=[])", () => {
    mockExistsSync
      .mockReturnValueOnce(true)   // metaJson 존재
      .mockReturnValueOnce(false); // tickersDir 없음
    mockReadFileSync.mockReturnValue(makeMetaJson(["AAPL"]));

    const result = cleanupMarket(FAKE_CONFIG, false);

    expect(result.orphans).toHaveLength(0);
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  // ── TC06: KR 파일명 변환 ─────────────────────────────────────────────────
  it("TC06 - KR 티커 '005930.KS' → 파일명 '005930' 으로 매핑", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeMetaJson(["005930.KS", "000080.KS"])
    );
    mockReaddirSync.mockReturnValue([
      "005930.json",
      "000080.json",
      "999999.json",  // 고아
    ]);

    const result = cleanupMarket(FAKE_CONFIG, false);

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]).toContain("999999.json");
    expect(result.deleted).toBe(1);
  });

  // ── TC07: log() ──────────────────────────────────────────────────────────
  it("TC07 - log() 타임스탬프 [INFO] 접두사 확인", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("테스트 메시지");
    const output = spy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(output).toContain("[INFO]");
    expect(output).toContain("테스트 메시지");
    spy.mockRestore();
  });

  // ── TC08: warn() ─────────────────────────────────────────────────────────
  it("TC08 - warn() 타임스탬프 [WARN] 접두사 확인", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn("경고 메시지");
    const output = spy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(output).toContain("[WARN]");
    expect(output).toContain("경고 메시지");
    spy.mockRestore();
  });

  // ── TC09: parseArgs --market 정상 파싱 ──────────────────────────────────
  it("TC09 - --market us 파싱", () => {
    vi.stubGlobal("process", { ...process, argv: ["node", "script.ts", "--market", "us"] });
    const { market, dryRun } = parseArgs();
    expect(market).toBe("us");
    expect(dryRun).toBe(false);
    vi.unstubAllGlobals();
  });

  // ── TC10: --market 뒤 플래그 → 기본값 "all" ─────────────────────────────
  it("TC10 - --market 뒤 플래그가 오면 기본값 'all'", () => {
    vi.stubGlobal("process", {
      ...process,
      argv: ["node", "script.ts", "--market", "--dry-run"],
    });
    const { market } = parseArgs();
    expect(market).toBe("all");
    vi.unstubAllGlobals();
  });

  // ── TC11: --dry-run 파싱 ────────────────────────────────────────────────
  it("TC11 - --dry-run 플래그 파싱", () => {
    vi.stubGlobal("process", {
      ...process,
      argv: ["node", "script.ts", "--market", "kr", "--dry-run"],
    });
    const { market, dryRun } = parseArgs();
    expect(market).toBe("kr");
    expect(dryRun).toBe(true);
    vi.unstubAllGlobals();
  });

  // ── TC12: 인자 없으면 기본값 ────────────────────────────────────────────
  it("TC12 - 인자 없으면 기본값 { market: 'all', dryRun: false }", () => {
    vi.stubGlobal("process", { ...process, argv: ["node", "script.ts"] });
    const { market, dryRun } = parseArgs();
    expect(market).toBe("all");
    expect(dryRun).toBe(false);
    vi.unstubAllGlobals();
  });
});
