/**
 * indicators.ts
 *
 * 순수 기술적 지표 계산 함수 모음.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 제공 지표:
 *   - MA    : 단순 이동평균 (SMA)
 *   - EMA   : 지수 이동평균
 *   - RSI   : Relative Strength Index (Wilder 방식)
 *   - MACD  : Moving Average Convergence Divergence
 *   - BB    : Bollinger Bands
 *   - ATR   : Average True Range
 *   - OBV   : On-Balance Volume
 *   - MDD   : Maximum Drawdown
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
