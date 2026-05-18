import { describe, it, expect } from 'vitest';
import {
  calcMA,
  calcEMA,
  calcRSI,
  calcATR,
  calcOBV,
  calcMDD,
  calcBollingerBands,
  calcMACD,
  calcROC,
  type OHLCV,
} from './indicators.ts';

// ── 테스트용 헬퍼 ─────────────────────────────────────────────────────────────

/** 일정 간격의 종가 배열 생성 */
function makeCloses(values: number[]): number[] {
  return values;
}

/** 단순 OHLCV 생성 (high=close+1, low=close-1, open=close, volume=1000) */
function makeOHLCV(closes: number[]): OHLCV[] {
  return closes.map((c, i) => ({
    date:   `2024-01-${String(i + 1).padStart(2, '0')}`,
    open:   c,
    high:   c + 1,
    low:    c - 1,
    close:  c,
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
    expect(result.every(v => v === null)).toBe(true);
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

    result.forEach(v => {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });

  it('데이터가 period + 1 미만이면 전부 null이다', () => {
    const result = calcRSI([100, 101, 102], 14);
    expect(result.every(v => v === null)).toBe(true);
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
    const ohlcv = makeOHLCV([100, 102, 98, 105, 95, 110, 90, 115, 85, 120, 80, 125, 75, 130, 70, 135]);
    const result = calcATR(ohlcv, 14);

    result.forEach(v => {
      if (v !== null) expect(v).toBeGreaterThan(0);
    });
  });

  it('변동성이 클수록 ATR이 크다', () => {
    const stable   = makeOHLCV(Array.from({ length: 20 }, () => 100));
    const volatile = Array.from({ length: 20 }, (_, i): OHLCV => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100, high: 120, low: 80, close: 100, volume: 1000,
    }));

    const atrStable   = calcATR(stable, 14);
    const atrVolatile = calcATR(volatile, 14);

    const lastStable   = atrStable.find(v => v !== null) ?? 0;
    const lastVolatile = atrVolatile.find(v => v !== null) ?? 0;

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
    const closes  = [100, 110, 120];
    const volumes = [1000, 2000, 3000];
    const result  = calcOBV(closes, volumes);

    expect(result[1]).toBe(2000);
    expect(result[2]).toBe(5000);
  });

  it('가격 하락 시 OBV가 감소한다', () => {
    const closes  = [120, 110, 100];
    const volumes = [1000, 2000, 3000];
    const result  = calcOBV(closes, volumes);

    expect(result[1]).toBe(-2000);
    expect(result[2]).toBe(-5000);
  });

  it('가격 동일 시 OBV가 변하지 않는다', () => {
    const closes  = [100, 100, 100];
    const volumes = [1000, 2000, 3000];
    const result  = calcOBV(closes, volumes);

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

    result.forEach(pt => {
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

    result.forEach(pt => {
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

    expect(result.every(v => v === null)).toBe(true);
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

import { calcStochastic, calcADX, calcMFI, calcSupertrend } from './indicators.ts';

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
    const ohlcv = makeOHLCV(
      Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 4) * 20)
    );
    const result = calcStochastic(ohlcv, 14, 3, 3);
    result.forEach(pt => {
      if (pt.k !== null) { expect(pt.k).toBeGreaterThanOrEqual(0); expect(pt.k).toBeLessThanOrEqual(100); }
      if (pt.d !== null) { expect(pt.d).toBeGreaterThanOrEqual(0); expect(pt.d).toBeLessThanOrEqual(100); }
    });
  });

  it('고가=저가인 봉은 k=50을 반환한다 (분모 0 처리)', () => {
    // 모든 봉의 high=low=close → 분모 0
    const flatOHLCV: OHLCV[] = Array.from({ length: 25 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100, high: 100, low: 100, close: 100, volume: 1000,
    }));
    const result = calcStochastic(flatOHLCV, 14, 1, 1);
    const valid = result.filter(pt => pt.k !== null);
    valid.forEach(pt => expect(pt.k).toBe(50));
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
    result.forEach(pt => {
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
    result.forEach(pt => {
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
    const ohlcv = makeOHLCV(
      Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10)
    );
    const result = calcMFI(ohlcv, 14);
    result.forEach(v => {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });

  it('음의 거래량이 0이면 MFI = 100이다', () => {
    // 모든 봉이 상승 → negMF = 0 → MFI = 100
    const ohlcv: OHLCV[] = Array.from({ length: 20 }, (_, i) => ({
      date:   `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:   100 + i, high: 101 + i, low: 99 + i,
      close:  100 + i + 1, volume: 1000,
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
    const ohlcv = makeOHLCV(
      Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 5) * 15)
    );
    const result = calcSupertrend(ohlcv, 10, 3);
    result.forEach(pt => {
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

import { calcEnvelope, calcDonchianChannels } from './indicators.ts';

describe('calcEnvelope', () => {
  it('period 미만 구간은 null이다', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcEnvelope(closes, 20);
    expect(result[0]).toEqual({ upper: null, mid: null, lower: null });
  });

  it('upper > mid > lower 순서를 유지한다', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcEnvelope(closes, 20, 0.1);
    result.forEach(pt => {
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

describe('calcDonchianChannels', () => {
  it('period 미만 구간은 null이다', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcDonchianChannels(closes, 20);
    expect(result[0]).toEqual({ upper: null, mid: null, lower: null });
  });

  it('upper는 기간 내 최고가, lower는 최저가다', () => {
    // 21개 데이터, period=20 → 마지막 슬라이스 [1..20] = 95~190, lower=95
    const closes = [90, 95, 100, 105, 110, 115, 120, 125, 130, 135,
                    140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190];
    const result = calcDonchianChannels(closes, 20);
    const last = result[result.length - 1];
    expect(last.upper).toBe(190);
    expect(last.lower).toBe(95); // index 1~20 슬라이스의 최솟값
  });

  it('upper >= mid >= lower 순서를 유지한다', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = calcDonchianChannels(closes, 20);
    result.forEach(pt => {
      if (pt.upper !== null && pt.mid !== null && pt.lower !== null) {
        expect(pt.upper).toBeGreaterThanOrEqual(pt.mid);
        expect(pt.mid).toBeGreaterThanOrEqual(pt.lower);
      }
    });
  });
});
