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
import DialogActions from '@mui/material/DialogActions';
import TableContainer from '@mui/material/TableContainer';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';

// ----------------------------------------------------------------------

const PRICE_TYPE_LABELS = {
  open: '시가',
  high: '고가',
  low: '저가',
  close: '종가',
};

interface KrTrendViewProps {
  period: PeriodKey | 'custom';
  startDate?: string;
  endDate?: string;
}

export function KrTrendView({ period, startDate, endDate }: KrTrendViewProps) {
  const theme = useTheme() as any;

  // State
  const [selectedTicker, setSelectedTicker] = useState<string>('005930.KS');
  const [inputValue, setInputValue] = useState('');
  const [priceBasis, setPriceBasis] = useState<'open' | 'high' | 'low' | 'close'>('close');
  const [buyThreshold, setBuyThreshold] = useState<number>(2.0); // a%
  const [sellThreshold, setSellThreshold] = useState<number>(2.0); // b%
  const [sellRatio, setSellRatio] = useState<number>(100); // c%
  const [buyMethod, setBuyMethod] = useState<'allIn' | 'amount' | 'shares'>('allIn');
  const [buyAmount, setBuyAmount] = useState<number>(10000); // 1만원 기본
  const [buyShares, setBuyShares] = useState<number>(1);
  const [currentTab, setCurrentTab] = useState<'price' | 'equity'>('price');

  // Scanning State
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<
    {
      ticker: string;
      name: string;
      strategyReturn: number;
      bhReturn: number;
      outperformance: number;
      finalValue: number;
      tradesCount: number;
    }[]
  >([]);

  // Load ticker options
  const tickerOptions = useMemo(() => {
    const filtered = allTickersList.filter((t) => t.includes('.'));
    return filtered.map((ticker) => ({
      ticker,
      name: allTickersData[ticker]?.info?.kr_name || allTickersData[ticker]?.info?.name || '',
    }));
  }, []);

  const selectedTickerData = useMemo(() => allTickersData[selectedTicker], [selectedTicker]);

  // Backtest engine calculations
  const backtestResult = useMemo(() => {
    if (!selectedTickerData) return null;

    const allPrices = selectedTickerData.prices || [];
    if (allPrices.length === 0) return null;

    // 1. Slice dataset based on date period
    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
    let slice: typeof allPrices = [];

    if (period === 'custom' && startDate && endDate) {
      slice = allPrices.filter((p) => p.date >= startDate && p.date <= endDate);
    } else {
      const days = daysMap[period === 'custom' ? '1y' : period];
      slice = allPrices.slice(-days);
    }

    if (slice.length === 0) return null;

    // 2. Simulate Momentum Strategy
    const START_CAPITAL = 10000000; // 1천만원 기본
    let cash = START_CAPITAL;
    let shares = 0;
    const trades: {
      date: string;
      action: 'BUY' | 'SELL';
      price: number;
      value: number;
      sharesTraded: number;
      profitPct?: number;
    }[] = [];

    const equityHistory: { x: number; y: number }[] = [];
    const bhEquityHistory: { x: number; y: number }[] = [];

    const firstPrice = slice[0][priceBasis] || slice[0].close;
    const bhShares = START_CAPITAL / firstPrice;
    let lastBuyPrice = 0;

    slice.forEach((p, idx) => {
      const { date } = p;
      const timestamp = new Date(date).getTime();
      const currPrice = p[priceBasis] || p.close;

      if (idx > 0) {
        const prevPrice = slice[idx - 1][priceBasis] || slice[idx - 1].close;
        const dailyRet = ((currPrice - prevPrice) / prevPrice) * 100;

        // Buy Condition: return >= a%
        const isBuySignal = dailyRet >= buyThreshold;
        // Sell Condition: return <= -b%
        const isSellSignal = dailyRet <= -sellThreshold;

        if (isBuySignal && cash > 0) {
          // BUY
          let sharesToBuy = 0;
          let cost = 0;

          if (buyMethod === 'allIn') {
            sharesToBuy = cash / currPrice;
            cost = cash;
          } else if (buyMethod === 'amount') {
            cost = Math.min(cash, buyAmount);
            sharesToBuy = cost / currPrice;
          } else if (buyMethod === 'shares') {
            sharesToBuy = buyShares;
            cost = buyShares * currPrice;
            if (cost > cash) {
              sharesToBuy = cash / currPrice;
              cost = cash;
            }
          }

          if (sharesToBuy > 0) {
            cash -= cost;
            shares += sharesToBuy;
            lastBuyPrice = currPrice;
            trades.push({
              date,
              action: 'BUY',
              price: currPrice,
              sharesTraded: Number(sharesToBuy.toFixed(4)),
              value: Math.round(cash + shares * currPrice),
            });
          }
        } else if (isSellSignal && shares > 0) {
          // SELL
          const sharesToSell = shares * (sellRatio / 100);
          if (sharesToSell > 0) {
            const proceeds = sharesToSell * currPrice;
            cash += proceeds;
            shares -= sharesToSell;
            const profitPct =
              lastBuyPrice > 0 ? ((currPrice - lastBuyPrice) / lastBuyPrice) * 100 : 0;
            trades.push({
              date,
              action: 'SELL',
              price: currPrice,
              sharesTraded: Number(sharesToSell.toFixed(4)),
              value: Math.round(cash + shares * currPrice),
              profitPct,
            });
          }
        }
      }

      // Record daily equity values
      const currentEquity = cash + shares * currPrice;
      equityHistory.push({
        x: timestamp,
        y: Math.round(currentEquity),
      });

      // Buy & Hold equity curve
      const bhEquity = bhShares * currPrice;
      bhEquityHistory.push({
        x: timestamp,
        y: Math.round(bhEquity),
      });
    });

    const finalValue = equityHistory[equityHistory.length - 1]?.y || START_CAPITAL;
    const strategyReturn = ((finalValue - START_CAPITAL) / START_CAPITAL) * 100;

    const finalBhValue = bhEquityHistory[bhEquityHistory.length - 1]?.y || START_CAPITAL;
    const bhReturn = ((finalBhValue - START_CAPITAL) / START_CAPITAL) * 100;
    const outperformance = strategyReturn - bhReturn;

    return {
      slice,
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
    buyThreshold,
    sellThreshold,
    sellRatio,
    buyMethod,
    buyAmount,
    buyShares,
    priceBasis,
    period,
    startDate,
    endDate,
  ]);

  const formatMoney = (value: number) => `${value.toLocaleString()}원`;

  // Chart Setup
  const chartSeries = useMemo(() => {
    if (!backtestResult) return [];

    if (currentTab === 'price') {
      return [
        {
          name: `기준 가격 (${PRICE_TYPE_LABELS[priceBasis]})`,
          data: backtestResult.slice.map((p) => ({
            x: new Date(p.date).getTime(),
            y: p[priceBasis] || p.close,
          })),
        },
      ];
    }

    return [
      {
        name: '추세 추종 전략',
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
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: theme.palette.text.secondary } },
      },
      yaxis: {
        title: {
          text: currentTab === 'price' ? '주가 (원)' : '자산 가치 (원)',
          style: { color: theme.palette.text.secondary, fontWeight: 600 },
        },
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) => {
            if (currentTab === 'price') return value.toLocaleString();
            return value >= 10000 ? `${(value / 10000).toFixed(0)}만` : value.toLocaleString();
          },
        },
      },
      stroke: { curve: 'smooth', width: 2.5 },
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
    }),
    [theme, currentTab]
  );

  // Run all simulation backtest logic
  const handleRunAllSimulation = () => {
    setIsScanOpen(true);
    setIsScanning(true);
    setScanResults([]);

    setTimeout(() => {
      const results: typeof scanResults = [];
      const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };

      tickerOptions.forEach((opt) => {
        const data = allTickersData[opt.ticker];
        if (!data) return;

        const allPrices = data.prices || [];
        if (allPrices.length === 0) return;

        let slice: typeof allPrices = [];
        if (period === 'custom' && startDate && endDate) {
          slice = allPrices.filter((p) => p.date >= startDate && p.date <= endDate);
        } else {
          const days = daysMap[period === 'custom' ? '1y' : period];
          slice = allPrices.slice(-days);
        }

        if (slice.length === 0) return;

        const START_CAPITAL = 10000000;
        let cash = START_CAPITAL;
        let shares = 0;
        let tradesCount = 0;

        const firstPrice = slice[0][priceBasis] || slice[0].close;
        const bhShares = START_CAPITAL / firstPrice;

        slice.forEach((p, idx) => {
          const currPrice = p[priceBasis] || p.close;

          if (idx > 0) {
            const prevPrice = slice[idx - 1][priceBasis] || slice[idx - 1].close;
            const dailyRet = ((currPrice - prevPrice) / prevPrice) * 100;

            const isBuySignal = dailyRet >= buyThreshold;
            const isSellSignal = dailyRet <= -sellThreshold;

            if (isBuySignal && cash > 0) {
              let sharesToBuy = 0;
              let cost = 0;

              if (buyMethod === 'allIn') {
                sharesToBuy = cash / currPrice;
                cost = cash;
              } else if (buyMethod === 'amount') {
                cost = Math.min(cash, buyAmount);
                sharesToBuy = cost / currPrice;
              } else if (buyMethod === 'shares') {
                sharesToBuy = buyShares;
                cost = buyShares * currPrice;
                if (cost > cash) {
                  sharesToBuy = cash / currPrice;
                  cost = cash;
                }
              }

              if (sharesToBuy > 0) {
                cash -= cost;
                shares += sharesToBuy;
                tradesCount += 1;
              }
            } else if (isSellSignal && shares > 0) {
              const sharesToSell = shares * (sellRatio / 100);
              if (sharesToSell > 0) {
                const proceeds = sharesToSell * currPrice;
                cash += proceeds;
                shares -= sharesToSell;
                tradesCount += 1;
              }
            }
          }
        });

        const finalValue =
          cash + shares * (slice[slice.length - 1][priceBasis] || slice[slice.length - 1].close);
        const strategyReturn = ((finalValue - START_CAPITAL) / START_CAPITAL) * 100;

        const finalBhValue =
          bhShares * (slice[slice.length - 1][priceBasis] || slice[slice.length - 1].close);
        const bhReturn = ((finalBhValue - START_CAPITAL) / START_CAPITAL) * 100;
        const outperformance = strategyReturn - bhReturn;

        results.push({
          ticker: opt.ticker,
          name: opt.name,
          strategyReturn,
          bhReturn,
          outperformance,
          finalValue,
          tradesCount,
        });
      });

      results.sort((a, b) => b.strategyReturn - a.strategyReturn);
      setScanResults(results);
      setIsScanning(false);
    }, 300);
  };

  const handleSelectTickerFromScan = (ticker: string) => {
    setSelectedTicker(ticker);
    setIsScanOpen(false);
  };

  return (
    <Stack spacing={4}>
      <Grid container spacing={3}>
        {/* Controls Sidebar */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
            <Stack spacing={3.5}>
              <Stack spacing={0.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  추세 전략 파라미터
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  진입/청산 기준 수익률 및 주문 방식을 상세히 세팅합니다.
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
                    label="한국 종목 검색 및 설정"
                    placeholder="티커 또는 회사명 검색..."
                  />
                )}
              />

              <Stack spacing={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  기준 가격 종류
                </Typography>
                <ToggleButtonGroup
                  fullWidth
                  size="small"
                  value={priceBasis}
                  exclusive
                  onChange={(e, val) => {
                    if (val !== null) setPriceBasis(val);
                  }}
                  color="primary"
                >
                  <ToggleButton value="open" sx={{ fontWeight: 700 }}>
                    시가
                  </ToggleButton>
                  <ToggleButton value="high" sx={{ fontWeight: 700 }}>
                    고가
                  </ToggleButton>
                  <ToggleButton value="low" sx={{ fontWeight: 700 }}>
                    저가
                  </ToggleButton>
                  <ToggleButton value="close" sx={{ fontWeight: 700 }}>
                    종가
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              <Stack spacing={1}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>전일 대비 매수 기준 (a%)</span>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
                    +{buyThreshold.toFixed(1)}% 이상
                  </Typography>
                </Typography>
                <Slider
                  min={0.5}
                  max={10}
                  step={0.1}
                  value={buyThreshold}
                  onChange={(e, val) => setBuyThreshold(val as number)}
                  valueLabelDisplay="auto"
                />
              </Stack>

              <Stack spacing={2}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  매수 주문 수량 옵션
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
                  <ToggleButton value="allIn" sx={{ fontWeight: 700 }}>
                    전액 매수
                  </ToggleButton>
                  <ToggleButton value="amount" sx={{ fontWeight: 700 }}>
                    고정 금액
                  </ToggleButton>
                  <ToggleButton value="shares" sx={{ fontWeight: 700 }}>
                    고정 주식수
                  </ToggleButton>
                </ToggleButtonGroup>

                {buyMethod === 'amount' && (
                  <TextField
                    fullWidth
                    size="small"
                    label="회당 매수 금액 (원)"
                    type="number"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(Math.max(1, Number(e.target.value)))}
                  />
                )}

                {buyMethod === 'shares' && (
                  <TextField
                    fullWidth
                    size="small"
                    label="회당 매수 주식 수 (주)"
                    type="number"
                    value={buyShares}
                    onChange={(e) => setBuyShares(Math.max(1, Number(e.target.value)))}
                  />
                )}
              </Stack>

              <Stack spacing={1}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>전일 대비 매도 기준 (b%)</span>
                  <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 800 }}>
                    -{sellThreshold.toFixed(1)}% 이하
                  </Typography>
                </Typography>
                <Slider
                  min={0.5}
                  max={10}
                  step={0.1}
                  value={sellThreshold}
                  onChange={(e, val) => setSellThreshold(val as number)}
                  valueLabelDisplay="auto"
                />
              </Stack>

              <Stack spacing={1}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>보유 주식 매도 비율 (c%)</span>
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

              <Divider sx={{ my: 1 }} />

              <Button
                id="run-all-simulation"
                variant="contained"
                color="secondary"
                size="large"
                fullWidth
                onClick={handleRunAllSimulation}
                sx={{ borderRadius: 1.5, fontWeight: 800, py: 1.2 }}
                startIcon={<span>⚡</span>}
              >
                전체 종목 시뮬레이션 가동
              </Button>
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
                      추세 추종 수익률
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
                {currentTab === 'price' ? '기준 가격 흐름 추이' : '전략 평가 자산 곡선 비교'}
              </Typography>

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant={currentTab === 'price' ? 'contained' : 'outlined'}
                  onClick={() => setCurrentTab('price')}
                >
                  기준 가격
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

            <Box sx={{ p: 3, height: 400 }}>
              {backtestResult ? (
                <ChartApex options={chartOptions} series={chartSeries} type="line" height="100%" />
              ) : (
                <Box
                  sx={{
                    height: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography sx={{ color: 'text.disabled' }}>
                    데이터 로딩 실패 또는 데이터가 없습니다.
                  </Typography>
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
            📋 매매 실적 저널 (Trading Journal)
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
                        label={t.action === 'BUY' ? '매수 (BUY)' : '매도 (SELL)'}
                        color={t.action === 'BUY' ? 'success' : 'error'}
                        size="small"
                        variant={'soft' as any}
                        sx={{ fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell>{t.price.toLocaleString()}원</TableCell>
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

      {/* Ranked Market Scanner Modal */}
      <Dialog
        open={isScanOpen}
        onClose={() => {
          if (!isScanning) setIsScanOpen(false);
        }}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            boxShadow: theme.customShadows?.dialog || theme.shadows[24],
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 800,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>전체 종목 시뮬레이션 순위 결과 📊</span>
          {isScanning && <CircularProgress size={24} />}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {isScanning ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                전체 종목 백테스팅 스캔 중... ⚡
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', display: 'block', mt: 1 }}
              >
                해당 조건으로 시장의 모든 종목에 대한 시뮬레이션을 역동적으로 수행하고 있습니다.
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: '60vh' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{ fontWeight: 700, bgcolor: 'background.neutral', whiteSpace: 'nowrap' }}
                    >
                      순위
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, bgcolor: 'background.neutral', whiteSpace: 'nowrap' }}
                    >
                      종목명 (티커)
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, bgcolor: 'background.neutral', whiteSpace: 'nowrap' }}
                    >
                      전략 수익률
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, bgcolor: 'background.neutral', whiteSpace: 'nowrap' }}
                    >
                      단순 보유 수익률
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, bgcolor: 'background.neutral', whiteSpace: 'nowrap' }}
                    >
                      초과 수익률
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, bgcolor: 'background.neutral', whiteSpace: 'nowrap' }}
                    >
                      거래 횟수
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scanResults.map((row, idx) => (
                    <TableRow
                      key={row.ticker}
                      hover
                      onClick={() => handleSelectTickerFromScan(row.ticker)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {idx + 1}위
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {row.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {row.ticker}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 800,
                          color: row.strategyReturn >= 0 ? 'success.main' : 'error.main',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.strategyReturn >= 0 ? '+' : ''}
                        {row.strategyReturn.toFixed(2)}%
                      </TableCell>
                      <TableCell
                        sx={{
                          color: row.bhReturn >= 0 ? 'text.primary' : 'error.main',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.bhReturn >= 0 ? '+' : ''}
                        {row.bhReturn.toFixed(2)}%
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          color: row.outperformance >= 0 ? 'success.main' : 'error.main',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.outperformance >= 0 ? '+' : ''}
                        {row.outperformance.toFixed(2)}%
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.tradesCount}회</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setIsScanOpen(false)}
            disabled={isScanning}
            sx={{ fontWeight: 700 }}
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
