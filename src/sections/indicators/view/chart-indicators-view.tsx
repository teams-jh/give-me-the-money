'use client';

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha, useTheme } from '@mui/material/styles';

import ChartApex from 'react-apexcharts';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

type PeriodKey = '3m' | '1y' | '2y' | '3y';

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
];

// Technical Indicators Helper Math Functions
function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(data[i]); // Not enough data, fallback to close price
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(Number((sum / period).toFixed(2)));
    }
  }
  return sma;
}

function calculateRSI(data: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      rsi.push(50);
      continue;
    }

    const diff = data[i] - data[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);

    if (i < period) {
      rsi.push(50);
    } else {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      }
    }
  }
  return rsi;
}

function calculateBollingerBands(data: number[], period: number = 20, multiplier: number = 2) {
  const sma = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(data[i]);
      lower.push(data[i]);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      upper.push(Number((mean + multiplier * stdDev).toFixed(2)));
      lower.push(Number((mean - multiplier * stdDev).toFixed(2)));
    }
  }

  return { sma, upper, lower };
}

function calculateMACD(data: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const calculateEMA = (arr: number[], length: number): number[] => {
    const ema: number[] = [];
    const k = 2 / (length + 1);
    let prevEma = arr[0] || 0;
    ema.push(prevEma);

    for (let i = 1; i < arr.length; i++) {
      const curEma = arr[i] * k + prevEma * (1 - k);
      ema.push(curEma);
      prevEma = curEma;
    }
    return ema;
  };

  const ema12 = calculateEMA(data, shortPeriod);
  const ema26 = calculateEMA(data, longPeriod);
  
  const macdLine = ema12.map((val, idx) => Number((val - ema26[idx]).toFixed(2)));
  const signalLine = calculateEMA(macdLine, signalPeriod).map(val => Number(val.toFixed(2)));
  const histogram = macdLine.map((val, idx) => Number((val - signalLine[idx]).toFixed(2)));

  return { macdLine, signalLine, histogram };
}

export function ChartIndicatorsView() {
  const theme = useTheme();

  // Navigation states
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [period, setPeriod] = useState<PeriodKey>('1y');

  // Active Single Selected Ticker States
  const [usTicker, setUsTicker] = useState<string>('AAPL');
  const [krTicker, setKrTicker] = useState<string>('005930.KS');
  const [inputValue, setInputValue] = useState('');

  const currentTicker = market === 'US' ? usTicker : krTicker;

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
    const days = daysMap[period];
    const slice = allPrices.slice(-days);

    const closePrices = slice.map((p) => p.close);
    const dates = slice.map((p) => p.date);

    return {
      closePrices,
      dates,
    };
  }, [currentTicker, period]);

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

    // Technical computations
    const sma20 = calculateSMA(prices, 20);
    const sma50 = calculateSMA(prices, 50);
    const sma120 = calculateSMA(prices, 120);
    const rsi = calculateRSI(prices, 14);
    const macd = calculateMACD(prices);
    const bb = calculateBollingerBands(prices, 20);

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
      score,
      // Arrays for chart
      sma20,
      bbUpper: bb.upper,
      bbLower: bb.lower,
    };
  }, [activeStockDataSlice]);

  // Chart configuration for selected ticker
  const chartSeries = useMemo(() => {
    if (!activeStockDataSlice || !techAnalysis) return [];
    
    return [
      {
        name: '종가 (Close)',
        type: 'line',
        data: activeStockDataSlice.closePrices.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      },
      {
        name: 'SMA (20일선)',
        type: 'line',
        data: techAnalysis.sma20.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      },
      {
        name: '볼린저 밴드 상단',
        type: 'line',
        data: techAnalysis.bbUpper.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      },
      {
        name: '볼린저 밴드 하단',
        type: 'line',
        data: techAnalysis.bbLower.map((val, idx) => ({
          x: new Date(activeStockDataSlice.dates[idx]).getTime(),
          y: val,
        })),
      },
    ];
  }, [activeStockDataSlice, techAnalysis]);

  const currencySymbol = market === 'US' ? '$' : '₩';
  
  const formatMoney = (val: number) => {
    if (market === 'US') {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${val.toLocaleString()}원`;
  };

  const chartOptions = useMemo<any>(() => ({
    chart: {
      toolbar: { show: true },
      zoom: { enabled: true },
      background: 'transparent',
      fontFamily: theme.typography.fontFamily,
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: theme.palette.text.secondary } },
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
    stroke: {
      curve: 'smooth',
      width: [3, 2, 1, 1],
      dashArray: [0, 4, 6, 6],
    },
    colors: [
      theme.palette.primary.main,     // Stock price
      theme.palette.warning.main,     // SMA 20
      theme.palette.success.main,     // BB Upper
      theme.palette.error.main,       // BB Lower
    ],
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      labels: { colors: theme.palette.text.secondary },
    },
    tooltip: {
      theme: theme.palette.mode,
      x: { format: 'yyyy-MM-dd' },
      y: {
        formatter: (value: number) => formatMoney(value),
      },
    },
    grid: {
      borderColor: alpha(theme.palette.grey[500], 0.1),
      strokeDashArray: 3,
    },
  }), [theme, market]);

  const handleTickerChange = (newValue: { ticker: string; name: string } | null) => {
    if (newValue) {
      if (market === 'US') {
        setUsTicker(newValue.ticker);
      } else {
        setKrTicker(newValue.ticker);
      }
    }
    setInputValue('');
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
      <Stack spacing={4}>
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

          <Stack direction="row" spacing={2} alignItems="center" alignSelf={{ xs: 'stretch', md: 'auto' }}>
            <ToggleButtonGroup
              value={market}
              exclusive
              onChange={(e, v) => v && handleMarketChange(v)}
              color="primary"
              size="medium"
            >
              <ToggleButton value="US" sx={{ px: 3, fontWeight: 800 }}>
                US 미국
              </ToggleButton>
              <ToggleButton value="KR" sx={{ px: 3, fontWeight: 800 }}>
                KR 한국
              </ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={period}
              exclusive
              onChange={(e, v) => v && setPeriod(v)}
              size="medium"
              color="primary"
            >
              {PERIOD_OPTIONS.map((option) => (
                <ToggleButton key={option.value} value={option.value} sx={{ px: 2, fontWeight: 700 }}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        </Stack>

        {/* 1. Single Ticker Selection Card */}
        <Card sx={{ p: 3, boxShadow: theme.customShadows?.card || `0 4px 16px 0 ${alpha(theme.palette.common.black, 0.04)}` }}>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                fullWidth
                options={tickerOptions}
                getOptionLabel={(option) => `${option.name} (${option.ticker})`}
                value={selectedStockMeta ? { ticker: selectedStockMeta.ticker, name: selectedStockMeta.name } : null}
                onChange={(e, v) => handleTickerChange(v)}
                inputValue={inputValue}
                onInputChange={(e, v) => setInputValue(v)}
                filterOptions={(options, state) => {
                  const query = state.inputValue.toLowerCase();
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
              <Grid size={{ xs: 12, md: 6 }}>
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
          <Grid container spacing={4}>
            {/* Real-time Technical Score Banner */}
            <Grid size={{ xs: 12 }}>
              <Card
                sx={{
                  p: 3,
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.12)} 0%, ${alpha(theme.palette.info.light, 0.08)} 100%)`,
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                  borderRadius: 2,
                }}
              >
                <Grid container spacing={3} alignItems="center">
                  <Grid size={{ xs: 12, md: 8 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <Chip
                        label="차트 종합 분석 지수"
                        color="primary"
                        sx={{ fontWeight: 800, borderRadius: 1 }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        동적 알고리즘 기준 스캔 완료
                      </Typography>
                    </Stack>
                    <Typography variant="h4" sx={{ fontWeight: 900, mb: 1 }}>
                      {techAnalysis.score >= 70
                        ? '긍정적 매수 세력 유입세 🚀'
                        : techAnalysis.score <= 35
                        ? '하방 압력 가중, 비중 조절 주의 ⚠️'
                        : '수렴구간, 중립 횡보 및 탐색 ⚖️'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      RSI {techAnalysis.latestRsi.toFixed(1)} 수준과 MACD 오실레이터, 이동평균선의 정합성을 바탕으로 도출한 {selectedStockMeta.name}({selectedStockMeta.ticker})의 기술적 모멘텀 점수는{' '}
                      <b>{techAnalysis.score}점</b>입니다.
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Stack direction="column" alignItems="center" sx={{ p: 2, bgcolor: alpha(theme.palette.background.paper, 0.8), borderRadius: 1.5 }}>
                      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                        종합 분석 강도
                      </Typography>
                      <Typography
                        variant="h3"
                        sx={{
                          fontWeight: 900,
                          color: techAnalysis.score >= 70 ? 'success.main' : techAnalysis.score <= 35 ? 'error.main' : 'warning.main',
                          my: 1,
                        }}
                      >
                        {techAnalysis.score} / 100
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={techAnalysis.score}
                        color={techAnalysis.score >= 70 ? 'success' : techAnalysis.score <= 35 ? 'error' : 'warning'}
                        sx={{ width: '100%', height: 6, borderRadius: 3 }}
                      />
                    </Stack>
                  </Grid>
                </Grid>
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
                    series={chartSeries}
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
                {maDiag && (
                  <DiagnosticCard
                    title="이동평균선 (SMA)"
                    label={maDiag.label}
                    status={maDiag.status}
                    desc={maDiag.desc}
                    value={`SMA20: ${formatMoney(techAnalysis.latestSma20)}`}
                  />
                )}

                {/* 2. RSI Diagnostic Card */}
                {rsiDiag && (
                  <DiagnosticCard
                    title="상대강도지수 (RSI)"
                    label={rsiDiag.label}
                    status={rsiDiag.status}
                    desc={rsiDiag.desc}
                    value={`RSI(14): ${techAnalysis.latestRsi.toFixed(1)}`}
                  />
                )}

                {/* 3. MACD Diagnostic Card */}
                {macdDiag && (
                  <DiagnosticCard
                    title="MACD (12, 26, 9)"
                    label={macdDiag.label}
                    status={macdDiag.status}
                    desc={macdDiag.desc}
                    value={`Oscillator: ${techAnalysis.latestHist.toFixed(2)}`}
                  />
                )}

                {/* 4. Bollinger Bands Diagnostic Card */}
                {bbDiag && (
                  <DiagnosticCard
                    title="볼린저 밴드"
                    label={bbDiag.label}
                    status={bbDiag.status}
                    desc={bbDiag.desc}
                    value={`Upper Band: ${formatMoney(techAnalysis.latestBbUpper)}`}
                  />
                )}
              </Stack>
            </Grid>
          </Grid>
        )}
      </Stack>
    </DashboardContent>
  );
}

// Inline Sub-Component for Diagnostic Card
interface DiagnosticCardProps {
  title: string;
  label: string;
  status: 'Bullish' | 'Bearish' | 'Neutral';
  desc: string;
  value: string;
}

function DiagnosticCard({ title, label, status, desc, value }: DiagnosticCardProps) {
  const theme = useTheme();

  const getStatusColor = () => {
    if (status === 'Bullish') return theme.palette.success.main;
    if (status === 'Bearish') return theme.palette.error.main;
    return theme.palette.warning.main;
  };

  const activeColor = getStatusColor();

  return (
    <Card
      sx={{
        p: 2.5,
        border: `1px solid ${theme.palette.divider}`,
        transition: 'border-color 0.2s',
        '&:hover': {
          borderColor: activeColor,
        },
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 800 }}>
            {title}
          </Typography>
          <Chip
            label={value}
            size="small"
            variant="soft"
            sx={{ fontWeight: 800, fontSize: '0.72rem' }}
          />
        </Stack>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: activeColor, mb: 0.5 }}>
            {label}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.82rem', lineHeight: 1.4 }}>
            {desc}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}
