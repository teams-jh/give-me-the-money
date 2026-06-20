'use client';

import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { TrendInputPanel } from '../components/trend-input-panel';
import { TrendResultList } from '../components/trend-result-list';
import { useTrendSimulation } from '../hooks/use-trend-simulation';

// ----------------------------------------------------------------------

export function TrendIndicatorsView() {
  const sim = useTrendSimulation();

  return (
    <Stack spacing={3} sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>
        📈 추세 지표 — 전체 종목 추세선 시뮬레이션
      </Typography>

      <Grid container spacing={3}>
        {/* 입력 패널 */}
        <Grid size={{ xs: 12 }}>
          <TrendInputPanel sim={sim} />
        </Grid>

        {/* 결과 목록 */}
        <Grid size={{ xs: 12 }}>
          <TrendResultList sim={sim} />
        </Grid>
      </Grid>
    </Stack>
  );
}
