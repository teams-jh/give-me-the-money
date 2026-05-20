'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

import { UsAnalysisView } from './us-analysis-view';
import { KrAnalysisView } from './kr-analysis-view';

// ----------------------------------------------------------------------

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function DetailedAnalysisView() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('1y');

  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const [startDate, setStartDate] = useState<string>(getLocalDateString(oneMonthAgo));
  const [endDate, setEndDate] = useState<string>(getLocalDateString(today));

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
              종목 상세 분석 및 시뮬레이션 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              종목 간 수익률 비교와 적립식 투자(DCA) 시뮬레이션을 제공합니다.
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

        {market === 'US' ? (
          <UsAnalysisView period={period} startDate={startDate} endDate={endDate} />
        ) : (
          <KrAnalysisView period={period} startDate={startDate} endDate={endDate} />
        )}
      </Stack>
    </DashboardContent>
  );
}
