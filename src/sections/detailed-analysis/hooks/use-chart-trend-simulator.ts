'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useMemo, useState, useCallback } from 'react';

import { alpha, useTheme } from '@mui/material/styles';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';

// ----------------------------------------------------------------------

export interface Trade {
  date: string;
  action: 'BUY' | 'SELL' | 'STOP_LOSS';
  price: number;
  sharesTraded: number;
  value: number;
  profitPct?: number;
}

export interface ProjectedLine {
  x: number;
  upper: number;
  lower: number;
  mid: number;
}

export interface EquityPoint {
  x: number;
  y: number;
}

export interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BacktestResult {
  simSlice: PriceData[];
  projectedLines: ProjectedLine[];
  trades: Trade[];
  equityHistory: EquityPoint[];
  bhEquityHistory: EquityPoint[];
  finalValue: number;
  strategyReturn: number;
  bhReturn: number;
  outperformance: number;
  totalTrades: number;
}

export interface TickerOption {
  ticker: string;
  name: string;
}

const PRICE_TYPE_LABELS = {
  open: '시가',
  high: '고가',
  low: '저가',
  close: '종가',
};

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function useChartTrendSimulator() {
  const theme = useTheme() as any;

  // General States
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('1y');

  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  const [startDate, setStartDate] = useState<string>(getLocalDateString(oneYearAgo));
  const [endDate, setEndDate] = useState<string>(getLocalDateString(today));

  // Ticker and Param States
  const [selectedTicker, setSelectedTicker] = useState<string>('AAPL');
  const [inputValue, setInputValue] = useState('');

  const [priceBasis, setPriceBasis] = useState<'open' | 'high' | 'low' | 'close'>('close');
  const [lookbackDays, setLookbackDays] = useState<number>(252);
  const [stdDevMultiplier, setStdDevMultiplier] = useState<number>(2.0);

  const [buyMethod, setBuyMethod] = useState<'allIn' | 'amount' | 'shares'>('allIn');
  const [buyAmount, setBuyAmount] = useState<number>(1000);
  const [buyShares, setBuyShares] = useState<number>(10);

  const [sellRatio, setSellRatio] = useState<number>(50); // %
  const [stopLossMargin, setStopLossMargin] = useState<number>(3.0); // %

  const [currentTab, setCurrentTab] = useState<'price' | 'equity'>('price');

  // Load ticker options based on market
  const tickerOptions = useMemo<TickerOption[]>(() => {
    const isKr = market === 'KR';
    const filtered = allTickersList.filter((t) => (isKr ? t.includes('.') : !t.includes('.')));
    return filtered.map((ticker) => ({
      ticker,
      name: isKr
        ? allTickersData[ticker]?.info?.kr_name || allTickersData[ticker]?.info?.name || ''
        : allTickersData[ticker]?.info?.name || '',
    }));
  }, [market]);

  // Ensure default ticker switches when market changes
  useMemo(() => {
    if (market === 'US' && selectedTicker.includes('.')) setSelectedTicker('AAPL');
    if (market === 'KR' && !selectedTicker.includes('.')) setSelectedTicker('005930.KS');
  }, [market, selectedTicker]);

  const selectedTickerData = useMemo(() => allTickersData[selectedTicker], [selectedTicker]);

  // Backtest engine calculations
  const backtestResult = useMemo<BacktestResult | null>(() => {
    if (!selectedTickerData) return null;

    const allPrices = (selectedTickerData.prices || []) as PriceData[];
    if (allPrices.length === 0) return null;

    // 1. Determine simulation slice based on period
    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
    let simSlice: PriceData[] = [];

    if (period === 'custom' && startDate && endDate) {
      simSlice = allPrices.filter((p) => p.date >= startDate && p.date <= endDate);
    } else {
      const days = daysMap[period === 'custom' ? '1y' : period];
      simSlice = allPrices.slice(-days);
    }

    if (simSlice.length === 0) return null;

    // 2. Find start and end index in allPrices
    const simDates = simSlice.map((p) => p.date);
    const startIndex = allPrices.findIndex((p) => p.date >= simDates[0]);
    const endIndex = startIndex + simSlice.length - 1;

    // 3. Simulate Regression Strategy
    const START_CAPITAL = 10000;
    let cash = START_CAPITAL;
    let shares = 0;
    const trades: Trade[] = [];

    const equityHistory: EquityPoint[] = [];
    const bhEquityHistory: EquityPoint[] = [];
    const projectedLines: ProjectedLine[] = [];

    const firstPrice =
      allPrices[startIndex][priceBasis as keyof Omit<PriceData, 'date'>] ||
      allPrices[startIndex].close;
    const bhShares = START_CAPITAL / firstPrice;
    let lastBuyPrice = 0;

    for (let i = startIndex; i <= endIndex; i++) {
      const currentPrice =
        allPrices[i][priceBasis as keyof Omit<PriceData, 'date'>] || allPrices[i].close;
      const timestamp = new Date(allPrices[i].date).getTime();

      const histStart = Math.max(0, i - lookbackDays);
      const histSlice = allPrices.slice(histStart, i);

      let projectedUpper = 0;
      let projectedLower = 0;
      let projectedMid = 0;

      if (histSlice.length >= 2) {
        const histPrices = histSlice.map(
          (p) => p[priceBasis as keyof Omit<PriceData, 'date'>] || p.close
        );
        const n = histPrices.length;
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;
        for (let j = 0; j < n; j++) {
          sumX += j;
          sumY += histPrices[j];
          sumXY += j * histPrices[j];
          sumXX += j * j;
        }
        const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
        const c = (sumY - m * sumX) / n;

        let sumResSq = 0;
        for (let j = 0; j < n; j++) {
          const midVal = m * j + c;
          const res = histPrices[j] - midVal;
          sumResSq += res * res;
        }
        const stdDev = Math.sqrt(sumResSq / (n || 1));
        const channelOffset = stdDevMultiplier * stdDev;

        projectedMid = m * n + c;
        projectedUpper = projectedMid + channelOffset;
        projectedLower = projectedMid - channelOffset;
      } else {
        // fallback if not enough history
        projectedMid = currentPrice;
        projectedUpper = currentPrice;
        projectedLower = currentPrice;
      }

      projectedLines.push({
        x: timestamp,
        upper: Number(projectedUpper.toFixed(2)),
        lower: Number(projectedLower.toFixed(2)),
        mid: Number(projectedMid.toFixed(2)),
      });

      // Trade Logic
      let dropPct = 0;
      if (projectedLower > 0) {
        dropPct = ((projectedLower - currentPrice) / projectedLower) * 100;
      }

      // 5. 손절 이탈시 전량 매도 (아웃)
      if (dropPct >= stopLossMargin && shares > 0) {
        const sharesToSell = shares;
        const proceeds = sharesToSell * currentPrice;
        cash += proceeds;
        shares = 0;
        const profitPct =
          lastBuyPrice > 0 ? ((currentPrice - lastBuyPrice) / lastBuyPrice) * 100 : 0;
        trades.push({
          date: allPrices[i].date,
          action: 'STOP_LOSS',
          price: currentPrice,
          sharesTraded: Number(sharesToSell.toFixed(4)),
          value: Number((cash + shares * currentPrice).toFixed(2)),
          profitPct,
        });
      }
      // 4. 하단 체크시 추가 매수
      else if (currentPrice <= projectedLower && cash > 0) {
        let sharesToBuy = 0;
        let cost = 0;
        if (buyMethod === 'allIn') {
          sharesToBuy = cash / currentPrice;
          cost = cash;
        } else if (buyMethod === 'amount') {
          cost = Math.min(cash, buyAmount);
          sharesToBuy = cost / currentPrice;
        } else if (buyMethod === 'shares') {
          sharesToBuy = buyShares;
          cost = buyShares * currentPrice;
          if (cost > cash) {
            sharesToBuy = cash / currentPrice;
            cost = cash;
          }
        }

        if (sharesToBuy > 0) {
          cash -= cost;
          shares += sharesToBuy;
          lastBuyPrice = currentPrice;
          trades.push({
            date: allPrices[i].date,
            action: 'BUY',
            price: currentPrice,
            sharesTraded: Number(sharesToBuy.toFixed(4)),
            value: Number((cash + shares * currentPrice).toFixed(2)),
          });
        }
      }
      // 3. 상단 체크시 일부 비중 매도
      else if (currentPrice >= projectedUpper && shares > 0) {
        const sharesToSell = shares * (sellRatio / 100);
        if (sharesToSell > 0) {
          const proceeds = sharesToSell * currentPrice;
          cash += proceeds;
          shares -= sharesToSell;
          const profitPct =
            lastBuyPrice > 0 ? ((currentPrice - lastBuyPrice) / lastBuyPrice) * 100 : 0;
          trades.push({
            date: allPrices[i].date,
            action: 'SELL',
            price: currentPrice,
            sharesTraded: Number(sharesToSell.toFixed(4)),
            value: Number((cash + shares * currentPrice).toFixed(2)),
            profitPct,
          });
        }
      }

      // Record daily equity values
      const currentEquity = cash + shares * currentPrice;
      equityHistory.push({
        x: timestamp,
        y: Number(currentEquity.toFixed(2)),
      });

      // Buy & Hold equity curve
      const bhEquity = bhShares * currentPrice;
      bhEquityHistory.push({
        x: timestamp,
        y: Number(bhEquity.toFixed(2)),
      });
    }

    const finalValue = equityHistory[equityHistory.length - 1]?.y || START_CAPITAL;
    const strategyReturn = ((finalValue - START_CAPITAL) / START_CAPITAL) * 100;

    const finalBhValue = bhEquityHistory[bhEquityHistory.length - 1]?.y || START_CAPITAL;
    const bhReturn = ((finalBhValue - START_CAPITAL) / START_CAPITAL) * 100;
    const outperformance = strategyReturn - bhReturn;

    return {
      simSlice,
      projectedLines,
      trades,
      equityHistory,
      bhEquityHistory,
      finalValue,
      strategyReturn,
      bhReturn,
      outperformance,
      totalTrades: trades.length,
    };
  }, [
    selectedTickerData,
    priceBasis,
    lookbackDays,
    stdDevMultiplier,
    sellRatio,
    buyMethod,
    buyAmount,
    buyShares,
    stopLossMargin,
    period,
    startDate,
    endDate,
  ]);

  const formatMoney = useCallback(
    (value: number) => {
      const symbol = market === 'KR' ? '₩' : '$';
      const digits = market === 'KR' ? 0 : 2;
      return `${symbol}${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`;
    },
    [market]
  );

  // Chart Setup
  const chartSeries = useMemo(() => {
    if (!backtestResult) return [];

    if (currentTab === 'price') {
      return [
        {
          name: `기준 가격 (${PRICE_TYPE_LABELS[priceBasis]})`,
          type: 'line',
          data: backtestResult.simSlice.map((p) => ({
            x: new Date(p.date).getTime(),
            y: p[priceBasis as keyof Omit<PriceData, 'date'>] || p.close,
          })),
        },
        {
          name: `추세 상단 (저항)`,
          type: 'line',
          data: backtestResult.projectedLines.map((p) => ({ x: p.x, y: p.upper })),
        },
        {
          name: `추세 하단 (지지)`,
          type: 'line',
          data: backtestResult.projectedLines.map((p) => ({ x: p.x, y: p.lower })),
        },
      ];
    }

    return [
      {
        name: '추세 채널 전략',
        data: backtestResult.equityHistory,
      },
      {
        name: '단순 보유 (Buy & Hold)',
        data: backtestResult.bhEquityHistory,
      },
    ];
  }, [backtestResult, currentTab, priceBasis]);

  const chartOptions = useMemo<any>(
    () => ({
      chart: {
        toolbar: { show: true },
        zoom: { enabled: true },
        background: 'transparent',
        fontFamily: theme.typography.fontFamily,
      },
      colors:
        currentTab === 'price'
          ? [theme.palette.primary.main, theme.palette.error.main, theme.palette.success.main]
          : [theme.palette.primary.main, theme.palette.text.disabled],
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: theme.palette.text.secondary } },
      },
      yaxis: {
        title: {
          text: currentTab === 'price' ? '주가' : '자산 가치',
          style: { color: theme.palette.text.secondary, fontWeight: 600 },
        },
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) =>
            currentTab === 'price' ? value.toFixed(2) : formatMoney(value),
        },
      },
      stroke: {
        curve: 'smooth',
        width: currentTab === 'price' ? [2.5, 1.5, 1.5] : [2.5, 2.5],
        dashArray: currentTab === 'price' ? [0, 4, 4] : [0, 0],
      },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        labels: { colors: theme.palette.text.secondary },
      },
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
        y: {
          formatter: (value: number) =>
            currentTab === 'price'
              ? `${market === 'KR' ? '₩' : '$'}${value.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}`
              : formatMoney(value),
        },
      },
      grid: {
        borderColor: alpha(theme.palette.grey[500], 0.1),
        strokeDashArray: 3,
      },
    }),
    [theme, currentTab, market, formatMoney]
  );

  return {
    market,
    setMarket,
    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedTicker,
    setSelectedTicker,
    inputValue,
    setInputValue,
    priceBasis,
    setPriceBasis,
    lookbackDays,
    setLookbackDays,
    stdDevMultiplier,
    setStdDevMultiplier,
    buyMethod,
    setBuyMethod,
    buyAmount,
    setBuyAmount,
    buyShares,
    setBuyShares,
    sellRatio,
    setSellRatio,
    stopLossMargin,
    setStopLossMargin,
    currentTab,
    setCurrentTab,
    tickerOptions,
    backtestResult,
    chartSeries,
    chartOptions,
    formatMoney,
  };
}

export type UseChartTrendSimulatorReturn = ReturnType<typeof useChartTrendSimulator>;
