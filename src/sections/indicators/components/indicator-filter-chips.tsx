'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

interface IndicatorFilterChipsProps {
  showSma5: boolean;
  setShowSma5: (val: boolean) => void;
  showSma20: boolean;
  setShowSma20: (val: boolean) => void;
  showSma60: boolean;
  setShowSma60: (val: boolean) => void;
  showSma120: boolean;
  setShowSma120: (val: boolean) => void;
  showSma240: boolean;
  setShowSma240: (val: boolean) => void;
  showBb: boolean;
  setShowBb: (val: boolean) => void;
  showEnv: boolean;
  setShowEnv: (val: boolean) => void;
  showFib: boolean;
  setShowFib: (val: boolean) => void;
  showDonchian: boolean;
  setShowDonchian: (val: boolean) => void;
  showRsi: boolean;
  setShowRsi: (val: boolean) => void;
  showMacd: boolean;
  setShowMacd: (val: boolean) => void;
}

export function IndicatorFilterChips({
  showSma5,
  setShowSma5,
  showSma20,
  setShowSma20,
  showSma60,
  setShowSma60,
  showSma120,
  setShowSma120,
  showSma240,
  setShowSma240,
  showBb,
  setShowBb,
  showEnv,
  setShowEnv,
  showFib,
  setShowFib,
  showDonchian,
  setShowDonchian,
  showRsi,
  setShowRsi,
  showMacd,
  setShowMacd,
}: IndicatorFilterChipsProps) {
  const theme = useTheme();

  return (
    <Grid size={{ xs: 12 }}>
      <Card sx={{ p: 2, boxShadow: theme.customShadows?.card || `0 4px 16px 0 ${alpha(theme.palette.common.black, 0.04)}` }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              🛠️ 기술적 분석 지표 활성화 필터
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              원하는 보조지표를 활성화하면 차트에 선이 실시간으로 표기되고 우측 진단 설명 보드가 생성됩니다.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
            <Chip label="MA 5" color={showSma5 ? 'secondary' : 'default'} variant={showSma5 ? 'filled' : 'outlined'} onClick={() => setShowSma5(!showSma5)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
            <Chip label="MA 20" color={showSma20 ? 'warning' : 'default'} variant={showSma20 ? 'filled' : 'outlined'} onClick={() => setShowSma20(!showSma20)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
            <Chip label="MA 60" color={showSma60 ? 'info' : 'default'} variant={showSma60 ? 'filled' : 'outlined'} onClick={() => setShowSma60(!showSma60)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
            <Chip label="MA 120" color={showSma120 ? 'error' : 'default'} variant={showSma120 ? 'filled' : 'outlined'} onClick={() => setShowSma120(!showSma120)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
            <Chip label="MA 240" color={showSma240 ? 'default' : 'default'} variant={showSma240 ? 'filled' : 'outlined'} onClick={() => setShowSma240(!showSma240)} sx={{ fontWeight: 700, cursor: 'pointer' }} />
            <Chip
              label="볼린저 밴드 (Bollinger)"
              color={showBb ? 'success' : 'default'}
              variant={showBb ? 'filled' : 'outlined'}
              onClick={() => setShowBb(!showBb)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
            <Chip
              label="엔벨로프 (Envelope)"
              color={showEnv ? 'secondary' : 'default'}
              variant={showEnv ? 'filled' : 'outlined'}
              onClick={() => setShowEnv(!showEnv)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
            <Chip
              label="피보나치 (Fibonacci)"
              color={showFib ? 'error' : 'default'}
              variant={showFib ? 'filled' : 'outlined'}
              onClick={() => setShowFib(!showFib)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
            <Chip
              label="돈천 채널 (Donchian)"
              color={showDonchian ? 'info' : 'default'}
              variant={showDonchian ? 'filled' : 'outlined'}
              onClick={() => setShowDonchian(!showDonchian)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
            <Chip
              label="RSI (14)"
              color={showRsi ? 'primary' : 'default'}
              variant={showRsi ? 'filled' : 'outlined'}
              onClick={() => setShowRsi(!showRsi)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
            <Chip
              label="MACD"
              color={showMacd ? 'info' : 'default'}
              variant={showMacd ? 'filled' : 'outlined'}
              onClick={() => setShowMacd(!showMacd)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
          </Stack>
        </Stack>
      </Card>
    </Grid>
  );
}
