'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useMemo, useState, useCallback, useEffect } from 'react';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import {
  calcSupportResistance,
  calcLinearRegressionChannel,
  calcZigZagSupportResistance,
} from 'src/library/shared/indicators';
import { calcTrendTouchPoints, intersectSimResults } from 'src/library/shared/signals';
import type { TrendSimFinalResult } from 'src/library/shared/signals';

import type { SimResult, PriceDataPoint } from './use-chart-indicators';

// ----------------------------------------------------------------------

export type { TrendSimFinalResult };

export interface UseTrendSimulationReturn {
  // ── 시장 / 기간 ─────────────────────────────────────────────────────
  simMarket:              'US' | 'KR';
  setSimMarket:           (v: 'US' | 'KR') => void;
  simPeriods:             PeriodKey[];
  setSimPeriods:          (v: PeriodKey[]) => void;

  // ── 추세선 파라미터 ──────────────────────────────────────────────────
  trendBase:              'highlow' | 'close' | 'open';
  setTrendBase:           (v: 'highlow' | 'close' | 'open') => void;
  trendAlgo:              'swing' | 'zigzag' | 'regression';
  setTrendAlgo:           (v: 'swing' | 'zigzag' | 'regression') => void;
  zigzagThreshold:        number;
  setZigzagThreshold:     (v: number) => void;
  regressionStdDev:       number;
  setRegressionStdDev:    (v: number) => void;
  trendStartDate:         string;
  setTrendStartDate:      (v: string) => void;
  trendEndDate:           string;
  setTrendEndDate:        (v: string) => void;

  // ── 터치/돌파 파라미터 ───────────────────────────────────────────────
  trendTouchBasis:        'close' | 'high' | 'both';
  setTrendTouchBasis:     (v: 'close' | 'high' | 'both') => void;
  trendTouchTolerance:    number;
  setTrendTouchTolerance: (v: number) => void;
  trendBreakoutTolerance: number;
  setTrendBreakoutTolerance: (v: number) => void;

  // ── 결과 필터 ────────────────────────────────────────────────────────
  filterStartDate:        string;
  setFilterStartDate:     (v: string) => void;
  filterEndDate:          string;
  setFilterEndDate:       (v: string) => void;
  slopeFilter:            'all' | 'positive' | 'negative';
  setSlopeFilter:         (v: 'all' | 'positive' | 'negative') => void;
  slopeMin:               string;
  setSlopeMin:            (v: string) => void;
  slopeMax:               string;
  setSlopeMax:            (v: string) => void;
  enablePatternFilter:    boolean;
  setEnablePatternFilter: (v: boolean) => void;
  minTouchesPattern:      number;
  setMinTouchesPattern:   (v: number) => void;

  // ── 실행 / 결과 ──────────────────────────────────────────────────────
  isSimulating:           boolean;
  finalResults:           TrendSimFinalResult<SimResult>[];
  runSimulation:          () => void;
}

// ----------------------------------------------------------------------

const PERIOD_DAYS: Record<PeriodKey, number> = {
  '3m': 63, '1y': 252, '2y': 504, '3y': 756,
};

// ----------------------------------------------------------------------

export function useTrendSimulation(): UseTrendSimulationReturn {
  // ── 시장 / 기간 ─────────────────────────────────────────────────────
  const [simMarket,  setSimMarket]  = useState<'US' | 'KR'>('US');
  const [simPeriods, setSimPeriods] = useState<PeriodKey[]>(['1y']);

  // ── 추세선 파라미터 ──────────────────────────────────────────────────
  const [trendBase,          setTrendBase]          = useState<'highlow' | 'close' | 'open'>('highlow');
  const [trendAlgo,          setTrendAlgo]          = useState<'swing' | 'zigzag' | 'regression'>('swing');
  const [zigzagThreshold,    setZigzagThreshold]    = useState(5);
  const [regressionStdDev,   setRegressionStdDev]   = useState(2.0);
  const [trendStartDate,     setTrendStartDate]     = useState('');
  const [trendEndDate,       setTrendEndDate]       = useState('');

  // ── 기준 날짜 정보 (실제 거래일 기반) ────────────────────────────────
  const referenceInfo = useMemo(() => {
    const refTicker = allTickersList.find(t => !t.includes('.'));
    const prices = (allTickersData[refTicker ?? '']?.prices || []) as { date: string }[];
    if (prices.length === 0) return null;

    const dates   = prices.map(p => p.date);
    const lastDate = dates[dates.length - 1];

    /** n 거래일 전 날짜 반환 */
    const getNDaysAgo = (n: number): string =>
      dates[Math.max(0, dates.length - 1 - n)] ?? lastDate;

    /** 기간 시작 날짜 반환 */
    const getPeriodStart = (period: PeriodKey): string => {
      const daysMap: Record<PeriodKey, number> = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
      return dates[Math.max(0, dates.length - daysMap[period])] ?? dates[0];
    };

    return { lastDate, getNDaysAgo, getPeriodStart };
  }, []);

  // ── 터치/돌파 파라미터 ───────────────────────────────────────────────
  const [trendTouchBasis,        setTrendTouchBasis]        = useState<'close' | 'high' | 'both'>('both');
  const [trendTouchTolerance,    setTrendTouchTolerance]    = useState(2);
  const [trendBreakoutTolerance, setTrendBreakoutTolerance] = useState(2);

  // ── 결과 필터 ────────────────────────────────────────────────────────
  const [filterStartDate,     setFilterStartDate]     = useState('');
  const [filterEndDate,       setFilterEndDate]       = useState('');
  const [slopeFilter,         setSlopeFilter]         = useState<'all' | 'positive' | 'negative'>('all');
  const [slopeMin,            setSlopeMin]            = useState('');
  const [slopeMax,            setSlopeMax]            = useState('');
  const [enablePatternFilter, setEnablePatternFilter] = useState(false);
  const [minTouchesPattern,   setMinTouchesPattern]   = useState(3);

  // ── 기본값 초기화 및 기간 변경 시 작도 범위 자동 갱신 ──────────────
  useEffect(() => {
    if (!referenceInfo) return;
    const { lastDate, getNDaysAgo, getPeriodStart } = referenceInfo;

    // 추세선 작도 범위: 선택된 기간 중 가장 긴 기간의 시작 ~ 마지막 날짜
    const periodOrder: PeriodKey[] = ['3m', '1y', '2y', '3y'];
    const longestPeriod = simPeriods.reduce<PeriodKey>(
      (longest, p) => periodOrder.indexOf(p) > periodOrder.indexOf(longest) ? p : longest,
      simPeriods[0] ?? '1y'
    );
    setTrendStartDate(getPeriodStart(longestPeriod));
    setTrendEndDate(lastDate);
  }, [simPeriods, referenceInfo]);

  useEffect(() => {
    if (!referenceInfo) return;
    const { lastDate, getNDaysAgo } = referenceInfo;

    // 분석 날짜 범위: 마지막 주가 기준 최근 4거래일 (초기 1회만)
    setFilterStartDate(getNDaysAgo(3));
    setFilterEndDate(lastDate);
  }, [referenceInfo]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 실행 결과 ────────────────────────────────────────────────────────
  const [isSimulating,      setIsSimulating]      = useState(false);
  const [resultsByPeriod,   setResultsByPeriod]   = useState<Partial<Record<PeriodKey, SimResult[]>>>({});

  // ── 필터 적용 + 교집합 계산 ──────────────────────────────────────────
  const finalResults = useMemo<TrendSimFinalResult<SimResult>[]>(() => {
    const startMs = filterStartDate ? new Date(filterStartDate).getTime() : 0;
    const endMs   = filterEndDate   ? new Date(filterEndDate).getTime()   : Infinity;
    const slopeMinNum = slopeMin !== '' ? parseFloat(slopeMin) : null;
    const slopeMaxNum = slopeMax !== '' ? parseFloat(slopeMax) : null;

    // 기간별로 필터 적용
    const filteredByPeriod: Partial<Record<PeriodKey, SimResult[]>> = {};

    for (const [period, results] of Object.entries(resultsByPeriod) as [PeriodKey, SimResult[]][]) {
      const filtered = results
        .map(sim => {
          // 돌파 포인트에 날짜 필터 적용
          const filteredTouchPoints = sim.touchPoints.filter(
            tp => tp.type === 'touch' || (tp.x >= startMs && tp.x <= endMs)
          );
          const breakoutCount      = filteredTouchPoints.filter(tp => tp.type === 'breakout').length;
          const closeBreakoutCount = filteredTouchPoints.filter(tp => tp.type === 'breakout' && tp.priceType === 'close').length;
          const highBreakoutCount  = filteredTouchPoints.filter(tp => tp.type === 'breakout' && tp.priceType === 'high').length;
          const totalCount         = sim.touchCount + breakoutCount;

          return { ...sim, filteredTouchPoints, breakoutCount, closeBreakoutCount, highBreakoutCount, totalCount };
        })
        .filter(sim => {
          // 조건 만족 종목만 (터치 or 돌파 > 0)
          if ((sim.totalCount ?? 0) === 0) return false;

          // 돌파 패턴 필터
          if (enablePatternFilter) {
            if (sim.breakoutCount === 0) return false;
            const touchesBefore = sim.touchPoints.filter(
              tp => tp.type === 'touch' && tp.x < (startMs > 0 ? startMs : Infinity)
            );
            if (touchesBefore.length < minTouchesPattern) return false;
          }

          // 기울기 필터
          if (slopeFilter === 'positive' && sim.slopeType !== 'positive') return false;
          if (slopeFilter === 'negative' && sim.slopeType !== 'negative') return false;

          const slope = sim.slope ?? 0;
          if (slopeMinNum !== null && slope < slopeMinNum) return false;
          if (slopeMaxNum !== null && slope > slopeMaxNum) return false;

          return true;
        });

      filtered.sort((a, b) => (b.totalCount ?? 0) - (a.totalCount ?? 0));
      filteredByPeriod[period] = filtered;
    }

    // AND 교집합 계산
    return intersectSimResults(filteredByPeriod);
  }, [resultsByPeriod, filterStartDate, filterEndDate, enablePatternFilter, minTouchesPattern, slopeFilter, slopeMin, slopeMax]);

  // ── 시뮬레이션 실행 ──────────────────────────────────────────────────
  const runSimulation = useCallback(() => {
    if (simPeriods.length === 0) return;

    setIsSimulating(true);
    setResultsByPeriod({});

    setTimeout(() => {
      const newResultsByPeriod: Partial<Record<PeriodKey, SimResult[]>> = {};

      for (const p of simPeriods) {
        const results: SimResult[] = [];
        const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
        const days = daysMap[p];

        // 기존 use-chart-indicators.ts 와 동일한 종목 목록 생성 방식
        const isKr = simMarket === 'KR';
        const tickerOptions = allTickersList
          .filter(t => isKr ? t.includes('.') : !t.includes('.'))
          .map(ticker => {
            const info = allTickersData[ticker]?.info;
            const name = isKr ? info?.kr_name || info?.name || '' : info?.name || '';
            return { ticker, name };
          });

        for (const opt of tickerOptions) {
          const rawData = allTickersData[opt.ticker];
          if (!rawData) continue;

          const allPrices = (rawData.prices || []) as PriceDataPoint[];
          const slice = allPrices.slice(-days);
          if (slice.length === 0) continue;

          const closePrices = slice.map((p) => p.close);
          const openPrices  = slice.map((p) => p.open  || p.close);
          const highPrices  = slice.map((p) => p.high  || p.close);
          const lowPrices   = slice.map((p) => p.low   || p.close);
          const dates       = slice.map((p) => p.date);
          const timestamps  = slice.map((p) => new Date(p.date).getTime());

          let simTrendIndices: number[] = [];
          if (trendStartDate && trendEndDate) {
            dates.forEach((d, idx) => {
              if (d >= trendStartDate && d <= trendEndDate) {
                simTrendIndices.push(idx);
              }
            });
          }
          if (simTrendIndices.length === 0) {
            simTrendIndices = dates.map((_, idx) => idx);
          }

          const simHighs  = simTrendIndices.map((i) => highPrices[i]);
          const simLows   = simTrendIndices.map((i) => lowPrices[i]);
          const simCloses = simTrendIndices.map((i) => closePrices[i]);
          const simOpens  = simTrendIndices.map((i) => openPrices[i] || closePrices[i]);

          const currentHighs  = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simHighs;
          const currentLows   = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simLows;
          const currentCloses = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simCloses;
          const currentOpens  = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simOpens;

          let srRaw: { support: number | null; resistance: number | null; zigzag?: number | null }[] = [];

          if (trendAlgo === 'regression') {
            srRaw = calcLinearRegressionChannel(currentCloses, regressionStdDev);
          } else if (trendAlgo === 'zigzag') {
            srRaw = calcZigZagSupportResistance(
              currentHighs, currentLows, currentCloses, currentOpens, zigzagThreshold
            );
          } else {
            srRaw = calcSupportResistance(currentHighs, currentLows, currentCloses, currentOpens);
          }

          const firstIdx = simTrendIndices[0];
          const lastIdx  = simTrendIndices[simTrendIndices.length - 1];

          const supportStart    = srRaw[0]?.support;
          const supportEnd      = srRaw[srRaw.length - 1]?.support;
          const resistanceStart = srRaw[0]?.resistance;
          const resistanceEnd   = srRaw[srRaw.length - 1]?.resistance;

          const deltaX = lastIdx - firstIdx || 1;

          const mSupport = supportStart !== null && supportStart !== undefined && supportEnd !== null && supportEnd !== undefined
            ? (supportEnd - supportStart) / deltaX : 0;
          const cSupport = supportStart !== null && supportStart !== undefined
            ? supportStart - mSupport * firstIdx : null;

          const mResistance = resistanceStart !== null && resistanceStart !== undefined && resistanceEnd !== null && resistanceEnd !== undefined
            ? (resistanceEnd - resistanceStart) / deltaX : 0;
          const cResistance = resistanceStart !== null && resistanceStart !== undefined
            ? resistanceStart - mResistance * firstIdx : null;

          const touchResult = (cResistance !== null && cResistance !== undefined)
            ? calcTrendTouchPoints({
                timestamps,
                highPrices,
                closePrices,
                m:                 mResistance,
                c:                 cResistance,
                trendMinIdx:       simTrendIndices[0],
                trendMaxIdx:       simTrendIndices[simTrendIndices.length - 1],
                touchTolerance:    trendTouchTolerance,
                breakoutTolerance: trendBreakoutTolerance,
                touchBasis:        trendTouchBasis,
              })
            : { touchPoints: [] as TrendTouchPoint[], touchCount: 0, closeTouchCount: 0, highTouchCount: 0, breakoutCount: 0, closeBreakoutCount: 0, highBreakoutCount: 0 };

          const { touchPoints: itemTouchPoints, touchCount, closeTouchCount, highTouchCount, breakoutCount, closeBreakoutCount, highBreakoutCount } = touchResult;

          const resistanceData = cResistance !== null && cResistance !== undefined
            ? [
                { x: new Date(dates[0]).getTime(), y: cResistance },
                { x: new Date(dates[dates.length - 1]).getTime(), y: mResistance * (dates.length - 1) + cResistance },
              ]
            : [];

          const supportData = cSupport !== null && cSupport !== undefined
            ? [
                { x: new Date(dates[0]).getTime(), y: cSupport },
                { x: new Date(dates[dates.length - 1]).getTime(), y: mSupport * (dates.length - 1) + cSupport },
              ]
            : [];

          const zigzagData = srRaw
            .map((pt, idx) => ({
              x: new Date(dates[simTrendIndices[idx]]).getTime(),
              y: pt.zigzag,
            }))
            .filter((pt): pt is { x: number; y: number } => pt.y !== null && pt.y !== undefined);

          const firstR       = resistanceData[0]?.y ?? 0;
          const lastR        = resistanceData[resistanceData.length - 1]?.y ?? 0;
          const slope        = lastR - firstR;
          const slopePercent = firstR !== 0 ? (slope / firstR) * 100 : 0;
          const slopeType: 'positive' | 'negative' | 'flat' =
            slope > 0.001 ? 'positive' : slope < -0.001 ? 'negative' : 'flat';

          results.push({
            ticker:           opt.ticker,
            name:             opt.name,
            touchCount:       highTouchCount + closeTouchCount,
            closeTouchCount,
            highTouchCount,
            breakoutCount:    highBreakoutCount + closeBreakoutCount,
            closeBreakoutCount,
            highBreakoutCount,
            prices:           slice,
            resistanceData,
            supportData,
            zigzagData:       trendAlgo === 'zigzag' ? zigzagData : undefined,
            latestResistance: cResistance !== null && cResistance !== undefined
              ? mResistance * (dates.length - 1) + cResistance : null,
            touchPoints:      itemTouchPoints,
            slopeType,
            slope:            slopePercent,
          });
        }

        results.sort((a, b) => (b.touchCount + b.breakoutCount) - (a.touchCount + a.breakoutCount));
        newResultsByPeriod[p] = results;
      }

      setResultsByPeriod(newResultsByPeriod);
      setIsSimulating(false);
    }, 150);
  }, [
    simMarket,
    simPeriods,
    trendStartDate,
    trendEndDate,
    trendBase,
    trendAlgo,
    zigzagThreshold,
    regressionStdDev,
    trendTouchTolerance,
    trendBreakoutTolerance,
    trendTouchBasis,
  ]);

  return {
    simMarket, setSimMarket,
    simPeriods, setSimPeriods,
    trendBase, setTrendBase,
    trendAlgo, setTrendAlgo,
    zigzagThreshold, setZigzagThreshold,
    regressionStdDev, setRegressionStdDev,
    trendStartDate, setTrendStartDate,
    trendEndDate, setTrendEndDate,
    trendTouchBasis, setTrendTouchBasis,
    trendTouchTolerance, setTrendTouchTolerance,
    trendBreakoutTolerance, setTrendBreakoutTolerance,
    filterStartDate, setFilterStartDate,
    filterEndDate, setFilterEndDate,
    slopeFilter, setSlopeFilter,
    slopeMin, setSlopeMin,
    slopeMax, setSlopeMax,
    enablePatternFilter, setEnablePatternFilter,
    minTouchesPattern, setMinTouchesPattern,
    isSimulating,
    finalResults,
    runSimulation,
  };
}
