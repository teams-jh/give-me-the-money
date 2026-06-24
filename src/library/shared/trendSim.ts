/**
 * trendSim.ts
 *
 * 추세선 시뮬레이션 순수 함수 모음.
 * 외부 라이브러리 없음 — 프론트엔드(use-trend-simulation) / 백엔드(scripts) 공용.
 *
 * 제공 기능:
 *   - 타입: PriceDataPoint, TouchPoint, SimResult, BarUnit, PeriodConfig
 *   - 상수: PERIOD_BARS
 *   - 날짜 유틸: snapDateUp, snapDateDown
 *   - 인덱스: buildTrendIndices
 *   - 가격 선택: selectPriceBasis
 *   - 추세선 계산: calcTrendLine
 *   - 차트 데이터 조립: buildChartData
 *   - 기울기 정보: calcSlopeInfo
 *   - 터치포인트 필터: filterTouchPoints
 *   - 티커 시뮬레이션: runTickerSim
 *   - 패턴 필터: applyPatternFilter
 */

import type { SRPoint } from './indicators.ts';
import type { TrendPeriodKey, TrendTouchPoint } from './signals.ts';

import { calcTrendTouchPoints } from './signals.ts';
import {
  convertToWeeklyBars,
  calcSupportResistance,
  calcLinearRegressionChannel,
  calcZigZagSupportResistance,
} from './indicators.ts';

// ── 공용 타입 ─────────────────────────────────────────────────────────────────

export type PeriodKey = TrendPeriodKey;

export type BarUnit = 'daily' | 'weekly';

/** OHLC 일봉/주봉 한 개 */
export interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 터치/돌파 마커 한 개 */
export interface TouchPoint {
  x: number; // Unix ms 타임스탬프
  y: number; // 판정된 가격
  priceType: 'high' | 'close';
  type: 'touch' | 'breakout';
}

/** 티커 1개의 시뮬레이션 결과 */
export interface SimResult {
  ticker: string;
  name: string;
  touchCount: number;
  closeTouchCount: number;
  highTouchCount: number;
  breakoutCount: number;
  closeBreakoutCount: number;
  highBreakoutCount: number;
  prices: PriceDataPoint[];
  resistanceData: { x: number; y: number | null }[];
  supportData?: { x: number; y: number | null }[];
  zigzagData?: { x: number; y: number }[];
  latestResistance: number | null;
  touchPoints: TouchPoint[];
  filteredTouchPoints?: TouchPoint[];
  slopeType: 'positive' | 'negative' | 'flat';
  slope?: number;
  totalCount?: number;
}

/** 기간별 시뮬레이션 설정 */
export interface PeriodConfig {
  barUnit: BarUnit;
  trendBase: 'highlow' | 'close' | 'open';
  trendAlgo: 'swing' | 'zigzag' | 'regression';
  zigzagThreshold: number;
  regressionStdDev: number;
  trendStartDate: string;
  trendEndDate: string;
  trendTouchBasis: 'close' | 'high' | 'both';
  trendTouchTolerance: number;
  trendBreakoutTolerance: number;
  filterStartDate: string;
  filterEndDate: string;
  slopeFilter: 'all' | 'positive' | 'negative';
  slopeMin: string;
  slopeMax: string;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────

/** 기간 × 봉 단위 → 봉 수 */
export const PERIOD_BARS: Record<BarUnit, Record<PeriodKey, number>> = {
  daily: { '1m': 21, '3m': 63, '1y': 252, '2y': 504, '3y': 756 },
  weekly: { '1m': 4, '3m': 13, '1y': 52, '2y': 104, '3y': 156 },
};

/**
 * filterStartDate가 비어 있을 때 자동 채우는 기본 lookback 봉 수.
 * "돌파 탐지 구간 시작 = 마지막 봉에서 N봉 전" 규칙의 N.
 * 웹/스크립트 양쪽이 이 상수 하나만 참조하도록 단일화한다.
 */
export const DEFAULT_FILTER_LOOKBACK_BARS = 3;

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────

/**
 * 주봉 날짜 올림 스냅.
 * target 이상인 첫 번째 날짜를 반환한다.
 * 없으면 마지막 날짜를 반환.
 */
export function snapDateUp(dates: string[], target: string): string {
  return dates.find((x) => x >= target) ?? dates[dates.length - 1] ?? target;
}

/**
 * 주봉 날짜 내림 스냅.
 * target 이하인 마지막 날짜를 반환한다.
 * 없으면 첫 번째 날짜를 반환.
 */
export function snapDateDown(dates: string[], target: string): string {
  return [...dates].reverse().find((x) => x <= target) ?? dates[0] ?? target;
}

// ── 인덱스 빌더 ───────────────────────────────────────────────────────────────

/**
 * 날짜 범위에 해당하는 인덱스 배열을 반환한다.
 * start / end 가 빈 문자열이면 전체 인덱스를 반환.
 */
export function buildTrendIndices(dates: string[], start: string, end: string): number[] {
  if (!start || !end) return dates.map((_, i) => i);

  const indices: number[] = [];
  dates.forEach((d, i) => {
    if (d >= start && d <= end) indices.push(i);
  });
  return indices.length > 0 ? indices : dates.map((_, i) => i);
}

// ── 날짜 자동 해석 (빈 값 → 종목별 dates 기준 채움) ───────────────────────────

/**
 * PeriodConfig의 빈 날짜 필드를 종목별 dates 배열을 기준으로 채운다.
 *
 * 규칙:
 *   trendStartDate  == "" → dates[0]
 *   trendEndDate    == "" → dates[마지막-1]  (마지막 1봉은 잠정/미확정일 수 있어 작도에서 제외)
 *                          단 dates가 1봉뿐이면 채울 마지막-1이 없으므로 "" 유지 → runTickerSim에서 작도 생략
 *   filterEndDate   == "" → dates[마지막]   (돌파 탐지 구간 끝은 마지막 봉)
 *   filterStartDate == "" → dates[마지막 - lookback]  (음수면 0으로 클램프)
 *
 * 이미 값이 있는 필드는 그대로 보존한다 (사용자 지정 우선).
 * dates가 비어 있으면 cfg를 그대로 반환한다.
 *
 * 웹(use-trend-simulation)과 스크립트(simulate_trend)가 공통으로 호출하여
 * 동일 설정 → 동일 결과를 보장한다.
 *
 * @param cfg        - 기간별 설정
 * @param dates      - 종목별 날짜 배열 (barUnit 변환·슬라이싱 완료된 것)
 * @param lookback   - filterStart 자동 채움용 봉 수 (기본 DEFAULT_FILTER_LOOKBACK_BARS)
 * @param dailyDates - (선택) 일봉 원본 날짜 배열. 전달하면 filterStart 계산을 이 배열 기준으로 수행.
 *                     주봉(barUnit=weekly) 사용 시 dates[-N]이 N주 전이 되는 문제를 방지한다.
 *                     미전달 시 dates를 그대로 사용 (하위 호환 유지).
 */
export function resolvePeriodDates(
  cfg: PeriodConfig,
  dates: string[],
  lookback: number = DEFAULT_FILTER_LOOKBACK_BARS,
  dailyDates?: string[]
): PeriodConfig {
  if (dates.length === 0) return cfg;

  const lastDate = dates[dates.length - 1]!;
  // 추세선 작도는 마지막 1봉(장중 잠정/미확정 가능)을 제외하고 그 직전 봉까지만 사용한다.
  // dates가 1봉뿐이면 직전 봉이 없으므로 null → 빈 문자열로 두어 runTickerSim에서 작도를 생략시킨다.
  const trendEndAuto = dates.length >= 2 ? dates[dates.length - 2]! : '';

  // filterStart는 barUnit에 무관하게 항상 "거래일 기준 N일 전"이어야 한다.
  // 주봉 slice의 dates[-N]은 N주 전이 되므로, dailyDates가 있으면 그 기준으로 계산한다.
  //
  // dailyDates에서 dates의 마지막 날짜(lastDate) 위치를 찾아 lookback 적용한다.
  // 단순히 dailyDates[-N]이 아닌 위치 기반 계산을 하는 이유:
  //   trendEndDate 명시 등으로 slice 마지막이 오늘이 아닌 과거일 경우에도
  //   "slice 기준 N거래일 전"을 정확히 계산하기 위함.
  let minusN: string;
  if (dailyDates && dailyDates.length > 0) {
    const lastDateIdx = dailyDates.lastIndexOf(lastDate);
    const anchorIdx = lastDateIdx !== -1 ? lastDateIdx : dailyDates.length - 1;
    minusN = dailyDates[Math.max(0, anchorIdx - lookback)]!;
  } else {
    minusN = dates[Math.max(0, dates.length - 1 - lookback)]!;
  }

  // 빈 값뿐 아니라 파싱 불가한 잘못된 날짜도 자동 채움 대상으로 본다.
  // (resolveFilterStartMs와 동일한 판정 기준 → 두 함수 결과 일관성 보장)
  const isValid = (d: string): boolean => !!d && !isNaN(new Date(d).getTime());

  return {
    ...cfg,
    trendStartDate: isValid(cfg.trendStartDate) ? cfg.trendStartDate : dates[0]!,
    trendEndDate: isValid(cfg.trendEndDate) ? cfg.trendEndDate : trendEndAuto,
    filterEndDate: isValid(cfg.filterEndDate) ? cfg.filterEndDate : lastDate,
    filterStartDate: isValid(cfg.filterStartDate) ? cfg.filterStartDate : minusN,
  };
}

/**
 * 패턴 필터용 filterStart의 Unix ms를 단일 규칙으로 산출한다.
 *
 * filterStartDate가 유효한 날짜면 그 값을, 비었거나 파싱 불가면
 * resolvePeriodDates와 동일한 자동 채움(마지막 - lookback)을 적용한다.
 * dates가 비어 있으면 0을 반환한다.
 *
 * @param cfg        - 기간별 설정
 * @param dates      - 종목별 날짜 배열
 * @param lookback   - 자동 채움용 봉 수 (기본 DEFAULT_FILTER_LOOKBACK_BARS)
 * @param dailyDates - (선택) 일봉 원본 날짜 배열. resolvePeriodDates와 동일한 용도.
 */
export function resolveFilterStartMs(
  cfg: PeriodConfig,
  dates: string[],
  lookback: number = DEFAULT_FILTER_LOOKBACK_BARS,
  dailyDates?: string[]
): number {
  if (dates.length === 0) return 0;

  // 날짜 검증·자동 채움 규칙을 resolvePeriodDates 한 곳에서 재사용 (중복 제거)
  const resolved = resolvePeriodDates(cfg, dates, lookback, dailyDates);
  const parsed = new Date(resolved.filterStartDate).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

// ── 가격 기준 선택 ────────────────────────────────────────────────────────────

/**
 * trendBase 설정에 따라 추세선 계산에 사용할 가격 배열을 선택한다.
 *
 * highlow → 고가/저가/종가/시가 그대로
 * close   → 모든 기준을 종가로 통일
 * open    → 모든 기준을 시가로 통일
 */
export function selectPriceBasis(
  trendBase: PeriodConfig['trendBase'],
  highs: number[],
  lows: number[],
  closes: number[],
  opens: number[]
): {
  currentHighs: number[];
  currentLows: number[];
  currentCloses: number[];
  currentOpens: number[];
} {
  if (trendBase === 'close') {
    return {
      currentHighs: closes,
      currentLows: closes,
      currentCloses: closes,
      currentOpens: closes,
    };
  }
  if (trendBase === 'open') {
    return {
      currentHighs: opens,
      currentLows: opens,
      currentCloses: opens,
      currentOpens: opens,
    };
  }
  // highlow (default)
  return {
    currentHighs: highs,
    currentLows: lows,
    currentCloses: closes,
    currentOpens: opens,
  };
}

// ── 추세선 기울기·절편 계산 ───────────────────────────────────────────────────

export interface TrendLineResult {
  mR: number; // 저항선 기울기
  cR: number | null; // 저항선 절편
  mS: number; // 지지선 기울기
  cS: number | null; // 지지선 절편
}

/**
 * SRPoint 배열과 인덱스 범위로부터 저항선/지지선의 기울기(m)와 절편(c)을 계산한다.
 * R_i = m * i + c 형태.
 */
export function calcTrendLine(
  srRaw: SRPoint[],
  firstIdx: number,
  lastIdx: number
): TrendLineResult {
  const deltaX = lastIdx - firstIdx || 1;

  const resistanceStart = srRaw[0]?.resistance;
  const resistanceEnd = srRaw[srRaw.length - 1]?.resistance;
  const supportStart = srRaw[0]?.support;
  const supportEnd = srRaw[srRaw.length - 1]?.support;

  const mR =
    resistanceStart != null && resistanceEnd != null
      ? (resistanceEnd - resistanceStart) / deltaX
      : 0;
  const cR = resistanceStart != null ? resistanceStart - mR * firstIdx : null;

  const mS = supportStart != null && supportEnd != null ? (supportEnd - supportStart) / deltaX : 0;
  const cS = supportStart != null ? supportStart - mS * firstIdx : null;

  return { mR, cR, mS, cS };
}

// ── 차트 좌표 데이터 조립 ─────────────────────────────────────────────────────

export interface ChartData {
  resistanceData: { x: number; y: number | null }[];
  supportData: { x: number; y: number | null }[] | undefined;
  zigzagData: { x: number; y: number }[] | undefined;
}

/**
 * 저항선/지지선/지그재그 차트 좌표 데이터를 조립한다.
 *
 * @param timestamps      - 전체 봉의 Unix ms 타임스탬프 배열
 * @param totalBars       - 전체 봉 수 (dates.length)
 * @param simTrendIndices - 추세선 작도 범위 인덱스
 * @param srRaw           - 추세선 계산 결과 (SRPoint[])
 * @param line            - calcTrendLine() 결과
 * @param trendAlgo       - 알고리즘 종류 (zigzag 여부 판단용)
 */
export function buildChartData(
  timestamps: number[],
  totalBars: number,
  simTrendIndices: number[],
  srRaw: SRPoint[],
  line: TrendLineResult,
  trendAlgo: PeriodConfig['trendAlgo']
): ChartData {
  const { mR, cR, mS, cS } = line;

  const resistanceData: { x: number; y: number | null }[] =
    cR != null
      ? [
          { x: timestamps[0]!, y: cR },
          { x: timestamps[totalBars - 1]!, y: mR * (totalBars - 1) + cR },
        ]
      : [];

  const supportData: { x: number; y: number | null }[] | undefined =
    cS != null
      ? [
          { x: timestamps[0]!, y: cS },
          { x: timestamps[totalBars - 1]!, y: mS * (totalBars - 1) + cS },
        ]
      : undefined;

  const zigzagData: { x: number; y: number }[] | undefined =
    trendAlgo === 'zigzag'
      ? srRaw
          .map((pt, idx) => ({
            x: timestamps[simTrendIndices[idx]!]!,
            y: pt.zigzag,
          }))
          .filter((pt): pt is { x: number; y: number } => pt.y != null)
      : undefined;

  return { resistanceData, supportData, zigzagData };
}

// ── 기울기 정보 계산 ──────────────────────────────────────────────────────────

export interface SlopeInfo {
  slope: number; // 기울기 (%)
  slopeType: 'positive' | 'negative' | 'flat';
}

/**
 * resistanceData의 시작/끝 y값으로부터 기울기 정보를 계산한다.
 */
export function calcSlopeInfo(resistanceData: { x: number; y: number | null }[]): SlopeInfo {
  const firstR = resistanceData[0]?.y ?? 0;
  const lastR = resistanceData[resistanceData.length - 1]?.y ?? 0;
  const slope = lastR - firstR;
  const slopePercent = firstR !== 0 ? (slope / firstR) * 100 : 0;
  const slopeType: SlopeInfo['slopeType'] =
    slope > 0.001 ? 'positive' : slope < -0.001 ? 'negative' : 'flat';

  return { slope: slopePercent, slopeType };
}

// ── 터치포인트 날짜 범위 필터 ─────────────────────────────────────────────────

export interface FilterTouchPointsResult {
  filteredTouchPoints: TouchPoint[];
  breakoutCount: number;
  closeBreakoutCount: number;
  highBreakoutCount: number;
}

/**
 * touchPoints에서 터치는 전부 유지하고,
 * 돌파는 filterStart~filterEnd 범위 내의 것만 남긴다.
 */
export function filterTouchPoints(
  touchPoints: TrendTouchPoint[],
  filterStartMs: number,
  filterEndMs: number
): FilterTouchPointsResult {
  const filteredTouchPoints = (touchPoints as TouchPoint[]).filter(
    (tp) => tp.type === 'touch' || (tp.x >= filterStartMs && tp.x <= filterEndMs)
  );

  const breakoutCount = filteredTouchPoints.filter((tp) => tp.type === 'breakout').length;
  const closeBreakoutCount = filteredTouchPoints.filter(
    (tp) => tp.type === 'breakout' && tp.priceType === 'close'
  ).length;
  const highBreakoutCount = filteredTouchPoints.filter(
    (tp) => tp.type === 'breakout' && tp.priceType === 'high'
  ).length;

  return { filteredTouchPoints, breakoutCount, closeBreakoutCount, highBreakoutCount };
}

// ── 티커 1개 시뮬레이션 ───────────────────────────────────────────────────────

/**
 * 티커 1개에 대해 추세선 시뮬레이션을 실행하고 SimResult를 반환한다.
 * 조건을 만족하지 않으면 null을 반환한다.
 *
 * @param ticker - 티커 심볼
 * @param name   - 종목명
 * @param prices - 전체 가격 데이터 (이미 barUnit 변환 및 슬라이싱 완료된 것)
 * @param cfg    - 기간별 시뮬레이션 설정
 */
export function runTickerSim(
  ticker: string,
  name: string,
  prices: PriceDataPoint[],
  cfg: PeriodConfig
): SimResult | null {
  if (prices.length === 0) return null;
  // 추세선은 마지막 1봉(장중 잠정/미확정 가능)을 제외하고 작도한다.
  // 봉이 1개뿐이면 제외 후 남는 봉이 없어 작도가 불가능하므로 조기 종료한다.
  // (2봉 이상이어도 실제 작도 범위가 2점 미만이면 아래 simTrendIndices 가드에서 다시 걸러진다.)
  if (prices.length < 2) return null;

  // 로그 가격으로 변환하여 추세선 계산에 사용한다.
  // log 공간에서 선형 회귀/추세선은 원래 가격 기준 지수 성장 추세를 의미한다.
  // 가격이 0 이하이면 Math.log()가 NaN/-Infinity를 반환하므로 방어 처리한다.
  const safeLog = (val: number) => (val > 0 ? Math.log(val) : 0);
  const closePrices = prices.map((d) => safeLog(d.close));
  const openPrices = prices.map((d) => safeLog(d.open || d.close));
  const highPrices = prices.map((d) => safeLog(d.high || d.close));
  const lowPrices = prices.map((d) => safeLog(d.low || d.close));
  const dates = prices.map((d) => d.date);
  const timestamps = prices.map((d) => new Date(d.date).getTime());

  // ── 주봉 날짜 스냅 ────────────────────────────────────────────────────
  const effectiveTrendStart =
    cfg.barUnit === 'weekly' && cfg.trendStartDate
      ? snapDateUp(dates, cfg.trendStartDate)
      : cfg.trendStartDate;
  const effectiveTrendEnd =
    cfg.barUnit === 'weekly' && cfg.trendEndDate
      ? snapDateDown(dates, cfg.trendEndDate)
      : cfg.trendEndDate;
  const effectiveFilterStart =
    cfg.barUnit === 'weekly' && cfg.filterStartDate
      ? snapDateUp(dates, cfg.filterStartDate)
      : cfg.filterStartDate;
  const effectiveFilterEnd =
    cfg.barUnit === 'weekly' && cfg.filterEndDate
      ? snapDateDown(dates, cfg.filterEndDate)
      : cfg.filterEndDate;

  // ── 추세선 작도 인덱스 ────────────────────────────────────────────────
  const simTrendIndices = buildTrendIndices(dates, effectiveTrendStart, effectiveTrendEnd);

  // 유효한 추세선은 시작·끝 2개 점이 필요하다. 작도 범위가 1봉 이하이면
  // 기울기 0의 수평선만 나와 의미가 없고 불필요한 연산·렌더 오류를 유발하므로 종료한다.
  // (마지막 1봉 제외 자동 채움에서는 전체 2봉 → 작도 가용 1봉이 되어 여기서 걸러진다.)
  if (simTrendIndices.length < 2) return null;

  const simHighs = simTrendIndices.map((i) => highPrices[i]!);
  const simLows = simTrendIndices.map((i) => lowPrices[i]!);
  const simCloses = simTrendIndices.map((i) => closePrices[i]!);
  const simOpens = simTrendIndices.map((i) => openPrices[i] || closePrices[i]!);

  // ── 가격 기준 선택 ────────────────────────────────────────────────────
  const { currentHighs, currentLows, currentCloses, currentOpens } = selectPriceBasis(
    cfg.trendBase,
    simHighs,
    simLows,
    simCloses,
    simOpens
  );

  // ── 추세선 알고리즘 계산 ──────────────────────────────────────────────
  let srRaw: SRPoint[] = [];
  if (cfg.trendAlgo === 'regression') {
    srRaw = calcLinearRegressionChannel(currentCloses, cfg.regressionStdDev);
  } else if (cfg.trendAlgo === 'zigzag') {
    srRaw = calcZigZagSupportResistance(
      currentHighs,
      currentLows,
      currentCloses,
      currentOpens,
      cfg.zigzagThreshold
    );
  } else {
    srRaw = calcSupportResistance(currentHighs, currentLows, currentCloses, currentOpens);
  }

  // ── 저항선/지지선 m, c 계산 ───────────────────────────────────────────
  const firstIdx = simTrendIndices[0]!;
  const lastIdx = simTrendIndices[simTrendIndices.length - 1]!;
  const line = calcTrendLine(srRaw, firstIdx, lastIdx);
  const { mR, cR } = line;

  // ── 터치/돌파 판정 ────────────────────────────────────────────────────
  const touchResult =
    cR != null
      ? calcTrendTouchPoints({
          timestamps,
          highPrices,
          closePrices,
          m: mR,
          c: cR,
          trendMinIdx: firstIdx,
          trendMaxIdx: lastIdx,
          touchTolerance: cfg.trendTouchTolerance,
          breakoutTolerance: cfg.trendBreakoutTolerance,
          touchBasis: cfg.trendTouchBasis,
        })
      : {
          touchPoints: [] as TrendTouchPoint[],
          touchCount: 0,
          closeTouchCount: 0,
          highTouchCount: 0,
          breakoutCount: 0,
          closeBreakoutCount: 0,
          highBreakoutCount: 0,
        };

  const { touchPoints: rawTouchPoints, touchCount, closeTouchCount, highTouchCount } = touchResult;

  // ── 돌파 날짜 필터 ────────────────────────────────────────────────────
  const parsedStart = effectiveFilterStart ? new Date(effectiveFilterStart).getTime() : 0;
  const filterStartMs = isNaN(parsedStart) ? 0 : parsedStart;
  const parsedEnd = effectiveFilterEnd ? new Date(effectiveFilterEnd).getTime() : Infinity;
  const filterEndMs = isNaN(parsedEnd) ? Infinity : parsedEnd;

  const { filteredTouchPoints, breakoutCount, closeBreakoutCount, highBreakoutCount } =
    filterTouchPoints(rawTouchPoints, filterStartMs, filterEndMs);

  const totalCount = touchCount + breakoutCount;
  if (totalCount === 0) return null;

  // ── 기울기 필터 ───────────────────────────────────────────────────────
  const { resistanceData, supportData, zigzagData } = buildChartData(
    timestamps,
    prices.length,
    simTrendIndices,
    srRaw,
    line,
    cfg.trendAlgo
  );

  const { slope, slopeType } = calcSlopeInfo(resistanceData);

  const slopeMinNum = cfg.slopeMin !== '' ? parseFloat(cfg.slopeMin) : null;
  const slopeMaxNum = cfg.slopeMax !== '' ? parseFloat(cfg.slopeMax) : null;

  if (cfg.slopeFilter === 'positive' && slopeType !== 'positive') return null;
  if (cfg.slopeFilter === 'negative' && slopeType !== 'negative') return null;
  if (slopeMinNum !== null && slope < slopeMinNum) return null;
  if (slopeMaxNum !== null && slope > slopeMaxNum) return null;

  // ── 결과 조립 ─────────────────────────────────────────────────────────
  const latestResistance = cR != null ? mR * (prices.length - 1) + cR : null;

  return {
    ticker,
    name,
    touchCount,
    closeTouchCount,
    highTouchCount,
    breakoutCount,
    closeBreakoutCount,
    highBreakoutCount,
    prices,
    resistanceData,
    supportData,
    zigzagData,
    latestResistance,
    touchPoints: rawTouchPoints as TouchPoint[],
    filteredTouchPoints,
    slopeType,
    slope,
    totalCount,
  };
}

// ── 결과 정렬 ─────────────────────────────────────────────────────────────────

/**
 * SimResult 배열을 totalCount 내림차순으로 정렬한다. (in-place)
 */
export function sortSimResults(results: SimResult[]): SimResult[] {
  return results.sort((a, b) => (b.totalCount ?? 0) - (a.totalCount ?? 0));
}

// ── 패턴 필터 ─────────────────────────────────────────────────────────────────

/**
 * "돌파 이전 터치 N회 이상" 패턴을 만족하는 종목만 남긴다.
 *
 * 조건:
 *   1. breakoutCount > 0  (돌파가 존재해야 함)
 *   2. 돌파 이전 touch 횟수 >= minTouches  (저항선 검증 횟수 충족)
 *
 * 돌파 이전 기준: touchPoints 중 첫 번째 breakout의 x 이전의 touch
 * → filterStart 이후라도 첫 돌파 이전이면 터치로 인정한다.
 *
 * @param results     - SimResult 배열
 * @param minTouches  - 최소 터치 횟수
 */
export function applyPatternFilter(
  results: SimResult[],
  _filterStartMs: number,
  minTouches: number
): SimResult[] {
  return results.filter((sim) => {
    if ((sim.breakoutCount ?? 0) === 0) return false;
    const firstBreakout = sim.touchPoints.find((tp) => tp.type === 'breakout');
    if (!firstBreakout) return false;
    const touchesBefore = sim.touchPoints.filter(
      (tp) => tp.type === 'touch' && tp.x < firstBreakout.x
    );
    return touchesBefore.length >= minTouches;
  });
}

// ── 주봉 변환 re-export ───────────────────────────────────────────────────────

export { convertToWeeklyBars };
