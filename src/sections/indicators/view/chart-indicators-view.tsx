'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';
import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import {
  calcMA, calcRSI, calcMACD,
  calcEnvelope, calcBollingerBands, calcDonchianChannels,
} from 'src/library/shared/indicators';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

import { TechnicalApexChart } from '../components/technical-apex-chart';
import { TickerSelectionCard } from '../components/ticker-selection-card';
import { TechnicalScoreBanner } from '../components/technical-score-banner';
import { IndicatorFilterChips } from '../components/indicator-filter-chips';
import { TechnicalDiagnosticsPanel } from '../components/technical-diagnostics-panel';

// ----------------------------------------------------------------------

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function ChartIndicatorsView() {
  const theme = useTheme();

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

  // Dynamic visible chart range (for highest/lowest calculations on zoom)
  const [visibleRange, setVisibleRange] = useState<{ min: number; max: number } | null>(null);

  const currentTicker = market === 'US' ? usTicker : krTicker;

  // Reset visibleRange when ticker or period changes
  useEffect(() => {
    setVisibleRange(null);
  }, [currentTicker, period]);

  // Filter Autocomplete Ticker Options based on Market
  const tickerOptions = useMemo(() => {
    const isKr = market === 'KR';
    const filtered = allTickersList.filter((t) => isKr ? t.includes('.') : !t.includes('.'));

    return filtered.map((ticker) => {
      const info = allTickersData[ticker]?.info;
      const name = isKr
        ? (info?.kr_name || info?.name || '')
        : (info?.name || '');
      return { ticker, name };
    });
  }, [market]);

  // Current selected stock meta
  const selectedStockMeta = useMemo(() => {
    const rawData = allTickersData[currentTicker];
    if (!rawData) return null;

    const isKr = currentTicker.includes('.');
    const name = isKr
      ? (rawData.info?.kr_name || rawData.info?.name || currentTicker)
      : (rawData.info?.name || currentTicker);

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

    const allPrices = rawData.prices || [];
    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };

    let slice;
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
  const techAnalysis = useMemo(() => {
    if (!activeStockDataSlice || activeStockDataSlice.closePrices.length === 0) return null;

    const prices = activeStockDataSlice.closePrices;
    const dates = activeStockDataSlice.dates;
    const length = prices.length;

    // Last values (current status)
    const currentPrice = prices[length - 1] || 0;
    const prevPrice = prices[length - 2] || currentPrice;
    const dailyChange = currentPrice - prevPrice;
    const dailyChangePct = prevPrice !== 0 ? (dailyChange / prevPrice) * 100 : 0;

    // Technical computations using shared library
    const sma5 = calcMA(prices, 5).map((val, idx) => val ?? prices[idx]);
    const sma20 = calcMA(prices, 20).map((val, idx) => val ?? prices[idx]);
    const sma50 = calcMA(prices, 50).map((val, idx) => val ?? prices[idx]);
    const sma60 = calcMA(prices, 60).map((val, idx) => val ?? prices[idx]);
    const sma120 = calcMA(prices, 120).map((val, idx) => val ?? prices[idx]);
    const sma240 = calcMA(prices, 240).map((val, idx) => val ?? prices[idx]);
    const rsi = calcRSI(prices, 14).map((val) => val ?? 50);

    const macdRaw = calcMACD(prices);
    const macd = {
      macdLine: macdRaw.map((pt) => pt.macd ?? 0),
      signalLine: macdRaw.map((pt) => pt.signal ?? 0),
      histogram: macdRaw.map((pt) => pt.histogram ?? 0),
    };

    const bbRaw = calcBollingerBands(prices, 20);
    const bb = {
      sma: bbRaw.map((pt, idx) => pt.mid ?? prices[idx]),
      upper: bbRaw.map((pt, idx) => pt.upper ?? prices[idx]),
      lower: bbRaw.map((pt, idx) => pt.lower ?? prices[idx]),
    };

    const envRaw = calcEnvelope(prices, 20, 0.1);
    const env = {
      sma: envRaw.map((pt, idx) => pt.mid ?? prices[idx]),
      upper: envRaw.map((pt, idx) => pt.upper ?? prices[idx]),
      lower: envRaw.map((pt, idx) => pt.lower ?? prices[idx]),
    };

    const donchianRaw = calcDonchianChannels(prices, 20);
    const donchian = {
      upper: donchianRaw.map((pt, idx) => pt.upper ?? prices[idx]),
      lower: donchianRaw.map((pt, idx) => pt.lower ?? prices[idx]),
      middle: donchianRaw.map((pt, idx) => pt.mid ?? prices[idx]),
    };

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
    if (currentPrice > latestSma20) score += 10; else score -= 5;
    if (currentPrice > latestSma50) score += 10; else score -= 5;
    if (currentPrice > latestSma120) score += 10; else score -= 5;

    // 2. Momentum: RSI between 40 and 65 (+15), RSI > 70 (-10 overbought), RSI < 30 (+10 oversold bounce)
    if (latestRsi > 70) score -= 10;
    else if (latestRsi < 30) score += 10;
    else if (latestRsi >= 45 && latestRsi <= 65) score += 15;

    // 3. MACD: Histogram > 0 (+15)
    if (latestHist > 0) score += 15; else score -= 5;

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
      score,
      // Arrays for chart
      sma5,
      sma20,
      sma60,
      sma120,
      sma240,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      envUpper: env.upper,
      envLower: env.lower,
      donchianUpper: donchian.upper,
      donchianLower: donchian.lower,
      donchianMiddle: donchian.middle,
      fibonacci,
    };
  }, [activeStockDataSlice]);

  // Chart configuration for selected ticker
  const chartData = useMemo(() => {
    if (!activeStockDataSlice || !techAnalysis) {
      return {
        series: [],
        colors: [],
        stroke: { curve: 'smooth' as const, width: [], dashArray: [] },
      };
    }

    const series = [
      {
        name: '주가 (OHLC)',
        type: 'candlestick',
        data: activeStockDataSlice.closePrices.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: [
            activeStockDataSlice.openPrices[idx] || val,
            activeStockDataSlice.highPrices[idx] || val,
            activeStockDataSlice.lowPrices[idx] || val,
            val
          ],
        })),
      },
    ];

    const colors = [theme.palette.primary.main];
    const widths = [1];
    const dashes = [0];

    if (showSma5) {
      series.push({
        name: 'SMA (5일선)', type: 'line',
        data: techAnalysis.sma5.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.secondary.main); widths.push(1); dashes.push(0);
    }

    if (showSma20) {
      series.push({
        name: 'SMA (20일선)', type: 'line',
        data: techAnalysis.sma20.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.warning.main); widths.push(2); dashes.push(0);
    }

    if (showSma60) {
      series.push({
        name: 'SMA (60일선)', type: 'line',
        data: techAnalysis.sma60.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.info.main); widths.push(1); dashes.push(0);
    }

    if (showSma120) {
      series.push({
        name: 'SMA (120일선)', type: 'line',
        data: techAnalysis.sma120.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.error.main); widths.push(1); dashes.push(0);
    }

    if (showSma240) {
      series.push({
        name: 'SMA (240일선)', type: 'line',
        data: techAnalysis.sma240.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.text.disabled); widths.push(1); dashes.push(0);
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
        name: '엔벨로프 상단 (10%)', type: 'line',
        data: techAnalysis.envUpper.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.secondary.light); widths.push(1); dashes.push(4);

      series.push({
        name: '엔벨로프 하단 (10%)', type: 'line',
        data: techAnalysis.envLower.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.secondary.light); widths.push(1); dashes.push(4);
    }

    if (showDonchian) {
      series.push({
        name: '돈천 채널 상단', type: 'line',
        data: techAnalysis.donchianUpper.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.info.light); widths.push(1); dashes.push(0);

      series.push({
        name: '돈천 채널 하단', type: 'line',
        data: techAnalysis.donchianLower.map((val, idx) => ({ x: new Date(activeStockDataSlice.dates[idx]).getTime(), y: val }))
      });
      colors.push(theme.palette.info.light); widths.push(1); dashes.push(0);
    }

    return {
      series,
      colors,
      stroke: {
        curve: 'smooth' as const,
        width: widths,
        dashArray: dashes,
      },
    };
  }, [activeStockDataSlice, techAnalysis, showSma5, showSma20, showSma60, showSma120, showSma240, showBb, showEnv, showDonchian, theme]);

  const formatMoney = useCallback((val: number) => {
    if (market === 'US') {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${val.toLocaleString()}원`;
  }, [market]);

  // Compute visible high/low based on visibleRange
  const visibleHighLow = useMemo(() => {
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

    const highs = indices.map(i => highPrices[i]);
    const lows = indices.map(i => lowPrices[i]);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const maxIdx = indices[highs.indexOf(max)];
    const minIdx = indices[lows.indexOf(min)];

    return {
      max, min,
      maxDate: new Date(dates[maxIdx]).getTime(),
      minDate: new Date(dates[minIdx]).getTime(),
    };
  }, [activeStockDataSlice, visibleRange]);

  const chartOptions = useMemo<any>(() => {
    const annotations: any = { yaxis: [], points: [] };

    if (visibleHighLow) {
      const { max, min, maxDate, minDate } = visibleHighLow;
      annotations.points.push(
        {
          x: maxDate, y: max,
          marker: { size: 5, fillColor: theme.palette.error.main, strokeColor: '#fff', strokeWidth: 2 },
          label: {
            borderColor: theme.palette.error.main, offsetY: -10,
            style: { color: '#fff', background: theme.palette.error.main, fontWeight: 700, fontSize: '11px' },
            text: `최고가: ${formatMoney(max)}`
          }
        },
        {
          x: minDate, y: min,
          marker: { size: 5, fillColor: theme.palette.info.main, strokeColor: '#fff', strokeWidth: 2 },
          label: {
            borderColor: theme.palette.info.main, offsetY: 10,
            style: { color: '#fff', background: theme.palette.info.main, fontWeight: 700, fontSize: '11px' },
            text: `최저가: ${formatMoney(min)}`
          }
        }
      );
    }

    if (showFib && visibleHighLow) {
      const { max, min } = visibleHighLow;
      const diff = max - min;
      const fibColors = theme.palette.grey[500];
      annotations.yaxis.push(
        { y: max, borderColor: theme.palette.error.main, label: { text: '100% (High)', style: { color: '#fff', background: theme.palette.error.main } } },
        { y: max - diff * 0.236, borderColor: fibColors, strokeDashArray: 2, label: { text: '23.6%', style: { color: '#fff', background: fibColors } } },
        { y: max - diff * 0.382, borderColor: fibColors, strokeDashArray: 2, label: { text: '38.2%', style: { color: '#fff', background: fibColors } } },
        { y: max - diff * 0.5, borderColor: fibColors, strokeDashArray: 2, label: { text: '50.0%', style: { color: '#fff', background: fibColors } } },
        { y: max - diff * 0.618, borderColor: fibColors, strokeDashArray: 2, label: { text: '61.8%', style: { color: '#fff', background: fibColors } } },
        { y: min, borderColor: theme.palette.success.main, label: { text: '0% (Low)', style: { color: '#fff', background: theme.palette.success.main } } }
      );
    }

    return {
      chart: {
        id: 'indicators-chart',
        toolbar: { show: true },
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
        }
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: theme.palette.error.main,
            downward: theme.palette.info.main
          },
          wick: { useFillColor: true }
        }
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
        custom: ({ seriesIndex, dataPointIndex, w }: { seriesIndex: number; dataPointIndex: number; w: unknown }) => {
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
      },
    };
  }, [theme, market, chartData, showFib, visibleHighLow, formatMoney, visibleRange]);

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
    // Switch to a sensible default ticker when changing market
    if (newMarket === 'US') {
      setUsTicker('AAPL');
    } else {
      setKrTicker('005930.KS');
    }
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={2}>
        {/* Header with Market Selector & Period Selection */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
          sx={{ pb: 1 }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              차트 기술적 지표 분석 📈
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              단일 종목의 가격 움직임을 기반으로 이동평균선, RSI, MACD, 볼린저 밴드를 실시간 연산하여 분석합니다.
            </Typography>
          </Box>

          <MarketPeriodSelector
            market={market}
            period={period}
            startDate={startDate}
            endDate={endDate}
            onMarketChange={handleMarketChange}
            onPeriodChange={setPeriod}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </Stack>

        {/* 1. Single Ticker Selection Card */}
        <TickerSelectionCard
          market={market}
          tickerOptions={tickerOptions}
          selectedStockMeta={selectedStockMeta}
          techAnalysis={techAnalysis}
          handleTickerChange={handleTickerChange}
          formatMoney={formatMoney}
        />

        {/* 2. Technical Diagnostics & Price Action Chart */}
        {techAnalysis && selectedStockMeta && (
          <Grid container spacing={2}>
            {/* Real-time Technical Score Banner */}
            <TechnicalScoreBanner
              score={techAnalysis.score}
              stockName={selectedStockMeta.name}
              stockTicker={selectedStockMeta.ticker}
              latestRsi={techAnalysis.latestRsi}
            />

            {/* 💡 Interactive Technical Indicators Toggle Controller */}
            <IndicatorFilterChips
              showSma5={showSma5}
              setShowSma5={setShowSma5}
              showSma20={showSma20}
              setShowSma20={setShowSma20}
              showSma60={showSma60}
              setShowSma60={setShowSma60}
              showSma120={showSma120}
              setShowSma120={setShowSma120}
              showSma240={showSma240}
              setShowSma240={setShowSma240}
              showBb={showBb}
              setShowBb={setShowBb}
              showEnv={showEnv}
              setShowEnv={setShowEnv}
              showFib={showFib}
              setShowFib={setShowFib}
              showDonchian={showDonchian}
              setShowDonchian={setShowDonchian}
              showRsi={showRsi}
              setShowRsi={setShowRsi}
              showMacd={showMacd}
              setShowMacd={setShowMacd}
            />

            {/* Apex Technical Chart (Left 8 Columns) */}
            <TechnicalApexChart
              selectedStockMetaName={selectedStockMeta.name}
              period={period}
              chartOptions={chartOptions}
              chartSeries={chartData.series}
            />

            {/* Real-time calculated Diagnostic Cards (Right 4 Columns) */}
            <TechnicalDiagnosticsPanel
              showSma5={showSma5}
              showSma20={showSma20}
              showSma60={showSma60}
              showSma120={showSma120}
              showSma240={showSma240}
              showBb={showBb}
              showRsi={showRsi}
              showMacd={showMacd}
              showEnv={showEnv}
              showFib={showFib}
              showDonchian={showDonchian}
              techAnalysis={techAnalysis}
              formatMoney={formatMoney}
            />
          </Grid>
        )}
      </Stack>
    </DashboardContent>
  );
}

