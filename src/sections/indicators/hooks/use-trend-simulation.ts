'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useMemo, useState, useCallback, useEffect } from 'react';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import {
  calcSupportResistance,
  calcLinearRegressionChannel,
  calcZigZagSupportResistance,
  convertToWeeklyBars,
} from 'src/library/shared/indicators';
import { calcTrendTouchPoints, intersectSimResults } from 'src/library/shared/signals';
import type { TrendSimFinalResult, TrendTouchPoint } from 'src/library/shared/signals';

import type { SimResult, PriceDataPoint } from './use-chart-indicators';

// ----------------------------------------------------------------------

export type { TrendSimFinalResult };

/** 기간별 독립 입력 묶음 */
export type BarUnit = 'daily' | 'weekly';

export interface PeriodConfig {
  barUnit:                BarUnit;
  trendBase:              'highlow' | 'close' | 'open';
  trendAlgo:              'swing' | 'zigzag' | 'regression';
  zigzagThreshold:        number;
  regressionStdDev:       number;
  trendStartDate:         string;
  trendEndDate:           string;
  trendTouchBasis:        'close' | 'high' | 'both';
  trendTouchTolerance:    number;
  trendBreakoutTolerance: number;
  filterStartDate:        string;
  filterEndDate:          string;
  slopeFilter:            'all' | 'positive' | 'negative';
  slopeMin:               string;
  slopeMax:               string;
}

export interface UseTrendSimulationReturn {
  simMarket:          'US' | 'KR';
  setSimMarket:       (v: 'US' | 'KR') => void;
  simPeriods:         PeriodKey[];
  togglePeriod:       (p: PeriodKey) => void;
  periodConfigs:      Partial<Record<PeriodKey, PeriodConfig>>;
  updatePeriodConfig: (p: PeriodKey, updates: Partial<PeriodConfig>) => void;
  isSimulating:       boolean;
  finalResults:       TrendSimFinalResult<SimResult>[];
  runSimulation:      () => void;
  enablePatternFilter:    boolean;
  setEnablePatternFilter: (v: boolean) => void;
  minTouchesPattern:      number;
  setMinTouchesPattern:   (v: number) => void;
}

// ----------------------------------------------------------------------

const PERIOD_BARS: Record<BarUnit, Record<PeriodKey, number>> = {
  daily:  { '3m': 63,  '1y': 252, '2y': 504, '3y': 756 },
  weekly: { '3m': 13,  '1y': 52,  '2y': 104, '3y': 156 },
};

const PERIOD_ORDER: PeriodKey[] = ['3m', '1y', '2y', '3y'];

const DEFAULT_CONFIG: Omit<PeriodConfig, 'trendStartDate' | 'trendEndDate' | 'filterStartDate' | 'filterEndDate'> = {
  barUnit:                'daily',
  trendBase:              'highlow',
  trendAlgo:              'swing',
  zigzagThreshold:        5,
  regressionStdDev:       2.0,
  trendTouchBasis:        'both',
  trendTouchTolerance:    2,
  trendBreakoutTolerance: 2,
  slopeFilter:            'all',
  slopeMin:               '',
  slopeMax:               '',
};

// ----------------------------------------------------------------------

export function useTrendSimulation(): UseTrendSimulationReturn {
  const [simMarket,  setSimMarket]  = useState<'US' | 'KR'>('US');
  const [simPeriods, setSimPeriods] = useState<PeriodKey[]>(['1y']);
  const [periodConfigs, setPeriodConfigs] = useState<Partial<Record<PeriodKey, PeriodConfig>>>({});
  const [enablePatternFilter, setEnablePatternFilter] = useState(false);
  const [minTouchesPattern,   setMinTouchesPattern]   = useState(3);
  const [isSimulating,      setIsSimulating]      = useState(false);
  const [resultsByPeriod,   setResultsByPeriod]   = useState<Partial<Record<PeriodKey, SimResult[]>>>({});

  // ── 기준 날짜 정보 ────────────────────────────────────────────────────
  const referenceInfo = useMemo(() => {
    const refTicker = allTickersList.find(t => !t.includes('.'));
    const prices = (allTickersData[refTicker ?? '']?.prices || []) as { date: string }[];
    if (prices.length === 0) return null;
    const dates    = prices.map(p => p.date);
    const lastDate = dates[dates.length - 1];
    const getNDaysAgo  = (n: number): string => dates[Math.max(0, dates.length - 1 - n)] ?? lastDate;
    // 주봉 변환 후 날짜 배열
    const weeklyBars  = convertToWeeklyBars(prices as any[]);
    const weeklyDates = weeklyBars.map(b => b.date);

    const getPeriodStart = (period: PeriodKey, barUnit: BarUnit = 'daily'): string => {
      const bars = barUnit === 'weekly' ? weeklyDates : dates;
      return bars[Math.max(0, bars.length - PERIOD_BARS[barUnit][period])] ?? bars[0];
    };
    return { lastDate, getNDaysAgo, getPeriodStart };
  }, []);

  // ── 최초 기본값 초기화 ────────────────────────────────────────────────
  useEffect(() => {
    if (!referenceInfo) return;
    const { lastDate, getNDaysAgo, getPeriodStart } = referenceInfo;
    setPeriodConfigs({
      '1y': {
        ...DEFAULT_CONFIG,
        trendStartDate: getPeriodStart('1y', 'daily'),
        trendEndDate:   lastDate,
        filterStartDate: getNDaysAgo(3),
        filterEndDate:   lastDate,
      },
    });
  }, [referenceInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 기간 토글 ─────────────────────────────────────────────────────────
  const togglePeriod = useCallback((p: PeriodKey) => {
    setSimPeriods(prev => {
      if (prev.includes(p)) {
        // 제거: 마지막 1개는 제거 불가
        if (prev.length === 1) return prev;
        setPeriodConfigs(cfg => {
          const next = { ...cfg };
          delete next[p];
          return next;
        });
        return prev.filter(x => x !== p);
      }

      // 추가: 기존 config 중 가장 긴 기간(또는 첫 번째)을 복사 후 날짜만 조정
      setPeriodConfigs(cfg => {
        const srcPeriod = [...prev].sort(
          (a, b) => PERIOD_ORDER.indexOf(b) - PERIOD_ORDER.indexOf(a)
        )[0];
        const src = cfg[srcPeriod] ?? Object.values(cfg)[0];
        const newConfig: PeriodConfig = {
          ...(src ?? DEFAULT_CONFIG),
          trendStartDate:  referenceInfo?.getPeriodStart(p, src?.barUnit ?? 'daily') ?? '',
          trendEndDate:    referenceInfo?.lastDate ?? '',
          filterStartDate: src?.filterStartDate ?? referenceInfo?.getNDaysAgo(3) ?? '',
          filterEndDate:   src?.filterEndDate   ?? referenceInfo?.lastDate ?? '',
        };
        return { ...cfg, [p]: newConfig };
      });
      return [...prev, p].sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b));
    });
  }, [referenceInfo]);

  // ── 기간별 config 업데이트 ────────────────────────────────────────────
  const updatePeriodConfig = useCallback((period: PeriodKey, updates: Partial<PeriodConfig>) => {
    setPeriodConfigs(prev => ({
      ...prev,
      [period]: { ...(prev[period] ?? DEFAULT_CONFIG as PeriodConfig), ...updates },
    }));
  }, []);

  // ── 결과 후처리: 돌파패턴 필터만 실시간 적용 ─────────────────────────
  const finalResults = useMemo<TrendSimFinalResult<SimResult>[]>(() => {
    const filteredByPeriod: Partial<Record<PeriodKey, SimResult[]>> = {};

    for (const [period, results] of Object.entries(resultsByPeriod) as [PeriodKey, SimResult[]][]) {
      const config = periodConfigs[period as PeriodKey];
      const startMs = config?.filterStartDate ? new Date(config.filterStartDate).getTime() : 0;

      const filtered = enablePatternFilter
        ? results.filter(sim => {
            if ((sim.breakoutCount ?? 0) === 0) return false;
            const touchesBefore = sim.touchPoints.filter(
              tp => tp.type === 'touch' && tp.x < (startMs > 0 ? startMs : Infinity)
            );
            if (touchesBefore.length < minTouchesPattern) return false;
            return true;
          })
        : results;
      filteredByPeriod[period as PeriodKey] = filtered;
    }

    return intersectSimResults(filteredByPeriod);
  }, [resultsByPeriod, enablePatternFilter, minTouchesPattern, periodConfigs]);

  // ── 시뮬레이션 실행 ───────────────────────────────────────────────────
  const runSimulation = useCallback(() => {
    if (simPeriods.length === 0) return;

    setIsSimulating(true);
    setResultsByPeriod({});

    setTimeout(() => {
      const newResultsByPeriod: Partial<Record<PeriodKey, SimResult[]>> = {};

      for (const p of simPeriods) {
        const cfg = periodConfigs[p];
        if (!cfg) continue;

        const results: SimResult[] = [];
        const days = PERIOD_BARS[cfg.barUnit ?? 'daily'][p];

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
          const bars = cfg.barUnit === 'weekly'
            ? convertToWeeklyBars(allPrices as any[]) as PriceDataPoint[]
            : allPrices;
          const slice = bars.slice(-days);
          if (slice.length === 0) continue;

          const closePrices = slice.map(d => d.close);
          const openPrices  = slice.map(d => d.open  || d.close);
          const highPrices  = slice.map(d => d.high  || d.close);
          const lowPrices   = slice.map(d => d.low   || d.close);
          const dates       = slice.map(d => d.date);
          const timestamps  = slice.map(d => new Date(d.date).getTime());

          // 주봉 선택 시 날짜를 실제 주봉 날짜(마지막 거래일)로 스냅
          // start → 입력일 이상인 첫 번째 주봉 날짜 (올림)
          // end   → 입력일 이하인 마지막 주봉 날짜 (내림)
          const snapUp   = (d: string) => dates.find(x => x >= d) ?? dates[dates.length - 1];
          const snapDown = (d: string) => [...dates].reverse().find(x => x <= d) ?? dates[0];

          const effectiveTrendStart = cfg.barUnit === 'weekly' && cfg.trendStartDate
            ? snapUp(cfg.trendStartDate)   : cfg.trendStartDate;
          const effectiveTrendEnd   = cfg.barUnit === 'weekly' && cfg.trendEndDate
            ? snapDown(cfg.trendEndDate)   : cfg.trendEndDate;
          const effectiveFilterStart = cfg.barUnit === 'weekly' && cfg.filterStartDate
            ? snapUp(cfg.filterStartDate)  : cfg.filterStartDate;
          const effectiveFilterEnd   = cfg.barUnit === 'weekly' && cfg.filterEndDate
            ? snapDown(cfg.filterEndDate)  : cfg.filterEndDate;

          let simTrendIndices: number[] = [];
          if (effectiveTrendStart && effectiveTrendEnd) {
            dates.forEach((d, idx) => {
              if (d >= effectiveTrendStart && d <= effectiveTrendEnd) simTrendIndices.push(idx);
            });
          }
          if (simTrendIndices.length === 0) simTrendIndices = dates.map((_, idx) => idx);

          const simHighs  = simTrendIndices.map(i => highPrices[i]);
          const simLows   = simTrendIndices.map(i => lowPrices[i]);
          const simCloses = simTrendIndices.map(i => closePrices[i]);
          const simOpens  = simTrendIndices.map(i => openPrices[i] || closePrices[i]);

          const currentHighs  = cfg.trendBase === 'close' ? simCloses : cfg.trendBase === 'open' ? simOpens : simHighs;
          const currentLows   = cfg.trendBase === 'close' ? simCloses : cfg.trendBase === 'open' ? simOpens : simLows;
          const currentCloses = cfg.trendBase === 'close' ? simCloses : cfg.trendBase === 'open' ? simOpens : simCloses;
          const currentOpens  = cfg.trendBase === 'close' ? simCloses : cfg.trendBase === 'open' ? simOpens : simOpens;

          let srRaw: { support: number | null; resistance: number | null; zigzag?: number | null }[] = [];
          if (cfg.trendAlgo === 'regression') {
            srRaw = calcLinearRegressionChannel(currentCloses, cfg.regressionStdDev);
          } else if (cfg.trendAlgo === 'zigzag') {
            srRaw = calcZigZagSupportResistance(currentHighs, currentLows, currentCloses, currentOpens, cfg.zigzagThreshold);
          } else {
            srRaw = calcSupportResistance(currentHighs, currentLows, currentCloses, currentOpens);
          }

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

          const touchResult = (cResistance !== null && cResistance !== undefined)
            ? calcTrendTouchPoints({
                timestamps, highPrices, closePrices,
                m: mResistance, c: cResistance,
                trendMinIdx:       simTrendIndices[0],
                trendMaxIdx:       simTrendIndices[simTrendIndices.length - 1],
                touchTolerance:    cfg.trendTouchTolerance,
                breakoutTolerance: cfg.trendBreakoutTolerance,
                touchBasis:        cfg.trendTouchBasis,
              })
            : { touchPoints: [] as TrendTouchPoint[], touchCount: 0, closeTouchCount: 0, highTouchCount: 0, breakoutCount: 0, closeBreakoutCount: 0, highBreakoutCount: 0 };

          const { touchPoints: itemTouchPoints, touchCount, closeTouchCount, highTouchCount, breakoutCount, closeBreakoutCount, highBreakoutCount } = touchResult;

          const startMs     = effectiveFilterStart ? new Date(effectiveFilterStart).getTime() : 0;
          const endMs       = effectiveFilterEnd   ? new Date(effectiveFilterEnd).getTime()   : Infinity;
          const slopeMinNum = cfg.slopeMin !== '' ? parseFloat(cfg.slopeMin) : null;
          const slopeMaxNum = cfg.slopeMax !== '' ? parseFloat(cfg.slopeMax) : null;

          const filteredTouchPoints = itemTouchPoints.filter(
            tp => tp.type === 'touch' || (tp.x >= startMs && tp.x <= endMs)
          );
          const filteredBreakoutCount      = filteredTouchPoints.filter(tp => tp.type === 'breakout').length;
          const filteredCloseBreakoutCount = filteredTouchPoints.filter(tp => tp.type === 'breakout' && tp.priceType === 'close').length;
          const filteredHighBreakoutCount  = filteredTouchPoints.filter(tp => tp.type === 'breakout' && tp.priceType === 'high').length;
          const totalCount = touchCount + filteredBreakoutCount;

          if (totalCount === 0) continue;

          // timestamps 재사용 (new Date() 중복 호출 방지)
          const resistanceData = cResistance != null ? [
            { x: timestamps[0],                     y: cResistance },
            { x: timestamps[timestamps.length - 1], y: mResistance * (dates.length - 1) + cResistance },
          ] : [];
          const supportData = cSupport != null ? [
            { x: timestamps[0],                     y: cSupport },
            { x: timestamps[timestamps.length - 1], y: mSupport * (dates.length - 1) + cSupport },
          ] : undefined;
          const zigzagData = cfg.trendAlgo === 'zigzag'
            ? srRaw
                .map((pt, idx) => ({ x: timestamps[simTrendIndices[idx]], y: pt.zigzag }))
                .filter((pt): pt is { x: number; y: number } => pt.y != null)
            : undefined;

          const firstR       = resistanceData[0]?.y ?? 0;
          const lastR        = resistanceData[resistanceData.length - 1]?.y ?? 0;
          const slope        = lastR - firstR;
          const slopePercent = firstR !== 0 ? (slope / firstR) * 100 : 0;
          const slopeType: 'positive' | 'negative' | 'flat' =
            slope > 0.001 ? 'positive' : slope < -0.001 ? 'negative' : 'flat';

          if (cfg.slopeFilter === 'positive' && slope <= 0.001) continue;
          if (cfg.slopeFilter === 'negative' && slope >= -0.001) continue;
          if (slopeMinNum !== null && slopePercent < slopeMinNum) continue;
          if (slopeMaxNum !== null && slopePercent > slopeMaxNum) continue;

          results.push({
            ticker: opt.ticker, name: opt.name,
            touchCount, closeTouchCount, highTouchCount,
            breakoutCount:      filteredBreakoutCount,
            closeBreakoutCount: filteredCloseBreakoutCount,
            highBreakoutCount:  filteredHighBreakoutCount,
            prices: slice, resistanceData, supportData,
            zigzagData,
            latestResistance: cResistance != null
              ? mResistance * (dates.length - 1) + cResistance : null,
            touchPoints: itemTouchPoints, filteredTouchPoints,
            slopeType, slope: slopePercent,
            totalCount,
          });
        }

        results.sort((a, b) => (b.totalCount ?? 0) - (a.totalCount ?? 0));
        newResultsByPeriod[p] = results;
      }

      setResultsByPeriod(newResultsByPeriod);
      setIsSimulating(false);
    }, 150);
  }, [simMarket, simPeriods, periodConfigs]);

  return {
    simMarket, setSimMarket,
    simPeriods, togglePeriod,
    periodConfigs, updatePeriodConfig,
    isSimulating, finalResults, runSimulation,
    enablePatternFilter, setEnablePatternFilter,
    minTouchesPattern, setMinTouchesPattern,
  };
}
