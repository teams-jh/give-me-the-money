'use client';

import type { SimResult } from 'src/library/shared/trendSim';
import type { TrendSimFinalResult } from 'src/library/shared/signals';
import type { UseTrendSimulationReturn } from '../hooks/use-trend-simulation';

import dynamic from 'next/dynamic';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

// ----------------------------------------------------------------------

interface Props {
  sim: UseTrendSimulationReturn;
}

const PERIOD_LABEL: Record<string, string> = {
  '3m': '3개월',
  '1y': '1년',
  '2y': '2년',
  '3y': '3년',
};

// ----------------------------------------------------------------------

function getMiniChartOptions(result: TrendSimFinalResult<SimResult>, theme: any) {
  const sim = result.longestPeriodResult;
  const annotations: any = { points: [] };

  const pointsToUse = sim.filteredTouchPoints ?? sim.touchPoints;
  pointsToUse.forEach((tp) => {
    const isBreak = tp.type === 'breakout';
    const isClose = tp.priceType === 'close';
    const color = isBreak
      ? isClose
        ? theme.palette.secondary.main
        : theme.palette.secondary.light
      : isClose
        ? theme.palette.error.main
        : theme.palette.warning.main;

    annotations.points.push({
      x: tp.x,
      y: tp.y,
      marker: { size: 5, fillColor: color, strokeColor: '#FFF', strokeWidth: 1.5 },
    });
  });

  const highs = sim.prices.map((p) => p.high || p.close);
  const lows = sim.prices.map((p) => p.low || p.close);
  const maxVal = highs.reduce((a, b) => (b > a ? b : a), -Infinity);
  const minVal = lows.reduce((a, b) => (b < a ? b : a), Infinity);
  const diff = maxVal - minVal;

  return {
    chart: { id: `trend-${sim.ticker}`, sparkline: { enabled: true }, background: 'transparent' },
    stroke: {
      curve: ['straight', 'straight', 'straight'] as any,
      width: [1, 2, 2],
      dashArray: [0, 4, 4],
    },
    plotOptions: {
      candlestick: {
        colors: { upward: theme.palette.error.main, downward: theme.palette.info.main },
        wick: { useFillColor: true },
      },
    },
    annotations,
    xaxis: { type: 'datetime' as const },
    yaxis: { min: minVal - (diff || minVal) * 0.05, max: maxVal + (diff || maxVal) * 0.05 },
    tooltip: { theme: theme.palette.mode, x: { format: 'yyyy-MM-dd' } },
    grid: { show: false },
  };
}

function getMiniChartSeries(result: TrendSimFinalResult<SimResult>, trendAlgo: string) {
  const sim = result.longestPeriodResult;

  const series: any[] = [
    {
      name: '주가 (OHLC)',
      type: 'candlestick',
      data: sim.prices.map((p) => ({
        x: new Date(p.date).getTime(),
        y: [p.open || p.close, p.high || p.close, p.low || p.close, p.close],
      })),
    },
  ];

  if (trendAlgo === 'zigzag' && sim.zigzagData) {
    series.push({ name: '지그재그 파동선', type: 'line', data: sim.zigzagData });
  } else {
    if (sim.supportData) series.push({ name: '지지선', type: 'line', data: sim.supportData });
    if (sim.resistanceData) series.push({ name: '저항선', type: 'line', data: sim.resistanceData });
  }

  return series;
}

// ----------------------------------------------------------------------

export function TrendResultList({ sim }: Props) {
  const theme = useTheme() as any;
  const { finalResults, isSimulating, trendAlgo, simPeriods } = sim;

  if (isSimulating) {
    return (
      <Card
        sx={{
          p: 4,
          textAlign: 'center',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          ⏳ 시뮬레이션 실행 중...
        </Typography>
      </Card>
    );
  }

  if (finalResults.length === 0) {
    return (
      <Card
        sx={{
          p: 4,
          textAlign: 'center',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
        }}
      >
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          {simPeriods.length === 0
            ? '기간을 1개 이상 선택하고 시뮬레이션을 실행해주세요.'
            : '조건을 만족하는 종목이 없습니다. 파라미터를 조정해보세요.'}
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
        총 <strong style={{ color: theme.palette.primary.main }}>{finalResults.length}개</strong>{' '}
        종목
        {simPeriods.length > 1 && (
          <> — {simPeriods.map((p) => PERIOD_LABEL[p]).join(' AND ')} 동시 만족</>
        )}
      </Typography>

      <Grid container spacing={2}>
        {finalResults.map((result) => {
          const chartOpts = getMiniChartOptions(result, theme);
          const chartSeries = getMiniChartSeries(result, trendAlgo);

          return (
            <Grid key={result.ticker} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card
                sx={{
                  p: 2,
                  height: '100%',
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  background: `linear-gradient(135deg,
                  ${alpha(theme.palette.background.paper, 0.95)} 0%,
                  ${alpha(theme.palette.background.neutral ?? theme.palette.grey[100], 0.8)} 100%)`,
                  '&:hover': {
                    boxShadow: theme.customShadows?.z8,
                    transform: 'translateY(-2px)',
                    transition: 'all 0.2s',
                  },
                }}
              >
                <Stack spacing={1.5}>
                  {/* 헤더: 티커 + 기울기 배지 */}
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        {result.ticker}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {result.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={
                        result.longestPeriodResult.slopeType === 'positive'
                          ? '↗ 양의 기울기'
                          : result.longestPeriodResult.slopeType === 'negative'
                            ? '↘ 음의 기울기'
                            : '→ 횡보'
                      }
                      size="small"
                      color={
                        result.longestPeriodResult.slopeType === 'positive'
                          ? 'error'
                          : result.longestPeriodResult.slopeType === 'negative'
                            ? 'info'
                            : 'default'
                      }
                      sx={{ fontWeight: 700, fontSize: '0.7rem' }}
                    />
                  </Stack>

                  {/* 기간별 터치/돌파 배지 */}
                  <Stack spacing={0.5}>
                    {simPeriods.map((p) => {
                      const stat = result.periodStats[p];
                      if (!stat) return null;
                      return (
                        <Stack key={p} direction="row" spacing={1} alignItems="center">
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 36 }}
                          >
                            {PERIOD_LABEL[p]}
                          </Typography>
                          <Chip
                            label={`터치 ${stat.touchCount}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 20 }}
                          />
                          <Chip
                            label={`돌파 ${stat.breakoutCount}`}
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 20 }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>

                  {/* 미니차트 */}
                  <Box sx={{ height: 120, mt: 0.5 }}>
                    <ReactApexChart
                      type="line"
                      series={chartSeries}
                      options={chartOpts}
                      height={120}
                    />
                  </Box>
                </Stack>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
