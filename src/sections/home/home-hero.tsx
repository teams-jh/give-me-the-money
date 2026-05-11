
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useTheme, alpha } from '@mui/material/styles';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import KeyboardVoiceRoundedIcon from '@mui/icons-material/KeyboardVoiceRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';




// ----------------------------------------------------------------------

const FEATURES = [
  { icon: <DescriptionRoundedIcon />, label: '스크립트 관리', desc: '오픽 스크립트를 체계적으로 정리' },
  { icon: <EditNoteRoundedIcon />, label: '암기 연습', desc: '테스트 모드로 반복 학습' },
  { icon: <KeyboardVoiceRoundedIcon />, label: '음성 지원', desc: 'TTS/STT로 발음 연습' },
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
            bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
            border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.16)}`,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
              boxShadow: (t) => `0 0 8px ${t.palette.success.main}`,
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.6, transform: 'scale(1.3)' },
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: 0.5 }}
          >
            OPIc Script Trainer
          </Typography>
        </Box>
      </Box>

      {/* Main Title */}
      <Box>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '3.2rem', sm: '4rem', md: '5.5rem' },
            fontWeight: 900,
            letterSpacing: { xs: -1, md: -2 },
            lineHeight: 1,
            fontFamily: theme.typography.fontSecondaryFamily,
          }}
        >
          <Box
            component="span"
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 50%, ${theme.palette.primary.dark} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            AL
          </Box>
          <Box
            component="span"
            sx={{
              mx: { xs: 0.5, md: 1.5 },
              color: 'text.disabled',
              fontWeight: 300,
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' },
              fontStyle: 'italic',
            }}
          >
            is
          </Box>
          <Box
            component="span"
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.info.main} 0%, ${theme.palette.primary.main} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            WELL
          </Box>
        </Typography>
      </Box>

      {/* Subtitle */}
      <Box>
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{ mt: 1 }}
        >
          <Box
            sx={{
              width: { xs: 24, md: 40 },
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.text.primary, 0.3)})`,
            }}
          />
          <Typography
            variant="subtitle1"
            sx={{
              color: 'text.secondary',
              fontWeight: 500,
              letterSpacing: { xs: 3, md: 6 },
              fontSize: { xs: '0.85rem', md: '1.1rem' },
              textTransform: 'uppercase',
            }}
          >
            스크립트 암기 노트
          </Typography>
          <Box
            sx={{
              width: { xs: 24, md: 40 },
              height: '1px',
              background: `linear-gradient(90deg, ${alpha(theme.palette.text.primary, 0.3)}, transparent)`,
            }}
          />
        </Stack>
      </Box>
    </Stack>
  );

  const renderFeatures = () => (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 2, sm: 3 }}
        sx={{ mt: 2 }}
      >
        {FEATURES.map((item) => (
          <Box
            key={item.label}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2.5,
              py: 1.5,
              borderRadius: 2,
              bgcolor: (t) => alpha(t.palette.background.paper, 0.5),
              backdropFilter: 'blur(8px)',
              border: (t) => `1px solid ${alpha(t.palette.divider, 0.08)}`,
              transition: theme.transitions.create(['all'], { duration: 300 }),
              '&:hover': {
                bgcolor: (t) => alpha(t.palette.background.paper, 0.8),
                border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.2)}`,
                transform: 'translateY(-2px)',
                boxShadow: (t) => `0 4px 12px ${alpha(t.palette.common.black, 0.08)}`,
              },
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.primary.main, 0.04)} 100%)`,
              }}
            >
              <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
                {item.icon}
              </Box>
            </Box>
            <Stack spacing={0}>
              <Typography variant="subtitle2" sx={{ fontSize: '0.8rem' }}>
                {item.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {item.desc}
              </Typography>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );

  const renderCTA = () => (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="large"
          color="primary"
          onClick={() => router.push(paths.fileManager)}
          endIcon={
            <ArrowForwardRoundedIcon
              sx={{
                width: 20,
                height: 20,
                ml: 1,
                transition: 'transform 0.3s ease',
                '.MuiButton-root:hover &': { transform: 'translateX(4px)' },
              }}
            />
          }
          sx={{
            px: { xs: 4, md: 5 },
            py: { xs: 1.5, md: 2 },
            fontSize: { xs: '0.95rem', md: '1.1rem' },
            fontWeight: 700,
            borderRadius: 2,
            boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.3)}`,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            '&:hover': {
              boxShadow: `0 12px 32px ${alpha(theme.palette.primary.main, 0.4)}`,
              background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
              '& .MuiButton-endIcon': {
                transform: 'translateX(4px)',
              },
            },
            '& .MuiButton-endIcon': {
              transition: theme.transitions.create(['transform']),
            },
          }}
        >
          드라이브로 이동
        </Button>
      </Stack>
    </Box>
  );

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'background.default',
        flex: '1 1 auto',
        display: 'flex',
        alignItems: 'center',
      }}
    >


      <Container sx={{ position: 'relative', zIndex: 9 }}>
        <Stack
          spacing={{ xs: 3, md: 4 }}
          alignItems="center"
          sx={{ textAlign: 'center' }}
        >
          {renderTitle()}
          {renderFeatures()}
          {renderCTA()}
        </Stack>
      </Container>
    </Box>
  );
}
