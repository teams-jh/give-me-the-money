/**
 * update_dollar_index.ts 테스트
 *
 * TC 계획:
 *   TC01  isUpdatedToday() - 오늘 날짜 파일 → true  (main() 스킵 경로로 간접 검증)
 *   TC02  isUpdatedToday() - 어제 날짜 파일 → false (fetchDailyPrices 호출로 간접 검증)
 *   TC03  isUpdatedToday() - 파일 없음(ENOENT) → false
 *   TC04  isUpdatedToday() - updated_at 필드 없음 → false
 *   TC05  calcMarketInfo() - 빈 배열 → 모든 값 null  [re-export 경유 검증]
 *   TC06  calcMarketInfo() - 1개 → price=close, prev=null
 *   TC07  calcMarketInfo() - 여러 행 → 52주 high/low 정확 (52주 밖 행 제외)
 *   TC08  buildJson()      - ticker="USDI", currency="USD", name="US Dollar Index", prices 포함
 *   TC09  main()           - 오늘 이미 업데이트 → fetchDailyPrices 미호출
 *   TC10  main()           - --force 플래그 → 업데이트 강제 실행
 *   TC11  main()           - 가격 데이터 < 100개 → Error throw
 *   TC12  main()           - 정상 경로 → writeFileSync 호출 확인
 *
 * 모킹 변경 (Issue #74):
 *   yahoo-finance2 직접 mock → _gateway/priceGateway mock 으로 교체
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { calcMarketInfo, buildJson, main } from "../fetch/update_dollar_index.js";

// ── vi.hoisted ────────────────────────────────────────────────────────────────

const {
  mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockRenameSync, mockExistsSync,
  mockFetchDailyPrices,
} = vi.hoisted(() => ({
  mockReadFileSync:      vi.fn(),
  mockWriteFileSync:     vi.fn(),
  mockMkdirSync:         vi.fn(),
  mockRenameSync:        vi.fn(),
  mockExistsSync:        vi.fn(() => false),
  mockFetchDailyPrices:  vi.fn(),
}));

// ── fs 모킹 ──────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
    existsSync:    (...a: unknown[]) => mockExistsSync(...a),
  },
}));

// ── priceGateway 모킹 ─────────────────────────────────────────────────────────
// fetchDailyPrices 만 모킹, calcMarketInfo 는 실제 구현 사용 (importOriginal)

vi.mock("../_gateway/priceGateway.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_gateway/priceGateway.ts")>();
  return {
    ...actual,
    fetchDailyPrices: (...a: unknown[]) => mockFetchDailyPrices(...a),
  };
});

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

interface PriceRow {
  date: string; open: number | null; high: number | null;
  low: number | null; close: number | null; adj_close: number | null; volume: number | null;
}

function makePrice(date: string, close: number, high = close, low = close): PriceRow {
  return { date, open: close, high, low, close, adj_close: close, volume: 100 };
}

function todayStr()     { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
}

function makePrices(count: number, base = 104): PriceRow[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date("2024-01-01T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return makePrice(d.toISOString().slice(0, 10), base);
  });
}

// ── TC01~04: isUpdatedToday() 간접 검증 ──────────────────────────────────────

describe("isUpdatedToday() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
  });

  it("TC01 - 오늘 날짜 파일 존재 → main() 스킵 (fetchDailyPrices 미호출)", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    await main();
    expect(mockFetchDailyPrices).not.toHaveBeenCalled();
  });

  it("TC02 - 어제 날짜 파일 → 업데이트 실행 (fetchDailyPrices 호출)", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: `${yesterdayStr()}T00:00:00.000Z` }));
    mockFetchDailyPrices.mockResolvedValue(makePrices(120));
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });

  it("TC03 - 파일 없음(readFileSync throw) → 업데이트 실행", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockFetchDailyPrices.mockResolvedValue(makePrices(120));
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });

  it("TC04 - updated_at 필드 없음 → 업데이트 실행", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ ticker: "USDI" }));
    mockFetchDailyPrices.mockResolvedValue(makePrices(120));
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });
});

// ── TC05~07: calcMarketInfo() (re-export 경유) ────────────────────────────────

describe("calcMarketInfo()", () => {
  it("TC05 - 빈 배열 → 모든 값 null", () => {
    const res = calcMarketInfo([]);
    expect(res.price).toBeNull();
    expect(res.previous_close).toBeNull();
    expect(res.fifty_two_week_high).toBeNull();
    expect(res.fifty_two_week_low).toBeNull();
  });

  it("TC06 - 1개 행 → price=close, previous_close=null", () => {
    const res = calcMarketInfo([makePrice(todayStr(), 104.5)]);
    expect(res.price).toBe(104.5);
    expect(res.previous_close).toBeNull();
  });

  it("TC07 - 여러 행 → 52주 기준점이 latest.date 임을 검증", () => {
    const latestDate = "2024-06-01";
    const recentDate = "2024-05-20";
    const oldDate    = "2022-01-01";

    const prices: PriceRow[] = [
      makePrice(recentDate, 104.0, 106.5, 102.0),
      makePrice(latestDate, 103.5, 105.0, 101.5),
      makePrice(oldDate,    120.0, 130.0,  90.0),
    ];

    const res = calcMarketInfo(prices);
    expect(res.price).toBe(103.5);
    expect(res.previous_close).toBe(104.0);
    expect(res.fifty_two_week_high).toBe(106.5);
    expect(res.fifty_two_week_low).toBe(101.5);
  });
});

// ── TC08: buildJson() ─────────────────────────────────────────────────────────

describe("buildJson()", () => {
  it("TC08 - ticker=USDI, currency=USD, name=US Dollar Index, prices 배열 포함", () => {
    const prices: PriceRow[] = [makePrice(todayStr(), 104.5)];
    const json = buildJson(prices);

    expect(json.ticker).toBe("USDI");
    expect(json.info.currency).toBe("USD");
    expect(json.info.name).toBe("US Dollar Index");
    expect(json.info.exchange).toBe("NYB");
    expect(json.market.price).toBe(104.5);
    expect(Array.isArray(json.prices)).toBe(true);
  });
});

// ── TC09~12: main() 시나리오 ─────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC09 - 오늘 업데이트 + no --force → skip (fetchDailyPrices 미호출)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    await main();
    expect(mockFetchDailyPrices).not.toHaveBeenCalled();
  });

  it("TC10 - --force 플래그 → 오늘 업데이트여도 강제 실행", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    mockFetchDailyPrices.mockResolvedValue(makePrices(120));
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });

  it("TC11 - 가격 행 < 100개 → Error throw", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockFetchDailyPrices.mockResolvedValue(makePrices(50));
    await expect(main()).rejects.toThrow("데이터가 너무 적습니다");
    process.argv = ["node", "script.ts"];
  });

  it("TC12 - 정상 경로 → writeFileSync 호출 확인", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockFetchDailyPrices.mockResolvedValue(makePrices(120));
    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });
});
