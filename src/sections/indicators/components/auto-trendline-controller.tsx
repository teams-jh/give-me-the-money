'use client';

import type { UseChartIndicatorsReturn } from 'src/sections/indicators/hooks/use-chart-indicators';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

// ----------------------------------------------------------------------

interface Props {
  indicators: UseChartIndicatorsReturn;
}

export function AutoTrendlineController({ indicators }: Props) {
  const theme = useTheme() as any;

  const {
    showAutoTrend,
    setShowAutoTrend,
    trendBase,
    setTrendBase,
    trendAlgo,
    setTrendAlgo,
    zigzagThreshold,
    setZigzagThreshold,
    regressionStdDev,
    setRegressionStdDev,
    lineCurve,
    setLineCurve,
  } = indicators;

  return (
    <Grid size={{ xs: 12 }}>
      <Card
        sx={{
          p: 3,
          boxShadow:
            theme.customShadows?.card || `0 4px 16px 0 ${alpha(theme.palette.common.black, 0.04)}`,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.neutral || theme.palette.grey[100], 0.8)} 100%)`,
        }}
      >
        <Stack spacing={3}>
          {/* Header & Main Toggle */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                ✨ 실시간 자동 추세선 설정 (Auto Trendline Controller)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                화면에 노출된 캔들 범위 내에서 수학적 알고리즘을 통해 자동으로 최적의 지지선(Support)과
                저항선(Resistance)을 실시간 작도합니다.
              </Typography>
            </Box>
            <Box>
              <Chip
                label={showAutoTrend ? '자동 추세선 ON' : '자동 추세선 OFF'}
                color={showAutoTrend ? 'primary' : 'default'}
                onClick={() => setShowAutoTrend(!showAutoTrend)}
                sx={{
                  fontWeight: 800,
                  px: 2,
                  py: 2.2,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  borderRadius: 1.5,
                }}
              />
            </Box>
          </Stack>

          {showAutoTrend && (
            <Grid container spacing={3}>
              {/* 1. 기준 가격 선택 */}
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
                  🎯 분석 기준 가격 (Price Base)
                </Typography>
                <Stack direction="row" spacing={1}>
                  {(['highlow', 'close', 'open'] as const).map((base) => {
                    const labelMap = { highlow: '고점/저점', close: '종가 기준', open: '시가 기준' };
                    const isActive = trendBase === base;
                    return (
                      <Chip
                        key={base}
                        label={labelMap[base]}
                        color={isActive ? 'primary' : 'default'}
                        variant={isActive ? 'filled' : 'outlined'}
                        onClick={() => setTrendBase(base)}
                        sx={{ fontWeight: isActive ? 700 : 500, flex: 1, cursor: 'pointer' }}
                      />
                    );
                  })}
                </Stack>
              </Grid>

              {/* 2. 알고리즘 선택 */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
                  ⚙️ 추세 분석 알고리즘 (Algorithm)
                </Typography>
                <Stack direction="row" spacing={1}>
                  {(['swing', 'zigzag', 'regression'] as const).map((algo) => {
                    const labelMap = {
                      swing: '스윙 극점 연결',
                      zigzag: '지그재그 반전',
                      regression: '선형회귀 채널',
                    };
                    const isActive = trendAlgo === algo;
                    return (
                      <Chip
                        key={algo}
                        label={labelMap[algo]}
                        color={isActive ? 'warning' : 'default'}
                        variant={isActive ? 'filled' : 'outlined'}
                        onClick={() => setTrendAlgo(algo)}
                        sx={{ fontWeight: isActive ? 700 : 500, flex: 1, cursor: 'pointer' }}
                      />
                    );
                  })}
                </Stack>
              </Grid>

              {/* 3. 작도 선 스타일 선택 */}
              <Grid size={{ xs: 12, md: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
                  📈 선 스타일 (Style)
                </Typography>
                <Stack direction="row" spacing={1}>
                  {([
                    { key: 'straight', label: '직선' },
                    { key: 'smooth', label: '곡선' },
                  ] as const).map((style) => {
                    const isActive = lineCurve === style.key;
                    return (
                      <Chip
                        key={style.key}
                        label={style.label}
                        color={isActive ? 'info' : 'default'}
                        variant={isActive ? 'filled' : 'outlined'}
                        onClick={() => setLineCurve(style.key)}
                        sx={{ fontWeight: isActive ? 700 : 500, flex: 1, cursor: 'pointer' }}
                      />
                    );
                  })}
                </Stack>
              </Grid>

              {/* 4. 알고리즘 상세 파라미터 튜닝 */}
              <Grid size={{ xs: 12, md: 3 }}>
                {trendAlgo === 'zigzag' && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
                      ⚡ 지그재그 반전 비율:{' '}
                      <span style={{ color: theme.palette.warning.main }}>{zigzagThreshold}%</span>
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={zigzagThreshold}
                        onChange={(e) => setZigzagThreshold(Number(e.target.value))}
                        style={{
                          width: '100%',
                          cursor: 'pointer',
                          accentColor: theme.palette.warning.main,
                        }}
                      />
                    </Stack>
                  </Box>
                )}

                {trendAlgo === 'regression' && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
                      ⚡ 표준편차 채널 배수:{' '}
                      <span style={{ color: theme.palette.warning.main }}>
                        {regressionStdDev.toFixed(1)}x
                      </span>
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <input
                        type="range"
                        min="1.0"
                        max="3.0"
                        step="0.1"
                        value={regressionStdDev}
                        onChange={(e) => setRegressionStdDev(Number(e.target.value))}
                        style={{
                          width: '100%',
                          cursor: 'pointer',
                          accentColor: theme.palette.warning.main,
                        }}
                      />
                    </Stack>
                  </Box>
                )}

                {trendAlgo === 'swing' && (
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}
                    >
                      ⚡ 스윙 극점 필터링
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      화면 내 스윙 고점과 저점 상위극점을 연결하여 안정적인 수평 채널을 확인합니다.
                    </Typography>
                  </Box>
                )}
              </Grid>
            </Grid>
          )}
        </Stack>
      </Card>
    </Grid>
  );
}
