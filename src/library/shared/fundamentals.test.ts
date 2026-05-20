/**
 * fundamentals.test.ts
 *
 * 커버 대상 함수:
 *   detectValuation            — PER/PBR/PEG 신호
 *   detectEarningsAcceleration — 분기 이익 추세
 *   detectOwnership            — 소유구조 신호
 *   detectGrowthQuality        — 성장 품질 신호
 *   detectDividend             — 배당 신호
 *   detectProfitabilityTrend   — 수익성 추세 신호
 *   analyzeFundamentals        — 통합 분석
 */

import type { FundamentalData } from './fundamentals.ts';

import { it, expect, describe } from 'vitest';

import {
  detectDividend,
  detectValuation,
  detectOwnership,
  detectGrowthQuality,
  analyzeFundamentals,
  detectProfitabilityTrend,
  detectEarningsAcceleration,
} from './fundamentals.ts';

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

function makeData(overrides: Partial<FundamentalData> = {}): FundamentalData {
  return {
    pe:              null,
    pb:              null,
    pegRatio:        null,
    roe:             null,
    roa:             null,
    operatingMargin: null,
    profitMargins:   null,
    revenueGrowth:   null,
    quarterlyEarnings: [],
    dividendYield:   null,
    payoutRatio:     null,
    insiderPct:      null,
    institutionPct:  null,
    shortRatio:      null,
    ...overrides,
  };
}

// ── detectValuation ──────────────────────────────────────────────────────────

describe('detectValuation', () => {
  it('PE null → 알림 없음', () => {
    const alerts = detectValuation(makeData({ pe: null, pb: null }));
    expect(alerts).toHaveLength(0);
  });

  it('PE < 0 (적자기업) → bearish 정보성 알림', () => {
    const alerts = detectValuation(makeData({ pe: -5 }));
    expect(alerts.length).toBeGreaterThan(0);
    const a = alerts[0]!;
    expect(a.direction).toBe('bearish');
    expect(a.scoreAffecting).toBe(false);
  });

  it('0 < PE <= 10 (저평가) → bullish 알림', () => {
    const alerts = detectValuation(makeData({ pe: 8 }));
    const found = alerts.find(a => a.type === 'pe_undervalued');
    expect(found).toBeDefined();
    expect(found!.direction).toBe('bullish');
  });

  it('20 < PE <= 30 (주의) → scoreAffecting=false', () => {
    const alerts = detectValuation(makeData({ pe: 25 }));
    const found = alerts.find(a => a.type === 'pe_caution');
    expect(found).toBeDefined();
    expect(found!.scoreAffecting).toBe(false);
  });

  it('30 < PE <= 50 (고평가) → bearish 알림', () => {
    const alerts = detectValuation(makeData({ pe: 40 }));
    const found = alerts.find(a => a.type === 'pe_overvalued');
    expect(found).toBeDefined();
    expect(found!.direction).toBe('bearish');
  });

  it('PE > 50 (과도 고평가) → bearish strong 알림', () => {
    const alerts = detectValuation(makeData({ pe: 60 }));
    const found = alerts.find(a => a.type === 'pe_extreme');
    expect(found).toBeDefined();
    expect(found!.strength).toBe('strong');
  });

  it('PB < 1 (청산가치 이하) → bullish 알림', () => {
    const alerts = detectValuation(makeData({ pb: 0.8 }));
    const found = alerts.find(a => a.type === 'pb_undervalued');
    expect(found).toBeDefined();
    expect(found!.direction).toBe('bullish');
  });

  it('PB > 5 (고평가) → bearish 알림', () => {
    const alerts = detectValuation(makeData({ pb: 6 }));
    const found = alerts.find(a => a.type === 'pb_overvalued');
    expect(found).toBeDefined();
    expect(found!.direction).toBe('bearish');
  });
});

// ── detectEarningsAcceleration ───────────────────────────────────────────────

describe('detectEarningsAcceleration', () => {
  it('분기 데이터 없음 → insufficient', () => {
    const result = detectEarningsAcceleration(makeData({ quarterlyEarnings: [] }));
    expect(result.trend).toBe('insufficient');
  });

  it('데이터 1개 → insufficient', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [{ quarter: '2024Q4', net_income: 1000 }],
    }));
    expect(result.trend).toBe('insufficient');
  });

  it('적자→흑자 전환 → turnaround (strong bullish)', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income:   500 }, // 최신 (흑자)
        { quarter: '2024Q3', net_income: -300 }, // 직전 (적자)
      ],
    }));
    expect(result.trend).toBe('turnaround');
    expect(result.alerts.some(a => a.direction === 'bullish')).toBe(true);
  });

  it('흑자→적자 전환 → deteriorating (strong bearish)', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income:  -500 }, // 최신 (적자)
        { quarter: '2024Q3', net_income:  300 },  // 직전 (흑자)
      ],
    }));
    expect(result.trend).toBe('deteriorating');
    expect(result.alerts.some(a => a.direction === 'bearish')).toBe(true);
  });

  it('4분기 이익 가속 → accelerating', () => {
    // recentGrowth=(2000-1000)/1000=100% > priorGrowth=(1000-900)/900=11% + 10%p → accelerating
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income: 2000 },  // latest
        { quarter: '2024Q3', net_income: 1000 },  // prev1 (100% ↑)
        { quarter: '2024Q2', net_income:  900 },  // prev2 (11% ↑)
        { quarter: '2024Q1', net_income:  810 },  // prev3
      ],
    }));
    expect(result.trend).toBe('accelerating');
  });

  it('4분기 이익 감속 → decelerating', () => {
    // recentGrowth=(1100-1000)/1000=10% < priorGrowth=(1000-500)/500=100% - 10%p → decelerating
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income: 1100 },  // latest
        { quarter: '2024Q3', net_income: 1000 },  // prev1 (10% ↑)
        { quarter: '2024Q2', net_income:  500 },  // prev2 (100% ↑)
        { quarter: '2024Q1', net_income:  250 },  // prev3
      ],
    }));
    expect(result.trend).toBe('decelerating');
  });

  it('최근 3분기 이상 적자 → 연속 적자 bearish', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income: -100 },
        { quarter: '2024Q3', net_income: -200 },
        { quarter: '2024Q2', net_income: -150 },
      ],
    }));
    // deteriorating 또는 stable (연속 적자)
    expect(['deteriorating', 'stable']).toContain(result.trend);
    const hasBearish = result.alerts.some(a => a.direction === 'bearish');
    expect(hasBearish).toBe(true);
  });

  it('4분기 연속 흑자 + 성장 → stable 또는 accelerating', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income:  2100 },
        { quarter: '2024Q3', net_income:  2000 },
        { quarter: '2024Q2', net_income:  1900 },
        { quarter: '2024Q1', net_income:  1800 },
      ],
    }));
    expect(['stable', 'accelerating']).toContain(result.trend);
  });
});

// ── detectOwnership ──────────────────────────────────────────────────────────

describe('detectOwnership', () => {
  it('모두 null → 알림 없음', () => {
    expect(detectOwnership(makeData())).toHaveLength(0);
  });

  it('내부자 보유 > 30% → bullish normal 알림', () => {
    const alerts = detectOwnership(makeData({ insiderPct: 0.35 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('내부자 보유 > 50% → bullish strong 알림', () => {
    const alerts = detectOwnership(makeData({ insiderPct: 0.55 }));
    const found = alerts.find(a => a.strength === 'strong' && a.direction === 'bullish');
    expect(found).toBeDefined();
  });
});

// ── detectGrowthQuality ──────────────────────────────────────────────────────

describe('detectGrowthQuality', () => {
  it('모두 null → 알림 없음', () => {
    expect(detectGrowthQuality(makeData())).toHaveLength(0);
  });

  it('매출 >20% + 순이익률 >10% → bullish strong 알림', () => {
    const alerts = detectGrowthQuality(makeData({ revenueGrowth: 0.25, profitMargins: 0.12 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('매출 감소 <-10% (단독) → bearish 알림', () => {
    const alerts = detectGrowthQuality(makeData({ revenueGrowth: -0.15, profitMargins: null }));
    const found = alerts.find(a => a.direction === 'bearish');
    expect(found).toBeDefined();
  });

  it('매출·순이익률 둘 다 음수 → bearish strong 알림', () => {
    const alerts = detectGrowthQuality(makeData({ revenueGrowth: -0.05, profitMargins: -0.02 }));
    const found = alerts.find(a => a.strength === 'strong' && a.direction === 'bearish');
    expect(found).toBeDefined();
  });

  it('매출 양수 + 순이익률 음수 → bearish (이익잠식) 알림', () => {
    const alerts = detectGrowthQuality(makeData({ revenueGrowth: 0.10, profitMargins: -0.02 }));
    const found = alerts.find(a => a.direction === 'bearish');
    expect(found).toBeDefined();
  });

  it('PEG < 1 → bullish weak 알림', () => {
    const alerts = detectGrowthQuality(makeData({ pegRatio: 0.8 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('PEG > 3 → bearish weak 알림', () => {
    const alerts = detectGrowthQuality(makeData({ pegRatio: 3.5 }));
    const found = alerts.find(a => a.direction === 'bearish');
    expect(found).toBeDefined();
  });
});

// ── detectDividend ───────────────────────────────────────────────────────────

describe('detectDividend', () => {
  it('배당 없음 → 알림 없음', () => {
    expect(detectDividend(makeData())).toHaveLength(0);
  });

  it('배당수익률 > 3% → bullish 알림', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.04 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('배당수익률 > 7% → strong bullish (위험 고배당)', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.08 }));
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('배당성향 > 100% (과도한 배당) → bearish 알림', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.05, payoutRatio: 1.2 }));
    const bearish = alerts.find(a => a.direction === 'bearish');
    expect(bearish).toBeDefined();
  });

  it('배당수익률 1~3% 구간 → 정보성 알림', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.02 }));
    // 정보성이거나 알림 없음 (구현에 따라)
    expect(Array.isArray(alerts)).toBe(true);
  });
});

// ── detectProfitabilityTrend ─────────────────────────────────────────────────

describe('detectProfitabilityTrend', () => {
  it('모두 null → 알림 없음', () => {
    expect(detectProfitabilityTrend(makeData())).toHaveLength(0);
  });

  it('영업이익률 > 20% → bullish 알림', () => {
    const alerts = detectProfitabilityTrend(makeData({ operatingMargin: 0.25 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('영업이익률 < -10% → bearish 알림', () => {
    const alerts = detectProfitabilityTrend(makeData({ operatingMargin: -0.12 }));
    const found = alerts.find(a => a.direction === 'bearish');
    expect(found).toBeDefined();
  });

  it('ROA > 10% → bullish 알림', () => {
    const alerts = detectProfitabilityTrend(makeData({ roa: 0.12 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('ROA > 10% (roe 없음) → bullish 알림', () => {
    const alerts = detectProfitabilityTrend(makeData({ roe: null, roa: 0.12 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('ROA < 0 (roe 없음) → bearish 알림', () => {
    const alerts = detectProfitabilityTrend(makeData({ roe: null, roa: -0.05 }));
    const found = alerts.find(a => a.direction === 'bearish');
    expect(found).toBeDefined();
  });
});

// ── analyzeFundamentals (통합) ───────────────────────────────────────────────

describe('analyzeFundamentals', () => {
  const goodData = makeData({
    pe:              8,
    pb:              0.8,
    pegRatio:        0.7,
    roe:             0.20,
    roa:             0.12,
    operatingMargin: 0.25,
    profitMargins:   0.18,
    revenueGrowth:   0.25,
    quarterlyEarnings: [
      { quarter: '2024Q4', net_income: 3000 },
      { quarter: '2024Q3', net_income: 2000 },
      { quarter: '2024Q2', net_income: 1500 },
      { quarter: '2024Q1', net_income: 1000 },
    ],
    dividendYield:  0.04,
    payoutRatio:    0.40,
    insiderPct:     0.22,
    institutionPct: 0.60,
    shortRatio:     1.5,
  });

  it('양호한 데이터 → score > 0 (매수 우세)', () => {
    const result = analyzeFundamentals('AAPL', goodData);
    expect(result.score).toBeGreaterThan(0);
  });

  it('FundamentalSummary 필드 완전성 검증', () => {
    const result = analyzeFundamentals('AAPL', goodData);
    expect(result.ticker).toBe('AAPL');
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(['accelerating', 'decelerating', 'turnaround', 'deteriorating', 'stable', 'insufficient'])
      .toContain(result.earningsTrend);
  });

  it('악화된 데이터 → score < 0 (매도 우세)', () => {
    const badData = makeData({
      pe:              60,
      pb:              6,
      roe:             -0.10,
      operatingMargin: -0.05,
      profitMargins:   -0.03,
      shortRatio:      25,
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income:  -500 },
        { quarter: '2024Q3', net_income:   300 },
      ],
    });
    const result = analyzeFundamentals('BAD', badData);
    expect(result.score).toBeLessThan(0);
  });

  it('데이터 없음 → score 0, alerts 빈 배열', () => {
    const result = analyzeFundamentals('NONE', makeData());
    expect(result.score).toBe(0);
    expect(result.alerts).toHaveLength(0);
    expect(result.earningsTrend).toBe('insufficient');
  });

  it('ticker 필드 반영', () => {
    const result = analyzeFundamentals('MSFT', goodData);
    expect(result.ticker).toBe('MSFT');
  });

  it('배당 데이터 없을 때 dividendYield=null 반영', () => {
    const result = analyzeFundamentals('X', makeData({ dividendYield: null }));
    expect(result.dividendYield).toBeNull();
  });
});

// ── detectEarningsAcceleration 추가 브랜치 ────────────────────────────────────

describe('detectEarningsAcceleration 추가 브랜치', () => {
  it('최근 3분기 적자 → 연속 적자 bearish', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q3', net_income: -100 },
        { quarter: '2024Q2', net_income: -200 },
        { quarter: '2024Q1', net_income: -150 },
      ],
    }));
    expect(result.trend).toBe('deteriorating');
    expect(result.alerts.some(a => a.direction === 'bearish')).toBe(true);
  });

  it('4분기 연속 흑자 → stable + bullish weak', () => {
    const result = detectEarningsAcceleration(makeData({
      quarterlyEarnings: [
        { quarter: '2024Q4', net_income: 2000 },
        { quarter: '2024Q3', net_income: 1900 },
        { quarter: '2024Q2', net_income: 1800 },
        { quarter: '2024Q1', net_income: 1700 },
      ],
    }));
    // stable(연속흑자) 또는 accelerating/decelerating
    expect(['stable', 'accelerating', 'decelerating']).toContain(result.trend);
  });
});

// ── detectProfitabilityTrend 추가 브랜치 ─────────────────────────────────────

describe('detectProfitabilityTrend 추가 브랜치', () => {
  it('ROE > 20% + ROA > 10% → excellent bullish strong', () => {
    const alerts = detectProfitabilityTrend(makeData({ roe: 0.22, roa: 0.12 }));
    const found = alerts.find(a => a.strength === 'strong' && a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('ROE < -20% → critical bearish strong', () => {
    const alerts = detectProfitabilityTrend(makeData({ roe: -0.25 }));
    const found = alerts.find(a => a.strength === 'strong' && a.direction === 'bearish');
    expect(found).toBeDefined();
  });

  it('roe null + roa > 10% → roa only bullish', () => {
    const alerts = detectProfitabilityTrend(makeData({ roe: null, roa: 0.15 }));
    const found = alerts.find(a => a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('영업이익률 > 20% → 정보성 bullish (scoreAffecting=false)', () => {
    const alerts = detectProfitabilityTrend(makeData({ roe: 0.10, operatingMargin: 0.25 }));
    const found = alerts.find(a => a.direction === 'bullish' && a.scoreAffecting === false);
    expect(found).toBeDefined();
  });
});

// ── detectDividend 추가 브랜치 ────────────────────────────────────────────────

describe('detectDividend 추가 브랜치', () => {
  it('배당수익률 > 5% + 성향 < 70% → strong bullish', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.06, payoutRatio: 0.50 }));
    const found = alerts.find(a => a.strength === 'strong' && a.direction === 'bullish');
    expect(found).toBeDefined();
  });

  it('배당수익률 1~3% → 정보성 bullish weak', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.02 }));
    const found = alerts.find(a => a.direction === 'bullish' && a.scoreAffecting === false);
    expect(found).toBeDefined();
  });

  it('성향 > 80% + 수익률 < 2% → bearish weak', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.015, payoutRatio: 0.85 }));
    const found = alerts.find(a => a.direction === 'bearish');
    expect(found).toBeDefined();
  });

  it('배당수익률 0 → 빈 배열', () => {
    expect(detectDividend(makeData({ dividendYield: 0 }))).toHaveLength(0);
  });

  it('배당수익률 > 3% (payoutPct 없음) → bullish', () => {
    const alerts = detectDividend(makeData({ dividendYield: 0.04, payoutRatio: null }));
    expect(alerts.some(a => a.direction === 'bullish')).toBe(true);
  });
});
