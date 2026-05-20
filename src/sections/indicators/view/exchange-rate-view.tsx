'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ButtonGroup from '@mui/material/ButtonGroup';
import { alpha, useTheme } from '@mui/material/styles';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlat';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import AttachMoneyRoundedIcon from '@mui/icons-material/AttachMoneyRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import CurrencyExchangeRoundedIcon from '@mui/icons-material/CurrencyExchangeRounded';

import usdData from 'src/db/fx/USD.json';
import usdkrwData from 'src/db/fx/USDKRW.json';
import { DashboardContent } from 'src/layouts/dashboard';

// Safe dynamic import for ApexCharts to avoid SSR window error
const ChartApex = dynamic(() => import('react-apexcharts'), { ssr: false });

// Types
interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
}

export function ExchangeRateView() {
  const theme = useTheme();

  // Exchange calculator states
  const [usdInput, setUsdInput] = useState<string>('1000');
  const [krwInput, setKrwInput] = useState<string>('');
  const [isUsdToKrw, setIsUsdToKrw] = useState<boolean>(true);

  // Selected period state: '3M' | '6M' | '1Y' | 'ALL'
  const [period, setPeriod] = useState<'3M' | '6M' | '1Y' | 'ALL'>('1Y');

  // Toggle state to compare with USD Index
  const [compareWithUsdi, setCompareWithUsdi] = useState<boolean>(true);

  // Load and parse real exchange rate data from USDKRW.json
  const fxData = useMemo(() => {
    const prices = (usdkrwData.prices || []) as PriceDataPoint[];
    const market = usdkrwData.market || {
      price: 1505.68,
      previous_close: 1492.32,
      fifty_two_week_high: 1536.82,
      fifty_two_week_low: 1322.42,
    };
    const info = usdkrwData.info || {
      name: 'US Dollar / Korean Won',
      updated_at: '2026-05-20',
    };

    return {
      prices,
      market,
      info,
    };
  }, []);

  const currentRate = fxData.market.price || 1505.68;
  const prevClose = fxData.market.previous_close || 1492.32;
  const changeValue = currentRate - prevClose;
  const changePercent = (changeValue / prevClose) * 100;
  const isUp = changeValue >= 0;

  // 52-week slider calculation
  const low52 = fxData.market.fifty_two_week_low || 1322.42;
  const high52 = fxData.market.fifty_two_week_high || 1536.82;
  const currentPercentage = Math.min(
    Math.max(((currentRate - low52) / (high52 - low52)) * 100, 0),
    100
  );

  // Filter historical data based on selected period
  const filteredPrices = useMemo(() => {
    const allPrices = [...fxData.prices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (allPrices.length === 0) return [];

    let sliceCount = 365; // Default 1 Year (approximately 250-365 trading sessions)
    if (period === '3M') sliceCount = 90;
    else if (period === '6M') sliceCount = 180;
    else if (period === '1Y') sliceCount = 365;
    else return allPrices;

    return allPrices.slice(-sliceCount);
  }, [fxData.prices, period]);

  // Find min and max points in the filtered USDKRW prices
  const { minPoint, maxPoint } = useMemo(() => {
    if (filteredPrices.length === 0) return { minPoint: null, maxPoint: null };
    let min = filteredPrices[0];
    let max = filteredPrices[0];
    for (let i = 1; i < filteredPrices.length; i++) {
      if (filteredPrices[i].close < min.close) {
        min = filteredPrices[i];
      }
      if (filteredPrices[i].close > max.close) {
        max = filteredPrices[i];
      }
    }
    return { minPoint: min, maxPoint: max };
  }, [filteredPrices]);

  // Filter historical USDI data based on selected period
  const filteredUsdIndexPrices = useMemo(() => {
    const allPrices = [...usdData.prices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (allPrices.length === 0) return [];

    let sliceCount = 365;
    if (period === '3M') sliceCount = 90;
    else if (period === '6M') sliceCount = 180;
    else if (period === '1Y') sliceCount = 365;
    else return allPrices;

    return allPrices.slice(-sliceCount);
  }, [period]);

  // Handle calculator conversion changes
  const handleUsdChange = (val: string) => {
    setUsdInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setKrwInput(Math.round(parsed * currentRate).toString());
    } else {
      setKrwInput('');
    }
  };

  const handleKrwChange = (val: string) => {
    setKrwInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setUsdInput((parsed / currentRate).toFixed(2));
    } else {
      setUsdInput('');
    }
  };

  const toggleDirection = () => {
    setIsUsdToKrw(!isUsdToKrw);
    // Reset values to clear converter
    setUsdInput('1000');
    setKrwInput(Math.round(1000 * currentRate).toString());
  };

  // Sync calculator on load
  useEffect(() => {
    const usd = parseFloat(usdInput);
    if (!isNaN(usd)) {
      setKrwInput(Math.round(usd * currentRate).toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRate]);

  // ApexChart Options and Data Series
  const chartSeries = [
    {
      name: 'USD/KRW 환율',
      type: 'area',
      data: filteredPrices.map((d) => ({
        x: new Date(d.date).getTime(),
        y: d.close,
      })),
    },
    ...(compareWithUsdi
      ? [
          {
            name: '달러 인덱스 (USDI)',
            type: 'line',
            data: filteredUsdIndexPrices.map((d) => ({
              x: new Date(d.date).getTime(),
              y: d.close,
            })),
          },
        ]
      : []),
  ];

  const chartOptions: any = {
    chart: {
      type: 'line',
      height: 400,
      toolbar: { show: true },
      background: 'transparent',
      fontFamily: theme.typography.fontFamily,
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
      },
      zoom: {
        enabled: true,
        autoScaleYaxis: true,
      },
    },
    dataLabels: {
      enabled: false,
    },
    colors: compareWithUsdi
      ? [
          isUp ? theme.palette.error.main : theme.palette.success.main,
          theme.palette.info.main,
        ]
      : [isUp ? theme.palette.error.main : theme.palette.success.main],
    stroke: {
      width: compareWithUsdi ? [3, 2] : [3],
      curve: 'smooth',
    },
    fill: {
      type: compareWithUsdi ? ['gradient', 'solid'] : ['gradient'],
      gradient: {
        shade: theme.palette.mode,
        type: 'vertical',
        shadeIntensity: 0.5,
        gradientToColors: [alpha(isUp ? theme.palette.error.main : theme.palette.success.main, 0.1)],
        inverseColors: false,
        opacityFrom: 0.6,
        opacityTo: 0.1,
        stops: [0, 100],
      },
    },
    grid: {
      borderColor: alpha(theme.palette.grey[500], 0.1),
      strokeDashArray: 5,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    markers: {
      size: 0,
      hover: { size: 6 },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: theme.palette.text.secondary },
        datetimeFormatter: {
          year: 'yyyy년',
          month: 'yy년 MM월',
          day: 'MM월 dd일',
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: compareWithUsdi
      ? [
          {
            title: {
              text: 'USD/KRW 환율 (원)',
              style: { color: theme.palette.text.secondary },
            },
            labels: {
              formatter: (val: number) => `${Math.round(val).toLocaleString()}원`,
              style: { colors: theme.palette.text.secondary },
            },
          },
          {
            opposite: true,
            title: {
              text: '달러 인덱스 (USDI)',
              style: { color: theme.palette.text.secondary },
            },
            labels: {
              formatter: (val: number) => `${val?.toFixed(1)}`,
              style: { colors: theme.palette.text.secondary },
            },
          },
        ]
      : {
          labels: {
            formatter: (val: number) => `${Math.round(val).toLocaleString()}원`,
            style: { colors: theme.palette.text.secondary },
          },
        },
    annotations: {
      points: [
        ...(maxPoint
          ? [
              {
                x: new Date(maxPoint.date).getTime(),
                y: maxPoint.close,
                marker: {
                  size: 6,
                  fillColor: theme.palette.error.main,
                  strokeColor: theme.palette.background.paper,
                  strokeWidth: 2,
                  shape: 'circle',
                },
                label: {
                  borderColor: theme.palette.error.main,
                  borderWidth: 1,
                  borderRadius: 4,
                  textAnchor: 'middle',
                  offsetY: -15,
                  style: {
                    color: '#fff',
                    background: theme.palette.error.main,
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: {
                      left: 6,
                      right: 6,
                      top: 4,
                      bottom: 4,
                    },
                  },
                  text: `최고가: ${maxPoint.close.toLocaleString('ko-KR')}원`,
                },
              },
            ]
          : []),
        ...(minPoint
          ? [
              {
                x: new Date(minPoint.date).getTime(),
                y: minPoint.close,
                marker: {
                  size: 6,
                  fillColor: theme.palette.success.main,
                  strokeColor: theme.palette.background.paper,
                  strokeWidth: 2,
                  shape: 'circle',
                },
                label: {
                  borderColor: theme.palette.success.main,
                  borderWidth: 1,
                  borderRadius: 4,
                  textAnchor: 'middle',
                  offsetY: 15,
                  style: {
                    color: '#fff',
                    background: theme.palette.success.main,
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: {
                      left: 6,
                      right: 6,
                      top: 4,
                      bottom: 4,
                    },
                  },
                  text: `최저가: ${minPoint.close.toLocaleString('ko-KR')}원`,
                },
              },
            ]
          : []),
      ],
    },
    tooltip: {
      x: { format: 'yyyy년 MM월 dd일' },
      y: [
        {
          formatter: (val: number) => `<b>${val.toFixed(2)} 원</b>`,
        },
        ...(compareWithUsdi
          ? [
              {
                formatter: (val: number) => `<b>${val.toFixed(2)} pt</b>`,
              },
            ]
          : []),
      ],
      theme: theme.palette.mode,
    },
    theme: {
      mode: theme.palette.mode,
    },
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        {/* Header Section */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            실시간 환율 조회 및 분석 💱
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            USD/KRW 실시간 시장 환율 흐름을 조회하고, 환율 상승/하락에 따른 자산 시뮬레이션 및 경제적 파급 효과를 분석합니다.
          </Typography>
        </Box>

        {/* Dashboard Metrics Grid */}
        <Grid container spacing={3}>
          {/* Card 1: Current Rate */}
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                },
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                  현재 환율 (USD / KRW)
                </Typography>

                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    {currentRate.toLocaleString('ko-KR', { minimumFractionDigits: 2 })} 원
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: isUp ? 'error.main' : 'success.main',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {isUp ? (
                      <TrendingUpRoundedIcon sx={{ fontSize: 16, mr: 0.2 }} />
                    ) : (
                      <TrendingDownRoundedIcon sx={{ fontSize: 16, mr: 0.2 }} />
                    )}
                    {changeValue >= 0 ? '+' : ''}
                    {changeValue.toFixed(2)} 원 ({changePercent.toFixed(2)}%)
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={0.5} alignItems="center">
                  <CalendarTodayRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    기준일: {new Date(usdkrwData.updated_at).toLocaleDateString('ko-KR')}
                  </Typography>
                </Stack>
              </Stack>
            </Card>
          </Grid>

          {/* Card 2: 52-Week Range */}
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                  52주 가격 범위 (52-Week Range)
                </Typography>

                <Stack direction="row" justifyContent="space-between" sx={{ mb: -0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    최저 {low52.toLocaleString('ko-KR')}원
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    최고 {high52.toLocaleString('ko-KR')}원
                  </Typography>
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={currentPercentage}
                  color={currentPercentage > 75 ? 'error' : currentPercentage < 25 ? 'success' : 'info'}
                  sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.grey[500], 0.12) }}
                />

                <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                  현재 환율은 52주 고점 대비 <b>{(100 - currentPercentage).toFixed(1)}%</b> 아래에 있습니다.
                </Typography>
              </Stack>
            </Card>
          </Grid>

          {/* Card 3: Yesterday Close Info */}
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                  이전 거래일 종가 (Previous Close)
                </Typography>

                <Typography variant="h4" sx={{ fontWeight: 900, color: 'text.secondary' }}>
                  {prevClose.toLocaleString('ko-KR', { minimumFractionDigits: 2 })} 원
                </Typography>

                <Stack direction="row" spacing={0.8} alignItems="center">
                  <TrendingFlatRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    변동폭: {(high52 - low52).toFixed(1)}원 (연간 진폭)
                  </Typography>
                </Stack>
              </Stack>
            </Card>
          </Grid>

          {/* Card 4: Volatility Status */}
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                  환율 변동성 리스크 등급
                </Typography>

                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label="유의 (Moderate)"
                    color="warning"
                    sx={{ fontWeight: 800, borderRadius: 1 }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.warning.main }}>
                    주의 단계 유지 ⚠️
                  </Typography>
                </Stack>

                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  미 연준 금리 스탠스 및 국내 경상수지 변화에 힘입어 변동성이 확대 중입니다.
                </Typography>
              </Stack>
            </Card>
          </Grid>
        </Grid>

        {/* Chart & Calculator Side-by-Side */}
        <Grid container spacing={4}>
          {/* Exchange Rate Chart (Left) */}
          <Grid item xs={12} lg={8}>
            <Card
              sx={{
                p: 3,
                height: '100%',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Stack spacing={0.5}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    USD/KRW 환율 차트 추이
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    실제 시장 종가 데이터를 기반으로 시각화한 선형 흐름입니다.
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={2} alignItems="center">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={compareWithUsdi}
                        onChange={(e) => setCompareWithUsdi(e.target.checked)}
                        color="info"
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        달러 인덱스(DXY) 비교
                      </Typography>
                    }
                    sx={{ mr: 1 }}
                  />

                  <ButtonGroup size="small" color="secondary" variant="outlined">
                    {(['3M', '6M', '1Y', 'ALL'] as const).map((p) => (
                      <Button
                        key={p}
                        onClick={() => setPeriod(p)}
                        variant={period === p ? 'contained' : 'outlined'}
                        sx={{ fontWeight: 700 }}
                      >
                        {p}
                      </Button>
                    ))}
                  </ButtonGroup>
                </Stack>
              </Stack>

              <Box sx={{ height: 350 }}>
                {filteredPrices.length > 0 ? (
                  <ChartApex
                    options={chartOptions}
                    series={chartSeries}
                    type="area"
                    height="100%"
                  />
                ) : (
                  <Stack height="100%" alignItems="center" justifyContent="center">
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      데이터를 불러올 수 없습니다.
                    </Typography>
                  </Stack>
                )}
              </Box>
            </Card>
          </Grid>

          {/* Interactive Calculator (Right) */}
          <Grid item xs={12} lg={4}>
            <Card
              sx={{
                p: 3,
                height: '100%',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Stack spacing={2.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalculateRoundedIcon color="primary" />
                    실시간 환전 계산기
                  </Typography>
                  <Tooltip title="현재 환율을 적용하여 실시간으로 통화 가치를 계산합니다.">
                    <IconButton size="small">
                      <InfoRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                {/* Input Fields */}
                <Stack spacing={2} sx={{ position: 'relative' }}>
                  {isUsdToKrw ? (
                    <>
                      <TextField
                        label="보내는 금액 (USD)"
                        variant="outlined"
                        fullWidth
                        value={usdInput}
                        onChange={(e) => handleUsdChange(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <AttachMoneyRoundedIcon />
                            </InputAdornment>
                          ),
                          endAdornment: <InputAdornment position="end">USD</InputAdornment>,
                        }}
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'center', my: -1 }}>
                        <IconButton
                          color="primary"
                          onClick={toggleDirection}
                          sx={{
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: 'background.paper',
                            boxShadow: theme.customShadows?.z1,
                            zIndex: 2,
                          }}
                        >
                          <SwapHorizRoundedIcon />
                        </IconButton>
                      </Box>
                      <TextField
                        label="받는 금액 (KRW)"
                        variant="outlined"
                        fullWidth
                        value={krwInput}
                        onChange={(e) => handleKrwChange(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <CurrencyExchangeRoundedIcon />
                            </InputAdornment>
                          ),
                          endAdornment: <InputAdornment position="end">원 (KRW)</InputAdornment>,
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <TextField
                        label="보내는 금액 (KRW)"
                        variant="outlined"
                        fullWidth
                        value={krwInput}
                        onChange={(e) => handleKrwChange(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <CurrencyExchangeRoundedIcon />
                            </InputAdornment>
                          ),
                          endAdornment: <InputAdornment position="end">원 (KRW)</InputAdornment>,
                        }}
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'center', my: -1 }}>
                        <IconButton
                          color="primary"
                          onClick={toggleDirection}
                          sx={{
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: 'background.paper',
                            boxShadow: theme.customShadows?.z1,
                            zIndex: 2,
                          }}
                        >
                          <SwapHorizRoundedIcon />
                        </IconButton>
                      </Box>
                      <TextField
                        label="받는 금액 (USD)"
                        variant="outlined"
                        fullWidth
                        value={usdInput}
                        onChange={(e) => handleUsdChange(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <AttachMoneyRoundedIcon />
                            </InputAdornment>
                          ),
                          endAdornment: <InputAdornment position="end">USD</InputAdornment>,
                        }}
                      />
                    </>
                  )}
                </Stack>

                <Divider sx={{ my: 1 }} />

                {/* Quick conversion list */}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                    주요 단위 환산표
                  </Typography>
                  <Grid container spacing={1}>
                    {[100, 500, 1000, 5000].map((amount) => (
                      <Grid item xs={6} key={amount}>
                        <Box
                          sx={{
                            p: 1.2,
                            borderRadius: 1,
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: alpha(theme.palette.primary.main, 0.02),
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            ${amount.toLocaleString()} ➡️ {Math.round(amount * currentRate).toLocaleString()}원
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Stack>

              <Box sx={{ mt: 3 }}>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', textAlign: 'center' }}>
                  * 위 계산은 시뮬레이션이며 실시간 은행 수수료가 적용되지 않았습니다.
                </Typography>
              </Box>
            </Card>
          </Grid>
        </Grid>

        {/* Economic Impact Analysis (Bottom Row) */}
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 3 }}>
            환율(USD/KRW) 변화에 따른 경제 및 시장 파급 효과 💡
          </Typography>

          <Grid container spacing={3}>
            {/* Impact 1 */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 3,
                  height: '100%',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 24px -4px ${alpha(theme.palette.common.black, 0.06)}`,
                    borderColor: theme.palette.error.main,
                  },
                }}
              >
                <Stack spacing={2}>
                  <Chip
                    label="수출 대기업 수혜 🚢"
                    color="error"
                    size="small"
                    sx={{ fontWeight: 800, alignSelf: 'flex-start' }}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    영업이익 증대 효과
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    원/달러 환율이 상승하면 달러로 제품을 판매하는 수출 기업(삼성전자, 현대차, 조선업 등)의 한화 환산 매출 및 영업이익률이 개선됩니다.
                  </Typography>
                </Stack>
              </Card>
            </Grid>

            {/* Impact 2 */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 3,
                  height: '100%',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 24px -4px ${alpha(theme.palette.common.black, 0.06)}`,
                    borderColor: theme.palette.warning.main,
                  },
                }}
              >
                <Stack spacing={2}>
                  <Chip
                    label="내수·수입 산업 약세 🛢️"
                    color="warning"
                    size="small"
                    sx={{ fontWeight: 800, alignSelf: 'flex-start' }}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    원가 부담 극대화
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    석유화학, 철강, 정유, 항공 등 원자재 및 에너지 수입량이 많은 내수 기반 업종은 환율 상승 시 원가 부담이 급증하여 마진이 크게 축소됩니다.
                  </Typography>
                </Stack>
              </Card>
            </Grid>

            {/* Impact 3 */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 3,
                  height: '100%',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 24px -4px ${alpha(theme.palette.common.black, 0.06)}`,
                    borderColor: theme.palette.info.main,
                  },
                }}
              >
                <Stack spacing={2}>
                  <Chip
                    label="외국인 자본 이탈 🏛️"
                    color="info"
                    size="small"
                    sx={{ fontWeight: 800, alignSelf: 'flex-start' }}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    주식 시장 수급 악화
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    급격한 원화 가치 하락(환율 상승) 시 외국인 투자자는 국내 주식 시장(코스피/코스닥)에서 환차손을 피하기 위해 자금을 회수하고 순매도를 이어갈 가능성이 높습니다.
                  </Typography>
                </Stack>
              </Card>
            </Grid>

            {/* Impact 4 */}
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{
                  p: 3,
                  height: '100%',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 24px -4px ${alpha(theme.palette.common.black, 0.06)}`,
                    borderColor: theme.palette.success.main,
                  },
                }}
              >
                <Stack spacing={2}>
                  <Chip
                    label="수입 물가 자극 🛒"
                    color="success"
                    size="small"
                    sx={{ fontWeight: 800, alignSelf: 'flex-start' }}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    인플레이션 장기화 우려
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    고환율 기조는 원자재와 소비재 수입 가격을 자극하여 국내 물가 지수(CPI) 상승 압력을 늘리고, 이는 한국은행의 기준금리 인하 시점을 뒤로 미루는 요인이 됩니다.
                  </Typography>
                </Stack>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Stack>
    </DashboardContent>
  );
}
