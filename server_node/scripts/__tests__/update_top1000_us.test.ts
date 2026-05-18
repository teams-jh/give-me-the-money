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
 *   TC09  main()         - getYahooCrumb 실패 → process.exit(1)
 *   TC10  main()         - 정상 경로 → writeFileSync 호출
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import AdmZipMod from "adm-zip";
// adm-zip 은 server_node 전용 dependency → 테스트에서 직접 import 불가.
// 소스 파일의 adm-zip 호출은 아래 vi.mock() 으로 대체.

// ── buildAndSave 인라인 재현 ──────────────────────────────────────────────────

interface ScreenerQuote { symbol: string; marketCap?: number; longName?: string; }

const TARGET = 1000;

function buildAndSave_inline(
  quotes:  ScreenerQuote[],
  knamMap: Map<string, string>,
  writeFn: (path: string, data: string) => void,
  mkdirFn: (path: string, opts?: unknown) => void,
  outPath: string,
): void {
  const filtered = quotes
    .filter((q) => q.symbol && q.marketCap && q.marketCap > 0)
    .slice(0, TARGET);

  const tickers:  string[]              = filtered.map((q) => q.symbol);
  const name_map: Record<string, string> = {};
  for (const q of filtered) {
    name_map[q.symbol] = knamMap.get(q.symbol) ?? q.longName ?? q.symbol;
  }

  mkdirFn(outPath, { recursive: true });
  writeFn(outPath + "/out.json", JSON.stringify({
    updated_at:  new Date().toISOString(),
    source:      "Yahoo Finance 스크리너 + DWS 한글명",
    total_count: tickers.length,
    tickers,
    name_map,
  }, null, 2));
}

// ── fs / axios / adm-zip / iconv 모킹 ────────────────────────────────────────
// adm-zip, iconv-lite 는 server_node 전용 → vi.mock() 으로 처리

const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();

vi.mock("fs", () => ({
  default: {
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
  },
}));

const mockAxiosGet  = vi.fn();
const mockAxiosPost = vi.fn();
vi.mock("axios", () => ({
  default: {
    get:  (...a: unknown[]) => mockAxiosGet(...a),
    post: (...a: unknown[]) => mockAxiosPost(...a),
  },
}));

// adm-zip mock: .cod 엔트리 없음으로 처리 (한글명 맵 빈 상태)
vi.mock("adm-zip", () => ({
  default: vi.fn().mockImplementation(() => ({
    getEntries: () => [],            // .cod 엔트리 없음 → buildKnamMap 스킵
    readFile:   vi.fn(() => Buffer.from("")),
  })),
}));

// iconv-lite mock: vi.fn()으로 per-test 제어 가능하게
const mockIconvDecode = vi.hoisted(() => vi.fn((_buf: unknown, _enc: string) => ""));
vi.mock("iconv-lite", () => ({
  default: { decode: (...a: unknown[]) => mockIconvDecode(...a) },
}));

// ── TC01~07: buildAndSave() ───────────────────────────────────────────────────

describe("buildAndSave() 인라인 재현 테스트", () => {
  const outDir = "/fake/db";
  const write  = vi.fn();
  const mkdir  = vi.fn();

  beforeEach(() => { write.mockClear(); mkdir.mockClear(); });

  it("TC01 - marketCap=0 / undefined 제외", () => {
    const quotes: ScreenerQuote[] = [
      { symbol: "AAPL", marketCap: 3_000_000_000_000 },
      { symbol: "ZERO", marketCap: 0 },        // 제외
      { symbol: "NONE"                },        // marketCap undefined → 제외
    ];
    buildAndSave_inline(quotes, new Map(), write, mkdir, outDir);
    const saved = JSON.parse(write.mock.calls[0][1] as string) as { tickers: string[] };
    expect(saved.tickers).toEqual(["AAPL"]);
  });

  it("TC02 - 1001개 → 1000개로 제한", () => {
    const quotes: ScreenerQuote[] = Array.from({ length: 1001 }, (_, i) => ({
      symbol: `T${i}`, marketCap: 1000 - i,
    }));
    buildAndSave_inline(quotes, new Map(), write, mkdir, outDir);
    const saved = JSON.parse(write.mock.calls[0][1] as string) as { tickers: string[] };
    expect(saved.tickers.length).toBe(1000);
  });

  it("TC03 - knamMap에서 한글명 우선", () => {
    const knam = new Map([["AAPL", "애플"]]);
    buildAndSave_inline(
      [{ symbol: "AAPL", marketCap: 1e12, longName: "Apple Inc" }],
      knam, write, mkdir, outDir,
    );
    const saved = JSON.parse(write.mock.calls[0][1] as string) as { name_map: Record<string,string> };
    expect(saved.name_map["AAPL"]).toBe("애플");
  });

  it("TC04 - knamMap 없으면 longName fallback", () => {
    buildAndSave_inline(
      [{ symbol: "MSFT", marketCap: 2e12, longName: "Microsoft Corporation" }],
      new Map(), write, mkdir, outDir,
    );
    const saved = JSON.parse(write.mock.calls[0][1] as string) as { name_map: Record<string,string> };
    expect(saved.name_map["MSFT"]).toBe("Microsoft Corporation");
  });

  it("TC05 - longName도 없으면 symbol fallback", () => {
    buildAndSave_inline(
      [{ symbol: "UNKN", marketCap: 1e9 }],
      new Map(), write, mkdir, outDir,
    );
    const saved = JSON.parse(write.mock.calls[0][1] as string) as { name_map: Record<string,string> };
    expect(saved.name_map["UNKN"]).toBe("UNKN");
  });

  it("TC06 - 빈 quotes → tickers = []", () => {
    buildAndSave_inline([], new Map(), write, mkdir, outDir);
    const saved = JSON.parse(write.mock.calls[0][1] as string) as { tickers: string[]; total_count: number };
    expect(saved.tickers).toEqual([]);
    expect(saved.total_count).toBe(0);
  });

  it("TC07 - 출력 JSON 구조 검증", () => {
    buildAndSave_inline(
      [{ symbol: "TSLA", marketCap: 5e11 }],
      new Map([["TSLA", "테슬라"]]),
      write, mkdir, outDir,
    );
    const saved = JSON.parse(write.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(saved).toHaveProperty("updated_at");
    expect(saved).toHaveProperty("source");
    expect(saved).toHaveProperty("total_count");
    expect(saved).toHaveProperty("tickers");
    expect(saved).toHaveProperty("name_map");
  });
});

// ── TC08: buildKnamMap() TSV 파싱 ────────────────────────────────────────────

describe("buildKnamMap() TSV 파싱 (인라인 재현)", () => {
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
    // ncod  exid  excd   exnm     symb   rsym    knam   enam
    const line = ["001","01","NAS","NASDAQ","AAPL","NAAPL","애플","Apple Inc"]
      .concat(Array(16).fill("")).join("\t");
    const { symb, knam } = parseCodLine(line);
    expect(symb).toBe("AAPL");
    expect(knam).toBe("애플");
  });
});

// ── TC09~10: main() ───────────────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC09 - getYahooCrumb 실패(cookie 없음) → process.exit(1)", async () => {
    // set-cookie 헤더 없음 → crumb 획득 실패
    mockAxiosGet.mockResolvedValueOnce({ headers: {}, data: "" });
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_top1000_us.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("TC10 - 정상 crumb + 스크리너 응답 → writeFileSync 호출", async () => {
    // Step1: Yahoo 쿠키
    mockAxiosGet.mockResolvedValueOnce({
      headers: { "set-cookie": ["A=1; Path=/", "B=2; Path=/"] },
      data:    "",
    });
    // Step2: crumb
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    // Step3: DWS zip GET × 3 (adm-zip 모킹으로 .cod 없음 처리)
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    // Screener POST
    mockAxiosPost.mockResolvedValue({
      data: {
        finance: {
          result: [{ quotes: [{ symbol: "AAPL", marketCap: 3e12, longName: "Apple" }] }],
        },
      },
    });

    await import("../fetch/update_top1000_us.js");
    // main()은 fire-and-forget → vi.waitFor로 writeFileSync 완료 대기
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
  });
});

// ── TC11~TC13: 복수 페이지 / buildKnamMap .cod 파싱 ──────────────────────────

describe("fetchTop1000FromScreener + buildKnamMap 추가 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); mockIconvDecode.mockReturnValue(""); });

  it("TC11 - 복수 페이지: 첫 페이지 가득 참(PAGE_SIZE=250) → sleep 후 두 번째 페이지", async () => {
    // crumb 획득
    mockAxiosGet.mockResolvedValueOnce({ headers: { "set-cookie": ["A=1; Path=/"] }, data: "" });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    // DWS zip × 3 (buildKnamMap - .cod 없음)
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    // PAGE_SIZE = 250 → 첫 페이지 가득 참 → sleep(300) 호출 후 다음 페이지
    const fullPage = Array.from({ length: 250 }, (_, i) => ({
      symbol: `T${String(i).padStart(3, "0")}`, marketCap: 1_000_000_000 + i,
    }));
    mockAxiosPost
      .mockResolvedValueOnce({ data: { finance: { result: [{ quotes: fullPage }] } } })
      .mockResolvedValueOnce({ data: { finance: { result: [{ quotes: [{ symbol: "LAST", marketCap: 1e8 }] }] } } });

    await import("../fetch/update_top1000_us.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 6000 });
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
  });

  it("TC12 - buildKnamMap: .cod 엔트리 존재 + TSV 파싱 → knamMap에 한글명 포함", async () => {
    // crumb 획득
    mockAxiosGet.mockResolvedValueOnce({ headers: { "set-cookie": ["A=1; Path=/"] }, data: "" });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    // DWS zip × 3: .cod 엔트리 있음
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    // COD_COLUMNS: ncod exid excd exnm symb rsym knam enam ...
    const codLine = ["001", "01", "NAS", "NASDAQ", "AAPL", "NAAPL", "애플", "Apple Inc"]
      .concat(Array(16).fill("")).join("\t");

    // adm-zip: .cod 엔트리 반환 (regular function 필수 - Vitest v4 new 호환)
    vi.mocked(AdmZipMod).mockImplementation(
      function() {
        return {
          getEntries: () => [{ entryName: "nasd.cod", getData: () => Buffer.from("") }],
          readFile:   () => Buffer.from(codLine),
        };
      } as never,
    );

    // iconv.decode: codLine 반환 (1개 유효 엔트리)
    mockIconvDecode.mockReturnValue(codLine + "\n");

    // Screener: 1개 종목
    mockAxiosPost.mockResolvedValue({
      data: { finance: { result: [{ quotes: [{ symbol: "AAPL", marketCap: 3e12 }] }] } },
    });

    await import("../fetch/update_top1000_us.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });

    // 저장된 JSON에 name_map["AAPL"] = "애플" 포함 확인
    const savedJson = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      name_map: Record<string, string>;
    };
    expect(savedJson.name_map["AAPL"]).toBe("애플");
  });

  it("TC13 - buildKnamMap: symb/knam 없는 라인 무시 → map 크기 0", async () => {
    mockAxiosGet.mockResolvedValueOnce({ headers: { "set-cookie": ["A=1; Path=/"] }, data: "" });
    mockAxiosGet.mockResolvedValueOnce({ data: "testcrumb123" });
    mockAxiosGet.mockResolvedValue({ data: Buffer.from("").buffer });

    // symb(4번째)와 knam(6번째)이 비어있는 라인
    const emptyCodLine = ["001", "01", "NAS", "NASDAQ", "", "RSYM", "", "Ename"]
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

    await import("../fetch/update_top1000_us.js");
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });

    // symb 없어서 knamMap 비어있음 → name_map["MSFT"] = longName or symbol fallback
    const savedJson = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      name_map: Record<string, string>;
    };
    // knamMap 없으므로 longName(없음) → symbol fallback
    expect(savedJson.name_map["MSFT"]).toBe("MSFT");
  });
});
