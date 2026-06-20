'use client';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

import { TrendChartPanel } from './components/trend-chart-panel';
import { TrendTradeJournal } from './components/trend-trade-journal';
import { TrendSummaryStats } from './components/trend-summary-stats';
import { TrendParametersPanel } from './components/trend-parameters-panel';
import { useChartTrendSimulator } from '../hooks/use-chart-trend-simulator';

// ----------------------------------------------------------------------

export function ChartTrendView() {
  const simulator = useChartTrendSimulator();

  const { market, setMarket, period, setPeriod, startDate, setStartDate, endDate, setEndDate } =
    simulator;

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
              과거 가격을 바탕으로 동적 회귀 채널을 긋고, 상/하단 터치에 따른 매매 성과를
              시뮬레이션합니다.
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
            <TrendParametersPanel simulator={simulator} />
          </Grid>

          {/* Overview Stats & Chart */}
          <Grid size={{ xs: 12, md: 8 }}>
            <TrendSummaryStats simulator={simulator} />
            <TrendChartPanel simulator={simulator} />
          </Grid>
        </Grid>

        {/* Trade Journal Table */}
        <TrendTradeJournal simulator={simulator} />
      </Stack>
    </DashboardContent>
  );
}
