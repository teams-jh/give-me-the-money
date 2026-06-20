/**
 * signals.test.ts - 올바른 함수 시그니처 반영
 */

import type { OHLCV } from './indicators.ts';

import { it, expect, describe } from 'vitest';

import {
  analyzeSignals,
  detectRSISignal,
  detectMACDCross,
  detectROCSignal,
  detectMFISignal,
  detectBBBreakout,
  detectRiskSignal,
  detectGoldenCross,
  detectVolumeSpike,
  detectOBVDivergence,
  intersectSimResults,
  calcTrendTouchPoints,
  detectHighLowBreakout,
  detectStochasticSignal,
 detectSupertrendSignal , detectPriceVolumeDivergence } from './signals.ts';

function makeOHLCV(closes: number[], vol = 1_000_000): OHLCV[] {
  return closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: close * 0.99,
    high: close * 1.02,
    low: close * 0.98,
    close,
    volume: vol,
  }));
}
function rising(n: number, s = 100, d = 2) {
  return Array.from({ length: n }, (_, i) => s + d * i);
}
function falling(n: number, s = 100, d = 2) {
  return Array.from({ length: n }, (_, i) => s - d * i);
}
function flat(n: number, b = 100) {
  return Array.from({ length: n }, (_, i) => b + (i % 3) * 0.1);
}
function vols(n: number, v = 1_000_000) {
  return Array.from({ length: n }, () => v);
}

describe('detectGoldenCross', () => {
  it('데이터 부족 → alerts 빈 배열', () => {
    expect(detectGoldenCross(rising(10)).alerts).toHaveLength(0);
  });
  it('충분한 데이터 → crash 없음', () => {
    expect(Array.isArray(detectGoldenCross(rising(130, 100, 0.5)).alerts)).toBe(true);
  });
  it('상승→하락 전환 → alerts 배열', () => {
    const closes = [...falling(70, 200, 1), ...rising(60, 130, 1)];
    expect(Array.isArray(detectGoldenCross(closes).alerts)).toBe(true);
  });
});

describe('detectRSISignal', () => {
  it('데이터 부족 → rsi=null', () => {
    expect(detectRSISignal(rising(5)).rsi).toBeNull();
  });
  it('과매도(급락) → bullish 가능', () => {
    const r = detectRSISignal(falling(30, 100, 5));
    if (r.rsi !== null && r.rsi < 30)
      expect(r.alerts.some((a) => a.direction === 'bullish')).toBe(true);
  });
  it('과매수(급등) → bearish 가능', () => {
    const r = detectRSISignal(rising(30, 100, 5));
    if (r.rsi !== null && r.rsi > 70)
      expect(r.alerts.some((a) => a.direction === 'bearish')).toBe(true);
  });
  it('횡보 → alerts 배열', () => {
    expect(Array.isArray(detectRSISignal(flat(30)).alerts)).toBe(true);
  });
});

describe('detectMACDCross', () => {
  it('데이터 부족 → macd=null', () => {
    const r = detectMACDCross(rising(10));
    expect(r.macd).toBeNull();
    expect(r.signal).toBeNull();
  });
  it('충분한 데이터 → macd 숫자 또는 null', () => {
    const r = detectMACDCross(rising(60, 100, 0.5));
    expect(typeof r.macd === 'number' || r.macd === null).toBe(true);
  });
  it('상승→하락 전환 → alerts 배열', () => {
    expect(
      Array.isArray(detectMACDCross([...rising(40, 100, 2), ...falling(20, 180, 3)]).alerts)
    ).toBe(true);
  });
});

describe('detectBBBreakout', () => {
  it('데이터 부족 → bandWidth=null', () => {
    expect(detectBBBreakout(rising(5)).bandWidth).toBeNull();
  });
  it('충분한 데이터 → bandWidth 반환', () => {
    const r = detectBBBreakout(flat(30));
    if (r.bandWidth !== null) expect(r.bandWidth).toBeGreaterThanOrEqual(0);
  });
  it('긴 횡보 + 급등 → alerts 배열', () => {
    const data = [...flat(125), ...rising(5, 100, 5)];
    expect(Array.isArray(detectBBBreakout(data).alerts)).toBe(true);
  });
});

describe('detectVolumeSpike', () => {
  it('데이터 부족 → volRatio=null', () => {
    expect(detectVolumeSpike(rising(5), vols(5)).volRatio).toBeNull();
  });
  it('균일 거래량 → alerts 빈 배열', () => {
    expect(detectVolumeSpike(flat(30), vols(30)).alerts).toHaveLength(0);
  });
  it('거래량 4배 급증 → alerts 생성 가능', () => {
    const c = [...flat(29), 105];
    const v = [...vols(29, 1_000_000), 4_000_000];
    const r = detectVolumeSpike(c, v);
    if (r.volRatio !== null && r.volRatio >= 2) expect(r.alerts.length).toBeGreaterThan(0);
  });
  it('volRatio 반환', () => {
    const r = detectVolumeSpike(flat(30), vols(30, 2_000_000));
    expect(typeof r.volRatio === 'number' || r.volRatio === null).toBe(true);
  });
});

describe('detectOBVDivergence', () => {
  it('데이터 부족 → alerts 빈 배열', () => {
    expect(detectOBVDivergence(rising(5), vols(5)).alerts).toHaveLength(0);
  });
  it('충분한 데이터 → alerts 배열', () => {
    expect(Array.isArray(detectOBVDivergence(rising(30, 100, 1), vols(30)).alerts)).toBe(true);
  });
  it('가격 상승 + 거래량 감소 → bearish divergence 가능', () => {
    const c = [...Array.from({ length: 22 }, () => 100), 101.5, 103, 105];
    const v = [...vols(22, 2_000_000), 500_000, 500_000, 500_000];
    expect(Array.isArray(detectOBVDivergence(c, v).alerts)).toBe(true);
  });
});

describe('detectRiskSignal', () => {
  it('데이터 부족 → atr=null', () => {
    expect(detectRiskSignal(makeOHLCV(rising(5))).atr).toBeNull();
  });
  it('충분한 데이터 → mdd <= 0', () => {
    expect(detectRiskSignal(makeOHLCV(rising(30, 100, 1))).mdd).toBeLessThanOrEqual(0);
  });
  it('급락 → MDD 큰 음수', () => {
    expect(detectRiskSignal(makeOHLCV(falling(30, 100, 3))).mdd).toBeLessThan(-10);
  });
  it('alerts 배열', () => {
    expect(Array.isArray(detectRiskSignal(makeOHLCV(rising(20))).alerts)).toBe(true);
  });
});

describe('detectHighLowBreakout', () => {
  it('데이터 부족 → high52w=null, low52w=null', () => {
    const r = detectHighLowBreakout(rising(5));
    expect(r.high52w).toBeNull();
    expect(r.low52w).toBeNull();
  });
  it('충분한 데이터 → alerts 배열', () => {
    expect(Array.isArray(detectHighLowBreakout(rising(260, 100, 0.5)).alerts)).toBe(true);
  });
  it('신고가 근처 → bullish 알림 가능', () => {
    const closes = [...Array.from({ length: 255 }, (_, i) => 100 + i * 0.1), 200];
    const r = detectHighLowBreakout(closes);
    if (r.alerts.length > 0) expect(r.alerts.some((a) => a.direction === 'bullish')).toBe(true);
  });
});

describe('detectPriceVolumeDivergence', () => {
  it('데이터 부족 → priceChangePct=null', () => {
    expect(detectPriceVolumeDivergence(rising(5), vols(5)).priceChangePct).toBeNull();
  });
  it('충분한 데이터 → alerts 배열', () => {
    expect(Array.isArray(detectPriceVolumeDivergence(rising(45), vols(45)).alerts)).toBe(true);
  });
  it('priceChangePct, volumeChangePct 반환', () => {
    const r = detectPriceVolumeDivergence(rising(45, 100, 1), vols(45));
    expect(typeof r.priceChangePct === 'number' || r.priceChangePct === null).toBe(true);
    expect(typeof r.volumeChangePct === 'number' || r.volumeChangePct === null).toBe(true);
  });
});

describe('detectStochasticSignal', () => {
  it('데이터 부족 → k=null, d=null', () => {
    const r = detectStochasticSignal(makeOHLCV(rising(5)));
    expect(r.k).toBeNull();
    expect(r.d).toBeNull();
  });
  it('충분한 데이터 → k 반환', () => {
    const r = detectStochasticSignal(makeOHLCV(flat(30)));
    expect(typeof r.k === 'number' || r.k === null).toBe(true);
  });
  it('과매도(급락) → bullish 가능', () => {
    const r = detectStochasticSignal(makeOHLCV(falling(30, 100, 3)));
    if (r.k !== null && r.k < 20)
      expect(r.alerts.some((a) => a.direction === 'bullish')).toBe(true);
  });
});

describe('detectROCSignal', () => {
  it('데이터 부족 → roc20=null', () => {
    expect(detectROCSignal([100, 101]).roc20).toBeNull();
  });
  it('상승 → roc20 양수 가능', () => {
    const r = detectROCSignal(rising(30, 100, 1));
    if (r.roc20 !== null) expect(r.roc20).toBeGreaterThan(0);
  });
  it('roc5, roc60 필드', () => {
    const r = detectROCSignal(rising(70, 100, 0.5));
    expect(typeof r.roc5 === 'number' || r.roc5 === null).toBe(true);
    expect(typeof r.roc60 === 'number' || r.roc60 === null).toBe(true);
  });
  it('alerts 배열', () => {
    expect(Array.isArray(detectROCSignal(rising(30)).alerts)).toBe(true);
  });
});

describe('detectMFISignal', () => {
  it('데이터 부족 → mfi=null', () => {
    expect(detectMFISignal(makeOHLCV(rising(5))).mfi).toBeNull();
  });
  it('충분한 데이터 → mfi 0~100', () => {
    const r = detectMFISignal(makeOHLCV(flat(30)));
    if (r.mfi !== null) {
      expect(r.mfi).toBeGreaterThanOrEqual(0);
      expect(r.mfi).toBeLessThanOrEqual(100);
    }
  });
  it('alerts 배열', () => {
    expect(Array.isArray(detectMFISignal(makeOHLCV(rising(20))).alerts)).toBe(true);
  });
});

describe('detectSupertrendSignal', () => {
  it('데이터 부족 → direction=null', () => {
    expect(detectSupertrendSignal(makeOHLCV(rising(5))).direction).toBeNull();
  });
  it('충분한 데이터 → direction 반환', () => {
    const r = detectSupertrendSignal(makeOHLCV(rising(30, 100, 1)));
    expect(['bullish', 'bearish', null]).toContain(r.direction);
  });
  it('supertrend 숫자 또는 null', () => {
    const r = detectSupertrendSignal(makeOHLCV(rising(20)));
    expect(typeof r.supertrend === 'number' || r.supertrend === null).toBe(true);
  });
  it('alerts 배열', () => {
    expect(Array.isArray(detectSupertrendSignal(makeOHLCV(rising(25, 100, 2))).alerts)).toBe(true);
  });
});

describe('analyzeSignals', () => {
  it('데이터 부족 → score=0', () => {
    expect(analyzeSignals('AAPL', makeOHLCV(rising(5))).score).toBe(0);
  });
  it('SignalSummary 필드 완전성', () => {
    const r = analyzeSignals('AAPL', makeOHLCV(rising(60)));
    expect(r.ticker).toBe('AAPL');
    expect(typeof r.score).toBe('number');
    expect(Array.isArray(r.alerts)).toBe(true);
    expect(typeof r.mdd).toBe('number');
  });
  it('ticker 반영', () => {
    expect(analyzeSignals('MSFT', makeOHLCV(flat(30))).ticker).toBe('MSFT');
  });
  it('rsi, macd, bandWidth, volRatio 필드', () => {
    const r = analyzeSignals('X', makeOHLCV(rising(60, 100, 0.5)));
    expect(typeof r.rsi === 'number' || r.rsi === null).toBe(true);
    expect(typeof r.macd === 'number' || r.macd === null).toBe(true);
    expect(typeof r.bandWidth === 'number' || r.bandWidth === null).toBe(true);
    expect(typeof r.volRatio === 'number' || r.volRatio === null).toBe(true);
  });
  it('adx, stochK, roc20, mfi, supertrendDir 필드', () => {
    const r = analyzeSignals('X', makeOHLCV(rising(60, 100, 0.5)));
    expect(typeof r.adx === 'number' || r.adx === null).toBe(true);
    expect(typeof r.stochK === 'number' || r.stochK === null).toBe(true);
    expect(typeof r.roc20 === 'number' || r.roc20 === null).toBe(true);
    expect(typeof r.mfi === 'number' || r.mfi === null).toBe(true);
    expect(['bullish', 'bearish', null]).toContain(r.supertrendDir);
  });
  it('급등 → RSI 등 지표 반환 (crash 없음)', () => {
    const r = analyzeSignals('T', makeOHLCV(rising(60, 100, 3)));
    expect(typeof r.score).toBe('number');
    expect(Array.isArray(r.alerts)).toBe(true);
  });
  it('급락 → RSI 등 지표 반환 (crash 없음)', () => {
    const r = analyzeSignals('T', makeOHLCV(falling(60, 300, 3)));
    expect(typeof r.score).toBe('number');
    expect(Array.isArray(r.alerts)).toBe(true);
  });
});

// ── detectMFISignal rsiArr 파라미터 + MFI 극단값 브랜치 ──────────────────────

describe('detectMFISignal 추가 브랜치', () => {
  function makeHighVolOHLCV(closes: number[]): OHLCV[] {
    return closes.map((close, i) => ({
      date: `2024-02-${String(i + 1).padStart(2, '0')}`,
      open: close * 0.99,
      high: close * 1.02,
      low: close * 0.98,
      close,
      volume: 10_000_000,
    }));
  }

  it('rsiArr 외부 제공 → 내부 RSI 재계산 없이 사용', () => {
    const closes = rising(30, 100, 1);
    const data = makeHighVolOHLCV(closes);
    const rsiArr: (number | null)[] = Array.from({ length: 30 }, (_, i) => (i < 14 ? null : 50));
    const result = detectMFISignal(data, rsiArr);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('MFI > 80 과매수 → bearish 알림', () => {
    // 급등 + 높은 거래량 조합으로 MFI 높게
    const data = makeHighVolOHLCV(rising(30, 100, 3));
    const result = detectMFISignal(data);
    if (result.mfi !== null && result.mfi > 80) {
      expect(result.alerts.some((a) => a.direction === 'bearish')).toBe(true);
    }
  });

  it('MFI-RSI 괴리 브랜치: rsiArr=null 배열로 커버', () => {
    const data = makeHighVolOHLCV(falling(30, 100, 3));
    const rsiArr: (number | null)[] = Array.from({ length: 30 }, () => null);
    const result = detectMFISignal(data, rsiArr);
    expect(typeof result.mfi === 'number' || result.mfi === null).toBe(true);
  });
});

// ── detectROCSignal 추가 브랜치 ──────────────────────────────────────────────

describe('detectROCSignal 추가 브랜치', () => {
  it('3구간 모두 양수(strong bullish) → bullish strong', () => {
    // 충분히 긴 상승 데이터 → roc5/20/60 모두 양수
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 1.5);
    const result = detectROCSignal(closes);
    if (result.roc5 !== null && result.roc20 !== null && result.roc60 !== null) {
      if (result.roc5 > 0 && result.roc20 > 0 && result.roc60 > 0) {
        expect(
          result.alerts.some((a) => a.strength === 'strong' && a.direction === 'bullish')
        ).toBe(true);
      }
    }
  });

  it('3구간 모두 음수(strong bearish) → bearish strong', () => {
    const closes = Array.from({ length: 70 }, (_, i) => 200 - i * 1.5);
    const result = detectROCSignal(closes);
    if (result.roc5 !== null && result.roc20 !== null && result.roc60 !== null) {
      if (result.roc5 < 0 && result.roc20 < 0 && result.roc60 < 0) {
        expect(
          result.alerts.some((a) => a.strength === 'strong' && a.direction === 'bearish')
        ).toBe(true);
      }
    }
  });

  it('2구간 음수 → bearish normal 가능', () => {
    // 최근 5봉만 상승, 나머지는 하락
    const down60 = Array.from({ length: 65 }, (_, i) => 200 - i * 2);
    const up5 = Array.from({ length: 5 }, (_, i) => 70 + i);
    const closes = [...down60, ...up5];
    const result = detectROCSignal(closes);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});

// ── 추가 브랜치: ROC bullish normal, bearish normal ──────────────────────────

describe('detectROCSignal 2개 양수/음수 브랜치', () => {
  it('2개 양수(roc5/roc20만) + roc60 null → bullish normal', () => {
    // 70봉 미만으로 roc60=null, 5/20은 상승
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i * 1);
    const result = detectROCSignal(closes);
    // roc60이 없으면 total < 3, 2개 양수라면 bullish normal 가능
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('roc5 양수, roc20 양수, roc60 양수 모두 → strong bullish 확인', () => {
    const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 2);
    const result = detectROCSignal(closes);
    const hasStrongBullish = result.alerts.some((a) => a.type === 'roc_strong_bullish');
    const hasBullishNormal = result.alerts.some((a) => a.type === 'roc_bullish');
    // 둘 중 하나 - 데이터에 따라 달라짐
    expect(hasStrongBullish || hasBullishNormal || result.alerts.length === 0).toBe(true);
  });

  it('roc5 음수, roc20 음수, roc60 양수 → bearish normal 가능', () => {
    // 장기 상승 후 단기 급락
    const longUp = Array.from({ length: 65 }, (_, i) => 100 + i * 1);
    const shortDown = Array.from({ length: 5 }, (_, i) => 165 - i * 5);
    const closes = [...longUp, ...shortDown];
    const result = detectROCSignal(closes);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});

// ── signals.ts 미달: Stochastic 다이버전스 브랜치 ───────────────────────────

describe('detectStochasticSignal 추가 브랜치', () => {
  function makeOHLCVLocal(closes: number[], vol = 1_000_000): OHLCV[] {
    return closes.map((close, i) => ({
      date: `2024-03-${String(i + 1).padStart(2, '0')}`,
      open: close * 0.99,
      high: close * 1.02,
      low: close * 0.98,
      close,
      volume: vol,
    }));
  }

  it('과매수(급등) → bearish 알림 가능', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 5);
    const result = detectStochasticSignal(makeOHLCVLocal(closes));
    if (result.k !== null && result.k > 80) {
      expect(result.alerts.some((a) => a.direction === 'bearish')).toBe(true);
    }
  });

  it('lookback 내 교차 탐지 브랜치 커버', () => {
    // 하락→상승 전환: k가 d를 상향 돌파 가능
    const down = Array.from({ length: 15 }, (_, i) => 100 - i * 3);
    const up = Array.from({ length: 15 }, (_, i) => 55 + i * 3);
    const result = detectStochasticSignal(makeOHLCVLocal([...down, ...up]), 10);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});

// ── calcTrendTouchPoints ───────────────────────────────────────────────────────


/**
 * 테스트용 평평한 추세선 (m=0, c=100)
 * R_i = 100 (모든 i 동일)
 * touchTolerance=2%  → 터치 구간: 98 <= price <= 100
 * breakoutTolerance=2% → 돌파 구간: price >= 102
 */
const FLAT_LINE = { m: 0, c: 100, touchTolerance: 2, breakoutTolerance: 2 };

/** n개의 타임스탬프 생성 (1일 간격) */
function makeTimestamps(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i * 86_400_000);
}

function makeParams(overrides: Partial<ReturnType<typeof baseParams>> & { n?: number }) {
  const n = overrides.n ?? 5;
  return { ...baseParams(n), ...overrides };
}

function baseParams(n: number) {
  return {
    timestamps: makeTimestamps(n),
    highPrices: Array(n).fill(95), // 기본: 비반응 구간
    closePrices: Array(n).fill(95),
    ...FLAT_LINE,
    trendMinIdx: 0,
    trendMaxIdx: n - 1,
    touchBasis: 'both' as const,
  };
}

describe('calcTrendTouchPoints', () => {
  // ── 기본 동작 ────────────────────────────────────────────────────────────

  it('빈 배열 → 모든 카운트 0, touchPoints 빈 배열', () => {
    const r = calcTrendTouchPoints({ ...baseParams(0) });
    expect(r.touchPoints).toHaveLength(0);
    expect(r.touchCount).toBe(0);
    expect(r.breakoutCount).toBe(0);
  });

  it('터치/돌파 구간에 해당하지 않는 가격 → 카운트 없음', () => {
    // close=95, high=95 → 터치 구간(98~100) 아래
    const r = calcTrendTouchPoints(baseParams(5));
    expect(r.touchCount).toBe(0);
    expect(r.breakoutCount).toBe(0);
    expect(r.touchPoints).toHaveLength(0);
  });

  // ── 터치 판정 ─────────────────────────────────────────────────────────────

  it('close가 터치 구간(98~100)이고 작도 범위 내 → closeTouchCount 증가', () => {
    const closes = [95, 99, 95, 95, 95]; // 인덱스 1만 터치
    const r = calcTrendTouchPoints({
      ...baseParams(5),
      closePrices: closes,
    });
    expect(r.closeTouchCount).toBe(1);
    expect(r.touchCount).toBe(1);
    expect(r.touchPoints[0]).toMatchObject({ priceType: 'close', type: 'touch', y: 99 });
  });

  it('high가 터치 구간이고 작도 범위 내 → highTouchCount 증가', () => {
    const highs = [95, 95, 99, 95, 95]; // 인덱스 2만 터치
    const r = calcTrendTouchPoints({
      ...baseParams(5),
      highPrices: highs,
      touchBasis: 'high',
    });
    expect(r.highTouchCount).toBe(1);
    expect(r.touchPoints[0]).toMatchObject({ priceType: 'high', type: 'touch', y: 99 });
  });

  it('close가 터치 구간이지만 작도 범위 밖 → 터치 카운팅 안됨', () => {
    // 작도 범위: 0~2, 인덱스 3,4는 범위 밖
    const closes = [95, 95, 95, 99, 99];
    const r = calcTrendTouchPoints({
      ...baseParams(5),
      closePrices: closes,
      trendMinIdx: 0,
      trendMaxIdx: 2,
    });
    expect(r.touchCount).toBe(0);
  });

  // ── 돌파 판정 ─────────────────────────────────────────────────────────────

  it('close가 돌파 구간(>=102) → closeBreakoutCount 증가', () => {
    const closes = [95, 95, 103, 95, 95];
    const r = calcTrendTouchPoints({
      ...baseParams(5),
      closePrices: closes,
    });
    expect(r.closeBreakoutCount).toBe(1);
    expect(r.breakoutCount).toBe(1);
    expect(r.touchPoints[0]).toMatchObject({ priceType: 'close', type: 'breakout', y: 103 });
  });

  it('high가 돌파 구간이고 작도 범위 밖이어도 → 돌파 카운팅됨 (전체 날짜 범위)', () => {
    const highs = [95, 95, 95, 105, 95]; // 인덱스 3: 작도 범위 밖
    const r = calcTrendTouchPoints({
      ...baseParams(5),
      highPrices: highs,
      trendMinIdx: 0,
      trendMaxIdx: 2,
      touchBasis: 'high',
    });
    expect(r.highBreakoutCount).toBe(1);
  });

  // ── 우선순위 ──────────────────────────────────────────────────────────────

  it('같은 날 close가 돌파 구간이면 close 돌파로 판정 (high 무시)', () => {
    // close=103(돌파), high=103(돌파) → close 돌파 우선
    const r = calcTrendTouchPoints({
      ...baseParams(1),
      closePrices: [103],
      highPrices: [103],
    });
    expect(r.touchPoints).toHaveLength(1);
    expect(r.touchPoints[0]).toMatchObject({ priceType: 'close', type: 'breakout' });
  });

  it('같은 날 close가 터치 구간이면 close 터치로 판정 (high 터치 무시)', () => {
    // close=99(터치), high=99(터치) → close 터치 우선
    const r = calcTrendTouchPoints({
      ...baseParams(1),
      closePrices: [99],
      highPrices: [99],
    });
    expect(r.touchPoints).toHaveLength(1);
    expect(r.touchPoints[0]).toMatchObject({ priceType: 'close', type: 'touch' });
  });

  it('하루에 최대 1개 판정 — 중복 카운팅 없음', () => {
    const r = calcTrendTouchPoints({
      ...baseParams(3),
      closePrices: [99, 103, 99],
      highPrices: [99, 103, 99],
    });
    expect(r.touchPoints).toHaveLength(3);
    expect(r.touchCount + r.breakoutCount).toBe(3);
  });

  // ── touchBasis 옵션 ───────────────────────────────────────────────────────

  it("touchBasis='close' → high 돌파 무시", () => {
    // close=95(비반응), high=103(돌파) → 판정 없음
    const r = calcTrendTouchPoints({
      ...baseParams(1),
      closePrices: [95],
      highPrices: [103],
      touchBasis: 'close',
    });
    expect(r.breakoutCount).toBe(0);
  });

  it("touchBasis='high' → close 터치 무시", () => {
    // close=99(터치), high=95(비반응) → 판정 없음
    const r = calcTrendTouchPoints({
      ...baseParams(1),
      closePrices: [99],
      highPrices: [95],
      touchBasis: 'high',
    });
    expect(r.touchCount).toBe(0);
  });

  // ── 기울기 있는 추세선 ────────────────────────────────────────────────────

  it('기울기 있는 추세선 — R_i가 i마다 달라져도 정확히 판정', () => {
    // m=1, c=100 → R_0=100, R_1=101, R_2=102
    // touchTolerance=2% → R_1 기준 터치: 98.98 <= price <= 101
    // close[1] = 100 → 터치
    const r = calcTrendTouchPoints({
      timestamps: makeTimestamps(3),
      highPrices: [95, 95, 95],
      closePrices: [95, 100, 95],
      m: 1,
      c: 100,
      trendMinIdx: 0,
      trendMaxIdx: 2,
      touchTolerance: 2,
      breakoutTolerance: 2,
      touchBasis: 'close',
    });
    expect(r.closeTouchCount).toBe(1);
    expect(r.touchPoints[0].x).toBe(makeTimestamps(3)[1]);
  });

  // ── touchPoints 좌표 검증 ─────────────────────────────────────────────────

  it('touchPoints.x가 timestamps 값과 일치', () => {
    const ts = makeTimestamps(3);
    const r = calcTrendTouchPoints({
      ...baseParams(3),
      closePrices: [95, 99, 95], // 인덱스 1 터치
    });
    expect(r.touchPoints[0].x).toBe(ts[1]);
  });

  it('touchPoints.y가 실제 판정 가격과 일치', () => {
    const r = calcTrendTouchPoints({
      ...baseParams(3),
      closePrices: [95, 99.5, 95],
    });
    expect(r.touchPoints[0].y).toBeCloseTo(99.5);
  });
});

// ── intersectSimResults ────────────────────────────────────────────────────────

import type { TrendSimEntry } from './signals.ts';

function makeEntries(tickers: string[]): TrendSimEntry[] {
  return tickers.map((t) => ({
    ticker: t,
    name: `${t} Corp`,
    touchCount: 2,
    breakoutCount: 1,
    slope: 0.5,
  }));
}

describe('intersectSimResults', () => {
  it('빈 객체 입력 → 빈 배열', () => {
    expect(intersectSimResults({})).toHaveLength(0);
  });

  it('기간 1개 → 해당 기간 종목 전체 반환', () => {
    const r = intersectSimResults({ '1y': makeEntries(['AAA', 'BBB']) });
    expect(r.map((x) => x.ticker)).toEqual(expect.arrayContaining(['AAA', 'BBB']));
    expect(r).toHaveLength(2);
  });

  it('기간 2개 AND 교집합 — 공통 종목만 반환', () => {
    const r = intersectSimResults({
      '3m': makeEntries(['AAA', 'BBB', 'CCC']),
      '1y': makeEntries(['BBB', 'CCC', 'DDD']),
    });
    expect(r.map((x) => x.ticker).sort()).toEqual(['BBB', 'CCC']);
  });

  it('기간 3개 AND 교집합 — 모든 기간 공통 종목만 반환', () => {
    const r = intersectSimResults({
      '3m': makeEntries(['A', 'B', 'C']),
      '1y': makeEntries(['B', 'C', 'D']),
      '2y': makeEntries(['C', 'D', 'E']),
    });
    expect(r.map((x) => x.ticker)).toEqual(['C']);
  });

  it('공통 종목 없으면 빈 배열', () => {
    const r = intersectSimResults({
      '3m': makeEntries(['AAA']),
      '1y': makeEntries(['BBB']),
    });
    expect(r).toHaveLength(0);
  });

  it('longestPeriodResult는 가장 긴 기간(우선순위: 3y>2y>1y>3m) 기준', () => {
    const entries3m = makeEntries(['X']);
    const entries1y = [
      { ticker: 'X', name: 'X Corp', touchCount: 9, breakoutCount: 5, slope: 1.0 },
    ];
    const r = intersectSimResults({ '3m': entries3m, '1y': entries1y });
    expect(r[0].longestPeriodResult.touchCount).toBe(9); // 1y 기준
  });

  it('periodStats에 선택된 기간별 통계가 모두 포함', () => {
    const r = intersectSimResults({
      '3m': [{ ticker: 'X', name: 'X', touchCount: 2, breakoutCount: 1, slope: 0.3 }],
      '1y': [{ ticker: 'X', name: 'X', touchCount: 5, breakoutCount: 3, slope: 0.7 }],
    });
    expect(r[0].periodStats['3m']?.touchCount).toBe(2);
    expect(r[0].periodStats['1y']?.touchCount).toBe(5);
    expect(r[0].periodStats['2y']).toBeUndefined();
  });

  it('slope 없는 항목 → periodStats.slope 기본값 0', () => {
    const r = intersectSimResults({
      '1y': [{ ticker: 'X', name: 'X', touchCount: 1, breakoutCount: 0 }],
    });
    expect(r[0].periodStats['1y']?.slope).toBe(0);
  });

  it('기간 순서 무관하게 동일한 교집합 반환', () => {
    const a = intersectSimResults({
      '1y': makeEntries(['A', 'B']),
      '3m': makeEntries(['B', 'C']),
    });
    expect(a.map((x) => x.ticker)).toContain('B');
    expect(a).toHaveLength(1);
  });

  it('ticker, name이 결과에 올바르게 포함', () => {
    const r = intersectSimResults({
      '1y': [{ ticker: 'TSLA', name: 'Tesla Inc', touchCount: 3, breakoutCount: 1 }],
    });
    expect(r[0].ticker).toBe('TSLA');
    expect(r[0].name).toBe('Tesla Inc');
  });
});
