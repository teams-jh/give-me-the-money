'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useMemo, useState, useCallback } from 'react';

import { allTickersData } from 'src/library/tickers';
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
            if (breakoutCount === 0) return false;
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

      for (const period of simPeriods) {
        const periodResults: SimResult[] = [];
        const days = PERIOD_DAYS[period];

        for (const [ticker, rawData] of Object.entries(allTickersData)) {
          if (!rawData) continue;

          // 시장 필터
          const isKR = ticker.includes('.KS') || ticker.includes('.KQ');
          if (simMarket === 'KR' && !isKR) continue;
          if (simMarket === 'US' && isKR)  continue;

          const allPrices  = (rawData.prices || []) as PriceDataPoint[];
          const slice      = allPrices.slice(-days);
          if (slice.length < 10) continue;

          const dates       = slice.map(p => p.date);
          const timestamps  = slice.map(p => Date.parse(p.date));
          const highPrices  = slice.map(p => p.high  ?? p.close);
          const lowPrices   = slice.map(p => p.low   ?? p.close);
          const closePrices = slice.map(p => p.close);
          const openPrices  = slice.map(p => p.open  ?? p.close);

          // 작도 범위 인덱스 산출
          let simTrendIndices: number[] = [];
          if (trendStartDate && trendEndDate) {
            for (let i = 0; i < dates.length; i++) {
              const d = dates[i];
              if (d >= trendStartDate && d <= trendEndDate) simTrendIndices.push(i);
            }
          }
          if (simTrendIndices.length === 0) {
            simTrendIndices = dates.map((_, idx) => idx);
          }

          // trendBase에 따른 가격 변환 (작도 범위 슬라이스)
          const simHighs  = simTrendIndices.map(i => highPrices[i]);
          const simLows   = simTrendIndices.map(i => lowPrices[i]);
          const simCloses = simTrendIndices.map(i => closePrices[i]);
          const simOpens  = simTrendIndices.map(i => openPrices[i]);

          const currentHighs  = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simHighs;
          const currentLows   = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simLows;
          const currentCloses = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simCloses;
          const currentOpens  = trendBase === 'close' ? simCloses : trendBase === 'open' ? simOpens : simOpens;

          // 추세선 계산 (use-chart-indicators.ts와 동일한 패턴)
          let srRaw: { support: number | null; resistance: number | null; zigzag?: number | null }[] = [];

          if (trendAlgo === 'regression') {
            srRaw = calcLinearRegressionChannel(currentCloses, regressionStdDev);
          } else if (trendAlgo === 'zigzag') {
            srRaw = calcZigZagSupportResistance(currentHighs, currentLows, currentCloses, currentOpens, zigzagThreshold);
          } else {
            srRaw = calcSupportResistance(currentHighs, currentLows, currentCloses, currentOpens);
          }

          // srRaw 시작/끝값으로 m, c 산출
          const firstIdx = simTrendIndices[0];
          const lastIdx  = simTrendIndices[simTrendIndices.length - 1];
          const deltaX   = lastIdx - firstIdx || 1;

          const resistanceStart = srRaw[0]?.resistance;
          const resistanceEnd   = srRaw[srRaw.length - 1]?.resistance;
          const supportStart    = srRaw[0]?.support;
          const supportEnd      = srRaw[srRaw.length - 1]?.support;

          const mResistance = resistanceStart != null && resistanceEnd != null
            ? (resistanceEnd - resistanceStart) / deltaX : 0;
          const cResistance = resistanceStart != null
            ? resistanceStart - mResistance * firstIdx : null;

          const mSupport = supportStart != null && supportEnd != null
            ? (supportEnd - supportStart) / deltaX : 0;
          const cSupport = supportStart != null
            ? supportStart - mSupport * firstIdx : null;

          if (cResistance === null) continue;

          // 터치/돌파 판정
          const touchResult = calcTrendTouchPoints({
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
          });

          // 차트 데이터
          const resistanceData = [
            { x: timestamps[0],                     y: cResistance },
            { x: timestamps[timestamps.length - 1], y: mResistance * (timestamps.length - 1) + cResistance },
          ];
          const supportData = cSupport != null ? [
            { x: timestamps[0],                     y: cSupport },
            { x: timestamps[timestamps.length - 1], y: mSupport * (timestamps.length - 1) + cSupport },
          ] : undefined;
          const zigzagData = trendAlgo === 'zigzag'
            ? srRaw
                .map((pt, idx) => ({ x: timestamps[simTrendIndices[idx]], y: pt.zigzag }))
                .filter((pt): pt is { x: number; y: number } => pt.y != null)
            : undefined;

          // 기울기 분류
          const firstR       = resistanceData[0]?.y ?? 0;
          const lastR        = resistanceData[resistanceData.length - 1]?.y ?? 0;
          const slope        = lastR - firstR;
          const slopePercent = firstR !== 0 ? (slope / firstR) * 100 : 0;
          const slopeType: 'positive' | 'negative' | 'flat' =
            slope > 0.001 ? 'positive' : slope < -0.001 ? 'negative' : 'flat';

          periodResults.push({
            ticker,
            name:             rawData.info?.name ?? ticker,
            prices:           slice,
            resistanceData,
            supportData,
            zigzagData,
            latestResistance: mResistance * (timestamps.length - 1) + cResistance,
            slopeType,
            slope:            slopePercent,
            ...touchResult,
          });
        }

        periodResults.sort((a, b) => (b.breakoutCount + b.touchCount) - (a.breakoutCount + a.touchCount));
        newResultsByPeriod[period] = periodResults;
      }

      setResultsByPeriod(newResultsByPeriod);
      setIsSimulating(false);
    }, 0);
  }, [
    simMarket, simPeriods,
    trendBase, trendAlgo, zigzagThreshold, regressionStdDev,
    trendStartDate, trendEndDate,
    trendTouchBasis, trendTouchTolerance, trendBreakoutTolerance,
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
