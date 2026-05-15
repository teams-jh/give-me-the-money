/**
 * signals.ts
 *
 * 기술적 지표를 바탕으로 매수·매도 이상징후를 감지한다.
 * indicators.ts 의 계산 결과를 입력받아 신호 객체를 반환.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 제공 신호:
 *   - GoldenCross  : MA 골든/데드크로스
 *   - RSISignal    : 과매수 / 과매도 / 다이버전스
 *   - MACDCross    : MACD 시그널선 교차
 *   - BBSignal     : 볼린저밴드 돌파 / 스퀴즈
 *   - VolumeSignal : 거래량 급증
 *   - OBVSignal    : 가격-OBV 다이버전스
 *   - RiskSignal   : ATR 손절가 / MDD
 *   - analyzeSignals: 위 전체 통합 → SignalSummary
 */

import {
  OHLCV,
  MACDPoint,
  BBPoint,
  calcMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcATR,
  calcOBV,
  calcMDD,
} from "./indicators.ts";

// ── 공용 타입 ─────────────────────────────────────────────────────────────────

/** 신호 방향 */
export type SignalDirection = "bullish" | "bearish" | "neutral";

/** 신호 강도 */
export type SignalStrength = "strong" | "normal" | "weak";

/** 개별 Alert (감지된 신호 하나) */
export interface Alert {
  type:      string;          // 신호 종류 (e.g. "golden_cross_5_20")
  direction: SignalDirection;
  strength:  SignalStrength;
  label:     string;          // 사람이 읽기 좋은 설명
  value?:    number;          // 수치 (RSI 값, OBV 변화율 등)
}

// ── 1. 골든크로스 / 데드크로스 ───────────────────────────────────────────────

/** MA 교차 감지 결과 */
export interface CrossSignal {
  alerts: Alert[];
}

/**
 * MA 골든크로스 / 데드크로스 감지.
 *
 * 검사 대상 조합: (5,20), (20,60), (60,120), (20,120)
 * 최근 lookback 봉 내에 교차가 발생했는지 확인.
 *
 * 골든크로스: 단기선이 장기선을 하→상 돌파  → bullish
 * 데드크로스: 단기선이 장기선을 상→하 돌파  → bearish
 *
 * @param closes   - 종가 배열 (시간순)
 * @param lookback - 몇 봉 이내의 교차를 감지할지 (기본 5)
 */
export function detectGoldenCross(
  closes:   number[],
  lookback: number = 5,
): CrossSignal {
  const alerts: Alert[] = [];

  // 비교할 (단기, 장기) MA 조합
  const pairs: [number, number][] = [
    [5,  20],
    [20, 60],
    [60, 120],
    [20, 120],
  ];

  for (const [fast, slow] of pairs) {
    if (closes.length < slow + lookback) continue;

    const maFast = calcMA(closes, fast);
    const maSlow = calcMA(closes, slow);

    const n = closes.length;

    // lookback 봉 내에서 교차 탐지
    for (let i = n - lookback; i < n; i++) {
      const fCur  = maFast[i];
      const sCur  = maSlow[i];
      const fPrev = maFast[i - 1];
      const sPrev = maSlow[i - 1];

      if (fCur === null || sCur === null || fPrev === null || sPrev === null) continue;

      const crossedUp   = fPrev <= sPrev && fCur > sCur;   // 골든
      const crossedDown = fPrev >= sPrev && fCur < sCur;   // 데드

      const daysAgo = n - 1 - i;
      const strength: SignalStrength = daysAgo === 0 ? "strong" : daysAgo <= 2 ? "normal" : "weak";

      if (crossedUp) {
        alerts.push({
          type:      `golden_cross_${fast}_${slow}`,
          direction: "bullish",
          strength,
          label:     `골든크로스 MA${fast}/MA${slow} (${daysAgo === 0 ? "당일" : `${daysAgo}봉 전`})`,
        });
      } else if (crossedDown) {
        alerts.push({
          type:      `dead_cross_${fast}_${slow}`,
          direction: "bearish",
          strength,
          label:     `데드크로스 MA${fast}/MA${slow} (${daysAgo === 0 ? "당일" : `${daysAgo}봉 전`})`,
        });
      }
    }
  }

  return { alerts };
}

// ── 2. RSI 신호 ───────────────────────────────────────────────────────────────

/** RSI 감지 결과 */
export interface RSISignal {
  rsi:    number | null;   // 최신 RSI 값
  alerts: Alert[];
}

/**
 * RSI 과매수 / 과매도 / 다이버전스 감지.
 *
 * 과매수 (RSI > 70)     → bearish
 * 과매도 (RSI < 30)     → bullish
 * 극단 과매수 (> 80)    → strong bearish
 * 극단 과매도 (< 20)    → strong bullish
 * 다이버전스: 최근 lookback 봉에서
 *   - 가격 신고가 + RSI 하락 → 하락 다이버전스 (bearish)
 *   - 가격 신저가 + RSI 상승 → 상승 다이버전스 (bullish)
 *
 * @param closes   - 종가 배열 (시간순)
 * @param period   - RSI 기간 (기본 14)
 * @param lookback - 다이버전스 탐지 구간 (기본 20)
 */
export function detectRSISignal(
  closes:   number[],
  period:   number = 14,
  lookback: number = 20,
): RSISignal {
  const rsiArr = calcRSI(closes, period);
  const alerts: Alert[] = [];

  // 최신 RSI
  const latestRSI = rsiArr[rsiArr.length - 1] ?? null;

  // ── 과매수 / 과매도 ──────────────────────────────────────────────────────
  if (latestRSI !== null) {
    if (latestRSI > 80) {
      alerts.push({ type: "rsi_extreme_overbought", direction: "bearish", strength: "strong",
        label: `RSI 극단 과매수 (${latestRSI})`, value: latestRSI });
    } else if (latestRSI > 70) {
      alerts.push({ type: "rsi_overbought", direction: "bearish", strength: "normal",
        label: `RSI 과매수 (${latestRSI})`, value: latestRSI });
    } else if (latestRSI < 20) {
      alerts.push({ type: "rsi_extreme_oversold", direction: "bullish", strength: "strong",
        label: `RSI 극단 과매도 (${latestRSI})`, value: latestRSI });
    } else if (latestRSI < 30) {
      alerts.push({ type: "rsi_oversold", direction: "bullish", strength: "normal",
        label: `RSI 과매도 (${latestRSI})`, value: latestRSI });
    }
  }

  // ── 다이버전스 ───────────────────────────────────────────────────────────
  const n = closes.length;
  if (n >= lookback + period) {
    const priceWindow = closes.slice(n - lookback);
    const rsiWindow   = rsiArr.slice(n - lookback).filter((v): v is number => v !== null);

    if (rsiWindow.length >= 4) {
      const priceHigh  = Math.max(...priceWindow);
      const priceLow   = Math.min(...priceWindow);
      const priceStart = priceWindow[0] as number;
      const priceEnd   = priceWindow[priceWindow.length - 1] as number;

      const rsiStart = rsiWindow[0] as number;
      const rsiEnd   = rsiWindow[rsiWindow.length - 1] as number;

      // 가격 신고가 갱신 + RSI 하락 → bearish divergence
      if (priceEnd >= priceHigh * 0.99 && rsiEnd < rsiStart - 5) {
        alerts.push({
          type: "rsi_bearish_divergence", direction: "bearish", strength: "normal",
          label: `RSI 하락 다이버전스 (가격↑ RSI↓)`, value: latestRSI ?? undefined,
        });
      }

      // 가격 신저가 갱신 + RSI 상승 → bullish divergence
      if (priceEnd <= priceLow * 1.01 && rsiEnd > rsiStart + 5) {
        alerts.push({
          type: "rsi_bullish_divergence", direction: "bullish", strength: "normal",
          label: `RSI 상승 다이버전스 (가격↓ RSI↑)`, value: latestRSI ?? undefined,
        });
      }
    }
  }

  return { rsi: latestRSI, alerts };
}

// ── 3. MACD 교차 신호 ────────────────────────────────────────────────────────

/** MACD 감지 결과 */
export interface MACDCrossSignal {
  macd:   number | null;   // 최신 MACD 값
  signal: number | null;   // 최신 Signal 값
  alerts: Alert[];
}

/**
 * MACD 시그널선 교차 감지.
 *
 * 최근 lookback 봉 내에서:
 * MACD > Signal 전환 (하→상) → bullish
 * MACD < Signal 전환 (상→하) → bearish
 * 제로선 위/아래 교차 추가 강도 반영
 *
 * @param closes      - 종가 배열 (시간순)
 * @param lookback    - 탐지 범위 (기본 5봉)
 */
export function detectMACDCross(
  closes:   number[],
  lookback: number = 5,
): MACDCrossSignal {
  const macdArr = calcMACD(closes);
  const alerts: Alert[] = [];

  const n   = closes.length;
  const cur = macdArr[n - 1];
  const latestMACD   = cur?.macd ?? null;
  const latestSignal = cur?.signal ?? null;

  for (let i = n - lookback; i < n; i++) {
    const curr = macdArr[i];
    const prev = macdArr[i - 1];
    if (!curr || !prev) continue;

    const { macd: mCur, signal: sCur } = curr;
    const { macd: mPrev, signal: sPrev } = prev;
    if (mCur === null || sCur === null || mPrev === null || sPrev === null) continue;

    const crossedUp   = mPrev <= sPrev && mCur > sCur;
    const crossedDown = mPrev >= sPrev && mCur < sCur;

    const daysAgo  = n - 1 - i;
    const aboveZero = mCur > 0;

    if (crossedUp) {
      // 제로선 위에서 골든크로스 → 더 강한 신호
      const strength: SignalStrength = aboveZero ? "strong" : "normal";
      alerts.push({
        type:      "macd_golden_cross",
        direction: "bullish",
        strength,
        label:     `MACD 골든크로스${aboveZero ? " (제로선 위)" : ""} (${daysAgo === 0 ? "당일" : `${daysAgo}봉 전`})`,
        value:     mCur,
      });
    } else if (crossedDown) {
      const strength: SignalStrength = !aboveZero ? "strong" : "normal";
      alerts.push({
        type:      "macd_dead_cross",
        direction: "bearish",
        strength,
        label:     `MACD 데드크로스${!aboveZero ? " (제로선 아래)" : ""} (${daysAgo === 0 ? "당일" : `${daysAgo}봉 전`})`,
        value:     mCur,
      });
    }
  }

  return { macd: latestMACD, signal: latestSignal, alerts };
}

// ── 4. 볼린저밴드 신호 ────────────────────────────────────────────────────────

/** 볼린저밴드 감지 결과 */
export interface BBBreakoutSignal {
  bandWidth: number | null;  // 최신 밴드폭 (%)
  alerts:    Alert[];
}

/**
 * 볼린저밴드 돌파 / 스퀴즈 감지.
 *
 * 상단 돌파  → bearish (과매수 영역 진입)
 * 하단 이탈  → bullish (과매도 반등 기대)
 * 스퀴즈     → neutral (밴드폭이 52주 최저 → 변동성 폭발 직전)
 *
 * @param closes   - 종가 배열 (시간순)
 * @param period   - BB 기간 (기본 20)
 * @param k        - 표준편차 배수 (기본 2)
 * @param lookback - 돌파 탐지 범위 봉 수 (기본 3)
 * @param squeezeWindow - 스퀴즈 판단 과거 비교 기간 (기본 120봉)
 */
export function detectBBBreakout(
  closes:        number[],
  period:        number = 20,
  k:             number = 2,
  lookback:      number = 3,
  squeezeWindow: number = 120,
): BBBreakoutSignal {
  const bbArr = calcBollingerBands(closes, period, k);
  const alerts: Alert[] = [];

  const n = closes.length;
  const latestBB = bbArr[n - 1];
  const bandWidth = latestBB?.width ?? null;

  // ── 돌파 감지 ─────────────────────────────────────────────────────────────
  for (let i = n - lookback; i < n; i++) {
    const bb = bbArr[i];
    if (!bb || bb.upper === null || bb.lower === null) continue;

    const price   = closes[i] as number;
    const daysAgo = n - 1 - i;
    const label   = daysAgo === 0 ? "당일" : `${daysAgo}봉 전`;

    if (price > bb.upper) {
      alerts.push({
        type: "bb_upper_breakout", direction: "bearish", strength: "normal",
        label: `볼린저밴드 상단 돌파 (${label})`, value: price,
      });
    } else if (price < bb.lower) {
      alerts.push({
        type: "bb_lower_breakout", direction: "bullish", strength: "normal",
        label: `볼린저밴드 하단 이탈 (${label})`, value: price,
      });
    }
  }

  // ── 스퀴즈 감지 ───────────────────────────────────────────────────────────
  if (bandWidth !== null && n >= squeezeWindow) {
    const pastWidths = bbArr
      .slice(n - squeezeWindow, n - 1)
      .map(b => b.width)
      .filter((w): w is number => w !== null);

    if (pastWidths.length > 0) {
      const minWidth = Math.min(...pastWidths);
      // 현재 밴드폭이 과거 squeezeWindow 기간 중 최저 수준 (5% 이내)
      if (bandWidth <= minWidth * 1.05) {
        alerts.push({
          type: "bb_squeeze", direction: "neutral", strength: "strong",
          label: `볼린저밴드 스퀴즈 (${squeezeWindow}봉 중 최저 밴드폭: ${bandWidth.toFixed(1)}%)`,
          value: bandWidth,
        });
      }
    }
  }

  return { bandWidth, alerts };
}

// ── 5. 거래량 급증 신호 ───────────────────────────────────────────────────────

/** 거래량 급증 감지 결과 */
export interface VolumeSignal {
  volRatio: number | null;  // 오늘 거래량 / 20일 평균 거래량
  alerts:   Alert[];
}

/**
 * 거래량 급증 감지.
 *
 * 오늘 거래량 / avgPeriod 평균 >= threshold 배 이상이면 신호.
 * 가격 방향으로 bullish / bearish 구분.
 *
 * @param closes    - 종가 배열 (시간순)
 * @param volumes   - 거래량 배열
 * @param avgPeriod - 평균 비교 기간 (기본 20일)
 * @param threshold - 급증 기준 배수 (기본 2.0배)
 */
export function detectVolumeSpike(
  closes:    number[],
  volumes:   number[],
  avgPeriod: number = 20,
  threshold: number = 2.0,
): VolumeSignal {
  const alerts: Alert[] = [];
  const n = closes.length;

  if (n < avgPeriod + 1) return { volRatio: null, alerts };

  const todayVol = volumes[n - 1] as number;
  const pastVols = volumes.slice(n - 1 - avgPeriod, n - 1);
  const avgVol   = pastVols.reduce((s, v) => s + v, 0) / avgPeriod;
  const volRatio = avgVol > 0 ? Math.round((todayVol / avgVol) * 100) / 100 : null;

  if (volRatio !== null && volRatio >= threshold) {
    const priceUp = (closes[n - 1] as number) >= (closes[n - 2] as number);
    const direction: SignalDirection = priceUp ? "bullish" : "bearish";
    const strength: SignalStrength   = volRatio >= threshold * 2 ? "strong" : "normal";

    alerts.push({
      type:      `volume_spike_${priceUp ? "up" : "down"}`,
      direction,
      strength,
      label:     `거래량 급증 ${volRatio.toFixed(1)}배 (${priceUp ? "가격 상승" : "가격 하락"})`,
      value:     volRatio,
    });
  }

  return { volRatio, alerts };
}

// ── 6. OBV 다이버전스 신호 ───────────────────────────────────────────────────

/** OBV 다이버전스 감지 결과 */
export interface OBVSignal {
  alerts: Alert[];
}

/**
 * 가격-OBV 방향 불일치 (다이버전스) 감지.
 *
 * 최근 lookback 봉:
 * 가격 상승 + OBV 하락 → 상승 추세 약화 경보 (bearish)
 * 가격 하락 + OBV 상승 → 하락 추세 약화 경보 (bullish)
 *
 * @param closes   - 종가 배열 (시간순)
 * @param volumes  - 거래량 배열
 * @param lookback - 비교 기간 (기본 20봉)
 */
export function detectOBVDivergence(
  closes:   number[],
  volumes:  number[],
  lookback: number = 20,
): OBVSignal {
  const alerts: Alert[] = [];
  const n = closes.length;
  if (n < lookback + 1) return { alerts };

  const obvArr = calcOBV(closes, volumes);

  const priceStart = closes[n - lookback] as number;
  const priceEnd   = closes[n - 1] as number;
  const obvStart   = obvArr[n - lookback] as number;
  const obvEnd     = obvArr[n - 1] as number;

  const priceUp = priceEnd > priceStart * 1.02;  // 2% 이상 상승
  const priceDown = priceEnd < priceStart * 0.98; // 2% 이상 하락
  const obvUp   = obvEnd > obvStart;
  const obvDown = obvEnd < obvStart;

  if (priceUp && obvDown) {
    alerts.push({
      type: "obv_bearish_divergence", direction: "bearish", strength: "normal",
      label: `OBV 하락 다이버전스 (가격↑ OBV↓, ${lookback}봉 기준)`,
    });
  } else if (priceDown && obvUp) {
    alerts.push({
      type: "obv_bullish_divergence", direction: "bullish", strength: "normal",
      label: `OBV 상승 다이버전스 (가격↓ OBV↑, ${lookback}봉 기준)`,
    });
  }

  return { alerts };
}

// ── 7. 리스크 신호 (ATR 손절가 / MDD) ────────────────────────────────────────

/** 리스크 신호 결과 */
export interface RiskSignal {
  atr:      number | null;   // 최신 ATR 값
  stopLoss: number | null;   // ATR × atrMultiplier 기반 손절가
  mdd:      number;          // 최대낙폭 (%)
  alerts:   Alert[];
}

/**
 * ATR 기반 손절가 + MDD 계산.
 *
 * stopLoss = 현재가 - ATR × atrMultiplier
 * MDD > mddThreshold 이면 경보.
 *
 * @param ohlcv          - OHLCV 배열 (시간순)
 * @param atrPeriod      - ATR 기간 (기본 14)
 * @param atrMultiplier  - 손절 배수 (기본 1.5)
 * @param mddThreshold   - MDD 경보 기준 % (기본 -30%)
 */
export function detectRiskSignal(
  ohlcv:         OHLCV[],
  atrPeriod:     number = 14,
  atrMultiplier: number = 1.5,
  mddThreshold:  number = -30,
): RiskSignal {
  const alerts: Alert[] = [];
  const closes = ohlcv.map(o => o.close);

  const atrArr  = calcATR(ohlcv, atrPeriod);
  const latestATR = atrArr[atrArr.length - 1] ?? null;
  const latestPrice = closes[closes.length - 1] ?? null;

  const stopLoss = latestATR !== null && latestPrice !== null
    ? Math.round((latestPrice - latestATR * atrMultiplier) * 100) / 100
    : null;

  const mdd = calcMDD(closes);

  if (mdd < mddThreshold) {
    alerts.push({
      type: "mdd_warning", direction: "bearish", strength: "strong",
      label: `최대낙폭 경보 (MDD ${mdd}%)`, value: mdd,
    });
  }

  return { atr: latestATR, stopLoss, mdd, alerts };
}

// ── 통합 분석 ─────────────────────────────────────────────────────────────────

/** 종목별 전체 신호 요약 */
export interface SignalSummary {
  ticker:    string;
  score:     number;        // 양수 = 매수 우세, 음수 = 매도 우세
  rsi:       number | null;
  macd:      number | null;
  bandWidth: number | null;
  volRatio:  number | null;
  atr:       number | null;
  stopLoss:  number | null;
  mdd:       number;
  alerts:    Alert[];
}

/** 방향별 점수 가중치 */
const SCORE_WEIGHT: Record<SignalDirection, number> = {
  bullish: 1,
  bearish: -1,
  neutral: 0,
};
const STRENGTH_MULTIPLIER: Record<SignalStrength, number> = {
  strong: 2,
  normal: 1,
  weak:   0.5,
};

/**
 * 전체 신호 통합 분석.
 *
 * 각 감지기를 실행하고 Alert 를 합산,
 * score = Σ(방향가중치 × 강도배수) 로 매수/매도 강도를 수치화.
 *
 * @param ticker - 티커 심볼
 * @param ohlcv  - OHLCV 배열 (시간순, 최소 60봉 이상 권장)
 */
export function analyzeSignals(ticker: string, ohlcv: OHLCV[]): SignalSummary {
  const closes  = ohlcv.map(o => o.close);
  const volumes = ohlcv.map(o => o.volume);

  // 각 신호 감지
  const cross  = detectGoldenCross(closes);
  const rsi    = detectRSISignal(closes);
  const macdS  = detectMACDCross(closes);
  const bb     = detectBBBreakout(closes);
  const vol    = detectVolumeSpike(closes, volumes);
  const obv    = detectOBVDivergence(closes, volumes);
  const risk   = detectRiskSignal(ohlcv);

  // 전체 Alert 통합
  const allAlerts: Alert[] = [
    ...cross.alerts,
    ...rsi.alerts,
    ...macdS.alerts,
    ...bb.alerts,
    ...vol.alerts,
    ...obv.alerts,
    ...risk.alerts,
  ];

  // 점수 계산
  const score = allAlerts.reduce((sum, a) => {
    return sum + SCORE_WEIGHT[a.direction] * STRENGTH_MULTIPLIER[a.strength];
  }, 0);

  return {
    ticker,
    score:     Math.round(score * 10) / 10,
    rsi:       rsi.rsi,
    macd:      macdS.macd,
    bandWidth: bb.bandWidth,
    volRatio:  vol.volRatio,
    atr:       risk.atr,
    stopLoss:  risk.stopLoss,
    mdd:       risk.mdd,
    alerts:    allAlerts,
  };
}
