import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { alpha, useTheme } from '@mui/material/styles';

import { Stock, PeriodKey } from './types';
import { Sparkline, getTrendColor, getTrendLabel } from './stock-market-index-charts';

// ----------------------------------------------------------------------

interface Props {
  stock: Stock;
  index: number;
  period: PeriodKey;
  onClick: () => void;
}

export function StockTableRow({ stock, index, period, onClick }: Props) {
  const theme = useTheme();
  const data = stock.periods[period];

  const isPositive = data.total_return >= 0;
  const trendColor = getTrendColor(data.trend, theme);

  return (
    <TableRow 
      hover 
      onClick={onClick}
      sx={{ cursor: 'pointer', '&:last-child td, &:last-child th': { border: 0 } }}
    >
      <TableCell>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
          {index + 1}
        </Typography>
      </TableCell>

      <TableCell>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
              color: 'primary.main',
              fontWeight: 800,
              fontSize: 12
            }}
          >
            {stock.ticker.substring(0, 4)}
          </Box>
          <Box>
            <Typography variant="subtitle2" noWrap>
              {stock.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled' }} noWrap>
              {stock.ticker} • {stock.sector}
            </Typography>
          </Box>
        </Stack>
      </TableCell>

      <TableCell align="right">
        <Typography variant="subtitle2">
          {stock.ticker.endsWith('.KS') || stock.ticker.endsWith('.KQ') ? '₩' : '$'}
          {stock.current_price.toLocaleString()}
        </Typography>
      </TableCell>

      <TableCell>
        <Chip
          label={getTrendLabel(data.trend)}
          size="small"
          sx={{
            bgcolor: alpha(trendColor, 0.1),
            color: trendColor,
            fontWeight: 700,
            fontSize: 10,
            borderRadius: 0.5
          }}
        />
      </TableCell>

      <TableCell align="right">
        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
          {isPositive ? (
            <TrendingUpRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
          ) : (
            <TrendingDownRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} />
          )}
          <Typography
            variant="subtitle2"
            sx={{ color: isPositive ? 'success.main' : 'error.main', fontWeight: 700 }}
          >
            {isPositive ? '+' : ''}{data.total_return}%
          </Typography>
        </Stack>
      </TableCell>

      <TableCell align="center">
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Sparkline data={data.chart_data} regression={data.regression} color={trendColor} />
        </Box>
      </TableCell>

      <TableCell align="right">
        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {data.r2.toFixed(3)}
          </Typography>
          <Tooltip title="결정계수(R²): 1에 가까울수록 추세가 일정하고 예측 가능함">
            <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled', cursor: 'help' }} />
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}
