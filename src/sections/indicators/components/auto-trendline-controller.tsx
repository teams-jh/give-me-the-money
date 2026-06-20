'use client';

import type { UseChartIndicatorsReturn } from 'src/sections/indicators/hooks/use-chart-indicators';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import CircularProgress from '@mui/material/CircularProgress';

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
    trendTouchTolerance,
    setTrendTouchTolerance,
    trendBreakoutTolerance,
    setTrendBreakoutTolerance,
    runSimulation,
    isSimulating,
    trendTouchBasis,
    setTrendTouchBasis,
    trendStartDate,
    setTrendStartDate,
    trendEndDate,
    setTrendEndDate,
    startDate,
    endDate,
    activeStockDataSlice,
  } = indicators;

  const minDate = activeStockDataSlice?.dates[0] || startDate;
  const maxDate = activeStockDataSlice?.dates[activeStockDataSlice.dates.length - 1] || endDate;

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
                화면에 노출된 캔들 범위 내에서 수학적 알고리즘을 통해 자동으로 최적의
                지지선(Support)과 저항선(Resistance)을 실시간 작도합니다.
                {showAutoTrend && (
                  <span
                    style={{
                      marginLeft: '8px',
                      display: 'inline-flex',
                      gap: '8px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ color: theme.palette.text.secondary, fontWeight: 500 }}>|</span>
                    <span style={{ color: theme.palette.error.main, fontWeight: 800 }}>
                      🔴 종가 (터치: {indicators.dynamicLines?.closeTouchCount ?? 0}회, 돌파:{' '}
                      {indicators.dynamicLines?.closeBreakoutCount ?? 0}회)
                    </span>
                    <span style={{ color: theme.palette.warning.main, fontWeight: 800 }}>
                      🟠 고가 (터치: {indicators.dynamicLines?.highTouchCount ?? 0}회, 돌파:{' '}
                      {indicators.dynamicLines?.highBreakoutCount ?? 0}회)
                    </span>
                    <span style={{ color: theme.palette.primary.main, fontWeight: 800 }}>
                      ✨ 총합 (터치: {indicators.dynamicLines?.touchCount ?? 0}회, 돌파:{' '}
                      {indicators.dynamicLines?.breakoutCount ?? 0}회)
                    </span>
                  </span>
                )}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
              {showAutoTrend && (
                <Button
                  variant="contained"
                  color="warning"
                  onClick={runSimulation}
                  disabled={isSimulating}
                  startIcon={
                    isSimulating ? <CircularProgress size={16} color="inherit" /> : undefined
                  }
                  sx={{
                    fontWeight: 800,
                    px: 2.5,
                    py: 1,
                    fontSize: '0.875rem',
                    borderRadius: 1.5,
                    boxShadow: theme.customShadows?.z8,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSimulating ? '시뮬레이션 중...' : '📊 전체 종목 시뮬레이션'}
                </Button>
              )}
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
                  whiteSpace: 'nowrap',
                }}
              />
            </Stack>
          </Stack>

          {showAutoTrend && (
            <Grid container spacing={3}>
              {/* Left Column (Selections and Date Range) */}
              <Grid size={{ xs: 12, md: 9 }}>
                <Grid container spacing={3}>
                  {/* 1. 기준 가격 선택 */}
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}
                    >
                      🎯 분석 기준 가격 (Price Base)
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      {(['highlow', 'close', 'open'] as const).map((base) => {
                        const labelMap = {
                          highlow: '고점/저점',
                          close: '종가 기준',
                          open: '시가 기준',
                        };
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
                  <Grid size={{ xs: 12, md: 5.5 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}
                    >
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
                  <Grid size={{ xs: 12, md: 2.5 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}
                    >
                      📈 선 스타일 (Style)
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      {(
                        [
                          { key: 'straight', label: '직선' },
                          { key: 'smooth', label: '곡선' },
                        ] as const
                      ).map((style) => {
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

                  {/* Date Selection for Trendline */}
                  <Grid size={{ xs: 12 }}>
                    <Card
                      sx={{
                        p: 2.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                        border: `1px dashed ${alpha(theme.palette.primary.main, 0.2)}`,
                        borderRadius: 1.5,
                        mt: 1,
                      }}
                    >
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={3}
                        alignItems={{ xs: 'stretch', md: 'center' }}
                        justifyContent="space-between"
                      >
                        <Box>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 800,
                              color: 'primary.main',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            📅 실시간 추세선 작도 범위 설정 (Trendline Date Range)
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
                          >
                            추세선을 연산할 날짜 범위를 선택합니다. 기본값은 분석 기간의 마지막
                            영업일 하루 전까지입니다.
                          </Typography>
                        </Box>

                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={2}
                          alignItems="center"
                          sx={{ flexGrow: 1, maxWidth: { md: '60%' } }}
                        >
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ width: '100%' }}
                          >
                            <input
                              type="date"
                              value={trendStartDate}
                              min={minDate}
                              max={trendEndDate || maxDate}
                              onChange={(e) => setTrendStartDate(e.target.value)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${theme.palette.divider}`,
                                backgroundColor: theme.palette.background.paper,
                                color: theme.palette.text.primary,
                                fontFamily: theme.typography.fontFamily,
                                fontSize: '0.875rem',
                                flex: 1,
                                outline: 'none',
                              }}
                            />
                            <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5 }}>
                              ~
                            </Typography>
                            <input
                              type="date"
                              value={trendEndDate}
                              min={trendStartDate || minDate}
                              max={maxDate}
                              onChange={(e) => setTrendEndDate(e.target.value)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${theme.palette.divider}`,
                                backgroundColor: theme.palette.background.paper,
                                color: theme.palette.text.primary,
                                fontFamily: theme.typography.fontFamily,
                                fontSize: '0.875rem',
                                flex: 1,
                                outline: 'none',
                              }}
                            />
                          </Stack>
                          <Button
                            size="medium"
                            variant="outlined"
                            onClick={() => {
                              if (activeStockDataSlice && activeStockDataSlice.dates.length > 0) {
                                const dates = activeStockDataSlice.dates;
                                setTrendStartDate(dates[0]);
                                if (dates.length >= 2) {
                                  setTrendEndDate(dates[dates.length - 2]);
                                } else {
                                  setTrendEndDate(dates[0]);
                                }
                              }
                            }}
                            sx={{
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              borderRadius: 1,
                              borderColor: theme.palette.primary.main,
                              color: theme.palette.primary.main,
                              '&:hover': {
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                borderColor: theme.palette.primary.main,
                              },
                            }}
                          >
                            기본값 복원
                          </Button>
                        </Stack>
                      </Stack>
                    </Card>
                  </Grid>
                </Grid>
              </Grid>

              {/* 4. 알고리즘 상세 파라미터 튜닝 */}
              <Grid size={{ xs: 12, md: 3 }}>
                <Stack spacing={2}>
                  {trendAlgo === 'zigzag' && (
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                      >
                        ⚡ 지그재그 반전 비율:{' '}
                        <span style={{ color: theme.palette.warning.main }}>
                          {zigzagThreshold}%
                        </span>
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
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                      >
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
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block' }}
                      >
                        화면 내 스윙 고점과 저점 상위극점을 연결하여 안정적인 수평 채널을
                        확인합니다.
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ mt: 1.5 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                    >
                      🎯 터치 인정 기준 (Touch Basis)
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      {(
                        [
                          { key: 'both', label: '종가+고가' },
                          { key: 'close', label: '종가만' },
                          { key: 'high', label: '고가만' },
                        ] as const
                      ).map((basis) => {
                        const isActive = trendTouchBasis === basis.key;
                        return (
                          <Chip
                            key={basis.key}
                            label={basis.label}
                            color={isActive ? 'warning' : 'default'}
                            variant={isActive ? 'filled' : 'outlined'}
                            onClick={() => setTrendTouchBasis(basis.key)}
                            size="small"
                            sx={{ fontWeight: isActive ? 700 : 500, flex: 1, cursor: 'pointer' }}
                          />
                        );
                      })}
                    </Stack>
                  </Box>

                  <Box>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                    >
                      📐 터치 인정 범위 (-a%):{' '}
                      <span style={{ color: theme.palette.warning.main }}>
                        -{trendTouchTolerance}%
                      </span>
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={trendTouchTolerance}
                        onChange={(e) => setTrendTouchTolerance(Number(e.target.value))}
                        style={{
                          width: '100%',
                          cursor: 'pointer',
                          accentColor: theme.palette.warning.main,
                        }}
                      />
                    </Stack>
                  </Box>

                  <Box>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}
                    >
                      📈 돌파 인정 범위 (+b%):{' '}
                      <span style={{ color: theme.palette.secondary.main }}>
                        +{trendBreakoutTolerance}%
                      </span>
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={trendBreakoutTolerance}
                        onChange={(e) => setTrendBreakoutTolerance(Number(e.target.value))}
                        style={{
                          width: '100%',
                          cursor: 'pointer',
                          accentColor: theme.palette.secondary.main,
                        }}
                      />
                    </Stack>
                  </Box>
                </Stack>
              </Grid>
            </Grid>
          )}
        </Stack>
      </Card>
    </Grid>
  );
}
