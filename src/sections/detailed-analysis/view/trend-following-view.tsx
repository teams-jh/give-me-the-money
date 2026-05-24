'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';

export function TrendFollowingView() {
  const theme = useTheme();

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4} sx={{ minHeight: '65vh', justifyContent: 'center', alignItems: 'center' }}>
        <Card
          sx={{
            p: 5,
            width: '100%',
            maxWidth: 600,
            textAlign: 'center',
            boxShadow: theme.customShadows?.card,
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(
              theme.palette.background.neutral,
              0.9
            )} 100%)`,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Radial Glows */}
          <Box
            sx={{
              position: 'absolute',
              top: '-20%',
              left: '-20%',
              width: '60%',
              height: '60%',
              background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 80%)`,
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: '-20%',
              right: '-20%',
              width: '60%',
              height: '60%',
              background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.1)} 0%, transparent 80%)`,
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />

          <Stack spacing={4} sx={{ position: 'relative', zIndex: 1 }}>
            <Box
              sx={{
                width: 90,
                height: 90,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 48,
                mx: 'auto',
                boxShadow: `0 0 20px ${alpha(theme.palette.primary.main, 0.15)}`,
                animation: 'pulse 2.5s infinite ease-in-out',
                '@keyframes pulse': {
                  '0%': { transform: 'scale(1)', boxShadow: `0 0 20px ${alpha(theme.palette.primary.main, 0.15)}` },
                  '50%': { transform: 'scale(1.08)', boxShadow: `0 0 35px ${alpha(theme.palette.primary.main, 0.3)}` },
                  '100%': { transform: 'scale(1)', boxShadow: `0 0 20px ${alpha(theme.palette.primary.main, 0.15)}` },
                },
              }}
            >
              📈
            </Box>

            <Stack spacing={1}>
              <Typography variant="h3" sx={{ fontWeight: 800, tracking: -1 }}>
                추세 추종 전략 분석 🚀
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', px: 2 }}>
                시장 트렌드를 감지하여 모멘텀이 강화되는 주식을 선별하고 백테스팅하는 시뮬레이터입니다.
              </Typography>
            </Stack>

            <Box
              sx={{
                py: 2.5,
                px: 3,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                borderRadius: 2,
                border: `1px dashed ${alpha(theme.palette.primary.main, 0.25)}`,
              }}
            >
              <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 800 }}>
                ⏳ 기능 준비 중입니다
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.8, lineHeight: 1.5 }}>
                추세 모멘텀 강도 계산, 이동평균선 크로스오버 골든/데드크로스, RSI 및 스토캐스틱 기반 백테스팅 시뮬레이션 기능이 추가될 예정입니다.
              </Typography>
            </Box>

            <Button
              id="back-to-periodic"
              variant="contained"
              color="primary"
              size="large"
              href="/detailed-analysis/periodic"
              sx={{ borderRadius: 1.5, fontWeight: 700, py: 1.5 }}
            >
              적립식 투자 시뮬레이션 보러 가기
            </Button>
          </Stack>
        </Card>
      </Stack>
    </DashboardContent>
  );
}
