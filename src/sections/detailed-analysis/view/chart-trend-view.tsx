'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import ChartApex from 'react-apexcharts';
import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Paper from '@mui/material/Paper';
import Dialog from '@mui/material/Dialog';
import Slider from '@mui/material/Slider';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import ToggleButton from '@mui/material/ToggleButton';
import Autocomplete from '@mui/material/Autocomplete';
import { alpha, useTheme } from '@mui/material/styles';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { paths } from 'src/routes/paths';
import { DashboardContent } from 'src/layouts/dashboard';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

// ----------------------------------------------------------------------

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

export function ChartTrendView() {
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
  const tickerOptions = useMemo(() => {
    const isKr = market === 'KR';
    const filtered = allTickersList.filter((t) => isKr ? t.includes('.') : !t.includes('.'));
    return filtered.map((ticker) => ({
      ticker,
      name: isKr
        ? (allTickersData[ticker]?.info?.kr_name || allTickersData[ticker]?.info?.name || '')
        : (allTickersData[ticker]?.info?.name || ''),
    }));
  }, [market]);

  // Ensure default ticker switches when market changes
  useMemo(() => {
    if (market === 'US' && selectedTicker.includes('.')) setSelectedTicker('AAPL');
    if (market === 'KR' && !selectedTicker.includes('.')) setSelectedTicker('005930.KS');
  }, [market, selectedTicker]);

  const selectedTickerData = useMemo(() => allTickersData[selectedTicker], [selectedTicker]);

  // Backtest engine calculations
  const backtestResult = useMemo(() => {
    if (!selectedTickerData) return null;

    const allPrices = selectedTickerData.prices || [];
    if (allPrices.length === 0) return null;

    // 1. Determine simulation slice based on period
    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
    let simSlice: typeof allPrices = [];

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
    const trades: any[] = [];
    
    const equityHistory: { x: number; y: number }[] = [];
    const bhEquityHistory: { x: number; y: number }[] = [];
    const projectedLines: { x: number; upper: number; lower: number; mid: number }[] = [];

    const firstPrice = allPrices[startIndex][priceBasis] || allPrices[startIndex].close;
    const bhShares = START_CAPITAL / firstPrice;
    let lastBuyPrice = 0;

    for (let i = startIndex; i <= endIndex; i++) {
      const currentPrice = allPrices[i][priceBasis] || allPrices[i].close;
      const timestamp = new Date(allPrices[i].date).getTime();
      
      const histStart = Math.max(0, i - lookbackDays);
      const histSlice = allPrices.slice(histStart, i);
      
      let projectedUpper = 0, projectedLower = 0, projectedMid = 0;
      
      if (histSlice.length >= 2) {
        const histPrices = histSlice.map(p => p[priceBasis] || p.close);
        const n = histPrices.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
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
        mid: Number(projectedMid.toFixed(2))
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
          const profitPct = lastBuyPrice > 0 ? ((currentPrice - lastBuyPrice) / lastBuyPrice) * 100 : 0;
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
              const profitPct = lastBuyPrice > 0 ? ((currentPrice - lastBuyPrice) / lastBuyPrice) * 100 : 0;
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
  }, [selectedTickerData, priceBasis, lookbackDays, stdDevMultiplier, sellRatio, buyMethod, buyAmount, buyShares, stopLossMargin, period, startDate, endDate]);

  const formatMoney = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
            y: p[priceBasis] || p.close,
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

  const chartOptions = useMemo<any>(() => ({
    chart: {
      toolbar: { show: true },
      zoom: { enabled: true },
      background: 'transparent',
      fontFamily: theme.typography.fontFamily,
    },
    colors: currentTab === 'price' 
      ? [theme.palette.primary.main, theme.palette.error.main, theme.palette.success.main]
      : [theme.palette.primary.main, theme.palette.text.disabled],
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: theme.palette.text.secondary } },
    },
    yaxis: {
      title: {
        text: currentTab === 'price' ? '주가' : '자산 가치 ($)',
        style: { color: theme.palette.text.secondary, fontWeight: 600 },
      },
      labels: {
        style: { colors: theme.palette.text.secondary },
        formatter: (value: number) => currentTab === 'price' ? value.toFixed(2) : `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      },
    },
    stroke: { curve: 'smooth', width: currentTab === 'price' ? [2.5, 1.5, 1.5] : [2.5, 2.5], dashArray: currentTab === 'price' ? [0, 4, 4] : [0, 0] },
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      labels: { colors: theme.palette.text.secondary },
    },
    tooltip: {
      theme: theme.palette.mode,
      x: { format: 'yyyy-MM-dd' },
      y: {
        formatter: (value: number) => currentTab === 'price' ? value.toFixed(2) : formatMoney(value),
      },
    },
    grid: {
      borderColor: alpha(theme.palette.grey[500], 0.1),
      strokeDashArray: 3,
    },
  }), [theme, currentTab]);

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
              차트 추세 채널 분석 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              과거 가격을 바탕으로 동적 회귀 채널을 긋고, 상/하단 터치에 따른 매매 성과를 시뮬레이션합니다.
            </Typography>
          </Box>

          <MarketPeriodSelector
            market={market}
            period={period}
            startDate={startDate}
            endDate={endDate}
            onMarketChange={setMarket}
            onPeriodChange={setPeriod}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </Stack>

        <Grid container spacing={3}>
          {/* Controls Sidebar */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
              <Stack spacing={3.5}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    전략 파라미터
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    회귀 채널 기간, 상/하단선 매매 조건을 설정합니다.
                  </Typography>
                </Stack>

                <Autocomplete
                  fullWidth
                  options={tickerOptions}
                  getOptionLabel={(option) => `${option.name} (${option.ticker})`}
                  value={tickerOptions.find((opt) => opt.ticker === selectedTicker) || null}
                  onChange={(e, v) => {
                    if (v) setSelectedTicker(v.ticker);
                  }}
                  inputValue={inputValue}
                  onInputChange={(e, v) => setInputValue(v)}
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
                      label="종목 검색 및 설정"
                      placeholder="티커 또는 회사명 검색..."
                    />
                  )}
                />

                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>과거 회귀 기간 (일)</span>
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
                      최근 {lookbackDays}일
                    </Typography>
                  </Typography>
                  <Slider
                    min={20}
                    max={500}
                    step={10}
                    value={lookbackDays}
                    onChange={(e, val) => setLookbackDays(val as number)}
                    valueLabelDisplay="auto"
                  />
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>채널 폭 (표준편차 배수)</span>
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
                      ±{stdDevMultiplier.toFixed(1)}σ
                    </Typography>
                  </Typography>
                  <Slider
                    min={0.5}
                    max={4.0}
                    step={0.1}
                    value={stdDevMultiplier}
                    onChange={(e, val) => setStdDevMultiplier(val as number)}
                    valueLabelDisplay="auto"
                  />
                </Stack>

                <Stack spacing={2}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    하단 터치 시 매수 옵션
                  </Typography>
                  <ToggleButtonGroup
                    fullWidth
                    size="small"
                    value={buyMethod}
                    exclusive
                    onChange={(e, val) => {
                      if (val !== null) setBuyMethod(val);
                    }}
                    color="primary"
                  >
                    <ToggleButton value="allIn" sx={{ fontWeight: 700 }}>전액 매수</ToggleButton>
                    <ToggleButton value="amount" sx={{ fontWeight: 700 }}>고정 금액</ToggleButton>
                    <ToggleButton value="shares" sx={{ fontWeight: 700 }}>고정 주식수</ToggleButton>
                  </ToggleButtonGroup>

                  {buyMethod === 'amount' && (
                    <TextField
                      fullWidth
                      size="small"
                      label="회당 추가 매수 금액 ($/₩)"
                      type="number"
                      value={buyAmount}
                      onChange={(e) => setBuyAmount(Math.max(1, Number(e.target.value)))}
                    />
                  )}

                  {buyMethod === 'shares' && (
                    <TextField
                      fullWidth
                      size="small"
                      label="회당 추가 매수 수량 (주)"
                      type="number"
                      value={buyShares}
                      onChange={(e) => setBuyShares(Math.max(1, Number(e.target.value)))}
                    />
                  )}
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>상단 터치 시 매도 비율</span>
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
                      보유량의 {sellRatio}% 매도
                    </Typography>
                  </Typography>
                  <Slider
                    min={10}
                    max={100}
                    step={10}
                    value={sellRatio}
                    onChange={(e, val) => setSellRatio(val as number)}
                    valueLabelDisplay="auto"
                  />
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>전량 손절매 마진 (하단 이탈률)</span>
                    <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 800 }}>
                      하단선 대비 -{stopLossMargin.toFixed(1)}% 이탈
                    </Typography>
                  </Typography>
                  <Slider
                    min={0}
                    max={15}
                    step={0.5}
                    value={stopLossMargin}
                    onChange={(e, val) => setStopLossMargin(val as number)}
                    valueLabelDisplay="auto"
                  />
                </Stack>
              </Stack>
            </Card>
          </Grid>

          {/* Overview Stats */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Grid container spacing={3}>
              {backtestResult && (
                <>
                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        최종 자산 평가액
                      </Typography>
                      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
                        {formatMoney(backtestResult.finalValue)}
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        채널 매매 수익률
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          mt: 1,
                          fontWeight: 800,
                          color: backtestResult.strategyReturn >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {backtestResult.strategyReturn >= 0 ? '+' : ''}
                        {backtestResult.strategyReturn.toFixed(2)}%
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        단순 보유 수익률
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          mt: 1,
                          fontWeight: 800,
                          color: backtestResult.bhReturn >= 0 ? 'text.primary' : 'error.main',
                        }}
                      >
                        {backtestResult.bhReturn >= 0 ? '+' : ''}
                        {backtestResult.bhReturn.toFixed(2)}%
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        초과 수익 및 거래 수
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          mt: 1,
                          fontWeight: 800,
                          color: backtestResult.outperformance >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {backtestResult.outperformance >= 0 ? '+' : ''}
                        {backtestResult.outperformance.toFixed(1)}% / {backtestResult.totalTrades}회
                      </Typography>
                    </Card>
                  </Grid>
                </>
              )}
            </Grid>

            {/* Chart Card */}
            <Card sx={{ mt: 3, boxShadow: theme.customShadows?.card }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {currentTab === 'price' ? '추세 채널과 주가 흐름' : '전략 평가 자산 곡선 비교'}
                </Typography>

                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant={currentTab === 'price' ? 'contained' : 'outlined'}
                    onClick={() => setCurrentTab('price')}
                  >
                    가격 & 채널
                  </Button>
                  <Button
                    size="small"
                    variant={currentTab === 'equity' ? 'contained' : 'outlined'}
                    onClick={() => setCurrentTab('equity')}
                  >
                    자산 곡선
                  </Button>
                </Stack>
              </Stack>

              <Box sx={{ p: 3, height: 450 }}>
                {backtestResult ? (
                  <ChartApex
                    options={chartOptions}
                    series={chartSeries}
                    type="line"
                    height="100%"
                  />
                ) : (
                  <Box sx={{ height: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ color: 'text.disabled' }}>데이터 로딩 실패 또는 데이터가 없습니다.</Typography>
                  </Box>
                )}
              </Box>
            </Card>
          </Grid>
        </Grid>

        {/* Trade Journal Table */}
        {backtestResult && backtestResult.trades.length > 0 && (
          <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              📋 추세선 매매 실적 저널 (Trading Journal)
            </Typography>
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                    <TableCell sx={{ fontWeight: 700 }}>날짜</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래 포지션</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>체결 가격</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래 수량</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래 후 자산 가치</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래 손익 (%)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {backtestResult.trades.map((t, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>
                        <Chip
                          label={t.action === 'BUY' ? '추가 매수 (BUY)' : (t.action === 'STOP_LOSS' ? '전량 손절 (OUT)' : '부분 매도 (SELL)')}
                          color={t.action === 'BUY' ? 'success' : (t.action === 'STOP_LOSS' ? 'error' : 'warning')}
                          size="small"
                          variant="soft"
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell>{market === 'KR' ? '₩' : '$'}{t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell>{t.sharesTraded} 주</TableCell>
                      <TableCell>{formatMoney(t.value)}</TableCell>
                      <TableCell>
                        {t.profitPct !== undefined ? (
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: t.profitPct >= 0 ? 'success.main' : 'error.main',
                            }}
                          >
                            {t.profitPct >= 0 ? '+' : ''}
                            {t.profitPct.toFixed(2)}%
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                            -
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Stack>
    </DashboardContent>
  );
}
