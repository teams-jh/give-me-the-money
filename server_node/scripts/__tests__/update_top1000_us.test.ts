/**
 * update_top1000_us.ts 테스트
 *
 * TC 계획:
 *   TC01  buildAndSave() - marketCap=0 / undefined 종목 제외
 *   TC02  buildAndSave() - 결과를 TARGET(1000)개로 제한
 *   TC03  buildAndSave() - knamMap에서 한글명 우선 적용
 *   TC04  buildAndSave() - knamMap 없으면 longName fallback
 *   TC05  buildAndSave() - longName도 없으면 symbol fallback
 *   TC06  buildAndSave() - 빈 quotes → tickers = []
 *   TC07  buildAndSave() - 출력 JSON 구조 검증
 *   TC08  buildKnamMap() - TSV 라인 파싱 (symb, knam 추출)
 *   TC09  main()         - getYahooCrumb 실패 → Error throw
 *   TC10  main()         - 정상 경로 → writeFileSync 호출
 *   TC11  main()         - 복수 페이지: PAGE_SIZE=250 → sleep 후 두 번째 페이지
 *   TC12  main()         - buildKnamMap .cod 엔트리 존재 → 한글명 포함
 *   TC13  main()         - buildKnamMap symb/knam 없는 라인 → symbol fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import AdmZipMod from "adm-zip";
import { buildAndSave, main } from "../fetch/update_top1000_us.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockWriteFileSync, mockMkdirSync,
  mockAxiosGet, mockAxiosPost,
  mockIconvDecode,
} = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockMkdirSync:     vi.fn(),
  mockAxiosGet:      vi.fn(),
  mockAxiosPost:     vi.fn(),
  mockIconvDecode:   vi.fn((_buf: unknown, _enc: string) => ""),
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
  default: {
    get:  (...a: unknown[]) => mockAxiosGet(...a),
    post: (...a: unknown[]) => mockAxiosPost(...a),
  },
}));

// ── adm-zip 모킹 ──────────────────────────────────────────────────────────────

vi.mock("adm-zip", () => ({
  default: vi.fn().mockImplementation(() => ({
    getEntries: () => [],
    readFile:   vi.fn(() => Buffer.from("")),
  })),
}));

// ── iconv-lite 모킹 ───────────────────────────────────────────────────────────

vi.mock("iconv-lite", () => ({
  default: { decode: (...a: unknown[]) => mockIconvDecode(...a) },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

interface ScreenerQuote { symbol: string; marketCap?: number; longName?: string; }

// ── TC01~07: buildAndSave() ───────────────────────────────────────────────────

describe("buildAndSave()", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC01 - marketCap=0 / undefined 제외", () => {
    const quotes: ScreenerQuote[] = [
      { symbol: "AAPL", marketCap: 3_000_000_000_000 },
      { symbol: "ZERO", marketCap: 0 },
      { symbol: "NONE" },
    ];
    buildAndSave(quotes, new Map());
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { tickers: string[] };
    expect(saved.tickers).toEqual(["AAPL"]);
  });

  it("TC02 - 1001개 → 1000개로 제한", () => {
    const quotes: ScreenerQuote[] = Array.from({ length: 1001 }, (_, i) => ({
      symbol: `T${i}`, marketCap: 1000 - i,
    }));
    buildAndSave(quotes, new Map());
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { tickers: string[] };
    expect(saved.tickers.length).toBe(1000);
  });

  it("TC03 - knamMap에서 한글명 우선", () => {
    buildAndSave(
      [{ symbol: "AAPL", marketCap: 1e12, longName: "Apple Inc" }],
      new Map([["AAPL", "애플"]]),
    );
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { name_map: Record<string, string> };
    expect(saved.name_map["AAPL"]).toBe("애플");
  });

  it("TC04 - knamMap 없으면 longName fallback", () => {
    buildAndSave([{ symbol: "MSFT", marketCap: 2e12, longName: "Microsoft Corporation" }], new Map());
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { name_map: Record<string, string> };
    expect(saved.name_map["MSFT"]).toBe("Microsoft Corporation");
  });

  it("TC05 - longName도 없으면 symbol fallback", () => {
    buildAndSave([{ symbol: "UNKN", marketCap: 1e9 }], new Map());
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { name_map: Record<string, string> };
    expect(saved.name_map["UNKN"]).toBe("UNKN");
  });

  it("TC06 - 빈 quotes → tickers = []", () => {
    buildAndSave([], new Map());
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { tickers: string[]; total_count: number };
    expect(saved.tickers).toEqual([]);
    expect(saved.total_count).toBe(0);
  });

  it("TC07 - 출력 JSON 구조 검증", () => {
    buildAndSave([{ symbol: "TSLA", marketCap: 5e11 }], new Map([["TSLA", "테슬라"]]));
    const saved = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as Record<string, unknown>;
    expect(saved).toHaveProperty("updated_at");
    expect(saved).toHaveProperty("source");
    expect(saved).toHaveProperty("total_count");
    expect(saved).toHaveProperty("tickers");
    expect(saved).toHaveProperty("name_map");
  });
});

// ── TC08: buildKnamMap TSV 파싱 (로컬 파서 헬퍼) ──────────────────────────────

describe("buildKnamMap() TSV 파싱", () => {
  const COD_COLUMNS = [
    "ncod","exid","excd","exnm","symb","rsym","knam","enam",
    "stis","curr","zdiv","ztyp","base","bnit","anit","mstm","metm",
    "isdr","drcd","icod","sjong","ttyp","etyp","ttyp_sb",
  ] as const;

  function parseCodLine(line: string): { symb: string; knam: string } {
    const fields = line.split("\t");
    const rec: Record<string, string> = {};
    COD_COLUMNS.forEach((col, i) => { rec[col] = (fields[i] ?? "").trim(); });
    return { symb: rec["symb"] ?? "", knam: rec["knam"] ?? "" };
  }

  it("TC08 - TSV 탭 구분 라인에서 symb(5번째)·knam(7번째) 추출", () => {
    const line = ["001","01","NAS","NASDAQ","AAPL","NAAPL","애플","Apple Inc"]
      .concat(Array(16).fill("")).join("\t");
    const { symb, knam } = parseCodLine(line);
    expect(symb).toBe("AAPL");
    expect(knam).toBe("애플");
  });
});

// ── TC09~13: main() ───────────────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); mockIconvDecode.mockReturnValue(""); });

  it("TC09 - getYahooCrumb 실패(cookie 없음) → Error throw", async () => {
    mockAxiosGet.mockResolvedValueOnce({ headers: {}, data: "" });
    await expect(main()).rejects.toThrow("쿠키 획득 실패");
  });

  it("TC10 - 정상 crumb + 스크리너 응답 → writeFileSync 호출", async () => {
    mockAxiosGet.mockResolvedValueOnce({
      headers: { "set-cookie": ["A=1; Path=/", "B=2; Path=/"] }, data: "",
    });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });
    mockAxiosPost.mockResolvedValue({
      data: { finance: { result: [{ quotes: [{ symbol: "AAPL", marketCap: 3e12, longName: "Apple" }] }] } },
    });

    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC11 - 복수 페이지: 첫 페이지 가득 참(PAGE_SIZE=250) → 두 번째 페이지 요청", async () => {
    mockAxiosGet.mockResolvedValueOnce({ headers: { "set-cookie": ["A=1; Path=/"] }, data: "" });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    const fullPage = Array.from({ length: 250 }, (_, i) => ({
      symbol: `T${String(i).padStart(3, "0")}`, marketCap: 1_000_000_000 + i,
    }));
    mockAxiosPost
      .mockResolvedValueOnce({ data: { finance: { result: [{ quotes: fullPage }] } } })
      .mockResolvedValueOnce({ data: { finance: { result: [{ quotes: [{ symbol: "LAST", marketCap: 1e8 }] }] } } });

    await main();
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("TC12 - buildKnamMap: .cod 엔트리 존재 → 한글명 포함", async () => {
    mockAxiosGet.mockResolvedValueOnce({ headers: { "set-cookie": ["A=1; Path=/"] }, data: "" });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    const codLine = ["001","01","NAS","NASDAQ","AAPL","NAAPL","애플","Apple Inc"]
      .concat(Array(16).fill("")).join("\t");

    vi.mocked(AdmZipMod).mockImplementation(
      function() {
        return {
          getEntries: () => [{ entryName: "nasd.cod", getData: () => Buffer.from("") }],
          readFile:   () => Buffer.from(codLine),
        };
      } as never,
    );
    mockIconvDecode.mockReturnValue(codLine + "\n");
    mockAxiosPost.mockResolvedValue({
      data: { finance: { result: [{ quotes: [{ symbol: "AAPL", marketCap: 3e12 }] }] } },
    });

    await main();
    const savedJson = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { name_map: Record<string, string> };
    expect(savedJson.name_map["AAPL"]).toBe("애플");
  });

  it("TC13 - buildKnamMap: symb/knam 없는 라인 → symbol fallback", async () => {
    mockAxiosGet.mockResolvedValueOnce({ headers: { "set-cookie": ["A=1; Path=/"] }, data: "" });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    const emptyCodLine = ["001","01","NAS","NASDAQ","","RSYM","","Ename"]
      .concat(Array(16).fill("")).join("\t");

    vi.mocked(AdmZipMod).mockImplementation(
      function() {
        return {
          getEntries: () => [{ entryName: "nasd.cod", getData: () => Buffer.from("") }],
          readFile:   () => Buffer.from(emptyCodLine),
        };
      } as never,
    );
    mockIconvDecode.mockReturnValue(emptyCodLine + "\n");
    mockAxiosPost.mockResolvedValue({
      data: { finance: { result: [{ quotes: [{ symbol: "MSFT", marketCap: 2e12 }] }] } },
    });

    await main();
    const savedJson = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { name_map: Record<string, string> };
    expect(savedJson.name_map["MSFT"]).toBe("MSFT");
  });
});
