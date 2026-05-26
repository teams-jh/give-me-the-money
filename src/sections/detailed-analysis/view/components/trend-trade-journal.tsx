'use client';

import type { UseChartTrendSimulatorReturn } from 'src/sections/detailed-analysis/hooks/use-chart-trend-simulator';

import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import Paper from '@mui/material/Paper';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import TableContainer from '@mui/material/TableContainer';

// ----------------------------------------------------------------------

interface Props {
  simulator: UseChartTrendSimulatorReturn;
}

export function TrendTradeJournal({ simulator }: Props) {
  const theme = useTheme() as any;
  const { backtestResult, market, formatMoney } = simulator;

  if (!backtestResult || backtestResult.trades.length === 0) return null;

  return (
    <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        📋 추세선 매매 실적 저널 (Trading Journal)
      </Typography>
      <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
              <TableCell sx={{ fontWeight: 700 }}>날짜</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래 포지션</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>체결 가격</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래 수량</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래 후 자산 가치</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래 손익 (%)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {backtestResult.trades.map((t, idx) => (
              <TableRow key={idx}>
                <TableCell>{t.date}</TableCell>
                <TableCell>
                  <Chip
                    label={
                      t.action === 'BUY'
                        ? '추가 매수 (BUY)'
                        : t.action === 'STOP_LOSS'
                          ? '전량 손절 (OUT)'
                          : '부분 매도 (SELL)'
                    }
                    color={
                      t.action === 'BUY' ? 'success' : t.action === 'STOP_LOSS' ? 'error' : 'warning'
                    }
                    size="small"
                    variant="soft"
                    sx={{ fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell>
                  {market === 'KR' ? '₩' : '$'}
                  {t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{t.sharesTraded} 주</TableCell>
                <TableCell>{formatMoney(t.value)}</TableCell>
                <TableCell>
                  {t.profitPct !== undefined ? (
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: t.profitPct >= 0 ? 'success.main' : 'error.main',
                      }}
                    >
                      {t.profitPct >= 0 ? '+' : ''}
                      {t.profitPct.toFixed(2)}%
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                      -
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
