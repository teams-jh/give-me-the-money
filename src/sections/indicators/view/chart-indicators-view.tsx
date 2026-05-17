'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useState, useMemo, useEffect } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha, useTheme } from '@mui/material/styles';

import ChartApex from 'react-apexcharts';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import { DashboardContent } from 'src/layouts/dashboard';
import { MarketPeriodSelector } from 'src/components/market-period-selector';

import { DiagnosticCard } from '../components/diagnostic-card';
import {
  calcMA, calcRSI, calcBollingerBands,
  calcMACD, calcEnvelope, calcDonchianChannels,
} from 'src/library/shared/indicators';

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

  const currencySymbol = market === 'US' ? '$' : '₩';

  const formatMoney = (val: number) => {
    if (market === 'US') {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${val.toLocaleString()}원`;
  };

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
  }, [theme, market, chartData, showFib, visibleHighLow]);

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

  const getRsiDiagnostic = (val: number) => {
    if (val >= 70) return { status: 'Bearish', label: '과매수 (Overbought) ⚠️', desc: '상승 에너지가 과도하게 팽창하여 단기 조정을 경계해야 하는 영역입니다.' };
    if (val <= 30) return { status: 'Bullish', label: '과매도 (Oversold) 🟢', desc: '과도한 투매로 기술적 반등 및 바닥 형성 기대감이 증가하는 국면입니다.' };
    if (val >= 50) return { status: 'Neutral', label: '강세 유지 (Neutral-Bullish) 👍', desc: '매수 거래량이 우위를 지키며 안정적인 상승 동력을 이어가는 상태입니다.' };
    return { status: 'Neutral', label: '약세 우려 (Neutral-Bearish) 👎', desc: '상승세가 다소 둔화되어 단기적인 매수 대기 상태를 유지하는 것이 적합합니다.' };
  };

  const getMaDiagnostic = (price: number, sma20: number, sma50: number) => {
    if (price > sma20 && sma20 > sma50) {
      return { status: 'Bullish', label: '정배열 강세 상승 🚀', desc: '단기/장기 이동평균선이 정배열 상태를 이루어 전형적인 강세 상승 국면에 진입했습니다.' };
    }
    if (price < sma20 && sma20 < sma50) {
      return { status: 'Bearish', label: '역배열 추세 약세 📉', desc: '모든 이동평균선 아래로 주가가 이탈하여 하락 추세가 장기화될 우려가 있는 리스크 구간입니다.' };
    }
    return { status: 'Neutral', label: '추세 전환 횡보 ⚖️', desc: '주가와 이동평균선이 수렴하여 에너지를 응축하며 새로운 방향성을 저울질하는 단계입니다.' };
  };

  const getMacdDiagnostic = (hist: number, line: number, sig: number) => {
    if (hist > 0 && line > sig) {
      return { status: 'Bullish', label: '골든크로스 상승 🟢', desc: 'MACD 라인이 시그널 선을 돌파한 후 오실레이터가 상승을 이어가며 강력한 매수 모멘텀을 형성 중입니다.' };
    }
    if (hist < 0 && line < sig) {
      return { status: 'Bearish', label: '데드크로스 하락 🔴', desc: 'MACD 라인이 시그널 아래로 꺾이며 하향 침체 구간으로 진입, 조정 모멘텀이 강화되고 있습니다.' };
    }
    return { status: 'Neutral', label: '수렴 변곡점 형성 ⚖️', desc: '추세 강도의 모멘텀 차이가 미미하며 조만간 돌파 방향이 확정될 변곡점에 위치해 있습니다.' };
  };

  const getBbDiagnostic = (price: number, upper: number, lower: number, middle: number) => {
    const range = upper - lower;
    const pos = range !== 0 ? (price - lower) / range : 0.5;

    if (price >= upper * 0.98) {
      return { status: 'Bearish', label: '상단 밴드 저항 돌파 ⚠️', desc: '볼린저 밴드 상단선을 돌파 혹은 근접하여 가격이 변동성 한계치에 이르렀으므로 저항 매물을 주의해야 합니다.' };
    }
    if (price <= lower * 1.02) {
      return { status: 'Bullish', label: '하단 밴드 과매수 기회 🟢', desc: '밴드 하단을 건드리며 단기 낙폭 과대 현상이 나타났고, 지지 반등 가능성이 열려있는 지점입니다.' };
    }
    return { status: 'Neutral', label: '중앙 지지선 안착 ⚖️', desc: '밴드 내 중심 평균선(SMA 20) 부근에서 가격 안정성을 다지며 매물 소화 과정을 거치는 중입니다.' };
  };

  const rsiDiag = techAnalysis ? getRsiDiagnostic(techAnalysis.latestRsi) : null;
  const maDiag = techAnalysis ? getMaDiagnostic(techAnalysis.currentPrice, techAnalysis.latestSma20, techAnalysis.latestSma50) : null;
  const macdDiag = techAnalysis ? getMacdDiagnostic(techAnalysis.latestHist, techAnalysis.latestMacd, techAnalysis.latestSignal) : null;
  const bbDiag = techAnalysis ? getBbDiagnostic(techAnalysis.currentPrice, techAnalysis.latestBbUpper, techAnalysis.latestBbLower, techAnalysis.latestBbSma) : null;

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
        <Card sx={{ p: 3, boxShadow: theme.customShadows?.card || `0 4px 16px 0 ${alpha(theme.palette.common.black, 0.04)}` }}>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 8.5 }}>
              <Autocomplete
                fullWidth
                selectOnFocus
                clearOnBlur
                handleHomeEndKeys
                options={tickerOptions}
                getOptionLabel={(option) => `${option.name} (${option.ticker})`}
                value={selectedStockMeta ? { ticker: selectedStockMeta.ticker, name: selectedStockMeta.name } : null}
                onChange={(e, v) => handleTickerChange(v)}
                filterOptions={(options, state) => {
                  const query = state.inputValue.toLowerCase().trim();
                  if (!query) return options;

                  // If the query is exactly the label of the currently selected stock, show all options
                  if (
                    selectedStockMeta &&
                    `${selectedStockMeta.name} (${selectedStockMeta.ticker})`.toLowerCase() === query
                  ) {
                    return options;
                  }

                  return options.filter(
                    (opt) =>
                      opt.ticker.toLowerCase().includes(query) ||
                      opt.name.toLowerCase().includes(query)
                  );
                }}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.ticker}>
                    <Stack>
                      <Typography variant="subtitle2">{option.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {option.ticker}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={market === 'US' ? '미국 분석 종목 선택' : '한국 분석 종목 선택'}
                    placeholder="티커 또는 회사명 검색..."
                  />
                )}
              />
            </Grid>

            {/* Current Active Single Selection Details */}
            {selectedStockMeta && techAnalysis && (
              <Grid size={{ xs: 12, md: 3.5 }}>
                <Stack direction="row" spacing={3} alignItems="center" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                      현재 선택된 종목
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={selectedStockMeta.ticker}
                        color="primary"
                        variant="soft"
                        sx={{ fontWeight: 800 }}
                      />
                      <Typography variant="h6" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {selectedStockMeta.name}
                      </Typography>
                    </Stack>
                  </Box>

                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h4" sx={{ fontWeight: 900 }}>
                      {formatMoney(techAnalysis.currentPrice)}
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        color: techAnalysis.dailyChange >= 0 ? 'error.main' : 'success.main',
                      }}
                    >
                      {techAnalysis.dailyChange >= 0 ? '▲' : '▼'}{' '}
                      {formatMoney(Math.abs(techAnalysis.dailyChange))} ({techAnalysis.dailyChangePct.toFixed(2)}%)
                    </Typography>
                  </Box>
                </Stack>
              </Grid>
            )}
          </Grid>
        </Card>

        {/* 2. Technical Diagnostics & Price Action Chart */}
        {techAnalysis && selectedStockMeta && (
          <Grid container spacing={2}>
            {/* Real-time Technical Score Banner */}
            <Grid size={{ xs: 12 }}>
              <Card
                sx={{
                  p: 2,
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.12)} 0%, ${alpha(theme.palette.info.light, 0.08)} 100%)`,
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                  borderRadius: 2,
                }}
              >
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, md: 8.5 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Chip
                          label="차트 종합 분석 지수"
                          color="primary"
                          size="small"
                          sx={{ fontWeight: 800, borderRadius: 0.5 }}
                        />
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                          {techAnalysis.score >= 70
                            ? '긍정적 매수 세력 유입세 🚀'
                            : techAnalysis.score <= 35
                              ? '하방 압력 가중, 비중 조절 주의 ⚠️'
                              : '수렴구간, 중립 횡보 및 탐색 ⚖️'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          • 동적 알고리즘 스캔 완료
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
                        RSI {techAnalysis.latestRsi.toFixed(1)} 수준과 MACD 오실레이터, 이동평균선의 정합성을 바탕으로 도출한 {selectedStockMeta.name}({selectedStockMeta.ticker})의 기술적 모멘텀 점수는{' '}
                        <b>{techAnalysis.score}점</b>입니다.
                      </Typography>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, md: 3.5 }}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      sx={{
                        p: 1.5,
                        bgcolor: alpha(theme.palette.background.paper, 0.8),
                        borderRadius: 1.5,
                        border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                      }}
                    >
                      <Box sx={{ minWidth: 80, textAlign: 'center' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.2 }}>
                          종합 점수
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 900,
                            color: techAnalysis.score >= 70 ? 'success.main' : techAnalysis.score <= 35 ? 'error.main' : 'warning.main',
                            lineHeight: 1,
                          }}
                        >
                          {techAnalysis.score} / 100
                        </Typography>
                      </Box>
                      <Box sx={{ flexGrow: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={techAnalysis.score}
                          color={techAnalysis.score >= 70 ? 'success' : techAnalysis.score <= 35 ? 'error' : 'warning'}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
              </Card>
            </Grid>

            {/* 💡 Interactive Technical Indicators Toggle Controller */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ p: 2, boxShadow: theme.customShadows?.card || `0 4px 16px 0 ${alpha(theme.palette.common.black, 0.04)}` }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      🛠️ 기술적 분석 지표 활성화 필터
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      원하는 보조지표를 활성화하면 차트에 선이 실시간으로 표기되고 우측 진단 설명 보드가 생성됩니다.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
                    <Chip label="MA 5" color={showSma5 ? 'secondary' : 'default'} variant={showSma5 ? 'filled' : 'outlined'} onClick={() => setShowSma5(!showSma5)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
                    <Chip label="MA 20" color={showSma20 ? 'warning' : 'default'} variant={showSma20 ? 'filled' : 'outlined'} onClick={() => setShowSma20(!showSma20)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
                    <Chip label="MA 60" color={showSma60 ? 'info' : 'default'} variant={showSma60 ? 'filled' : 'outlined'} onClick={() => setShowSma60(!showSma60)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
                    <Chip label="MA 120" color={showSma120 ? 'error' : 'default'} variant={showSma120 ? 'filled' : 'outlined'} onClick={() => setShowSma120(!showSma120)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
                    <Chip label="MA 240" color={showSma240 ? 'default' : 'default'} variant={showSma240 ? 'filled' : 'outlined'} onClick={() => setShowSma240(!showSma240)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
                    <Chip
                      label="볼린저 밴드 (Bollinger)"
                      color={showBb ? 'success' : 'default'}
                      variant={showBb ? 'filled' : 'outlined'}
                      onClick={() => setShowBb(!showBb)}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      label="엔벨로프 (Envelope)"
                      color={showEnv ? 'secondary' : 'default'}
                      variant={showEnv ? 'filled' : 'outlined'}
                      onClick={() => setShowEnv(!showEnv)}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      label="피보나치 (Fibonacci)"
                      color={showFib ? 'error' : 'default'}
                      variant={showFib ? 'filled' : 'outlined'}
                      onClick={() => setShowFib(!showFib)}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      label="돈천 채널 (Donchian)"
                      color={showDonchian ? 'info' : 'default'}
                      variant={showDonchian ? 'filled' : 'outlined'}
                      onClick={() => setShowDonchian(!showDonchian)}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      label="RSI (14)"
                      color={showRsi ? 'primary' : 'default'}
                      variant={showRsi ? 'filled' : 'outlined'}
                      onClick={() => setShowRsi(!showRsi)}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      label="MACD"
                      color={showMacd ? 'info' : 'default'}
                      variant={showMacd ? 'filled' : 'outlined'}
                      onClick={() => setShowMacd(!showMacd)}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                  </Stack>
                </Stack>
              </Card>
            </Grid>

            {/* Apex Technical Chart (Left 8 Columns) */}
            <Grid size={{ xs: 12, lg: 8 }}>
              <Card sx={{ p: 3, height: 600, boxShadow: theme.customShadows?.card }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {selectedStockMeta.name} 주가 및 지표 추이 ({period.toUpperCase()})
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
                    실선: 주가 | 점선: 볼린저 밴드 & SMA 20
                  </Typography>
                </Stack>

                <Box sx={{ height: 500 }}>
                  <ChartApex
                    options={chartOptions}
                    series={chartData.series}
                    type="line"
                    height="100%"
                  />
                </Box>
              </Card>
            </Grid>

            {/* Real-time calculated Diagnostic Cards (Right 4 Columns) */}
            <Grid size={{ xs: 12, lg: 4 }}>
              <Stack spacing={3} sx={{ height: '100%' }}>
                {/* 1. MA Diagnostic Card */}
                {/* 1. MA Diagnostic Card */}
                {(showSma5 || showSma20 || showSma60 || showSma120 || showSma240) && maDiag && (
                  <DiagnosticCard
                    title="이동평균선 (MA)"
                    label={maDiag.label}
                    status={maDiag.status}
                    desc={maDiag.desc}
                    value={`SMA20: ${formatMoney(techAnalysis.latestSma20)}`}
                  />
                )}

                {/* 2. RSI Diagnostic Card */}
                {showRsi && rsiDiag && (
                  <DiagnosticCard
                    title="상대강도지수 (RSI)"
                    label={rsiDiag.label}
                    status={rsiDiag.status}
                    desc={rsiDiag.desc}
                    value={`RSI(14): ${techAnalysis.latestRsi.toFixed(1)}`}
                  />
                )}

                {/* 3. MACD Diagnostic Card */}
                {showMacd && macdDiag && (
                  <DiagnosticCard
                    title="MACD (12, 26, 9)"
                    label={macdDiag.label}
                    status={macdDiag.status}
                    desc={macdDiag.desc}
                    value={`Oscillator: ${techAnalysis.latestHist.toFixed(2)}`}
                  />
                )}

                {/* 4. Bollinger Bands Diagnostic Card */}
                {showBb && bbDiag && (
                  <DiagnosticCard
                    title="볼린저 밴드"
                    label={bbDiag.label}
                    status={bbDiag.status}
                    desc={bbDiag.desc}
                    value={`Upper Band: ${formatMoney(techAnalysis.latestBbUpper)}`}
                  />
                )}

                {/* 5. Envelope Diagnostic Card */}
                {showEnv && (
                  <DiagnosticCard
                    title="엔벨로프 (Envelope 10%)"
                    label="단기 과매도/과매수 반등 타점 📏"
                    status="Neutral"
                    desc="주가가 밴드 하단을 뚫고 터치하면 과매도로 기술적 반등 매수 타점, 상단은 저항선으로 판단합니다."
                    value={`Upper: ${formatMoney(techAnalysis.latestEnvUpper)}`}
                  />
                )}

                {/* 6. Fibonacci Diagnostic Card */}
                {showFib && (
                  <DiagnosticCard
                    title="피보나치 조정대"
                    label="지지선 및 저항선 예측 📐"
                    status="Neutral"
                    desc="상승 후 조정 시 38.2% 또는 61.8% 비율에서 강력한 지지를 받고 반등할 확률이 높습니다."
                    value={`38.2%: ${formatMoney(techAnalysis.fibonacci.fib382)}`}
                  />
                )}

                {/* 7. Donchian Channels Diagnostic Card */}
                {showDonchian && (
                  <DiagnosticCard
                    title="돈천 채널 (가격 채널)"
                    label="돌파 매매 추세 확인 🚀"
                    status="Neutral"
                    desc="주가가 상단선을 돌파하면 강력한 상승 추세의 시작, 하단 이탈 시 하락 추세 시작으로 해석합니다."
                    value={`Upper: ${formatMoney(techAnalysis.latestDonchianUpper)}`}
                  />
                )}

                {/* Fallback empty state when all indicators are toggled off */}
                {!showSma5 && !showSma20 && !showSma60 && !showSma120 && !showSma240 && !showBb && !showRsi && !showMacd && !showEnv && !showFib && !showDonchian && (
                  <Card
                    sx={{
                      p: 4,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      bgcolor: alpha(theme.palette.background.neutral || theme.palette.grey[200], 0.4),
                      border: `1px dashed ${theme.palette.divider}`,
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h3" sx={{ mb: 1.5 }}>
                      💡
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
                      활성화된 보조지표 진단이 없습니다
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 240 }}>
                      차트 종합 분석 지수 아래의 필터를 선택하여 차트 분석을 진행해 보세요!
                    </Typography>
                  </Card>
                )}
              </Stack>
            </Grid>
          </Grid>
        )}
      </Stack>
    </DashboardContent>
  );
}

