'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import ChartApex from 'react-apexcharts';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import ToggleButton from '@mui/material/ToggleButton';
import { alpha, useTheme } from '@mui/material/styles';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DashboardContent } from 'src/layouts/dashboard';
import { allTickersData, tickers as allTickersList } from 'src/library/tickers';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

// ----------------------------------------------------------------------

const getColorForRatio = (ratio: number) => {
  if (ratio < 0.5) {
    const p = ratio * 2;
    const r = Math.round(229 + (240 - 229) * p);
    const g = Math.round(57 + (240 - 57) * p);
    const b = Math.round(53 + (240 - 53) * p);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const p = (ratio - 0.5) * 2;
    const r = Math.round(240 + (76 - 240) * p);
    const g = Math.round(240 + (175 - 240) * p);
    const b = Math.round(240 + (80 - 240) * p);
    return `rgb(${r}, ${g}, ${b})`;
  }
};

const getTextColorForRatio = (ratio: number) =>
  ratio < 0.25 || ratio > 0.75 ? '#ffffff' : '#111111';

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatValue = (num: number | null | undefined, unit: string, currency?: string) => {
  if (num === null || num === undefined) return 'N/A';
  if (unit === 'currency') {
    const formatted = num.toLocaleString();
    if (currency === 'USD') return `$${formatted}`;
    return `${formatted} 원`;
  }
  if (unit === 'percent') {
    return `${(num * 100).toFixed(2)}%`;
  }
  return num.toLocaleString();
};

const METRICS = [
  // 1. 기업 기본 정보
  {
    value: 'employees',
    label: '직원 수 (Employees)',
    description: '기업의 총 직원 수입니다.',
    unit: 'number',
    category: '기업 기본 정보',
  },
  // 2. 시장 및 주가 현황
  {
    value: 'market_cap',
    label: '시가총액 (Market Cap)',
    description: '시가총액. 주식 시장에서 평가받는 회사 전체의 가치 규모입니다.',
    unit: 'currency',
    category: '시장 및 주가 현황',
  },
  {
    value: 'shares_outstanding',
    label: '총 발행 주식 수 (Shares Outstanding)',
    description: '회사가 발행한 총 주식 수입니다.',
    unit: 'number',
    category: '시장 및 주가 현황',
  },
  {
    value: 'float_shares',
    label: '유동 주식 수 (Float Shares)',
    description: '대주주 지분 등을 제외하고 실제 시장에서 거래 가능한 주식 수입니다.',
    unit: 'number',
    category: '시장 및 주가 현황',
  },
  {
    value: 'price',
    label: '현재가 (Price)',
    description: '현재(또는 가장 최근 종가) 주가입니다.',
    unit: 'currency',
    category: '시장 및 주가 현황',
  },
  {
    value: 'previous_close',
    label: '전일 종가 (Previous Close)',
    description: '전일 종가입니다.',
    unit: 'currency',
    category: '시장 및 주가 현황',
  },
  {
    value: 'fifty_two_week_high',
    label: '52주 최고가 (52W High)',
    description: '최근 52주(1년) 동안 기록한 최고가입니다.',
    unit: 'currency',
    category: '시장 및 주가 현황',
  },
  {
    value: 'fifty_two_week_low',
    label: '52주 최저가 (52W Low)',
    description: '최근 52주(1년) 동안 기록한 최저가입니다.',
    unit: 'currency',
    category: '시장 및 주가 현황',
  },
  {
    value: 'beta',
    label: '베타 (Beta)',
    description:
      '베타 지수. 시장(코스피) 전체가 움직일 때 이 주식이 얼마나 민감하게 반응하는지 보여줍니다. 기준점 1보다 낮으면 코스피보다 완만하게(안전하게) 움직이며, 높으면 더 격하게 요동칩니다.',
    unit: 'number',
    category: '시장 및 주가 현황',
  },
  // 3. 거래량 및 유동성
  {
    value: 'avg_daily_volume_3m',
    label: '3개월 평균 거래량 (Avg Volume 3M)',
    description:
      '최근 3개월간 하루 평균 거래량입니다. 평소 이 주식이 얼마나 활발히 거래되는지 보여줍니다.',
    unit: 'number',
    category: '거래량 및 유동성',
  },
  {
    value: 'avg_daily_volume_10d',
    label: '10일 평균 거래량 (Avg Volume 10D)',
    description:
      '최근 10일간 하루 평균 거래량입니다. 최근 들어 거래량이 급변했는지 파악할 수 있습니다.',
    unit: 'number',
    category: '거래량 및 유동성',
  },
  // 4. 가치 평가
  {
    value: 'trailing_pe',
    label: 'Trailing P/E (과거 PER)',
    description:
      'PER (주가수익비율). 회사가 벌어들이는 이익에 비해 주가가 몇 배로 거래되는지 보여줍니다. 낮을수록 저평가 상태입니다. (과거 1년)',
    unit: 'number',
    category: '가치 평가',
  },
  {
    value: 'forward_pe',
    label: 'Forward P/E (예상 PER)',
    description: '향후 예상 이익에 대비한 주가수익비율입니다.',
    unit: 'number',
    category: '가치 평가',
  },
  {
    value: 'peg_ratio',
    label: 'PEG 비율 (PEG Ratio)',
    description:
      'PEG 비율 (주가수익성장성비율). PER을 이익성장률로 나눈 값으로, 낮을수록 성장성에 비해 주가가 저렴하다는 뜻입니다.',
    unit: 'number',
    category: '가치 평가',
  },
  {
    value: 'price_to_book',
    label: 'PBR (Price to Book)',
    description:
      'PBR (주가순자산비율). 회사가 망해서 당장 재산을 청산할 때의 장부 가치 대비 주가입니다.',
    unit: 'number',
    category: '가치 평가',
  },
  {
    value: 'trailing_eps',
    label: 'Trailing EPS (주당순이익)',
    description:
      'EPS (주당순이익). 회사가 벌어들인 과거 1년 총 순이익을 총 주식 수로 나눈 값입니다.',
    unit: 'number',
    category: '가치 평가',
  },
  {
    value: 'forward_eps',
    label: 'Forward EPS (예상 주당순이익)',
    description: '향후 예상되는 EPS (주당순이익)입니다.',
    unit: 'number',
    category: '가치 평가',
  },
  {
    value: 'enterprise_value',
    label: 'EV (기업가치)',
    description:
      'EV (기업가치). 시가총액에 순차입금(갚아야 할 빚 - 쥐고 있는 현금)을 합친 진짜 인수 가격입니다.',
    unit: 'currency',
    category: '가치 평가',
  },
  // 5. 수익성 및 성장성
  {
    value: 'gross_margins',
    label: '매출총이익률 (Gross Margins)',
    description: '매출총이익률. 제품을 팔고 나서 원가만 뺐을 때 남는 마진율입니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  {
    value: 'operating_margins',
    label: '영업이익률 (Operating Margins)',
    description: '영업이익률. 회사 운영비를 전부 빼고 본업 자체로 남긴 마진입니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  {
    value: 'profit_margins',
    label: '순이익률 (Profit Margins)',
    description: '순이익률. 세금과 이자까지 모두 내고 최종적으로 회사 금고에 꽂힌 돈의 비율입니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  {
    value: 'roe',
    label: 'ROE (자기자본이익률)',
    description:
      '자기자본이익률. 주주들이 투자한 돈(자본)을 이용해 1년간 몇 %의 이익을 굴렸는지 보여주는 투자 효율성 지표입니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  {
    value: 'roa',
    label: 'ROA (총자산이익률)',
    description: '총자산이익률. 부채까지 모두 합친 총자산을 굴려 몇 %의 이익을 냈는지 보여줍니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  {
    value: 'revenue_growth',
    label: '매출액 성장률 (Revenue Growth)',
    description: '전년 대비 매출 규모가 얼마나 커졌는지를 나타냅니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  {
    value: 'earnings_growth',
    label: '순이익 성장률 (Earnings Growth)',
    description: '전년 대비 회사가 남긴 순수익이 얼마나 증가했는지를 나타냅니다.',
    unit: 'percent',
    category: '수익성 및 성장성',
  },
  // 6. 배당 정보
  {
    value: 'dividend_rate',
    label: '주당 배당금 (Dividend Rate)',
    description: '1주를 가지고 있을 때 지급되는 배당금 액수입니다.',
    unit: 'currency',
    category: '배당 정보',
  },
  {
    value: 'dividend_yield',
    label: '배당수익률 (Dividend Yield)',
    description:
      '배당수익률. 현재 주가 기준으로 주식을 샀을 때, 은행 이자처럼 1년에 받을 수 있는 예상 수익률입니다.',
    unit: 'percent',
    category: '배당 정보',
  },
  {
    value: 'dividend_payout_ratio',
    label: '배당성향 (Payout Ratio)',
    description: '회사가 1년 순이익 중에서 몇 %를 주주들에게 배당으로 지급하는지를 의미합니다.',
    unit: 'percent',
    category: '배당 정보',
  },
  {
    value: 'dividend_avg_yield_3y',
    label: '3년 평균 배당수익률 (Avg Yield 3Y)',
    description: '최근 3개년 동안의 평균 배당수익률입니다.',
    unit: 'percent',
    category: '배당 정보',
  },
  // 7. 지분 구조
  {
    value: 'held_pct_institutions',
    label: '기관 지분율 (Held Pct Institutions)',
    description: '기관 투자자들이 보유하고 있는 지분의 비율입니다.',
    unit: 'percent',
    category: '지분 구조',
  },
  {
    value: 'held_pct_insiders',
    label: '내부자 지분율 (Held Pct Insiders)',
    description: '내부자(대주주 및 경영진) 지분율입니다.',
    unit: 'percent',
    category: '지분 구조',
  },
  {
    value: 'short_ratio',
    label: '공매도 비율 (Short Ratio)',
    description: '특정 기간 동안 일어난 거래 중 주가 하락에 베팅한 공매도의 비중을 나타냅니다.',
    unit: 'number',
    category: '지분 구조',
  },
];

const groupedMetrics = METRICS.reduce(
  (acc, m) => {
    if (!acc[m.category]) {
      acc[m.category] = [];
    }
    acc[m.category].push(m);
    return acc;
  },
  {} as Record<string, typeof METRICS>
);

const getMetricValue = (ticker: string, metric: string) => {
  const data = allTickersData[ticker];
  if (!data) return null;
  switch (metric) {
    case 'employees':
      return data.info?.employees;
    case 'market_cap':
      return data.market?.market_cap;
    case 'shares_outstanding':
      return data.market?.shares_outstanding;
    case 'float_shares':
      return data.market?.float_shares;
    case 'price':
      return data.market?.price;
    case 'previous_close':
      return data.market?.previous_close;
    case 'fifty_two_week_high':
      return data.market?.fifty_two_week_high;
    case 'fifty_two_week_low':
      return data.market?.fifty_two_week_low;
    case 'beta':
      return data.market?.beta;
    case 'avg_daily_volume_3m':
      return data.liquidity?.avg_daily_volume_3m;
    case 'avg_daily_volume_10d':
      return data.liquidity?.avg_daily_volume_10d;
    case 'trailing_pe':
      return data.valuation?.trailing_pe;
    case 'forward_pe':
      return data.valuation?.forward_pe;
    case 'peg_ratio':
      return data.valuation?.peg_ratio;
    case 'price_to_book':
      return data.valuation?.price_to_book;
    case 'trailing_eps':
      return data.valuation?.trailing_eps;
    case 'forward_eps':
      return data.valuation?.forward_eps;
    case 'enterprise_value':
      return data.valuation?.enterprise_value;
    case 'gross_margins':
      return data.profitability?.gross_margins;
    case 'operating_margins':
      return data.profitability?.operating_margins;
    case 'profit_margins':
      return data.profitability?.profit_margins;
    case 'roe':
      return data.profitability?.roe;
    case 'roa':
      return data.profitability?.roa;
    case 'revenue_growth':
      return data.profitability?.revenue_growth;
    case 'earnings_growth':
      return data.profitability?.earnings_growth;
    case 'dividend_rate':
      return data.dividend?.rate;
    case 'dividend_yield':
      return data.dividend?.yield;
    case 'dividend_payout_ratio':
      return data.dividend?.payout_ratio;
    case 'dividend_avg_yield_3y':
      return data.dividend?.avg_yield_3y;
    case 'held_pct_institutions':
      return data.ownership?.held_pct_institutions;
    case 'held_pct_insiders':
      return data.ownership?.held_pct_insiders;
    case 'short_ratio':
      return data.ownership?.short_ratio;
    default:
      return null;
  }
};

// Generate list of themes (unique sectors & industries)
interface ThemeOption {
  value: string;
  type: 'Sector' | 'Industry';
}

const themesList: ThemeOption[] = (() => {
  const sectors = new Set<string>();
  const industries = new Set<string>();
  Object.values(allTickersData).forEach((data) => {
    if (data?.info?.sector) sectors.add(data.info.sector);
    if (data?.info?.industry) industries.add(data.info.industry);
  });
  return [
    ...Array.from(sectors).map((s) => ({ value: s, type: 'Sector' as const })),
    ...Array.from(industries).map((i) => ({ value: i, type: 'Industry' as const })),
  ].sort((a, b) => a.value.localeCompare(b.value));
})();

export function ThemeAnalysisView() {
  const theme = useTheme();

  const [market, setMarket] = useState<'US' | 'KR'>('KR');
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('1y');

  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const [startDate, setStartDate] = useState<string>(getLocalDateString(oneMonthAgo));
  const [endDate, setEndDate] = useState<string>(getLocalDateString(today));

  // Default theme is Auto Parts
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption | null>(
    themesList.find((t) => t.value === 'Auto Parts' || t.value === 'Automotive') ||
      themesList[0] ||
      null
  );

  const getThemeTickers = useCallback(
    (themeOpt: ThemeOption | null, currentMarket: 'US' | 'KR') => {
      if (!themeOpt) return [];
      return allTickersList.filter((ticker) => {
        const isUS = !ticker.includes('.');
        if (currentMarket === 'US' && !isUS) return false;
        if (currentMarket === 'KR' && isUS) return false;

        const data = allTickersData[ticker];
        return data?.info?.sector === themeOpt.value || data?.info?.industry === themeOpt.value;
      });
    },
    []
  );

  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');

  const [selectedMetric, setSelectedMetric] = useState<string>('trailing_pe');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'list' | 'heatmap'>('list');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Pre-populate when selectedTheme or market changes
  useEffect(() => {
    const tickers = getThemeTickers(selectedTheme, market);
    setSelectedTickers(tickers);
  }, [selectedTheme, market, getThemeTickers]);

  const handleMarketChange = (newMarket: 'US' | 'KR') => {
    setMarket(newMarket);
    setInputValue('');
  };

  const tickerOptions = useMemo(() => {
    const filteredList = allTickersList.filter((ticker) => {
      if (market === 'US') {
        return !ticker.includes('.');
      }
      return ticker.includes('.');
    });

    return filteredList.map((ticker) => ({
      ticker,
      name: allTickersData[ticker]?.info?.kr_name || allTickersData[ticker]?.info?.name || ticker,
    }));
  }, [market]);

  const selectedOptions = useMemo(
    () =>
      selectedTickers.map(
        (t) => tickerOptions.find((o) => o.ticker === t) || { ticker: t, name: t }
      ),
    [selectedTickers, tickerOptions]
  );

  const chartSeries = useMemo(
    () =>
      selectedTickers
        .map((ticker) => {
          const data = allTickersData[ticker];
          if (!data || !data.prices) return null;

          const daysMap: Record<string, number> = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
          let slice = data.prices;

          if (period === 'custom' && startDate && endDate) {
            slice = slice.filter((p) => p.date >= startDate && p.date <= endDate);
          } else {
            const days = daysMap[period === 'custom' ? '1y' : period];
            slice = slice.slice(-days);
          }

          return {
            name: data.info?.kr_name || data.info?.name || ticker,
            data: slice.map((p) => ({
              x: new Date(p.date).getTime(),
              y: p.close,
            })),
          };
        })
        .filter((s) => s !== null) as any[],
    [selectedTickers, period, startDate, endDate]
  );

  const chartOptions = useMemo<any>(
    () => ({
      chart: {
        toolbar: { show: true },
        zoom: { enabled: true },
        background: 'transparent',
        fontFamily: theme.typography.fontFamily,
      },
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: theme.palette.text.secondary } },
      },
      yaxis: {
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) => value.toLocaleString(),
        },
      },
      stroke: { curve: 'smooth', width: 2 },
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
        y: {
          formatter: (value: number) => value.toLocaleString(),
        },
      },
      grid: {
        borderColor: alpha(theme.palette.grey[500], 0.1),
        strokeDashArray: 3,
      },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        labels: { colors: theme.palette.text.primary },
      },
    }),
    [theme]
  );

  const treeData = useMemo(() => {
    const children = selectedTickers.map((ticker) => {
      const data = allTickersData[ticker];
      const name = data?.info?.kr_name || data?.info?.name || ticker;

      const sizeVal = data?.market?.market_cap || 1;
      const val = getMetricValue(ticker, selectedMetric);

      return {
        id: ticker,
        name,
        sizeVal,
        val,
        currency: data?.info?.currency,
      };
    });

    const valList = children
      .map((c) => c.val)
      .filter((v): v is number => v !== null && v !== undefined);

    const min = valList.length > 0 ? Math.min(...valList) : 0;
    const max = valList.length > 0 ? Math.max(...valList) : 0;

    const metric = METRICS.find((m) => m.value === selectedMetric);
    const higherIsBetter =
      metric?.unit === 'percent' ||
      metric?.value === 'market_cap' ||
      metric?.value === 'roe' ||
      metric?.value === 'roa' ||
      metric?.value === 'revenue_growth' ||
      metric?.value === 'earnings_growth' ||
      metric?.value === 'dividend_yield' ||
      metric?.value === 'held_pct_institutions' ||
      metric?.value === 'held_pct_insiders';

    const normalizedChildren = children.map((c) => {
      let ratio = 0.5;
      if (c.val !== null && c.val !== undefined && max !== min) {
        const rawRatio = (c.val - min) / (max - min);
        ratio = higherIsBetter ? rawRatio : 1 - rawRatio;
      }

      const color = c.val === null || c.val === undefined ? '#e0e0e0' : getColorForRatio(ratio);
      const textColor =
        c.val === null || c.val === undefined ? '#888888' : getTextColorForRatio(ratio);

      return {
        id: c.id,
        name: c.name,
        value: c.sizeVal,
        metricValue: c.val,
        formattedValue: formatValue(c.val, metric?.unit || 'number', c.currency),
        color,
        textColor,
      };
    });

    return {
      id: 'root',
      children: normalizedChildren,
    };
  }, [selectedTickers, selectedMetric]);

  const renderTooltip = useCallback(
    ({ node }: any) => {
      const data = node.data;
      if (!data || !data.id || node.data.children) return null;

      const metric = METRICS.find((m) => m.value === selectedMetric) || METRICS[0];

      return (
        <Card
          sx={{
            p: 1.5,
            minWidth: 180,
            boxShadow: theme.customShadows?.dropdown || theme.shadows[10],
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            {data.id} • {data.name}
          </Typography>
          <Divider sx={{ my: 0.75 }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {metric.label}: {data.formattedValue}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
            크기(시가총액): {data.value ? (data.value / 1e8).toLocaleString() + ' 억' : 'N/A'}
          </Typography>
        </Card>
      );
    },
    [theme, selectedMetric]
  );

  const rankingData = useMemo(
    () =>
      selectedTickers
        .map((ticker) => {
          const val = getMetricValue(ticker, selectedMetric);
          const data = allTickersData[ticker];
          return {
            ticker,
            name: data?.info?.kr_name || data?.info?.name || ticker,
            value: val,
            currency: data?.info?.currency,
          };
        })
        .sort((a, b) => {
          if (a.value === null || a.value === undefined) return 1;
          if (b.value === null || b.value === undefined) return -1;
          return sortOrder === 'asc' ? a.value - b.value : b.value - a.value;
        }),
    [selectedTickers, selectedMetric, sortOrder]
  );

  const metricObj = METRICS.find((m) => m.value === selectedMetric) || METRICS[0];

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
          sx={{ pb: 1 }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              테마 분석 🏷️
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              특정 테마(섹터/산업군)를 선택하여 소속 종목들의 추이를 비교하고 자유롭게 종목을 조절해
              보세요.
            </Typography>
          </Box>

          <MarketPeriodSelector
            market={market}
            period={period}
            startDate={startDate}
            endDate={endDate}
            onMarketChange={handleMarketChange}
            onPeriodChange={setPeriod}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </Stack>

        <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
          <Stack spacing={3}>
            <Autocomplete
              fullWidth
              options={themesList}
              groupBy={(option) => option.type}
              getOptionLabel={(option) => option.value}
              value={selectedTheme}
              onChange={(e, v) => setSelectedTheme(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="분석할 테마(섹터/산업군) 선택"
                  placeholder="테마 검색 및 선택..."
                />
              )}
            />

            <Autocomplete
              multiple
              fullWidth
              options={tickerOptions}
              getOptionLabel={(option) => `${option.name} (${option.ticker})`}
              value={selectedOptions}
              onChange={(e, v) => {
                setSelectedTickers(v.map((opt) => opt.ticker));
              }}
              inputValue={inputValue}
              onInputChange={(e, v) => setInputValue(v)}
              filterOptions={(options, state) => {
                const query = state.inputValue.toLowerCase();
                return options.filter(
                  (opt) =>
                    opt.ticker.toLowerCase().includes(query) ||
                    opt.name.toLowerCase().includes(query)
                );
              }}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.ticker}>
                  <Stack>
                    <Typography variant="subtitle2">{option.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {option.ticker}
                    </Typography>
                  </Stack>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="비교할 종목 추가/제외 (해당 테마 종목 자동 추가됨)"
                  placeholder="티커 또는 회사명 검색..."
                />
              )}
            />

            <Box sx={{ height: 400 }}>
              <ChartApex options={chartOptions} series={chartSeries} type="line" height="100%" />
            </Box>
          </Stack>
        </Card>

        <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
          <Stack spacing={3}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                📊 테마 내 기업 지표 비교
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                {viewMode === 'list' && (
                  <ToggleButtonGroup
                    size="small"
                    value={sortOrder}
                    exclusive
                    onChange={(e, val) => {
                      if (val !== null) setSortOrder(val);
                    }}
                    color="primary"
                  >
                    <ToggleButton value="asc" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>
                      오름차순 ⬇️
                    </ToggleButton>
                    <ToggleButton value="desc" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>
                      내림차순 ⬆️
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}

                <ToggleButtonGroup
                  size="small"
                  value={viewMode}
                  exclusive
                  onChange={(e, val) => {
                    if (val !== null) setViewMode(val);
                  }}
                  color="primary"
                >
                  <ToggleButton value="list" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>
                    리스트 보기
                  </ToggleButton>
                  <ToggleButton value="heatmap" sx={{ px: 1.5, py: 0.5, fontWeight: 700 }}>
                    히트맵 보기 🔥
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {Object.entries(groupedMetrics).map(([category, items]) => (
                <Box key={category}>
                  <Typography
                    variant="subtitle2"
                    sx={{ color: 'primary.main', mb: 1.2, fontWeight: 700 }}
                  >
                    🏷️ {category}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {items.map((m) => (
                      <Button
                        key={m.value}
                        variant={selectedMetric === m.value ? 'contained' : 'outlined'}
                        color={selectedMetric === m.value ? 'primary' : 'inherit'}
                        size="small"
                        onClick={() => setSelectedMetric(m.value)}
                        sx={{
                          borderRadius: 1.5,
                          textTransform: 'none',
                          fontWeight: selectedMetric === m.value ? 700 : 500,
                          fontSize: '0.8rem',
                          py: 0.6,
                          px: 1.5,
                        }}
                      >
                        {m.label}
                      </Button>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>

            <Alert severity="info" sx={{ fontWeight: 600 }}>
              💡 {metricObj.description}
            </Alert>

            {viewMode === 'list' ? (
              <Stack spacing={2} sx={{ mt: 2 }}>
                {rankingData.map((item, index) => (
                  <Box
                    key={item.ticker}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 2,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.grey[500], 0.04),
                      border: '1px solid',
                      borderColor: alpha(theme.palette.grey[500], 0.1),
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Typography
                        variant="h6"
                        sx={{
                          color: 'text.secondary',
                          width: 24,
                          textAlign: 'center',
                          fontWeight: 800,
                        }}
                      >
                        {index + 1}
                      </Typography>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {item.ticker}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {formatValue(item.value, metricObj.unit, item.currency)}
                    </Typography>
                  </Box>
                ))}
                {rankingData.length === 0 && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                    종목을 선택해주세요.
                  </Typography>
                )}
              </Stack>
            ) : (
              <Box
                sx={{
                  height: 500,
                  width: '100%',
                  bgcolor: 'background.neutral',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  p: 1,
                  mt: 2,
                }}
              >
                {isMounted ? (
                  selectedTickers.length > 0 ? (
                    <ResponsiveTreeMap
                      data={treeData}
                      identity="id"
                      value="value"
                      valueFormat=""
                      margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                      labelSkipSize={16}
                      label={(node: any) =>
                        node.data.name ? `${node.data.name} (${node.data.formattedValue})` : node.id
                      }
                      labelTextColor={(node: any) => node.data.textColor || '#ffffff'}
                      colors={(node: any) => node.data.color || '#cccccc'}
                      borderWidth={1.5}
                      borderColor={() => theme.palette.background.paper}
                      parentLabelPosition="top"
                      parentLabelSize={24}
                      parentLabelTextColor={theme.palette.text.primary}
                      nodeOpacity={1}
                      tooltip={renderTooltip}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        비교할 종목을 추가해 주세요.
                      </Typography>
                    </Box>
                  )
                ) : (
                  <Box
                    sx={{
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      히트맵을 불러오는 중입니다...
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Stack>
        </Card>
      </Stack>
    </DashboardContent>
  );
}
