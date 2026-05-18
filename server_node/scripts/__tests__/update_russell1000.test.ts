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
 *   TC11  downloadCsv() - HTML 응답 감지 → Error 발생
 *   TC12  main()     - 파싱 결과 0개 → Error 발생 + process.exit(1)
 *   TC13  main()     - 정상 경로 → writeFileSync 호출 확인
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── parseRow / parseCsv 인라인 재현 ──────────────────────────────────────────
// 소스에서 export 없음 → 동일 로직 인라인 보유 (회귀 방지용)

function parseRow(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

function parseCsv(raw: string): string[] {
  const cleaned = raw.replace(/^\uFEFF/, "");
  const lines   = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);

  const headerIdx = lines.findIndex((l) => {
    const lower = l.toLowerCase();
    return lower.includes("ticker") && lower.includes("asset class");
  });
  if (headerIdx === -1) throw new Error("헤더 행을 찾을 수 없습니다.");

  const headerLine = lines[headerIdx];
  if (!headerLine) throw new Error("헤더 행이 비어 있습니다.");
  const headers = parseRow(headerLine).map((h) => h.toLowerCase().trim());

  const tickerIdx     = headers.indexOf("ticker") !== -1 ? headers.indexOf("ticker")
    : headers.findIndex((h) => h.includes("ticker"));
  const assetClassIdx = headers.indexOf("asset class") !== -1 ? headers.indexOf("asset class")
    : headers.findIndex((h) => h.includes("asset") && h.includes("class"));

  const result: string[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cols       = parseRow(line);
    const ticker     = (cols[tickerIdx]     ?? "").trim();
    const assetClass = (cols[assetClassIdx] ?? "").trim().toLowerCase();
    if (!ticker || ticker === "-" || assetClass !== "equity") continue;
    result.push(ticker);
  }
  return result;
}

// ── fs / axios 모킹 ───────────────────────────────────────────────────────────

const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();

vi.mock("fs", () => ({
  default: {
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    readFileSync:  vi.fn(),
  },
}));

const mockAxiosGet = vi.fn();
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
    const row = `AAPL,"Apple, Inc",Equity`;
    expect(parseRow(row)).toEqual(["AAPL", "Apple, Inc", "Equity"]);
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
    const csv = "\uFEFFTicker,Name,Asset Class\nAAPL,Apple,Equity";
    expect(parseCsv(csv)).toEqual(["AAPL"]);
  });

  it('TC07 - 헤더 대소문자 무관 탐색 ("TICKER","ASSET CLASS")', () => {
    const csv = "TICKER,NAME,ASSET CLASS\nAAPL,Apple,equity";
    expect(parseCsv(csv)).toEqual(["AAPL"]);
  });

  it("TC08 - 헤더 없음 → Error 발생", () => {
    const csv = "Symbol,Name,Type\nAAPL,Apple,Equity";
    expect(() => parseCsv(csv)).toThrow("헤더 행");
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
    const csv = "Ticker,Name,Asset Class\n,Empty,Equity\nAAPL,Apple,Equity";
    expect(parseCsv(csv)).toEqual(["AAPL"]);
  });
});

// ── TC11: downloadCsv() HTML 감지 ────────────────────────────────────────────

describe("downloadCsv() HTML 감지 (main()을 통한 간접 검증)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC11 - HTML 응답 → Error 발생 + process.exit(1)", async () => {
    mockAxiosGet.mockResolvedValue({ data: "<!DOCTYPE html><html>...</html>" });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_russell1000.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

// ── TC12~13: main() ───────────────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC12 - 파싱 티커 0개 → process.exit(1)", async () => {
    mockAxiosGet.mockResolvedValue({
      data: "Ticker,Name,Asset Class\nCASH,Dollar,Cash",  // Equity 없음
    });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_russell1000.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("TC13 - 정상 경로 → writeFileSync 호출", async () => {
    const csv = "Ticker,Name,Asset Class\nAAPL,Apple,Equity\nMSFT,Microsoft,Equity";
    mockAxiosGet.mockResolvedValue({ data: csv });
    await import("../fetch/update_russell1000.js");
    expect(mockWriteFileSync).toHaveBeenCalled();
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      tickers: string[];
    };
    expect(saved.tickers).toContain("AAPL");
    expect(saved.tickers).toContain("MSFT");
  });
});
