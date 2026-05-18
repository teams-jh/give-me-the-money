/**
 * update_nasdaq100.ts 테스트
 *
 * ⚠ cheerio 는 server_node 전용 dependency → 직접 import 불가.
 *   parseWikipediaHtml() 은 export 없음 → 모두 main() 경유 통합 테스트.
 *
 * TC 계획:
 *   TC01  Ticker 컬럼 정상 파싱 → 결과에 AAPL·MSFT 포함
 *   TC02  여러 테이블 중 Ticker 없는 것 무시
 *   TC03  각주([1], *) 제거 후 티커 정상 인식
 *   TC04  소문자·숫자 포함 티커 제외
 *   TC05  Symbol 컬럼명도 인식
 *   TC06  Ticker/Symbol 컬럼 없음 → 0개 → exit(1)
 *   TC07  파싱 < 90개 → exit(1)
 *   TC08  정상 경로(≥90개) → writeFileSync 호출
 *   TC09  저장 JSON 구조 검증
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fs / axios 모킹 ───────────────────────────────────────────────────────────

const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();

vi.mock("fs", () => ({
  default: {
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
  },
}));

const mockAxiosGet = vi.fn();
vi.mock("axios", () => ({
  default: { get: (...a: unknown[]) => mockAxiosGet(...a) },
}));

// ── HTML 빌더 헬퍼 (cheerio 불필요, 순수 문자열 조합) ─────────────────────────

function makeTable(headerCells: string[], rows: string[][]): string {
  const ths = headerCells.map((h) => `<th>${h}</th>`).join("");
  const trs = rows
    .map((cols) => `<tr>${cols.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="wikitable"><tr>${ths}</tr>${trs}</table>`;
}

function makeHtml(...tables: string[]): string {
  return `<html><body>${tables.join("")}</body></html>`;
}

// 2-letter 대문자 티커 90개 생성 → 행 형식: [ticker, company_name]
// header ["Ticker","Company"] 또는 ["Symbol","Company"] 와 일치
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function make90Rows(extraRows: string[][] = []): string[][] {
  const base = Array.from({ length: 90 }, (_, i) => [
    (ALPHA[Math.floor(i / 26)] ?? "A") + (ALPHA[i % 26] ?? "A"),  // 컬럼 0 = ticker
    "Company",                                                        // 컬럼 1 = company
  ]);
  return [...base, ...extraRows];
}

// ── 모든 TC: main() 경유 통합 테스트 ─────────────────────────────────────────

describe("update_nasdaq100.ts (main() 경유 통합 테스트)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC01 - Ticker 컬럼 정상 파싱 → 결과에 포함", async () => {
    const html = makeHtml(makeTable(
      ["Ticker", "Company"],
      make90Rows([["AAPL", "Apple"], ["MSFT", "Microsoft"]])
    ));
    mockAxiosGet.mockResolvedValue({ data: html });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { tickers: string[] };
    expect(saved.tickers).toContain("AAPL");
    expect(saved.tickers).toContain("MSFT");
  });

  it("TC02 - Ticker 없는 테이블 무시, Ticker 있는 것만 파싱", async () => {
    const noTicker   = makeTable(["Name", "Year"], [["Apple", "2024"]]);
    const withTicker = makeTable(["Ticker", "Company"], make90Rows([["NVDA", "Nvidia"]]));
    mockAxiosGet.mockResolvedValue({ data: makeHtml(noTicker, withTicker) });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { tickers: string[] };
    expect(saved.tickers).toContain("NVDA");
    expect(saved.tickers).not.toContain("2024");
  });

  it("TC03 - 각주([1], *) 제거 후 티커 정상 인식", async () => {
    const rows = make90Rows([
      ["AAPL[1]",  "Apple"],
      ["MSFT *",   "Microsoft"],
      ["NVDA[10]", "Nvidia"],
    ]);
    mockAxiosGet.mockResolvedValue({ data: makeHtml(makeTable(["Ticker", "Company"], rows)) });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { tickers: string[] };
    expect(saved.tickers).toContain("AAPL");
    expect(saved.tickers).toContain("MSFT");
    expect(saved.tickers).toContain("NVDA");
  });

  it("TC04 - 소문자·숫자 포함 티커는 출력 제외", async () => {
    const rows = make90Rows([
      ["aapl",  "lowercase"],
      ["AAP1L", "digit"],
      ["VALID", "valid"],
    ]);
    mockAxiosGet.mockResolvedValue({ data: makeHtml(makeTable(["Ticker", "Company"], rows)) });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { tickers: string[] };
    expect(saved.tickers).not.toContain("aapl");
    expect(saved.tickers).not.toContain("AAP1L");
    expect(saved.tickers).toContain("VALID");
  });

  it("TC05 - Symbol 컬럼명도 Ticker로 인식", async () => {
    const rows = make90Rows([["GOOGL", "Alphabet"]]);
    mockAxiosGet.mockResolvedValue({ data: makeHtml(makeTable(["Symbol", "Company"], rows)) });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { tickers: string[] };
    expect(saved.tickers).toContain("GOOGL");
  });

  it("TC06 - Ticker/Symbol 컬럼 없음 → 0개 → exit(1)", async () => {
    mockAxiosGet.mockResolvedValue({
      data: makeHtml(makeTable(["Name", "Year"], [["Apple", "2024"]])),
    });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });

  it("TC07 - 파싱 티커 < 90개 → exit(1)", async () => {
    mockAxiosGet.mockResolvedValue({
      data: makeHtml(makeTable(["Ticker", "Company"], [["AAPL", "Apple"]])),
    });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });

  it("TC08 - 정상 경로(≥90개) → writeFileSync 호출", async () => {
    mockAxiosGet.mockResolvedValue({ data: makeHtml(makeTable(["Ticker", "Company"], make90Rows())) });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
  });

  it("TC09 - 저장 JSON 구조 검증 (updated_at·source·tickers)", async () => {
    mockAxiosGet.mockResolvedValue({ data: makeHtml(makeTable(["Ticker", "Company"], make90Rows())) });
    await import("../fetch/update_nasdaq100.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      updated_at: string; source: string; total_count: number; tickers: string[];
    };
    expect(saved).toHaveProperty("updated_at");
    expect(saved.source).toContain("Nasdaq-100");
    expect(saved.total_count).toBeGreaterThanOrEqual(90);
    expect(Array.isArray(saved.tickers)).toBe(true);
  });
});
