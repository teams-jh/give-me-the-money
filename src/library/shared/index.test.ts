/**
 * index.test.ts
 * re-export 정상 동작 smoke test
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTrend,
  calcMA, calcEMA, calcRSI, calcMACD, calcBollingerBands, calcATR, calcOBV, calcMDD,
  analyzeSignals, detectGoldenCross, detectRSISignal, detectMACDCross,
  detectBBBreakout, detectVolumeSpike, detectOBVDivergence, detectRiskSignal,
  analyzeFundamentals, detectValuation, detectEarningsAcceleration, detectOwnership,
  detectHighLowBreakout, detectPriceVolumeDivergence,
  calcPositionSize,
  calcSectorRotation, getQuarterKey,
  calcMarketBreadth, buildSnapshotDates, getMarketCondition,
} from './index.ts';

describe('index.ts re-export smoke test', () => {
  it('classifyTrend 함수 정상 export', () => {
    expect(typeof classifyTrend).toBe('function');
  });

  it('indicators 함수들 정상 export', () => {
    expect(typeof calcMA).toBe('function');
    expect(typeof calcEMA).toBe('function');
    expect(typeof calcRSI).toBe('function');
    expect(typeof calcMACD).toBe('function');
    expect(typeof calcBollingerBands).toBe('function');
    expect(typeof calcATR).toBe('function');
    expect(typeof calcOBV).toBe('function');
    expect(typeof calcMDD).toBe('function');
  });

  it('signals 함수들 정상 export', () => {
    expect(typeof analyzeSignals).toBe('function');
    expect(typeof detectGoldenCross).toBe('function');
    expect(typeof detectRSISignal).toBe('function');
    expect(typeof detectMACDCross).toBe('function');
    expect(typeof detectBBBreakout).toBe('function');
    expect(typeof detectVolumeSpike).toBe('function');
    expect(typeof detectOBVDivergence).toBe('function');
    expect(typeof detectRiskSignal).toBe('function');
    expect(typeof detectHighLowBreakout).toBe('function');
    expect(typeof detectPriceVolumeDivergence).toBe('function');
  });

  it('fundamentals 함수들 정상 export', () => {
    expect(typeof analyzeFundamentals).toBe('function');
    expect(typeof detectValuation).toBe('function');
    expect(typeof detectEarningsAcceleration).toBe('function');
    expect(typeof detectOwnership).toBe('function');
  });

  it('position 함수 정상 export', () => {
    expect(typeof calcPositionSize).toBe('function');
  });

  it('sector 함수들 정상 export', () => {
    expect(typeof calcSectorRotation).toBe('function');
    expect(typeof getQuarterKey).toBe('function');
  });

  it('breadth 함수들 정상 export', () => {
    expect(typeof calcMarketBreadth).toBe('function');
    expect(typeof buildSnapshotDates).toBe('function');
    expect(typeof getMarketCondition).toBe('function');
  });
});
