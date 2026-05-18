/**
 * classifyTrend.test.ts
 *
 * 커버 대상 함수:
 *   classifyTrend — 선형회귀 기반 추세 분류
 */

import { describe, it, expect } from 'vitest';
import { classifyTrend } from './classifyTrend.ts';
import type { PriceSeries } from './classifyTrend.ts';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeSeries(values: number[], startDate = '2023-01-02'): PriceSeries {
  const labels: string[] = [];
  const d = new Date(startDate);
  for (let i = 0; i < values.length; i++) {
    labels.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return { labels, values };
}

/** 선형 상승 데이터 */
function rising(n: number, start = 100, step = 2): number[] {
  return Array.from({ length: n }, (_, i) => start + step * i);
}

/** 선형 하락 데이터 */
function falling(n: number, start = 100, step = 2): number[] {
  return Array.from({ length: n }, (_, i) => start - step * i);
}

/** 횡보 데이터 (노이즈 작음) */
function sidewaysData(n: number, base = 100): number[] {
  return Array.from({ length: n }, (_, i) => base + (i % 3) * 0.1);
}

// ── 기본 동작 ─────────────────────────────────────────────────────────────────

describe('classifyTrend', () => {
  it('데이터 부족 (values.length < minPts) → null', () => {
    const series = makeSeries([100, 101, 102]);
    expect(classifyTrend(series, 5)).toBeNull();
  });

  it('minPts = values.length (경계) → null 아님', () => {
    const series = makeSeries(rising(5));
    const result = classifyTrend(series, 5);
    expect(result).not.toBeNull();
  });

  // ── bullish ──────────────────────────────────────────────────────────────

  it('강한 상승 → bullish (slopePct > 0.3, r2 >= 0.35)', () => {
    // step=3 → 기울기 충분히 큼, R² 높음
    const series = makeSeries(rising(30, 100, 3));
    const result = classifyTrend(series, 5);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('bullish');
  });

  it('bullish → totalReturn 양수', () => {
    const series = makeSeries(rising(20, 100, 2));
    const result = classifyTrend(series, 5);
    expect(result!.totalReturn).toBeGreaterThan(0);
  });

  it('bullish → slopePct 양수', () => {
    const series = makeSeries(rising(20, 100, 2));
    const result = classifyTrend(series, 5);
    expect(result!.slopePct).toBeGreaterThan(0);
  });

  // ── bearish ──────────────────────────────────────────────────────────────

  it('강한 하락 → bearish (slopePct < -0.3, r2 >= 0.35)', () => {
    const series = makeSeries(falling(30, 200, 3));
    const result = classifyTrend(series, 5);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('bearish');
  });

  it('bearish → slopePct 음수', () => {
    const series = makeSeries(falling(20, 200, 2));
    const result = classifyTrend(series, 5);
    expect(result!.slopePct).toBeLessThan(0);
  });

  // ── sideways ─────────────────────────────────────────────────────────────

  it('횡보 데이터 → sideways', () => {
    const series = makeSeries(sidewaysData(20, 100));
    const result = classifyTrend(series, 5);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('sideways');
  });

  // ── recovering ───────────────────────────────────────────────────────────

  it('전반 하락 후 급반등 → recovering', () => {
    // 전반 2/3 : 하락, 후반 1/3 : 강한 상승
    const n = 30;
    const earlyN = Math.max(4, Math.floor(n * 2 / 3)); // 20
    const lateN  = n - earlyN;                           // 10

    const earlyPrices = falling(earlyN, 100, 1.5); // 하락
    // 후반은 마지막 early 가격부터 강하게 반등
    const lastEarly = earlyPrices[earlyN - 1]!;
    const latePrices = rising(lateN, lastEarly, 4); // 강한 상승

    const values = [...earlyPrices, ...latePrices];
    const series = makeSeries(values);
    const result = classifyTrend(series, 5);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('recovering');
  });

  // ── 반환값 구조 ──────────────────────────────────────────────────────────

  it('반환값에 chartLabels, chartData, regression 포함', () => {
    const series = makeSeries(rising(10));
    const result = classifyTrend(series, 5);
    expect(result!.chartLabels).toHaveLength(10);
    expect(result!.chartData).toHaveLength(10);
    expect(result!.regression).toHaveLength(10);
  });

  it('chartData[0] = 100 (base=100 정규화)', () => {
    const series = makeSeries(rising(10, 200, 2));
    const result = classifyTrend(series, 5);
    expect(result!.chartData[0]).toBe(100);
  });

  it('r2 범위 0 ~ 1', () => {
    const series = makeSeries(rising(20, 100, 1));
    const result = classifyTrend(series, 5);
    expect(result!.r2).toBeGreaterThanOrEqual(0);
    expect(result!.r2).toBeLessThanOrEqual(1);
  });

  it('slopeEarlyPct, slopeLatePct 모두 반환', () => {
    const series = makeSeries(rising(20, 100, 2));
    const result = classifyTrend(series, 5);
    expect(typeof result!.slopeEarlyPct).toBe('number');
    expect(typeof result!.slopeLatePct).toBe('number');
  });

  it('단조 증가 → R² ≈ 1.0 (완벽한 선형)', () => {
    // x = 0,1,2,...,n-1 그대로 사용하면 y=ax+b → R²=1
    const values = Array.from({ length: 20 }, (_, i) => 10 + 2 * i);
    const series = makeSeries(values);
    const result = classifyTrend(series, 5);
    expect(result!.r2).toBeCloseTo(1.0, 1);
  });

  it('모든 값 동일 (denom=0) → sideways, crash 없음', () => {
    const values = Array.from({ length: 10 }, () => 100);
    const series = makeSeries(values);
    const result = classifyTrend(series, 5);
    // denom=0 → slope=0, r=0 → sideways
    expect(result).not.toBeNull();
    expect(result!.trend).toBe('sideways');
  });
});
