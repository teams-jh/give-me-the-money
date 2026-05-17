'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DashboardContent } from 'src/layouts/dashboard';

import { UsAnalysisView } from './us-analysis-view';
import { KrAnalysisView } from './kr-analysis-view';

// ----------------------------------------------------------------------

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
];

export function DetailedAnalysisView() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [period, setPeriod] = useState<PeriodKey>('1y');

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

          <Stack direction="row" spacing={2} alignItems="center" alignSelf={{ xs: 'stretch', md: 'auto' }}>
            <ToggleButtonGroup
              value={market}
              exclusive
              onChange={(e, v) => v && setMarket(v)}
              color="primary"
              size="medium"
            >
              <ToggleButton value="US" sx={{ px: 3, fontWeight: 800 }}>
                US 미국
              </ToggleButton>
              <ToggleButton value="KR" sx={{ px: 3, fontWeight: 800 }}>
                KR 한국
              </ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={period}
              exclusive
              onChange={(e, v) => v && setPeriod(v)}
              size="medium"
              color="primary"
            >
              {PERIOD_OPTIONS.map((option) => (
                <ToggleButton key={option.value} value={option.value} sx={{ px: 2, fontWeight: 700 }}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        </Stack>

        {market === 'US' ? (
          <UsAnalysisView period={period} />
        ) : (
          <KrAnalysisView period={period} />
        )}
      </Stack>
    </DashboardContent>
  );
}
