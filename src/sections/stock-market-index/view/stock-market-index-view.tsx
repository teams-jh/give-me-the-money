'use client';

import type { 
  Stock,
  PeriodKey, 
} from '../types';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import MapRoundedIcon from '@mui/icons-material/MapRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';

import { DashboardContent } from 'src/layouts/dashboard';
import { allTickersData } from 'src/library/all-tickers-data';
import kospi300Raw from 'src/db/stock_market_index/kospi300_tickers.json';
import kosdaq200Raw from 'src/db/stock_market_index/kosdaq200_tickers.json';
import nasdaq100Raw from 'src/db/stock_market_index/nasdaq100_tickers.json';
import top1000UsRaw from 'src/db/stock_market_index/top1000_us_tickers.json';
import russell1000Raw from 'src/db/stock_market_index/russell1000_tickers.json';

import { StockMarketTrendView } from '../stock-market-trend-view';
import { transformTickerToStock } from '../stock-market-index-utils';
import { StockDetailModal } from '../stock-market-index-detail-modal';
import { StockMarketHeatmapView } from '../stock-market-heatmap-view';

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
  
  const [activeView, setActiveView] = useState<'trend' | 'heatmap'>('trend');
  const [selectedIndexId, setSelectedIndexId] = useState<string>('nasdaq100');
  const [currentPeriod, setCurrentPeriod] = useState<PeriodKey>('3y');
  const [searchQuery, setSearchQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [sortBy, setSortOptions] = useState('return');
  
  // Modal state
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [modalPeriod, setModalPeriod] = useState<PeriodKey>('3y');

  // Heatmap playback states
  const [dateIndex, setDateIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(200); // ms per step
  const [valueType, setValueType] = useState<'cumulative' | 'daily'>('cumulative');

  // Heatmap layout controls
  const [groupBySector, setGroupBySector] = useState<boolean>(true);
  const [sizeType, setSizeType] = useState<'marketCap' | 'price'>('marketCap');
  const [selectedHeatmapSector, setSelectedHeatmapSector] = useState<string>('all');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const selectedIndex = useMemo(() => INDEX_OPTIONS.find(opt => opt.id === selectedIndexId) || INDEX_OPTIONS[0], [selectedIndexId]);

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

  const handleOpenModal = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setModalPeriod(currentPeriod);
  }, [currentPeriod]);

  const handleCloseModal = useCallback(() => {
    setSelectedTicker(null);
  }, []);

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

  // Extract available unique dates for timeline
  const availableDates = useMemo(() => {
    let maxLabels: string[] = [];
    stockData.stocks.forEach(stock => {
      const labels = stock.periods[currentPeriod]?.chart_labels || [];
      if (labels.length > maxLabels.length) {
        maxLabels = labels;
      }
    });
    return maxLabels;
  }, [stockData, currentPeriod]);

  // Sync date slider index when period or stock selection updates
  useEffect(() => {
    setIsPlaying(false);
    if (availableDates.length > 0) {
      setDateIndex(availableDates.length - 1);
    } else {
      setDateIndex(-1);
    }
  }, [availableDates]);

  // History Autoplay animation timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isPlaying && availableDates.length > 0) {
      timerRef.current = setInterval(() => {
        setDateIndex((prev) => {
          if (prev >= availableDates.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playSpeed);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, availableDates, playSpeed]);

  // Calculate return data for each stock at the current dateIndex
  const stocksWithReturn = useMemo(() => {
    if (availableDates.length === 0 || dateIndex === -1 || dateIndex >= availableDates.length) {
      return [];
    }
    const selectedDate = availableDates[dateIndex];

    return stockData.stocks.map(stock => {
      const periodData = stock.periods[currentPeriod];
      if (!periodData) return null;

      const labels = periodData.chart_labels || [];
      const dataPoints = periodData.chart_data || [];

      let idx = labels.indexOf(selectedDate);
      if (idx === -1 && labels.length > 0) {
        idx = labels.findIndex(lbl => lbl >= selectedDate);
        if (idx === -1) idx = labels.length - 1;
      }

      if (idx === -1 || idx >= dataPoints.length) {
        return {
          stock,
          cumulativeReturn: 0,
          dailyReturn: 0,
          activeReturn: 0,
          currentPrice: stock.current_price
        };
      }

      const currentPrice = dataPoints[idx];
      const startPrice = dataPoints[0] || currentPrice;
      const prevPrice = idx > 0 ? dataPoints[idx - 1] : startPrice;

      const cumulativeReturn = startPrice > 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
      const dailyReturn = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

      return {
        stock,
        cumulativeReturn,
        dailyReturn,
        activeReturn: valueType === 'cumulative' ? cumulativeReturn : dailyReturn,
        currentPrice
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [stockData, availableDates, dateIndex, currentPeriod, valueType]);

  // Color mapping thresholds based on period and type
  const thresholds = useMemo(() => {
    if (valueType === 'daily') {
      return { strong: 3.0, medium: 1.5, light: 0.5 };
    }
    switch (currentPeriod) {
      case '3m': return { strong: 15, medium: 8, light: 3 };
      case '1y': return { strong: 30, medium: 15, light: 5 };
      case '2y': return { strong: 50, medium: 25, light: 8 };
      case '3y': return { strong: 80, medium: 40, light: 12 };
      default: return { strong: 30, medium: 15, light: 5 };
    }
  }, [valueType, currentPeriod]);

  const getHeatmapColor = useCallback((value: number) => {
    const abs = Math.abs(value);
    const { strong, medium, light } = thresholds;

    if (value > 0) {
      if (abs >= strong) return { bg: '#1b5e20', text: '#ffffff' }; 
      if (abs >= medium) return { bg: '#2e7d32', text: '#ffffff' }; 
      if (abs >= light) return { bg: '#4caf50', text: '#ffffff' }; 
      return { bg: '#a5d6a7', text: '#111111' }; 
    } else if (value < 0) {
      if (abs >= strong) return { bg: '#b71c1c', text: '#ffffff' }; 
      if (abs >= medium) return { bg: '#c62828', text: '#ffffff' }; 
      if (abs >= light) return { bg: '#e53935', text: '#ffffff' }; 
      return { bg: '#ef9a9a', text: '#111111' }; 
    }
    return { bg: theme.palette.action.disabledBackground || '#eaeaea', text: theme.palette.text.primary };
  }, [thresholds, theme]);

  // Generate Tree structure for Nivo Treemap
  const filteredHeatmapStocks = useMemo(() => {
    if (selectedHeatmapSector === 'all') {
      return stocksWithReturn;
    }
    return stocksWithReturn.filter(item => (item.stock.sector || 'Others') === selectedHeatmapSector);
  }, [stocksWithReturn, selectedHeatmapSector]);

  const treeData = useMemo(() => {
    if (filteredHeatmapStocks.length === 0) {
      return { id: 'root', name: 'root', children: [] };
    }

    if (groupBySector) {
      const sectorGroups: Record<string, any[]> = {};
      filteredHeatmapStocks.forEach(item => {
        const sectorName = item.stock.sector || 'Others';
        if (!sectorGroups[sectorName]) {
          sectorGroups[sectorName] = [];
        }

        const latestPrice = item.stock.current_price || item.currentPrice || 1;
        const priceRatio = item.currentPrice / latestPrice;
        const historicalMarketCap = (item.stock.market_cap || 1e9) * priceRatio;
        const sizeValue = sizeType === 'marketCap' ? historicalMarketCap : item.currentPrice;
        const colorInfo = getHeatmapColor(item.activeReturn);
        
        // Search query highlight fading
        const matchesSearch = !searchQuery || 
          item.stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.stock.name.toLowerCase().includes(searchQuery.toLowerCase());

        sectorGroups[sectorName].push({
          id: item.stock.ticker,
          name: item.stock.name,
          value: Math.max(0.1, sizeValue),
          cumulativeReturn: item.cumulativeReturn,
          dailyReturn: item.dailyReturn,
          activeReturn: item.activeReturn,
          currentPrice: item.currentPrice,
          color: matchesSearch ? colorInfo.bg : alpha(colorInfo.bg, 0.15),
          textColor: matchesSearch ? colorInfo.text : alpha(colorInfo.text, 0.3),
          sector: sectorName,
          market_cap: item.stock.market_cap || 0
        });
      });

      const children = Object.keys(sectorGroups).map(sectorName => ({
        id: sectorName,
        name: sectorName,
        children: sectorGroups[sectorName]
      }));

      return {
        id: 'root',
        name: 'root',
        children
      };
    } else {
      // Single group
      const children = filteredHeatmapStocks.map(item => {
        const latestPrice = item.stock.current_price || item.currentPrice || 1;
        const priceRatio = item.currentPrice / latestPrice;
        const historicalMarketCap = (item.stock.market_cap || 1e9) * priceRatio;
        const sizeValue = sizeType === 'marketCap' ? historicalMarketCap : item.currentPrice;
        const colorInfo = getHeatmapColor(item.activeReturn);
        
        // Search query highlight fading
        const matchesSearch = !searchQuery || 
          item.stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.stock.name.toLowerCase().includes(searchQuery.toLowerCase());

        return {
          id: item.stock.ticker,
          name: item.stock.name,
          value: Math.max(0.1, sizeValue),
          cumulativeReturn: item.cumulativeReturn,
          dailyReturn: item.dailyReturn,
          activeReturn: item.activeReturn,
          currentPrice: item.currentPrice,
          color: matchesSearch ? colorInfo.bg : alpha(colorInfo.bg, 0.15),
          textColor: matchesSearch ? colorInfo.text : alpha(colorInfo.text, 0.3),
          sector: item.stock.sector || 'Others',
          market_cap: item.stock.market_cap || 0
        };
      });

      return {
        id: 'root',
        name: 'root',
        children
      };
    }
  }, [filteredHeatmapStocks, groupBySector, sizeType, searchQuery, getHeatmapColor]);

  const renderTooltip = useCallback(({ node }: any) => {
    const data = node.data;
    if (!data || !data.id || data.currentPrice === undefined || node.data.children) return null; // Leaf nodes only

    const isKospiKosdaq = selectedIndexId.startsWith('kospi') || selectedIndexId.startsWith('kosdaq');
    const currencySign = isKospiKosdaq ? '₩' : '$';

    return (
      <Card
        sx={{
          p: 1.5,
          minWidth: 200,
          boxShadow: theme.shadows[10],
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          pointerEvents: 'none',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {data.id} • {data.name}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
          섹터: {data.sector}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          가격: {currencySign}{data.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          시가총액: {data.market_cap ? (data.market_cap / 1e9).toFixed(1) + 'B' : 'N/A'}
        </Typography>
        <Divider sx={{ my: 0.75 }} />
        <Stack spacing={0.25}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: data.cumulativeReturn >= 0 ? 'success.main' : 'error.main' }}>
            누적 수익률: {data.cumulativeReturn >= 0 ? '+' : ''}{data.cumulativeReturn.toFixed(2)}%
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: data.dailyReturn >= 0 ? 'success.main' : 'error.main' }}>
            당일 변동률: {data.dailyReturn >= 0 ? '+' : ''}{data.dailyReturn.toFixed(2)}%
          </Typography>
        </Stack>
      </Card>
    );
  }, [selectedIndexId, theme]);

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              주가지수 추세 & 히트맵 분석 📊🗺️
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              다양한 글로벌 지수의 구성 종목에 대한 다차원 회귀분석 추세 지표 및 백테스트 히트맵 타임라인 시뮬레이션을 제공합니다.
            </Typography>
          </Box>
          
          <Card sx={{ p: 1, display: 'flex', alignItems: 'center', minWidth: 260, border: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, mb: 0.5 }}>
                분석 대상 주가지수 선택
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={selectedIndexId}
                onChange={(e) => {
                  setSelectedIndexId(e.target.value);
                  setSearchQuery('');
                  setTrendFilter('all');
                  setSectorFilter('all');
                  setSelectedHeatmapSector('all');
                }}
                slotProps={{
                  select: {
                    MenuProps: {
                      PaperProps: {
                        sx: { maxHeight: 260 },
                      },
                    },
                  },
                }}
              >
                {INDEX_OPTIONS.map((option) => (
                  <MenuItem key={option.id} value={option.id} sx={{ fontSize: '0.875rem' }}>
                    {option.name}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {selectedIndex.description} • 총 {stockData.stocks.length}개 종목 분석 중 • 출처: {selectedIndex.data.source}
                </Typography>
              </Box>
            </Box>
          </Card>
        </Stack>

        {/* View Switcher Tabs */}
        <Tabs
          value={activeView}
          onChange={(e, v) => {
            setActiveView(v);
            setIsPlaying(false);
          }}
          sx={{
            borderBottom: `solid 1px ${theme.palette.divider}`,
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
            '& .MuiTab-root': {
              fontWeight: 800,
              fontSize: '1rem',
            }
          }}
        >
          <Tab icon={<TimelineRoundedIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="추세 분석" value="trend" />
          <Tab icon={<MapRoundedIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="히트맵" value="heatmap" />
        </Tabs>

        {/* 1. Trend Analysis View */}
        {activeView === 'trend' && (
          <StockMarketTrendView
            currentPeriod={currentPeriod}
            setCurrentPeriod={setCurrentPeriod}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            trendFilter={trendFilter}
            setTrendFilter={setTrendFilter}
            sectorFilter={sectorFilter}
            setSectorFilter={setSectorFilter}
            sortBy={sortBy}
            setSortOptions={setSortOptions}
            sortedStocks={sortedStocks}
            trendCounts={trendCounts}
            sectors={sectors}
            handleOpenModal={handleOpenModal}
          />
        )}

        {/* 2. Heatmap View */}
        {activeView === 'heatmap' && (
          <StockMarketHeatmapView
            currentPeriod={currentPeriod}
            setCurrentPeriod={setCurrentPeriod}
            valueType={valueType}
            setValueType={setValueType}
            groupBySector={groupBySector}
            setGroupBySector={setGroupBySector}
            sizeType={sizeType}
            setSizeType={setSizeType}
            selectedHeatmapSector={selectedHeatmapSector}
            setSelectedHeatmapSector={setSelectedHeatmapSector}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            dateIndex={dateIndex}
            setDateIndex={setDateIndex}
            playSpeed={playSpeed}
            setPlaySpeed={setPlaySpeed}
            availableDates={availableDates}
            treeData={treeData}
            renderTooltip={renderTooltip}
            handleOpenModal={handleOpenModal}
            thresholds={thresholds}
            isFullScreen={isFullScreen}
            setIsFullScreen={setIsFullScreen}
            sectors={sectors}
            selectedIndexId={selectedIndexId}
          />
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
