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
  filterByPeriod,
  toWeekKey,
  toWeekly,
  toMonthly,
  downsample,
  toPriceSeries,
  resolveOutputFile,
  tickerToFilename,
  parseArgs,
  loadTickers,
  loadPrices,
  now,
} from './analyze_trends.ts';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── DailyPrice 헬퍼 ───────────────────────────────────────────────────────────

function makePrices(dates: string[], start = 100): { date: string; close: number }[] {
  return dates.map((date, i) => ({ date, close: start + i }));
}

// ── tickerToFilename ──────────────────────────────────────────────────────────

describe('tickerToFilename', () => {
  it('접미사 없는 티커 → 그대로', () => {
    expect(tickerToFilename('AAPL')).toBe('AAPL');
  });

  it('.KS 접미사 제거', () => {
    expect(tickerToFilename('005930.KS')).toBe('005930');
  });

  it('.KQ 접미사 제거', () => {
    expect(tickerToFilename('035720.KQ')).toBe('035720');
  });

  it('점 없는 숫자 티커', () => {
    expect(tickerToFilename('000660')).toBe('000660');
  });
});

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
  const config = {
    tickersJson: '/db/all_us.json',
    tickersDir:  '/db/us_tickers',
    trendDir:    '/db/us_trend',
  };

  it('n=undefined, period=undefined → trend_all_all.json', () => {
    const result = resolveOutputFile(config, undefined, undefined);
    expect(result).toContain('trend_all_all.json');
  });

  it('n=100, period=undefined → trend_100_all.json', () => {
    const result = resolveOutputFile(config, 100, undefined);
    expect(result).toContain('trend_100_all.json');
  });

  it('n=undefined, period="1y" → trend_all_1y.json', () => {
    const result = resolveOutputFile(config, undefined, '1y');
    expect(result).toContain('trend_all_1y.json');
  });

  it('n=50, period="3m" → trend_50_3m.json', () => {
    const result = resolveOutputFile(config, 50, '3m');
    expect(result).toContain('trend_50_3m.json');
  });

  it('trendDir 경로 포함', () => {
    const result = resolveOutputFile(config, undefined, undefined);
    expect(result).toContain('/db/us_trend');
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
  const config = {
    tickersJson: '/db/all_us.json',
    tickersDir:  '/db/us_tickers',
    trendDir:    '/db/us_trend',
  };

  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReset();
  });

  const tickerList = { tickers: ['AAPL', 'MSFT', 'GOOGL'] };

  it('n=undefined → 전체 반환', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    expect(loadTickers(config, undefined)).toHaveLength(3);
  });

  it('n=2 → 상위 2개만', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tickerList));
    const result = loadTickers(config, 2);
    expect(result).toEqual(['AAPL', 'MSFT']);
  });
});

// ── loadPrices ────────────────────────────────────────────────────────────────

describe('loadPrices', () => {
  const config = {
    tickersJson: '/db/all_us.json',
    tickersDir:  '/db/us_tickers',
    trendDir:    '/db/us_trend',
  };

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

    const result = loadPrices('AAPL', config);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ date: '2024-01-01', close: 102 });
  });

  it('파일 없으면 null 반환', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadPrices('UNKNOWN', config)).toBeNull();
  });

  it('.KS 티커도 올바른 파일명으로 탐색', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(rawData));

    const result = loadPrices('005930.KS', config);
    expect(result).not.toBeNull();
    // existsSync 가 005930.json 경로로 호출됐는지 확인
    expect(vi.mocked(fs.existsSync).mock.calls[0]![0]).toContain('005930.json');
  });

  it('close 필드만 추출', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(rawData));

    const result = loadPrices('AAPL', config);
    expect(Object.keys(result![0]!).sort()).toEqual(['close', 'date']);
  });
});
