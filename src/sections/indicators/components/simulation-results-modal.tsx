'use client';

import type { SimResult, UseChartIndicatorsReturn } from 'src/sections/indicators/hooks/use-chart-indicators';

import { useState } from 'react';
import ChartApex from 'react-apexcharts';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import TablePagination from '@mui/material/TablePagination';

// ----------------------------------------------------------------------

interface Props {
  indicators: UseChartIndicatorsReturn;
}

export function SimulationResultsModal({ indicators }: Props) {
  const theme = useTheme() as any;
  const { showSimModal, setShowSimModal, simResults, handleTickerChange, market } = indicators;

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(6);

  const handleClose = () => {
    setShowSimModal(false);
    setPage(0);
  };

  const handleSelectTicker = (ticker: string, name: string) => {
    handleTickerChange({ ticker, name });
    handleClose();
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Get active subset of paginated simulation results
  const paginatedResults = simResults.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const getMiniChartOptions = (sim: SimResult) => {
    const annotations: any = { points: [] };

    // Push pre-calculated touch points
    sim.touchPoints.forEach((tp) => {
      const isClose = tp.priceType === 'close';
      const color = isClose ? theme.palette.error.main : theme.palette.warning.main;
      annotations.points.push({
        x: tp.x,
        y: tp.y,
        marker: {
          size: 5,
          fillColor: color,
          strokeColor: '#FFFFFF',
          strokeWidth: 1.5,
        },
      });
    });

    const highs = sim.prices.map((p) => p.high || p.close);
    const lows = sim.prices.map((p) => p.low || p.close);
    const maxVal = Math.max(...highs);
    const minVal = Math.min(...lows);
    const diff = maxVal - minVal;

    const yMin = minVal - (diff || minVal) * 0.05;
    const yMax = maxVal + (diff || maxVal) * 0.05;

    // Line curve options
    const lineCurve = indicators.lineCurve || 'straight';

    // Series types: candlestick, line, line
    const curves = ['straight', lineCurve, lineCurve];

    return {
      chart: {
        id: `mini-chart-${sim.ticker}`,
        sparkline: { enabled: true },
        background: 'transparent',
      },
      stroke: {
        curve: curves as any,
        width: [1, 2, 2],
        dashArray: [0, 4, 4],
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: theme.palette.error.main,
            downward: theme.palette.info.main,
          },
          wick: { useFillColor: true },
        },
      },
      annotations,
      xaxis: {
        type: 'datetime',
      },
      yaxis: {
        min: yMin,
        max: yMax,
      },
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
      },
      grid: {
        show: false,
      },
    };
  };

  const getMiniChartSeries = (sim: SimResult) => {
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

    if (indicators.trendAlgo === 'zigzag' && sim.zigzagData) {
      series.push({
        name: '지그재그 파동선',
        type: 'line',
        data: sim.zigzagData,
      });
    } else {
      if (sim.supportData) {
        series.push({
          name: '자동 지지선 (Support)',
          type: 'line',
          data: sim.supportData,
        });
      }
      if (sim.resistanceData) {
        series.push({
          name: '자동 저항선 (Resistance)',
          type: 'line',
          data: sim.resistanceData,
        });
      }
    }

    return series;
  };

  return (
    <Dialog
      open={showSimModal}
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          p: 3,
          bgcolor: 'background.paper',
          background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.neutral || theme.palette.grey[100], 0.7)} 100%)`,
        },
      }}
    >
      {/* Modal Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            📊 {market === 'US' ? '미국 주식' : '국내 주식'} 추세선 터치 종합 시뮬레이션
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            설정하신 파라미터(터치 오차 범위, 추세 기준, 분석 알고리즘)를 기반으로{' '}
            <strong>전체 {simResults.length}개 종목</strong>의 상단 저항선 터치 횟수를 계산하여 정렬한
            결과입니다.
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: 'text.secondary' }}>
          ✕
        </IconButton>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* Tickers ranked cards Grid */}
      <Grid container spacing={3}>
        {paginatedResults.map((sim, index) => {
          const rank = page * rowsPerPage + index + 1;
          const chartSeries = getMiniChartSeries(sim);
          const chartOptions = getMiniChartOptions(sim);
          const colors = ['#00E676', theme.palette.success.main, theme.palette.error.main];

          return (
            <Grid key={sim.ticker} size={{ xs: 12, md: 4 }}>
              <Card
                sx={{
                  p: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  boxShadow: theme.customShadows?.card,
                  background: theme.palette.background.paper,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: theme.customShadows?.z16,
                  },
                }}
              >
                {/* Card Top Information */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                  <Box sx={{ maxWidth: '65%' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip
                        label={`#${rank}`}
                        size="small"
                        color={rank <= 3 ? 'warning' : 'default'}
                        sx={{ fontWeight: 900, px: 0.5, borderRadius: 1 }}
                      />
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, noWrap: true }}>
                        {sim.name}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      코드: {sim.ticker}
                    </Typography>
                  </Box>

                  {/* Touch Badges */}
                  <Stack spacing={0.5} alignItems="flex-end">
                    <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 900 }}>
                      총 터치: {sim.touchCount}회
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>
                        종가:{sim.closeTouchCount}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        /
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
                        고가:{sim.highTouchCount}
                      </Typography>
                    </Stack>
                  </Stack>
                </Stack>

                {/* Sparkline Candlestick Chart */}
                <Box sx={{ height: 180, mb: 2, bgcolor: alpha(theme.palette.action.hover, 0.3), borderRadius: 1.5, p: 1 }}>
                  <ChartApex
                    options={chartOptions}
                    series={chartSeries}
                    type="line"
                    height="100%"
                    colors={colors}
                  />
                </Box>

                {/* Action button */}
                <Button
                  fullWidth
                  variant="outlined"
                  color="warning"
                  onClick={() => handleSelectTicker(sim.ticker, sim.name)}
                  sx={{
                    fontWeight: 700,
                    borderRadius: 1.5,
                    borderWidth: 1.5,
                    '&:hover': { borderWidth: 1.5 },
                  }}
                >
                  🔍 이 종목 차트 분석하기
                </Button>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Pagination Controller */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
        <TablePagination
          component="div"
          count={simResults.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[6, 12, 18]}
          labelRowsPerPage="페이지당 개수:"
          sx={{ border: 'none' }}
        />
      </Box>
    </Dialog>
  );
}
