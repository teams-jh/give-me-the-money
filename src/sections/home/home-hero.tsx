
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import PaidRoundedIcon from '@mui/icons-material/PaidRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

// ----------------------------------------------------------------------

const FEATURES = [
  { 
    icon: <TrendingUpRoundedIcon />, 
    label: '실시간 시장 분석', 
    desc: '전 세계 시장의 흐름을 초단위로 포착하여 기회를 드립니다.',
    color: '#10B981' // Emerald
  },
  { 
    icon: <InsightsRoundedIcon />, 
    label: 'AI 수익 극대화', 
    desc: '고도화된 알고리즘이 당신의 포트폴리오를 최적화합니다.',
    color: '#F59E0B' // Amber/Gold
  },
  { 
    icon: <AccountBalanceWalletRoundedIcon />, 
    label: '자산 관리 솔루션', 
    desc: '체계적인 리스크 관리로 흔들림 없는 자산을 구축하세요.',
    color: '#3B82F6' // Blue
  },
];

// ----------------------------------------------------------------------

export function HomeHero() {
  const theme = useTheme();
  const router = useRouter();

  const renderTitle = () => (
    <Stack spacing={2} alignItems="center">
      {/* Top badge */}
      <Box>
        <Box
          sx={{
            px: 2.5,
            py: 0.75,
            borderRadius: 5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: alpha('#10B981', 0.1),
            border: `1px solid ${alpha('#10B981', 0.2)}`,
          }}
        >
          <PaidRoundedIcon sx={{ color: '#10B981', fontSize: 16 }} />
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, color: '#10B981', letterSpacing: 1, textTransform: 'uppercase' }}
          >
            Premium Investment Hub
          </Typography>
        </Box>
      </Box>

      {/* Main Title */}
      <Box sx={{ position: 'relative' }}>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '3rem', sm: '4.5rem', md: '6rem' },
            fontWeight: 900,
            letterSpacing: -2,
            lineHeight: 1,
            textAlign: 'center',
          }}
        >
          <Box
            component="span"
            sx={{
              background: `linear-gradient(135deg, #10B981 0%, #059669 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            GIVE ME
          </Box>
          <br />
          <Box
            component="span"
            sx={{
              background: `linear-gradient(135deg, #F59E0B 0%, #D97706 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: `0 0 40px ${alpha('#F59E0B', 0.3)}`,
            }}
          >
            THE MONEY
          </Box>
        </Typography>
        
        {/* Decorative elements */}
        <Box
          sx={{
            position: 'absolute',
            top: -20,
            right: -40,
            opacity: 0.15,
            transform: 'rotate(15deg)',
            display: { xs: 'none', md: 'block' }
          }}
        >
          <TrendingUpRoundedIcon sx={{ fontSize: 120, color: '#10B981' }} />
        </Box>
      </Box>

      {/* Subtitle */}
      <Box>
        <Typography
          variant="h6"
          sx={{
            color: 'text.secondary',
            fontWeight: 400,
            maxWidth: 600,
            lineHeight: 1.6,
            fontSize: { xs: '1rem', md: '1.25rem' },
          }}
        >
          단순한 투자를 넘어, 당신의 부를 창조하는 기술.<br />
          지금 바로 상위 1%의 투자 전략을 경험하세요.
        </Typography>
      </Box>
    </Stack>
  );

  const renderFeatures = () => (
    <Box sx={{ width: '100%', mt: 4 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={3}
        justifyContent="center"
      >
        {FEATURES.map((item) => (
          <Box
            key={item.label}
            sx={{
              flex: 1,
              maxWidth: { md: 320 },
              p: 4,
              borderRadius: 3,
              position: 'relative',
              bgcolor: (t) => alpha(t.palette.background.paper, 0.4),
              backdropFilter: 'blur(20px)',
              border: (t) => `1px solid ${alpha(t.palette.divider, 0.1)}`,
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                transform: 'translateY(-10px)',
                bgcolor: (t) => alpha(t.palette.background.paper, 0.7),
                borderColor: alpha(item.color, 0.4),
                boxShadow: `0 20px 40px ${alpha(item.color, 0.12)}`,
                '& .icon-box': {
                  transform: 'scale(1.1) rotate(5deg)',
                  bgcolor: item.color,
                  color: 'common.white',
                }
              },
            }}
          >
            <Box
              className="icon-box"
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(item.color, 0.12),
                color: item.color,
                mb: 3,
                transition: 'all 0.3s ease',
              }}
            >
              {item.icon}
            </Box>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
              {item.label}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              {item.desc}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );

  const renderCTA = () => (
    <Box sx={{ mt: 6 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="center">
        <Button
          variant="contained"
          size="large"
          onClick={() => router.push(paths.dashboard.root)}
          sx={{
            px: 6,
            py: 2,
            fontSize: '1.1rem',
            fontWeight: 800,
            borderRadius: 1.5,
            background: `linear-gradient(135deg, #10B981 0%, #059669 100%)`,
            boxShadow: `0 10px 30px ${alpha('#10B981', 0.3)}`,
            '&:hover': {
              background: `linear-gradient(135deg, #059669 0%, #10B981 100%)`,
              transform: 'scale(1.02)',
              boxShadow: `0 15px 40px ${alpha('#10B981', 0.4)}`,
            },
          }}
        >
          무료로 시작하기
        </Button>
        <Button
          variant="outlined"
          size="large"
          sx={{
            px: 6,
            py: 2,
            fontSize: '1.1rem',
            fontWeight: 800,
            borderRadius: 1.5,
            borderWidth: 2,
            borderColor: '#F59E0B',
            color: '#F59E0B',
            '&:hover': {
              borderWidth: 2,
              borderColor: '#D97706',
              bgcolor: alpha('#F59E0B', 0.04),
            },
          }}
        >
          가이드 보기
        </Button>
      </Stack>
    </Box>
  );

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        py: 10,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: `radial-gradient(circle at 20% 30%, ${alpha('#10B981', 0.05)} 0%, transparent 50%),
                            radial-gradient(circle at 80% 70%, ${alpha('#F59E0B', 0.05)} 0%, transparent 50%)`,
          pointerEvents: 'none',
        }
      }}
    >
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 9 }}>
        <Stack
          spacing={4}
          alignItems="center"
          sx={{ textAlign: 'center' }}
        >
          {renderTitle()}
          {renderFeatures()}
          {renderCTA()}
        </Stack>
      </Container>
      
      {/* Background decoration lines */}
      <Box
        sx={{
          position: 'absolute',
          bottom: -100,
          left: 0,
          right: 0,
          height: 400,
          opacity: 0.1,
          background: 'linear-gradient(to top, transparent, #10B981)',
          maskImage: 'linear-gradient(to top, black, transparent)',
          zIndex: 1,
          pointerEvents: 'none'
        }}
      />
    </Box>
  );
}
