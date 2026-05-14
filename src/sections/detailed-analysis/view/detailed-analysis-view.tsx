'use client';

import { useState, useMemo } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { useTheme, alpha } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';

import { DashboardContent } from 'src/layouts/dashboard';
import { allTickersData, tickers as allTickersList } from 'src/library/tickers';
import { transformTickerToStock } from 'src/sections/top100/top100-utils';
import { PeriodKey } from 'src/sections/top100/types';

import ChartApex from 'react-apexcharts';

// ----------------------------------------------------------------------

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
];

const DAILY_INVESTMENT = 10000; // 매일 1만원

export function DetailedAnalysisView() {
  const theme = useTheme();
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'TSLA']);
  const [inputValue, setInputValue] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('1y');
  const [currentTab, setCurrentTab] = useState('comparison');

  const rawChartData = useMemo(() => {
    return selectedTickers.map((ticker) => {
      const rawData = allTickersData[ticker];
      if (!rawData) return null;

      const stock = transformTickerToStock(rawData);
      const periodData = stock.periods[period];
      
      return {
        name: ticker,
        chart_data: periodData.chart_data,
        chart_labels: periodData.chart_labels,
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedTickers, period]);

  const comparisonSeries = useMemo(() => {
    return rawChartData.map((item) => ({
      name: item.name,
      data: item.chart_data.map((val, idx) => ({
        x: new Date(item.chart_labels[idx]).getTime(),
        y: val
      })),
    }));
  }, [rawChartData]);

  const dcaData = useMemo(() => {
    return rawChartData.map((item) => {
      let cumulativeShares = 0;
      let totalInvested = 0;
      const history: { x: number; y: number }[] = [];

      item.chart_data.forEach((price, idx) => {
        totalInvested += DAILY_INVESTMENT;
        cumulativeShares += DAILY_INVESTMENT / price;
        const currentValue = cumulativeShares * price;
        
        history.push({
          x: new Date(item.chart_labels[idx]).getTime(),
          y: Math.round(currentValue),
        });
      });

      const finalValue = history[history.length - 1]?.y || 0;
      const totalInvestedAmount = totalInvested;
      const profit = finalValue - totalInvestedAmount;
      const profitPct = (profit / totalInvestedAmount) * 100;

      return {
        name: item.name,
        history,
        finalValue,
        totalInvestedAmount,
        profit,
        profitPct,
      };
    });
  }, [rawChartData]);

  const dcaSeries = useMemo(() => {
    return dcaData.map((item) => ({
      name: item.name,
      data: item.history,
    }));
  }, [dcaData]);

  const chartOptions: any = {
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
        text: currentTab === 'comparison' ? '지수화된 가격 (기준 100)' : '평가 금액 (원)',
        style: { color: theme.palette.text.secondary, fontWeight: 600 }
      },
      labels: { 
        style: { colors: theme.palette.text.secondary },
        formatter: (value: number) => currentTab === 'comparison' ? value.toFixed(0) : `${value.toLocaleString()}원`
      },
    },
    stroke: { curve: 'smooth', width: 3 },
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      labels: { colors: theme.palette.text.secondary },
    },
    tooltip: {
      theme: theme.palette.mode,
      x: { format: 'yyyy-MM-dd' },
      y: {
        formatter: (value: number) => currentTab === 'comparison' ? value.toFixed(2) : `${value.toLocaleString()}원`
      },
    },
    grid: {
      borderColor: alpha(theme.palette.grey[500], 0.1),
      strokeDashArray: 3,
    },
  };

  const tickerOptions = useMemo(() => {
    return allTickersList.map((ticker) => ({
      ticker,
      name: allTickersData[ticker]?.info?.name || '',
    }));
  }, []);

  const handleAddTicker = (newValue: { ticker: string; name: string } | null) => {
    if (newValue && !selectedTickers.includes(newValue.ticker)) {
      setSelectedTickers((prev) => [...prev, newValue.ticker]);
    }
    setInputValue('');
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              종목 상세 분석 및 시뮬레이션 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              종목 간 수익률 비교와 적립식 투자(DCA) 시뮬레이션을 제공합니다.
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(e, v) => v && setPeriod(v)}
            size="small"
            color="primary"
          >
            {PERIOD_OPTIONS.map((option) => (
              <ToggleButton key={option.value} value={option.value} sx={{ px: 2, fontWeight: 700 }}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
          <Stack spacing={3}>
            <Autocomplete
              fullWidth
              options={tickerOptions}
              getOptionLabel={(option) => `${option.ticker} - ${option.name}`}
              onChange={(e, v) => handleAddTicker(v)}
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
                    <Typography variant="subtitle2">{option.ticker}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {option.name}
                    </Typography>
                  </Stack>
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} label="종목 검색 및 추가" placeholder="티커(AAPL) 또는 회사명(Apple) 검색..." />
              )}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedTickers.map((ticker) => (
                <Chip
                  key={ticker}
                  label={ticker}
                  onDelete={() => setSelectedTickers((prev) => prev.filter((t) => t !== ticker))}
                  color="primary"
                  variant="soft"
                  sx={{ fontWeight: 700 }}
                />
              ))}
            </Box>
          </Stack>
        </Card>

        <Card sx={{ boxShadow: theme.customShadows?.card }}>
          <Stack 
            direction="row" 
            alignItems="center" 
            justifyContent="space-between" 
            sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {currentTab === 'comparison' ? '수익률 추이 분석' : '적립식 투자(DCA) 결과'}
            </Typography>

            <Button
              variant={currentTab === 'dca' ? 'contained' : 'outlined'}
              color="primary"
              onClick={() => setCurrentTab(prev => prev === 'comparison' ? 'dca' : 'comparison')}
              startIcon={<span>💰</span>}
              sx={{ borderRadius: 1, fontWeight: 700 }}
            >
              매일 만원씩 모았다면?
            </Button>
          </Stack>

          <Box sx={{ p: 3 }}>
            {currentTab === 'dca' && (
              <Box sx={{ mb: 3, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 1.5 }}>
                <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 700 }}>
                  💡 시뮬레이션 조건: 매일 {DAILY_INVESTMENT.toLocaleString()}원씩 해당 종목을 매수했을 경우
                </Typography>
              </Box>
            )}

            <Box sx={{ height: 500 }}>
              {selectedTickers.length > 0 ? (
                <ChartApex
                  options={chartOptions}
                  series={currentTab === 'comparison' ? comparisonSeries : dcaSeries}
                  type="line"
                  height="100%"
                />
              ) : (
                <Box sx={{ height: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ color: 'text.disabled' }}>비교할 종목을 추가해 주세요.</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Card>

        {currentTab === 'dca' && selectedTickers.length > 0 && (
          <Grid container spacing={3}>
            {dcaData.map((item) => (
              <Grid key={item.name} size={{ xs: 12, md: 6, lg: 3 }}>
                <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
                  <Typography variant="overline" sx={{ color: 'text.secondary' }}>{item.name} 최종 결과</Typography>
                  <Typography variant="h4" sx={{ mt: 1, mb: 1, fontWeight: 800 }}>
                    {item.finalValue.toLocaleString()}원
                  </Typography>
                  <Stack direction="row" justifyContent="center" spacing={1}>
                    <Typography variant="body2" sx={{ color: item.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 700 }}>
                      {item.profit >= 0 ? '+' : ''}{item.profit.toLocaleString()}원 ({item.profitPct.toFixed(2)}%)
                    </Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.disabled', mt: 2, display: 'block' }}>
                    총 투자금: {item.totalInvestedAmount.toLocaleString()}원
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>
    </DashboardContent>
  );
}
