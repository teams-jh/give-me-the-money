'use client';

import type { UseChartTrendSimulatorReturn } from 'src/sections/detailed-analysis/hooks/use-chart-trend-simulator';

import ChartApex from 'react-apexcharts';

const ReactApexChart = ChartApex as any;

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

interface Props {
  simulator: UseChartTrendSimulatorReturn;
}

export function TrendChartPanel({ simulator }: Props) {
  const theme = useTheme() as any;
  const { backtestResult, currentTab, setCurrentTab, chartOptions, chartSeries } = simulator;

  return (
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
          <ReactApexChart options={chartOptions} series={chartSeries} type="line" height="100%" />
        ) : (
          <Box sx={{ height: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'text.disabled' }}>
              데이터 로딩 실패 또는 데이터가 없습니다.
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  );
}
