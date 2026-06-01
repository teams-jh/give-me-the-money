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

          const allPrices = (rawData.prices || []) as PriceDataPoint[];
          const slice     = allPrices.slice(-days);
          if (slice.length < 10) continue;

          const dates      = slice.map(p => p.date);
          const timestamps = slice.map(p => new Date(p.date).getTime());
          const highPrices  = slice.map(p => p.high);
          const lowPrices   = slice.map(p => p.low);
          const closePrices = slice.map(p => p.close);

          // 작도 범위 인덱스 산출
          let trendIndices = dates.map((_, idx) => idx);
          if (trendStartDate && trendEndDate) {
            const filtered = dates
              .map((d, idx) => ({ d, idx }))
              .filter(({ d }) => d >= trendStartDate && d <= trendEndDate)
              .map(({ idx }) => idx);
            if (filtered.length > 0) trendIndices = filtered;
          }

          // 추세선 계산
          let mResistance = 0, cResistance: number | null = null;

          if (trendAlgo === 'regression') {
            const ch = calcLinearRegressionChannel({ closePrices, stdDevMultiplier: regressionStdDev });
            mResistance  = ch.mUpper;
            cResistance  = ch.cUpper;
          } else if (trendAlgo === 'zigzag') {
            const sr = calcZigZagSupportResistance({ highPrices, lowPrices, closePrices, threshold: zigzagThreshold / 100 });
            if (sr.resistance.length >= 2) {
              const [p1, p2] = sr.resistance.slice(-2);
              mResistance    = (p2.y - p1.y) / (p2.x - p1.x);
              cResistance    = p1.y - mResistance * p1.x;
            }
          } else {
            const sr = calcSupportResistance({ highPrices, lowPrices, closePrices, openPrices: slice.map(p => p.open), dates, trendBase, trendIndices });
            mResistance  = sr.mResistance;
            cResistance  = sr.cResistance;
          }

          if (cResistance === null) continue;

          // 터치/돌파 판정
          const touchResult = calcTrendTouchPoints({
            timestamps,
            highPrices,
            closePrices,
            m:                 mResistance,
            c:                 cResistance,
            trendMinIdx:       trendIndices[0],
            trendMaxIdx:       trendIndices[trendIndices.length - 1],
            touchTolerance:    trendTouchTolerance,
            breakoutTolerance: trendBreakoutTolerance,
            touchBasis:        trendTouchBasis,
          });

          // 기울기 분류
          const slopeType: 'positive' | 'negative' | 'flat' =
            mResistance > 0.001 ? 'positive' : mResistance < -0.001 ? 'negative' : 'flat';

          // 저항선 데이터
          const resistanceData = [
            { x: timestamps[0],               y: cResistance },
            { x: timestamps[timestamps.length - 1], y: mResistance * (timestamps.length - 1) + cResistance },
          ];

          periodResults.push({
            ticker,
            name:                rawData.name ?? ticker,
            prices:              slice,
            resistanceData,
            latestResistance:    mResistance * (timestamps.length - 1) + cResistance,
            slopeType,
            slope:               mResistance,
            ...touchResult,
          });
        }

        // 기간 내 정렬: 돌파 내림차순
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
