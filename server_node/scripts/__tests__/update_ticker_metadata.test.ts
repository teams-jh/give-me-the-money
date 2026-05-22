/**
 * update_ticker_metadata.ts 테스트
 *
 * TC 계획:
 *   TC01  chunk()           - 일반 배열 분할
 *   TC02  chunk()           - 빈 배열
 *   TC03  chunk()           - 배열 크기 < n → 1개 청크
 *   TC04  chunk()           - n=1 → 각 요소별 청크
 *   TC05  round()           - 소수 반올림 2자리
 *   TC06  round()           - null/NaN/undefined → null
 *   TC07  formatQuarter()   - 1월(Q1) ~ 3월(Q1)
 *   TC08  formatQuarter()   - 4월(Q2), 7월(Q3), 10월(Q4)
 *   TC09  formatQuarter()   - null → null
 *   TC10  tickerToFilename()- "005930.KS" → "005930"
 *   TC11  tickerToFilename()- "AAPL"      → "AAPL"
 *   TC12  tickerToFilename()- "BRK.B"     → "BRK"
 *   TC13  isUpdatedToday()  - 오늘 날짜 → true
 *   TC14  isUpdatedToday()  - 파일 없음 → false
 *   TC15  buildTickerJson() - 필수 최상위 키 포함
 *   TC16  buildTickerJson() - null 필드 처리 (모든 summary 필드 없음)
 *   TC17  buildTickerJson() - quarterly_earnings 최대 4개 슬라이스
 *   TC18  buildTickerJson() - krName 적용 확인
 *   TC19  main()            - 알 수 없는 마켓 → process.exit(1)
 *   TC20  main()            - tickersJson 파일 없음 → Error throw
 *   TC21  isUpdatedToday()  - updated_at 필드 없음 → false
 *   TC22  isUpdatedToday()  - 어제 날짜 → false
 *   TC23  main()            - 정상 흐름: 1개 티커 처리 → writeFileSync 호출
 *   TC24  main()            - force=false, 오늘 날짜 파일 존재 → skipped
 *   TC25  main()            - --force 플래그 → 강제 재처리
 *   TC26  main()            - yahooFinance 에러 → error 카운트
 *   TC27  main()            - --ticker 단일 지정 → sortAllTickersByMarketCap 미호출
 *   TC28  main()            - kr 마켓: name_map 한글명 주입
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chunk, round, formatQuarter, tickerToFilename,
  isUpdatedToday, buildTickerJson, calcAvgYield3y, main,
} from "../fetch/update_ticker_metadata.js";

// ── vi.hoisted: vi.mock() 호이스팅 전에 mock 변수 초기화 ─────────────────────

const {
  mockReadFileSync, mockWriteFileSync, mockMkdirSync,
  mockExistsSync, mockRenameSync, mockReaddirSync,
  mockChart, mockQuoteSummary,
} = vi.hoisted(() => ({
  mockReadFileSync:  vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync:     vi.fn(),
  mockExistsSync:    vi.fn(() => false),
  mockRenameSync:    vi.fn(),
  mockReaddirSync:   vi.fn(() => []),
  mockChart:         vi.fn(),
  mockQuoteSummary:  vi.fn(),
}));

// ── fs 모킹 ──────────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    existsSync:    (...a: unknown[]) => mockExistsSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
    readdirSync:   (...a: unknown[]) => mockReaddirSync(...a),
  },
}));

// ── yahoo-finance2 모킹 ──────────────────────────────────────────────────────

vi.mock("yahoo-finance2", () => ({
  default: class {
    chart        = mockChart;
    quoteSummary = mockQuoteSummary;
  },
}));

// ── TC01~04: chunk() ──────────────────────────────────────────────────────────

describe("chunk()", () => {
  it("TC01 - [1~5] n=2 → [[1,2],[3,4],[5]]", () => {
    expect(chunk([1,2,3,4,5], 2)).toEqual([[1,2],[3,4],[5]]);
  });

  it("TC02 - 빈 배열 → []", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("TC03 - 배열 크기 < n → 1개 청크", () => {
    expect(chunk([1,2], 10)).toEqual([[1,2]]);
  });

  it("TC04 - n=1 → 각 요소별 청크", () => {
    expect(chunk(["a","b","c"], 1)).toEqual([["a"],["b"],["c"]]);
  });
});

// ── TC05~06: round() ──────────────────────────────────────────────────────────

describe("round()", () => {
  it("TC05 - 소수점 반올림", () => {
    expect(round(3.14159)).toBe(3.14);
    expect(round(2.555)).toBe(2.56);
  });

  it("TC06 - null/NaN/undefined → null", () => {
    expect(round(null)).toBeNull();
    expect(round(NaN)).toBeNull();
    expect(round(undefined)).toBeNull();
  });
});

// ── TC07~09: formatQuarter() ──────────────────────────────────────────────────

describe("formatQuarter()", () => {
  it("TC07 - 1월→Q1, 2월→Q1, 3월→Q1", () => {
    expect(formatQuarter(new Date(2024, 0, 15))).toBe("2024Q1");
    expect(formatQuarter(new Date(2024, 1, 15))).toBe("2024Q1");
    expect(formatQuarter(new Date(2024, 2, 31))).toBe("2024Q1");
  });

  it("TC08 - 4월→Q2, 7월→Q3, 10월→Q4, 12월→Q4", () => {
    expect(formatQuarter(new Date(2024, 3,  1))).toBe("2024Q2");
    expect(formatQuarter(new Date(2024, 6,  1))).toBe("2024Q3");
    expect(formatQuarter(new Date(2024, 9,  1))).toBe("2024Q4");
    expect(formatQuarter(new Date(2024, 11, 31))).toBe("2024Q4");
  });

  it("TC09 - null/undefined → null", () => {
    expect(formatQuarter(null)).toBeNull();
    expect(formatQuarter(undefined)).toBeNull();
  });
});

// ── TC10~12: tickerToFilename() ───────────────────────────────────────────────

describe("tickerToFilename()", () => {
  it("TC10 - '005930.KS' → '005930'", () => {
    expect(tickerToFilename("005930.KS")).toBe("005930");
  });

  it("TC11 - 'AAPL' → 'AAPL'", () => {
    expect(tickerToFilename("AAPL")).toBe("AAPL");
  });

  it("TC12 - 'BRK.B' → 'BRK'", () => {
    expect(tickerToFilename("BRK.B")).toBe("BRK");
  });
});

// ── TC13~14·TC21~22: isUpdatedToday() ────────────────────────────────────────

describe("isUpdatedToday()", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC13 - 오늘 날짜 → true", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: new Date().toISOString() }));
    expect(isUpdatedToday("/fake/ticker.json")).toBe(true);
  });

  it("TC14 - 파일 없음(throw) → false", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    expect(isUpdatedToday("/fake/nonexistent.json")).toBe(false);
  });

  it("TC21 - updated_at 필드 없음 → false", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({}));
    expect(isUpdatedToday("/fake/ticker.json")).toBe(false);
  });

  it("TC22 - 어제 날짜 → false", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: yesterday.toISOString() }));
    expect(isUpdatedToday("/fake/ticker.json")).toBe(false);
  });
});

// ── TC15~18: buildTickerJson() ────────────────────────────────────────────────

interface YfSummary {
  price?: { longName?: string|null; shortName?: string|null; exchangeName?: string|null;
            exchange?: string|null; currency?: string|null; marketCap?: number|null;
            regularMarketPrice?: number|null; marketState?: string|null; };
  assetProfile?: { sector?: string|null; industry?: string|null; country?: string|null;
                   fullTimeEmployees?: number|null; };
  defaultKeyStatistics?: { sharesOutstanding?: number|null; floatShares?: number|null;
                            pegRatio?: number|null; priceToBook?: number|null;
                            trailingEps?: number|null; forwardEps?: number|null;
                            enterpriseValue?: number|null; heldPercentInstitutions?: number|null;
                            heldPercentInsiders?: number|null; shortRatio?: number|null; };
  summaryDetail?: { previousClose?: number|null; fiftyTwoWeekHigh?: number|null;
                    fiftyTwoWeekLow?: number|null; beta?: number|null;
                    averageVolume?: number|null; averageVolume10days?: number|null;
                    trailingPE?: number|null; forwardPE?: number|null;
                    dividendRate?: number|null; dividendYield?: number|null; payoutRatio?: number|null; };
  financialData?: { currentPrice?: number|null; profitMargins?: number|null;
                    grossMargins?: number|null; operatingMargins?: number|null;
                    returnOnEquity?: number|null; returnOnAssets?: number|null;
                    revenueGrowth?: number|null; earningsGrowth?: number|null; };
  incomeStatementHistoryQuarterly?: {
    incomeStatementHistory?: Array<{ endDate?: Date|null; netIncome?: number|null; }>;
  };
}

describe("buildTickerJson()", () => {
  it("TC15 - 필수 최상위 키 모두 포함", () => {
    const result = buildTickerJson("AAPL", {
      price: { longName: "Apple Inc", currency: "USD", regularMarketPrice: 180 },
    } as YfSummary, [], []);
    expect(result).toHaveProperty("ticker", "AAPL");
    expect(result).toHaveProperty("info");
    expect(result).toHaveProperty("market");
    expect(result).toHaveProperty("liquidity");
    expect(result).toHaveProperty("valuation");
    expect(result).toHaveProperty("profitability");
    expect(result).toHaveProperty("dividend");
    expect(result).toHaveProperty("ownership");
    expect(result).toHaveProperty("prices");
  });

  it("TC16 - 빈 summary → 모든 값 null", () => {
    const result = buildTickerJson("AAPL", {} as YfSummary, [], []);
    expect(result.info.name).toBeNull();
    expect(result.market.price).toBeNull();
    expect(result.market.market_cap).toBeNull();
  });

  it("TC17 - quarterly_earnings 최대 4개 슬라이스", () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      endDate:   new Date(2024, i * 3, 1),
      netIncome: (i + 1) * 1000,
    }));
    const result = buildTickerJson("AAPL", {
      incomeStatementHistoryQuarterly: { incomeStatementHistory: entries },
    } as YfSummary, [], []);
    expect(result.profitability.quarterly_earnings.length).toBe(4);
  });

  it("TC18 - krName 적용", () => {
    const result = buildTickerJson("005930.KS", {} as YfSummary, [], [], "삼성전자");
    expect(result.info.kr_name).toBe("삼성전자");
  });
});

// ── calcAvgYield3y() ─────────────────────────────────────────────────────────

describe("calcAvgYield3y()", () => {
  /** 오늘 기준 n년 전 날짜 문자열 */
  function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  it("TC-DIV1 - 배당 이벤트 없음 → null", () => {
    const prices = [{ date: daysAgo(100), close: 100, open: null, high: null, low: null, adj_close: null, volume: null }];
    expect(calcAvgYield3y(prices, [])).toBeNull();
  });

  it("TC-DIV2 - 3년 범위 내 가격 없음 → null", () => {
    const oldDate = "2010-01-01";
    const prices  = [{ date: oldDate, close: 100, open: null, high: null, low: null, adj_close: null, volume: null }];
    const divs    = [{ date: "2010-06-01", amount: 1.0 }];
    expect(calcAvgYield3y(prices, divs)).toBeNull();
  });

  it("TC-DIV3 - 정상 계산: TTM 배당 / 종가 평균", () => {
    // 2년 전 날짜에 주가 + 배당 이벤트 설정
    const priceDate = daysAgo(365 * 2);      // 2년 전
    const divDate   = daysAgo(365 * 2 + 30); // 배당은 그보다 30일 전 (TTM 윈도우 내)
    const prices = [{ date: priceDate, close: 100, open: null, high: null, low: null, adj_close: null, volume: null }];
    const divs   = [{ date: divDate, amount: 4.0 }];
    const result = calcAvgYield3y(prices, divs);
    // TTM = 4.0, close = 100 → yield = 0.04
    expect(result).toBe(0.04);
  });

  it("TC-DIV4 - TTM 윈도우 밖 배당은 제외", () => {
    const priceDate  = daysAgo(365);        // 1년 전 주가
    const oldDivDate = daysAgo(365 + 400);  // 400일 전 배당 (TTM 365일 윈도우 밖)
    const prices = [{ date: priceDate, close: 200, open: null, high: null, low: null, adj_close: null, volume: null }];
    const divs   = [{ date: oldDivDate, amount: 10.0 }];
    // TTM = 0 → yield = 0 → avg = 0
    expect(calcAvgYield3y(prices, divs)).toBe(0);
  });
});

// ── TC19~20: main() 에러 시나리오 ────────────────────────────────────────────

describe("main() 에러 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC19 - 알 수 없는 마켓 → process.exit(1)", async () => {
    process.argv = ["node", "script.ts", "--market", "jp"];
    const mockErr  = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await main().catch(() => {});
    expect(mockExit).toHaveBeenCalledWith(1);
    mockErr.mockRestore();
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC20 - tickersJson 파일 없음 → Error throw", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];
    mockExistsSync.mockReturnValue(false);
    await expect(main()).rejects.toThrow("파일이 없습니다");
    process.argv = ["node", "script.ts"];
  });
});

// ── TC23~28: main() 정상 흐름 ────────────────────────────────────────────────

describe("main() 정상 흐름 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TC23 - 정상 흐름: 1개 티커 처리 → writeFileSync 호출", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];
    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(false)  // processTicker: 신규
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: ticker 파일
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: top1000 source
      .mockReturnValueOnce(true);  // sortAllTickersByMarketCap: manual source

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ market: { market_cap: 3_000_000_000_000 } }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"] }))   // top1000
      .mockReturnValueOnce(JSON.stringify({ tickers: [] }));         // manual

    mockChart.mockResolvedValue({
      quotes: [{ date: new Date("2024-01-02"), open: 180, high: 185, low: 175,
                 close: 182, adjClose: 182, volume: 1_000_000 }],
      events: {},
    });
    mockQuoteSummary.mockResolvedValue({
      price: { longName: "Apple Inc", currency: "USD", regularMarketPrice: 182, marketState: "REGULAR" },
      incomeStatementHistoryQuarterly: {
        incomeStatementHistory: [{ endDate: new Date("2024-03-31"), netIncome: 2e10 }],
      },
    });

    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });

  it("TC24 - force=false, 오늘 날짜 파일 존재 → skipped (yahooFinance 미호출)", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (String(p).includes("all_us_tickers.json")) {
        return JSON.stringify({ tickers: ["AAPL"], name_map: {} });
      }
      if (String(p).includes("top1000_us_tickers.json") || String(p).includes("manual_us_tickers.json")) {
        return JSON.stringify({ tickers: ["AAPL"] });
      }
      return JSON.stringify({ updated_at: new Date().toISOString(), market: { market_cap: 3e12 } });
    });

    await main();
    expect(mockChart).not.toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();  // sortAllTickersByMarketCap은 실행
    process.argv = ["node", "script.ts"];
  });

  it("TC25 - --force 플래그: 오늘 날짜 파일 있어도 강제 재처리", async () => {
    process.argv = ["node", "script.ts", "--market", "us", "--force"];
    // force=true → processTicker의 existsSync(!force && existsSync) short-circuit으로 미호출
    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: AAPL.json
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: top1000 source
      .mockReturnValueOnce(true);  // sortAllTickersByMarketCap: manual source

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ market: { market_cap: 3e12 } }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"] }))   // top1000
      .mockReturnValueOnce(JSON.stringify({ tickers: [] }));         // manual

    mockChart.mockResolvedValue({ quotes: [], events: {} });
    mockQuoteSummary.mockResolvedValue({ price: { longName: "Apple Inc" } });

    await main();
    expect(mockQuoteSummary).toHaveBeenCalled();
    process.argv = ["node", "script.ts"];
  });

  it("TC26 - yahooFinance 에러 → error 카운트 (process.exit 없음)", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];
    // sortAllTickersByMarketCap: 티커 파일 existsSync 먼저, 소스 파일 나중
    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(false)  // processTicker: AAPL.json (신규)
      .mockReturnValueOnce(false)  // sortAllTickersByMarketCap: AAPL.json (에러로 미생성)
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: top1000 source
      .mockReturnValueOnce(true);  // sortAllTickersByMarketCap: manual source

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))  // loadTickers
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))  // sortAll: tickersJson
      // AAPL.json: existsSync false → skip
      .mockReturnValueOnce(JSON.stringify({ tickers: [] }))  // top1000
      .mockReturnValueOnce(JSON.stringify({ tickers: [] })); // manual
    mockQuoteSummary.mockRejectedValue(new Error("Yahoo API timeout"));
    mockChart.mockResolvedValue({ quotes: [], events: {} });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await main();
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC27 - --ticker 단일 지정 → sortAllTickersByMarketCap 미호출", async () => {
    process.argv = ["node", "script.ts", "--market", "us", "--ticker", "AAPL"];
    mockExistsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL", "MSFT"], name_map: {} }));
    mockChart.mockResolvedValue({ quotes: [], events: {} });
    mockQuoteSummary.mockResolvedValue({ price: { longName: "Apple Inc" } });

    await main();
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);  // loadTickers만
    process.argv = ["node", "script.ts"];
  });

  it("TC28 - kr 마켓: name_map 한글명 processTicker에 주입", async () => {
    process.argv = ["node", "script.ts", "--market", "kr"];
    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(false)  // processTicker: 신규
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: ticker 파일
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: kospi300 source
      .mockReturnValueOnce(true)   // sortAllTickersByMarketCap: kosdaq200 source
      .mockReturnValueOnce(true);  // sortAllTickersByMarketCap: manual source

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["005930.KS"], name_map: { "005930.KS": "삼성전자" } }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["005930.KS"], name_map: { "005930.KS": "삼성전자" } }))
      .mockReturnValueOnce(JSON.stringify({ market: { market_cap: 5e14 } }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["005930.KS"] }))  // kospi300
      .mockReturnValueOnce(JSON.stringify({ tickers: [] }))             // kosdaq200
      .mockReturnValueOnce(JSON.stringify({ tickers: [] }));            // manual

    mockChart.mockResolvedValue({ quotes: [], events: {} });
    mockQuoteSummary.mockResolvedValue({ price: { longName: "Samsung Electronics" } });

    await main();
    const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      info: { kr_name: string };
    };
    expect(writtenJson.info.kr_name).toBe("삼성전자");
    process.argv = ["node", "script.ts"];
  });
});
