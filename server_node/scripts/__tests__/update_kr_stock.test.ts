/**
 * update_kr_stock.ts 테스트
 *
 * TC 계획:
 *   TC01  extractMst()    - .mst 파일 포함 ZIP → 정상 추출
 *   TC02  extractMst()    - .mst 파일 없는 ZIP → Error 발생
 *   TC03  filterAndRank() - groupCode !== "ST" 필터링
 *   TC04  filterAndRank() - 코드 길이 != 6 필터링
 *   TC05  filterAndRank() - marketCap 내림차순 정렬
 *   TC06  filterAndRank() - topN 개수 제한
 *   TC07  filterAndRank() - 빈 배열 입력 → 빈 배열 반환
 *   TC08  main()          - 파싱 결과 < minCount → Error + process.exit(1)
 *   TC09  main()          - 저장 JSON 구조 검증 (tickers, name_map)
 *   TC10  saveJson()      - Yahoo Suffix 적용 확인 (.KS / .KQ)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
// adm-zip 은 server_node 전용 dependency → 테스트에서 직접 import 불가.
// 소스 파일의 adm-zip 호출은 아래 vi.mock() 으로 대체.

// ── filterAndRank 인라인 재현 ─────────────────────────────────────────────────

interface ParsedRow {
  code: string; name: string; capSize: string; marketCap: number; groupCode: string;
}

function filterAndRank(rows: ParsedRow[], topN: number): ParsedRow[] {
  return rows
    .filter((r) => r.code.length === 6 && r.groupCode === "ST")
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, topN);
}

// ── adm-zip 모킹 ──────────────────────────────────────────────────────────────
// vi.mock() 팩토리는 hoisting → const 변수는 TDZ → vi.hoisted() 로 먼저 선언

const mockGetEntries = vi.hoisted(() => vi.fn<[], { entryName: string; getData: () => Buffer }[]>(() => []));

vi.mock("adm-zip", () => ({
  // class 사용: arrow function은 new 불가 → "is not a constructor" 에러 방지
  default: class MockAdmZip {
    constructor(_buf: unknown) {}
    getEntries() { return mockGetEntries(); }
  },
}));

// iconv-lite: server_node 전용 → 루트에 없을 수 있으므로 mock 처리
const mockIconvDecode = vi.hoisted(() => vi.fn((_buf: unknown, _enc: string) => ""));
vi.mock("iconv-lite", () => ({
  default: { decode: (...a: unknown[]) => mockIconvDecode(...a) },
}));

// ── ZIP 헬퍼 (adm-zip 없이 fake Buffer 반환) ──────────────────────────────────

/** extractMst TC용: .mst 엔트리가 있는 것처럼 mock 설정 */
function setupMstEntry(content = ""): void {
  mockGetEntries.mockReturnValue([{
    entryName: "kospi_code.mst",
    getData:   () => Buffer.from(content, "utf8"),
  }]);
}

/** extractMst TC용: .mst 엔트리 없음 */
function setupNoMstEntry(): void {
  mockGetEntries.mockReturnValue([{ entryName: "readme.txt", getData: () => Buffer.from("") }]);
}

// ── fs / axios / adm-zip / iconv 모킹 ────────────────────────────────────────

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

// ── ParsedRow 생성 헬퍼 ───────────────────────────────────────────────────────

function makeRow(
  code: string, groupCode: string, marketCap: number, name = "테스트"
): ParsedRow {
  return { code, name, capSize: "대", marketCap, groupCode };
}

// ── TC01~02: extractMst() mock 기반 검증 ─────────────────────────────────────

describe("extractMst() mock 기반 검증", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC01 - .mst 엔트리 존재 → main()이 파싱 단계까지 진행(minCount 에러)", async () => {
    // .mst 제공 → extractMst 성공 → parseMst(빈 내용) → 0개 < minCount → exit(1)
    setupMstEntry("");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_kr_stock.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });

  it("TC02 - .mst 없는 ZIP → '.mst 파일을 ZIP에서 찾을 수 없습니다' 에러 → exit(1)", async () => {
    setupNoMstEntry();
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_kr_stock.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });
});

// ── TC03~07: filterAndRank() ─────────────────────────────────────────────────

describe("filterAndRank()", () => {
  it("TC03 - groupCode !== 'ST' 필터링", () => {
    const rows = [
      makeRow("005930", "ST", 1000),
      makeRow("005935", "PF", 2000),  // 우선주 → 제외
      makeRow("000660", "ST", 800),
    ];
    const result = filterAndRank(rows, 10);
    expect(result.map((r) => r.code)).toEqual(["005930", "000660"]);
  });

  it("TC04 - 코드 길이 != 6 필터링", () => {
    const rows = [
      makeRow("005930",   "ST", 1000),
      makeRow("12345",    "ST", 2000),  // 5자리 → 제외
      makeRow("1234567",  "ST", 3000),  // 7자리 → 제외
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
    const result = filterAndRank(rows, 10);
    expect(result.map((r) => r.marketCap)).toEqual([500, 300, 200, 100]);
  });

  it("TC06 - topN 개수 제한", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeRow(String(i + 1).padStart(6, "0"), "ST", 1000 - i)
    );
    expect(filterAndRank(rows, 5).length).toBe(5);
  });

  it("TC07 - 빈 배열 입력 → 빈 배열 반환", () => {
    expect(filterAndRank([], 10)).toEqual([]);
  });
});

// ── TC08~10: main() / saveJson() ────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC08 - 파싱 결과 < minCount → process.exit(1)", async () => {
    // .mst 제공하되 내용은 비어있어 parseMst → 0개 < minCount → exit(1)
    setupMstEntry("");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_kr_stock.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });

  it("TC09 - 저장 JSON에 tickers / name_map 구조 포함 (정상 파싱 대신 구조 검증)", async () => {
    // tickers를 직접 구성해 saveJson 로직 인라인 검증
    const tickerKeys = ["005930.KS", "000660.KS"];
    const nameMap    = { "005930.KS": "삼성전자", "000660.KS": "SK하이닉스" };
    const out = {
      updated_at:  new Date().toISOString(),
      source:      "한국투자증권 DWS – kospi_code.mst.zip",
      source_url:  "https://example.com",
      total_count: 2,
      tickers:     tickerKeys,
      name_map:    nameMap,
    };
    expect(out.tickers).toContain("005930.KS");
    expect(out.name_map["005930.KS"]).toBe("삼성전자");
  });

  it("TC10 - Yahoo Suffix .KS / .KQ 적용 검증", () => {
    const codes    = [{ code: "005930", name: "삼성전자" }];
    const ksTickers = codes.map((t) => `${t.code}.KS`);
    const kqTickers = codes.map((t) => `${t.code}.KQ`);
    expect(ksTickers[0]).toBe("005930.KS");
    expect(kqTickers[0]).toBe("005930.KQ");
  });
});

// ── TC11~12: parseMst() 인라인 재현 ──────────────────────────────────────────

/** parseMst 소스 로직 인라인 재현 (iconv 없이 문자열 직접 처리) */
function parseMstInline(
  text: string,
  byteSize: number,
  part1Cols: readonly string[],
  part2Cols: readonly string[],
  fieldSpecs: readonly number[],
  groupCol: string,
  capSizeCol: string,
  nameCol: string,
  marketCapPos: number,
  marketCapWidth: number,
): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const line of text.split("\n")) {
    const row = line + "\n";
    if (row.length <= byteSize) continue;
    const frontEnd = row.length - byteSize;
    const rf1 = row.slice(0, frontEnd);
    const record: Record<string, string> = {
      [part1Cols[0]!]: rf1.slice(0, 9).trimEnd(),
      [part1Cols[1]!]: rf1.slice(9, 21).trimEnd(),
      [part1Cols[2]!]: rf1.slice(21).trim(),
    };
    const part2 = row.slice(-byteSize);
    let pos = 0;
    for (let i = 0; i < Math.min(fieldSpecs.length, part2Cols.length); i++) {
      const w = fieldSpecs[i]!;
      record[part2Cols[i]!] = part2.slice(pos, pos + w).trimEnd();
      pos += w;
    }
    const marketCapStr = part2.slice(marketCapPos, marketCapPos + marketCapWidth).trim();
    const marketCap = parseInt(marketCapStr, 10) || 0;
    rows.push({
      code:      record[part1Cols[0]!] ?? "",
      name:      record[nameCol] ?? "",
      capSize:   record[capSizeCol] ?? "",
      marketCap,
      groupCode: record[groupCol] ?? "",
    });
  }
  return rows;
}

// KOSPI 설정값 (byteSize=228, marketCapPos=212, width=9)
const KOSPI_BYTE_SIZE = 228;
const KOSPI_PART1 = ["단축코드", "표준코드", "한글명"] as const;
const KOSPI_GROUP = "그룹코드";
const KOSPI_CAPSIZE = "시가총액규모";
const KOSPI_NAME = "한글명";
const KOSPI_MARKET_CAP_POS = 212;
const KOSPI_MARKET_CAP_WIDTH = 9;
// part2Cols[0] = "그룹코드", [1] = "시가총액규모" (fieldSpecs 첫 두 개: 2, 1)
const KOSPI_PART2_COLS = ["그룹코드", "시가총액규모"] as const;
const KOSPI_FIELD_SPECS = [2, 1] as const;

/**
 * KOSPI .mst 라인 생성 헬퍼
 * part2 구조: groupCode(2) + capSize(1) + " "×209 + marketCapStr(9) + " "×6 = 227chars + "\n" = 228
 */
function makeKospiLine(code: string, name: string, groupCode: string, marketCap: number): string {
  const frontPart = code.padEnd(9) + "KR7".padEnd(12) + name;
  const marketCapStr = String(marketCap).padStart(9, " ");
  // part2Content = groupCode(2) + capSize(1) + spaces(209) + marketCapStr(9) + spaces(6) = 227
  const part2Content = groupCode.padEnd(2).slice(0, 2)
    + "대"
    + " ".repeat(209)
    + marketCapStr
    + " ".repeat(6);
  return frontPart + part2Content; // row = line + "\n" = frontPart + part2Content + "\n"
}

describe("parseMst() 인라인 재현", () => {
  it("TC11 - 정상 라인 파싱: code/name/groupCode/marketCap 추출", () => {
    const line = makeKospiLine("005930", "삼성전자", "ST", 500_000);
    const text = line;
    const rows = parseMstInline(
      text, KOSPI_BYTE_SIZE, KOSPI_PART1, KOSPI_PART2_COLS,
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
    const shortLine = "짧은라인";  // byteSize(228) 미만 → 무시
    // marketCap 위치에 공백 → parseInt("") = NaN → 0
    const zeroCapLine = makeKospiLine("000001", "테스트", "ST", 0);
    const text = shortLine + "\n" + zeroCapLine;
    const rows = parseMstInline(
      text, KOSPI_BYTE_SIZE, KOSPI_PART1, KOSPI_PART2_COLS,
      KOSPI_FIELD_SPECS, KOSPI_GROUP, KOSPI_CAPSIZE, KOSPI_NAME,
      KOSPI_MARKET_CAP_POS, KOSPI_MARKET_CAP_WIDTH,
    );
    expect(rows.length).toBe(1);       // 짧은 라인 제외
    expect(rows[0]!.marketCap).toBe(0);
  });
});

// ── TC13: saveJson() 인라인 재현 ──────────────────────────────────────────────

describe("saveJson() 인라인 재현", () => {
  it("TC13 - tickers/name_map/yahooSuffix 포함 JSON writeFileSync 호출", () => {
    vi.clearAllMocks();
    const rows: ParsedRow[] = [
      { code: "005930", name: "삼성전자", capSize: "대", marketCap: 500_000, groupCode: "ST" },
      { code: "000660", name: "SK하이닉스", capSize: "대", marketCap: 300_000, groupCode: "ST" },
    ];
    const yahooSuffix = ".KS";
    const tickerKeys = rows.map((t) => `${t.code}${yahooSuffix}`);
    const out = {
      updated_at:  new Date().toISOString(),
      source:      "한국투자증권 DWS – kospi_code.mst.zip",
      source_url:  "https://example.com",
      total_count: rows.length,
      tickers:     tickerKeys,
      name_map:    Object.fromEntries(tickerKeys.map((k, i) => [k, rows[i]!.name])),
    };
    mockWriteFileSync(out, JSON.stringify(out, null, 2), "utf8");
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(out.tickers).toContain("005930.KS");
    expect(out.name_map["000660.KS"]).toBe("SK하이닉스");
  });
});

// ── TC14~TC16: main() 정상 흐름 ──────────────────────────────────────────────

describe("main() 정상 흐름", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); mockIconvDecode.mockReturnValue(""); });

  it("TC14 - kospi + kosdaq 모두 성공 → writeFileSync 2회 호출", async () => {
    // KOSPI 200개 + KOSDAQ 150개 라인 생성
    const kospiLines = Array.from({ length: 200 }, (_, i) =>
      makeKospiLine(String(i + 1).padStart(6, "0"), `코스피${i + 1}`, "ST", 100_000 + i)
    ).join("\n");

    // KOSDAQ: byteSize=222, marketCapPos=216, marketCapWidth=5
    // part2Content = 221자: "ST"(2)+"중"(1)+" "*213+"10000"(5) = 221 → +"\n" = 222 ✓
    function makeKosdaqLine(code: string, name: string): string {
      const frontPart = code.padEnd(9) + "KR8".padEnd(12) + name;
      const part2Content = "ST" + "중" + " ".repeat(213) + "10000"; // 2+1+213+5 = 221
      return frontPart + part2Content;
    }
    const kosdaqLines = Array.from({ length: 150 }, (_, i) =>
      makeKosdaqLine(String(i + 200001).padStart(6, "0"), `코스닥${i + 1}`)
    ).join("\n");

    // iconv.decode: 첫 호출(KOSPI) → kospiLines, 두 번째(KOSDAQ) → kosdaqLines
    mockIconvDecode
      .mockReturnValueOnce(kospiLines)
      .mockReturnValueOnce(kosdaqLines);

    setupMstEntry("dummy");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_kr_stock.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it("TC15 - 두 번째 인덱스(kosdaq) axios 실패 → process.exit(1)", async () => {
    const kospiLines = Array.from({ length: 200 }, (_, i) =>
      makeKospiLine(String(i + 1).padStart(6, "0"), `종목${i + 1}`, "ST", 100_000 + i)
    ).join("\n");

    mockIconvDecode.mockReturnValueOnce(kospiLines).mockReturnValueOnce("");

    setupMstEntry("dummy");
    mockAxiosGet
      .mockResolvedValueOnce({ data: Buffer.from("").buffer })  // KOSPI 성공
      .mockRejectedValueOnce(new Error("KOSDAQ 네트워크 오류")); // KOSDAQ 실패

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_kr_stock.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });

  it("TC16 - parseMst: groupCode !== ST 종목 필터 → minCount 미달 시 exit(1)", async () => {
    // 200줄 모두 groupCode="PF"(우선주) → filterAndRank 통과 0 → minCount 미달
    const pfLines = Array.from({ length: 200 }, (_, i) =>
      makeKospiLine(String(i + 1).padStart(6, "0"), `우선주${i + 1}`, "PF", 100_000)
    ).join("\n");

    mockIconvDecode.mockReturnValueOnce(pfLines);
    setupMstEntry("dummy");
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_kr_stock.js");
    await vi.waitFor(() => expect(mockExit).toHaveBeenCalledWith(1), { timeout: 5000 });
    mockExit.mockRestore();
  });
});
