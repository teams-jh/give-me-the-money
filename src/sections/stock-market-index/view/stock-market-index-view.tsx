'use client';

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import { alpha, useTheme } from '@mui/material/styles';
import TableContainer from '@mui/material/TableContainer';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import SearchIcon from '@mui/icons-material/Search';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';

import { DashboardContent } from 'src/layouts/dashboard';
import { Scrollbar } from 'src/components/scrollbar';

import { allTickersData } from 'src/library/all-tickers-data';

import kosdaq200Raw from 'src/db/stock_market_index/kosdaq200_tickers.json';
import kospi300Raw from 'src/db/stock_market_index/kospi300_tickers.json';
import nasdaq100Raw from 'src/db/stock_market_index/nasdaq100_tickers.json';
import russell1000Raw from 'src/db/stock_market_index/russell1000_tickers.json';
import top1000UsRaw from 'src/db/stock_market_index/top1000_us_tickers.json';

import { 
  Stock,
  PeriodKey, 
} from '../types';
import { getTrendLabel } from '../stock-market-index-charts';
import { StockTableRow } from '../stock-market-index-table-row';
import { StockDetailModal } from '../stock-market-index-detail-modal';
import { transformTickerToStock } from '../stock-market-index-utils';

// ----------------------------------------------------------------------

interface IndexConfig {
  id: string;
  name: string;
  description: string;
  data: {
    updated_at: string;
    source: string;
    tickers: string[];
    name_map?: Record<string, string>;
  };
}

const INDEX_OPTIONS: IndexConfig[] = [
  {
    id: 'nasdaq100',
    name: '나스닥 100 (NASDAQ 100)',
    description: '미국 나스닥 지수에 상장된 비금융 우량 기업 100개 종목',
    data: nasdaq100Raw
  },
  {
    id: 'kospi300',
    name: '코스피 300 (KOSPI 300)',
    description: '한국 유가증권시장의 대표적인 우량 기업 300개 종목',
    data: kospi300Raw
  },
  {
    id: 'kosdaq200',
    name: '코스닥 200 (KOSDAQ 200)',
    description: '한국 코스닥 시장의 대표적인 우량 기업 200개 종목',
    data: kosdaq200Raw
  },
  {
    id: 'russell1000',
    name: '러셀 1000 (Russell 1000)',
    description: '미국 주식시장 시가총액 상위 1000개 종목',
    data: russell1000Raw
  },
  {
    id: 'top1000_us',
    name: '미국 TOP 1000 추세 분석',
    description: '미국 시장의 주요 대형주 1000개 종목의 전체 동향',
    data: top1000UsRaw
  }
];

export function StockMarketIndexView() {
  const theme = useTheme();
  
  const [selectedIndexId, setSelectedIndexId] = useState<string>('nasdaq100');
  const [currentPeriod, setCurrentPeriod] = useState<PeriodKey>('3y');
  const [searchQuery, setSearchQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [sortBy, setSortOptions] = useState('return');
  
  // Modal state
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [modalPeriod, setModalPeriod] = useState<PeriodKey>('3y');

  const selectedIndex = useMemo(() => {
    return INDEX_OPTIONS.find(opt => opt.id === selectedIndexId) || INDEX_OPTIONS[0];
  }, [selectedIndexId]);

  // Process selected Index Data
  const stockData = useMemo(() => {
    const rawData = selectedIndex.data;
    const stocks: Stock[] = rawData.tickers
      .map(ticker => {
        const rawStock = allTickersData[ticker];
        if (!rawStock) return null;
        
        const transformed = transformTickerToStock(rawStock);
        
        // Override name with name_map (Korean name) if available
        if (rawData.name_map && rawData.name_map[ticker]) {
          transformed.name = rawData.name_map[ticker];
        } else if (rawStock.info.kr_name) {
          transformed.name = rawStock.info.kr_name;
        }
        
        return transformed;
      })
      .filter((s): s is Stock => !!s);

    return {
      generated_at: rawData.updated_at,
      stocks
    };
  }, [selectedIndex]);

  const handleOpenModal = (ticker: string) => {
    setSelectedTicker(ticker);
    setModalPeriod(currentPeriod);
  };

  const handleCloseModal = () => {
    setSelectedTicker(null);
  };

  const sectors = useMemo(() => {
    const s = new Set(stockData.stocks.map(x => x.sector));
    return Array.from(s).sort();
  }, [stockData]);

  const trendCounts = useMemo(() => {
    const counts: Record<string, number> = { bullish: 0, recovering: 0, sideways: 0, bearish: 0 };
    stockData.stocks.forEach(s => {
      const t = s.periods[currentPeriod].trend;
      if (counts[t] !== undefined) counts[t]++;
    });
    return counts;
  }, [stockData, currentPeriod]);

  const sortedStocks = useMemo(() => {
    let filtered = [...stockData.stocks];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.ticker.toLowerCase().includes(q) || 
        s.name.toLowerCase().includes(q)
      );
    }
    if (trendFilter !== 'all') {
      filtered = filtered.filter(s => s.periods[currentPeriod].trend === trendFilter);
    }
    if (sectorFilter !== 'all') {
      filtered = filtered.filter(s => s.sector === sectorFilter);
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'return') {
        return b.periods[currentPeriod].total_return - a.periods[currentPeriod].total_return;
      }
      if (sortBy === 'r2') {
        return b.periods[currentPeriod].r2 - a.periods[currentPeriod].r2;
      }
      if (sortBy === 'ticker') {
        return a.ticker.localeCompare(b.ticker);
      }
      return 0;
    });
  }, [stockData, currentPeriod, searchQuery, trendFilter, sectorFilter, sortBy]);

  const selectedStock = useMemo(() => 
    stockData.stocks.find(s => s.ticker === selectedTicker), 
  [stockData, selectedTicker]);

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              주가지수 추세 분석 📈
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              다양한 글로벌/국내 주가지수 구성 종목들의 기간별 수익률과 추세를 확인하세요. (업데이트: {stockData.generated_at})
            </Typography>
          </Box>

          <TextField
            select
            label="주가지수 선택"
            value={selectedIndexId}
            onChange={(e) => {
              setSelectedIndexId(e.target.value);
              setSearchQuery('');
              setTrendFilter('all');
              setSectorFilter('all');
            }}
            slotProps={{ select: { native: false } }}
            sx={{ minWidth: 260 }}
          >
            {INDEX_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Card sx={{ p: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.04), border: `1px dashed ${alpha(theme.palette.primary.main, 0.15)}`, borderRadius: 1.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TimelineRoundedIcon color="primary" />
            <Box>
              <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 800 }}>
                {selectedIndex.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {selectedIndex.description} • 총 {stockData.stocks.length}개 종목 분석 중 • 출처: {selectedIndex.data.source}
              </Typography>
            </Box>
          </Stack>
        </Card>

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
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
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
                sx={{ textTransform: 'capitalize', borderRadius: 2, px: 1.5 }}
                color={t === 'bullish' ? 'success' : t === 'bearish' ? 'error' : t === 'recovering' ? 'primary' : t === 'sideways' ? 'warning' : 'inherit'}
              >
                {t === 'all' ? '전체' : `${getTrendLabel(t).split(' ')[0]} (${trendCounts[t]})`}
              </Button>
            ))}
          </Stack>
        </Stack>

        <Card sx={{
          borderRadius: 2,
          boxShadow: (t) => `0 0 2px 0 ${alpha(t.palette.common.black, 0.2)}, 0 12px 24px -4px ${alpha(t.palette.common.black, 0.12)}`,
        }}>
          <Box sx={{ px: 2, pt: 2, borderBottom: `solid 1px ${theme.vars.palette.divider}` }}>
            <Tabs
              value={currentPeriod}
              onChange={(e, v) => setCurrentPeriod(v)}
              sx={{
                '& .MuiTabs-indicator': {
                  height: 3,
                  borderRadius: '3px 3px 0 0',
                }
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

      <StockDetailModal 
        stock={selectedStock} 
        open={!!selectedTicker} 
        onClose={handleCloseModal}
        initialPeriod={modalPeriod}
      />
    </DashboardContent>
  );
}
