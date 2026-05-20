/**
 * update_fx_rate.ts 테스트
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
 *   TC12  calcMarketInfo() - 여러 행 → 52주 high/low 정확
 *   TC13  buildJson()      - 반환 구조 ticker·updated_at·info·market·prices 포함
 *   TC14  main()           - 오늘 이미 업데이트 → yahooFinance.chart 미호출
 *   TC15  main()           - --force 플래그 → 업데이트 강제 실행(chart 호출)
 *   TC16  main()           - 가격 데이터 < 100개 → Error throw
 *   TC17  main()           - 정상 경로 → writeFileSync 호출 확인
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { round, calcMarketInfo, buildJson, main } from "../fetch/update_fx_rate.js";

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
    date: new Date(2024, 0, i + 1), open: 1300, high: 1400,
    low: 1250, close: 1350, adjclose: 1350, volume: 0,
  }));
}

// ── TC01~05: round() ──────────────────────────────────────────────────────────

describe("round()", () => {
  it("TC01 - 소수점 3자리 → 2자리 반올림", () => {
    expect(round(1.2345)).toBe(1.23);
    expect(round(1.2355)).toBe(1.24);
    expect(round(1234.567)).toBe(1234.57);
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
    expect(round(1380)).toBe(1380);
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
    mockReadFileSync.mockReturnValue(JSON.stringify({ ticker: "USDKRW" }));
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
    const res = calcMarketInfo([makePrice(todayStr(), 1350)]);
    expect(res.price).toBe(1350);
    expect(res.previous_close).toBeNull();
  });

  it("TC12 - 여러 행 → 52주 기준점이 latest.date 임을 직접 검증", () => {
    // latestDate를 약 2년 전으로 고정
    // → new Date() 기준이면 범위 안 데이터가 없어 high/low = null (FAIL)
    // → latest.date 기준이면 latestDate 로부터 1년 이내 데이터만 포함 (PASS)
    const latestDate = "2024-06-01";
    const recentDate = "2024-05-20";  // latestDate 기준 52주 이내
    const oldDate    = "2022-01-01";  // latestDate 기준 52주 밖 → 제외

    const prices: PriceRow[] = [
      makePrice(recentDate, 1400, 1450, 1380),
      makePrice(latestDate, 1360, 1370, 1340),
      makePrice(oldDate,    2000, 2500, 1900),
    ];

    const res = calcMarketInfo(prices);
    expect(res.price).toBe(1360);
    expect(res.previous_close).toBe(1400);
    expect(res.fifty_two_week_high).toBe(1450);  // oldDate 제외
    expect(res.fifty_two_week_low).toBe(1340);
  });
});

// ── TC13: buildJson() 구조 검증 ───────────────────────────────────────────────

describe("buildJson() 구조", () => {
  it("TC13 - 반환 JSON에 필수 최상위 키 포함", () => {
    const prices: PriceRow[] = [makePrice(todayStr(), 1350)];
    const json = buildJson(prices);

    expect(json.ticker).toBe("USDKRW");
    expect(json.info.currency).toBe("KRW");
    expect(json.market.price).toBe(1350);
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
        { date: new Date(2024, 0, 1), open: 1300, high: 1400, low: 1250, close: null,  adjclose: 1350, volume: 0 },
        { date: new Date(2024, 0, 2), open: null,  high: 1400, low: 1250, close: 1350, adjclose: null, volume: null },
        ...makeQuotes(120).map((q, i) => ({ ...q, date: new Date(2024, 0, i + 3) })),
      ],
    });
    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });
});
