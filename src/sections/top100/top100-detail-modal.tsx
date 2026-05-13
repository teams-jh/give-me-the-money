import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Modal from '@mui/material/Modal';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { alpha, useTheme } from '@mui/material/styles';

import { Stock, PeriodKey } from './types';
import { BigChart, getTrendColor, getTrendLabel } from './top100-charts';

// ----------------------------------------------------------------------

interface Props {
  stock?: Stock;
  open: boolean;
  onClose: () => void;
  initialPeriod: PeriodKey;
}

export function StockDetailModal({ stock, open, onClose, initialPeriod }: Props) {
  const theme = useTheme();
  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  
  if (!stock) return null;
  
  const data = stock.periods[period];
  const trendColor = getTrendColor(data.trend, theme);
  const isPositive = data.total_return >= 0;

  return (
    <Modal open={open} onClose={onClose} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ 
        bgcolor: 'background.paper', 
        borderRadius: 2, 
        width: '90%', 
        maxWidth: 800, 
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
        boxShadow: 24,
        p: 4
      }}>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>

        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{stock.ticker} {stock.name}</Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary' }}>
              {stock.sector} • 현재가 ${stock.current_price.toLocaleString()}
            </Typography>
          </Box>

          <Tabs value={period} onChange={(e, v) => setPeriod(v)}>
            <Tab label="3개월" value="3m" />
            <Tab label="1년" value="1y" />
            <Tab label="2년" value="2y" />
            <Tab label="3년" value="3y" />
          </Tabs>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Box sx={{ height: 300, bgcolor: alpha(theme.palette.grey[500], 0.05), borderRadius: 1, p: 2 }}>
                <BigChart data={data} color={trendColor} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={2}>
                <Box sx={{ p: 2, borderRadius: 1, bgcolor: alpha(trendColor, 0.05), border: `1px solid ${alpha(trendColor, 0.2)}` }}>
                  <Typography variant="overline" sx={{ color: trendColor, fontWeight: 800 }}>현재 추세</Typography>
                  <Typography variant="h5" sx={{ color: trendColor, fontWeight: 800 }}>
                    {getTrendLabel(data.trend)}
                  </Typography>
                </Box>
                
                <Box sx={{ p: 2, borderRadius: 1, bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                  <Typography variant="overline" sx={{ color: 'text.secondary' }}>기간 수익률</Typography>
                  <Typography variant="h5" sx={{ color: isPositive ? 'success.main' : 'error.main', fontWeight: 800 }}>
                    {isPositive ? '+' : ''}{data.total_return}%
                  </Typography>
                </Box>

                <Box sx={{ p: 2, borderRadius: 1, bgcolor: alpha(theme.palette.grey[500], 0.05) }}>
                  <Typography variant="overline" sx={{ color: 'text.secondary' }}>분석 지표</Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">기울기(Slope)</Typography>
                      <Typography variant="subtitle2" sx={{ color: data.slope_pct > 0 ? 'success.main' : 'error.main' }}>
                        {data.slope_pct > 0 ? '+' : ''}{data.slope_pct.toFixed(3)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">신뢰도(R²)</Typography>
                      <Typography variant="subtitle2">{data.r2.toFixed(3)}</Typography>
                    </Stack>
                  </Stack>
                </Box>
              </Stack>
            </Grid>
          </Grid>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>📐 상세 추세 분석</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              분석 기간 동안의 전반부 기울기는 <b>{data.slope_early_pct > 0 ? '▲ +' : '▼ '}{data.slope_early_pct}%</b>이며, 
              후반부 기울기는 <b>{data.slope_late_pct > 0 ? '▲ +' : '▼ '}{data.slope_late_pct}%</b>입니다. 
              {data.trend === 'recovering' && ' 전반 하락 후 후반에 반등하는 모습을 보이고 있습니다.'}
              {data.trend === 'bullish' && ' 지속적인 상승 추세를 유지하고 있습니다.'}
              {data.trend === 'bearish' && ' 지속적인 하락 압력을 받고 있습니다.'}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Modal>
  );
}
