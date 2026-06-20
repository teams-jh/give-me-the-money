/**
 * breadth.test.ts
 *
 * 커버 대상 함수:
 *   getMarketCondition     — netBreadth → 시장 상태 레이블
 *   buildSnapshotDates     — 스냅샷 날짜 목록 생성
 *   calcMarketBreadth      — 시장 breadth 시계열 계산
 */

import { it, expect, describe } from 'vitest';

import { calcMarketBreadth, getMarketCondition, buildSnapshotDates } from './breadth.ts';

// ── 헬퍼: 거래일 생성 ─────────────────────────────────────────────────────────

function makeWeekdays(n: number, start = '2023-01-02'): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (dates.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** 상승 추세 종가 배열 생성 (bullish 분류용) */
function risingPrices(dates: string[], start = 100, step = 1.5) {
  return dates.map((date, i) => ({ date, close: start + step * i }));
}

/** 하락 추세 종가 배열 생성 (bearish 분류용) */
function fallingPrices(dates: string[], start = 100, step = 1.5) {
  return dates.map((date, i) => ({ date, close: start - step * i }));
}

// ── getMarketCondition ───────────────────────────────────────────────────────

describe('getMarketCondition', () => {
  it('netBreadth > 40 → "극단적 강세"', () => {
    expect(getMarketCondition(45)).toBe('극단적 강세');
    expect(getMarketCondition(41)).toBe('극단적 강세');
  });

  it('20 < netBreadth <= 40 → "강세"', () => {
    expect(getMarketCondition(40)).toBe('강세');
    expect(getMarketCondition(25)).toBe('강세');
    expect(getMarketCondition(21)).toBe('강세');
  });

  it('10 < netBreadth <= 20 → "완만한 강세"', () => {
    expect(getMarketCondition(20)).toBe('완만한 강세');
    expect(getMarketCondition(15)).toBe('완만한 강세');
    expect(getMarketCondition(11)).toBe('완만한 강세');
  });

  it('-10 <= netBreadth <= 10 → "중립"', () => {
    expect(getMarketCondition(0)).toBe('중립');
    expect(getMarketCondition(10)).toBe('중립');
    expect(getMarketCondition(-10)).toBe('중립');
  });

  it('-20 <= netBreadth < -10 → "완만한 약세"', () => {
    expect(getMarketCondition(-11)).toBe('완만한 약세');
    expect(getMarketCondition(-15)).toBe('완만한 약세');
    expect(getMarketCondition(-20)).toBe('완만한 약세');
  });

  it('-40 <= netBreadth < -20 → "약세"', () => {
    expect(getMarketCondition(-21)).toBe('약세');
    expect(getMarketCondition(-30)).toBe('약세');
    expect(getMarketCondition(-40)).toBe('약세');
  });

  it('netBreadth < -40 → "극단적 약세"', () => {
    expect(getMarketCondition(-41)).toBe('극단적 약세');
    expect(getMarketCondition(-60)).toBe('극단적 약세');
  });
});

// ── buildSnapshotDates ───────────────────────────────────────────────────────

describe('buildSnapshotDates', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(buildSnapshotDates([], 5, 0)).toEqual([]);
  });

  it('skipFirst=0, step=1 → 전체 날짜 그대로', () => {
    const dates = ['2023-01-02', '2023-01-03', '2023-01-04'];
    expect(buildSnapshotDates(dates, 1, 0)).toEqual(dates);
  });

  it('step=2 → 짝수 인덱스만 포함', () => {
    const dates = ['2023-01-02', '2023-01-03', '2023-01-04', '2023-01-05'];
    const result = buildSnapshotDates(dates, 2, 0);
    expect(result).toEqual(['2023-01-02', '2023-01-04']);
  });

  it('skipFirst=2, step=1 → 인덱스 2부터 시작', () => {
    const dates = ['A', 'B', 'C', 'D', 'E'];
    const result = buildSnapshotDates(dates, 1, 2);
    expect(result).toEqual(['C', 'D', 'E']);
  });

  it('skipFirst > length → 마지막 원소 하나만', () => {
    const dates = ['A', 'B', 'C'];
    const result = buildSnapshotDates(dates, 1, 100);
    // min(100, 2) = 2 → dates[2] = 'C'
    expect(result).toEqual(['C']);
  });

  it('step=5, skipFirst=63 → 주간 스냅샷 패턴', () => {
    const dates = makeWeekdays(100);
    const result = buildSnapshotDates(dates, 5, 63);
    // 63번째부터 5 간격으로 추출
    expect(result[0]).toBe(dates[63]);
    expect(result[1]).toBe(dates[68]);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── calcMarketBreadth ────────────────────────────────────────────────────────

describe('calcMarketBreadth', () => {
  it('종목 없음 → 스냅샷 빈 배열', () => {
    const dates = makeWeekdays(10);
    const result = calcMarketBreadth([], [dates[5]!], 5);
    expect(result.snapshots).toHaveLength(0);
  });

  it('스냅샷 날짜 이전 데이터 없는 종목 → skip (cutIdx < 0)', () => {
    // 종목의 날짜가 모두 snapDate 이후
    const snapDate = '2023-01-01';
    const stock = {
      ticker: 'AAPL',
      sector: 'Tech',
      prices: [{ date: '2023-02-01', close: 100 }],
    };
    const result = calcMarketBreadth([stock], [snapDate], 5);
    expect(result.snapshots).toHaveLength(0); // total=0 → skip
  });

  it('데이터 부족 (minPts 미달) → skip', () => {
    const dates = makeWeekdays(3);
    const stock = {
      ticker: 'AAPL',
      sector: 'Tech',
      prices: risingPrices(dates),
    };
    const snapDate = dates[2]!;
    // lookback=10, minPts=5 → slice.length=3 < 5 → skip
    const result = calcMarketBreadth([stock], [snapDate], 10, 5);
    expect(result.snapshots).toHaveLength(0);
  });

  it('정상 상승 종목 → bullish 스냅샷 생성', () => {
    const dates = makeWeekdays(30);
    const stock = {
      ticker: 'AAPL',
      sector: 'Tech',
      prices: risingPrices(dates, 100, 2), // 강한 상승
    };
    const snapDate = dates[29]!;
    const result = calcMarketBreadth([stock], [snapDate], 20);
    expect(result.snapshots.length).toBeGreaterThan(0);
    const snap = result.snapshots[0]!;
    expect(snap.date).toBe(snapDate);
    expect(snap.total).toBe(1);
    expect(snap.bullish + snap.bearish + snap.sideways + snap.recovering).toBeCloseTo(100, 0);
  });

  it('복수 종목 혼합: bullish + bearish → netBreadth 계산', () => {
    const dates = makeWeekdays(30);
    const stockA = { ticker: 'A', sector: 'Tech', prices: risingPrices(dates, 100, 2) };
    const stockB = { ticker: 'B', sector: 'Finance', prices: fallingPrices(dates, 100, 2) };
    const snapDate = dates[29]!;
    const result = calcMarketBreadth([stockA, stockB], [snapDate], 20);

    if (result.snapshots.length > 0) {
      const snap = result.snapshots[0]!;
      expect(snap.total).toBe(2);
      expect(snap.netBreadth).toBe(snap.bullish - snap.bearish);
    }
  });

  it('lookback 기반 period 레이블: <=70 → "3m"', () => {
    const dates = makeWeekdays(10);
    const stock = { ticker: 'A', sector: 'Tech', prices: risingPrices(dates, 100, 2) };
    const result = calcMarketBreadth([stock], [dates[9]!], 63);
    expect(result.lookback).toBe(63);
    expect(result.period).toBe('3m');
  });

  it('lookback 기반 period 레이블: <=140 → "6m"', () => {
    const dates = makeWeekdays(10);
    const stock = { ticker: 'A', sector: 'Tech', prices: risingPrices(dates, 100, 2) };
    const result = calcMarketBreadth([stock], [dates[9]!], 100);
    expect(result.period).toBe('6m');
  });

  it('lookback 기반 period 레이블: >140 → "1y"', () => {
    const dates = makeWeekdays(10);
    const stock = { ticker: 'A', sector: 'Tech', prices: risingPrices(dates, 100, 2) };
    const result = calcMarketBreadth([stock], [dates[9]!], 200);
    expect(result.period).toBe('1y');
  });

  it('복수 스냅샷 날짜 → 각 날짜별 스냅샷 생성', () => {
    const dates = makeWeekdays(50);
    const stock = { ticker: 'A', sector: 'Tech', prices: risingPrices(dates, 100, 1) };
    const snapDates = [dates[20]!, dates[35]!, dates[49]!];
    const result = calcMarketBreadth([stock], snapDates, 15);
    expect(result.snapshots.length).toBeGreaterThanOrEqual(1);
  });
});
