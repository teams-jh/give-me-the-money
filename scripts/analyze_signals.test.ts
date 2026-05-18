/**
 * analyze_signals.test.ts
 *
 * 커버 대상 함수:
 *   tickerToFilename   — 티커 → 파일명 변환
 *   round1             — 소수점 1자리 반올림
 *   nowStr             — 현재 시간 ISO 문자열
 *   toOHLCV            — RawTicker → OHLCV 변환
 *   toFundamentalData  — RawTicker → FundamentalData 변환
 *   resolveOutputFile  — 출력 파일 경로 결정
 *   parseArgs          — CLI 파싱
 *   loadTickers        — 티커 목록 로드
 *   loadTicker         — 개별 티커 데이터 로드
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

vi.mock('fs', () => ({
  default: {
    readdirSync:   vi.fn(),
    readFileSync:  vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync:     vi.fn(),
    existsSync:    vi.fn(),
  },
}));

import fs from 'fs';
import {
  tickerToFilename,
  round1,
  nowStr,
  toOHLCV,
  toFundamentalData,
  resolveOutputFile,
  parseArgs,
  loadTickers,
  loadTicker,
} from './analyze_signals.ts';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── 픽스처 ───────────────────────────────────────────────────────────────────

function makeRawTicker(overrides: Partial<any> = {}): any {
  return {
    ticker: 'AAPL',
    info:   { name: 'Apple', kr_name: '애플', sector: 'Technology' },
    market: { price: 175, fifty_two_week_high: 200, fifty_two_week_low: 140, beta: 1.2 },
    liquidity: { avg_daily_volume_3m: 50000000, avg_daily_volume_10d: 45000000 },
    valuation: { trailing_pe: 28.5, price_to_book: 45.3, peg_ratio: 2.1 },
    profitability: {
      roe: 0.15, roa: 0.08, operating_margins: 0.3, profit_margins: 0.25,
      revenue_growth: 0.08,
      quarterly_earnings: [
        { quarter: '2024Q3', net_income: 21000000000 },
        { quarter: '2024Q2', net_income: 19000000000 },
      ],
    },
    dividend:   { yield: 0.005, payout_ratio: 0.15 },
    ownership:  { held_pct_insiders: 0.003, held_pct_institutions: 0.60, short_ratio: 1.5 },
    prices: Array.from({ length: 30 }, (_, i) => ({
      date:      `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:      170 + i * 0.2,
      high:      172 + i * 0.2,
      low:       168 + i * 0.2,
      close:     170 + i * 0.2,
      adj_close: 170 + i * 0.2,
      volume:    1000000,
    })),
    ...overrides,
  };
}

// ── tickerToFilename ──────────────────────────────────────────────────────────

describe('tickerToFilename', () => {
  it('접미사 없는 티커 → 그대로 반환', () => {
    expect(tickerToFilename('AAPL')).toBe('AAPL');
    expect(tickerToFilename('NVDA')).toBe('NVDA');
  });

  it('.KS 접미사 제거', () => {
    expect(tickerToFilename('005930.KS')).toBe('005930');
  });

  it('.KQ 접미사 제거', () => {
    expect(tickerToFilename('035720.KQ')).toBe('035720');
  });

  it('점이 여러 개여도 첫 번째 앞부분만', () => {
    expect(tickerToFilename('A.B.C')).toBe('A');
  });
});

// ── round1 ────────────────────────────────────────────────────────────────────

describe('round1', () => {
  it('소수점 1자리 반올림', () => {
    expect(round1(1.25)).toBe(1.3);
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.0)).toBe(1.0);
  });

  it('음수 처리', () => {
    // JS Math.round: -1.25 * 10 = -12.5 → Math.round(-12.5) = -12 → -1.2
    // -1.35 * 10 = -13.5 → Math.round(-13.5) = -13 → -1.3
    expect(round1(-1.35)).toBe(-1.3);
    expect(round1(-1.24)).toBe(-1.2);
  });

  it('0 처리', () => {
    expect(round1(0)).toBe(0);
  });

  it('정수 처리', () => {
    expect(round1(5)).toBe(5);
  });

  it('큰 수 처리', () => {
    expect(round1(1234.567)).toBe(1234.6);
  });
});

// ── nowStr ────────────────────────────────────────────────────────────────────

describe('nowStr', () => {
  it('YYYY-MM-DD HH:MM 형식 반환', () => {
    const result = nowStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('16자 길이', () => {
    expect(nowStr()).toHaveLength(16);
  });
});

// ── toOHLCV ───────────────────────────────────────────────────────────────────

describe('toOHLCV', () => {
  it('prices 배열을 OHLCV 배열로 변환', () => {
    const raw = makeRawTicker();
    const result = toOHLCV(raw);
    expect(result).toHaveLength(30);
  });

  it('각 필드가 올바르게 매핑됨', () => {
    const raw = makeRawTicker();
    const first = toOHLCV(raw)[0]!;
    const src   = raw.prices[0]!;
    expect(first.date).toBe(src.date);
    expect(first.open).toBe(src.open);
    expect(first.high).toBe(src.high);
    expect(first.low).toBe(src.low);
    expect(first.close).toBe(src.close);
    expect(first.volume).toBe(src.volume);
  });

  it('adj_close 는 OHLCV에 포함되지 않음', () => {
    const raw    = makeRawTicker();
    const result = toOHLCV(raw);
    expect('adj_close' in result[0]!).toBe(false);
  });

  it('빈 prices → 빈 배열', () => {
    const raw = makeRawTicker({ prices: [] });
    expect(toOHLCV(raw)).toHaveLength(0);
  });
});

// ── toFundamentalData ─────────────────────────────────────────────────────────

describe('toFundamentalData', () => {
  it('밸류에이션 필드 매핑', () => {
    const raw    = makeRawTicker();
    const result = toFundamentalData(raw);
    expect(result.pe).toBe(raw.valuation.trailing_pe);
    expect(result.pb).toBe(raw.valuation.price_to_book);
    expect(result.pegRatio).toBe(raw.valuation.peg_ratio);
  });

  it('수익성 필드 매핑', () => {
    const raw    = makeRawTicker();
    const result = toFundamentalData(raw);
    expect(result.roe).toBe(raw.profitability.roe);
    expect(result.roa).toBe(raw.profitability.roa);
    expect(result.operatingMargin).toBe(raw.profitability.operating_margins);
    expect(result.profitMargins).toBe(raw.profitability.profit_margins);
    expect(result.revenueGrowth).toBe(raw.profitability.revenue_growth);
  });

  it('배당 필드 매핑', () => {
    const raw    = makeRawTicker();
    const result = toFundamentalData(raw);
    expect(result.dividendYield).toBe(raw.dividend.yield);
    expect(result.payoutRatio).toBe(raw.dividend.payout_ratio);
  });

  it('소유구조 필드 매핑', () => {
    const raw    = makeRawTicker();
    const result = toFundamentalData(raw);
    expect(result.insiderPct).toBe(raw.ownership.held_pct_insiders);
    expect(result.institutionPct).toBe(raw.ownership.held_pct_institutions);
    expect(result.shortRatio).toBe(raw.ownership.short_ratio);
  });

  it('quarterlyEarnings 배열 매핑', () => {
    const raw    = makeRawTicker();
    const result = toFundamentalData(raw);
    expect(result.quarterlyEarnings).toHaveLength(2);
    expect(result.quarterlyEarnings[0]!.quarter).toBe('2024Q3');
  });

  it('null 필드 처리', () => {
    const raw = makeRawTicker({
      valuation:     { trailing_pe: null, price_to_book: null, peg_ratio: null },
      profitability: {
        roe: null, roa: null, operating_margins: null,
        profit_margins: null, revenue_growth: null, quarterly_earnings: [],
      },
      dividend: { yield: null, payout_ratio: null },
      ownership: { held_pct_insiders: null, held_pct_institutions: null, short_ratio: null },
    });
    const result = toFundamentalData(raw);
    expect(result.pe).toBeNull();
    expect(result.roe).toBeNull();
    expect(result.dividendYield).toBeNull();
    expect(result.shortRatio).toBeNull();
  });

  it('dividend 없을 때 null 처리', () => {
    const raw = makeRawTicker({ dividend: undefined });
    const result = toFundamentalData(raw);
    expect(result.dividendYield).toBeNull();
  });
});

// ── resolveOutputFile ─────────────────────────────────────────────────────────

describe('resolveOutputFile', () => {
  const config = {
    tickersJson: '/db/metadata/all_kr_tickers.json',
    tickersDir:  '/db/kr_tickers',
    signalsDir:  '/db/kr_signals',
  };

  it('n 없으면 signals_all.json', () => {
    const result = resolveOutputFile(config);
    expect(result).toContain('signals_all.json');
  });

  it('n = 100 이면 signals_100.json', () => {
    const result = resolveOutputFile(config, 100);
    expect(result).toContain('signals_100.json');
  });

  it('signalsDir 경로 포함', () => {
    const result = resolveOutputFile(config, 50);
    expect(result).toContain('/db/kr_signals');
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('기본값: market=kr, n=undefined, minScore=0', () => {
    process.argv = ['node', 'script.ts'];
    const args = parseArgs();
    expect(args.market).toBe('kr');
    expect(args.n).toBeUndefined();
    expect(args.minScore).toBe(0);
  });

  it('--market us 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us'];
    expect(parseArgs().market).toBe('us');
  });

  it('-n 50 파싱', () => {
    process.argv = ['node', 'script.ts', '-n', '50'];
    expect(parseArgs().n).toBe(50);
  });

  it('--min-score 1.5 파싱', () => {
    process.argv = ['node', 'script.ts', '--min-score', '1.5'];
    expect(parseArgs().minScore).toBe(1.5);
  });

  it('모든 옵션 동시 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us', '-n', '100', '--min-score', '2'];
    const args = parseArgs();
    expect(args.market).toBe('us');
    expect(args.n).toBe(100);
    expect(args.minScore).toBe(2);
  });
});

// ── loadTickers ───────────────────────────────────────────────────────────────

describe('loadTickers', () => {
  const config = {
    tickersJson: '/db/all_kr.json',
    tickersDir:  '/db/kr_tickers',
    signalsDir:  '/db/kr_signals',
  };

  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReset();
  });

  const tickerList = { tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'] };

  it('전체 티커 반환 (n 없음)', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    const result = loadTickers(config);
    expect(result).toHaveLength(5);
    expect(result).toEqual(tickerList.tickers);
  });

  it('n 지정 시 상위 n개만 반환', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    const result = loadTickers(config, 3);
    expect(result).toHaveLength(3);
    expect(result).toEqual(['AAPL', 'MSFT', 'GOOGL']);
  });

  it('n > 전체 수 → 전체 반환', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    const result = loadTickers(config, 100);
    expect(result).toHaveLength(5);
  });
});

// ── loadTicker ────────────────────────────────────────────────────────────────

describe('loadTicker', () => {
  const config = {
    tickersJson: '/db/all_kr.json',
    tickersDir:  '/db/kr_tickers',
    signalsDir:  '/db/kr_signals',
  };

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('파일 존재 → RawTicker 반환', () => {
    const raw = makeRawTicker();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));

    const result = loadTicker('AAPL', config);
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
  });

  it('파일 없으면 null 반환', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = loadTicker('UNKNOWN', config);
    expect(result).toBeNull();
  });

  it('.KS 접미사 있어도 파일명 변환 후 탐색', () => {
    const raw = makeRawTicker({ ticker: '005930' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));

    const result = loadTicker('005930.KS', config);
    expect(result).not.toBeNull();
  });
});
