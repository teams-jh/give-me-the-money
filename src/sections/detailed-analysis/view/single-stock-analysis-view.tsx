'use client';

import type { PeriodKey } from 'src/sections/top100/types';

import ChartApex from 'react-apexcharts';
import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { alpha, useTheme } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';
import { allTickersData, tickers as allTickersList } from 'src/library/tickers';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

// ----------------------------------------------------------------------

const getLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatNumber = (num: number | null | undefined) => {
  if (num === null || num === undefined) return '데이터 없음 (null)';
  return num.toLocaleString();
};

const formatPercent = (num: number | null | undefined) => {
  if (num === null || num === undefined) return '데이터 없음 (null)';
  return `${(num * 100).toFixed(2)}%`;
};

const formatCurrency = (num: number | null | undefined, currency?: string) => {
  if (num === null || num === undefined) return '데이터 없음 (null)';
  const formatted = num.toLocaleString();
  if (currency === 'USD') return `$${formatted}`;
  return `${formatted} 원`;
};

const renderItem = (label: string, value: React.ReactNode, description?: string) => (
  <Box sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px dashed', borderColor: 'divider' }}>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 700, mt: 0.5 }}>
      {value}
    </Typography>
    {description && (
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
        {description}
      </Typography>
    )}
  </Box>
);

export function SingleStockAnalysisView() {
  const theme = useTheme();

  const [market, setMarket] = useState<'US' | 'KR'>('KR');
  const [period, setPeriod] = useState<PeriodKey | 'custom'>('1y');

  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const [startDate, setStartDate] = useState<string>(getLocalDateString(oneMonthAgo));
  const [endDate, setEndDate] = useState<string>(getLocalDateString(today));

  // SNT Motiv (064960.KS) as default
  const [selectedTicker, setSelectedTicker] = useState<string>('064960.KS');
  const [inputValue, setInputValue] = useState('');

  const handleMarketChange = (newMarket: 'US' | 'KR') => {
    setMarket(newMarket);
    if (newMarket === 'US') {
      if (selectedTicker.includes('.')) {
        setSelectedTicker('AAPL');
        setInputValue('');
      }
    } else {
      if (!selectedTicker.includes('.')) {
        setSelectedTicker('064960.KS');
        setInputValue('');
      }
    }
  };

  const tickerData = allTickersData[selectedTicker];

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

  const chartSeries = useMemo(() => {
    if (!tickerData || !tickerData.prices) return [];

    const daysMap = { '3m': 63, '1y': 252, '2y': 504, '3y': 756 };
    let slice = tickerData.prices;

    if (period === 'custom' && startDate && endDate) {
      slice = slice.filter((p) => p.date >= startDate && p.date <= endDate);
    } else {
      const days = daysMap[period === 'custom' ? '1y' : period];
      slice = slice.slice(-days);
    }

    return [
      {
        name: tickerData.info.kr_name || tickerData.info.name,
        data: slice.map((p) => ({
          x: new Date(p.date).getTime(),
          y: p.close,
        })),
      },
    ];
  }, [tickerData, period, startDate, endDate]);

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
        title: {
          text: '주가',
          style: { color: theme.palette.text.secondary, fontWeight: 600 },
        },
        labels: {
          style: { colors: theme.palette.text.secondary },
          formatter: (value: number) => value.toLocaleString(),
        },
      },
      stroke: { curve: 'smooth', width: 3 },
      colors: [theme.palette.primary.main],
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
    }),
    [theme]
  );

  if (!tickerData) {
    return (
      <DashboardContent maxWidth="xl">
        <Typography>데이터를 불러오는 중이거나 데이터가 없습니다.</Typography>
      </DashboardContent>
    );
  }

  const {
    info,
    market: marketData,
    liquidity,
    valuation,
    profitability,
    dividend,
    ownership,
  } = tickerData;

  const renderInfoCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        🏢 1. 기업 기본 정보 (info)
      </Typography>
      {renderItem(
        'name / kr_name',
        `${info.name} / ${info.kr_name || '-'}`,
        '기업의 영문명 및 국문명입니다.'
      )}
      {renderItem('exchange', info.exchange, '상장된 거래소입니다. (예: KSE = 한국거래소 코스피)')}
      {renderItem('currency', info.currency, '거래에 사용되는 통화입니다. (예: KRW = 대한민국 원)')}
      {renderItem(
        'sector / industry',
        `${info.sector} / ${info.industry}`,
        '기업이 속한 투자 섹터 및 세부 산업군입니다.'
      )}
      {renderItem('country', info.country, '기업의 소속 국가입니다.')}
      {renderItem('employees', formatNumber(info.employees), '총 직원 수입니다.')}
      {renderItem(
        'is_actively_trading',
        info.is_actively_trading ? 'true' : 'false',
        '현재 시장에서 정상적으로 거래 중인지 여부를 나타냅니다.'
      )}
    </Card>
  );

  const renderMarketCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        📊 2. 시장 및 주가 현황 (market)
      </Typography>
      {renderItem(
        'market_cap',
        formatCurrency(marketData.market_cap, info.currency),
        '시가총액. 주식 시장에서 평가받는 회사 전체의 가치 규모입니다.'
      )}
      {renderItem(
        'shares_outstanding',
        `${formatNumber(marketData.shares_outstanding)} 주`,
        '회사가 발행한 총 주식 수입니다.'
      )}
      {renderItem(
        'float_shares',
        `${formatNumber(marketData.float_shares)} 주`,
        '유동 주식 수. 대주주 지분 등을 제외하고 실제 시장에서 거래 가능한 주식 수입니다.'
      )}
      {renderItem(
        'price',
        formatCurrency(marketData.price, info.currency),
        '현재(또는 가장 최근 종가) 주가입니다.'
      )}
      {renderItem(
        'previous_close',
        formatCurrency(marketData.previous_close, info.currency),
        '전일 종가입니다.'
      )}
      {renderItem(
        '52_week_high / low',
        `${formatCurrency(marketData.fifty_two_week_high, info.currency)} / ${formatCurrency(marketData.fifty_two_week_low, info.currency)}`,
        '최근 52주(1년) 동안 기록한 최고가와 최저가입니다.'
      )}
      {renderItem(
        'beta',
        marketData.beta,
        '베타 지수. 시장(코스피) 전체가 움직일 때 이 주식이 얼마나 민감하게 반응하는지 보여줍니다. 기준점 1보다 낮으면 코스피보다 완만하게(안전하게) 움직이며, 높으면 더 격하게 요동칩니다.'
      )}
    </Card>
  );

  const renderLiquidityCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        🌊 3. 거래량 및 유동성 (liquidity)
      </Typography>
      {renderItem(
        'avg_daily_volume_3m',
        `${formatNumber(liquidity.avg_daily_volume_3m)} 주`,
        '최근 3개월간 하루 평균 거래량입니다. 평소 이 주식이 얼마나 활발히 거래되는지 보여줍니다.'
      )}
      {renderItem(
        'avg_daily_volume_10d',
        `${formatNumber(liquidity.avg_daily_volume_10d)} 주`,
        '최근 10일간 하루 평균 거래량입니다. 최근 들어 시장의 관심이 쏠리며 거래량이 변했는지 파악할 수 있습니다.'
      )}
    </Card>
  );

  const renderValuationCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        ⚖️ 4. 가치 평가 (valuation)
      </Typography>
      {renderItem(
        'trailing_pe / forward_pe',
        `${formatNumber(valuation?.trailing_pe)} / ${formatNumber(valuation?.forward_pe)}`,
        'PER (주가수익비율). 회사가 벌어들이는 이익에 비해 주가가 몇 배로 거래되는지 보여줍니다. 회사를 통째로 인수할 때 본전을 뽑는 데 걸리는 연수와 같습니다. 낮을수록 저평가 상태입니다. (trailing=과거 1년, forward=향후 예상)'
      )}
      {renderItem(
        'peg_ratio',
        formatNumber(valuation?.peg_ratio),
        'PEG 비율 (주가수익성장성비율). PER을 이익성장률로 나눈 값으로, 낮을수록 성장성에 비해 주가가 저렴하다는 뜻입니다.'
      )}
      {renderItem(
        'price_to_book',
        formatNumber(valuation?.price_to_book),
        'PBR (주가순자산비율). 회사가 망해서 당장 재산을 청산할 때의 장부 가치 대비 주가입니다. 1.0 미만이면 가진 재산보다도 주가가 싸게 거래되는 전형적인 자산주 성격을 띱니다.'
      )}
      {renderItem(
        'trailing_eps / forward_eps',
        `${formatNumber(valuation?.trailing_eps)} / ${formatNumber(valuation?.forward_eps)}`,
        'EPS (주당순이익). 회사가 벌어들인 총 순이익을 총 주식 수로 나눈 값으로, 주식 1주당 얼마를 벌었는지 보여주는 기업의 기초 체력입니다.'
      )}
      {renderItem(
        'enterprise_value',
        formatCurrency(valuation?.enterprise_value, info.currency),
        'EV (기업가치). 시가총액에 순차입금(갚아야 할 빚 - 쥐고 있는 현금)을 합쳐서, 회사를 통째로 매수할 때 실제로 지불해야 하는 진짜 인수 가격입니다.'
      )}
    </Card>
  );

  const renderProfitabilityCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        📈 5. 수익성 및 성장성 (profitability)
      </Typography>
      {renderItem(
        'gross_margins',
        formatPercent(profitability.gross_margins),
        '매출총이익률. 제품을 팔고 나서 원가만 뺐을 때 남는 순수한 제품의 마진율입니다.'
      )}
      {renderItem(
        'operating_margins',
        formatPercent(profitability.operating_margins),
        '영업이익률. 인건비, 마케팅비 등 회사 운영비를 전부 빼고 본업 자체로 남긴 마진입니다.'
      )}
      {renderItem(
        'profit_margins',
        formatPercent(profitability.profit_margins),
        '순이익률. 세금과 이자까지 모두 내고 최종적으로 회사 금고에 꽂힌 돈의 비율입니다.'
      )}
      {renderItem(
        'roe',
        formatPercent(profitability.roe),
        'ROE (자기자본이익률). 주주들이 투자한 돈(자본)을 이용해 1년간 몇 %의 이익을 굴렸는지 보여주는 투자 효율성 지표입니다.'
      )}
      {renderItem(
        'roa',
        formatPercent(profitability.roa),
        'ROA (총자산이익률). 주주의 돈뿐 아니라 은행 빚(부채)까지 모두 합친 총자산을 굴려 몇 %의 이익을 냈는지 보여줍니다.'
      )}
      {renderItem(
        'revenue_growth',
        formatPercent(profitability.revenue_growth),
        '매출액 성장률. 전년 대비 매출 규모가 얼마나 커졌는지를 나타냅니다.'
      )}
      {renderItem(
        'earnings_growth',
        formatPercent(profitability.earnings_growth),
        '순이익 성장률. 전년 대비 회사가 남긴 순수익이 얼마나 증가했는지를 나타냅니다.'
      )}

      {profitability.quarterly_earnings && profitability.quarterly_earnings.length > 0 && (
        <Box sx={{ mt: 1, p: 2, bgcolor: alpha(theme.palette.grey[500], 0.08), borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            quarterly_earnings (분기별 당기순이익)
          </Typography>
          <Stack spacing={1}>
            {profitability.quarterly_earnings.map((q) => (
              <Box key={q.quarter} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {q.quarter}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {formatCurrency(q.net_income, info.currency)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Card>
  );

  const renderDividendCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        🎁 6. 배당 정보 (dividend)
      </Typography>
      {renderItem(
        'rate',
        formatCurrency(dividend?.rate, info.currency),
        '주당 배당금. 1주를 가지고 있을 때 지급되는 배당금 액수입니다.'
      )}
      {renderItem(
        'yield',
        formatPercent(dividend?.yield),
        '배당수익률. 현재 주가 기준으로 주식을 샀을 때, 은행 이자처럼 1년에 받을 수 있는 예상 수익률입니다.'
      )}
      {renderItem(
        'payout_ratio',
        formatPercent(dividend?.payout_ratio),
        '배당성향. 회사가 열심히 벌어들인 1년 순이익 중에서 몇 %를 주주들에게 배당으로 쏴주는지를 의미합니다. 이 수치가 높을수록 주주 환원에 적극적인 기업입니다.'
      )}
      {renderItem(
        'avg_yield_3y',
        formatPercent(dividend?.avg_yield_3y),
        '최근 3개년 동안의 평균 배당수익률입니다. 현재 배당수익률과 비교하여 지금 주가가 배당 관점에서 매력적인지 판단할 수 있습니다.'
      )}
    </Card>
  );

  const renderOwnershipCard = (
    <Card sx={{ p: 3, height: '100%', boxShadow: theme.customShadows?.card }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>
        🤝 7. 지분 구조 (ownership)
      </Typography>
      {renderItem(
        'held_pct_institutions',
        formatPercent(ownership?.held_pct_institutions),
        '기관 투자자들이 보유하고 있는 지분의 비율입니다.'
      )}
      {renderItem(
        'held_pct_insiders',
        formatPercent(ownership?.held_pct_insiders),
        '내부자(대주주 및 경영진) 지분율입니다. 이 수치가 단단하게 유지될수록 경영권이 안정적이고 시장 유통 물량이 적어집니다.'
      )}
      {renderItem(
        'short_ratio',
        formatNumber(ownership?.short_ratio),
        '공매도 비율. 특정 기간 동안 일어난 거래 중 주가 하락에 베팅한 공매도의 비중을 나타냅니다.'
      )}
    </Card>
  );

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
              단일 종목 분석 📊
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              종목을 선택하여 주요 재무 지표와 주가 추이, 그리고 각 수치의 의미를 상세히 분석해
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
              options={tickerOptions}
              getOptionLabel={(option) => `${option.name} (${option.ticker})`}
              value={tickerOptions.find((o) => o.ticker === selectedTicker) || null}
              onChange={(e, v) => {
                if (v) setSelectedTicker(v.ticker);
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
                  label="종목 검색 및 선택"
                  placeholder="티커 또는 회사명 검색..."
                />
              )}
            />

            <Box sx={{ height: 400 }}>
              <ChartApex options={chartOptions} series={chartSeries} type="line" height="100%" />
            </Box>
          </Stack>
        </Card>

        {selectedTicker === '064960.KS' && (
          <Alert severity="info" sx={{ fontWeight: 700 }}>
            💡 SNT모티브 한 줄 요약: 현재 SNT모티브는 주가가 1년 중 최저점 부근까지 내려와 있지만,
            최근 분기 순이익이 성장하고 있으며, 약 5.8% 수준의 높은 배당 수익률을 주는
            &apos;안정적인 고배당 가치주&apos; 성격을 띠고 있습니다.
          </Alert>
        )}

        {selectedTicker === 'AAPL' && (
          <Alert severity="info" sx={{ fontWeight: 700 }}>
            💡 애플(AAPL) 한 줄 요약: 애플은 전 세계 시가총액 최상위의 빅테크 기업으로, 독보적인
            생태계와 브랜드 파워를 바탕으로 강력한 현금 흐름과 높은 수익성을 유지하고 있는 대표적인
            성장주 및 주주환원 우수 기업입니다.
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderInfoCard}</Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderMarketCard}</Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderLiquidityCard}</Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderValuationCard}</Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderProfitabilityCard}</Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderDividendCard}</Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>{renderOwnershipCard}</Grid>
        </Grid>
      </Stack>
    </DashboardContent>
  );
}
