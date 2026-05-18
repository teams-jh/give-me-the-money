/**
 * update_nasdaq100.ts 테스트
 *
 * TC 계획:
 *   TC01  parseWikipediaHtml() - wikitable + Ticker 컬럼 → 정상 파싱
 *   TC02  parseWikipediaHtml() - 여러 테이블 중 "Ticker" 컬럼 있는 것만 처리
 *   TC03  parseWikipediaHtml() - 각주([1], *) 제거 후 첫 토큰만 사용
 *   TC04  parseWikipediaHtml() - 정규식 [A-Z]{1~5} 벗어난 티커 무시
 *   TC05  parseWikipediaHtml() - Symbol 컬럼명도 인식
 *   TC06  parseWikipediaHtml() - Ticker 컬럼 없는 테이블 → 빈 배열
 *   TC07  main()               - 파싱 < 90개 → Error + process.exit(1)
 *   TC08  main()               - 정상 경로(≥90개) → writeFileSync 호출
 *   TC09  main()               - 저장 JSON 구조 검증 (updated_at, source, tickers)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── parseWikipediaHtml 인라인 재현 ──────────────────────────────────────────
// update_nasdaq100.ts 내부 함수 동일 로직 (export 없으므로 인라인)

import * as cheerioLib from "cheerio";

function parseWikipediaHtml(html: string): string[] {
  const $ = cheerioLib.load(html);
  const tickers: string[] = [];

  $("table.wikitable").each((_tableIdx: number, table: cheerioLib.AnyNode) => {
    const headers: string[] = [];
    $(table).find("tr").first().find("th").each((_i: number, th: cheerioLib.AnyNode) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    const tickerColIdx = headers.findIndex(
      (h) => h.includes("ticker") || h.includes("symbol")
    );
    if (tickerColIdx === -1) return;

    $(table).find("tr").slice(1).each((_rowIdx: number, row: cheerioLib.AnyNode) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return;
      const rawTicker = $(cells[tickerColIdx]).text().trim();
      const ticker    = rawTicker.replace(/\[.*?\]|\*/g, "").split(/\s+/)[0] ?? "";
      if (ticker && /^[A-Z]{1,5}$/.test(ticker)) tickers.push(ticker);
    });
  });

  return tickers;
}

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

// ── 헬퍼: wikitable HTML 생성 ────────────────────────────────────────────────

function makeWikiTable(headers: string[], rows: string[][]): string {
  const headerRow  = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const dataRows   = rows.map(
    (cols) => `<tr>${cols.map((c) => `<td>${c}</td>`).join("")}</tr>`
  ).join("");
  return `<table class="wikitable">${headerRow}${dataRows}</table>`;
}

function makeHtml(tables: string[]): string {
  return `<html><body>${tables.join("")}</body></html>`;
}

// ── 90개 유효 티커 생성 (알파벳 대문자만, /^[A-Z]{1,5}$/ 통과) ──────────────
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function make90Tickers(): string[][] {
  // AA, AB, ... AZ, BA, BB, ... (26*4=104개 중 90개)
  return Array.from({ length: 90 }, (_, i) => {
    const ticker = (ALPHA[Math.floor(i / 26)] ?? "A") + (ALPHA[i % 26] ?? "A");
    return [ticker, "Company"];
  });
}

// ── TC01~06: parseWikipediaHtml() ─────────────────────────────────────────────

describe("parseWikipediaHtml()", () => {
  it("TC01 - Ticker 컬럼에서 정상 파싱", () => {
    const html = makeHtml([
      makeWikiTable(["Company", "Ticker"], [
        ["Apple Inc", "AAPL"],
        ["Microsoft", "MSFT"],
        ["Amazon",    "AMZN"],
      ]),
    ]);
    const result = parseWikipediaHtml(html);
    expect(result).toEqual(["AAPL", "MSFT", "AMZN"]);
  });

  it("TC02 - 여러 테이블 중 Ticker 컬럼 있는 것만 처리", () => {
    const html = makeHtml([
      makeWikiTable(["Name", "Year"],          [["Apple", "2024"]]),  // Ticker 없음 → 무시
      makeWikiTable(["Ticker", "Company"],     [["GOOG", "Google"]]),
    ]);
    const result = parseWikipediaHtml(html);
    expect(result).toEqual(["GOOG"]);
  });

  it("TC03 - 각주([1], *) 제거", () => {
    const html = makeHtml([
      makeWikiTable(["Ticker", "Company"], [
        ["AAPL[1]",  "Apple"],
        ["MSFT *",   "Microsoft"],
        ["NVDA[10]", "Nvidia"],
      ]),
    ]);
    const result = parseWikipediaHtml(html);
    expect(result).toContain("AAPL");
    expect(result).toContain("MSFT");
    expect(result).toContain("NVDA");
  });

  it("TC04 - 소문자·숫자 섞인 ticker 무시", () => {
    const html = makeHtml([
      makeWikiTable(["Ticker", "Company"], [
        ["aapl",    "lowercase"],   // 소문자 → 무시
        ["AAPL123", "with digit"],  // 숫자 포함 → 무시
        ["VALID",   "ok"],
      ]),
    ]);
    const result = parseWikipediaHtml(html);
    expect(result).toEqual(["VALID"]);
  });

  it("TC05 - Symbol 컬럼명도 인식", () => {
    const html = makeHtml([
      makeWikiTable(["Company", "Symbol"], [["Apple", "AAPL"]]),
    ]);
    expect(parseWikipediaHtml(html)).toContain("AAPL");
  });

  it("TC06 - Ticker 컬럼 없는 테이블 → 빈 배열", () => {
    const html = makeHtml([makeWikiTable(["Name", "Year"], [["Apple", "2024"]])]);
    expect(parseWikipediaHtml(html)).toEqual([]);
  });
});

// ── TC07~09: main() ───────────────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC07 - 파싱 티커 < 90개 → process.exit(1)", async () => {
    const html = makeHtml([
      makeWikiTable(["Ticker", "Company"], [["AAPL", "Apple"]]),  // 1개만
    ]);
    mockAxiosGet.mockResolvedValue({ data: html });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_nasdaq100.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("TC08 - 정상 경로(≥90개) → writeFileSync 호출", async () => {
    const rows = make90Tickers();
    const html = makeHtml([makeWikiTable(["Ticker", "Company"], rows)]);
    mockAxiosGet.mockResolvedValue({ data: html });
    await import("../fetch/update_nasdaq100.js");
    // main()은 fire-and-forget → vi.waitFor로 완료 대기
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
  });

  it("TC09 - 저장 JSON 구조 검증", async () => {
    const rows = make90Tickers();
    const html = makeHtml([makeWikiTable(["Ticker", "Company"], rows)]);
    mockAxiosGet.mockResolvedValue({ data: html });
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
