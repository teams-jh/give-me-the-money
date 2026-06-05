/**
 * simulate_trend.test.ts
 *
 * 커버 대상 함수:
 *   tickerToFilename — 티커 → 파일명
 *   parseArgs        — CLI 파싱
 *   loadConfig       — config 파일 로드
 *   resolveDates     — 빈 날짜 자동 채우기
 *   datetimeTag      — 날짜시간 태그 생성
 *   now              — 현재 시간 문자열
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── fs mock ───────────────────────────────────────────────────────────────────
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockExistsSync   = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  default: {
    readFileSync:  mockReadFileSync,
    existsSync:    mockExistsSync,
    writeFileSync: vi.fn(),
    mkdirSync:     vi.fn(),
  },
}));

// trendSim mock (runTickerSim 등 외부 의존성 차단)
vi.mock('../src/library/shared/trendSim.ts', () => ({
  PERIOD_BARS:         { daily: { '3m': 63, '1y': 252, '2y': 504, '3y': 756 }, weekly: { '3m': 13, '1y': 52, '2y': 104, '3y': 156 } },
  runTickerSim:        vi.fn(() => null),
  applyPatternFilter:  vi.fn((r: unknown[]) => r),
  convertToWeeklyBars: vi.fn((p: unknown[]) => p),
}));

vi.mock('../src/library/shared/signals.ts', () => ({
  intersectSimResults: vi.fn(() => []),
}));

import {
  tickerToFilename,
  parseArgs,
  loadConfig,
  resolveDates,
  datetimeTag,
  now,
} from './simulate_trend.ts';
import type { } from './simulate_trend.ts';

// ── tickerToFilename ──────────────────────────────────────────────────────────

describe('tickerToFilename', () => {
  it('접미사 없는 티커 → 그대로', () => {
    expect(tickerToFilename('AAPL')).toBe('AAPL');
  });
  it('KS 접미사 제거', () => {
    expect(tickerToFilename('005930.KS')).toBe('005930');
  });
  it('여러 점 → 첫 번째 앞만', () => {
    expect(tickerToFilename('A.B.C')).toBe('A');
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('--market us → market=us', () => {
    process.argv = ['node', 'script.ts', '--market', 'us'];
    expect(parseArgs()).toEqual({ market: 'us' });
  });
  it('--market kr → market=kr', () => {
    process.argv = ['node', 'script.ts', '--market', 'kr'];
    expect(parseArgs()).toEqual({ market: 'kr' });
  });
  it('옵션 없으면 market=null', () => {
    process.argv = ['node', 'script.ts'];
    expect(parseArgs()).toEqual({ market: null });
  });
});

// ── loadConfig ────────────────────────────────────────────────────────────────

const SAMPLE_CONFIG = [
  {
    market: 'us', n: null, periods: ['1y'],
    periodConfigs: {
      '1y': {
        barUnit: 'daily', trendBase: 'highlow', trendAlgo: 'swing',
        zigzagThreshold: 5, regressionStdDev: 2.0,
        trendStartDate: '', trendEndDate: '',
        trendTouchBasis: 'both', trendTouchTolerance: 2, trendBreakoutTolerance: 2,
        filterStartDate: '', filterEndDate: '',
        slopeFilter: 'all', slopeMin: '', slopeMax: '',
      },
    },
    patternFilter: { enabled: false, minTouches: 3 },
  },
  {
    market: 'kr', n: null, periods: ['1y'],
    periodConfigs: { '1y': {} },
    patternFilter: { enabled: false, minTouches: 3 },
  },
];

describe('loadConfig', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
  });

  it('market=null → 전체 반환', () => {
    const result = loadConfig(null);
    expect(result).toHaveLength(2);
  });
  it('market=us → us만 반환', () => {
    const result = loadConfig('us');
    expect(result).toHaveLength(1);
    expect(result[0]!.market).toBe('us');
  });
  it('market=kr → kr만 반환', () => {
    const result = loadConfig('kr');
    expect(result[0]!.market).toBe('kr');
  });
  it('config 파일 없으면 process.exit(1)', () => {
    mockExistsSync.mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => loadConfig(null)).toThrow('exit');
    exitSpy.mockRestore();
  });
});

// ── resolveDates ──────────────────────────────────────────────────────────────

describe('resolveDates', () => {
  const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];

  const baseCfg = {
    barUnit: 'daily' as const, trendBase: 'highlow' as const, trendAlgo: 'swing' as const,
    zigzagThreshold: 5, regressionStdDev: 2.0,
    trendStartDate: '', trendEndDate: '',
    trendTouchBasis: 'both' as const, trendTouchTolerance: 2, trendBreakoutTolerance: 2,
    filterStartDate: '', filterEndDate: '',
    slopeFilter: 'all' as const, slopeMin: '', slopeMax: '',
  };

  it('빈 날짜 → 자동 채움', () => {
    const r = resolveDates(baseCfg, dates);
    expect(r.trendStartDate).toBe('2024-01-01');
    expect(r.trendEndDate).toBe('2024-01-05');
    expect(r.filterEndDate).toBe('2024-01-05');
    expect(r.filterStartDate).toBe('2024-01-02'); // dates[max(0, 5-1-3)] = dates[1]
  });

  it('날짜 직접 지정 → 그대로 유지', () => {
    const cfg = { ...baseCfg, trendStartDate: '2024-01-02', trendEndDate: '2024-01-04' };
    const r = resolveDates(cfg, dates);
    expect(r.trendStartDate).toBe('2024-01-02');
    expect(r.trendEndDate).toBe('2024-01-04');
  });

  it('빈 dates → cfg 그대로 반환', () => {
    const r = resolveDates(baseCfg, []);
    expect(r).toEqual(baseCfg);
  });
});

// ── datetimeTag / now ────────────────────────────────────────────────────────

describe('datetimeTag', () => {
  it('형식: YYYYMMDD_HHmmss', () => {
    expect(datetimeTag()).toMatch(/^\d{8}_\d{6}$/);
  });
});

describe('now', () => {
  it('ISO 형식 공백 포함 문자열', () => {
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
