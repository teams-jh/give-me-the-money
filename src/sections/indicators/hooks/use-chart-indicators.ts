'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useMemo, useState, useEffect, useCallback } from 'react';

import { alpha, useTheme } from '@mui/material/styles';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import {
  calcMA,
  calcRSI,
  calcMACD,
  calcEnvelope,
  calcBollingerBands,
  calcDonchianChannels,
  calcSupportResistance,
  calcLinearRegressionChannel,
  calcZigZagSupportResistance,
} from 'src/library/shared/indicators';

// ----------------------------------------------------------------------

export interface FibonacciData {
  max: number;
  min: number;
  maxDate: number;
  minDate: number;
  fib236: number;
  fib382: number;
  fib500: number;
  fib618: number;
}

export interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TickerOption {
  ticker: string;
  name: string;
}

export interface StockMeta {
  ticker: string;
  name: string;
  industry: string;
}

export interface TechAnalysisResult {
  currentPrice: number;
  dailyChange: number;
  dailyChangePct: number;
  latestRsi: number;
  latestSma20: number;
  latestSma50: number;
  latestSma120: number;
  latestMacd: number;
  latestSignal: number;
  latestHist: number;
  latestBbUpper: number;
  latestBbLower: number;
  latestBbSma: number;
  latestEnvUpper: number;
  latestEnvLower: number;
  latestDonchianUpper: number;
  latestDonchianLower: number;
  latestSupport: number;
  latestResistance: number;
  score: number;
  sma5: number[];
  sma20: number[];
  sma60: number[];
  sma120: number[];
  sma240: number[];
  support: number[];
  resistance: number[];
  bbUpper: number[];
  bbLower: number[];
  envUpper: number[];
  envLower: number[];
  donchianUpper: number[];
  donchianLower: number[];
  donchianMiddle: number[];
  fibonacci: FibonacciData;
}

export interface VisibleHighLowResult {
  max: number;
  min: number;
  maxDate: number;
  minDate: number;
  maxIdx: number;
  minIdx: number;
  visibleIndices: number[];
}

export interface TouchPoint {
  x: number;
  y: number;
  priceType: 'high' | 'close';
}

export interface SimResult {
  ticker: string;
  name: string;
  touchCount: number;
  closeTouchCount: number;
  highTouchCount: number;
  prices: PriceDataPoint[];
  resistanceData: { x: number; y: number | null }[];
  supportData?: { x: number; y: number | null }[];
  zigzagData?: { x: number; y: number }[];
  latestResistance: number | null;
  touchPoints: TouchPoint[];
  slopeType: 'positive' | 'negative' | 'flat';
}

export interface DynamicLinesResult {
  supportData: { x: number; y: number | null }[];
  resistanceData: { x: number; y: number | null }[];
  zigzagData: { x: number; y: number }[];
  latestSupport: number | null;
  latestResistance: number | null;
  touchPoints: TouchPoint[];
  touchCount: number;
  highTouchCount: number;
  closeTouchCount: number;
}

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function useChartIndicators() {
  const theme = useTheme() as any;

  // Navigation states
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('1y');

  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const [startDate, setStartDate] = useState<string>(getLocalDateString(oneMonthAgo));
  const [endDate, setEndDate] = useState<string>(getLocalDateString(today));

  // Active Single Selected Ticker States
  const [usTicker, setUsTicker] = useState<string>('AAPL');
  const [krTicker, setKrTicker] = useState<string>('005930.KS');

  // Dynamic chart lines on/off states
  const [showSma5, setShowSma5] = useState(false);
  const [showSma20, setShowSma20] = useState(true);
  const [showSma60, setShowSma60] = useState(false);
  const [showSma120, setShowSma120] = useState(false);
  const [showSma240, setShowSma240] = useState(false);
  const [showBb, setShowBb] = useState(false);
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(true);
  const [showEnv, setShowEnv] = useState(false);
  const [showFib, setShowFib] = useState(false);
  const [showDonchian, setShowDonchian] = useState(false);

  // Auto Trendlines option states
  const [showAutoTrend, setShowAutoTrend] = useState(false);
  const [trendBase, setTrendBase] = useState<'highlow' | 'close' | 'open'>('highlow');
  const [trendAlgo, setTrendAlgo] = useState<'swing' | 'zigzag' | 'regression'>('swing');
  const [zigzagThreshold, setZigzagThreshold] = useState<number>(3);
  const [regressionStdDev, setRegressionStdDev] = useState<number>(2.0);
  const [lineCurve, setLineCurve] = useState<'straight' | 'smooth'>('straight');
  const [trendTouchTolerance, setTrendTouchTolerance] = useState<number>(2);
  const [trendTouchBasis, setTrendTouchBasis] = useState<'close' | 'high' | 'both'>('both');

  // Simulation states
  const [simResults, setSimResults] = useState<SimResult[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);

  // Dynamic visible chart range (for highest/lowest calculations on zoom)
  const [visibleRange, setVisibleRange] = useState<{ min: number; max: number } | null>(null);

  const currentTicker = market === 'US' ? usTicker : krTicker;

  // Reset visibleRange when ticker or period changes
  useEffect(() => {
    setVisibleRange(null);
  }, [currentTicker, period]);

  // Filter Autocomplete Ticker Options based on Market
  const tickerOptions = useMemo<TickerOption[]>(() => {
    const isKr = market === 'KR';
    const filtered = allTickersList.filter((t) => (isKr ? t.includes('.') : !t.includes('.')));

    return filtered.map((ticker) => {
      const info = allTickersData[ticker]?.info;
      const name = isKr ? info?.kr_name || info?.name || '' : info?.name || '';
      return { ticker, name };
    });
  }, [market]);

  // Current selected stock meta
  const selectedStockMeta = useMemo<StockMeta | null>(() => {
    const rawData = allTickersData[currentTicker];
    if (!rawData) return null;

    const isKr = currentTicker.includes('.');
    const name = isKr
      ? rawData.info?.kr_name || rawData.info?.name || currentTicker
      : rawData.info?.name || currentTicker;

    return {
      ticker: currentTicker,
      name,
      industry: rawData.info?.industry || 'Unknown',
    };
  }, [currentTicker]);

  // Dynamic Ticker Data Slice based on Period
  const activeStockDataSlice = useMemo(() => {
    const rawData = allTickersData[currentTicker];
    if (!rawData) return null;

    const allPrices = (rawData.prices || []) as PriceDataPoint[];
    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };

    let slice: PriceDataPoint[];
    if (period === 'custom' && startDate && endDate) {
      slice = allPrices.filter((p) => p.date >= startDate && p.date <= endDate);
    } else {
      const days = daysMap[period === 'custom' ? '1y' : period];
      slice = allPrices.slice(-days);
    }

    const closePrices = slice.map((p) => p.close);
    const openPrices = slice.map((p) => p.open || p.close);
    const highPrices = slice.map((p) => p.high || p.close);
    const lowPrices = slice.map((p) => p.low || p.close);
    const dates = slice.map((p) => p.date);

    return {
      closePrices,
      openPrices,
      highPrices,
      lowPrices,
      dates,
    };
  }, [currentTicker, period, startDate, endDate]);

  // Dynamic Technical Calculations
  const techAnalysis = useMemo<TechAnalysisResult | null>(() => {
    const rawData = allTickersData[currentTicker];
    if (!rawData || !activeStockDataSlice || activeStockDataSlice.closePrices.length === 0)
      return null;

    const allPrices = (rawData.prices || []) as PriceDataPoint[];
    const fullCloses = allPrices.map((p) => p.close);
    const fullHighs = allPrices.map((p) => p.high || p.close);
    const fullLows = allPrices.map((p) => p.low || p.close);
    const fullDates = allPrices.map((p) => p.date);

    const fullOpens = allPrices.map((p) => p.open || p.close);

    // Find start and end indices of activeStockDataSlice.dates in fullDates to slice indicators correctly
    const sliceDates = activeStockDataSlice.dates;
    if (sliceDates.length === 0) return null;

    const startDateStr = sliceDates[0];
    const endDateStr = sliceDates[sliceDates.length - 1];

    const startIndex = fullDates.indexOf(startDateStr);
    const endIndex = fullDates.indexOf(endDateStr);

    if (startIndex === -1 || endIndex === -1) return null;

    // Calculate indicators on the FULL historical dataset to avoid truncation/fallback drops
    const fullSma5 = calcMA(fullCloses, 5);
    const fullSma20 = calcMA(fullCloses, 20);
    const fullSma50 = calcMA(fullCloses, 50);
    const fullSma60 = calcMA(fullCloses, 60);
    const fullSma120 = calcMA(fullCloses, 120);
    const fullSma240 = calcMA(fullCloses, 240);
    const fullRsi = calcRSI(fullCloses, 14);
    const fullMacdRaw = calcMACD(fullCloses);
    const fullBbRaw = calcBollingerBands(fullCloses, 20);
    const fullEnvRaw = calcEnvelope(fullCloses, 20, 0.1);
    const fullDonchianRaw = calcDonchianChannels(fullCloses, 20);
    const fullSrRaw = calcSupportResistance(fullHighs, fullLows, fullCloses, fullOpens);

    // Slice indicators to match active stock data slice
    const sliceSma5 = fullSma5.slice(startIndex, endIndex + 1);
    const sliceSma20 = fullSma20.slice(startIndex, endIndex + 1);
    const sliceSma50 = fullSma50.slice(startIndex, endIndex + 1);
    const sliceSma60 = fullSma60.slice(startIndex, endIndex + 1);
    const sliceSma120 = fullSma120.slice(startIndex, endIndex + 1);
    const sliceSma240 = fullSma240.slice(startIndex, endIndex + 1);
    const sliceRsi = fullRsi.slice(startIndex, endIndex + 1);
    const sliceSrRaw = fullSrRaw.slice(startIndex, endIndex + 1);

    const prices = activeStockDataSlice.closePrices;
    const dates = activeStockDataSlice.dates;
    const length = prices.length;

    // Fall back to price only if full history itself is not long enough
    const sma5 = sliceSma5.map((val, idx) => val ?? prices[idx]);
    const sma20 = sliceSma20.map((val, idx) => val ?? prices[idx]);
    const sma50 = sliceSma50.map((val, idx) => val ?? prices[idx]);
    const sma60 = sliceSma60.map((val, idx) => val ?? prices[idx]);
    const sma120 = sliceSma120.map((val, idx) => val ?? prices[idx]);
    const sma240 = sliceSma240.map((val, idx) => val ?? prices[idx]);
    const rsi = sliceRsi.map((val) => val ?? 50);
    const support = sliceSrRaw.map((pt, idx) => pt.support ?? prices[idx]);
    const resistance = sliceSrRaw.map((pt, idx) => pt.resistance ?? prices[idx]);

    const sliceMacdRaw = fullMacdRaw.slice(startIndex, endIndex + 1);
    const macd = {
      macdLine: sliceMacdRaw.map((pt) => pt.macd ?? 0),
      signalLine: sliceMacdRaw.map((pt) => pt.signal ?? 0),
      histogram: sliceMacdRaw.map((pt) => pt.histogram ?? 0),
    };

    const sliceBbRaw = fullBbRaw.slice(startIndex, endIndex + 1);
    const bb = {
      sma: sliceBbRaw.map((pt, idx) => pt.mid ?? prices[idx]),
      upper: sliceBbRaw.map((pt, idx) => pt.upper ?? prices[idx]),
      lower: sliceBbRaw.map((pt, idx) => pt.lower ?? prices[idx]),
    };

    const sliceEnvRaw = fullEnvRaw.slice(startIndex, endIndex + 1);
    const env = {
      sma: sliceEnvRaw.map((pt, idx) => pt.mid ?? prices[idx]),
      upper: sliceEnvRaw.map((pt, idx) => pt.upper ?? prices[idx]),
      lower: sliceEnvRaw.map((pt, idx) => pt.lower ?? prices[idx]),
    };

    const sliceDonchianRaw = fullDonchianRaw.slice(startIndex, endIndex + 1);
    const donchian = {
      upper: sliceDonchianRaw.map((pt, idx) => pt.upper ?? prices[idx]),
      lower: sliceDonchianRaw.map((pt, idx) => pt.lower ?? prices[idx]),
      middle: sliceDonchianRaw.map((pt, idx) => pt.mid ?? prices[idx]),
    };

    // Last values (current status)
    const currentPrice = prices[length - 1] || 0;
    const prevPrice = prices[length - 2] || currentPrice;
    const dailyChange = currentPrice - prevPrice;
    const dailyChangePct = prevPrice !== 0 ? (dailyChange / prevPrice) * 100 : 0;

    const latestRsi = rsi[length - 1] || 50;
    const latestSma20 = sma20[length - 1] || currentPrice;
    const latestSma50 = sma50[length - 1] || currentPrice;
    const latestSma120 = sma120[length - 1] || currentPrice;

    const latestMacd = macd.macdLine[length - 1] || 0;
    const latestSignal = macd.signalLine[length - 1] || 0;
    const latestHist = macd.histogram[length - 1] || 0;

    const latestBbUpper = bb.upper[length - 1] || currentPrice;
    const latestBbLower = bb.lower[length - 1] || currentPrice;
    const latestBbSma = bb.sma[length - 1] || currentPrice;

    const latestEnvUpper = env.upper[length - 1] || currentPrice;
    const latestEnvLower = env.lower[length - 1] || currentPrice;

    const latestDonchianUpper = donchian.upper[length - 1] || currentPrice;
    const latestDonchianLower = donchian.lower[length - 1] || currentPrice;

    const latestSupport = support[length - 1] || currentPrice;
    const latestResistance = resistance[length - 1] || currentPrice;

    const highPrices = activeStockDataSlice.highPrices;
    const lowPrices = activeStockDataSlice.lowPrices;
    const maxPrice = Math.max(...highPrices);
    const minPrice = Math.min(...lowPrices);
    const diff = maxPrice - minPrice;

    const maxIndex = highPrices.indexOf(maxPrice);
    const minIndex = lowPrices.indexOf(minPrice);
    const maxDate = new Date(dates[maxIndex]).getTime();
    const minDate = new Date(dates[minIndex]).getTime();

    const fibonacci = {
      max: maxPrice,
      min: minPrice,
      maxDate,
      minDate,
      fib236: maxPrice - diff * 0.236,
      fib382: maxPrice - diff * 0.382,
      fib500: maxPrice - diff * 0.5,
      fib618: maxPrice - diff * 0.618,
    };

    // Overall Score Calculation (0 - 100)
    let score = 50;
    // 1. Trend: Above SMA 20 (+10), Above SMA 50 (+10), Above SMA 120 (+10)
    if (currentPrice > latestSma20) score += 10;
    else score -= 5;
    if (currentPrice > latestSma50) score += 10;
    else score -= 5;
    if (currentPrice > latestSma120) score += 10;
    else score -= 5;

    // 2. Momentum: RSI between 40 and 65 (+15), RSI > 70 (-10 overbought), RSI < 30 (+10 oversold bounce)
    if (latestRsi > 70) score -= 10;
    else if (latestRsi < 30) score += 10;
    else if (latestRsi >= 45 && latestRsi <= 65) score += 15;

    // 3. MACD: Histogram > 0 (+15)
    if (latestHist > 0) score += 15;
    else score -= 5;

    score = Math.max(10, Math.min(95, score));

    return {
      currentPrice,
      dailyChange,
      dailyChangePct,
      latestRsi,
      latestSma20,
      latestSma50,
      latestSma120,
      latestMacd,
      latestSignal,
      latestHist,
      latestBbUpper,
      latestBbLower,
      latestBbSma,
      latestEnvUpper,
      latestEnvLower,
      latestDonchianUpper,
      latestDonchianLower,
      latestSupport,
      latestResistance,
      score,
      sma5,
      sma20,
      sma60,
      sma120,
      sma240,
      support,
      resistance,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      envUpper: env.upper,
      envLower: env.lower,
      donchianUpper: donchian.upper,
      donchianLower: donchian.lower,
      donchianMiddle: donchian.middle,
      fibonacci,
    };
  }, [activeStockDataSlice, currentTicker]);

  // Compute visible high/low based on visibleRange
  const visibleHighLow = useMemo<VisibleHighLowResult | null>(() => {
    if (!activeStockDataSlice) return null;
    const { dates, highPrices, lowPrices } = activeStockDataSlice;

    let indices: number[] = [];
    if (visibleRange) {
      dates.forEach((d, idx) => {
        const time = new Date(d).getTime();
        if (time >= visibleRange.min && time <= visibleRange.max) {
          indices.push(idx);
        }
      });
    }
    if (indices.length === 0) {
      indices = dates.map((_, idx) => idx);
    }

    const highs = indices.map((i) => highPrices[i]);
    const lows = indices.map((i) => lowPrices[i]);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const maxIdx = indices[highs.indexOf(max)];
    const minIdx = indices[lows.indexOf(min)];

    return {
      max,
      min,
      maxDate: new Date(dates[maxIdx]).getTime(),
      minDate: new Date(dates[minIdx]).getTime(),
      maxIdx,
      minIdx,
      visibleIndices: indices,
    };
  }, [activeStockDataSlice, visibleRange]);

  const dynamicLines = useMemo<DynamicLinesResult | null>(() => {
    if (!activeStockDataSlice || !visibleHighLow) return null;

    const { visibleIndices } = visibleHighLow;
    const { highPrices, lowPrices, closePrices, openPrices, dates } = activeStockDataSlice;

    const visHighs = visibleIndices.map((i) => highPrices[i]);
    const visLows = visibleIndices.map((i) => lowPrices[i]);
    const visCloses = visibleIndices.map((i) => closePrices[i]);
    const visOpens = visibleIndices.map((i) => openPrices[i] || closePrices[i]);

    // Apply selected price base
    const currentHighs =
      trendBase === 'close' ? visCloses : trendBase === 'open' ? visOpens : visHighs;
    const currentLows =
      trendBase === 'close' ? visCloses : trendBase === 'open' ? visOpens : visLows;
    const currentCloses =
      trendBase === 'close' ? visCloses : trendBase === 'open' ? visOpens : visCloses;
    const currentOpens =
      trendBase === 'close' ? visCloses : trendBase === 'open' ? visOpens : visOpens;

    let srRaw: { support: number | null; resistance: number | null; zigzag?: number | null }[] = [];

    if (trendAlgo === 'regression') {
      srRaw = calcLinearRegressionChannel(currentCloses, regressionStdDev);
    } else if (trendAlgo === 'zigzag') {
      srRaw = calcZigZagSupportResistance(
        currentHighs,
        currentLows,
        currentCloses,
        currentOpens,
        zigzagThreshold
      );
    } else {
      // Default: swing
      srRaw = calcSupportResistance(currentHighs, currentLows, currentCloses, currentOpens);
    }

    const supportData = srRaw
      .map((pt, idx) => ({
        x: new Date(dates[visibleIndices[idx]]).getTime(),
        y: pt.support,
      }))
      .filter((pt, idx) => pt.y !== null && (idx === 0 || idx === srRaw.length - 1));

    const resistanceData = srRaw
      .map((pt, idx) => ({
        x: new Date(dates[visibleIndices[idx]]).getTime(),
        y: pt.resistance,
      }))
      .filter((pt, idx) => pt.y !== null && (idx === 0 || idx === srRaw.length - 1));

    const zigzagData = srRaw
      .map((pt, idx) => ({
        x: new Date(dates[visibleIndices[idx]]).getTime(),
        y: pt.zigzag,
      }))
      .filter((pt): pt is { x: number; y: number } => pt.y !== null && pt.y !== undefined);

    const touchPoints: TouchPoint[] = [];
    let highTouchCount = 0;
    let closeTouchCount = 0;

    if (srRaw.length > 0) {
      for (let idx = 0; idx < srRaw.length; idx++) {
        const pt = srRaw[idx];
        if (pt.resistance !== null && pt.resistance !== undefined) {
          const R_i = pt.resistance;
          const high = visHighs[idx] ?? 0;
          const close = visCloses[idx] ?? 0;
          const lowerBound = R_i * (1 - trendTouchTolerance / 100);
          const upperBound = R_i * 1.01;

          let isTouch = false;
          let touchedY = high;
          let priceType: 'high' | 'close' = 'high';

          const checkClose = trendTouchBasis === 'close' || trendTouchBasis === 'both';
          const checkHigh = trendTouchBasis === 'high' || trendTouchBasis === 'both';

          if (checkClose && close >= lowerBound && close <= upperBound) {
            isTouch = true;
            touchedY = close;
            priceType = 'close';
            closeTouchCount++;
          } else if (checkHigh && high >= lowerBound && high <= upperBound) {
            isTouch = true;
            touchedY = high;
            priceType = 'high';
            highTouchCount++;
          }

          if (isTouch) {
            touchPoints.push({
              x: new Date(dates[visibleIndices[idx]]).getTime(),
              y: touchedY,
              priceType,
            });
          }
        }
      }
    }

    return {
      supportData,
      resistanceData,
      zigzagData,
      latestSupport: srRaw[srRaw.length - 1]?.support ?? null,
      latestResistance: srRaw[srRaw.length - 1]?.resistance ?? null,
      touchPoints,
      touchCount: touchPoints.length,
      highTouchCount,
      closeTouchCount,
    };
  }, [activeStockDataSlice, visibleHighLow, trendBase, trendAlgo, zigzagThreshold, regressionStdDev, trendTouchTolerance, trendTouchBasis]);

  // Chart configuration for selected ticker
  const chartData = useMemo(() => {
    if (!activeStockDataSlice || !techAnalysis) {
      return {
        series: [],
        colors: [],
        stroke: { curve: lineCurve as const, width: [], dashArray: [] },
      };
    }

    const series: any[] = [
      {
        name: '주가 (OHLC)',
        type: 'candlestick',
        data: activeStockDataSlice.closePrices.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: [
            activeStockDataSlice.openPrices[idx] || val,
            activeStockDataSlice.highPrices[idx] || val,
            activeStockDataSlice.lowPrices[idx] || val,
            val,
          ],
        })),
      },
    ];

    const colors = [theme.palette.primary.main];
    const widths = [1];
    const dashes = [0];

    if (showSma5) {
      series.push({
        name: 'SMA (5일선)',
        type: 'line',
        data: techAnalysis.sma5.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.secondary.main);
      widths.push(1);
      dashes.push(0);
    }

    if (showSma20) {
      series.push({
        name: 'SMA (20일선)',
        type: 'line',
        data: techAnalysis.sma20.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.warning.main);
      widths.push(2);
      dashes.push(0);
    }

    if (showSma60) {
      series.push({
        name: 'SMA (60일선)',
        type: 'line',
        data: techAnalysis.sma60.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.info.main);
      widths.push(1);
      dashes.push(0);
    }

    if (showSma120) {
      series.push({
        name: 'SMA (120일선)',
        type: 'line',
        data: techAnalysis.sma120.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.error.main);
      widths.push(1);
      dashes.push(0);
    }

    if (showSma240) {
      series.push({
        name: 'SMA (240일선)',
        type: 'line',
        data: techAnalysis.sma240.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.text.disabled);
      widths.push(1);
      dashes.push(0);
    }

    if (showBb) {
      series.push({
        name: '볼린저 밴드 상단',
        type: 'line',
        data: techAnalysis.bbUpper.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.success.main);
      widths.push(1);
      dashes.push(6);

      series.push({
        name: '볼린저 밴드 하단',
        type: 'line',
        data: techAnalysis.bbLower.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.error.main);
      widths.push(1);
      dashes.push(6);
    }

    if (showEnv) {
      series.push({
        name: '엔벨로프 상단 (10%)',
        type: 'line',
        data: techAnalysis.envUpper.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.secondary.light);
      widths.push(1);
      dashes.push(4);

      series.push({
        name: '엔벨로프 하단 (10%)',
        type: 'line',
        data: techAnalysis.envLower.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.secondary.light);
      widths.push(1);
      dashes.push(4);
    }

    if (showDonchian) {
      series.push({
        name: '돈천 채널 상단',
        type: 'line',
        data: techAnalysis.donchianUpper.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.info.light);
      widths.push(1);
      dashes.push(0);

      series.push({
        name: '돈천 채널 하단',
        type: 'line',
        data: techAnalysis.donchianLower.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      });
      colors.push(theme.palette.info.light);
      widths.push(1);
      dashes.push(0);
    }

    if (showAutoTrend && dynamicLines) {
      if (trendAlgo === 'zigzag') {
        series.push({
          name: '지그재그 파동선 (ZigZag)',
          type: 'line',
          data: dynamicLines.zigzagData,
        });
        colors.push('#00E676'); // Bright Lime Green
        widths.push(3);
        dashes.push(0);
      } else {
        series.push({
          name: '자동 지지선 (Support)',
          type: 'line',
          data: dynamicLines.supportData,
        });
        colors.push(theme.palette.success.main);
        widths.push(2);
        dashes.push(4);

        series.push({
          name: '자동 저항선 (Resistance)',
          type: 'line',
          data: dynamicLines.resistanceData,
        });
        colors.push(theme.palette.error.main);
        widths.push(2);
        dashes.push(4);
      }
    }

    const curves = series.map((s) => (s.type === 'line' ? lineCurve : 'straight'));

    return {
      series,
      colors,
      stroke: {
        curve: curves as any,
        width: widths,
        dashArray: dashes,
      },
    };
  }, [
    activeStockDataSlice,
    techAnalysis,
    dynamicLines,
    showSma5,
    showSma20,
    showSma60,
    showSma120,
    showSma240,
    showBb,
    showEnv,
    showDonchian,
    showAutoTrend,
    trendAlgo,
    lineCurve,
    theme,
  ]);

  const formatMoney = useCallback(
    (val: number) => {
      if (market === 'US') {
        return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `${val.toLocaleString()}원`;
    },
    [market]
  );

  const chartOptions = useMemo<any>(() => {
    const annotations: any = { yaxis: [], points: [] };

    const yMin = visibleHighLow
      ? visibleHighLow.max === visibleHighLow.min
        ? visibleHighLow.min * 0.95
        : visibleHighLow.min - (visibleHighLow.max - visibleHighLow.min) * 0.05
      : undefined;

    const yMax = visibleHighLow
      ? visibleHighLow.max === visibleHighLow.min
        ? visibleHighLow.max * 1.05
        : visibleHighLow.max + (visibleHighLow.max - visibleHighLow.min) * 0.08
      : undefined;

    if (visibleHighLow) {
      const { max, min, maxDate, minDate, maxIdx, minIdx, visibleIndices } = visibleHighLow;

      const maxPos =
        visibleIndices.length > 1 ? visibleIndices.indexOf(maxIdx) / (visibleIndices.length - 1) : 0.5;

      const minPos =
        visibleIndices.length > 1 ? visibleIndices.indexOf(minIdx) / (visibleIndices.length - 1) : 0.5;

      // Adjust textAnchor and offsetX to prevent clipping at boundaries (left/right edges)
      let maxAnchor = 'middle';
      let maxOffsetX = 0;
      if (maxPos > 0.85) {
        maxAnchor = 'end';
        maxOffsetX = -10;
      } else if (maxPos < 0.15) {
        maxAnchor = 'start';
        maxOffsetX = 10;
      }

      let minAnchor = 'middle';
      let minOffsetX = 0;
      if (minPos > 0.85) {
        minAnchor = 'end';
        minOffsetX = -10;
      } else if (minPos < 0.15) {
        minAnchor = 'start';
        minOffsetX = 10;
      }

      annotations.points.push(
        {
          x: maxDate,
          y: max,
          marker: { size: 5, fillColor: theme.palette.error.main, strokeColor: '#fff', strokeWidth: 2 },
          label: {
            borderColor: theme.palette.error.main,
            offsetY: -10,
            offsetX: maxOffsetX,
            textAnchor: maxAnchor,
            style: { color: '#fff', background: theme.palette.error.main, fontWeight: 700, fontSize: '11px' },
            text: `최고가: ${formatMoney(max)}`,
          },
        },
        {
          x: minDate,
          y: min,
          marker: { size: 5, fillColor: theme.palette.info.main, strokeColor: '#fff', strokeWidth: 2 },
          label: {
            borderColor: theme.palette.info.main,
            offsetY: 10,
            offsetX: minOffsetX,
            textAnchor: minAnchor,
            style: { color: '#fff', background: theme.palette.info.main, fontWeight: 700, fontSize: '11px' },
            text: `최저가: ${formatMoney(min)}`,
          },
        }
      );
    }

    if (showAutoTrend && dynamicLines?.touchPoints) {
      dynamicLines.touchPoints.forEach((tp) => {
        const isClose = tp.priceType === 'close';
        const color = isClose ? theme.palette.error.main : theme.palette.warning.main;
        const text = isClose ? '종가 터치' : '고가 터치';

        annotations.points.push({
          x: tp.x,
          y: tp.y,
          marker: {
            size: 6,
            fillColor: color,
            strokeColor: '#FFFFFF',
            strokeWidth: 2,
          },
          label: {
            borderColor: color,
            offsetY: -12,
            style: {
              color: '#fff',
              background: color,
              fontWeight: 700,
              fontSize: '10px',
              padding: { left: 4, right: 4, top: 2, bottom: 2 }
            },
            text,
          },
        });
      });
    }

    if (showFib && visibleHighLow) {
      const { max, min } = visibleHighLow;
      const diff = max - min;
      const fibColors = theme.palette.grey[500];
      annotations.yaxis.push(
        {
          y: max,
          borderColor: theme.palette.error.main,
          label: { text: '100% (High)', style: { color: '#fff', background: theme.palette.error.main } },
        },
        {
          y: max - diff * 0.236,
          borderColor: fibColors,
          strokeDashArray: 2,
          label: { text: '23.6%', style: { color: '#fff', background: fibColors } },
        },
        {
          y: max - diff * 0.382,
          borderColor: fibColors,
          strokeDashArray: 2,
          label: { text: '38.2%', style: { color: '#fff', background: fibColors } },
        },
        {
          y: max - diff * 0.5,
          borderColor: fibColors,
          strokeDashArray: 2,
          label: { text: '50.0%', style: { color: '#fff', background: fibColors } },
        },
        {
          y: max - diff * 0.618,
          borderColor: fibColors,
          strokeDashArray: 2,
          label: { text: '61.8%', style: { color: '#fff', background: fibColors } },
        },
        {
          y: min,
          borderColor: theme.palette.success.main,
          label: { text: '0% (Low)', style: { color: '#fff', background: theme.palette.success.main } },
        }
      );
    }

    return {
      chart: {
        id: `indicators-chart-${lineCurve}`,
        toolbar: {
          show: true,
          offsetX: -10,
          offsetY: -5,
        },
        zoom: {
          enabled: true,
          autoScaleYaxis: true,
        },
        background: 'transparent',
        fontFamily: theme.typography.fontFamily,
        events: {
          zoomed: (_chartContext: unknown, { xaxis }: { xaxis: { min?: number; max?: number } }) => {
            if (xaxis?.min && xaxis?.max) {
              setVisibleRange({ min: Math.round(xaxis.min), max: Math.round(xaxis.max) });
            } else {
              setVisibleRange(null);
            }
          },
          scrolled: (_chartContext: unknown, { xaxis }: { xaxis: { min?: number; max?: number } }) => {
            if (xaxis?.min && xaxis?.max) {
              setVisibleRange({ min: Math.round(xaxis.min), max: Math.round(xaxis.max) });
            } else {
              setVisibleRange(null);
            }
          },
          beforeResetZoom: () => {
            setVisibleRange(null);
          },
        },
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: theme.palette.error.main,
            downward: theme.palette.info.main,
          },
          wick: { useFillColor: true },
        },
      },
      annotations,
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: theme.palette.text.secondary } },
        ...(visibleRange ? { min: visibleRange.min, max: visibleRange.max } : {}),
      },
      yaxis: {
        title: {
          text: `가격 (${market === 'US' ? 'USD' : 'KRW'})`,
          style: { color: theme.palette.text.secondary, fontWeight: 600 },
        },
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) => formatMoney(value),
        },
        min: yMin,
        max: yMax,
      },
      stroke: chartData.stroke,
      colors: chartData.colors,
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        labels: { colors: theme.palette.text.secondary },
      },
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
        custom: ({
          seriesIndex,
          dataPointIndex,
          w,
        }: {
          seriesIndex: number;
          dataPointIndex: number;
          w: unknown;
        }) => {
          const series = (w as any).config.series[seriesIndex];
          if (series?.type === 'candlestick') {
            const point = series.data[dataPointIndex];
            const [o, h, l, c] = point.y as number[];
            const date = new Date(point.x).toLocaleDateString('ko-KR');
            return `<div style="padding:8px 12px;font-size:12px;line-height:1.6">
              <b>${date}</b><br/>
              <span>시가(O): ${formatMoney(o)}</span><br/>
              <span>고가(H): ${formatMoney(h)}</span><br/>
              <span>저가(L): ${formatMoney(l)}</span><br/>
              <span>종가(C): ${formatMoney(c)}</span>
            </div>`;
          }
          const val = (w as any).config.series[seriesIndex].data[dataPointIndex]?.y;
          return `<div style="padding:6px 10px;font-size:12px">${series.name}: ${formatMoney(val)}</div>`;
        },
      },
      grid: {
        borderColor: alpha(theme.palette.grey[500], 0.1),
        strokeDashArray: 3,
        padding: {
          top: 15,
          right: 25,
          bottom: 0,
          left: 10,
        },
      },
    };
  }, [theme, market, chartData, showFib, visibleHighLow, formatMoney, lineCurve, visibleRange, showAutoTrend, dynamicLines]);

  const runSimulation = useCallback(() => {
    setIsSimulating(true);
    setTimeout(() => {
      const results: SimResult[] = [];

      for (const opt of tickerOptions) {
        const rawData = allTickersData[opt.ticker];
        if (!rawData) continue;

        const allPrices = (rawData.prices || []) as PriceDataPoint[];
        const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };

        let slice: PriceDataPoint[];
        if (period === 'custom' && startDate && endDate) {
          slice = allPrices.filter((p) => p.date >= startDate && p.date <= endDate);
        } else {
          const days = daysMap[period === 'custom' ? '1y' : period];
          slice = allPrices.slice(-days);
        }

        if (slice.length === 0) continue;

        const closePrices = slice.map((p) => p.close);
        const openPrices = slice.map((p) => p.open || p.close);
        const highPrices = slice.map((p) => p.high || p.close);
        const lowPrices = slice.map((p) => p.low || p.close);
        const dates = slice.map((p) => p.date);

        const currentHighs =
          trendBase === 'close' ? closePrices : trendBase === 'open' ? openPrices : highPrices;
        const currentLows =
          trendBase === 'close' ? closePrices : trendBase === 'open' ? openPrices : lowPrices;
        const currentCloses =
          trendBase === 'close' ? closePrices : trendBase === 'open' ? openPrices : closePrices;
        const currentOpens =
          trendBase === 'close' ? closePrices : trendBase === 'open' ? openPrices : openPrices;

        let srRaw: { support: number | null; resistance: number | null; zigzag?: number | null }[] = [];

        if (trendAlgo === 'regression') {
          srRaw = calcLinearRegressionChannel(currentCloses, regressionStdDev);
        } else if (trendAlgo === 'zigzag') {
          srRaw = calcZigZagSupportResistance(
            currentHighs,
            currentLows,
            currentCloses,
            currentOpens,
            zigzagThreshold
          );
        } else {
          srRaw = calcSupportResistance(currentHighs, currentLows, currentCloses, currentOpens);
        }

        let highTouchCount = 0;
        let closeTouchCount = 0;
        const itemTouchPoints: TouchPoint[] = [];

        if (srRaw.length > 0) {
          for (let idx = 0; idx < srRaw.length; idx++) {
            const pt = srRaw[idx];
            if (pt.resistance !== null && pt.resistance !== undefined) {
              const R_i = pt.resistance;
              const high = highPrices[idx] ?? 0;
              const close = closePrices[idx] ?? 0;
              const lowerBound = R_i * (1 - trendTouchTolerance / 100);
              const upperBound = R_i * 1.01;

              let isTouch = false;
              let priceType: 'high' | 'close' = 'high';
              let touchedY = high;

              const checkClose = trendTouchBasis === 'close' || trendTouchBasis === 'both';
              const checkHigh = trendTouchBasis === 'high' || trendTouchBasis === 'both';

              if (checkClose && close >= lowerBound && close <= upperBound) {
                isTouch = true;
                priceType = 'close';
                touchedY = close;
                closeTouchCount++;
              } else if (checkHigh && high >= lowerBound && high <= upperBound) {
                isTouch = true;
                priceType = 'high';
                touchedY = high;
                highTouchCount++;
              }

              if (isTouch) {
                itemTouchPoints.push({
                  x: new Date(dates[idx]).getTime(),
                  y: touchedY,
                  priceType,
                });
              }
            }
          }
        }

        const resistanceData = srRaw
          .map((pt, idx) => ({
            x: new Date(dates[idx]).getTime(),
            y: pt.resistance,
          }))
          .filter((pt) => pt.y !== null);

        const supportData = srRaw
          .map((pt, idx) => ({
            x: new Date(dates[idx]).getTime(),
            y: pt.support,
          }))
          .filter((pt) => pt.y !== null);

        const zigzagData = srRaw
          .map((pt, idx) => ({
            x: new Date(dates[idx]).getTime(),
            y: pt.zigzag,
          }))
          .filter((pt): pt is { x: number; y: number } => pt.y !== null && pt.y !== undefined);

        const firstR = resistanceData[0]?.y ?? 0;
        const lastR = resistanceData[resistanceData.length - 1]?.y ?? 0;
        const slope = lastR - firstR;
        const slopeType: 'positive' | 'negative' | 'flat' =
          slope > 0.001 ? 'positive' : slope < -0.001 ? 'negative' : 'flat';

        results.push({
          ticker: opt.ticker,
          name: opt.name,
          touchCount: highTouchCount + closeTouchCount,
          closeTouchCount,
          highTouchCount,
          prices: slice,
          resistanceData,
          supportData,
          zigzagData: trendAlgo === 'zigzag' ? zigzagData : undefined,
          latestResistance: srRaw[srRaw.length - 1]?.resistance ?? null,
          touchPoints: itemTouchPoints,
          slopeType,
        });
      }

      results.sort((a, b) => b.touchCount - a.touchCount);

      setSimResults(results);
      setIsSimulating(false);
      setShowSimModal(true);
    }, 150);
  }, [
    tickerOptions,
    period,
    startDate,
    endDate,
    trendBase,
    trendAlgo,
    zigzagThreshold,
    regressionStdDev,
    trendTouchTolerance,
    trendTouchBasis,
  ]);

  const handleTickerChange = (newValue: { ticker: string; name: string } | null) => {
    if (newValue) {
      if (market === 'US') {
        setUsTicker(newValue.ticker);
      } else {
        setKrTicker(newValue.ticker);
      }
    }
  };

  const handleMarketChange = (newMarket: 'US' | 'KR') => {
    setMarket(newMarket);
    if (newMarket === 'US') {
      setUsTicker('AAPL');
    } else {
      setKrTicker('005930.KS');
    }
  };

  return {
    market,
    setMarket,
    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    usTicker,
    setUsTicker,
    krTicker,
    setKrTicker,
    showSma5,
    setShowSma5,
    showSma20,
    setShowSma20,
    showSma60,
    setShowSma60,
    showSma120,
    setShowSma120,
    showSma240,
    setShowSma240,
    showBb,
    setShowBb,
    showRsi,
    setShowRsi,
    showMacd,
    setShowMacd,
    showEnv,
    setShowEnv,
    showFib,
    setShowFib,
    showDonchian,
    setShowDonchian,
    showAutoTrend,
    setShowAutoTrend,
    trendBase,
    setTrendBase,
    trendAlgo,
    setTrendAlgo,
    zigzagThreshold,
    setZigzagThreshold,
    regressionStdDev,
    setRegressionStdDev,
    lineCurve,
    setLineCurve,
    visibleRange,
    setVisibleRange,
    currentTicker,
    tickerOptions,
    selectedStockMeta,
    activeStockDataSlice,
    techAnalysis,
    visibleHighLow,
    dynamicLines,
    chartData,
    chartOptions,
    formatMoney,
    handleTickerChange,
    handleMarketChange,
    trendTouchTolerance,
    setTrendTouchTolerance,
    trendTouchBasis,
    setTrendTouchBasis,
    simResults,
    setSimResults,
    isSimulating,
    setIsSimulating,
    showSimModal,
    setShowSimModal,
    runSimulation,
  };
}

export type UseChartIndicatorsReturn = ReturnType<typeof useChartIndicators>;
