/**
 * tickerRepository / tickerMapper 테스트 (Issue #64)
 *
 * 분석·시뮬레이션 스크립트에 흩어져 있던 데이터 접근(fs) / 매핑 로직을
 * shared 계층으로 모은 것에 대한 단위 테스트.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toOHLCV, toFundamentalData, toDailyPrices } from "./tickerMapper.ts";
import {
  tickerToFilename,
  resolveMarketPaths,
  loadTickerList,
  loadTicker,
  findSimilarTicker,
  saveJson,
} from "./tickerRepository.ts";
import type { RawTicker } from "./tickerTypes.ts";

// ── 픽스처 ───────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawTicker> = {}): RawTicker {
  return {
    ticker: "AAPL",
    info: { name: "Apple", sector: "Tech" },
    market: {
      price: 100,
      fifty_two_week_high: 120,
      fifty_two_week_low: 80,
      beta: 1.1,
    },
    liquidity: { avg_daily_volume_3m: 1000, avg_daily_volume_10d: 1200 },
    valuation: { trailing_pe: 25, price_to_book: 5, peg_ratio: 1.5 },
    profitability: {
      roe: 0.3,
      roa: 0.2,
      operating_margins: 0.25,
      profit_margins: 0.21,
      revenue_growth: 0.1,
      quarterly_earnings: [{ quarter: "2024Q1", net_income: 100 }],
    },
    dividend: { yield: 0.01, payout_ratio: 0.2 },
    ownership: {
      held_pct_insiders: 0.05,
      held_pct_institutions: 0.6,
      short_ratio: 1.2,
    },
    prices: [
      { date: "2024-01-01", open: 1, high: 2, low: 0.5, close: 1.5, adj_close: 1.5, volume: 10 },
      { date: "2024-01-02", open: 1.5, high: 3, low: 1, close: 2.5, adj_close: 2.5, volume: 20 },
    ],
    ...overrides,
  } as RawTicker;
}

// ── tickerToFilename ─────────────────────────────────────────────────────────

describe("tickerToFilename", () => {
  it("Yahoo suffix(.KS/.KQ)를 떼고 코드만 반환", () => {
    expect(tickerToFilename("005930.KS")).toBe("005930");
    expect(tickerToFilename("035720.KQ")).toBe("035720");
  });
  it("suffix 없는 미국 티커는 그대로", () => {
    expect(tickerToFilename("AAPL")).toBe("AAPL");
  });
});

// ── 매퍼 ─────────────────────────────────────────────────────────────────────

describe("toOHLCV", () => {
  it("prices 배열을 OHLCV 로 매핑 (adj_close 제외)", () => {
    const ohlcv = toOHLCV(makeRaw());
    expect(ohlcv).toHaveLength(2);
    expect(ohlcv[0]).toEqual({ date: "2024-01-01", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
  });
  it("prices 누락 시 빈 배열 반환 (TypeError 방지)", () => {
    const raw = makeRaw();
    // @ts-expect-error 의도적 누락
    raw.prices = undefined;
    expect(toOHLCV(raw)).toEqual([]);
  });
});

describe("toDailyPrices", () => {
  it("date/close 만 추출", () => {
    expect(toDailyPrices(makeRaw())).toEqual([
      { date: "2024-01-01", close: 1.5 },
      { date: "2024-01-02", close: 2.5 },
    ]);
  });
  it("prices 누락 시 빈 배열 반환 (TypeError 방지)", () => {
    const raw = makeRaw();
    // @ts-expect-error 의도적 누락
    raw.prices = undefined;
    expect(toDailyPrices(raw)).toEqual([]);
  });
});

describe("toFundamentalData", () => {
  it("중첩 필드를 평탄한 FundamentalData 로 변환", () => {
    const fd = toFundamentalData(makeRaw());
    expect(fd.pe).toBe(25);
    expect(fd.pb).toBe(5);
    expect(fd.roe).toBe(0.3);
    expect(fd.operatingMargin).toBe(0.25);
    expect(fd.dividendYield).toBe(0.01);
    expect(fd.insiderPct).toBe(0.05);
    expect(fd.quarterlyEarnings).toHaveLength(1);
  });
  it("dividend/quarterly_earnings 누락 시 안전한 기본값", () => {
    const raw = makeRaw();
    // @ts-expect-error 의도적 누락
    raw.dividend = undefined;
    // @ts-expect-error 의도적 누락
    raw.profitability.quarterly_earnings = undefined;
    const fd = toFundamentalData(raw);
    expect(fd.dividendYield).toBeNull();
    expect(fd.payoutRatio).toBeNull();
    expect(fd.quarterlyEarnings).toEqual([]);
  });
});

// ── Repository (파일시스템) ──────────────────────────────────────────────────

describe("tickerRepository (fs)", () => {
  let tmp: string;
  let dbDir: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-"));
    dbDir = path.join(tmp, "db");
    // kr 마켓 구조 생성
    fs.mkdirSync(path.join(dbDir, "metadata"), { recursive: true });
    fs.mkdirSync(path.join(dbDir, "kr/tickers"), { recursive: true });
    fs.writeFileSync(
      path.join(dbDir, "metadata", "all_kr_tickers.json"),
      JSON.stringify({ tickers: ["005930.KS", "035720.KQ", "000660.KS"] }),
    );
    fs.writeFileSync(
      path.join(dbDir, "kr/tickers", "005930.json"),
      JSON.stringify(makeRaw({ ticker: "005930.KS" })),
    );
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("resolveMarketPaths: 마켓별 경로 규칙 일원화", () => {
    const p = resolveMarketPaths("kr", dbDir);
    expect(p.tickersJson).toBe(path.join(dbDir, "metadata", "all_kr_tickers.json"));
    expect(p.tickersDir).toBe(path.join(dbDir, "kr/tickers"));
  });

  it("resolveMarketPaths: 알 수 없는 마켓은 null", () => {
    expect(resolveMarketPaths("xx", dbDir)).toBeNull();
  });

  it("loadTickerList: 전체 / n 슬라이스", () => {
    expect(loadTickerList("kr", dbDir)).toEqual(["005930.KS", "035720.KQ", "000660.KS"]);
    expect(loadTickerList("kr", dbDir, 2)).toEqual(["005930.KS", "035720.KQ"]);
  });

  it("loadTicker: 존재하면 RawTicker, 없으면 null", () => {
    expect(loadTicker("kr", "005930.KS", dbDir)?.ticker).toBe("005930.KS");
    expect(loadTicker("kr", "999999.KS", dbDir)).toBeNull();
  });

  it("findSimilarTicker: signals 파일에서 prefix 매칭 티커 제안", () => {
    fs.mkdirSync(path.join(dbDir, "kr/signals"), { recursive: true });
    fs.writeFileSync(
      path.join(dbDir, "kr/signals", "signals_all.json"),
      JSON.stringify({ stocks: [{ ticker: "005930.KS" }, { ticker: "000660.KS" }] }),
    );
    expect(findSimilarTicker("kr", "005930", dbDir)).toBe("005930.KS");
    expect(findSimilarTicker("kr", "111111", dbDir)).toBeNull();
  });

  it("saveJson: atomic 저장 후 읽기 가능", () => {
    const out = path.join(tmp, "out.json");
    saveJson(out, { hello: "world" });
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual({ hello: "world" });
  });

  it("saveJson: 존재하지 않는 부모 디렉토리를 자동 생성", () => {
    const out = path.join(tmp, "nested/deep/out.json");
    saveJson(out, { ok: true });
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual({ ok: true });
  });
});
