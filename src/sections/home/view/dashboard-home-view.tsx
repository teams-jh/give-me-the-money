'use client';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import PieChartRoundedIcon from '@mui/icons-material/PieChartRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

export function DashboardHomeView() {
  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            안녕하세요, 투자자님! 👋
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            오늘의 시장 흐름과 포트폴리오 성과를 확인해보세요.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Summary Card 1 */}
          <Grid size={{ xs: 12, md: 4 }}>
            <SummaryCard
              title="총 자산"
              value="₩128,450,000"
              percent="+12.5%"
              icon={<AccountBalanceWalletRoundedIcon />}
              color="#10B981"
            />
          </Grid>

          {/* Summary Card 2 */}
          <Grid size={{ xs: 12, md: 4 }}>
            <SummaryCard
              title="오늘의 수익"
              value="+₩1,240,000"
              percent="+2.1%"
              icon={<TrendingUpRoundedIcon />}
              color="#F59E0B"
            />
          </Grid>

          {/* Summary Card 3 */}
          <Grid size={{ xs: 12, md: 4 }}>
            <SummaryCard
              title="수익률 (YTD)"
              value="45.2%"
              percent="+5.4%"
              icon={<PieChartRoundedIcon />}
              color="#3B82F6"
            />
          </Grid>
        </Grid>

        <Box
          sx={(theme) => ({
            p: 8,
            display: 'flex',
            borderRadius: 3,
            textAlign: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            justifyContent: 'center',
            border: `dashed 1px ${theme.vars.palette.divider}`,
            bgcolor: alpha(theme.palette.primary.main, 0.02),
            minHeight: 300,
          })}
        >
          <Box
            sx={{
              mb: 3,
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
            }}
          >
            <TrendingUpRoundedIcon sx={{ fontSize: 40 }} />
          </Box>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
            분석 리포트 준비 중
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400 }}>
            AI가 당신의 투자 성향을 분석하여 맞춤형 종목을 추천해 드릴 예정입니다. 조금만 기다려
            주세요!
          </Typography>
        </Box>
      </Stack>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: string;
  percent: string;
  icon: React.ReactNode;
  color: string;
}

function SummaryCard({ title, value, percent, icon, color }: SummaryCardProps) {
  return (
    <Box
      sx={{
        p: 3,
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: (t) =>
          `0 0 2px 0 ${alpha(t.palette.common.black, 0.2)}, 0 12px 24px -4px ${alpha(t.palette.common.black, 0.12)}`,
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -10,
          right: -10,
          width: 80,
          height: 80,
          bgcolor: alpha(color, 0.08),
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          p: 2,
        }}
      >
        {icon}
      </Box>

      <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1, fontWeight: 600 }}>
        {title}
      </Typography>

      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
        {value}
      </Typography>

      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Box
          component="span"
          sx={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            bgcolor: alpha(color, 0.1),
            color,
          }}
        >
          <TrendingUpRoundedIcon sx={{ fontSize: 12 }} />
        </Box>
        <Typography variant="subtitle2" component="span" sx={{ color, fontWeight: 700 }}>
          {percent}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>
          vs 지난달
        </Typography>
      </Stack>
    </Box>
  );
}
