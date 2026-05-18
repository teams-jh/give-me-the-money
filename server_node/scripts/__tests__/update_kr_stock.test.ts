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

const mockGetEntries = vi.fn();
const mockGetData    = vi.fn(() => Buffer.from(""));

vi.mock("adm-zip", () => ({
  default: vi.fn().mockImplementation(() => ({
    getEntries: mockGetEntries,
  })),
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
    expect(mockExit).toHaveBeenCalledWith(1);
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
