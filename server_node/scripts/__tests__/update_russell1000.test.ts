/**
 * update_russell1000.ts 테스트
 *
 * TC 계획:
 *   TC01  parseRow() - 단순 CSV 행 파싱
 *   TC02  parseRow() - 따옴표 내 쉼표 처리
 *   TC03  parseRow() - 빈 필드 포함 행
 *   TC04  parseRow() - 따옴표만 있는 필드
 *   TC05  parseCsv() - 정상 CSV → Equity 티커만 반환
 *   TC06  parseCsv() - UTF-8 BOM 제거 후 파싱
 *   TC07  parseCsv() - "ticker"+"asset class" 헤더 탐색 (대소문자 무관)
 *   TC08  parseCsv() - 헤더 없음 → Error("헤더 행")
 *   TC09  parseCsv() - non-Equity(Cash, Futures, "-") 제외
 *   TC10  parseCsv() - 빈 ticker("-") 제외
 *   TC11  main()     - HTML 응답 감지 → Error throw
 *   TC12  main()     - 파싱 결과 0개 → Error throw
 *   TC13  main()     - 정상 경로 → writeFileSync 호출 확인
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRow, parseCsv, main } from "../fetch/update_russell1000.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const { mockWriteFileSync, mockMkdirSync, mockAxiosGet } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockMkdirSync:     vi.fn(),
  mockAxiosGet:      vi.fn(),
}));

// ── fs 모킹 ──────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    readFileSync:  vi.fn(),
  },
}));

// ── axios 모킹 ────────────────────────────────────────────────────────────────

vi.mock("axios", () => ({
  default: { get: (...a: unknown[]) => mockAxiosGet(...a) },
}));

// ── 헬퍼: 샘플 CSV 생성 ───────────────────────────────────────────────────────

function makeCsv(rows: string[][], extraHeader = ""): string {
  const header = `Ticker,Name,Asset Class${extraHeader}`;
  return [header, ...rows.map((r) => r.join(","))].join("\n");
}

// ── TC01~04: parseRow() ──────────────────────────────────────────────────────

describe("parseRow()", () => {
  it("TC01 - 단순 CSV 행 파싱", () => {
    expect(parseRow("AAPL,Apple Inc,Equity")).toEqual(["AAPL", "Apple Inc", "Equity"]);
  });

  it("TC02 - 따옴표 내 쉼표 처리", () => {
    expect(parseRow(`AAPL,"Apple, Inc",Equity`)).toEqual(["AAPL", "Apple, Inc", "Equity"]);
  });

  it("TC03 - 빈 필드 포함", () => {
    expect(parseRow("AAPL,,Equity")).toEqual(["AAPL", "", "Equity"]);
  });

  it("TC04 - 따옴표만 있는 필드", () => {
    expect(parseRow(`"","test",`)).toEqual(["", "test", ""]);
  });
});

// ── TC05~10: parseCsv() ──────────────────────────────────────────────────────

describe("parseCsv()", () => {
  it("TC05 - Equity만 반환", () => {
    const csv = makeCsv([
      ["AAPL", "Apple", "Equity"],
      ["XFUND", "SomeFund", "Cash"],
      ["MSFT", "Microsoft", "Equity"],
    ]);
    expect(parseCsv(csv)).toEqual(["AAPL", "MSFT"]);
  });

  it("TC06 - UTF-8 BOM(\\uFEFF) 제거 후 정상 파싱", () => {
    expect(parseCsv("\uFEFFTicker,Name,Asset Class\nAAPL,Apple,Equity")).toEqual(["AAPL"]);
  });

  it('TC07 - 헤더 대소문자 무관 탐색 ("TICKER","ASSET CLASS")', () => {
    expect(parseCsv("TICKER,NAME,ASSET CLASS\nAAPL,Apple,equity")).toEqual(["AAPL"]);
  });

  it("TC08 - 헤더 없음 → Error 발생", () => {
    expect(() => parseCsv("Symbol,Name,Type\nAAPL,Apple,Equity")).toThrow("헤더 행");
  });

  it("TC09 - Cash / Futures / '-' ticker 제외", () => {
    const csv = makeCsv([
      ["-",    "Cash",        "Cash"],
      ["FUTS", "SomeFutures", "futures"],
      ["REAL", "RealStock",   "Equity"],
    ]);
    expect(parseCsv(csv)).toEqual(["REAL"]);
  });

  it("TC10 - 빈 ticker 제외", () => {
    expect(parseCsv("Ticker,Name,Asset Class\n,Empty,Equity\nAAPL,Apple,Equity")).toEqual(["AAPL"]);
  });
});

// ── TC11~13: main() ───────────────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC11 - HTML 응답 감지 → Error throw", async () => {
    mockAxiosGet.mockResolvedValue({ data: "<!DOCTYPE html><html>...</html>" });
    await expect(main()).rejects.toThrow();
  });

  it("TC12 - 파싱 티커 0개 → Error throw", async () => {
    mockAxiosGet.mockResolvedValue({
      data: "Ticker,Name,Asset Class\nCASH,Dollar,Cash",
    });
    await expect(main()).rejects.toThrow("파싱된 종목이 없습니다");
  });

  it("TC13 - 정상 경로 → writeFileSync 호출", async () => {
    const csv = "Ticker,Name,Asset Class\nAAPL,Apple,Equity\nMSFT,Microsoft,Equity";
    mockAxiosGet.mockResolvedValue({ data: csv });
    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { tickers: string[] };
    expect(saved.tickers).toContain("AAPL");
    expect(saved.tickers).toContain("MSFT");
  });
});
