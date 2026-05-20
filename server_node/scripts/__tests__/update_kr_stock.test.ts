/**
 * update_kr_stock.ts 테스트
 *
 * TC 계획:
 *   TC01  extractMst()    - .mst 파일 없는 ZIP → main() Error throw
 *   TC02  extractMst()    - .mst 파일 포함 ZIP → 파싱 단계까지 진행(minCount 에러)
 *   TC03  filterAndRank() - groupCode !== "ST" 필터링
 *   TC04  filterAndRank() - 코드 길이 != 6 필터링
 *   TC05  filterAndRank() - marketCap 내림차순 정렬
 *   TC06  filterAndRank() - topN 개수 제한
 *   TC07  filterAndRank() - 빈 배열 입력 → 빈 배열 반환
 *   TC08  main()          - 파싱 결과 < minCount → Error throw
 *   TC09  saveJson()      - tickers / name_map / yahooSuffix 구조 검증
 *   TC10  saveJson()      - Yahoo Suffix .KS / .KQ 적용 확인
 *   TC11  parseMst()      - 정상 라인 파싱: code/name/groupCode/marketCap 추출
 *   TC12  parseMst()      - byteSize 이하 라인 무시 / marketCap 빈 → 0
 *   TC13  saveJson()      - writeFileSync 호출 + JSON 구조 확인
 *   TC14  main()          - kospi + kosdaq 모두 성공 → writeFileSync 2회 호출
 *   TC15  main()          - kosdaq axios 실패 → Error throw
 *   TC16  main()          - parseMst groupCode 필터 → minCount 미달 → Error throw
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseMst, filterAndRank, saveJson, main } from "../fetch/update_kr_stock.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockGetEntries, mockIconvDecode,
  mockWriteFileSync, mockMkdirSync,
  mockAxiosGet,
} = vi.hoisted(() => ({
  mockGetEntries:    vi.fn<[], { entryName: string; getData: () => Buffer }[]>(() => []),
  mockIconvDecode:   vi.fn((_buf: unknown, _enc: string) => ""),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync:     vi.fn(),
  mockAxiosGet:      vi.fn(),
}));

// ── adm-zip 모킹 ──────────────────────────────────────────────────────────────

vi.mock("adm-zip", () => ({
  default: class MockAdmZip {
    constructor(_buf: unknown) {}
    getEntries() { return mockGetEntries(); }
  },
}));

// ── iconv-lite 모킹 ───────────────────────────────────────────────────────────

vi.mock("iconv-lite", () => ({
  default: { decode: (...a: unknown[]) => mockIconvDecode(...a) },
}));

// ── fs 모킹 ──────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
  },
}));

// ── axios 모킹 ────────────────────────────────────────────────────────────────

vi.mock("axios", () => ({
  default: { get: (...a: unknown[]) => mockAxiosGet(...a) },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

interface ParsedRow { code: string; name: string; capSize: string; marketCap: number; groupCode: string; }

function makeRow(code: string, groupCode: string, marketCap: number, name = "테스트"): ParsedRow {
  return { code, name, capSize: "대", marketCap, groupCode };
}

function setupMstEntry(content = ""): void {
  mockGetEntries.mockReturnValue([{
    entryName: "kospi_code.mst",
    getData:   () => Buffer.from(content, "utf8"),
  }]);
}

function setupNoMstEntry(): void {
  mockGetEntries.mockReturnValue([{ entryName: "readme.txt", getData: () => Buffer.from("") }]);
}

// KOSPI 파라미터 상수
const KOSPI_BYTE_SIZE     = 228;
const KOSPI_PART1         = ["단축코드", "표준코드", "한글명"] as const;
const KOSPI_PART2_COLS    = ["그룹코드", "시가총액규모"] as const;
const KOSPI_FIELD_SPECS   = [2, 1] as const;
const KOSPI_GROUP         = "그룹코드";
const KOSPI_CAPSIZE       = "시가총액규모";
const KOSPI_NAME          = "한글명";
const KOSPI_MARKET_CAP_POS   = 212;
const KOSPI_MARKET_CAP_WIDTH = 9;

function makeKospiLine(code: string, name: string, groupCode: string, marketCap: number): string {
  const frontPart    = code.padEnd(9) + "KR7".padEnd(12) + name;
  const marketCapStr = String(marketCap).padStart(9, " ");
  const part2Content = groupCode.padEnd(2).slice(0, 2) + "대" + " ".repeat(209) + marketCapStr + " ".repeat(6);
  return frontPart + part2Content;
}

// ── TC01~02: extractMst() (main() 통해 간접 검증) ────────────────────────────

describe("extractMst() 간접 검증", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC01 - .mst 없는 ZIP → main() Error throw", async () => {
    setupNoMstEntry();
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    await expect(main()).rejects.toThrow(".mst 파일을 ZIP에서 찾을 수 없습니다");
  });

  it("TC02 - .mst 포함 ZIP → 파싱 단계 진행 → minCount 미달 Error throw", async () => {
    setupMstEntry("");
    mockIconvDecode.mockReturnValue("");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    await expect(main()).rejects.toThrow("파싱 결과가 너무 적습니다");
  });
});

// ── TC03~07: filterAndRank() ──────────────────────────────────────────────────

describe("filterAndRank()", () => {
  it("TC03 - groupCode !== 'ST' 필터링", () => {
    const rows = [
      makeRow("005930", "ST", 1000),
      makeRow("005935", "PF", 2000),
      makeRow("000660", "ST", 800),
    ];
    expect(filterAndRank(rows, 10).map((r) => r.code)).toEqual(["005930", "000660"]);
  });

  it("TC04 - 코드 길이 != 6 필터링", () => {
    const rows = [
      makeRow("005930",  "ST", 1000),
      makeRow("12345",   "ST", 2000),
      makeRow("1234567", "ST", 3000),
    ];
    expect(filterAndRank(rows, 10).length).toBe(1);
  });

  it("TC05 - marketCap 내림차순 정렬", () => {
    const rows = [
      makeRow("000001", "ST", 300),
      makeRow("000002", "ST", 100),
      makeRow("000003", "ST", 500),
      makeRow("000004", "ST", 200),
    ];
    expect(filterAndRank(rows, 10).map((r) => r.marketCap)).toEqual([500, 300, 200, 100]);
  });

  it("TC06 - topN 개수 제한", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeRow(String(i + 1).padStart(6, "0"), "ST", 1000 - i)
    );
    expect(filterAndRank(rows, 5).length).toBe(5);
  });

  it("TC07 - 빈 배열 → 빈 배열", () => {
    expect(filterAndRank([], 10)).toEqual([]);
  });
});

// ── TC08: main() minCount 에러 ────────────────────────────────────────────────

describe("main() minCount 에러", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC08 - 파싱 결과 < minCount → Error throw", async () => {
    setupMstEntry("");
    mockIconvDecode.mockReturnValue("");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    await expect(main()).rejects.toThrow("파싱 결과가 너무 적습니다");
  });
});

// ── TC09~10·TC13: saveJson() ──────────────────────────────────────────────────

describe("saveJson()", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC09 - tickers / name_map 구조 확인", () => {
    const rows: ParsedRow[] = [
      { code: "005930", name: "삼성전자",  capSize: "대", marketCap: 500_000, groupCode: "ST" },
      { code: "000660", name: "SK하이닉스", capSize: "대", marketCap: 300_000, groupCode: "ST" },
    ];
    saveJson(rows, "https://example.com/kospi.zip", "/fake/kospi.json", ".KS");
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written.tickers).toContain("005930.KS");
    expect(written.name_map["005930.KS"]).toBe("삼성전자");
    expect(written.total_count).toBe(2);
  });

  it("TC10 - Yahoo Suffix .KS / .KQ 적용 확인", () => {
    const ksRow: ParsedRow = { code: "005930", name: "삼성전자", capSize: "대", marketCap: 1, groupCode: "ST" };
    const kqRow: ParsedRow = { code: "035720", name: "카카오",   capSize: "대", marketCap: 1, groupCode: "ST" };
    saveJson([ksRow], "https://example.com/kospi.zip", "/fake/kospi.json", ".KS");
    saveJson([kqRow], "https://example.com/kosdaq.zip", "/fake/kosdaq.json", ".KQ");
    const written1 = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    const written2 = JSON.parse(mockWriteFileSync.mock.calls[1]![1] as string);
    expect(written1.tickers[0]).toBe("005930.KS");
    expect(written2.tickers[0]).toBe("035720.KQ");
  });

  it("TC13 - writeFileSync 호출 + JSON 구조 확인", () => {
    const rows: ParsedRow[] = [
      { code: "005930", name: "삼성전자", capSize: "대", marketCap: 500_000, groupCode: "ST" },
    ];
    saveJson(rows, "https://example.com/kospi.zip", "/fake/output.json", ".KS");
    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
    expect(written).toHaveProperty("updated_at");
    expect(written).toHaveProperty("tickers");
    expect(written).toHaveProperty("name_map");
    expect(written.name_map["005930.KS"]).toBe("삼성전자");
  });
});

// ── TC11~12: parseMst() ───────────────────────────────────────────────────────

describe("parseMst()", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC11 - 정상 라인 파싱: code/name/groupCode/marketCap 추출", () => {
    const line = makeKospiLine("005930", "삼성전자", "ST", 500_000);
    mockIconvDecode.mockReturnValue(line);
    const rows = parseMst(
      Buffer.from(""),
      KOSPI_BYTE_SIZE, KOSPI_PART1, KOSPI_PART2_COLS,
      KOSPI_FIELD_SPECS, KOSPI_GROUP, KOSPI_CAPSIZE, KOSPI_NAME,
      KOSPI_MARKET_CAP_POS, KOSPI_MARKET_CAP_WIDTH,
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.code).toBe("005930");
    expect(rows[0]!.name).toBe("삼성전자");
    expect(rows[0]!.groupCode).toBe("ST");
    expect(rows[0]!.marketCap).toBe(500_000);
  });

  it("TC12 - byteSize 이하 라인 무시 / marketCap 빈 문자열 → 0", () => {
    const shortLine  = "짧은라인";
    const zeroCapLine = makeKospiLine("000001", "테스트", "ST", 0);
    mockIconvDecode.mockReturnValue(shortLine + "\n" + zeroCapLine);
    const rows = parseMst(
      Buffer.from(""),
      KOSPI_BYTE_SIZE, KOSPI_PART1, KOSPI_PART2_COLS,
      KOSPI_FIELD_SPECS, KOSPI_GROUP, KOSPI_CAPSIZE, KOSPI_NAME,
      KOSPI_MARKET_CAP_POS, KOSPI_MARKET_CAP_WIDTH,
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.marketCap).toBe(0);
  });
});

// ── TC14~16: main() 정상 흐름 ────────────────────────────────────────────────

describe("main() 정상 흐름", () => {
  beforeEach(() => { vi.clearAllMocks(); mockIconvDecode.mockReturnValue(""); });

  it("TC14 - kospi + kosdaq 모두 성공 → writeFileSync 2회 호출", async () => {
    const kospiLines = Array.from({ length: 200 }, (_, i) =>
      makeKospiLine(String(i + 1).padStart(6, "0"), `코스피${i + 1}`, "ST", 100_000 + i)
    ).join("\n");

    function makeKosdaqLine(code: string, name: string): string {
      const frontPart    = code.padEnd(9) + "KR8".padEnd(12) + name;
      const part2Content = "ST" + "중" + " ".repeat(213) + "10000";
      return frontPart + part2Content;
    }
    const kosdaqLines = Array.from({ length: 150 }, (_, i) =>
      makeKosdaqLine(String(i + 200001).padStart(6, "0"), `코스닥${i + 1}`)
    ).join("\n");

    mockIconvDecode
      .mockReturnValueOnce(kospiLines)
      .mockReturnValueOnce(kosdaqLines);

    setupMstEntry("dummy");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    await main();
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
  });

  it("TC15 - kosdaq axios 실패 → Error throw", async () => {
    const kospiLines = Array.from({ length: 200 }, (_, i) =>
      makeKospiLine(String(i + 1).padStart(6, "0"), `종목${i + 1}`, "ST", 100_000 + i)
    ).join("\n");
    mockIconvDecode.mockReturnValueOnce(kospiLines).mockReturnValueOnce("");

    setupMstEntry("dummy");
    mockAxiosGet
      .mockResolvedValueOnce({ data: Buffer.from("").buffer })
      .mockRejectedValueOnce(new Error("KOSDAQ 네트워크 오류"));

    await expect(main()).rejects.toThrow("KOSDAQ 네트워크 오류");
  });

  it("TC16 - groupCode 필터 → minCount 미달 → Error throw", async () => {
    const pfLines = Array.from({ length: 200 }, (_, i) =>
      makeKospiLine(String(i + 1).padStart(6, "0"), `우선주${i + 1}`, "PF", 100_000)
    ).join("\n");
    mockIconvDecode.mockReturnValueOnce(pfLines);

    setupMstEntry("dummy");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    await expect(main()).rejects.toThrow("파싱 결과가 너무 적습니다");
  });
});
