/**
 * priceGateway.ts 테스트 (Issue #74)
 *
 * TC 계획:
 *   TC01  fetchDailyPrices() - null close 행 필터링
 *   TC02  fetchDailyPrices() - quote → PriceRow 매핑 (round, adjclose fallback)
 *   TC03  fetchDailyPrices() - yahoo .chart() 호출 인자 검증 (ticker, interval)
 *   TC04  calcMarketInfo()   - 빈 배열 → 모든 값 null
 *   TC05  calcMarketInfo()   - 1개 행 → price=close, previous_close=null
 *   TC06  calcMarketInfo()   - 52주 high/low — latest.date 기준으로 계산
 */

import { describe, it, expect, vi } from "vitest";
import { fetchDailyPrices, calcMarketInfo } from "../priceGateway.ts";

// ── yahoo-finance2 모킹 ───────────────────────────────────────────────────────

const mockChart = vi.fn();

vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = (...args: unknown[]) => mockChart(...args);
  },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

interface PriceRow {
  date: string; open: number | null; high: number | null;
  low: number | null; close: number | null; adj_close: number | null; volume: number | null;
}

function makePrice(date: string, close: number, high = close, low = close): PriceRow {
  return { date, open: close, high, low, close, adj_close: close, volume: 100 };
}

function makeQuote(overrides: Partial<{
  date: Date; open: number | null; high: number | null;
  low: number | null; close: number | null; adjclose: number | null; volume: number | null;
}> = {}) {
  return {
    date:     new Date("2024-01-01"),
    open:     100,
    high:     110,
    low:      90,
    close:    105,
    adjclose: 105,
    volume:   1000,
    ...overrides,
  };
}

// ── TC01~03: fetchDailyPrices() ───────────────────────────────────────────────

describe("fetchDailyPrices()", () => {
  it("TC01 - null close 행은 결과에서 제거된다", async () => {
    mockChart.mockResolvedValue({
      quotes: [
        makeQuote({ date: new Date("2024-01-01"), close: null }),
        makeQuote({ date: new Date("2024-01-02"), close: 105 }),
        makeQuote({ date: new Date("2024-01-03"), close: 107 }),
      ],
    });

    const result = await fetchDailyPrices("TEST", 1);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.close !== null)).toBe(true);
  });

  it("TC02 - quote → PriceRow 매핑: round 적용 및 adjclose fallback", async () => {
    mockChart.mockResolvedValue({
      quotes: [
        makeQuote({
          date:     new Date("2024-06-01"),
          open:     100.123,
          high:     110.456,
          low:      90.789,
          close:    105.111,
          adjclose: null,   // null → close 로 대체
          volume:   500,
        }),
      ],
    });

    const result = await fetchDailyPrices("TEST", 1);

    expect(result).toHaveLength(1);
    const row = result[0]!;
    expect(row.date).toBe("2024-06-01");
    expect(row.open).toBe(100.12);       // round 적용
    expect(row.high).toBe(110.46);
    expect(row.low).toBe(90.79);
    expect(row.close).toBe(105.11);
    expect(row.adj_close).toBe(105.11);  // adjclose null → close fallback
    expect(row.volume).toBe(500);
  });

  it("TC03 - yahoo .chart() 에 올바른 ticker·interval 인자로 호출된다", async () => {
    mockChart.mockResolvedValue({ quotes: [] });

    await fetchDailyPrices("KRW=X", 3);

    expect(mockChart).toHaveBeenCalledWith(
      "KRW=X",
      expect.objectContaining({ interval: "1d" }),
      expect.objectContaining({ validateResult: false }),
    );
  });
});

// ── TC04~06: calcMarketInfo() ─────────────────────────────────────────────────

describe("calcMarketInfo()", () => {
  it("TC04 - 빈 배열 → 모든 값 null", () => {
    const res = calcMarketInfo([]);
    expect(res.price).toBeNull();
    expect(res.previous_close).toBeNull();
    expect(res.fifty_two_week_high).toBeNull();
    expect(res.fifty_two_week_low).toBeNull();
  });

  it("TC05 - 1개 행 → price=close, previous_close=null", () => {
    const res = calcMarketInfo([makePrice("2024-06-01", 1350)]);
    expect(res.price).toBe(1350);
    expect(res.previous_close).toBeNull();
  });

  it("TC06 - 52주 기준점은 latest.date 기준 (new Date() 기준 아님)", () => {
    // latestDate 를 2년 전으로 고정
    // → new Date() 기준이면 yearPrices 가 비어 high/low = null (FAIL)
    // → latest.date 기준이면 recentDate 가 포함되어 정상 계산 (PASS)
    const latestDate = "2024-06-01";
    const recentDate = "2024-05-20"; // latestDate 기준 52주 이내
    const oldDate    = "2022-01-01"; // latestDate 기준 52주 밖 → 제외

    const prices: PriceRow[] = [
      makePrice(recentDate, 1400, 1450, 1380),
      makePrice(latestDate, 1360, 1370, 1340),
      makePrice(oldDate,    2000, 2500, 1900),
    ];

    const res = calcMarketInfo(prices);
    expect(res.price).toBe(1360);
    expect(res.previous_close).toBe(1400);
    expect(res.fifty_two_week_high).toBe(1450); // oldDate 제외
    expect(res.fifty_two_week_low).toBe(1340);
  });
});
