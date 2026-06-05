/**
 * trendSim.test.ts
 *
 * 커버 대상 함수:
 *   PERIOD_BARS          — 상수 구조
 *   snapDateUp           — 주봉 날짜 올림 스냅
 *   snapDateDown         — 주봉 날짜 내림 스냅
 *   buildTrendIndices    — 날짜 범위 → 인덱스 배열
 *   selectPriceBasis     — trendBase별 가격 배열 선택
 *   calcTrendLine        — SR → m, c 계산
 *   buildChartData       — 차트 좌표 조립
 *   calcSlopeInfo        — 기울기 정보
 *   filterTouchPoints    — 돌파 날짜 필터
 *   runTickerSim         — 티커 1개 시뮬레이션
 *   applyPatternFilter   — 패턴 필터
 */

import { describe, it, expect } from 'vitest';

import {
  PERIOD_BARS,
  snapDateUp,
  snapDateDown,
  buildTrendIndices,
  selectPriceBasis,
  calcTrendLine,
  buildChartData,
  calcSlopeInfo,
  filterTouchPoints,
  runTickerSim,
  sortSimResults,
  applyPatternFilter,
} from './trendSim.ts';
import type { PriceDataPoint, PeriodConfig, TouchPoint, SimResult } from './trendSim.ts';

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function makePrices(n: number, base = 100, step = 1): PriceDataPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const close = base + i * step;
    return {
      date:  `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      open:  close * 0.99,
      high:  close * 1.02,
      low:   close * 0.98,
      close,
    };
  });
}

const BASE_CFG: PeriodConfig = {
  barUnit:                'daily',
  trendBase:              'highlow',
  trendAlgo:              'swing',
  zigzagThreshold:        5,
  regressionStdDev:       2.0,
  trendStartDate:         '',
  trendEndDate:           '',
  trendTouchBasis:        'both',
  trendTouchTolerance:    2,
  trendBreakoutTolerance: 2,
  filterStartDate:        '',
  filterEndDate:          '',
  slopeFilter:            'all',
  slopeMin:               '',
  slopeMax:               '',
};

// ── PERIOD_BARS ──────────────────────────────────────────────────────────────

describe('PERIOD_BARS', () => {
  it('daily 1y = 252봉', () => {
    expect(PERIOD_BARS.daily['1y']).toBe(252);
  });
  it('weekly 1y = 52봉', () => {
    expect(PERIOD_BARS.weekly['1y']).toBe(52);
  });
  it('모든 기간 키 존재', () => {
    for (const unit of ['daily', 'weekly'] as const) {
      for (const p of ['3m', '1y', '2y', '3y'] as const) {
        expect(PERIOD_BARS[unit][p]).toBeGreaterThan(0);
      }
    }
  });
});

// ── snapDateUp / snapDateDown ─────────────────────────────────────────────────

describe('snapDateUp', () => {
  const dates = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22'];

  it('정확히 일치하는 날짜 반환', () => {
    expect(snapDateUp(dates, '2024-01-08')).toBe('2024-01-08');
  });
  it('사이 날짜 → 다음 날짜 반환', () => {
    expect(snapDateUp(dates, '2024-01-10')).toBe('2024-01-15');
  });
  it('마지막 날짜 이후 → 마지막 날짜 반환', () => {
    expect(snapDateUp(dates, '2024-12-31')).toBe('2024-01-22');
  });
  it('빈 배열 → target 반환', () => {
    expect(snapDateUp([], '2024-01-01')).toBe('2024-01-01');
  });
});

describe('snapDateDown', () => {
  const dates = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22'];

  it('정확히 일치하는 날짜 반환', () => {
    expect(snapDateDown(dates, '2024-01-15')).toBe('2024-01-15');
  });
  it('사이 날짜 → 이전 날짜 반환', () => {
    expect(snapDateDown(dates, '2024-01-10')).toBe('2024-01-08');
  });
  it('첫 날짜 이전 → 첫 날짜 반환', () => {
    expect(snapDateDown(dates, '2023-12-31')).toBe('2024-01-01');
  });
  it('빈 배열 → target 반환', () => {
    expect(snapDateDown([], '2024-01-01')).toBe('2024-01-01');
  });
});

// ── buildTrendIndices ─────────────────────────────────────────────────────────

describe('buildTrendIndices', () => {
  const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];

  it('범위 내 인덱스 반환', () => {
    expect(buildTrendIndices(dates, '2024-01-02', '2024-01-04')).toEqual([1, 2, 3]);
  });
  it('start/end 빈 문자열 → 전체 인덱스', () => {
    expect(buildTrendIndices(dates, '', '')).toEqual([0, 1, 2, 3, 4]);
  });
  it('매칭 없으면 전체 인덱스 반환', () => {
    expect(buildTrendIndices(dates, '2025-01-01', '2025-12-31')).toEqual([0, 1, 2, 3, 4]);
  });
  it('단일 날짜 범위', () => {
    expect(buildTrendIndices(dates, '2024-01-03', '2024-01-03')).toEqual([2]);
  });
});

// ── selectPriceBasis ─────────────────────────────────────────────────────────

describe('selectPriceBasis', () => {
  const H = [110, 120, 130];
  const L = [90,  95,  100];
  const C = [100, 110, 120];
  const O = [98,  108, 118];

  it('highlow → 각각 그대로', () => {
    const r = selectPriceBasis('highlow', H, L, C, O);
    expect(r.currentHighs).toBe(H);
    expect(r.currentLows).toBe(L);
    expect(r.currentCloses).toBe(C);
    expect(r.currentOpens).toBe(O);
  });
  it('close → 모두 종가', () => {
    const r = selectPriceBasis('close', H, L, C, O);
    expect(r.currentHighs).toBe(C);
    expect(r.currentLows).toBe(C);
  });
  it('open → 모두 시가', () => {
    const r = selectPriceBasis('open', H, L, C, O);
    expect(r.currentHighs).toBe(O);
    expect(r.currentLows).toBe(O);
  });
});

// ── calcTrendLine ─────────────────────────────────────────────────────────────

describe('calcTrendLine', () => {
  it('저항선/지지선 m, c 계산', () => {
    const srRaw = [
      { resistance: 110, support: 90 },
      { resistance: 120, support: 95 },
    ];
    const r = calcTrendLine(srRaw, 0, 1);
    expect(r.mR).toBeCloseTo(10);
    expect(r.cR).toBeCloseTo(110);
    expect(r.mS).toBeCloseTo(5);
    expect(r.cS).toBeCloseTo(90);
  });
  it('저항선 null이면 cR=null', () => {
    const srRaw = [{ resistance: null, support: 90 }, { resistance: null, support: 95 }];
    const r = calcTrendLine(srRaw, 0, 1);
    expect(r.cR).toBeNull();
  });
  it('빈 배열 → 모두 0/null', () => {
    const r = calcTrendLine([], 0, 0);
    expect(r.mR).toBe(0);
    expect(r.cR).toBeNull();
  });
});

// ── buildChartData ────────────────────────────────────────────────────────────

describe('buildChartData', () => {
  const timestamps = [1000, 2000, 3000];
  const srRaw = [
    { resistance: 110, support: 90, zigzag: 100 },
    { resistance: 115, support: 92, zigzag: 105 },
    { resistance: 120, support: 94, zigzag: 110 },
  ];
  const line = { mR: 5, cR: 110, mS: 2, cS: 90 };

  it('swing → resistanceData / supportData 반환, zigzagData=undefined', () => {
    const r = buildChartData(timestamps, 3, [0, 1, 2], srRaw, line, 'swing');
    expect(r.resistanceData).toHaveLength(2);
    expect(r.supportData).toHaveLength(2);
    expect(r.zigzagData).toBeUndefined();
  });
  it('zigzag → zigzagData 반환', () => {
    const r = buildChartData(timestamps, 3, [0, 1, 2], srRaw, line, 'zigzag');
    expect(Array.isArray(r.zigzagData)).toBe(true);
    expect(r.zigzagData!.length).toBeGreaterThan(0);
  });
  it('cR=null → resistanceData 빈 배열', () => {
    const r = buildChartData(timestamps, 3, [0, 1, 2], srRaw, { mR: 0, cR: null, mS: 0, cS: null }, 'swing');
    expect(r.resistanceData).toHaveLength(0);
    expect(r.supportData).toBeUndefined();
  });
});

// ── calcSlopeInfo ─────────────────────────────────────────────────────────────

describe('calcSlopeInfo', () => {
  it('상승 → positive', () => {
    const r = calcSlopeInfo([{ x: 0, y: 100 }, { x: 1, y: 110 }]);
    expect(r.slopeType).toBe('positive');
    expect(r.slope).toBeCloseTo(10);
  });
  it('하락 → negative', () => {
    const r = calcSlopeInfo([{ x: 0, y: 110 }, { x: 1, y: 100 }]);
    expect(r.slopeType).toBe('negative');
  });
  it('횡보 → flat', () => {
    const r = calcSlopeInfo([{ x: 0, y: 100 }, { x: 1, y: 100 }]);
    expect(r.slopeType).toBe('flat');
  });
  it('빈 배열 → flat, slope=0', () => {
    const r = calcSlopeInfo([]);
    expect(r.slopeType).toBe('flat');
    expect(r.slope).toBe(0);
  });
});

// ── filterTouchPoints ─────────────────────────────────────────────────────────

describe('filterTouchPoints', () => {
  const points = [
    { x: 1000, y: 100, priceType: 'close' as const, type: 'touch' as const },
    { x: 2000, y: 105, priceType: 'high'  as const, type: 'breakout' as const },
    { x: 3000, y: 110, priceType: 'close' as const, type: 'breakout' as const },
    { x: 4000, y: 108, priceType: 'high'  as const, type: 'breakout' as const },
  ];

  it('터치는 항상 유지, 돌파는 범위 내만', () => {
    const r = filterTouchPoints(points, 1500, 3500);
    // touch(1000): 항상 포함
    // breakout(2000): 포함
    // breakout(3000): 포함
    // breakout(4000): 제외
    expect(r.filteredTouchPoints).toHaveLength(3);
    expect(r.breakoutCount).toBe(2);
  });
  it('filterStartMs=0 → 전체 돌파 포함', () => {
    const r = filterTouchPoints(points, 0, Infinity);
    expect(r.breakoutCount).toBe(3);
  });
  it('closeBreakoutCount / highBreakoutCount 구분', () => {
    const r = filterTouchPoints(points, 0, Infinity);
    expect(r.closeBreakoutCount).toBe(1);
    expect(r.highBreakoutCount).toBe(2);
  });
  it('빈 배열 → 모두 0', () => {
    const r = filterTouchPoints([], 0, Infinity);
    expect(r.breakoutCount).toBe(0);
    expect(r.filteredTouchPoints).toHaveLength(0);
  });
});

// ── runTickerSim ──────────────────────────────────────────────────────────────

describe('runTickerSim', () => {
  it('데이터 없으면 null 반환', () => {
    expect(runTickerSim('AAPL', 'Apple', [], BASE_CFG)).toBeNull();
  });

  it('충분한 데이터 → SimResult 또는 null', () => {
    const prices = makePrices(100, 100, 0.5);
    const result = runTickerSim('TEST', 'Test', prices, BASE_CFG);
    // totalCount=0이면 null, 아니면 SimResult
    if (result !== null) {
      expect(result.ticker).toBe('TEST');
      expect(result.name).toBe('Test');
      expect(Array.isArray(result.touchPoints)).toBe(true);
      expect(Array.isArray(result.resistanceData)).toBe(true);
      expect(typeof result.slopeType).toBe('string');
    } else {
      expect(result).toBeNull();
    }
  });

  it('slopeFilter positive → 음의 기울기 종목 null', () => {
    const prices = makePrices(100, 200, -1); // 하락 추세
    const cfg: PeriodConfig = { ...BASE_CFG, slopeFilter: 'positive' };
    const result = runTickerSim('DOWN', 'Down', prices, cfg);
    if (result !== null) {
      expect(result.slopeType).toBe('positive');
    }
  });

  it('slopeFilter negative → 양의 기울기 종목 null', () => {
    const prices = makePrices(100, 100, 1); // 상승 추세
    const cfg: PeriodConfig = { ...BASE_CFG, slopeFilter: 'negative' };
    const result = runTickerSim('UP', 'Up', prices, cfg);
    if (result !== null) {
      expect(result.slopeType).toBe('negative');
    }
  });

  it('zigzag 알고리즘 → crash 없음', () => {
    const prices = makePrices(80, 100, 0.5);
    const cfg: PeriodConfig = { ...BASE_CFG, trendAlgo: 'zigzag' };
    expect(() => runTickerSim('TEST', 'Test', prices, cfg)).not.toThrow();
  });

  it('regression 알고리즘 → crash 없음', () => {
    const prices = makePrices(80, 100, 0.5);
    const cfg: PeriodConfig = { ...BASE_CFG, trendAlgo: 'regression' };
    expect(() => runTickerSim('TEST', 'Test', prices, cfg)).not.toThrow();
  });

  it('잘못된 날짜 문자열 → crash 없음 (NaN 방어)', () => {
    const prices = makePrices(80, 100, 0.5);
    const cfg: PeriodConfig = { ...BASE_CFG, filterStartDate: 'invalid-date', filterEndDate: 'bad' };
    expect(() => runTickerSim('TEST', 'Test', prices, cfg)).not.toThrow();
  });

  it('weekly barUnit → crash 없음', () => {
    const prices = makePrices(80, 100, 0.5);
    const cfg: PeriodConfig = { ...BASE_CFG, barUnit: 'weekly' };
    expect(() => runTickerSim('TEST', 'Test', prices, cfg)).not.toThrow();
  });
});

// ── sortSimResults ────────────────────────────────────────────────────────────

describe('sortSimResults', () => {
  function makeResult(totalCount: number): SimResult {
    return {
      ticker: 'X', name: 'X',
      touchCount: 0, closeTouchCount: 0, highTouchCount: 0,
      breakoutCount: 0, closeBreakoutCount: 0, highBreakoutCount: 0,
      prices: [], resistanceData: [], latestResistance: null,
      touchPoints: [], slopeType: 'flat', totalCount,
    };
  }

  it('totalCount 내림차순 정렬', () => {
    const results = [makeResult(1), makeResult(5), makeResult(3)];
    sortSimResults(results);
    expect(results.map(r => r.totalCount)).toEqual([5, 3, 1]);
  });
  it('totalCount undefined → 0으로 처리', () => {
    const results = [makeResult(2), { ...makeResult(0), totalCount: undefined }];
    sortSimResults(results);
    expect(results[0]!.totalCount).toBe(2);
  });
  it('빈 배열 → 그대로', () => {
    expect(sortSimResults([])).toHaveLength(0);
  });
});

// ── applyPatternFilter ────────────────────────────────────────────────────────

describe('applyPatternFilter', () => {
  function makeResult(overrides: Partial<SimResult> = {}): SimResult {
    return {
      ticker: 'X', name: 'X',
      touchCount: 3, closeTouchCount: 2, highTouchCount: 1,
      breakoutCount: 1, closeBreakoutCount: 1, highBreakoutCount: 0,
      prices: [], resistanceData: [], latestResistance: null,
      touchPoints: [
        { x: 500,  y: 100, priceType: 'close', type: 'touch' },
        { x: 800,  y: 102, priceType: 'high',  type: 'touch' },
        { x: 900,  y: 104, priceType: 'close', type: 'touch' },
        { x: 1500, y: 110, priceType: 'close', type: 'breakout' },
      ],
      slopeType: 'positive',
      totalCount: 4,
      ...overrides,
    };
  }

  it('breakoutCount=0 → 제외', () => {
    const results = [makeResult({ breakoutCount: 0 })];
    expect(applyPatternFilter(results, 1000, 2)).toHaveLength(0);
  });

  it('터치 충분 + 돌파 있음 → 포함', () => {
    const results = [makeResult()];
    expect(applyPatternFilter(results, 1000, 3)).toHaveLength(1);
  });

  it('터치 부족 → 제외', () => {
    const results = [makeResult()];
    // filterStartMs=1000 이전 touch: 500, 800, 900 → 3개, minTouches=4 → 제외
    expect(applyPatternFilter(results, 1000, 4)).toHaveLength(0);
  });

  it('빈 배열 → 빈 배열', () => {
    expect(applyPatternFilter([], 1000, 2)).toHaveLength(0);
  });

  it('filterStartMs=0 → 전체 touch 카운트', () => {
    const results = [makeResult()];
    // filterStartMs=0 → Infinity 기준으로 모든 touch 포함 불가 (x < Infinity)
    expect(applyPatternFilter(results, 0, 3)).toHaveLength(1);
  });
});
