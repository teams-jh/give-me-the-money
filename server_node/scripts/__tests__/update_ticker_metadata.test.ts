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
 *   TC19  main()            - --market 미지정 → us 기본값
 *   TC20  main()            - 알 수 없는 마켓 → process.exit(1)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 인라인 재현: 소스 내 non-export 순수 함수 ────────────────────────────────

function chunk<T>(arr: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

function round(v: number | null | undefined): number | null {
  if (v == null || isNaN(v as number)) return null;
  return Math.round((v as number) * 100) / 100;
}

function formatQuarter(date: Date | null | undefined): string | null {
  if (!date) return null;
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}Q${q}`;
}

function tickerToFilename(ticker: string): string {
  return ticker.split(".")[0] ?? ticker;
}

// ── buildTickerJson 인라인 재현 ───────────────────────────────────────────────

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

function buildTickerJson(ticker: string, summary: YfSummary, prices: unknown[], krName: string|null = null) {
  const p   = summary.price ?? {};
  const ap  = summary.assetProfile ?? {};
  const ks  = summary.defaultKeyStatistics ?? {};
  const sd  = summary.summaryDetail ?? {};
  const fd  = summary.financialData ?? {};
  const ish = summary.incomeStatementHistoryQuarterly ?? {};

  const quarterlyEarnings = (ish.incomeStatementHistory ?? []).slice(0, 4).map((q) => ({
    quarter:    formatQuarter(q.endDate ?? null),
    net_income: q.netIncome ?? null,
  }));

  return {
    ticker, updated_at: new Date().toISOString(),
    info: {
      name:                p.longName ?? p.shortName ?? null,
      kr_name:             krName,
      exchange:            p.exchangeName ?? p.exchange ?? null,
      currency:            p.currency    ?? null,
      sector:              ap.sector     ?? null,
      industry:            ap.industry   ?? null,
      country:             ap.country    ?? null,
      employees:           ap.fullTimeEmployees ?? null,
      is_actively_trading: p.marketState != null ? p.marketState !== "POST" : null,
    },
    market: {
      market_cap:          p.marketCap          ?? null,
      shares_outstanding:  ks.sharesOutstanding  ?? null,
      float_shares:        ks.floatShares        ?? null,
      price:               p.regularMarketPrice ?? fd.currentPrice ?? null,
      previous_close:      sd.previousClose      ?? null,
      fifty_two_week_high: sd.fiftyTwoWeekHigh   ?? null,
      fifty_two_week_low:  sd.fiftyTwoWeekLow    ?? null,
      beta:                sd.beta               ?? null,
    },
    liquidity:     { avg_daily_volume_3m: sd.averageVolume ?? null, avg_daily_volume_10d: sd.averageVolume10days ?? null },
    valuation:     { trailing_pe: sd.trailingPE ?? null, forward_pe: sd.forwardPE ?? null,
                     peg_ratio: ks.pegRatio ?? null, price_to_book: ks.priceToBook ?? null,
                     trailing_eps: ks.trailingEps ?? null, forward_eps: ks.forwardEps ?? null,
                     enterprise_value: ks.enterpriseValue ?? null },
    profitability: { profit_margins: fd.profitMargins ?? null, gross_margins: fd.grossMargins ?? null,
                     operating_margins: fd.operatingMargins ?? null, roe: fd.returnOnEquity ?? null,
                     roa: fd.returnOnAssets ?? null, revenue_growth: fd.revenueGrowth ?? null,
                     earnings_growth: fd.earningsGrowth ?? null, quarterly_earnings: quarterlyEarnings },
    dividend:      { rate: sd.dividendRate ?? null, yield: sd.dividendYield ?? null, payout_ratio: sd.payoutRatio ?? null },
    ownership:     { held_pct_institutions: ks.heldPercentInstitutions ?? null,
                     held_pct_insiders: ks.heldPercentInsiders ?? null, short_ratio: ks.shortRatio ?? null },
    prices,
  };
}

// ── isUpdatedToday 인라인 재현 ────────────────────────────────────────────────

import fsMod from "fs";

function isUpdatedToday(file: string): boolean {
  try {
    const data        = JSON.parse(fsMod.readFileSync(file, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today       = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch { return false; }
}

// ── fs / yahoo-finance2 모킹 ─────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();
const mockExistsSync    = vi.fn(() => false);
const mockRenameSync    = vi.fn();
const mockReaddirSync   = vi.fn(() => []);

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

const mockHistorical   = vi.fn();
const mockQuoteSummary = vi.fn();
vi.mock("yahoo-finance2", () => ({
  default: class {
    historical   = mockHistorical;
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

// ── TC13~14: isUpdatedToday() ────────────────────────────────────────────────

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

describe("buildTickerJson()", () => {
  it("TC15 - 필수 최상위 키 모두 포함", () => {
    const result = buildTickerJson("AAPL", {
      price: { longName: "Apple Inc", currency: "USD", regularMarketPrice: 180 },
    }, []);
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
    const result = buildTickerJson("AAPL", {}, []);
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
    }, []);
    expect(result.profitability.quarterly_earnings.length).toBe(4);
  });

  it("TC18 - krName 적용", () => {
    const result = buildTickerJson("005930.KS", {}, [], "삼성전자");
    expect(result.info.kr_name).toBe("삼성전자");
  });
});

// ── TC19~20: main() ───────────────────────────────────────────────────────────

describe("main() 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC19 - 알 수 없는 마켓 → process.exit(1)", async () => {
    process.argv = ["node", "script.ts", "--market", "jp"];
    // main().catch(...)가 비동기이므로 import() 자체는 reject되지 않음
    // → () => {} mock으로 exit 호출만 검증, console.error 억제로 부작용 노이즈 제거
    const mockErr  = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockErr.mockRestore();
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC20 - tickersJson 파일 없음 → process.exit(1)", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];
    mockExistsSync.mockReturnValue(false);
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });
});

// ── TC23~TC28: main() 정상 흐름 ───────────────────────────────────────────────

describe("main() 정상 흐름 시나리오", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("TC23 - 정상 흐름: 1개 티커 처리 → writeFileSync + sortAllTickersByMarketCap 호출", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];

    // existsSync 순서: loadTickers(true), processTicker(false=신규), sortAllTickersByMarketCap(true=존재)
    mockExistsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    // readFileSync 순서: loadTickers, sortSort×tickersJson, sortSort×AAPL.json
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ market: { market_cap: 3_000_000_000_000 } }));

    mockHistorical.mockResolvedValue([{
      date: new Date("2024-01-02"), open: 180, high: 185, low: 175,
      close: 182, adjClose: 182, volume: 1_000_000,
    }]);
    mockQuoteSummary.mockResolvedValue({
      price: { longName: "Apple Inc", currency: "USD", regularMarketPrice: 182, marketState: "REGULAR" },
      incomeStatementHistoryQuarterly: {
        incomeStatementHistory: [
          { endDate: new Date("2024-03-31"), netIncome: 2e10 },
        ],
      },
    });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");

    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC24 - force=false, 오늘 날짜 파일 존재 → skipped (yahooFinance 미호출)", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (String(p).includes("all_us_tickers.json")) {
        return JSON.stringify({ tickers: ["AAPL"], name_map: {} });
      }
      return JSON.stringify({ updated_at: new Date().toISOString(), market: { market_cap: 3e12 } });
    });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");

    // skipped → yahooFinance 미호출, sortAllTickersByMarketCap은 실행(writeFileSync)
    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    expect(mockHistorical).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC25 - --force 플래그: 오늘 날짜 파일 있어도 강제 재처리", async () => {
    process.argv = ["node", "script.ts", "--market", "us", "--force"];

    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(true)   // processTicker: 파일 있지만 force=true → skip 안 함
      .mockReturnValueOnce(true);  // sortAllTickersByMarketCap

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }))
      .mockReturnValueOnce(JSON.stringify({ market: { market_cap: 3e12 } }));

    mockHistorical.mockResolvedValue([]);
    mockQuoteSummary.mockResolvedValue({ price: { longName: "Apple Inc" } });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");

    await vi.waitFor(() => expect(mockQuoteSummary).toHaveBeenCalled(), { timeout: 5000 });
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC26 - yahooFinance 에러 → error 카운트 (process.exit 없음)", async () => {
    process.argv = ["node", "script.ts", "--market", "us"];

    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(false); // processTicker: 파일 없음

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL"], name_map: {} }));

    mockQuoteSummary.mockRejectedValue(new Error("Yahoo API timeout"));
    mockHistorical.mockResolvedValue([]);

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");

    await new Promise((r) => setTimeout(r, 500));
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC27 - --ticker 단일 지정 → sortAllTickersByMarketCap 미호출", async () => {
    process.argv = ["node", "script.ts", "--market", "us", "--ticker", "AAPL"];

    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers
      .mockReturnValueOnce(false); // processTicker: 파일 없음

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ tickers: ["AAPL", "MSFT"], name_map: {} }));
    mockHistorical.mockResolvedValue([]);
    mockQuoteSummary.mockResolvedValue({ price: { longName: "Apple Inc" } });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");

    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    // --ticker 있으면 sortAllTickersByMarketCap 미호출 → readFileSync 1번(loadTickers)만
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });

  it("TC28 - kr 마켓: name_map 한글명 processTicker에 주입", async () => {
    process.argv = ["node", "script.ts", "--market", "kr"];

    mockExistsSync
      .mockReturnValueOnce(true)   // loadTickers: all_kr_tickers.json
      .mockReturnValueOnce(false)  // processTicker
      .mockReturnValueOnce(true);  // sortAllTickersByMarketCap

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ["005930.KS"], name_map: { "005930.KS": "삼성전자" } }))
      .mockReturnValueOnce(JSON.stringify({ tickers: ["005930.KS"], name_map: { "005930.KS": "삼성전자" } }))
      .mockReturnValueOnce(JSON.stringify({ market: { market_cap: 5e14 } }));

    mockHistorical.mockResolvedValue([]);
    mockQuoteSummary.mockResolvedValue({ price: { longName: "Samsung Electronics" } });

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await import("../fetch/update_ticker_metadata.js");

    await vi.waitFor(() => expect(mockWriteFileSync).toHaveBeenCalled(), { timeout: 5000 });
    const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      info: { kr_name: string };
    };
    expect(writtenJson.info.kr_name).toBe("삼성전자");
    mockExit.mockRestore();
    process.argv = ["node", "script.ts"];
  });
});
