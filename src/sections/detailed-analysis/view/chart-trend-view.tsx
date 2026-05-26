'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

export function ChartTrendView() {
  const theme = useTheme() as any;

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
              차트 추세 분석 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              다양한 기술적 지표와 패턴 매칭을 통해 차트의 추세를 심층 분석합니다.
            </Typography>
          </Box>
        </Stack>

        <Card
          sx={{
            p: 5,
            textAlign: 'center',
            boxShadow: theme.customShadows?.card,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -50,
              right: -50,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
              filter: 'blur(30px)',
            }}
          />

          <Stack spacing={3} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                mb: 1,
              }}
            >
              <ShowChartRoundedIcon sx={{ width: 40, height: 40 }} />
            </Box>

            <Stack spacing={1}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                차트 추세 분석 서비스 준비 중 🚀
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto', lineHeight: 1.6 }}
              >
                지표 기반 추세 스캔, 거래량 분석, 캔들 패턴 매칭 등 한층 더 스마트한
                차트 추세 분석 솔루션이 곧 제공될 예정입니다.
              </Typography>
            </Stack>

            <Button variant="contained" size="large" sx={{ px: 4, borderRadius: 1.5, fontWeight: 700 }}>
              알림 신청하기
            </Button>
          </Stack>
        </Card>

        <Typography variant="h6" sx={{ fontWeight: 700, mt: 2 }}>
          💡 주요 제공 예정 기능
        </Typography>

        <Grid container spacing={3}>
          {[
            {
              icon: <AutoAwesomeRoundedIcon sx={{ width: 28, height: 28 }} />,
              title: 'AI 추세 예측 모형',
              description: '머신러닝 알고리즘을 기반으로 향후 주가 추세의 전환점을 감지하고 확률적 방향성을 예측합니다.',
            },
            {
              icon: <QueryStatsRoundedIcon sx={{ width: 28, height: 28 }} />,
              title: '복합 기술적 지표 필터',
              description: 'RSI, MACD, Stochastic 등 다채로운 보조지표의 골든/데드크로스 조건 조합을 실시간으로 스캔합니다.',
            },
            {
              icon: <AccountBalanceWalletRoundedIcon sx={{ width: 28, height: 28 }} />,
              title: '리스크 관리 시뮬레이션',
              description: '자산 대비 최적의 손절선(Stop-loss) 및 익절 목표가를 동적으로 설정하여 자산 방어율을 제고합니다.',
            },
          ].map((item, index) => (
            <Grid key={index} size={{ xs: 12, md: 4 }}>
              <Card
                sx={{
                  p: 3.5,
                  height: 1,
                  boxShadow: theme.customShadows?.card,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: theme.customShadows?.z8 || theme.shadows[8],
                  },
                }}
              >
                <Stack spacing={2.5}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      color: 'primary.main',
                    }}
                  >
                    {item.icon}
                  </Box>

                  <Stack spacing={1}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                      {item.description}
                    </Typography>
                  </Stack>
                </Stack>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Stack>
    </DashboardContent>
  );
}
