'use client';

import type { UseChartTrendSimulatorReturn } from 'src/sections/detailed-analysis/hooks/use-chart-trend-simulator';

import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

interface Props {
  simulator: UseChartTrendSimulatorReturn;
}

export function TrendSummaryStats({ simulator }: Props) {
  const theme = useTheme() as any;
  const { backtestResult, formatMoney } = simulator;

  if (!backtestResult) return null;

  const { finalValue, strategyReturn, bhReturn, outperformance, totalTrades } = backtestResult;

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Card sx={{ p: 3, textAlign: 'center', boxShadow: theme.customShadows?.card }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            최종 자산 평가액
          </Typography>
          <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
            {formatMoney(finalValue)}
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
              color: strategyReturn >= 0 ? 'success.main' : 'error.main',
            }}
          >
            {strategyReturn >= 0 ? '+' : ''}
            {strategyReturn.toFixed(2)}%
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
              color: bhReturn >= 0 ? 'text.primary' : 'error.main',
            }}
          >
            {bhReturn >= 0 ? '+' : ''}
            {bhReturn.toFixed(2)}%
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
              color: outperformance >= 0 ? 'success.main' : 'error.main',
            }}
          >
            {outperformance >= 0 ? '+' : ''}
            {outperformance.toFixed(1)}% / {totalTrades}회
          </Typography>
        </Card>
      </Grid>
    </Grid>
  );
}
