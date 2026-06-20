import type {
 calcMA ,
  OHLCBar,
  calcEMA,
  calcRSI,
  calcATR,
  calcOBV,
  calcMDD,
  calcROC,
  calcMACD,
  type OHLCV,
  calcBollingerBands } from './indicators.ts';

import { it, expect, describe } from 'vitest';


// ── 테스트용 헬퍼 ─────────────────────────────────────────────────────────────

/** 일정 간격의 종가 배열 생성 */
function makeCloses(values: number[]): number[] {
  return values;
}

/** 단순 OHLCV 생성 (high=close+1, low=close-1, open=close, volume=1000) */
function makeOHLCV(closes: number[]): OHLCV[] {
  return closes.map((c, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 1000,
  }));
}

// ── calcMA ────────────────────────────────────────────────────────────────────

describe('calcMA', () => {
  it('period 미만 구간은 null을 반환한다', () => {
    const closes = makeCloses([10, 20, 30, 40, 50]);
    const result = calcMA(closes, 3);

    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('period 이상 구간에서 올바른 평균을 계산한다', () => {
    const closes = makeCloses([10, 20, 30, 40, 50]);
    const result = calcMA(closes, 3);

    // index 2: (10+20+30)/3 = 20
    expect(result[2]).toBe(20);
    // index 4: (30+40+50)/3 = 40
    expect(result[4]).toBe(40);
  });

  it('period=1이면 종가 자체를 반환한다', () => {
    const closes = makeCloses([10, 20, 30]);
    const result = calcMA(closes, 1);

    expect(result).toEqual([10, 20, 30]);
  });

  it('데이터가 period보다 짧으면 전부 null이다', () => {
    const result = calcMA([10, 20], 5);
    expect(result.every((v) => v === null)).toBe(true);
  });
});

// ── calcEMA ───────────────────────────────────────────────────────────────────

describe('calcEMA', () => {
  it('period 미만 구간은 null을 반환한다', () => {
    const closes = makeCloses([10, 20, 30, 40, 50]);
    const result = calcEMA(closes, 3);

    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('첫 EMA 값은 첫 period 개의 단순 평균이다', () => {
    const closes = makeCloses([10, 20, 30, 40, 50]);
    const result = calcEMA(closes, 3);

    // index 2: (10+20+30)/3 = 20
    expect(result[2]).toBe(20);
  });

  it('이후 EMA는 이전 EMA보다 현재값에 더 가깝게 이동한다', () => {
    // 급등 케이스: 이전 EMA보다 현재 EMA가 높아야 함
    const closes = makeCloses([10, 10, 10, 100]);
    const result = calcEMA(closes, 3);

    const ema2 = result[2] as number; // (10+10+10)/3 = 10
    const ema3 = result[3] as number;
    expect(ema3).toBeGreaterThan(ema2);
  });

  it('결과 배열 길이는 입력과 동일하다', () => {
    const closes = makeCloses([1, 2, 3, 4, 5, 6, 7]);
    const result = calcEMA(closes, 3);
    expect(result).toHaveLength(closes.length);
  });
});

// ── calcRSI ───────────────────────────────────────────────────────────────────

describe('calcRSI', () => {
  it('계속 상승하면 RSI가 높다 (> 70)', () => {
    // 14봉 + 여분: 꾸준히 상승
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const result = calcRSI(closes, 14);

    const last = result[result.length - 1] as number;
    expect(last).toBeGreaterThan(70);
  });

  it('계속 하락하면 RSI가 낮다 (< 30)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
    const result = calcRSI(closes, 14);

    const last = result[result.length - 1] as number;
    expect(last).toBeLessThan(30);
  });

  it('RSI 값은 0 ~ 100 범위다', () => {
    const closes = [100, 102, 99, 103, 98, 105, 97, 106, 95, 108, 93, 110, 90, 115, 85, 120];
    const result = calcRSI(closes, 14);

    result.forEach((v) => {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });

  it('데이터가 period + 1 미만이면 전부 null이다', () => {
    const result = calcRSI([100, 101, 102], 14);
    expect(result.every((v) => v === null)).toBe(true);
  });
});

// ── calcATR ───────────────────────────────────────────────────────────────────

describe('calcATR', () => {
  it('period 미만 구간은 null이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 20 }, (_, i) => 100 + i));
    const result = calcATR(ohlcv, 14);

    for (let i = 0; i < 14; i++) {
      expect(result[i]).toBeNull();
    }
  });

  it('ATR은 항상 양수다', () => {
    const ohlcv = makeOHLCV([
      100, 102, 98, 105, 95, 110, 90, 115, 85, 120, 80, 125, 75, 130, 70, 135,
    ]);
    const result = calcATR(ohlcv, 14);

    result.forEach((v) => {
      if (v !== null) expect(v).toBeGreaterThan(0);
    });
  });

  it('변동성이 클수록 ATR이 크다', () => {
    const stable = makeOHLCV(Array.from({ length: 20 }, () => 100));
    const volatile = Array.from(
      { length: 20 },
      (_, i): OHLCV => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100,
        high: 120,
        low: 80,
        close: 100,
        volume: 1000,
      })
    );

    const atrStable = calcATR(stable, 14);
    const atrVolatile = calcATR(volatile, 14);

    const lastStable = atrStable.find((v) => v !== null) ?? 0;
    const lastVolatile = atrVolatile.find((v) => v !== null) ?? 0;

    expect(lastVolatile).toBeGreaterThan(lastStable);
  });

  it('결과 배열 길이는 입력과 동일하다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 20 }, (_, i) => 100 + i));
    const result = calcATR(ohlcv, 14);
    expect(result).toHaveLength(ohlcv.length);
  });
});

// ── calcOBV ───────────────────────────────────────────────────────────────────

describe('calcOBV', () => {
  it('가격 상승 시 OBV가 증가한다', () => {
    const closes = [100, 110, 120];
    const volumes = [1000, 2000, 3000];
    const result = calcOBV(closes, volumes);

    expect(result[1]).toBe(2000);
    expect(result[2]).toBe(5000);
  });

  it('가격 하락 시 OBV가 감소한다', () => {
    const closes = [120, 110, 100];
    const volumes = [1000, 2000, 3000];
    const result = calcOBV(closes, volumes);

    expect(result[1]).toBe(-2000);
    expect(result[2]).toBe(-5000);
  });

  it('가격 동일 시 OBV가 변하지 않는다', () => {
    const closes = [100, 100, 100];
    const volumes = [1000, 2000, 3000];
    const result = calcOBV(closes, volumes);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  it('첫 봉의 OBV는 항상 0이다', () => {
    const result = calcOBV([100], [9999]);
    expect(result[0]).toBe(0);
  });
});

// ── calcMDD ───────────────────────────────────────────────────────────────────

describe('calcMDD', () => {
  it('계속 상승하면 MDD는 0이다', () => {
    const closes = [100, 110, 120, 130, 140];
    expect(calcMDD(closes)).toBe(0);
  });

  it('최고점 이후 50% 하락 시 MDD는 -50이다', () => {
    const closes = [100, 200, 100];
    expect(calcMDD(closes)).toBe(-50);
  });

  it('빈 배열이면 0을 반환한다', () => {
    expect(calcMDD([])).toBe(0);
  });

  it('MDD는 항상 0 이하다', () => {
    const closes = [100, 90, 110, 80, 120, 70];
    expect(calcMDD(closes)).toBeLessThanOrEqual(0);
  });
});

// ── calcBollingerBands ────────────────────────────────────────────────────────

describe('calcBollingerBands', () => {
  it('period 미만 구간은 전부 null이다', () => {
    const closes = makeCloses([10, 20, 30]);
    const result = calcBollingerBands(closes, 20);

    expect(result[0]).toEqual({ upper: null, mid: null, lower: null, width: null });
  });

  it('upper > mid > lower 순서를 유지한다', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = calcBollingerBands(closes, 20, 2);

    result.forEach((pt) => {
      if (pt.upper !== null && pt.mid !== null && pt.lower !== null) {
        expect(pt.upper).toBeGreaterThan(pt.mid);
        expect(pt.mid).toBeGreaterThan(pt.lower);
      }
    });
  });

  it('변동성이 없으면 upper = lower (밴드폭 0)', () => {
    const closes = Array.from({ length: 25 }, () => 100);
    const result = calcBollingerBands(closes, 20);

    const last = result[result.length - 1];
    expect(last.upper).toBe(last.lower);
    expect(last.width).toBe(0);
  });
});

// ── calcMACD ──────────────────────────────────────────────────────────────────

describe('calcMACD', () => {
  it('EMA26 이전 구간은 macd가 null이다', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcMACD(closes);

    expect(result[0]!.macd).toBeNull();
    expect(result[24]!.macd).toBeNull();
    expect(result[25]!.macd).not.toBeNull();
  });

  it('상승 추세에서 MACD 선은 양수다', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 3);
    const result = calcMACD(closes);

    const last = result[result.length - 1]!;
    expect(last.macd).not.toBeNull();
    expect(last.macd!).toBeGreaterThan(0);
  });

  it('histogram = macd - signal이다', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 20 + i);
    const result = calcMACD(closes);

    result.forEach((pt) => {
      if (pt.macd !== null && pt.signal !== null && pt.histogram !== null) {
        expect(pt.histogram).toBeCloseTo(pt.macd - pt.signal, 3);
      }
    });
  });
});

// ── calcROC ───────────────────────────────────────────────────────────────────

describe('calcROC', () => {
  it('period 미만 구간은 null이다', () => {
    const closes = makeCloses([100, 110, 120]);
    const result = calcROC(closes, 5);

    expect(result.every((v) => v === null)).toBe(true);
  });

  it('가격이 두 배가 되면 ROC는 100이다', () => {
    const closes = [100, 100, 100, 100, 100, 200];
    const result = calcROC(closes, 5);

    expect(result[5]).toBe(100);
  });

  it('가격이 절반이 되면 ROC는 -50이다', () => {
    const closes = [200, 200, 200, 200, 200, 100];
    const result = calcROC(closes, 5);

    expect(result[5]).toBe(-50);
  });
});

// ── calcStochastic ────────────────────────────────────────────────────────────

import {
  calcADX,
  calcMFI,
  calcEnvelope,
  calcStochastic,
  calcSupertrend,
  calcTrendlines,
  convertToWeeklyBars,
  calcDonchianChannels,
  calcSupportResistance,
  calcLinearRegressionChannel,
 calcZigZagSupportResistance } from './indicators.ts';

describe('calcStochastic', () => {
  it('결과 배열 길이는 입력과 동일하다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 25 }, (_, i) => 100 + i));
    const result = calcStochastic(ohlcv);
    expect(result).toHaveLength(ohlcv.length);
  });

  it('kPeriod 미만 구간은 k, d 모두 null이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 25 }, (_, i) => 100 + i));
    const result = calcStochastic(ohlcv, 14, 3, 3);
    expect(result[0]!.k).toBeNull();
    expect(result[0]!.d).toBeNull();
  });

  it('k, d 값은 0 ~ 100 범위다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 4) * 20));
    const result = calcStochastic(ohlcv, 14, 3, 3);
    result.forEach((pt) => {
      if (pt.k !== null) {
        expect(pt.k).toBeGreaterThanOrEqual(0);
        expect(pt.k).toBeLessThanOrEqual(100);
      }
      if (pt.d !== null) {
        expect(pt.d).toBeGreaterThanOrEqual(0);
        expect(pt.d).toBeLessThanOrEqual(100);
      }
    });
  });

  it('고가=저가인 봉은 k=50을 반환한다 (분모 0 처리)', () => {
    // 모든 봉의 high=low=close → 분모 0
    const flatOHLCV: OHLCV[] = Array.from({ length: 25 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000,
    }));
    const result = calcStochastic(flatOHLCV, 14, 1, 1);
    const valid = result.filter((pt) => pt.k !== null);
    valid.forEach((pt) => expect(pt.k).toBe(50));
  });
});

// ── calcADX ───────────────────────────────────────────────────────────────────

describe('calcADX', () => {
  it('결과 배열 길이는 입력과 동일하다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(calcADX(ohlcv, 14)).toHaveLength(ohlcv.length);
  });

  it('데이터가 period*2+1 미만이면 전부 null이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 10 }, () => 100));
    const result = calcADX(ohlcv, 14);
    result.forEach((pt) => {
      expect(pt.adx).toBeNull();
      expect(pt.plusDI).toBeNull();
      expect(pt.minusDI).toBeNull();
    });
  });

  it('강한 상승 추세에서 +DI > -DI이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 50 }, (_, i) => 100 + i * 3));
    const result = calcADX(ohlcv, 14);
    const last = result[result.length - 1]!;
    if (last.plusDI !== null && last.minusDI !== null) {
      expect(last.plusDI).toBeGreaterThan(last.minusDI);
    }
  });

  it('ADX 값은 0 ~ 100 범위다', () => {
    const ohlcv = makeOHLCV(
      Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 15 + i * 0.5)
    );
    const result = calcADX(ohlcv, 14);
    result.forEach((pt) => {
      if (pt.adx !== null) {
        expect(pt.adx).toBeGreaterThanOrEqual(0);
        expect(pt.adx).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ── calcMFI ───────────────────────────────────────────────────────────────────

describe('calcMFI', () => {
  it('결과 배열 길이는 입력과 동일하다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(calcMFI(ohlcv, 14)).toHaveLength(ohlcv.length);
  });

  it('period 미만 구간은 null이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 20 }, (_, i) => 100 + i));
    const result = calcMFI(ohlcv, 14);
    for (let i = 0; i < 14; i++) expect(result[i]).toBeNull();
  });

  it('MFI 값은 0 ~ 100 범위다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10));
    const result = calcMFI(ohlcv, 14);
    result.forEach((v) => {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });

  it('음의 거래량이 0이면 MFI = 100이다', () => {
    // 모든 봉이 상승 → negMF = 0 → MFI = 100
    const ohlcv: OHLCV[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i + 1,
      volume: 1000,
    }));
    const result = calcMFI(ohlcv, 14);
    const last = result[result.length - 1];
    expect(last).toBe(100);
  });
});

// ── calcSupertrend ────────────────────────────────────────────────────────────

describe('calcSupertrend', () => {
  it('결과 배열 길이는 입력과 동일하다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 25 }, (_, i) => 100 + i));
    expect(calcSupertrend(ohlcv, 10, 3)).toHaveLength(ohlcv.length);
  });

  it('ATR period 이전 구간은 supertrend가 null이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 25 }, (_, i) => 100 + i));
    const result = calcSupertrend(ohlcv, 10, 3);
    expect(result[0]!.supertrend).toBeNull();
    expect(result[9]!.supertrend).toBeNull();
  });

  it('direction은 bullish 또는 bearish 중 하나다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 5) * 15));
    const result = calcSupertrend(ohlcv, 10, 3);
    result.forEach((pt) => {
      if (pt.direction !== null) {
        expect(['bullish', 'bearish']).toContain(pt.direction);
      }
    });
  });

  it('강한 상승 추세에서 direction은 bullish이다', () => {
    const ohlcv = makeOHLCV(Array.from({ length: 40 }, (_, i) => 100 + i * 5));
    const result = calcSupertrend(ohlcv, 10, 3);
    const last = result[result.length - 1]!;
    expect(last.direction).toBe('bullish');
  });
});

// ── calcEnvelope, calcDonchianChannels ────────────────────────────────────────

describe('calcEnvelope', () => {
  it('period 미만 구간은 null이다', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcEnvelope(closes, 20);
    expect(result[0]).toEqual({ upper: null, mid: null, lower: null });
  });

  it('upper > mid > lower 순서를 유지한다', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcEnvelope(closes, 20, 0.1);
    result.forEach((pt) => {
      if (pt.upper !== null && pt.mid !== null && pt.lower !== null) {
        expect(pt.upper).toBeGreaterThan(pt.mid);
        expect(pt.mid).toBeGreaterThan(pt.lower);
      }
    });
  });

  it('percent=0.1이면 upper = mid * 1.1이다', () => {
    const closes = Array.from({ length: 25 }, () => 100);
    const result = calcEnvelope(closes, 20, 0.1);
    const last = result[result.length - 1];
    expect(last.upper).toBeCloseTo(110, 1);
    expect(last.lower).toBeCloseTo(90, 1);
  });
});

// ── calcSupportResistance ─────────────────────────────────────────────────────

describe('calcSupportResistance', () => {
  const n = 30;
  const highs = Array.from({ length: n }, (_, i) => 105 + Math.sin(i * 0.5) * 5);
  const lows = Array.from({ length: n }, (_, i) => 95 + Math.sin(i * 0.5) * 5);
  const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.5) * 3);
  const opens = closes.map((c) => c * 0.99);

  it('빈 배열 → 빈 배열', () => {
    expect(calcSupportResistance([], [], [], [])).toHaveLength(0);
  });

  it('결과 길이 = 입력 길이', () => {
    const result = calcSupportResistance(highs, lows, closes, opens);
    expect(result).toHaveLength(n);
  });

  it('각 결과에 support, resistance 필드 존재', () => {
    const result = calcSupportResistance(highs, lows, closes, opens);
    result.forEach((pt) => {
      expect('support' in pt).toBe(true);
      expect('resistance' in pt).toBe(true);
    });
  });

  it('데이터 1개 → 길이 1 결과 반환', () => {
    const result = calcSupportResistance([105], [95], [100], [99]);
    expect(result).toHaveLength(1);
  });
});

// ── calcTrendlines ────────────────────────────────────────────────────────────

describe('calcTrendlines', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(calcTrendlines([], [])).toHaveLength(0);
  });

  it('1개 → up/down=null', () => {
    const result = calcTrendlines([105], [95]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ up: null, down: null });
  });

  it('결과 길이 = 입력 길이', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 100 + i * 0.5);
    const lows = Array.from({ length: n }, (_, i) => 95 + i * 0.5);
    const result = calcTrendlines(highs, lows);
    expect(result).toHaveLength(n);
  });

  it('각 결과에 up, down 필드 존재', () => {
    const highs = [105, 103, 107, 102, 108];
    const lows = [95, 97, 93, 98, 92];
    const result = calcTrendlines(highs, lows);
    result.forEach((pt) => {
      expect('up' in pt).toBe(true);
      expect('down' in pt).toBe(true);
    });
  });

  it('단조 상승 데이터 → up trendline 존재', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 100 + i * 2);
    const lows = Array.from({ length: n }, (_, i) => 95 + i * 2);
    const result = calcTrendlines(highs, lows);
    const hasUp = result.some((pt) => pt.up !== null);
    expect(hasUp).toBe(true);
  });
});

// ── calcLinearRegressionChannel ───────────────────────────────────────────────

describe('calcLinearRegressionChannel', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(calcLinearRegressionChannel([])).toHaveLength(0);
  });

  it('결과 길이 = 입력 길이', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calcLinearRegressionChannel(prices);
    expect(result).toHaveLength(20);
  });

  it('각 결과에 support, resistance 필드 존재', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calcLinearRegressionChannel(prices);
    result.forEach((pt) => {
      expect('support' in pt).toBe(true);
      expect('resistance' in pt).toBe(true);
    });
  });

  it('단조 상승 → resistance >= support', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcLinearRegressionChannel(prices);
    result.forEach((pt) => {
      if (pt.resistance !== null && pt.support !== null) {
        expect(pt.resistance).toBeGreaterThanOrEqual(pt.support);
      }
    });
  });

  it('stdDevMultiplier 파라미터 적용', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const r1 = calcLinearRegressionChannel(prices, 1.0);
    const r2 = calcLinearRegressionChannel(prices, 3.0);
    // 배수가 클수록 채널이 넓어짐
    const last1 = r1[r1.length - 1];
    const last2 = r2[r2.length - 1];
    if (last1.resistance !== null && last2.resistance !== null) {
      expect(last2.resistance).toBeGreaterThanOrEqual(last1.resistance);
    }
  });
});

// ── calcZigZagSupportResistance ───────────────────────────────────────────────

describe('calcZigZagSupportResistance', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(calcZigZagSupportResistance([], [], [], [])).toHaveLength(0);
  });

  it('결과 길이 = 입력 길이', () => {
    const n = 30;
    const h = Array.from({ length: n }, (_, i) => 105 + Math.sin(i * 0.5) * 5);
    const l = Array.from({ length: n }, (_, i) => 95 + Math.sin(i * 0.5) * 5);
    const c = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.5) * 3);
    const o = c.map((v) => v * 0.99);
    const result = calcZigZagSupportResistance(h, l, c, o);
    expect(result).toHaveLength(n);
  });

  it('각 결과에 support, resistance 필드 존재', () => {
    const n = 20;
    const h = Array.from({ length: n }, (_, i) => 105 + i * 0.5);
    const l = Array.from({ length: n }, (_, i) => 95 + i * 0.5);
    const c = Array.from({ length: n }, (_, i) => 100 + i * 0.5);
    const o = c.map((v) => v * 0.99);
    const result = calcZigZagSupportResistance(h, l, c, o);
    result.forEach((pt) => {
      expect('support' in pt).toBe(true);
      expect('resistance' in pt).toBe(true);
    });
  });

  it('reversalPercent 파라미터 적용 → crash 없음', () => {
    const n = 15;
    const h = Array.from({ length: n }, () => 105);
    const l = Array.from({ length: n }, () => 95);
    const c = Array.from({ length: n }, () => 100);
    const o = Array.from({ length: n }, () => 99);
    expect(() => calcZigZagSupportResistance(h, l, c, o, 5)).not.toThrow();
  });
});

// ── calcEnvelope ──────────────────────────────────────────────────────────────

describe('calcEnvelope', () => {
  it('period 미만 구간 → null', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcEnvelope(closes, 20);
    expect(result[0]).toEqual({ upper: null, mid: null, lower: null });
  });

  it('충분한 데이터 → upper >= mid >= lower', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calcEnvelope(closes, 20, 0.1);
    result.forEach((pt) => {
      if (pt.upper !== null && pt.mid !== null && pt.lower !== null) {
        expect(pt.upper).toBeGreaterThanOrEqual(pt.mid);
        expect(pt.mid).toBeGreaterThanOrEqual(pt.lower);
      }
    });
  });

  it('결과 길이 = 입력 길이', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(calcEnvelope(closes, 20)).toHaveLength(30);
  });

  it('percent 파라미터: 클수록 채널 넓어짐', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r1 = calcEnvelope(closes, 20, 0.05);
    const r2 = calcEnvelope(closes, 20, 0.2);
    const last1 = r1[r1.length - 1];
    const last2 = r2[r2.length - 1];
    if (last1.upper !== null && last2.upper !== null) {
      expect(last2.upper).toBeGreaterThan(last1.upper);
    }
  });
});

describe('calcDonchianChannels', () => {
  it('period 미만 구간은 null이다', () => {});

  it('upper는 기간 내 최고가, lower는 최저가다', () => {
    // 21개 데이터, period=20 → 마지막 슬라이스 [1..20] = 95~190, lower=95
    const closes = [
      90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180,
      185, 190,
    ];
    const result = calcDonchianChannels(closes, 20);
    const last = result[result.length - 1];
    expect(last.upper).toBe(190);
    expect(last.lower).toBe(95); // index 1~20 슬라이스의 최솟값
  });

  it('upper >= mid >= lower 순서를 유지한다', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = calcDonchianChannels(closes, 20);
    result.forEach((pt) => {
      if (pt.upper !== null && pt.mid !== null && pt.lower !== null) {
        expect(pt.upper).toBeGreaterThanOrEqual(pt.mid);
        expect(pt.mid).toBeGreaterThanOrEqual(pt.lower);
      }
    });
  });
});

// ── calcZigZagSupportResistance 추가 브랜치 커버 ─────────────────────────────

describe('calcZigZagSupportResistance 추가 브랜치', () => {
  it('단조 상승 → peaks/troughs 부족 시 안전 처리 커버', () => {
    // 단조 상승은 trough 없음 → peaks.length < 2 브랜치 커버
    const n = 30;
    const h = Array.from({ length: n }, (_, i) => 100 + i * 2);
    const l = Array.from({ length: n }, (_, i) => 95 + i * 2);
    const c = Array.from({ length: n }, (_, i) => 98 + i * 2);
    const o = Array.from({ length: n }, (_, i) => 97 + i * 2);
    const result = calcZigZagSupportResistance(h, l, c, o, 3);
    expect(result).toHaveLength(n);
  });

  it('지그재그 파동 데이터 → uniquePoints 중복 처리 브랜치 커버', () => {
    // 피크-트러프 반복 패턴
    const n = 40;
    const h = Array.from({ length: n }, (_, i) => (i % 10 < 5 ? 110 : 90));
    const l = Array.from({ length: n }, (_, i) => (i % 10 < 5 ? 100 : 80));
    const c = Array.from({ length: n }, (_, i) => (i % 10 < 5 ? 105 : 85));
    const o = Array.from({ length: n }, (_, i) => (i % 10 < 5 ? 102 : 82));
    const result = calcZigZagSupportResistance(h, l, c, o, 3);
    expect(result).toHaveLength(n);
    result.forEach((pt) => {
      expect('support' in pt).toBe(true);
      expect('resistance' in pt).toBe(true);
    });
  });
});

// ── convertToWeeklyBars ───────────────────────────────────────────────────────


function bar(date: string, open: number, high: number, low: number, close: number): OHLCBar {
  return { date, open, high, low, close };
}

describe('convertToWeeklyBars', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(convertToWeeklyBars([])).toHaveLength(0);
  });

  it('단일 거래일 → 단일 주봉', () => {
    const result = convertToWeeklyBars([bar('2025-01-06', 100, 110, 95, 105)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      date: '2025-01-06',
    });
  });

  it('같은 주 복수 일봉 → 단일 주봉으로 합산', () => {
    // 2025-01-06(월) ~ 2025-01-10(금)
    const daily = [
      bar('2025-01-06', 100, 110, 98, 105),
      bar('2025-01-07', 105, 115, 103, 112),
      bar('2025-01-08', 112, 120, 108, 118),
      bar('2025-01-09', 118, 122, 111, 115),
      bar('2025-01-10', 115, 119, 109, 113),
    ];
    const result = convertToWeeklyBars(daily);
    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(100); // 월요일 시가
    expect(result[0].high).toBe(122); // 주간 최고
    expect(result[0].low).toBe(98); // 주간 최저
    expect(result[0].close).toBe(113); // 금요일 종가
    expect(result[0].date).toBe('2025-01-10'); // 마지막 거래일
  });

  it('주 경계 → 2개 주봉으로 분리', () => {
    // 2025-01-10(금) 과 2025-01-13(월)은 다른 주
    const daily = [bar('2025-01-10', 100, 110, 95, 105), bar('2025-01-13', 106, 115, 104, 112)];
    const result = convertToWeeklyBars(daily);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2025-01-10');
    expect(result[1].date).toBe('2025-01-13');
  });

  it('연말-연초 경계 — 주차 계산 정확성', () => {
    // 2024-12-30(월)과 2025-01-02(목)는 ISO 기준 같은 주 (2025-W01)
    const daily = [bar('2024-12-30', 100, 105, 98, 103), bar('2025-01-02', 103, 108, 101, 107)];
    const result = convertToWeeklyBars(daily);
    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(107);
    expect(result[0].date).toBe('2025-01-02');
  });

  it('여러 주에 걸친 데이터 → 주 순서 오름차순 유지', () => {
    const daily = [
      bar('2025-01-06', 100, 110, 95, 105), // W02
      bar('2025-01-13', 106, 115, 104, 112), // W03
      bar('2025-01-20', 112, 120, 109, 118), // W04
    ];
    const result = convertToWeeklyBars(daily);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2025-01-06');
    expect(result[1].date).toBe('2025-01-13');
    expect(result[2].date).toBe('2025-01-20');
  });

  it('주봉 고가/저가가 해당 주 전체 일봉의 최대/최소와 일치', () => {
    const daily = [
      bar('2025-01-06', 100, 108, 97, 105),
      bar('2025-01-07', 105, 112, 99, 110),
      bar('2025-01-08', 110, 125, 95, 120), // 이 날 고가 최대, 저가 최소
    ];
    const result = convertToWeeklyBars(daily);
    expect(result[0].high).toBe(125);
    expect(result[0].low).toBe(95);
  });

  it('기타 필드(volume 등) 첫 번째 일봉 기준으로 유지', () => {
    const daily = [
      { date: '2025-01-06', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
      { date: '2025-01-07', open: 105, high: 115, low: 103, close: 112, volume: 2000 },
    ];
    const result = convertToWeeklyBars(daily as OHLCBar[]);
    expect(result).toHaveLength(1);
    expect((result[0] as any).volume).toBe(1000); // 첫 일봉의 기타 필드 유지
  });
});

// ── convertToWeeklyBars: 날짜 스냅 동작 검증 ─────────────────────────────────
// (주봉 변환 후 날짜 배열을 이용한 스냅 함수의 기대 동작 확인)

describe('주봉 날짜 스냅 동작', () => {
  const weeklyDates = ['2025-01-10', '2025-01-17', '2025-01-24', '2025-01-31'];

  const snapUp = (d: string) =>
    weeklyDates.find((x) => x >= d) ?? weeklyDates[weeklyDates.length - 1];
  const snapDown = (d: string) => [...weeklyDates].reverse().find((x) => x <= d) ?? weeklyDates[0];

  it('이미 주봉 날짜면 그대로 반환 (snapUp)', () => {
    expect(snapUp('2025-01-17')).toBe('2025-01-17');
  });

  it('이미 주봉 날짜면 그대로 반환 (snapDown)', () => {
    expect(snapDown('2025-01-17')).toBe('2025-01-17');
  });

  it('주 중간 날짜(화요일) → 그 주 금요일로 올림 (snapUp)', () => {
    expect(snapUp('2025-01-14')).toBe('2025-01-17'); // 화요일 → 금요일
  });

  it('주 중간 날짜(화요일) → 이전 주 금요일로 내림 (snapDown)', () => {
    expect(snapDown('2025-01-14')).toBe('2025-01-10'); // 화요일 → 이전 금요일
  });

  it('주봉 최초일 이전 날짜 → 첫 주봉 날짜 (snapUp)', () => {
    expect(snapUp('2024-12-01')).toBe('2025-01-10');
  });

  it('주봉 최후일 이후 날짜 → 마지막 주봉 날짜 (snapDown)', () => {
    expect(snapDown('2026-01-01')).toBe('2025-01-31');
  });

  it('trendStartDate 스냅: 화요일 입력 → 그 주 포함 (올림)', () => {
    // trendStartDate = '2025-01-14'(화), effectiveTrendStart = '2025-01-17'(금)
    // dates.filter(d >= '2025-01-17') → ['2025-01-17', '2025-01-24', '2025-01-31']
    const effective = snapUp('2025-01-14');
    const included = weeklyDates.filter((d) => d >= effective);
    expect(included).toEqual(['2025-01-17', '2025-01-24', '2025-01-31']);
  });

  it('trendEndDate 스냅: 화요일 입력 → 이전 주까지만 포함 (내림)', () => {
    // trendEndDate = '2025-01-14'(화), effectiveTrendEnd = '2025-01-10'(금)
    // dates.filter(d <= '2025-01-10') → ['2025-01-10']
    const effective = snapDown('2025-01-14');
    const included = weeklyDates.filter((d) => d <= effective);
    expect(included).toEqual(['2025-01-10']);
  });
});
