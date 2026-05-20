'use client';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import LinearProgress from '@mui/material/LinearProgress';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import WorkRoundedIcon from '@mui/icons-material/WorkRounded';
// Icons
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import CurrencyExchangeRoundedIcon from '@mui/icons-material/CurrencyExchangeRounded';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

interface MacroIndicatorCardProps {
  title: string;
  value: string;
  change: string;
  isUp: boolean;
  category: string;
  icon: React.ReactNode;
  impact: 'High' | 'Medium' | 'Low';
  description: string;
  correlation: string;
}

export function MacroIndicatorsView() {
  const theme = useTheme();

  // FOMC Simulation State
  const [interestRate, setInterestRate] = useState<number>(5.25);

  const getFomcImpact = (rate: number) => {
    if (rate >= 5.5) {
      return {
        label: '매파적 (Hawkish) 긴축 지속 🦅',
        stocks: '부정적 (성장주 및 기술주 하락 압력 증가)',
        bonds: '국채 금리 상승 (채권 가격 하락)',
        krw: '원화 약세 / 달러 강세 압력 심화',
        color: theme.palette.error.main,
      };
    }
    if (rate <= 4.5) {
      return {
        label: '비둘기파적 (Dovish) 완화 전환 🕊️',
        stocks: '매우 긍정적 (유동성 유입으로 기술주 급등 호재)',
        bonds: '국채 금리 하락 (채권 가격 급등)',
        krw: '원화 강세 / 달러 약세 안정화',
        color: theme.palette.success.main,
      };
    }
    return {
      label: '중립적 (Neutral) 금리 유지 ⚖️',
      stocks: '중립 (시장 예측 부합으로 변동성 감소)',
      bonds: '안정세 유지 (기간별 혼조세)',
      krw: '원/달러 환율 1,300원 초반대 횡보',
      color: theme.palette.warning.main,
    };
  };

  const fomcImpact = getFomcImpact(interestRate);

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        {/* Header Section */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            글로벌 매크로 지표 분석 🌍
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            금리, 환율, 인플레이션(CPI), 고용 등 주식 시장에 강력한 영향을 미치는 거시 경제 지표들의 실시간 상태 및 상호 작용을 시뮬레이션합니다.
          </Typography>
        </Box>

        {/* Global Macro Summary Banner */}
        <Card
          sx={{
            p: 4,
            background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.light, 0.12)} 0%, ${alpha(theme.palette.primary.light, 0.08)} 100%)`,
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.15)}`,
            boxShadow: `0 8px 32px 0 ${alpha(theme.palette.common.black, 0.05)}`,
            backdropFilter: 'blur(8px)',
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative absolute glow */}
          <Box
            sx={{
              position: 'absolute',
              right: -30,
              bottom: -30,
              width: 250,
              height: 250,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.15)} 0%, transparent 70%)`,
              filter: 'blur(40px)',
            }}
          />

          <Grid container spacing={3} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
            <Grid item xs={12} md={9}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Chip
                  label="매크로 리스크 지수"
                  color="secondary"
                  variant="filled"
                  sx={{ fontWeight: 700, borderRadius: 1 }}
                />
                <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                  현재 리스크 단계: <b>안정 (Moderate)</b>
                </Typography>
              </Stack>

              <Typography variant="h3" sx={{ fontWeight: 900, mb: 1, color: 'text.primary' }}>
                인플레이션 둔화 조짐 속 금리 동결 📉
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary', maxW: 750 }}>
                최근 발표된 CPI 지수가 예상치에 부합하며 연준의 금리 인상 사이클이 사실상 종료된 것으로 시장은 해석하고 있습니다. 다만 긴축 기조의 장기화 가능성이 여전히 잔존하여 외국인 자본 유출입 변동성을 예의주시할 필요가 있습니다.
              </Typography>
            </Grid>

            <Grid item xs={12} md={3}>
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
                  매크로 종합 센티먼트
                </Typography>
                <Typography variant="h2" sx={{ fontWeight: 900, color: theme.palette.info.main, my: 1 }}>
                  65%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={65}
                  color="info"
                  sx={{ width: '100%', height: 8, borderRadius: 4, mb: 2 }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  성장 친화도 지수 (100%에 가까울수록 활황)
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Card>

        {/* Two Columns Section */}
        <Grid container spacing={4}>
          {/* FOMC Rate Simulator (Left side) */}
          <Grid item xs={12} lg={5}>
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
                    <SavingsRoundedIcon color="secondary" />
                    미국 기준금리(FFR) 가상 시나리오
                  </Typography>
                  <Tooltip title="기준금리 수준에 따른 금융 시장(주식, 채권, 환율)의 예상 반응을 미리 확인합니다.">
                    <IconButton size="small">
                      <InfoRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                {/* Rate Controller Slider */}
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      시뮬레이션 FFR 금리: {interestRate.toFixed(2)}%
                    </Typography>
                    <Chip
                      label={fomcImpact.label}
                      sx={{
                        fontWeight: 800,
                        color: fomcImpact.color,
                        bgcolor: alpha(fomcImpact.color, 0.08),
                        fontSize: '0.75rem',
                      }}
                    />
                  </Stack>
                  <Slider
                    value={interestRate}
                    onChange={(e, val) => setInterestRate(val as number)}
                    min={3.5}
                    max={6.0}
                    step={0.25}
                    marks={[
                      { value: 3.5, label: '3.5%' },
                      { value: 4.5, label: '4.5%' },
                      { value: 5.25, label: '현재 (5.25%)' },
                      { value: 6.0, label: '6.0%' },
                    ]}
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* Forecast Matrix based on Simulated Interest Rate */}
                <Box sx={{ bgcolor: alpha(theme.palette.grey[500], 0.03), p: 2.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    📊 시장 부문별 가상 시그널
                  </Typography>

                  <Stack spacing={2.5}>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 0.5 }}>
                        1. 주식 시장 (Stock Markets)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {fomcImpact.stocks}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 0.5 }}>
                        2. 채권 시장 / 금리 (Bond Yields)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {fomcImpact.bonds}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 0.5 }}>
                        3. 환율 (USD / KRW)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {fomcImpact.krw}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Stack>
            </Card>
          </Grid>

          {/* Macro Indicator Grid (Right side) */}
          <Grid item xs={12} lg={7}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <MacroCard
                  title="미국 기준금리 (Fed Rate)"
                  value="5.25% - 5.50%"
                  change="0.00%p"
                  isUp={false}
                  category="MONETARY POLICY"
                  impact="High"
                  description="미국 연방준비제도(Fed)에서 결정하는 전세계 유동성의 핵심 지표입니다. 현재 고금리 동결 기조가 이어지고 있습니다."
                  correlation="금리 인상 ➡️ 유동성 흡수 및 밸류에이션 부담 ➡️ 성장주 약세 야기"
                  icon={<SavingsRoundedIcon sx={{ fontSize: 24 }} />}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <MacroCard
                  title="원/달러 환율 (USD/KRW)"
                  value="1,350.50 원"
                  change="+4.20 원"
                  isUp
                  category="CURRENCY EXCHANGE"
                  impact="High"
                  description="원화 대비 미국 달러의 가치입니다. 미국 금리 동결 장기화 및 대외 불안정성에 의해 상승 압력을 받고 있습니다."
                  correlation="환율 상승 ➡️ 외국인 매도 압력 상승 ➡️ 국내 코스피/코스닥 지수 하락"
                  icon={<CurrencyExchangeRoundedIcon sx={{ fontSize: 24 }} />}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <MacroCard
                  title="소비자물가지수 (US CPI)"
                  value="3.4 %"
                  change="-0.1 %"
                  isUp={false}
                  category="INFLATION"
                  impact="High"
                  description="소비자가 구입하는 상품과 서비스의 가격 변동을 나타내는 대표적인 인플레이션 척도로서, 연준의 통화 정책 방향을 결정합니다."
                  correlation="CPI 안정 ➡️ 금리 인하 기대감 조성 ➡️ 성장주 및 기술주 지수 상승 호재"
                  icon={<PublicRoundedIcon sx={{ fontSize: 24 }} />}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <MacroCard
                  title="실업률 (Unemployment Rate)"
                  value="3.9 %"
                  change="+0.1 %"
                  isUp
                  category="LABOR MARKET"
                  impact="Medium"
                  description="경제 활동 인구 중 일자리가 없는 인구의 비율로, 노동시장의 과열 정도를 가늠하는 결정적 지표 중 하나입니다."
                  correlation="적절한 실업률 상승 ➡️ 노동시장 과열 완화 ➡️ 금리 조기 인하 가능성 자극"
                  icon={<WorkRoundedIcon sx={{ fontSize: 24 }} />}
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
function MacroCard({ title, value, change, isUp, category, icon, impact, description, correlation }: MacroIndicatorCardProps) {
  const theme = useTheme();

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
          borderColor: theme.palette.secondary.main,
        },
      }}
    >
      <Stack spacing={2} sx={{ height: '100%' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800 }}>
            {category}
          </Typography>
          <Chip
            label={`영향력: ${impact}`}
            size="small"
            color={impact === 'High' ? 'error' : impact === 'Medium' ? 'warning' : 'default'}
            sx={{ fontWeight: 800, height: 20, fontSize: '0.68rem', borderRadius: 0.5 }}
          />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              p: 1.5,
              bgcolor: alpha(theme.palette.secondary.main, 0.08),
              color: theme.palette.secondary.main,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
              {title}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {value}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: isUp ? 'error.main' : change === '0.00%p' ? 'text.disabled' : 'success.main',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {isUp ? <TrendingUpRoundedIcon sx={{ fontSize: 14, mr: 0.2 }} /> : <TrendingDownRoundedIcon sx={{ fontSize: 14, mr: 0.2 }} />}
                {change}
              </Typography>
            </Stack>
          </Box>
        </Stack>

        <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1, lineHeight: 1.5 }}>
          {description}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ p: 1.5, bgcolor: alpha(theme.palette.secondary.main, 0.03), borderRadius: 1, borderLeft: `3px solid ${theme.palette.secondary.main}` }}>
          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }}>
            <b>시장 영향:</b> {correlation}
          </Typography>
        </Stack>
      </Stack>
    </Card>
  );
}
