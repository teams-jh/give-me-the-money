'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import ChartApex from 'react-apexcharts';
import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { alpha, useTheme } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';
import { allTickersData, tickers as allTickersList } from 'src/library/tickers';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

// ----------------------------------------------------------------------

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatValue = (num: number | null | undefined, unit: string, currency?: string) => {
  if (num === null || num === undefined) return 'N/A';
  if (unit === 'currency') {
    const formatted = num.toLocaleString();
    if (currency === 'USD') return `$${formatted}`;
    return `${formatted} 원`;
  }
  if (unit === 'percent') {
    return `${num.toFixed(2)}%`;
  }
  return num.toLocaleString();
};

export function DivergenceAnalysisView() {
  const theme = useTheme();

  const [market, setMarket] = useState<'US' | 'KR'>('KR');
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('1y');

  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const [startDate, setStartDate] = useState<string>(getLocalDateString(oneMonthAgo));
  const [endDate, setEndDate] = useState<string>(getLocalDateString(today));

  // Tickers selection state
  const [tickerA, setTickerA] = useState<string>('005930.KS'); // Samsung Electronics
  const [tickerB, setTickerB] = useState<string>('005935.KS'); // Samsung Electronics Pref

  const [inputValA, setInputValA] = useState('');
  const [inputValB, setInputValB] = useState('');

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleMarketChange = (newMarket: 'US' | 'KR') => {
    setMarket(newMarket);
    if (newMarket === 'US') {
      setTickerA('GOOGL');
      setTickerB('GOOG');
    } else {
      setTickerA('005930.KS');
      setTickerB('005935.KS');
    }
    setInputValA('');
    setInputValB('');
  };

  const tickerOptions = useMemo(() => {
    const filteredList = allTickersList.filter((ticker) => {
      if (market === 'US') {
        return !ticker.includes('.');
      }
      return ticker.includes('.');
    });

    return filteredList.map((ticker) => ({
      ticker,
      name: allTickersData[ticker]?.info?.kr_name || allTickersData[ticker]?.info?.name || ticker,
    }));
  }, [market]);

  const selectedOptA = useMemo(
    () => tickerOptions.find((o) => o.ticker === tickerA) || { ticker: tickerA, name: tickerA },
    [tickerA, tickerOptions]
  );

  const selectedOptB = useMemo(
    () => tickerOptions.find((o) => o.ticker === tickerB) || { ticker: tickerB, name: tickerB },
    [tickerB, tickerOptions]
  );

  // Align dates and compute divergence: (Price A - Price B) / Price B * 100
  const alignedData = useMemo(() => {
    const dataA = allTickersData[tickerA];
    const dataB = allTickersData[tickerB];
    if (!dataA || !dataB || !dataA.prices || !dataB.prices) return [];

    const mapB = new Map<string, number>(dataB.prices.map((p) => [p.date, p.close]));

    const aligned = dataA.prices
      .filter((p) => mapB.has(p.date))
      .map((p) => {
        const priceA: number = p.close;
        const priceB: number = mapB.get(p.date) ?? 0;
        const divergence = priceB !== 0 ? ((priceA - priceB) / priceB) * 100 : 0;
        return {
          date: p.date,
          priceA,
          priceB,
          divergence,
        };
      });

    const daysMap: Record<string, number> = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
    if (period === 'custom' && startDate && endDate) {
      return aligned.filter((p) => p.date >= startDate && p.date <= endDate);
    } else {
      const days = daysMap[period === 'custom' ? '1y' : period];
      return aligned.slice(-days);
    }
  }, [tickerA, tickerB, period, startDate, endDate]);

  // Statistics calculation
  const stats = useMemo(() => {
    if (alignedData.length === 0) {
      return {
        latest: null,
        average: null,
        max: null,
        maxDate: null,
        min: null,
        minDate: null,
        stdDev: null,
      };
    }

    const divergences = alignedData.map((d) => d.divergence);
    const latest = divergences[divergences.length - 1];

    let sum = 0;
    let max = divergences[0];
    let maxDate = alignedData[0].date;
    let min = divergences[0];
    let minDate = alignedData[0].date;

    for (let i = 0; i < alignedData.length; i++) {
      const d = alignedData[i].divergence;
      sum += d;
      if (d > max) {
        max = d;
        maxDate = alignedData[i].date;
      }
      if (d < min) {
        min = d;
        minDate = alignedData[i].date;
      }
    }

    const average = sum / alignedData.length;

    let varianceSum = 0;
    for (let i = 0; i < divergences.length; i++) {
      varianceSum += Math.pow(divergences[i] - average, 2);
    }
    const stdDev = Math.sqrt(varianceSum / alignedData.length);

    return {
      latest,
      average,
      max,
      maxDate,
      min,
      minDate,
      stdDev,
    };
  }, [alignedData]);

  // Chart configuration for stock prices comparison
  const priceChartSeries = useMemo(() => {
    if (alignedData.length === 0) return [];
    const nameA =
      allTickersData[tickerA]?.info?.kr_name || allTickersData[tickerA]?.info?.name || tickerA;
    const nameB =
      allTickersData[tickerB]?.info?.kr_name || allTickersData[tickerB]?.info?.name || tickerB;

    return [
      {
        name: nameA,
        data: alignedData.map((d) => ({
          x: new Date(d.date).getTime(),
          y: d.priceA,
        })),
      },
      {
        name: nameB,
        data: alignedData.map((d) => ({
          x: new Date(d.date).getTime(),
          y: d.priceB,
        })),
      },
    ];
  }, [alignedData, tickerA, tickerB]);

  const priceChartOptions = useMemo<any>(
    () => ({
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
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) => value.toLocaleString(),
        },
      },
      stroke: { curve: 'smooth', width: 2 },
      colors: [theme.palette.primary.main, theme.palette.info.main],
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
        y: {
          formatter: (value: number) => value.toLocaleString(),
        },
      },
      grid: {
        borderColor: alpha(theme.palette.grey[500], 0.1),
        strokeDashArray: 3,
      },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        labels: { colors: theme.palette.text.primary },
      },
    }),
    [theme]
  );

  // Chart configuration for divergence rate
  const divergenceChartSeries = useMemo(() => {
    if (alignedData.length === 0) return [];
    return [
      {
        name: '괴리율 (Divergence Rate)',
        data: alignedData.map((d) => ({
          x: new Date(d.date).getTime(),
          y: parseFloat(d.divergence.toFixed(2)),
        })),
      },
    ];
  }, [alignedData]);

  const divergenceChartOptions = useMemo<any>(
    () => ({
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
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) => `${value.toFixed(2)}%`,
        },
      },
      stroke: { curve: 'smooth', width: 2 },
      colors: [theme.palette.warning.main],
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
        y: {
          formatter: (value: number) => `${value.toFixed(2)}%`,
        },
      },
      annotations: {
        yaxis: [
          {
            y: 0,
            borderColor: theme.palette.text.disabled,
            strokeDashArray: 4,
            label: {
              borderColor: theme.palette.text.disabled,
              style: {
                color: theme.palette.text.primary,
                background: alpha(theme.palette.background.paper, 0.8),
              },
              text: '0% 기준선',
            },
          },
        ],
      },
      grid: {
        borderColor: alpha(theme.palette.grey[500], 0.1),
        strokeDashArray: 3,
      },
      legend: {
        show: false,
      },
    }),
    [theme]
  );

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
          sx={{ pb: 1 }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              괴리율 분석 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              두 종목을 선택하여 괴리율 추이와 각종 통계 지표를 확인해 보세요.
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

        <Card sx={{ p: 3, boxShadow: (theme.customShadows as any)?.card }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                fullWidth
                options={tickerOptions}
                getOptionLabel={(option) => `${option.name} (${option.ticker})`}
                value={selectedOptA}
                onChange={(e, v) => {
                  if (v) setTickerA(v.ticker);
                }}
                inputValue={inputValA}
                onInputChange={(e, v) => setInputValA(v)}
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
                    label="종목 A (비교 종목)"
                    placeholder="티커 또는 회사명 검색..."
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                fullWidth
                options={tickerOptions}
                getOptionLabel={(option) => `${option.name} (${option.ticker})`}
                value={selectedOptB}
                onChange={(e, v) => {
                  if (v) setTickerB(v.ticker);
                }}
                inputValue={inputValB}
                onInputChange={(e, v) => setInputValB(v)}
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
                    label="종목 B (기준 종목 - 분모)"
                    placeholder="티커 또는 회사명 검색..."
                  />
                )}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ fontWeight: 600 }}>
              📈 계산 공식: <strong>괴리율 = (A - B) / B × 100%</strong>
            </Alert>
          </Box>
        </Card>

        {alignedData.length === 0 ? (
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: 'text.secondary' }}>
              선택한 두 종목의 일치하는 날짜별 가격 데이터가 없거나 불러오지 못했습니다.
            </Typography>
          </Card>
        ) : (
          <>
            {/* Statistics Cards Grid */}
            <Box
              display="grid"
              gridTemplateColumns={{
                xs: 'repeat(1, minmax(0, 1fr))',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
                lg: 'repeat(5, minmax(0, 1fr))',
              }}
              gap={3}
            >
              <Card
                sx={{ p: 2.5, boxShadow: (theme.customShadows as any)?.card, textAlign: 'center' }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  최근 괴리율
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: 'primary.main' }}>
                  {formatValue(stats.latest, 'percent')}
                </Typography>
              </Card>

              <Card
                sx={{ p: 2.5, boxShadow: (theme.customShadows as any)?.card, textAlign: 'center' }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  평균 괴리율
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: 'info.main' }}>
                  {formatValue(stats.average, 'percent')}
                </Typography>
              </Card>

              <Card
                sx={{ p: 2.5, boxShadow: (theme.customShadows as any)?.card, textAlign: 'center' }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  최대 괴리율
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: 'success.main' }}>
                  {formatValue(stats.max, 'percent')}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}
                >
                  {stats.maxDate}
                </Typography>
              </Card>

              <Card
                sx={{ p: 2.5, boxShadow: (theme.customShadows as any)?.card, textAlign: 'center' }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  최소 괴리율
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: 'error.main' }}>
                  {formatValue(stats.min, 'percent')}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}
                >
                  {stats.minDate}
                </Typography>
              </Card>

              <Card
                sx={{ p: 2.5, boxShadow: (theme.customShadows as any)?.card, textAlign: 'center' }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  표준편차 (변동성)
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: 'warning.main' }}>
                  {formatValue(stats.stdDev, 'percent')}
                </Typography>
              </Card>
            </Box>

            <Grid container spacing={3}>
              {/* Chart 1: Stock Prices */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ p: 3, boxShadow: (theme.customShadows as any)?.card }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                    📉 주가 추이 비교
                  </Typography>
                  <Box sx={{ height: 350 }}>
                    {isMounted && (
                      <ChartApex
                        options={priceChartOptions}
                        series={priceChartSeries}
                        type="line"
                        height="100%"
                      />
                    )}
                  </Box>
                </Card>
              </Grid>

              {/* Chart 2: Divergence Rate */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ p: 3, boxShadow: (theme.customShadows as any)?.card }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                    📊 괴리율 추이 (%)
                  </Typography>
                  <Box sx={{ height: 350 }}>
                    {isMounted && (
                      <ChartApex
                        options={divergenceChartOptions}
                        series={divergenceChartSeries}
                        type="line"
                        height="100%"
                      />
                    )}
                  </Box>
                </Card>
              </Grid>
            </Grid>
          </>
        )}
      </Stack>
    </DashboardContent>
  );
}
