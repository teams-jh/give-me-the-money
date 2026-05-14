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

export function DetailedAnalysisView() {
  const theme = useTheme();
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'TSLA']);
  const [inputValue, setInputValue] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('1y');

  const chartData = useMemo(() => {
    return selectedTickers.map((ticker) => {
      const rawData = allTickersData[ticker];
      if (!rawData) return null;

      const stock = transformTickerToStock(rawData);
      const periodData = stock.periods[period];
      
      return {
        name: ticker,
        data: periodData.chart_data.map((val, idx) => ({
          x: new Date(periodData.chart_labels[idx]).getTime(),
          y: val
        })),
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedTickers, period]);

  const series = chartData.map((item) => ({
    name: item.name,
    data: item.data,
  }));

  const chartOptions: any = {
    chart: {
      id: 'comparison-chart',
      toolbar: { show: true },
      zoom: { enabled: true },
      background: 'transparent',
      fontFamily: theme.typography.fontFamily,
    },
    colors: [
      theme.palette.primary.main,
      theme.palette.info.main,
      theme.palette.warning.main,
      theme.palette.success.main,
      theme.palette.error.main,
      theme.palette.secondary.main,
      '#FF4842', '#1890FF', '#919EAB', '#00AB55', '#FFC107',
    ],
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: theme.palette.text.secondary },
      },
    },
    yaxis: {
      title: { 
        text: '지수화된 가격 (기준 100)',
        style: { color: theme.palette.text.secondary, fontWeight: 600 }
      },
      labels: { style: { colors: theme.palette.text.secondary } },
    },
    stroke: {
      curve: 'smooth',
      width: 3,
    },
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      labels: { colors: theme.palette.text.secondary },
      itemMargin: { horizontal: 10, vertical: 5 },
    },
    tooltip: {
      theme: theme.palette.mode,
      x: { 
        show: true,
        format: 'yyyy-MM-dd'
      },
      y: {
        formatter: (value: number) => `${value.toFixed(2)}`,
      },
    },
    grid: {
      borderColor: alpha(theme.palette.grey[500], 0.1),
      strokeDashArray: 3,
    },
    markers: {
      size: 0,
      hover: { size: 5 }
    }
  };

  const handleAddTicker = (newValue: string | null) => {
    if (newValue && !selectedTickers.includes(newValue)) {
      setSelectedTickers((prev) => [...prev, newValue]);
    }
    setInputValue('');
  };

  const handleDeleteTicker = (tickerToDelete: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== tickerToDelete));
  };

  const handleChangePeriod = (event: React.MouseEvent<HTMLElement>, newPeriod: PeriodKey | null) => {
    if (newPeriod !== null) {
      setPeriod(newPeriod);
    }
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              종목 상세 비교 분석 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              최대 여러 종목의 수익률 추이를 동일한 선상에서 비교합니다.
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={handleChangePeriod}
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
              options={allTickersList}
              getOptionLabel={(option) => option}
              value={null}
              onChange={(event, newValue) => handleAddTicker(newValue)}
              inputValue={inputValue}
              onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="종목 검색 및 추가" 
                  placeholder="예: AAPL, TSLA, MSFT..."
                  InputProps={{
                    ...params.InputProps,
                    sx: { borderRadius: 1.5 }
                  }}
                />
              )}
            />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedTickers.map((ticker) => (
                <Chip
                  key={ticker}
                  label={ticker}
                  onDelete={() => handleDeleteTicker(ticker)}
                  color="primary"
                  variant="soft"
                  sx={{ 
                    fontWeight: 700,
                    '& .MuiChip-label': { px: 1.5 }
                  }}
                />
              ))}
              {selectedTickers.length === 0 && (
                <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic', py: 1 }}>
                  비교할 종목이 없습니다. 위 검색창에서 종목을 추가해주세요.
                </Typography>
              )}
            </Box>
          </Stack>
        </Card>

        <Card sx={{ p: 3, minHeight: 600, boxShadow: theme.customShadows?.card }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              수익률 추이 (기준점: 기간 시작일 = 100)
            </Typography>
          </Stack>
          
          <Box sx={{ height: 500, width: '100%' }}>
            {series.length > 0 ? (
              <ChartApex
                options={chartOptions}
                series={series}
                type="line"
                height="100%"
              />
            ) : (
              <Box
                sx={{
                  height: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (theme) => alpha(theme.palette.grey[500], 0.04),
                  borderRadius: 1.5,
                  border: (theme) => `dashed 1px ${theme.palette.divider}`,
                }}
              >
                <Stack spacing={1} alignItems="center">
                  <Typography variant="h6" sx={{ color: 'text.disabled' }}>데이터 없음</Typography>
                  <Typography variant="body2" sx={{ color: 'text.disabled' }}>비교할 종목을 추가해 주세요.</Typography>
                </Stack>
              </Box>
            )}
          </Box>
        </Card>
      </Stack>
    </DashboardContent>
  );
}
