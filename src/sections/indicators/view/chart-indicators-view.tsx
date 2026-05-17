'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Slider from '@mui/material/Slider';
import LinearProgress from '@mui/material/LinearProgress';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';

// Icons
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

interface IndicatorCardProps {
  title: string;
  subtitle: string;
  status: 'Bullish' | 'Bearish' | 'Neutral';
  score: number;
  description: string;
  formula: string;
}

export function ChartIndicatorsView() {
  const theme = useTheme();

  // State for interactive widgets
  const [rsiValue, setRsiValue] = useState<number>(58);
  const [maPeriod, setMaPeriod] = useState<number>(20);
  const [alertEnabled, setAlertEnabled] = useState<boolean>(true);

  // Status computation for RSI
  const getRsiStatus = (val: number): { label: string; color: 'success' | 'warning' | 'error' } => {
    if (val >= 70) return { label: '과매수 (Overbought) ⚠️', color: 'error' };
    if (val <= 30) return { label: '과매도 (Oversold) 🟢', color: 'success' };
    return { label: '중립 (Neutral) ⚖️', color: 'warning' };
  };

  const rsiStatus = getRsiStatus(rsiValue);

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        {/* Header Section */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            차트 기술적 지표 분석 📈
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            이동평균선, RSI, MACD, 볼린저 밴드 등 주요 기술적 지표의 상태를 실시간으로 스캔하고 모니터링합니다.
          </Typography>
        </Box>

        {/* Premium Overview Stats Banner */}
        <Card
          sx={{
            p: 4,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.15)} 0%, ${alpha(theme.palette.info.light, 0.1)} 100%)`,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            boxShadow: `0 8px 32px 0 ${alpha(theme.palette.common.black, 0.05)}`,
            backdropFilter: 'blur(8px)',
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative absolute element */}
          <Box
            sx={{
              position: 'absolute',
              right: -50,
              top: -50,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
              filter: 'blur(30px)',
            }}
          />

          <Grid container spacing={3} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
            <Grid item xs={12} md={8}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Chip
                  label="실시간 지표 종합 점수"
                  color="primary"
                  variant="filled"
                  sx={{ fontWeight: 700, borderRadius: 1 }}
                />
                <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                  최종 업데이트: 방금 전
                </Typography>
              </Stack>

              <Typography variant="h3" sx={{ fontWeight: 900, mb: 1, color: 'text.primary' }}>
                강력한 매수 신호 감지 🚀
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary', maxW: 600 }}>
                현재 단기 이동평균선 골든크로스 및 RSI 지수가 안정적인 상승 모멘텀 영역에 도달했습니다. MACD 시그널의 골든크로스가 임박하여 긍정적인 추세 전환이 예상됩니다.
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Stack
                direction="column"
                alignItems="center"
                justifyContent="center"
                sx={{
                  p: 3,
                  bgcolor: alpha(theme.palette.background.paper, 0.8),
                  borderRadius: 2,
                  boxShadow: `0 4px 20px 0 ${alpha(theme.palette.common.black, 0.03)}`,
                  border: `1px solid ${theme.palette.divider}`,
                  textAlign: 'center',
                }}
              >
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
                  종합 모멘텀 점수
                </Typography>
                <Typography variant="h2" sx={{ fontWeight: 900, color: theme.palette.success.main, my: 1 }}>
                  82 / 100
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={82}
                  color="success"
                  sx={{ width: '100%', height: 8, borderRadius: 4, mb: 2 }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  총 12가지 기술적 모델 분석 결과
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Card>

        {/* Multi-column Layout: Interactive Simulator & Indicator Cards */}
        <Grid container spacing={4}>
          {/* Interactive technical playground (Left column) */}
          <Grid item xs={12} lg={4}>
            <Card
              sx={{
                p: 3,
                height: '100%',
                border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                boxShadow: theme.customShadows?.card || `0 2px 12px 0 ${alpha(theme.palette.common.black, 0.03)}`,
              }}
            >
              <Stack spacing={4}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <QueryStatsRoundedIcon color="primary" />
                    지표 모듈 시뮬레이터
                  </Typography>
                  <Tooltip title="지표 변수를 직접 변경하여 모니터링 강도를 조절합니다.">
                    <IconButton size="small">
                      <InfoRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                {/* RSI Controller */}
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      RSI 임계값 테스트 (현재: {rsiValue})
                    </Typography>
                    <Chip
                      label={rsiStatus.label}
                      color={rsiStatus.color}
                      size="small"
                      sx={{ fontWeight: 800, fontSize: '0.75rem' }}
                    />
                  </Stack>
                  <Slider
                    value={rsiValue}
                    onChange={(e, val) => setRsiValue(val as number)}
                    min={10}
                    max={90}
                    step={1}
                    valueLabelDisplay="auto"
                    sx={{
                      color: rsiValue >= 70 ? theme.palette.error.main : rsiValue <= 30 ? theme.palette.success.main : theme.palette.warning.main,
                    }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    RSI 지수가 30 이하일 시 과매도 영역(매수 기회), 70 이상일 시 과매수 영역(매도 고려)으로 스캔됩니다.
                  </Typography>
                </Box>

                <hr style={{ border: 0, borderTop: `1px solid ${theme.palette.divider}`, margin: 0 }} />

                {/* Moving Average Configurator */}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                    이동평균(MA) 분석 기간 (현재: {maPeriod}일)
                  </Typography>
                  <Slider
                    value={maPeriod}
                    onChange={(e, val) => setMaPeriod(val as number)}
                    min={5}
                    max={200}
                    step={5}
                    marks={[
                      { value: 5, label: '5일' },
                      { value: 20, label: '20일' },
                      { value: 60, label: '60일' },
                      { value: 120, label: '120일' },
                      { value: 200, label: '200일' },
                    ]}
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 2 }}>
                    현재 선택된 {maPeriod}일 이동평균선은 단/장기 이격도 및 추세지지 라인을 도출하는 데 최적화되어 있습니다.
                  </Typography>
                </Box>

                <hr style={{ border: 0, borderTop: `1px solid ${theme.palette.divider}`, margin: 0 }} />

                {/* Alert Switch */}
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={alertEnabled}
                        onChange={(e) => setAlertEnabled(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        기술적 특이 신호 즉시 알림 받기
                      </Typography>
                    }
                  />
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.04), borderRadius: 1 }}>
                    <NotificationsActiveRoundedIcon color={alertEnabled ? 'primary' : 'disabled'} fontSize="small" />
                    <Typography variant="caption" sx={{ color: alertEnabled ? 'primary.main' : 'text.disabled', fontWeight: 600 }}>
                      {alertEnabled ? '모든 골든크로스/과매수 신호가 알림창에 브로드캐스트됩니다.' : '알림 발송이 일시중지되었습니다.'}
                    </Typography>
                  </Stack>
                </Box>
              </Stack>
            </Card>
          </Grid>

          {/* Indicator Cards List (Right column) */}
          <Grid item xs={12} lg={8}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <IndicatorCard
                  title="이동평균선 (SMA / EMA)"
                  subtitle="Simple & Exponential Moving Average"
                  status="Bullish"
                  score={85}
                  description="추세를 식별하고 지지 및 저항 수준을 식별하기 위해 가장 널리 사용되는 지표입니다. 5일/20일 단기 이평선이 60일/120일 장기 이평선을 뚫고 올라가는 골든크로스가 발생하였습니다."
                  formula="SMA = (P1 + P2 + ... + Pn) / n"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <IndicatorCard
                  title="상대강도지수 (RSI)"
                  subtitle="Relative Strength Index"
                  status="Neutral"
                  score={60}
                  description="가격의 상승 압력과 하락 압력 간의 상대적인 강도를 백분율로 나타내어 과매수 및 과매도 상태를 나타냅니다. 현재 중립(Neutral) 상태에 가깝습니다."
                  formula="RSI = 100 - [100 / (1 + RS)]"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <IndicatorCard
                  title="MACD"
                  subtitle="Moving Average Convergence Divergence"
                  status="Bullish"
                  score={75}
                  description="단기 이동평균선과 장기 이동평균선 사이의 관계를 보여주는 추세 추종형 모멘텀 지표입니다. 시그널 라인 돌파가 시작되어 매수 우세 시그널을 출력하고 있습니다."
                  formula="MACD Line = EMA(12) - EMA(26)"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <IndicatorCard
                  title="볼린저 밴드 (Bollinger Bands)"
                  subtitle="Volatility Bands"
                  status="Neutral"
                  score={50}
                  description="이동평균선을 중심으로 표준편차 범위를 밴드화하여 가격 변동 폭을 분석합니다. 현재 변동성 수축 기간을 지나며 밴드 상단을 테스트하고 있습니다."
                  formula="Upper Band = SMA + 2*StdDev"
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Stack>
    </DashboardContent>
  );
}

// Helper Card Component
function IndicatorCard({ title, subtitle, status, score, description, formula }: IndicatorCardProps) {
  const theme = useTheme();

  const getStatusStyle = (type: 'Bullish' | 'Bearish' | 'Neutral') => {
    switch (type) {
      case 'Bullish':
        return { label: '강세 (Bullish)', color: theme.palette.success.main, bg: alpha(theme.palette.success.main, 0.08) };
      case 'Bearish':
        return { label: '약세 (Bearish)', color: theme.palette.error.main, bg: alpha(theme.palette.error.main, 0.08) };
      default:
        return { label: '중립 (Neutral)', color: theme.palette.warning.main, bg: alpha(theme.palette.warning.main, 0.08) };
    }
  };

  const statusStyle = getStatusStyle(status);

  return (
    <Card
      sx={{
        p: 3,
        height: '100%',
        border: `1px solid ${theme.palette.divider}`,
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 24px -4px ${alpha(theme.palette.common.black, 0.06)}`,
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      <Stack spacing={2} sx={{ height: '100%' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {title}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
              {subtitle}
            </Typography>
          </Box>
          <Chip
            label={statusStyle.label}
            sx={{
              fontWeight: 800,
              color: statusStyle.color,
              bgcolor: statusStyle.bg,
              borderRadius: 1,
              fontSize: '0.75rem',
            }}
          />
        </Stack>

        <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1, lineHeight: 1.6 }}>
          {description}
        </Typography>

        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.04), borderRadius: 1 }}>
          <ShowChartRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.75rem' }}>
            수식: {formula}
          </Typography>
        </Stack>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
            모멘텀 지지도
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 800, color: statusStyle.color }}>
              {score}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={score}
              sx={{
                width: 60,
                height: 6,
                borderRadius: 3,
                bgcolor: alpha(statusStyle.color, 0.1),
                '& .MuiLinearProgress-bar': {
                  bgcolor: statusStyle.color,
                },
              }}
            />
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}
