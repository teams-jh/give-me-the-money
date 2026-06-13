/**
 * analyze_trends.test.ts
 *
 * 커버 대상 함수:
 *   filterByPeriod   — 기간 필터
 *   toWeekKey        — 날짜 → 주 키
 *   toWeekly         — 일봉 → 주봉 다운샘플
 *   toMonthly        — 일봉 → 월봉 다운샘플
 *   downsample       — 다운샘플 디스패치
 *   toPriceSeries    — DailyPrice → PriceSeries 변환
 *   resolveOutputFile — 출력 파일명 결정
 *   tickerToFilename  — 티커 → 파일명
 *   parseArgs         — CLI 파싱
 *   loadTickers       — 티커 목록 로드
 *   loadPrices        — 가격 데이터 로드
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ── vi.hoisted: 동적 import 후에도 동일 참조 유지 ──────────────────────────
const mockReaddirSync   = vi.hoisted(() => vi.fn());
const mockReadFileSync  = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockMkdirSync     = vi.hoisted(() => vi.fn());
const mockExistsSync    = vi.hoisted(() => vi.fn());
const mockRenameSync    = vi.hoisted(() => vi.fn());
const mockUnlinkSync    = vi.hoisted(() => vi.fn());

const mockClassifyTrend = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  default: {
    readdirSync:   mockReaddirSync,
    readFileSync:  mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync:     mockMkdirSync,
    existsSync:    mockExistsSync,
    renameSync:    mockRenameSync,
    unlinkSync:    mockUnlinkSync,
  },
}));

// ── classifyTrend 라이브러리 mock ─────────────────────────────────────────────
vi.mock('../../../src/library/shared/classifyTrend.ts', () => ({
  classifyTrend: mockClassifyTrend,
}));

import fs from 'fs';
import {
  filterByPeriod,
  toWeekKey,
  toWeekly,
  toMonthly,
  downsample,
  toPriceSeries,
  resolveOutputFile,
  parseArgs,
  loadTickers,
  loadPrices,
  now,
} from '../../../scripts/analyze_trends.ts';
import {
  runTrendAnalysis,
  printTrendReport,
} from '../../../scripts/analyze_trends.ts';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── DailyPrice 헬퍼 ───────────────────────────────────────────────────────────

function makePrices(dates: string[], start = 100): { date: string; close: number }[] {
  return dates.map((date, i) => ({ date, close: start + i }));
}

// ── filterByPeriod ────────────────────────────────────────────────────────────

describe('filterByPeriod', () => {
  // 2024-01-01부터 2024-12-31까지 365일치 데이터
  const allDates: string[] = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date('2024-01-01');
    d.setDate(d.getDate() + i);
    allDates.push(d.toISOString().slice(0, 10));
  }
  const prices = makePrices(allDates);

  it('3m → 마지막 날로부터 90일 이내', () => {
    const result = filterByPeriod(prices, '3m');
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(92); // 90일 + 여유
    // 마지막 날짜는 원본과 동일
    expect(result[result.length - 1]!.date).toBe(allDates[allDates.length - 1]);
  });

  it('1y → 마지막 날로부터 365일 이내 (= 전체)', () => {
    const result = filterByPeriod(prices, '1y');
    // 365일 데이터에 365일 cutoff이므로 전부 또는 거의 전부
    expect(result.length).toBeGreaterThan(300);
  });

  it('2y → 마지막 날로부터 730일 (짧은 데이터는 전체)', () => {
    const result = filterByPeriod(prices, '2y');
    expect(result.length).toBe(prices.length);
  });

  it('3y → 마지막 날로부터 1095일 (짧은 데이터는 전체)', () => {
    const result = filterByPeriod(prices, '3y');
    expect(result.length).toBe(prices.length);
  });

  it('빈 배열 → 빈 배열', () => {
    expect(filterByPeriod([], '3m')).toHaveLength(0);
  });

  it('결과는 시간순 유지', () => {
    const result = filterByPeriod(prices, '3m');
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.date >= result[i - 1]!.date).toBe(true);
    }
  });
});

// ── toWeekKey ─────────────────────────────────────────────────────────────────

describe('toWeekKey', () => {
  it('월요일 → 자기 자신 날짜 키', () => {
    // 2024-01-01 은 월요일
    expect(toWeekKey('2024-01-01')).toBe('2024-01-01');
  });

  it('금요일 → 해당 주 월요일', () => {
    // 2024-01-05 는 금요일 → 주 시작 2024-01-01 (월요일)
    expect(toWeekKey('2024-01-05')).toBe('2024-01-01');
  });

  it('수요일 → 해당 주 월요일', () => {
    // 2024-01-03 은 수요일 → 2024-01-01 (월요일)
    expect(toWeekKey('2024-01-03')).toBe('2024-01-01');
  });

  it('화요일 → 해당 주 월요일', () => {
    // 2024-01-02 는 화요일 → 2024-01-01 (월요일)
    expect(toWeekKey('2024-01-02')).toBe('2024-01-01');
  });

  it('일요일 → 해당 주 월요일', () => {
    // 2024-01-07 은 일요일 → 같은 주 월요일 2024-01-01
    expect(toWeekKey('2024-01-07')).toBe('2024-01-01');
  });

  it('서로 다른 주는 다른 키 반환', () => {
    const week1 = toWeekKey('2024-01-01'); // 1월 1주
    const week2 = toWeekKey('2024-01-08'); // 1월 2주
    expect(week1).not.toBe(week2);
  });

  it('반환 형식이 YYYY-MM-DD', () => {
    expect(toWeekKey('2024-06-15')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── toWeekly ──────────────────────────────────────────────────────────────────

describe('toWeekly', () => {
  it('같은 주 데이터 → 마지막 거래일만 유지', () => {
    // 2024-01-01(월)~2024-01-05(금) = 1주
    const prices = makePrices(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']);
    const result = toWeekly(prices);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2024-01-05'); // 금요일 = 마지막
  });

  it('서로 다른 주 → 각 주마다 1개', () => {
    const prices = makePrices([
      '2024-01-01', // 1주차 월요일
      '2024-01-05', // 1주차 금요일
      '2024-01-08', // 2주차 월요일
      '2024-01-12', // 2주차 금요일
    ]);
    const result = toWeekly(prices);
    expect(result).toHaveLength(2);
  });

  it('빈 배열 → 빈 배열', () => {
    expect(toWeekly([])).toHaveLength(0);
  });

  it('단일 원소 → 그대로 반환', () => {
    const prices = makePrices(['2024-01-01']);
    expect(toWeekly(prices)).toHaveLength(1);
  });
});

// ── toMonthly ─────────────────────────────────────────────────────────────────

describe('toMonthly', () => {
  it('같은 달 데이터 → 마지막 거래일만 유지', () => {
    const prices = makePrices(['2024-01-10', '2024-01-15', '2024-01-31']);
    const result = toMonthly(prices);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2024-01-31');
  });

  it('서로 다른 달 → 각 달마다 1개', () => {
    const prices = makePrices([
      '2024-01-31',
      '2024-02-28',
      '2024-03-29',
    ]);
    const result = toMonthly(prices);
    expect(result).toHaveLength(3);
  });

  it('빈 배열 → 빈 배열', () => {
    expect(toMonthly([])).toHaveLength(0);
  });

  it('단일 원소 → 그대로', () => {
    expect(toMonthly(makePrices(['2024-06-30']))).toHaveLength(1);
  });

  it('키는 YYYY-MM 형식으로 같은 달 구분', () => {
    const prices = makePrices(['2024-01-01', '2024-01-02', '2024-02-01']);
    const result = toMonthly(prices);
    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe('2024-01-02');
    expect(result[1]!.date).toBe('2024-02-01');
  });
});

// ── downsample ────────────────────────────────────────────────────────────────

describe('downsample', () => {
  const prices = makePrices([
    '2024-01-01', '2024-01-03', '2024-01-05',
    '2024-01-08', '2024-01-10',
  ]);

  it('"weekly" → toWeekly 호출 결과와 동일', () => {
    const weeklyResult = toWeekly(prices);
    const dsResult     = downsample(prices, 'weekly');
    expect(dsResult).toEqual(weeklyResult);
  });

  it('"monthly" → toMonthly 호출 결과와 동일', () => {
    const monthlyResult = toMonthly(prices);
    const dsResult      = downsample(prices, 'monthly');
    expect(dsResult).toEqual(monthlyResult);
  });
});

// ── toPriceSeries ─────────────────────────────────────────────────────────────

describe('toPriceSeries', () => {
  it('labels는 날짜 배열', () => {
    const prices = makePrices(['2024-01-01', '2024-01-02', '2024-01-03']);
    const result = toPriceSeries(prices);
    expect(result.labels).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
  });

  it('values는 종가 배열', () => {
    const prices = makePrices(['2024-01-01', '2024-01-02', '2024-01-03']);
    const result = toPriceSeries(prices);
    expect(result.values).toEqual([100, 101, 102]);
  });

  it('길이 일치', () => {
    const prices = makePrices(['2024-01-01', '2024-01-02']);
    const result = toPriceSeries(prices);
    expect(result.labels.length).toBe(result.values.length);
    expect(result.labels.length).toBe(2);
  });

  it('빈 배열 처리', () => {
    const result = toPriceSeries([]);
    expect(result.labels).toHaveLength(0);
    expect(result.values).toHaveLength(0);
  });
});

// ── resolveOutputFile ─────────────────────────────────────────────────────────

describe('resolveOutputFile', () => {
  it('n=undefined, period=undefined → trend_all_all.json', () => {
    expect(resolveOutputFile('us', undefined, undefined)).toContain('trend_all_all.json');
  });

  it('n=100, period=undefined → trend_100_all.json', () => {
    expect(resolveOutputFile('us', 100, undefined)).toContain('trend_100_all.json');
  });

  it('n=undefined, period="1y" → trend_all_1y.json', () => {
    expect(resolveOutputFile('us', undefined, '1y')).toContain('trend_all_1y.json');
  });

  it('n=50, period="3m" → trend_50_3m.json', () => {
    expect(resolveOutputFile('us', 50, '3m')).toContain('trend_50_3m.json');
  });

  it('마켓별 trend 경로 포함', () => {
    expect(resolveOutputFile('us', undefined, undefined)).toContain('us/trend');
    expect(resolveOutputFile('kr', undefined, undefined)).toContain('kr/trend');
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('기본값: market=us, n=undefined, period=undefined', () => {
    process.argv = ['node', 'script.ts'];
    const args = parseArgs();
    expect(args.market).toBe('us');
    expect(args.n).toBeUndefined();
    expect(args.period).toBeUndefined();
  });

  it('--market kr 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'kr'];
    expect(parseArgs().market).toBe('kr');
  });

  it('-n 50 파싱', () => {
    process.argv = ['node', 'script.ts', '-n', '50'];
    expect(parseArgs().n).toBe(50);
  });

  it('-n 0 (양의 정수 아님) → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '-n', '0'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('-n 문자열 → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '-n', 'abc'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    exitSpy.mockRestore();
  });

  it('--period 3m 파싱', () => {
    process.argv = ['node', 'script.ts', '--period', '3m'];
    expect(parseArgs().period).toBe('3m');
  });

  it('--period 1y 파싱', () => {
    process.argv = ['node', 'script.ts', '--period', '1y'];
    expect(parseArgs().period).toBe('1y');
  });

  it('--period 2y 파싱', () => {
    process.argv = ['node', 'script.ts', '--period', '2y'];
    expect(parseArgs().period).toBe('2y');
  });

  it('--period 3y 파싱', () => {
    process.argv = ['node', 'script.ts', '--period', '3y'];
    expect(parseArgs().period).toBe('3y');
  });

  it('잘못된 period → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--period', '5y'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('모든 옵션 조합', () => {
    process.argv = ['node', 'script.ts', '--market', 'kr', '-n', '200', '--period', '2y'];
    const args = parseArgs();
    expect(args.market).toBe('kr');
    expect(args.n).toBe(200);
    expect(args.period).toBe('2y');
  });
});

// ── now ───────────────────────────────────────────────────────────────────────

describe('now', () => {
  it('YYYY-MM-DD HH:MM 형식', () => {
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

// ── loadTickers ───────────────────────────────────────────────────────────────

describe('loadTickers', () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReset();
  });

  const tickerList = { tickers: ['AAPL', 'MSFT', 'GOOGL'] };

  it('n=undefined → 전체 반환', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    expect(loadTickers('us', undefined)).toHaveLength(3);
  });

  it('n=2 → 상위 2개만', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    const result = loadTickers('us', 2);
    expect(result).toEqual(['AAPL', 'MSFT']);
  });
});

// ── loadPrices ────────────────────────────────────────────────────────────────

describe('loadPrices', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  const rawData = {
    prices: [
      { date: '2024-01-01', open: 100, high: 105, low: 95, close: 102, adj_close: 102, volume: 1000 },
      { date: '2024-01-02', open: 102, high: 107, low: 98, close: 104, adj_close: 104, volume: 1100 },
    ],
  };

  it('파일 존재 → DailyPrice[] 반환', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(rawData));

    const result = loadPrices('us', 'AAPL');
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ date: '2024-01-01', close: 102 });
  });

  it('파일 없으면 null 반환', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadPrices('us', 'UNKNOWN')).toBeNull();
  });

  it('.KS 티커도 올바른 파일명으로 탐색', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(rawData));

    const result = loadPrices('kr', '005930.KS');
    expect(result).not.toBeNull();
    // existsSync 가 005930.json 경로로 호출됐는지 확인
    expect(vi.mocked(fs.existsSync).mock.calls[0]![0]).toContain('005930.json');
  });

  it('close 필드만 추출', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(rawData));

    const result = loadPrices('us', 'AAPL');
    expect(Object.keys(result![0]!).sort()).toEqual(['close', 'date']);
  });
});

// ── main() TC ────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
const __testDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH_TRENDS = resolvePath(__testDir, '../../../scripts/analyze_trends.ts');

const TICKERS_JSON_TREND = JSON.stringify({ tickers: ['AAPL'] });

/** 일봉 데이터 픽스처 (date + close + ohlcv) */
function makePricesTrend(n = 30): object[] {
  return Array.from({ length: n }, (_, i) => ({
    date:      `2024-01-${String(i + 1).padStart(2, '0')}`,
    open:      100 + i, high: 105 + i, low: 95 + i,
    close:     100 + i, adj_close: 100 + i, volume: 1_000_000,
  }));
}

const TICKER_JSON_TREND = JSON.stringify({
  ticker: 'AAPL',
  info:   { sector: 'Technology', name: 'Apple' },
  prices: makePricesTrend(30),
});

const TREND_RESULT = {
  trend:         'bullish' as const,
  slopePct:       1.5,
  r2:             0.85,
  slopeEarlyPct: 1.2,
  slopeLatePct:  1.8,
  totalReturn:   15.0,
};

describe('main() TC', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
    vi.clearAllMocks();
  });

  it('TC_T1 - 정상 실행: bullish 1개 → writeFileSync 호출', async () => {
    process.argv = ['node', SCRIPT_PATH_TRENDS, '--market', 'us'];
    mockReadFileSync
      .mockReturnValueOnce(TICKERS_JSON_TREND)  // loadTickers
      .mockReturnValueOnce(TICKER_JSON_TREND);  // loadPrices
    mockExistsSync.mockReturnValue(true);
    mockClassifyTrend.mockReturnValue(TREND_RESULT);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('../../../scripts/analyze_trends.ts');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as {
      summary: { bullish: number };
    };
    expect(written.summary.bullish).toBe(1);
  });

  it('TC_T2 - classifyTrend → null: 데이터 부족 SKIP', async () => {
    process.argv = ['node', SCRIPT_PATH_TRENDS, '--market', 'kr'];
    mockReadFileSync
      .mockReturnValueOnce(TICKERS_JSON_TREND)
      .mockReturnValueOnce(TICKER_JSON_TREND);
    mockExistsSync.mockReturnValue(true);
    mockClassifyTrend.mockReturnValue(null); // 데이터 부족
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('../../../scripts/analyze_trends.ts');

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as {
      skipped_count: number;
    };
    expect(written.skipped_count).toBe(1);
  });

  it('TC_T3 - loadPrices → null: 파일 없음 SKIP', async () => {
    process.argv = ['node', SCRIPT_PATH_TRENDS, '--market', 'us'];
    mockReadFileSync.mockReturnValueOnce(TICKERS_JSON_TREND);
    mockExistsSync.mockReturnValue(false); // 이전 테스트 mock 잔류 방지 + 파일 없음 처리
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('../../../scripts/analyze_trends.ts');

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as {
      skipped_count: number;
    };
    expect(written.skipped_count).toBe(1);
  });

  it('TC_T4 - --period 1y --n 1: 기간 커팅 + 다운샘플 경로 → writeFileSync 호출', async () => {
    process.argv = ['node', SCRIPT_PATH_TRENDS, '--market', 'us', '--period', '1y', '--n', '1'];
    mockReadFileSync
      .mockReturnValueOnce(TICKERS_JSON_TREND)
      .mockReturnValueOnce(TICKER_JSON_TREND);
    mockExistsSync.mockReturnValue(true);
    mockClassifyTrend.mockReturnValue(TREND_RESULT);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('../../../scripts/analyze_trends.ts');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('TC_T5 - 알 수 없는 마켓 → process.exit(1)', async () => {
    process.argv = ['node', SCRIPT_PATH_TRENDS, '--market', 'UNKNOWN'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    vi.resetModules();
    await expect(import('../../../scripts/analyze_trends.ts')).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

// ── runTrendAnalysis() TC ─────────────────────────────────────────────────────

describe('runTrendAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
  });

  it('TC_RTA1 - 정상 종목: stocks에 포함, skipped 비어 있음', () => {
    mockReadFileSync.mockReturnValue(TICKER_JSON_TREND);
    mockClassifyTrend.mockReturnValue(TREND_RESULT);

    const result = runTrendAnalysis('us', ['AAPL'], undefined);

    expect(result.stocks).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.stocks[0]!.ticker).toBe('AAPL');
    expect(result.stocks[0]!.trend).toBe('bullish');
  });

  it('TC_RTA2 - loadPrices null → skipped에 추가', () => {
    mockExistsSync.mockReturnValue(false);

    const result = runTrendAnalysis('us', ['AAPL'], undefined);

    expect(result.stocks).toHaveLength(0);
    expect(result.skipped).toContain('AAPL');
  });

  it('TC_RTA3 - classifyTrend null → skipped에 추가', () => {
    mockReadFileSync.mockReturnValue(TICKER_JSON_TREND);
    mockClassifyTrend.mockReturnValue(null);

    const result = runTrendAnalysis('us', ['AAPL'], undefined);

    expect(result.stocks).toHaveLength(0);
    expect(result.skipped).toContain('AAPL');
  });

  it('TC_RTA4 - summary 집계 정확성', () => {
    mockReadFileSync
      .mockReturnValueOnce(TICKER_JSON_TREND)
      .mockReturnValueOnce(TICKER_JSON_TREND);
    mockClassifyTrend
      .mockReturnValueOnce({ ...TREND_RESULT, trend: 'bullish' as const })
      .mockReturnValueOnce({ ...TREND_RESULT, trend: 'bearish' as const });

    const result = runTrendAnalysis('us', ['AAPL', 'MSFT'], undefined);

    expect(result.summary.bullish).toBe(1);
    expect(result.summary.bearish).toBe(1);
  });

  it('TC_RTA5 - period 지정 시 periodLabel, interval, minPts 반영', () => {
    mockReadFileSync.mockReturnValue(TICKER_JSON_TREND);
    mockClassifyTrend.mockReturnValue(TREND_RESULT);

    const result = runTrendAnalysis('us', ['AAPL'], '1y');

    expect(result.periodLabel).toBe('1y');
    expect(result.interval).toBe('monthly');
    expect(result.minPts).toBe(10);
  });

  it('TC_RTA6 - period 미지정 시 periodLabel = 전기간, 기본값 사용', () => {
    mockReadFileSync.mockReturnValue(TICKER_JSON_TREND);
    mockClassifyTrend.mockReturnValue(TREND_RESULT);

    const result = runTrendAnalysis('us', ['AAPL'], undefined);

    expect(result.periodLabel).toBe('전기간');
    expect(result.interval).toBe('weekly');
    expect(result.minPts).toBe(8);
  });
});

// ── printTrendReport() TC ─────────────────────────────────────────────────────

describe('printTrendReport', () => {
  it('TC_PTR1 - console.log 호출: 결과 0개여도 헤더/푸터 출력', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const emptyResult = {
      stocks: [], skipped: [], periodLabel: '전기간',
      summary: { bullish: 0, bearish: 0, sideways: 0, recovering: 0 },
      interval: 'weekly' as const, minPts: 8,
    };

    printTrendReport(emptyResult, { market: 'kr' });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('TC_PTR2 - result 객체를 mutate하지 않음', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = {
      stocks: [{ ticker: 'AAPL', trend: 'bullish' as const, slopePct: 5, r2: 0.9, slopeEarlyPct: 3, slopeLatePct: 7, totalReturn: 10 }],
      skipped: [],
      periodLabel: '1y',
      summary: { bullish: 1, bearish: 0, sideways: 0, recovering: 0 },
      interval: 'monthly' as const, minPts: 10,
    };
    const before = JSON.stringify(result);

    printTrendReport(result, { market: 'us', n: 100 });

    expect(JSON.stringify(result)).toBe(before);
    consoleSpy.mockRestore();
  });
});

