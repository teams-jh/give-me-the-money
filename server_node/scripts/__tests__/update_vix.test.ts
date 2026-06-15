/**
 * update_vix.ts 테스트
 *
 * TC 계획:
 *   TC01  round()          - 양수 소수점 반올림 2자리
 *   TC02  round()          - null 입력 → null
 *   TC03  round()          - NaN → null
 *   TC04  round()          - undefined → null
 *   TC05  getVixRating()   - score < 15 → "low"
 *   TC06  getVixRating()   - 15 ≤ score < 25 → "moderate"
 *   TC07  getVixRating()   - 25 ≤ score < 35 → "high"
 *   TC08  getVixRating()   - score ≥ 35 → "extreme"
 *   TC09  isUpdatedToday() - 오늘 날짜 파일 → true  (main() 스킵 경로로 간접 검증)
 *   TC10  isUpdatedToday() - 어제 날짜 → false (fetchDailyPrices 호출로 간접 검증)
 *   TC11  isUpdatedToday() - 파일 없음(throw) → false
 *   TC12  isUpdatedToday() - updated_at 필드 없음 → false
 *   TC13  buildJson()      - PriceRow[] 입력 → 올바른 구조 반환
 *   TC14  buildJson()      - 역순 PriceRow[] 입력 → 날짜 오름차순 정렬
 *   TC15  main()           - 오늘 업데이트 + --force 없음 → 스킵 (fetchDailyPrices 미호출)
 *   TC16  main()           - --force 플래그 → 오늘 날짜여도 fetchDailyPrices 호출
 *   TC17  main()           - 정상 경로 → writeFileSync + renameSync 호출
 *   TC18  main()           - 가격 데이터 0개 → process.exit(1)
 *   TC19  main()           - fetchDailyPrices() throw → process.exit(1)
 *   TC20  buildJson()      - 모든 close가 null → throw Error
 *
 * 모킹 변경 (Issue #74):
 *   yahoo-finance2 직접 mock → _gateway/priceGateway mock 으로 교체
 *   buildJson() 입력: ChartResponse → PriceRow[]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { round, getVixRating, buildJson, main } from "../fetch/update_vix.ts";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockRenameSync,
  mockFetchDailyPrices,
} = vi.hoisted(() => ({
  mockReadFileSync:      vi.fn(),
  mockWriteFileSync:     vi.fn(),
  mockMkdirSync:         vi.fn(),
  mockRenameSync:        vi.fn(),
  mockFetchDailyPrices:  vi.fn(),
}));

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
  },
}));

// ── priceGateway 모킹 ─────────────────────────────────────────────────────────

vi.mock("../_gateway/priceGateway.ts", () => ({
  fetchDailyPrices: (...a: unknown[]) => mockFetchDailyPrices(...a),
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

interface PriceRow {
  date: string; open: number | null; high: number | null;
  low: number | null; close: number | null; adj_close: number | null; volume: number | null;
}

function makePriceRow(date: string, close: number): PriceRow {
  return { date, open: close, high: close, low: close, close, adj_close: close, volume: null };
}

function makePrices(count: number, startDate = "2025-01-01"): PriceRow[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return makePriceRow(d.toISOString().slice(0, 10), 18.5 + i * 0.01);
  });
}

// ── TC01~04: round() ──────────────────────────────────────────────────────────

describe("round()", () => {
  it("TC01 양수 소수점을 2자리로 반올림한다", () => {
    expect(round(18.456)).toBe(18.46);
    expect(round(14.999)).toBe(15.0);
    expect(round(35.001)).toBe(35.0);
  });

  it("TC02 null 입력은 null을 반환한다", () => {
    expect(round(null)).toBeNull();
  });

  it("TC03 NaN 입력은 null을 반환한다", () => {
    expect(round(NaN)).toBeNull();
  });

  it("TC04 undefined 입력은 null을 반환한다", () => {
    expect(round(undefined)).toBeNull();
  });
});

// ── TC05~08: getVixRating() ──────────────────────────────────────────────────

describe("getVixRating()", () => {
  it("TC05 score < 15 이면 'low'를 반환한다", () => {
    expect(getVixRating(12)).toBe("low");
    expect(getVixRating(14.99)).toBe("low");
  });

  it("TC06 15 이상 25 미만이면 'moderate'를 반환한다", () => {
    expect(getVixRating(15)).toBe("moderate");
    expect(getVixRating(24.99)).toBe("moderate");
  });

  it("TC07 25 이상 35 미만이면 'high'를 반환한다", () => {
    expect(getVixRating(25)).toBe("high");
    expect(getVixRating(34.99)).toBe("high");
  });

  it("TC08 score 35 이상이면 'extreme'을 반환한다", () => {
    expect(getVixRating(35)).toBe("extreme");
    expect(getVixRating(80)).toBe("extreme");
  });
});

// ── TC09~12: isUpdatedToday() (main() 통한 간접 검증) ────────────────────────

describe("isUpdatedToday() — main()을 통한 간접 검증", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
    mockFetchDailyPrices.mockClear();
    mockFetchDailyPrices.mockResolvedValue(makePrices(200));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    const idx = process.argv.indexOf("--force");
    if (idx !== -1) process.argv.splice(idx, 1);
  });

  it("TC09 오늘 날짜 updated_at → main()이 fetchDailyPrices를 호출하지 않는다 (스킵)", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    await main();
    expect(mockFetchDailyPrices).not.toHaveBeenCalled();
  });

  it("TC10 어제 날짜 updated_at → main()이 fetchDailyPrices를 호출한다", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: yesterday }));
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });

  it("TC11 파일 없음(throw) → main()이 fetchDailyPrices를 호출한다", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });

  it("TC12 updated_at 필드 없음 → main()이 fetchDailyPrices를 호출한다", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({}));
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });
});

// ── TC13~14, TC20: buildJson() ────────────────────────────────────────────────

describe("buildJson()", () => {
  it("TC13 PriceRow[] 입력 → 올바른 JSON 구조를 반환한다", () => {
    const prices: PriceRow[] = [
      makePriceRow("2025-05-18", 18.0),
      makePriceRow("2025-05-19", 19.0),
      makePriceRow("2025-05-20", 20.45),
    ];

    const result = buildJson(prices);

    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.score).toBe(20.45);
    expect(result.rating).toBe("moderate");
    expect(result.previous_close).toBe(19.0);
    expect(result.previous_1_week).toBeNull();
    expect(result.previous_1_month).toBeNull();
    expect(result.previous_1_year).toBeNull();
    expect(Array.isArray(result.historical)).toBe(true);
    expect(result.historical[0]).toMatchObject({
      date:   expect.any(String),
      score:  expect.any(Number),
      rating: expect.any(String),
    });
  });

  it("TC14 역순 PriceRow[] 입력 → 날짜 오름차순으로 정렬된다", () => {
    const prices: PriceRow[] = [
      makePriceRow("2025-05-20", 20.0),
      makePriceRow("2025-05-18", 18.0),
      makePriceRow("2025-05-19", 19.0),
    ];

    const result = buildJson(prices);
    const dates = result.historical.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("TC20 모든 close가 null → Error를 throw한다", () => {
    const prices: PriceRow[] = [
      { date: "2025-05-18", open: null, high: null, low: null, close: null, adj_close: null, volume: null },
      { date: "2025-05-19", open: null, high: null, low: null, close: null, adj_close: null, volume: null },
    ];
    expect(() => buildJson(prices)).toThrow("유효한 close 데이터가 없습니다.");
  });
});

// ── TC15~19: main() ──────────────────────────────────────────────────────────

describe("main()", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
    mockFetchDailyPrices.mockClear();
    mockWriteFileSync.mockClear();
    mockRenameSync.mockClear();
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockFetchDailyPrices.mockResolvedValue(makePrices(200));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    const idx = process.argv.indexOf("--force");
    if (idx !== -1) process.argv.splice(idx, 1);
  });

  it("TC15 오늘 업데이트 + --force 없음 → fetchDailyPrices 미호출 (스킵)", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    await main();
    expect(mockFetchDailyPrices).not.toHaveBeenCalled();
  });

  it("TC16 --force 플래그 → 오늘 날짜여도 fetchDailyPrices 호출", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    process.argv.push("--force");
    await main();
    expect(mockFetchDailyPrices).toHaveBeenCalled();
  });

  it("TC17 정상 경로 → writeFileSync + renameSync 호출", async () => {
    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockRenameSync).toHaveBeenCalled();
  });

  it("TC18 가격 데이터 0개 → process.exit(1) 호출", async () => {
    mockFetchDailyPrices.mockResolvedValue([]);
    await main();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("TC19 fetchDailyPrices() throw → process.exit(1) 호출", async () => {
    mockFetchDailyPrices.mockRejectedValue(new Error("network error"));
    await main();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
