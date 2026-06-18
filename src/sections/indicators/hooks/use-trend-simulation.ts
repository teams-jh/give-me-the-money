'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import { intersectSimResults } from 'src/library/shared/signals';
import type { TrendSimFinalResult } from 'src/library/shared/signals';
import {
  PERIOD_BARS,
  runTickerSim,
  sortSimResults,
  applyPatternFilter,
  convertToWeeklyBars,
  resolvePeriodDates,
  resolveFilterStartMs,
} from 'src/library/shared/trendSim';
import type { SimResult, PriceDataPoint, BarUnit, PeriodKey, PeriodConfig } from 'src/library/shared/trendSim';

export type { PeriodConfig, BarUnit };

// ----------------------------------------------------------------------

export type { TrendSimFinalResult };

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

// PeriodKey는 src/library/shared/signals.ts가 SSOT (trendSim.ts를 통해 재export). (#67)

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
    return { lastDate, getNDaysAgo };
  }, []);

  // ── 최초 기본값 초기화 ────────────────────────────────────────────────
  useEffect(() => {
    if (!referenceInfo) return;
    const { lastDate, getNDaysAgo } = referenceInfo;
    setPeriodConfigs({
      '1y': {
        ...DEFAULT_CONFIG,
        // trendStartDate/trendEndDate는 빈 문자열로 두어 resolvePeriodDates()에 위임한다.
        // → slice 첫 봉/마지막-1봉으로 자동 채워져 barUnit·기간 경로와 무관하게 일관됨.
        trendStartDate:  '',
        trendEndDate:    '',
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
          // trendStartDate는 빈 문자열로 두어 resolvePeriodDates()에 위임한다.
          // src.barUnit 기준으로 계산하면 barUnit 경로에 따라 날짜가 달라지는 버그 발생.
          trendStartDate:  '',
          // 마지막 1봉 제외 → 빈 값 위임 (resolvePeriodDates가 마지막-1로 채움)
          trendEndDate:    '',
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

      // 패턴 필터용 filterStart ms — 빈 값이면 종목별(첫 결과) dates 기준 자동 산출.
      // 스크립트(simulate_trend)와 동일한 공통 함수를 사용해 싱크를 보장한다.
      let startMs = 0;
      if (config) {
        const firstPrices = results[0]?.prices;
        const dates = firstPrices ? firstPrices.map(p => p.date) : [];
        startMs = resolveFilterStartMs(config, dates);
      }

      filteredByPeriod[period as PeriodKey] = enablePatternFilter
        ? applyPatternFilter(results, startMs, minTouchesPattern)
        : results;
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

          // 종목별 dates 기준으로 빈 날짜 자동 채움 (스크립트와 동일 공통 함수)
          // → 동일 설정에서 웹/스크립트가 같은 결과를 내도록 보장
          const resolvedCfg = resolvePeriodDates(cfg, slice.map(d => d.date));

          const simResult = runTickerSim(opt.ticker, opt.name, slice, resolvedCfg);
          if (simResult) results.push(simResult);
        }

        sortSimResults(results);
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
