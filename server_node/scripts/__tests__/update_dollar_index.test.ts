/**
 * update_dollar_index.ts 테스트
 *
 * TC 계획:
 *   TC01  round()          - 양수 소수점 반올림 2자리
 *   TC02  round()          - null 입력 → null
 *   TC03  round()          - NaN → null
 *   TC04  round()          - undefined → null
 *   TC05  round()          - 정수 입력 → 그대로
 *   TC06  isUpdatedToday() - 오늘 날짜 파일 → true  (main() 스킵 경로로 간접 검증)
 *   TC07  isUpdatedToday() - 어제 날짜 파일 → false (chart 호출로 간접 검증)
 *   TC08  isUpdatedToday() - 파일 없음(ENOENT) → false (chart 호출로 간접 검증)
 *   TC09  isUpdatedToday() - updated_at 필드 없음 → false (chart 호출로 간접 검증)
 *   TC10  calcMarketInfo() - 빈 배열 → 모든 값 null
 *   TC11  calcMarketInfo() - 1개 → price=close, prev=null
 *   TC12  calcMarketInfo() - 여러 행 → 52주 high/low 정확 (52주 밖 행 제외)
 *   TC13  buildJson()      - ticker="USDI", currency="USD", name="US Dollar Index", prices 포함
 *   TC14  main()           - 오늘 이미 업데이트 → yahooFinance.chart 미호출
 *   TC15  main()           - --force 플래그 → 업데이트 강제 실행(chart 호출)
 *   TC16  main()           - 가격 데이터 < 100개 → Error throw
 *   TC17  main()           - 정상 경로 → writeFileSync 호출 확인
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { round, calcMarketInfo, buildJson, main } from "../fetch/update_dollar_index.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockRenameSync, mockExistsSync,
  mockChart,
} = vi.hoisted(() => ({
  mockReadFileSync:  vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync:     vi.fn(),
  mockRenameSync:    vi.fn(),
  mockExistsSync:    vi.fn(() => false),
  mockChart:         vi.fn(),
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

// ── yahoo-finance2 모킹 ──────────────────────────────────────────────────────

vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = mockChart;
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

function todayStr()     { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
}

function makeQuotes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(2024, 0, i + 1), open: 103, high: 106,
    low: 101, close: 104, adjclose: 104, volume: 0,
  }));
}

// ── TC01~05: round() ──────────────────────────────────────────────────────────

describe("round()", () => {
  it("TC01 - 소수점 3자리 → 2자리 반올림", () => {
    expect(round(104.567)).toBe(104.57);
    expect(round(104.564)).toBe(104.56);
    expect(round(99.999)).toBe(100.00);
  });

  it("TC02 - null 입력 → null", () => {
    expect(round(null)).toBeNull();
  });

  it("TC03 - NaN → null", () => {
    expect(round(NaN)).toBeNull();
  });

  it("TC04 - undefined → null", () => {
    expect(round(undefined)).toBeNull();
  });

  it("TC05 - 정수 입력 → 값 보존", () => {
    expect(round(104)).toBe(104);
    expect(round(0)).toBe(0);
  });
});

// ── TC06~09: isUpdatedToday() 간접 검증 (main()을 통해) ──────────────────────

describe("isUpdatedToday() 간접 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "script.ts"];
  });

  it("TC06 - 오늘 날짜 파일 존재 → main() 스킵(yahooFinance 미호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: new Date().toISOString() })
    );
    await main();
    expect(mockChart).not.toHaveBeenCalled();
  });

  it("TC07 - 어제 날짜 파일 → 업데이트 실행 시도(yahooFinance 호출)", async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ updated_at: `${yesterdayStr()}T00:00:00.000Z` })
    );
    mockChart.mockResolvedValue({ quotes: makeQuotes(120) });
    await main();
    expect(mockChart).toHaveBeenCalled();
  });

  it("TC08 - 파일 없음(readFileSync throw) → 업데이트 실행", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockChart.mockResolvedValue({ quotes: makeQuotes(120) });
    await main();
    expect(mockChart).toHaveBeenCalled();
  });

  it("TC09 - updated_at 필드 없음 → 업데이트 실행", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ ticker: "USDI" }));
    mockChart.mockResolvedValue({ quotes: makeQuotes(120) });
    await main();
    expect(mockChart).toHaveBeenCalled();
  });
});

// ── TC10~12: calcMarketInfo() ─────────────────────────────────────────────────

describe("calcMarketInfo()", () => {
  it("TC10 - 빈 배열 → 모든 값 null", () => {
    const res = calcMarketInfo([]);
    expect(res.price).toBeNull();
    expect(res.previous_close).toBeNull();
    expect(res.fifty_two_week_high).toBeNull();
    expect(res.fifty_two_week_low).toBeNull();
  });

  it("TC11 - 1개 행 → price=close, previous_close=null", () => {
    const res = calcMarketInfo([makePrice(todayStr(), 104.5)]);
    expect(res.price).toBe(104.5);
    expect(res.previous_close).toBeNull();
  });

  it("TC12 - 여러 행 → 최신 close·52주 high/low 정확 (52주 밖 데이터 제외)", () => {
    const today  = new Date();
    const recent = new Date(); recent.setDate(today.getDate() - 10);
    const old    = new Date(); old.setFullYear(today.getFullYear() - 2);

    const prices: PriceRow[] = [
      makePrice(recent.toISOString().slice(0, 10), 104.0, 106.5, 102.0),
      makePrice(today.toISOString().slice(0, 10),  103.5, 105.0, 101.5),
      makePrice(old.toISOString().slice(0, 10),    120.0, 130.0,  90.0),  // 52주 밖 → 제외
    ];

    const res = calcMarketInfo(prices);
    expect(res.price).toBe(103.5);
    expect(res.previous_close).toBe(104.0);
    expect(res.fifty_two_week_high).toBe(106.5);
    expect(res.fifty_two_week_low).toBe(101.5);
  });
});

// ── TC13: buildJson() 구조 검증 ───────────────────────────────────────────────

describe("buildJson() 구조", () => {
  it("TC13 - ticker=USDI, currency=USD, name=US Dollar Index, prices 배열 포함", () => {
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

// ── TC14~17: main() 시나리오 ──────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC14 - 오늘 업데이트 + no --force → skip (yahooFinance 미호출)", async () => {
    process.argv = ["node", "script.ts"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    await main();
    expect(mockChart).not.toHaveBeenCalled();
  });

  it("TC15 - --force 플래그 → 오늘 업데이트여도 강제 실행", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    mockChart.mockResolvedValue({ quotes: makeQuotes(120) });
    await main();
    expect(mockChart).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });

  it("TC16 - 가격 행 < 100개 → Error throw", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockChart.mockResolvedValue({ quotes: makeQuotes(50) });
    await expect(main()).rejects.toThrow("데이터가 너무 적습니다");
    process.argv = ["node", "script.ts"];
  });

  it("TC17 - 정상 경로 → writeFileSync 호출 확인 (null close 필터링 포함)", async () => {
    process.argv = ["node", "script.ts", "--force"];
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockChart.mockResolvedValue({
      quotes: [
        { date: new Date(2024, 0, 1), open: 103, high: 106, low: 101, close: null,  adjclose: 104, volume: 0 },
        { date: new Date(2024, 0, 2), open: null, high: 106, low: 101, close: 104,  adjclose: null, volume: null },
        ...makeQuotes(120).map((q, i) => ({ ...q, date: new Date(2024, 0, i + 3) })),
      ],
    });
    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });
});
