'use client';

import type { PeriodKey } from 'src/library/shared/signals';

import ChartApex from 'react-apexcharts';
import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import ToggleButton from '@mui/material/ToggleButton';
import { alpha, useTheme } from '@mui/material/styles';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { allTickersData, tickers as allTickersList } from 'src/library/tickers';


// ----------------------------------------------------------------------

const DAILY_INVESTMENT = 10; // 매일 10달러

const PRICE_TYPE_LABELS = {
  open: '시가',
  high: '고가',
  low: '저가',
  close: '종가',
};

interface UsAnalysisViewProps {
  period: PeriodKey | 'custom';
  startDate?: string;
  endDate?: string;
}

export function UsAnalysisView({ period, startDate, endDate }: UsAnalysisViewProps) {
  const theme = useTheme();
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'TSLA']);
  const [inputValue, setInputValue] = useState('');
  const [currentTab, setCurrentTab] = useState<'comparison' | 'dca'>('comparison');
  const [priceType, setPriceType] = useState<'open' | 'high' | 'low' | 'close'>('close');

  const rawChartData = useMemo(() => {
    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };

    return selectedTickers
      .map((ticker) => {
        const rawData = allTickersData[ticker];
        if (!rawData) return null;

        const allPrices = rawData.prices || [];
        let slice;
        if (period === 'custom' && startDate && endDate) {
          slice = allPrices.filter((p) => p.date >= startDate && p.date <= endDate);
        } else {
          const days = daysMap[period === 'custom' ? '1y' : period];
          slice = allPrices.slice(-days);
        }

        const chart_data = slice.map((p) => p[priceType] ?? p.close);
        const chart_labels = slice.map((p) => p.date);

        return {
          ticker,
          companyName: rawData.info.name,
          chart_data,
          chart_labels,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedTickers, period, startDate, endDate, priceType]);

  const comparisonSeries = useMemo(() => rawChartData.map((item) => ({
      name: item.companyName,
      data: item.chart_data.map((val, idx) => ({
        x: new Date(item.chart_labels[idx]).getTime(),
        y: val,
      })),
    })), [rawChartData]);

  const dcaData = useMemo(() => rawChartData.map((item) => {
      let cumulativeShares = 0;
      let totalInvested = 0;
      const history: { x: number; y: number }[] = [];

      item.chart_data.forEach((price, idx) => {
        totalInvested += DAILY_INVESTMENT;
        cumulativeShares += DAILY_INVESTMENT / price;
        const currentValue = cumulativeShares * price;

        history.push({
          x: new Date(item.chart_labels[idx]).getTime(),
          y: Number(currentValue.toFixed(2)),
        });
      });

      const finalValue = history[history.length - 1]?.y || 0;
      const totalInvestedAmount = totalInvested;
      const profit = finalValue - totalInvestedAmount;
      const profitPct = totalInvestedAmount > 0 ? (profit / totalInvestedAmount) * 100 : 0;

      return {
        ticker: item.ticker,
        companyName: item.companyName,
        history,
        finalValue,
        totalInvestedAmount,
        profit,
        profitPct,
      };
    }), [rawChartData]);

  const dcaSeries = useMemo(() => {
    const series = dcaData.map((item) => ({
      name: item.companyName,
      data: item.history,
    }));

    if (dcaData.length > 0) {
      const firstItem = dcaData[0];
      const cashData = firstItem.history.map((h, idx) => ({
        x: h.x,
        y: Number(((idx + 1) * DAILY_INVESTMENT).toFixed(2)),
      }));

      series.push({
        name: '현금 보유 (단순 적립)',
        data: cashData,
      });
    }

    return series;
  }, [dcaData]);

  const formatMoney = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
        text: currentTab === 'comparison' ? '주가 ($)' : '평가 금액 ($)',
        style: { color: theme.palette.text.secondary, fontWeight: 600 },
      },
      labels: {
        style: { colors: theme.palette.text.secondary },
        formatter: (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
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
        formatter: (value: number) => formatMoney(value),
      },
    },
    grid: {
      borderColor: alpha(theme.palette.grey[500], 0.1),
      strokeDashArray: 3,
    },
  }), [theme, currentTab]);

  const tickerOptions = useMemo(() => {
    const filtered = allTickersList.filter((t) => !t.includes('.'));

    return filtered.map((ticker) => ({
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

  const handleRemoveTicker = (ticker: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== ticker));
  };

  return (
    <Stack spacing={4}>
      <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
        <Stack spacing={3}>
          <Autocomplete
            fullWidth
            options={tickerOptions}
            getOptionLabel={(option) => `${option.name} (${option.ticker})`}
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
                label="미국 종목 검색 및 추가"
                placeholder="티커 또는 회사명 검색..."
              />
            )}
          />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {selectedTickers.map((ticker) => (
              <Chip
                key={ticker}
                label={allTickersData[ticker]?.info?.name || ticker}
                onDelete={() => handleRemoveTicker(ticker)}
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
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
          spacing={2}
          sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {currentTab === 'comparison' ? '수익률 추이 분석 (US)' : '적립식 투자(DCA) 결과 (US)'}
          </Typography>

          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'space-between', md: 'flex-end' } }}
          >
            <ToggleButtonGroup
              size="small"
              value={priceType}
              exclusive
              onChange={(e, val) => {
                if (val !== null) setPriceType(val);
              }}
              color="primary"
            >
              <ToggleButton value="open" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>시가</ToggleButton>
              <ToggleButton value="high" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>고가</ToggleButton>
              <ToggleButton value="low" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>저가</ToggleButton>
              <ToggleButton value="close" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>종가</ToggleButton>
            </ToggleButtonGroup>

            <Button
              variant={currentTab === 'dca' ? 'contained' : 'outlined'}
              color="primary"
              onClick={() => setCurrentTab((prev) => (prev === 'comparison' ? 'dca' : 'comparison'))}
              startIcon={<span>💰</span>}
              sx={{ borderRadius: 1, fontWeight: 700 }}
            >
              매일 10달러씩 모았다면?
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ p: 3 }}>
          {currentTab === 'dca' && (
            <Box sx={{ mb: 3, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 1.5 }}>
              <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 700 }}>
                💡 시뮬레이션 조건: 매일 10달러씩 각 종목의 {PRICE_TYPE_LABELS[priceType]} 기준으로 매수했을 경우
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
            <Grid key={item.ticker} size={{ xs: 12, md: 6, lg: 3 }}>
              <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
                <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  {item.companyName}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                  {item.ticker}
                </Typography>

                <Typography variant="h4" sx={{ mb: 1, fontWeight: 800 }}>
                  {formatMoney(item.finalValue)}
                </Typography>

                <Stack direction="row" justifyContent="center" spacing={1}>
                  <Typography
                    variant="body2"
                    sx={{ color: item.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 700 }}
                  >
                    {item.profit >= 0 ? '+' : ''}
                    {formatMoney(item.profit)} ({item.profitPct.toFixed(2)}%)
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 2, display: 'block' }}>
                  총 투자금: {formatMoney(item.totalInvestedAmount)}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
