/**
 * indicators.ts
 *
 * 순수 기술적 지표 계산 함수 모음.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 제공 지표:
 *   - MA         : 단순 이동평균 (SMA)
 *   - EMA        : 지수 이동평균
 *   - RSI        : Relative Strength Index (Wilder 방식)
 *   - MACD       : Moving Average Convergence Divergence
 *   - BB         : Bollinger Bands
 *   - ATR        : Average True Range
 *   - OBV        : On-Balance Volume
 *   - MDD        : Maximum Drawdown
 *   - Stochastic : Stochastic Oscillator (%K / %D)
 *   - ADX        : Average Directional Index (+DI / -DI / ADX)
 *   - ROC        : Rate of Change
 *   - MFI        : Money Flow Index (거래량 가중 RSI)
 *   - Supertrend : ATR 기반 동적 추세선
 */

// ── 공용 타입 ─────────────────────────────────────────────────────────────────

/** OHLCV 일봉 한 개 */
export interface OHLCV {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** MACD 한 봉의 계산 결과 */
export interface MACDPoint {
  macd:      number | null;   // MACD 선 (EMA12 - EMA26)
  signal:    number | null;   // 시그널 선 (MACD의 EMA9)
  histogram: number | null;   // 히스토그램 (MACD - Signal)
}

/** 볼린저밴드 한 봉의 계산 결과 */
export interface BBPoint {
  upper: number | null;   // 상단 밴드 (mid + k*σ)
  mid:   number | null;   // 중간선 (SMA)
  lower: number | null;   // 하단 밴드 (mid - k*σ)
  width: number | null;   // 밴드폭 (upper - lower) / mid, %
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

/** 소수점 d 자리 반올림 */
function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ── 1. MA (Simple Moving Average) ─────────────────────────────────────────────

/**
 * 단순 이동평균 (SMA).
 * period 미만 구간은 null.
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - 이동평균 기간
 * @returns (closes.length) 개의 number | null 배열
 */
export function calcMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const avg   = slice.reduce((s, v) => s + v, 0) / period;
    result.push(round(avg, 4));
  }
  return result;
}

// ── 2. EMA (Exponential Moving Average) ──────────────────────────────────────

/**
 * 지수 이동평균 (EMA).
 * 첫 period 개의 단순 평균을 초기값으로 사용 (표준 방식).
 * period 미만 구간은 null.
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - EMA 기간
 * @returns (closes.length) 개의 number | null 배열
 */
export function calcEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);   // smoothing factor

  let ema: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    const c = closes[i] as number;

    if (i < period - 1) {
      result.push(null);
      continue;
    }

    if (i === period - 1) {
      // 초기값: 첫 period 개의 단순 평균
      const init = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
      ema = init;
      result.push(round(ema, 4));
      continue;
    }

    ema = c * k + (ema as number) * (1 - k);
    result.push(round(ema, 4));
  }

  return result;
}

// ── 3. RSI (Wilder RSI) ───────────────────────────────────────────────────────

/**
 * RSI — Wilder 스무딩 방식 (TradingView 기본과 동일).
 *
 * 초기 avgGain / avgLoss 는 첫 period 개 변화량의 단순 평균,
 * 이후는 Wilder 스무딩: avgGain = (prevAvgGain * (period-1) + gain) / period
 *
 * period 이전 구간은 null.
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - RSI 기간 (기본 14)
 * @returns (closes.length) 개의 number | null 배열, 값 범위 0~100
 */
export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  // 변화량 계산
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push((closes[i] as number) - (closes[i - 1] as number));
  }

  // 초기 avgGain / avgLoss (첫 period 개)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i] as number;
    if (c > 0) avgGain += c;
    else        avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;

  const toRSI = (ag: number, al: number): number => {
    if (al === 0) return 100;
    const rs = ag / al;
    return round(100 - 100 / (1 + rs), 2);
  };

  result[period] = toRSI(avgGain, avgLoss);

  // Wilder 스무딩
  for (let i = period + 1; i < closes.length; i++) {
    const c    = changes[i - 1] as number;
    const gain = c > 0 ? c : 0;
    const loss = c < 0 ? Math.abs(c) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i] = toRSI(avgGain, avgLoss);
  }

  return result;
}

// ── 4. MACD ───────────────────────────────────────────────────────────────────

/**
 * MACD (12, 26, 9).
 *
 * MACD    = EMA(12) - EMA(26)
 * Signal  = EMA(9) of MACD
 * Histo   = MACD - Signal
 *
 * EMA26 이 채워지기 전(인덱스 < 25) 구간은 null.
 *
 * @param closes     - 종가 배열 (시간순)
 * @param fastPeriod - 단기 EMA 기간 (기본 12)
 * @param slowPeriod - 장기 EMA 기간 (기본 26)
 * @param signalPeriod - 시그널 EMA 기간 (기본 9)
 * @returns (closes.length) 개의 MACDPoint 배열
 */
export function calcMACD(
  closes:       number[],
  fastPeriod:   number = 12,
  slowPeriod:   number = 26,
  signalPeriod: number = 9,
): MACDPoint[] {
  const emaFast = calcEMA(closes, fastPeriod);
  const emaSlow = calcEMA(closes, slowPeriod);

  // MACD 선
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f === null || s === null) return null;
    return round(f - s, 4);
  });

  // Signal: macdLine 의 non-null 값만 EMA 계산
  // 인덱스 보존을 위해 별도 처리
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const macdValues: number[] = [];
  const macdIndices: number[] = [];
  macdLine.forEach((v, i) => {
    if (v !== null) {
      macdValues.push(v);
      macdIndices.push(i);
    }
  });

  const signalEMA = calcEMA(macdValues, signalPeriod);
  signalEMA.forEach((v, j) => {
    const origIdx = macdIndices[j];
    if (origIdx !== undefined) signalLine[origIdx] = v;
  });

  // 결과 조합
  return closes.map((_, i) => {
    const m = macdLine[i] ?? null;
    const s = signalLine[i] ?? null;
    const h = m !== null && s !== null ? round(m - s, 4) : null;
    return { macd: m, signal: s, histogram: h };
  });
}

// ── 5. Bollinger Bands ────────────────────────────────────────────────────────

/**
 * 볼린저밴드 (SMA ± k × 표준편차).
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - SMA 기간 (기본 20)
 * @param k      - 표준편차 배수 (기본 2)
 * @returns (closes.length) 개의 BBPoint 배열
 */
export function calcBollingerBands(
  closes: number[],
  period: number = 20,
  k:      number = 2,
): BBPoint[] {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, mid: null, lower: null, width: null };

    const slice = closes.slice(i - period + 1, i + 1);
    const mid   = slice.reduce((s, v) => s + v, 0) / period;

    // 표본 표준편차 (분모 N, TradingView 기본)
    const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
    const sigma    = Math.sqrt(variance);

    const upper = round(mid + k * sigma, 4);
    const lower = round(mid - k * sigma, 4);
    const width  = mid !== 0 ? round((upper - lower) / mid * 100, 2) : null;

    return { upper, mid: round(mid, 4), lower, width };
  });
}

// ── 6. ATR (Average True Range) ───────────────────────────────────────────────

/**
 * ATR — Wilder 스무딩 방식.
 *
 * True Range = max(high-low, |high-prevClose|, |low-prevClose|)
 * ATR(1) = 첫 period 개 TR의 단순 평균
 * 이후   = (prevATR * (period-1) + TR) / period
 *
 * 첫 봉(prevClose 없음)과 period 미만 구간은 null.
 *
 * @param ohlcv  - OHLCV 배열 (시간순)
 * @param period - ATR 기간 (기본 14)
 * @returns (ohlcv.length) 개의 number | null 배열
 */
export function calcATR(ohlcv: OHLCV[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(ohlcv.length).fill(null);
  if (ohlcv.length < period + 1) return result;

  // TR 계산
  const tr: number[] = [0];   // 인덱스 0은 prevClose 없어서 0으로 패딩
  for (let i = 1; i < ohlcv.length; i++) {
    const cur  = ohlcv[i] as OHLCV;
    const prev = ohlcv[i - 1] as OHLCV;
    const hl   = cur.high - cur.low;
    const hpc  = Math.abs(cur.high - prev.close);
    const lpc  = Math.abs(cur.low  - prev.close);
    tr.push(Math.max(hl, hpc, lpc));
  }

  // 초기 ATR: 인덱스 1~period 의 단순 평균
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    atr += tr[i] as number;
  }
  atr /= period;
  result[period] = round(atr, 4);

  // Wilder 스무딩
  for (let i = period + 1; i < ohlcv.length; i++) {
    atr = (atr * (period - 1) + (tr[i] as number)) / period;
    result[i] = round(atr, 4);
  }

  return result;
}

// ── 7. OBV (On-Balance Volume) ────────────────────────────────────────────────

/**
 * OBV — 가격 방향에 따른 거래량 누적.
 *
 * close > prevClose → OBV += volume
 * close < prevClose → OBV -= volume
 * close = prevClose → OBV 유지
 *
 * @param closes  - 종가 배열 (시간순)
 * @param volumes - 거래량 배열 (closes와 같은 길이)
 * @returns (closes.length) 개의 number 배열
 */
export function calcOBV(closes: number[], volumes: number[]): number[] {
  const result: number[] = [];
  let obv = 0;

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(0);
      continue;
    }
    const cur  = closes[i] as number;
    const prev = closes[i - 1] as number;
    const vol  = volumes[i] as number;

    if (cur > prev)       obv += vol;
    else if (cur < prev)  obv -= vol;
    // cur === prev: 변화 없음

    result.push(obv);
  }

  return result;
}

// ── 8. MDD (Maximum Drawdown) ─────────────────────────────────────────────────

/**
 * 기간 내 최대낙폭 (MDD).
 *
 * MDD = (최고점 - 최저점) / 최고점 × 100  (%)
 * 단, 최저점은 최고점 이후에 발생한 것만 집계 (순서 보장).
 *
 * @param closes - 종가 배열 (시간순)
 * @returns MDD 값 (% 음수 표현, e.g. -34.5)
 */
export function calcMDD(closes: number[]): number {
  if (closes.length === 0) return 0;

  let peak = closes[0] as number;
  let mdd  = 0;

  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (c - peak) / peak * 100;
    if (dd < mdd) mdd = dd;
  }

  return round(mdd, 2);
}

// ── 9. Stochastic Oscillator ──────────────────────────────────────────────────

/** Stochastic 한 봉의 계산 결과 */
export interface StochPoint {
  k: number | null;   // Fast %K: (종가 - N봉 최저) / (N봉 최고 - N봉 최저) × 100
  d: number | null;   // Slow %D: %K의 단순 이동평균 (smoothD)
}

/**
 * Stochastic Oscillator (%K / %D).
 *
 * Fast %K = (Close - Lowest_Low(kPeriod)) / (Highest_High(kPeriod) - Lowest_Low(kPeriod)) × 100
 * Slow %K = MA(Fast %K, smoothK)   ← 일반적으로 smoothK=3 (Slow Stochastic)
 * Slow %D = MA(Slow %K, smoothD)
 *
 * kPeriod 미만 구간은 null.
 * 값 범위: 0 ~ 100
 *
 * @param ohlcv   - OHLCV 배열 (시간순)
 * @param kPeriod - Fast %K 계산 기간 (기본 14)
 * @param smoothK - %K 스무딩 기간 (기본 3, Slow Stochastic)
 * @param smoothD - %D 스무딩 기간 (기본 3)
 */
export function calcStochastic(
  ohlcv:   OHLCV[],
  kPeriod: number = 14,
  smoothK: number = 3,
  smoothD: number = 3,
): StochPoint[] {
  const n = ohlcv.length;
  const result: StochPoint[] = new Array(n).fill(null).map(() => ({ k: null, d: null }));

  // Fast %K 계산
  const fastK: (number | null)[] = new Array(n).fill(null);
  for (let i = kPeriod - 1; i < n; i++) {
    const window = ohlcv.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...window.map(o => o.high));
    const lowest  = Math.min(...window.map(o => o.low));
    const denom   = highest - lowest;
    const cur     = ohlcv[i] as OHLCV;
    fastK[i] = denom === 0 ? 50 : round((cur.close - lowest) / denom * 100, 2);
  }

  // Slow %K = MA(fastK, smoothK)
  const slowK: (number | null)[] = new Array(n).fill(null);
  for (let i = kPeriod + smoothK - 2; i < n; i++) {
    const slice = fastK.slice(i - smoothK + 1, i + 1);
    const valid = slice.filter((v): v is number => v !== null);
    if (valid.length === smoothK) {
      slowK[i] = round(valid.reduce((s, v) => s + v, 0) / smoothK, 2);
    }
  }

  // Slow %D = MA(slowK, smoothD)
  for (let i = kPeriod + smoothK + smoothD - 3; i < n; i++) {
    const slice = slowK.slice(i - smoothD + 1, i + 1);
    const valid = slice.filter((v): v is number => v !== null);
    if (valid.length === smoothD) {
      const d = round(valid.reduce((s, v) => s + v, 0) / smoothD, 2);
      result[i] = { k: slowK[i] ?? null, d };
    } else {
      result[i] = { k: slowK[i] ?? null, d: null };
    }
  }

  return result;
}

// ── 10. ADX (Average Directional Index) ──────────────────────────────────────

/** ADX 한 봉의 계산 결과 */
export interface ADXPoint {
  adx:     number | null;   // Average Directional Index (추세 강도, 0~100)
  plusDI:  number | null;   // +DI (상승 방향 지수)
  minusDI: number | null;   // -DI (하락 방향 지수)
}

/**
 * ADX (Average Directional Index) — Wilder 스무딩 방식.
 *
 * +DM[i] = max(High[i] - High[i-1], 0)  if > max(Low[i-1] - Low[i], 0), else 0
 * -DM[i] = max(Low[i-1] - Low[i],   0)  if > max(High[i] - High[i-1], 0), else 0
 * TR[i]  = max(H-L, |H-PC|, |L-PC|)
 *
 * 초기값: 첫 period 개의 단순 합산
 * 이후  : Wilder 스무딩 (이전 × (period-1) + 현재) / period
 *
 * +DI = smoothed(+DM) / smoothed(TR) × 100
 * -DI = smoothed(-DM) / smoothed(TR) × 100
 * DX  = |+DI - -DI| / (+DI + -DI) × 100
 * ADX = Wilder_EMA(DX, period)  ← DX가 period 개 쌓인 이후부터
 *
 * ADX 해석: <20 횡보, 20~25 추세 형성 중, >25 추세장, >40 강한 추세
 *
 * @param ohlcv  - OHLCV 배열 (시간순)
 * @param period - ADX 기간 (기본 14)
 */
export function calcADX(ohlcv: OHLCV[], period: number = 14): ADXPoint[] {
  const n = ohlcv.length;
  const result: ADXPoint[] = new Array(n).fill(null).map(() => ({ adx: null, plusDI: null, minusDI: null }));

  if (n < period * 2 + 1) return result;

  // ── 1봉씩 +DM, -DM, TR 계산 ────────────────────────────────────────────
  const plusDMs:  number[] = [0];
  const minusDMs: number[] = [0];
  const trs:      number[] = [0];

  for (let i = 1; i < n; i++) {
    const cur  = ohlcv[i] as OHLCV;
    const prev = ohlcv[i - 1] as OHLCV;

    const upMove   = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const hl  = cur.high - cur.low;
    const hpc = Math.abs(cur.high - prev.close);
    const lpc = Math.abs(cur.low  - prev.close);
    trs.push(Math.max(hl, hpc, lpc));
  }

  // ── Wilder 스무딩 초기값: 1~period 단순 합산 ───────────────────────────
  let smPlusDM  = plusDMs.slice(1, period + 1).reduce((s, v) => s + v, 0);
  let smMinusDM = minusDMs.slice(1, period + 1).reduce((s, v) => s + v, 0);
  let smTR      = trs.slice(1, period + 1).reduce((s, v) => s + v, 0);

  // DX 배열 (ADX 계산에 사용)
  const dxArr: (number | null)[] = new Array(n).fill(null);

  const calcDIandDX = (idx: number): void => {
    const plusDI  = smTR > 0 ? round(smPlusDM  / smTR * 100, 2) : 0;
    const minusDI = smTR > 0 ? round(smMinusDM / smTR * 100, 2) : 0;
    const diSum   = plusDI + minusDI;
    const dx      = diSum > 0 ? round(Math.abs(plusDI - minusDI) / diSum * 100, 2) : 0;
    result[idx] = { adx: null, plusDI, minusDI };
    dxArr[idx]  = dx;
  };

  calcDIandDX(period);  // 첫 DI 값 (index = period)

  // ── Wilder 스무딩 반복 ──────────────────────────────────────────────────
  for (let i = period + 1; i < n; i++) {
    smPlusDM  = smPlusDM  - smPlusDM  / period + (plusDMs[i]  as number);
    smMinusDM = smMinusDM - smMinusDM / period + (minusDMs[i] as number);
    smTR      = smTR      - smTR      / period + (trs[i]      as number);
    calcDIandDX(i);
  }

  // ── ADX: DX의 Wilder EMA (period 개 쌓인 이후) ─────────────────────────
  const firstDXIdx = period;                          // DX가 시작되는 인덱스
  const adxStartIdx = firstDXIdx + period - 1;        // ADX 초기값 인덱스

  if (adxStartIdx >= n) return result;

  // 초기 ADX = 첫 period 개 DX의 단순 평균
  let adx = 0;
  for (let i = firstDXIdx; i <= adxStartIdx; i++) {
    adx += dxArr[i] as number;
  }
  adx /= period;
  (result[adxStartIdx] as ADXPoint).adx = round(adx, 2);

  for (let i = adxStartIdx + 1; i < n; i++) {
    adx = (adx * (period - 1) + (dxArr[i] as number)) / period;
    (result[i] as ADXPoint).adx = round(adx, 2);
  }

  return result;
}

// ── 11. ROC (Rate of Change) ──────────────────────────────────────────────────

/**
 * ROC (Rate of Change) — 모멘텀 지표.
 *
 * ROC[i] = (close[i] / close[i - period] - 1) × 100
 *
 * 양수: 상승 모멘텀, 음수: 하락 모멘텀
 * period 미만 구간은 null.
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - 비교 기간 (기본 20)
 * @returns (closes.length) 개의 number | null 배열
 */
export function calcROC(closes: number[], period: number = 20): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period; i < closes.length; i++) {
    const prev = closes[i - period] as number;
    const cur  = closes[i] as number;
    if (prev === 0) continue;
    result[i] = round((cur / prev - 1) * 100, 2);
  }

  return result;
}

// ── 12. MFI (Money Flow Index) ────────────────────────────────────────────────

/**
 * MFI (Money Flow Index) — 거래량 가중 RSI.
 *
 * Typical Price (TP) = (High + Low + Close) / 3
 * Raw Money Flow (MF) = TP × Volume
 * Positive MF: TP > TP[prev], Negative MF: TP < TP[prev], TP 동일: 무시
 *
 * Money Flow Ratio = Σ(Positive MF, period) / Σ(Negative MF, period)
 * MFI = 100 - 100 / (1 + Money Flow Ratio)
 *
 * 값 범위: 0~100. 과매수 > 80, 과매도 < 20
 * period 미만 구간은 null.
 *
 * @param ohlcv  - OHLCV 배열 (시간순)
 * @param period - MFI 기간 (기본 14)
 */
export function calcMFI(ohlcv: OHLCV[], period: number = 14): (number | null)[] {
  const n = ohlcv.length;
  const result: (number | null)[] = new Array(n).fill(null);

  // Typical Price, Raw Money Flow 계산
  const tp: number[] = ohlcv.map(o => (o.high + o.low + o.close) / 3);
  const mf: number[] = tp.map((t, i) => t * (ohlcv[i] as OHLCV).volume);

  // MF 방향 분류 (TP 기준)
  const posMF: number[] = new Array(n).fill(0);
  const negMF: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    if ((tp[i] as number) > (tp[i - 1] as number))      posMF[i] = mf[i] as number;
    else if ((tp[i] as number) < (tp[i - 1] as number)) negMF[i] = mf[i] as number;
    // TP 동일: 양쪽 모두 0 유지
  }

  // 슬라이딩 윈도우 합산
  for (let i = period; i < n; i++) {
    const posSum = posMF.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0);
    const negSum = negMF.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0);

    if (negSum === 0) {
      result[i] = 100;
    } else {
      const ratio = posSum / negSum;
      result[i] = round(100 - 100 / (1 + ratio), 2);
    }
  }

  return result;
}

// ── 13. Supertrend ────────────────────────────────────────────────────────────

/** Supertrend 한 봉의 계산 결과 */
export interface SupertrendPoint {
  supertrend: number | null;        // 현재 Supertrend 선 값
  direction:  "bullish" | "bearish" | null;  // 추세 방향
  upper:      number | null;        // 상단 밴드 (bearish 구간 기준선)
  lower:      number | null;        // 하단 밴드 (bullish 구간 기준선)
}

/**
 * Supertrend — ATR 기반 동적 추세선.
 *
 * midpoint   = (High + Low) / 2
 * upperBand  = midpoint + multiplier × ATR
 * lowerBand  = midpoint - multiplier × ATR
 *
 * 방향 결정 (이전 방향 상태 유지 방식):
 *   - 이전이 bullish이고 현재 종가 > lowerBand → bullish 유지 (lowerBand = max(lowerBand, prev_lower))
 *   - 이전이 bullish이고 현재 종가 < lowerBand → bearish 전환
 *   - 이전이 bearish이고 현재 종가 < upperBand → bearish 유지 (upperBand = min(upperBand, prev_upper))
 *   - 이전이 bearish이고 현재 종가 > upperBand → bullish 전환
 *
 * Supertrend 선:
 *   bullish  → lowerBand (지지선 역할)
 *   bearish  → upperBand (저항선 역할)
 *
 * ATR 계산 선행 필요 → period 이전 구간은 null.
 *
 * @param ohlcv      - OHLCV 배열 (시간순)
 * @param period     - ATR 기간 (기본 10)
 * @param multiplier - ATR 배수 (기본 3.0)
 */
export function calcSupertrend(
  ohlcv:      OHLCV[],
  period:     number = 10,
  multiplier: number = 3.0,
): SupertrendPoint[] {
  const n = ohlcv.length;
  const empty: SupertrendPoint = { supertrend: null, direction: null, upper: null, lower: null };
  const result: SupertrendPoint[] = new Array(n).fill(null).map(() => ({ ...empty }));

  const atrArr = calcATR(ohlcv, period);

  let prevUpper: number | null = null;
  let prevLower: number | null = null;
  let prevDir:   "bullish" | "bearish" | null = null;

  for (let i = 0; i < n; i++) {
    const atr = atrArr[i];
    if (atr === null) continue;

    const cur  = ohlcv[i] as OHLCV;
    const mid  = (cur.high + cur.low) / 2;
    let upper  = round(mid + multiplier * atr, 4);
    let lower  = round(mid - multiplier * atr, 4);

    // 밴드 조정: 이전 밴드보다 안쪽으로 좁아지지 않도록
    if (prevLower !== null && prevUpper !== null) {
      lower = (lower > prevLower || (ohlcv[i - 1] as OHLCV).close < prevLower)
        ? lower : prevLower;
      upper = (upper < prevUpper || (ohlcv[i - 1] as OHLCV).close > prevUpper)
        ? upper : prevUpper;
    }

    // 방향 결정
    let dir: "bullish" | "bearish";
    if (prevDir === null) {
      dir = cur.close > upper ? "bullish" : "bearish";
    } else if (prevDir === "bullish") {
      dir = cur.close < lower ? "bearish" : "bullish";
    } else {
      dir = cur.close > upper ? "bullish" : "bearish";
    }

    const supertrend = dir === "bullish" ? lower : upper;

    result[i] = { supertrend: round(supertrend, 4), direction: dir, upper, lower };

    prevUpper = upper;
    prevLower = lower;
    prevDir   = dir;
  }

  return result;
}

// ── 14. Envelope ──────────────────────────────────────────────────────────────

/** 엔벨로프 한 봉의 계산 결과 */
export interface EnvPoint {
  upper: number | null;
  mid:   number | null;
  lower: number | null;
}

/**
 * 엔벨로프 (SMA ± percent).
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - SMA 기간 (기본 20)
 * @param percent - 비율 (기본 0.1, 10%)
 * @returns (closes.length) 개의 EnvPoint 배열
 */
export function calcEnvelope(
  closes: number[],
  period: number = 20,
  percent: number = 0.1,
): EnvPoint[] {
  const sma = calcMA(closes, period);
  return closes.map((_, i) => {
    const mid = sma[i];
    if (mid === null) return { upper: null, mid: null, lower: null };
    const upper = round(mid * (1 + percent), 4);
    const lower = round(mid * (1 - percent), 4);
    return { upper, mid, lower };
  });
}

// ── 15. Donchian Channels ──────────────────────────────────────────────────────

/** 돈천 채널 한 봉의 계산 결과 */
export interface DonchianPoint {
  upper: number | null;
  mid:   number | null;
  lower: number | null;
}

/**
 * 돈천 채널 (기간 내 최고가 및 최저가).
 *
 * @param closes - 종가 배열 (시간순)
 * @param period - 기간 (기본 20)
 * @returns (closes.length) 개의 DonchianPoint 배열
 */
export function calcDonchianChannels(
  closes: number[],
  period: number = 20,
): DonchianPoint[] {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, mid: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const upper = Math.max(...slice);
    const lower = Math.min(...slice);
    const mid = round((upper + lower) / 2, 4);
    return { upper: round(upper, 4), mid, lower: round(lower, 4) };
  });
}

// ── 16. Support & Resistance (지지선 & 저항선) ──────────────────────────────

/** 지지선 & 저항선 한 봉의 계산 결과 */
export interface SRPoint {
  support: number | null;
  resistance: number | null;
  zigzag?: number | null;
}

/**
 * 지지선 및 저항선 연산 함수 (Swing High / Swing Low 검출 및 연장 방식).
 * 긴 꼬리로 인한 지저분함을 방지하기 위해 캔들의 몸통(종가/시가) 기준 극점을 활용합니다.
 *
 * @param highs - 고가 배열
 * @param lows - 저가 배열
 * @param closes - 종가 배열
 * @param opens - 시가 배열
 * @returns (highs.length) 개의 SRPoint 배열
 */
export function calcSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[],
  opens: number[]
): SRPoint[] {
  const n = highs.length;
  const result: SRPoint[] = [];
  if (n === 0) return result;

  // Use body extremes for clean, noise-reduced signals
  const bodyHighs = closes.map((c, i) => Math.max(c, opens[i] ?? c));
  const bodyLows = closes.map((c, i) => Math.min(c, opens[i] ?? c));

  if (n < 10) {
    // Fallback for very small data slices
    return bodyHighs.map((_, i) => ({
      support: bodyLows[i],
      resistance: bodyHighs[i],
    }));
  }

  // 1. Find all local peaks and troughs (Swing Highs / Lows)
  const peaks: { idx: number; val: number }[] = [];
  const troughs: { idx: number; val: number }[] = [];

  const windowSize = Math.max(2, Math.floor(n * 0.03)); // Adaptive local window

  for (let i = windowSize; i < n - windowSize; i++) {
    let isPeak = true;
    let isTrough = true;
    for (let w = -windowSize; w <= windowSize; w++) {
      if (w === 0) continue;
      if (bodyHighs[i] < (bodyHighs[i + w] ?? 0)) isPeak = false;
      if (bodyLows[i] > (bodyLows[i + w] ?? Infinity)) isTrough = false;
    }
    if (isPeak) peaks.push({ idx: i, val: bodyHighs[i] });
    if (isTrough) troughs.push({ idx: i, val: bodyLows[i] });
  }

  // If we don't have enough peaks/troughs, fall back to simple extremes
  if (peaks.length < 2) {
    peaks.push({ idx: 0, val: bodyHighs[0] });
    peaks.push({ idx: n - 1, val: bodyHighs[n - 1] });
  }
  if (troughs.length < 2) {
    troughs.push({ idx: 0, val: bodyLows[0] });
    troughs.push({ idx: n - 1, val: bodyLows[n - 1] });
  }

  // 2. Select the two most dominant peaks for Resistance
  // First, sort by value descending to find the absolute highest peaks
  const sortedPeaks = [...peaks].sort((a, b) => b.val - a.val);
  const p1 = sortedPeaks[0];
  // Find the next highest peak that is at least 20% of the chart width away
  const minDistance = n * 0.2;
  let p2 = sortedPeaks.find(p => Math.abs(p.idx - p1.idx) >= minDistance);
  if (!p2) {
    p2 = sortedPeaks[1] || p1;
  }

  // 3. Select the two most dominant troughs for Support
  // Sort by value ascending to find the absolute lowest troughs
  const sortedTroughs = [...troughs].sort((a, b) => a.val - b.val);
  const t1 = sortedTroughs[0];
  let t2 = sortedTroughs.find(t => Math.abs(t.idx - t1.idx) >= minDistance);
  if (!t2) {
    t2 = sortedTroughs[1] || t1;
  }

  // 4. Compute slope and intercept for Resistance Line
  const mResistance = (p2.val - p1.val) / (p2.idx - p1.idx || 1);
  const cResistance = p1.val - mResistance * p1.idx;

  // 5. Compute slope and intercept for Support Line
  const mSupport = (t2.val - t1.val) / (t2.idx - t1.idx || 1);
  const cSupport = t1.val - mSupport * t1.idx;

  // 6. Generate the straight lines across all indices
  for (let i = 0; i < n; i++) {
    result.push({
      support: mSupport * i + cSupport,
      resistance: mResistance * i + cResistance,
    });
  }

  return result;
}

// ── 17. Trendlines (추세선) ──────────────────────────────────────────────────

/** 추세선 한 봉의 계산 결과 */
export interface TrendlinePoint {
  up: number | null;
  down: number | null;
}

/**
 * 추세선 연산 함수 (Convex Hull 기반의 동적 추세선)
 * - 상승 추세선: 보여지는 범위 내 최저점부터 시작하여 가격 하락을 허용하지 않는 (가장 완만한) 저점들을 연결
 * - 하락 추세선: 보여지는 범위 내 최고점부터 시작하여 가격 돌파를 허용하지 않는 (가장 완만한) 고점들을 연결
 */
export function calcTrendlines(
  highs: number[],
  lows: number[]
): TrendlinePoint[] {
  const n = highs.length;
  const result: TrendlinePoint[] = Array.from({ length: n }, () => ({ up: null, down: null }));
  if (n < 2) return result;

  // 1. 상승 추세선 (Up Trendline - Lower Convex Hull)
  let minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (lows[i] < lows[minIdx]) minIdx = i;
  }

  let currentIdx = minIdx;
  result[currentIdx].up = lows[currentIdx];

  while (currentIdx < n - 1) {
    let nextIdx = currentIdx + 1;
    let minSlope = Infinity; // 최저 기울기 (모든 캔들이 선 위에 있도록 보장)
    for (let j = currentIdx + 1; j < n; j++) {
      const slope = (lows[j] - lows[currentIdx]) / (j - currentIdx);
      if (slope < minSlope) {
        minSlope = slope;
        nextIdx = j;
      }
    }
    // 구간 채우기
    for (let k = currentIdx + 1; k <= nextIdx; k++) {
      result[k].up = lows[currentIdx] + minSlope * (k - currentIdx);
    }
    currentIdx = nextIdx;
  }

  // 2. 하락 추세선 (Down Trendline - Upper Convex Hull)
  let maxIdx = 0;
  for (let i = 1; i < n; i++) {
    if (highs[i] > highs[maxIdx]) maxIdx = i;
  }

  currentIdx = maxIdx;
  result[currentIdx].down = highs[currentIdx];

  while (currentIdx < n - 1) {
    let nextIdx = currentIdx + 1;
    let maxSlope = -Infinity; // 최고 기울기 (모든 캔들이 선 아래에 있도록 보장)
    for (let j = currentIdx + 1; j < n; j++) {
      const slope = (highs[j] - highs[currentIdx]) / (j - currentIdx);
      if (slope > maxSlope) {
        maxSlope = slope;
        nextIdx = j;
      }
    }
    // 구간 채우기
    for (let k = currentIdx + 1; k <= nextIdx; k++) {
      result[k].down = highs[currentIdx] + maxSlope * (k - currentIdx);
    }
    currentIdx = nextIdx;
  }

  return result;
}

// ── 18. Auto Trendlines (자동 추세선 알고리즘 추가) ───────────────────────────

/**
 * 선형 회귀 채널 (Linear Regression Channel) 연산 함수.
 * 종가 데이터를 바탕으로 최소자승법(Least Squares)을 통해 중심선 기울기를 구하고,
 * 표준편차 배수를 적용해 평행한 상하한 저항/지지 채널을 도출합니다.
 */
export function calcLinearRegressionChannel(
  prices: number[],
  stdDevMultiplier: number = 2.0
): SRPoint[] {
  const n = prices.length;
  const result: SRPoint[] = [];
  if (n === 0) return result;

  // 1. 선형 회귀식(y = mx + c) 도출을 위한 누적 합 계산
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += prices[i];
    sumXY += i * prices[i];
    sumXX += i * i;
  }

  const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const c = (sumY - m * sumX) / n;

  // 2. 잔차 및 표준편차 산출
  let sumResidualSquares = 0;
  const midValues = [];

  for (let i = 0; i < n; i++) {
    const midVal = m * i + c;
    midValues.push(midVal);
    const residual = prices[i] - midVal;
    sumResidualSquares += residual * residual;
  }

  const stdDev = Math.sqrt(sumResidualSquares / (n || 1));
  const channelOffset = stdDevMultiplier * stdDev;

  // 3. 지지선(하한 채널) 및 저항선(상한 채널) 생성
  for (let i = 0; i < n; i++) {
    result.push({
      support: midValues[i] - channelOffset,
      resistance: midValues[i] + channelOffset,
    });
  }

  return result;
}

/**
 * 지그재그(ZigZag) 기반 지지/저항선 연산 함수.
 * 제공된 수식지왕 지그재그 수식을 100% 이식하여 상태 변수들과 이중파동을 완벽히 연동 및 처리합니다.
 */
export function calcZigZagSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[],
  opens: number[],
  reversalPercent: number = 3
): SRPoint[] {
  const n = highs.length;
  const result: SRPoint[] = [];
  if (n === 0) return result;

  // 1. 수식지왕 YesLanguage 변수 및 배열 선언 (1-indexed 기준 정합성을 위해 21 크기로 선언)
  const go = new Array(21).fill(0);
  const goBar = new Array(21).fill(0);
  const jeo = new Array(21).fill(0);
  const jeoBar = new Array(21).fill(0);

  let standardHigh = 0;
  let standardLow = 0;
  let standardHighBar = 0;
  let standardLowBar = 0;
  let trend = 0;
  let doubleWave = 0;

  const 상승 = 100;
  const 하락 = -100;
  const 양방향 = 2;

  const upPct = reversalPercent;
  const downPct = reversalPercent;

  const zigzagPoints: { idx: number; val: number; type: 'peak' | 'trough' }[] = [];

  function plotTrough(idx: number, val: number) {
    const targetIdx = Math.max(0, Math.min(n - 1, idx));
    zigzagPoints.push({ idx: targetIdx, val, type: 'trough' });
  }

  function plotPeak(idx: number, val: number) {
    const targetIdx = Math.max(0, Math.min(n - 1, idx));
    zigzagPoints.push({ idx: targetIdx, val, type: 'peak' });
  }

  // Bar-by-bar 순차 루프 실행 (YesLanguage/EasyLanguage 시뮬레이션)
  for (let i = 0; i < n; i++) {
    const H = highs[i];
    const L = lows[i];

    const prevTrend = trend;
    const prevDoubleWave = doubleWave;

    // 전고점, 전저점 index 증가
    for (let j = 1; j <= 19; j++) {
      jeoBar[j] = jeoBar[j] + 1;
      goBar[j] = goBar[j] + 1;
    }

    // 이중파동 처리
    if (doubleWave > 0) {
      doubleWave = 0;
    }

    // 최근 고, 저 갱신
    if (standardHigh <= H || standardHigh === 0 || isNaN(standardHigh)) {
      standardHigh = H;
      standardHighBar = 0;
    } else {
      standardHighBar = standardHighBar + 1;
    }

    if (standardLow >= L || standardLow === 0 || isNaN(standardLow)) {
      standardLow = L;
      standardLowBar = 0;
    } else {
      standardLowBar = standardLowBar + 1;
    }

    // 추세방향 결정
    if (standardHigh * (1 - (downPct / 100)) > H && standardLow * (1 + (upPct / 100)) < L) {
      trend = (standardHighBar === standardLowBar) ? 양방향 : (standardHighBar > standardLowBar ? 상승 : 하락);
    } else if (standardHigh * (1 - (downPct / 100)) > H) {
      trend = 하락;
    } else if (standardLow * (1 + (upPct / 100)) < L) {
      trend = 상승;
    }

    // 추세변화에 따른 변곡점 처리
    if (prevTrend === 상승 && trend === 하락) {
      for (let j = 18; j >= 1; j--) {
        go[j + 1] = go[j];
        goBar[j + 1] = goBar[j];
      }
      go[1] = standardHigh;
      goBar[1] = standardHighBar;
      standardHigh = H;
      standardHighBar = 0;
      standardLow = L;
      standardLowBar = 0;

      if (prevDoubleWave > 0) {
        doubleWave = go[1];
      } else {
        plotPeak(i - goBar[1], go[1]);
      }
    }

    else if (prevTrend === 하락 && trend === 하락 && go[1] < standardHigh && standardHigh * (1 - (downPct / 100)) > H) {
      for (let j = 18; j >= 1; j--) {
        go[j + 1] = go[j];
        goBar[j + 1] = goBar[j];
        jeo[j + 1] = jeo[j];
        jeoBar[j + 1] = jeoBar[j];
      }
      go[1] = standardHigh;
      goBar[1] = standardHighBar;
      jeo[1] = standardLow;
      jeoBar[1] = standardLowBar;
      standardHigh = H;
      standardHighBar = 0;
      standardLow = L;
      standardLowBar = 0;

      plotTrough(i - jeoBar[1], jeo[1]);
      doubleWave = go[1];
    }

    else if (prevTrend === 하락 && trend === 상승) {
      for (let j = 18; j >= 1; j--) {
        jeo[j + 1] = jeo[j];
        jeoBar[j + 1] = jeoBar[j];
      }
      jeo[1] = standardLow;
      jeoBar[1] = standardLowBar;
      standardLow = L;
      standardLowBar = 0;
      standardHigh = H;
      standardHighBar = 0;

      if (prevDoubleWave > 0) {
        doubleWave = jeo[1];
      } else {
        plotTrough(i - jeoBar[1], jeo[1]);
      }
    }

    else if (prevTrend === 상승 && trend === 상승 && jeo[1] > standardLow && standardLow * (1 + (upPct / 100)) < L) {
      for (let j = 18; j >= 1; j--) {
        go[j + 1] = go[j];
        goBar[j + 1] = goBar[j];
        jeo[j + 1] = jeo[j];
        jeoBar[j + 1] = jeoBar[j];
      }
      go[1] = standardHigh;
      goBar[1] = standardHighBar;
      jeo[1] = standardLow;
      jeoBar[1] = standardLowBar;
      standardLow = L;
      standardLowBar = 0;
      standardHigh = H;
      standardHighBar = 0;

      plotPeak(i - goBar[1], go[1]);
      doubleWave = jeo[1];
    }

    else if (trend === 양방향) {
      for (let j = 18; j >= 1; j--) {
        go[j + 1] = go[j];
        goBar[j + 1] = goBar[j];
        jeo[j + 1] = jeo[j];
        jeoBar[j + 1] = jeoBar[j];
      }
      go[1] = standardHigh;
      goBar[1] = standardHighBar;
      jeo[1] = standardLow;
      jeoBar[1] = standardLowBar;
      standardHigh = H;
      standardHighBar = 0;
      standardLow = L;
      standardLowBar = 0;

      trend = prevTrend;
      if (prevTrend === 상승) {
        plotPeak(i - goBar[1], go[1]);
        doubleWave = jeo[1];
      } else {
        plotTrough(i - jeoBar[1], jeo[1]);
        doubleWave = go[1];
      }
    }

    // LastBar 마무리
    if (i === n - 1 && standardHighBar > 0 && standardLowBar > 0) {
      const val = trend === 상승 ? standardHigh : standardLow;
      if (trend === 상승) {
        plotPeak(i, val);
      } else {
        plotTrough(i, val);
      }
    }
  }

  // 2. 동일한 봉(index)에 고/저점이 겹치지 않도록 필터링하고 peak와 trough를 교대로 배치
  zigzagPoints.sort((a, b) => a.idx - b.idx);

  const uniquePoints: typeof zigzagPoints = [];
  for (const pt of zigzagPoints) {
    if (uniquePoints.length === 0) {
      uniquePoints.push(pt);
    } else {
      const last = uniquePoints[uniquePoints.length - 1];
      if (last.idx === pt.idx) {
        if (pt.type === 'peak' && pt.val > last.val) {
          uniquePoints[uniquePoints.length - 1] = pt;
        } else if (pt.type === 'trough' && pt.val < last.val) {
          uniquePoints[uniquePoints.length - 1] = pt;
        }
      } else {
        uniquePoints.push(pt);
      }
    }
  }

  const peaks = uniquePoints.filter(p => p.type === 'peak');
  const troughs = uniquePoints.filter(p => p.type === 'trough');

  // 데이터 부족 시 안전 예외 처리 (첫점과 마지막점을 채워 지지/저항선의 정합성 유지)
  if (peaks.length < 2) {
    const bodyHighs = closes.map((c, idx) => Math.max(c, opens[idx] ?? c));
    peaks.push({ idx: 0, val: bodyHighs[0], type: 'peak' });
    peaks.push({ idx: Math.max(0, n - 1), val: bodyHighs[Math.max(0, n - 1)], type: 'peak' });
  }
  if (troughs.length < 2) {
    const bodyLows = closes.map((c, idx) => Math.min(c, opens[idx] ?? c));
    troughs.push({ idx: 0, val: bodyLows[0], type: 'trough' });
    troughs.push({ idx: Math.max(0, n - 1), val: bodyLows[Math.max(0, n - 1)], type: 'trough' });
  }

  // 3. 가장 최근 두 개의 Peaks(고점)와 Troughs(저점)로 선형 지지/저항 추세선 작도
  const p2 = peaks[peaks.length - 1];
  const p1 = peaks[peaks.length - 2] || p2;

  const t2 = troughs[troughs.length - 1];
  const t1 = troughs[troughs.length - 2] || t2;

  const mResistance = (p2.val - p1.val) / (p2.idx - p1.idx || 1);
  const cResistance = p1.val - mResistance * p1.idx;

  const mSupport = (t2.val - t1.val) / (t2.idx - t1.idx || 1);
  const cSupport = t1.val - mSupport * t1.idx;

  // 4. 지그재그 연속 파동선(연두색 지그재그선) 매핑
  // 보간을 제거하고 실제 변곡점(Peak, Trough)과 현재 실시간 주가(마지막 인덱스)에만 값을 할당합니다.
  // 이렇게 해야 datetime X축 상에서 휴일이 생략되어도 ApexCharts가 두 점 사이를 완벽한 수학적 직선으로 잇게 됩니다.
  for (let i = 0; i < n; i++) {
    let zigVal: number | null = null;

    if (uniquePoints.length > 0) {
      const pt = uniquePoints.find((p) => p.idx === i);
      if (pt) {
        zigVal = pt.val;
      } else if (i === n - 1) {
        // 마지막 변곡점부터 마지막 봉까지는 현재 봉의 종가(실시간 주가)로 연장
        const lastPt = uniquePoints[uniquePoints.length - 1];
        if (i > lastPt.idx) {
          zigVal = closes[i] ?? closes[closes.length - 1];
        }
      }
    }

    result.push({
      support: mSupport * i + cSupport,
      resistance: mResistance * i + cResistance,
      zigzag: zigVal,
    });
  }

  return result;
}


// ── convertToWeeklyBars ───────────────────────────────────────────────────────

/**
 * 일봉 시계열 데이터를 주봉으로 변환한다.
 *
 * 주(week) 기준: ISO 8601 주차 (월~일)
 * - date:  해당 주의 마지막 거래일 날짜
 * - open:  해당 주의 첫 거래일 시가
 * - high:  해당 주 전체 고가 최대값
 * - low:   해당 주 전체 저가 최소값
 * - close: 해당 주의 마지막 거래일 종가
 *
 * 입력 데이터는 날짜 오름차순 정렬을 가정한다.
 */
export interface OHLCBar {
  date:  string;
  open:  number;
  high:  number;
  low:   number;
  close: number;
  [key: string]: unknown;  // 기타 필드 허용 (volume 등)
}

/** ISO 주차 키 캐시 — 같은 날짜 문자열은 한 번만 계산 */
const weekKeyCache = new Map<string, string>();

/** ISO 주차 키 반환 (YYYY-Www 형식, e.g. "2025-W03")
 *  "YYYY-MM-DD" 파싱 시 로컬 Getter 대신 UTC 기반으로 분해하여 타임존 버그 방지 */
function isoWeekKey(dateStr: string): string {
  const cached = weekKeyCache.get(dateStr);
  if (cached) return cached;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // ISO 8601: 목요일이 속한 연도를 기준
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week      = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const result    = `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;

  weekKeyCache.set(dateStr, result);
  return result;
}

export function convertToWeeklyBars(dailyPrices: OHLCBar[]): OHLCBar[] {
  if (dailyPrices.length === 0) return [];

  const weekMap = new Map<string, OHLCBar>();

  for (const bar of dailyPrices) {
    const key   = isoWeekKey(bar.date);
    // 누락 필드는 close로 폴백 → NaN 방지
    const open  = bar.open  ?? bar.close;
    const high  = bar.high  ?? bar.close;
    const low   = bar.low   ?? bar.close;
    const close = bar.close;

    if (!weekMap.has(key)) {
      // 주의 첫 거래일 → open 확정, 나머지는 이 봉으로 초기화
      weekMap.set(key, { ...bar, open, high, low, close, date: bar.date });
    } else {
      // 이후 거래일 → high/low 갱신, close·date 최신화
      const prev = weekMap.get(key)!;
      prev.high  = Math.max(prev.high, high);
      prev.low   = Math.min(prev.low,  low);
      prev.close = close;
      prev.date  = bar.date;
    }
  }

  // Map은 삽입 순서를 유지 → 날짜 오름차순 보장
  return Array.from(weekMap.values());
}
