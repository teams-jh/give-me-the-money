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
import { alpha, useTheme } from '@mui/material/styles';
import TableContainer from '@mui/material/TableContainer';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import SearchIcon from '@mui/icons-material/Search';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';

import { DashboardContent } from 'src/layouts/dashboard';
import { Scrollbar } from 'src/components/scrollbar';

import { nasdaq100, russell1000 } from 'src/library/metadata';
import { allTickersData } from 'src/library/tickers';

import { 
  Stock,
  StockData, 
  ScreenerItem, 
  PeriodKey, 
  MainTab, 
  ScreenerSubTab 
} from '../types';
import { getTrendLabel } from '../top100-charts';
import { StockTableRow } from '../top100-table-row';
import { ScreenerCard } from '../top100-screener-card';
import { StockDetailModal } from '../top100-detail-modal';
import { transformTickerToStock } from '../top100-utils';

// ----------------------------------------------------------------------

export function Top100View() {
  const theme = useTheme();
  const [mainTab, setMainTab] = useState<MainTab>('trend');
  const [screenerSubTab, setScreenerSubTab] = useState<ScreenerSubTab>('inclusion');
  const [currentPeriod, setCurrentPeriod] = useState<PeriodKey>('3y');
  const [searchQuery, setSearchQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [sortBy, setSortOptions] = useState('return');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  
  // Modal state
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [modalPeriod, setModalPeriod] = useState<PeriodKey>('3y');

  // Process Nasdaq 100 Data
  const stockData = useMemo<StockData>(() => {
    const nasdaqTickers = nasdaq100.tickers;
    const stocks: Stock[] = nasdaqTickers
      .map(ticker => allTickersData[ticker])
      .filter(data => !!data)
      .map(data => transformTickerToStock(data));

    return {
      generated_at: nasdaq100.updated_at,
      stocks
    };
  }, []);

  // Process Screener Data (Candidates for Nasdaq 100 from Russell 1000)
  const screenerData = useMemo(() => {
    const nasdaqSet = new Set(nasdaq100.tickers);
    
    // Inclusion: Russell 1000 but not in Nasdaq 100, sorted by Market Cap
    const inclusion = russell1000.tickers
      .filter(ticker => !nasdaqSet.has(ticker))
      .map(ticker => allTickersData[ticker])
      .filter(data => !!data && data.info.sector !== 'Financial') // Nasdaq 100 usually excludes financials
      .sort((a, b) => b.market.market_cap - a.market.market_cap)
      .slice(0, 50)
      .map(data => ({
        ticker: data.ticker,
        name: data.info.name,
        sector: data.info.sector,
        market_cap_b: data.market.market_cap / 1e9,
        zone: data.market.market_cap > 100e9 ? 'green' : 'watch',
        passed: ['Market Cap', 'Liquidity']
      } as ScreenerItem));

    // Exclusion: Nasdaq 100 with low market cap relative to others
    const exclusion = nasdaq100.tickers
      .map(ticker => allTickersData[ticker])
      .filter(data => !!data)
      .sort((a, b) => a.market.market_cap - b.market.market_cap)
      .slice(0, 20)
      .map(data => ({
        ticker: data.ticker,
        name: data.info.name,
        sector: data.info.sector,
        market_cap_b: data.market.market_cap / 1e9,
        risk_level: data.market.market_cap < 10e9 ? 'high' : 'medium',
        signals: ['Low Market Cap']
      } as ScreenerItem));

    return { INC: inclusion, EXC: exclusion };
  }, []);

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
    if (searchQuery && mainTab === 'trend') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.ticker.toLowerCase().includes(q) || 
        s.name.toLowerCase().includes(q)
      );
    }
    if (trendFilter !== 'all' && mainTab === 'trend') {
      filtered = filtered.filter(s => s.periods[currentPeriod].trend === trendFilter);
    }
    if (sectorFilter !== 'all' && mainTab === 'trend') {
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
  }, [stockData, currentPeriod, searchQuery, mainTab, trendFilter, sectorFilter, sortBy]);

  const filteredInclusion = useMemo(() => {
    return (screenerData.INC).filter(item => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !searchQuery || 
        item.ticker.toLowerCase().includes(q) || 
        item.name.toLowerCase().includes(q);
      const matchZone = zoneFilter === 'all' || item.zone === zoneFilter;
      return matchSearch && matchZone;
    });
  }, [screenerData, searchQuery, zoneFilter]);

  const filteredExclusion = useMemo(() => {
    return (screenerData.EXC).filter(item => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !searchQuery || 
        item.ticker.toLowerCase().includes(q) || 
        item.name.toLowerCase().includes(q);
      const matchRisk = riskFilter === 'all' || item.risk_level === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [screenerData, searchQuery, riskFilter]);

  const selectedStock = useMemo(() => 
    stockData.stocks.find(s => s.ticker === selectedTicker), 
  [stockData, selectedTicker]);

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              나스닥 100 추세 분석 {mainTab === 'trend' ? '📈' : '🔍'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {mainTab === 'trend' 
                ? `Nasdaq 100 종목들의 기간별 수익률과 추세를 실시간 분석 데이터로 확인하세요. (업데이트: ${stockData.generated_at})`
                : 'Nasdaq 100 지수 편입 후보 및 편출 위험 종목을 분석합니다.'}
            </Typography>
          </Box>
        </Stack>

        <Tabs
          value={mainTab}
          onChange={(e, v) => { setMainTab(v); setSearchQuery(''); }}
          sx={{
            px: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            borderRadius: 1,
            '& .MuiTabs-indicator': { height: 4, borderRadius: '4px 4px 0 0' }
          }}
        >
          <Tab label="추세 분석" value="trend" icon={<TimelineRoundedIcon />} iconPosition="start" />
          <Tab label="나스닥 스크리너" value="screener" icon={<SearchIcon />} iconPosition="start" />
        </Tabs>

        {mainTab === 'trend' ? (
          <>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
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

              <Stack direction="row" spacing={1} flexWrap="wrap">
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
          </>
        ) : (
          <Stack spacing={3}>
            <Tabs 
              value={screenerSubTab} 
              onChange={(e, v) => { setScreenerSubTab(v); setSearchQuery(''); }}
              variant="scrollable"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label={`나스닥 100 편입 후보 (${screenerData.INC.length})`} value="inclusion" />
              <Tab label={`나스닥 100 편출 위험 (${screenerData.EXC.length})`} value="exclusion" />
            </Tabs>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <TextField
                placeholder="티커 또는 종목명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ width: 300 }}
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                }}
              />
              {screenerSubTab === 'inclusion' ? (
                <Stack direction="row" spacing={1}>
                  {['all', 'green', 'watch'].map((z) => (
                    <Button
                      key={z}
                      size="small"
                      variant={zoneFilter === z ? 'contained' : 'outlined'}
                      onClick={() => setZoneFilter(z)}
                      sx={{ textTransform: 'capitalize', borderRadius: 2 }}
                    >
                      {z === 'all' ? '전체' : z === 'green' ? '🟢 Safe' : '🟡 Watch'}
                    </Button>
                  ))}
                </Stack>
              ) : (
                <Stack direction="row" spacing={1}>
                  {['all', 'high', 'medium', 'low'].map((r) => (
                    <Button
                      key={r}
                      size="small"
                      variant={riskFilter === r ? 'contained' : 'outlined'}
                      onClick={() => setRiskFilter(r)}
                      sx={{ textTransform: 'capitalize', borderRadius: 2 }}
                    >
                      {r === 'all' ? '전체' : r === 'high' ? '🔴 High' : r === 'medium' ? '🟠 Medium' : '🟡 Low'}
                    </Button>
                  ))}
                </Stack>
              )}
            </Stack>

            <Grid container spacing={3}>
              {(screenerSubTab === 'inclusion' ? filteredInclusion : filteredExclusion).map((item) => (
                <Grid key={item.ticker} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <ScreenerCard 
                    item={item} 
                    type={screenerSubTab} 
                  />
                </Grid>
              ))}
              {(screenerSubTab === 'inclusion' ? filteredInclusion : filteredExclusion).length === 0 && (
                <Grid size={12}>
                  <Box sx={{ py: 10, textAlign: 'center', bgcolor: alpha(theme.palette.grey[500], 0.05), borderRadius: 2 }}>
                    <Typography variant="h6" sx={{ color: 'text.secondary' }}>해당하는 종목이 없습니다.</Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </Stack>
        )}
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
