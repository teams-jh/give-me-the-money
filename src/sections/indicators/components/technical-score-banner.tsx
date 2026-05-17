'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import LinearProgress from '@mui/material/LinearProgress';

interface TechnicalScoreBannerProps {
  score: number;
  stockName: string;
  stockTicker: string;
  latestRsi: number;
}

export function TechnicalScoreBanner({
  score,
  stockName,
  stockTicker,
  latestRsi,
}: TechnicalScoreBannerProps) {
  const theme = useTheme();

  const getAssessmentText = (currentScore: number) => {
    if (currentScore >= 70) return '긍정적 매수 세력 유입세 🚀';
    if (currentScore <= 35) return '하방 압력 가중, 비중 조절 주의 ⚠️';
    return '수렴구간, 중립 횡보 및 탐색 ⚖️';
  };

  const getScoreColor = (currentScore: number) => {
    if (currentScore >= 70) return 'success';
    if (currentScore <= 35) return 'error';
    return 'warning';
  };

  const colorKey = getScoreColor(score);

  return (
    <Grid size={{ xs: 12 }}>
      <Card
        sx={{
          p: 2,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.12)} 0%, ${alpha(theme.palette.info.light, 0.08)} 100%)`,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          borderRadius: 2,
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 8.5 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Chip
                  label="차트 종합 분석 지수"
                  color="primary"
                  size="small"
                  sx={{ fontWeight: 800, borderRadius: 0.5 }}
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
                  {getAssessmentText(score)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  • 동적 알고리즘 스캔 완료
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
                RSI {latestRsi.toFixed(1)} 수준과 MACD 오실레이터, 이동평균선의 정합성을 바탕으로 도출한 {stockName}({stockTicker})의 기술적 모멘텀 점수는{' '}
                <b>{score}점</b>입니다.
              </Typography>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 3.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{
                p: 1.5,
                bgcolor: alpha(theme.palette.background.paper, 0.8),
                borderRadius: 1.5,
                border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              }}
            >
              <Box sx={{ minWidth: 80, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.2 }}>
                  종합 점수
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 900,
                    color: `${colorKey}.main`,
                    lineHeight: 1,
                  }}
                >
                  {score} / 100
                </Typography>
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={score}
                  color={colorKey}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Card>
    </Grid>
  );
}
