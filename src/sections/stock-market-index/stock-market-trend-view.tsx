'use client';

import type { Stock, PeriodKey } from './types';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, useTheme } from '@mui/material/styles';
import InputAdornment from '@mui/material/InputAdornment';
import TableContainer from '@mui/material/TableContainer';

import { Scrollbar } from 'src/components/scrollbar';

import { getTrendLabel } from './stock-market-index-charts';
import { StockTableRow } from './stock-market-index-table-row';

interface StockMarketTrendViewProps {
  currentPeriod: PeriodKey;
  setCurrentPeriod: (period: PeriodKey) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  trendFilter: string;
  setTrendFilter: (filter: string) => void;
  sectorFilter: string;
  setSectorFilter: (filter: string) => void;
  sortBy: string;
  setSortOptions: (sort: string) => void;
  sortedStocks: Stock[];
  trendCounts: Record<string, number>;
  sectors: string[];
  handleOpenModal: (ticker: string) => void;
}

export function StockMarketTrendView({
  currentPeriod,
  setCurrentPeriod,
  searchQuery,
  setSearchQuery,
  trendFilter,
  setTrendFilter,
  sectorFilter,
  setSectorFilter,
  sortBy,
  setSortOptions,
  sortedStocks,
  trendCounts,
  sectors,
  handleOpenModal,
}: StockMarketTrendViewProps) {
  const theme = useTheme();

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" gap={1.5}>
        <TextField
          placeholder="티커 또는 종목명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ width: 220 }}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.disabled', fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />
        
        <TextField
          select
          size="small"
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          SelectProps={{ native: true }}
          sx={{ width: 160 }}
        >
          <option value="all">모든 섹터</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          value={sortBy}
          onChange={(e) => setSortOptions(e.target.value)}
          SelectProps={{ native: true }}
          sx={{ width: 140 }}
        >
          <option value="return">수익률 순</option>
          <option value="r2">신뢰도(R²) 순</option>
          <option value="ticker">티커 알파벳 순</option>
        </TextField>

        <Stack direction="row" spacing={1} flexWrap="wrap" gap={0.5}>
          {['all', 'bullish', 'recovering', 'sideways', 'bearish'].map((t) => (
            <Button
              key={t}
              size="small"
              variant={trendFilter === t ? 'contained' : 'outlined'}
              onClick={() => setTrendFilter(t)}
              sx={{ textTransform: 'none', borderRadius: 2, px: 1.5 }}
              color={
                t === 'bullish'
                  ? 'success'
                  : t === 'bearish'
                  ? 'error'
                  : t === 'recovering'
                  ? 'primary'
                  : t === 'sideways'
                  ? 'warning'
                  : 'inherit'
              }
            >
              {t === 'all' ? '전체' : `${getTrendLabel(t).split(' ')[0]} (${trendCounts[t]})`}
            </Button>
          ))}
        </Stack>
      </Stack>

      <Card
        sx={{
          borderRadius: 2,
          boxShadow: `0 0 2px 0 ${alpha(theme.palette.common.black, 0.2)}, 0 12px 24px -4px ${alpha(
            theme.palette.common.black,
            0.12
          )}`,
        }}
      >
        <Box sx={{ px: 2, pt: 2, borderBottom: `solid 1px ${theme.palette.divider}` }}>
          <Tabs
            value={currentPeriod}
            onChange={(e, v) => setCurrentPeriod(v)}
            sx={{
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
            }}
          >
            <Tab label="3개월" value="3m" />
            <Tab label="1년" value="1y" />
            <Tab label="2년" value="2y" />
            <Tab label="3년" value="3y" />
          </Tabs>
        </Box>

        <TableContainer sx={{ position: 'relative', overflow: 'unset' }}>
          <Scrollbar>
            <Table sx={{ minWidth: 960 }}>
              <TableHead>
                <TableRow>
                  <TableCell width={60}>순위</TableCell>
                  <TableCell>종목명</TableCell>
                  <TableCell align="right">현재가</TableCell>
                  <TableCell>추세</TableCell>
                  <TableCell align="right">수익률</TableCell>
                  <TableCell align="center">추세 차트</TableCell>
                  <TableCell align="right">신뢰도(R²)</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {sortedStocks.map((stock, index) => (
                  <StockTableRow
                    key={stock.ticker}
                    stock={stock}
                    index={index}
                    period={currentPeriod}
                    onClick={() => handleOpenModal(stock.ticker)}
                  />
                ))}
                {sortedStocks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                        해당하는 종목이 없습니다.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Scrollbar>
        </TableContainer>
      </Card>
    </Stack>
  );
}
