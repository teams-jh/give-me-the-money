'use client';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { MarketPeriodSelector } from 'src/components/market-period-selector';

import { useChartIndicators } from '../hooks/use-chart-indicators';
import { TechnicalApexChart } from '../components/technical-apex-chart';
import { TickerSelectionCard } from '../components/ticker-selection-card';
import { TechnicalScoreBanner } from '../components/technical-score-banner';
import { IndicatorFilterChips } from '../components/indicator-filter-chips';
import { SimulationResultsModal } from '../components/simulation-results-modal';
import { AutoTrendlineController } from '../components/auto-trendline-controller';
import { TechnicalDiagnosticsPanel } from '../components/technical-diagnostics-panel';

// ----------------------------------------------------------------------

export function ChartIndicatorsView() {
  const indicators = useChartIndicators();

  const {
    market,
    period,
    startDate,
    endDate,
    tickerOptions,
    selectedStockMeta,
    techAnalysis,
    dynamicLines,
    chartOptions,
    chartData,
    formatMoney,
    showSma5,
    showSma20,
    showSma60,
    showSma120,
    showSma240,
    showBb,
    showRsi,
    showMacd,
    showEnv,
    showFib,
    showDonchian,
    showAutoTrend,
    handleMarketChange,
    setPeriod,
    setStartDate,
    setEndDate,
    handleTickerChange,
  } = indicators;

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={2}>
        {/* Header Title Block */}
        <Stack spacing={0.5} sx={{ pb: 1 }}>
          <Grid container alignItems="center" spacing={1}>
            <Grid>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                차트 기술적 지표 분석 📈
              </Typography>
            </Grid>
          </Grid>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            단일 종목의 가격 움직임을 기반으로 이동평균선, RSI, MACD, 볼린저 밴드를 실시간 연산하여
            분석합니다.
          </Typography>
        </Stack>

        {/* Sticky Market Selector & Period Selection */}
        <Box
          sx={{
            position: 'sticky',
            top: 72, // Below the dashboard top navbar
            zIndex: 1000,
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.9),
            backdropFilter: 'blur(8px)',
            py: 1.5,
            px: 2.5,
            borderRadius: 2,
            boxShadow: (theme) => theme.customShadows?.z8 || '0 8px 16px 0 rgba(0,0,0,0.06)',
            border: (theme) => `1px solid ${theme.palette.divider}`,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
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
        </Box>

        {/* 1. Single Ticker Selection Card */}
        <TickerSelectionCard
          market={market}
          tickerOptions={tickerOptions}
          selectedStockMeta={selectedStockMeta}
          techAnalysis={techAnalysis}
          handleTickerChange={handleTickerChange}
          formatMoney={formatMoney}
        />

        {/* 2. Technical Diagnostics & Price Action Chart */}
        {techAnalysis && selectedStockMeta && (
          <Grid container spacing={2}>
            {/* Real-time Technical Score Banner */}
            <TechnicalScoreBanner
              score={techAnalysis.score}
              stockName={selectedStockMeta.name}
              stockTicker={selectedStockMeta.ticker}
              latestRsi={techAnalysis.latestRsi}
            />

            {/* 💡 Interactive Technical Indicators Toggle Controller */}
            <IndicatorFilterChips
              showSma5={showSma5}
              setShowSma5={indicators.setShowSma5}
              showSma20={showSma20}
              setShowSma20={indicators.setShowSma20}
              showSma60={showSma60}
              setShowSma60={indicators.setShowSma60}
              showSma120={showSma120}
              setShowSma120={indicators.setShowSma120}
              showSma240={showSma240}
              setShowSma240={indicators.setShowSma240}
              showBb={showBb}
              setShowBb={indicators.setShowBb}
              showEnv={showEnv}
              setShowEnv={indicators.setShowEnv}
              showFib={showFib}
              setShowFib={indicators.setShowFib}
              showDonchian={showDonchian}
              setShowDonchian={indicators.setShowDonchian}
              showRsi={showRsi}
              setShowRsi={indicators.setShowRsi}
              showMacd={showMacd}
              setShowMacd={indicators.setShowMacd}
            />

            {/* 📈 자동 추세선 (Auto Trendline) 전용 컨트롤러 카드 */}
            <AutoTrendlineController indicators={indicators} />

            {/* Apex Technical Chart (Left 8 Columns) */}
            <TechnicalApexChart
              selectedStockMetaName={selectedStockMeta.name}
              period={period}
              chartOptions={chartOptions}
              chartSeries={chartData.series}
            />

            {/* Real-time calculated Diagnostic Cards (Right 4 Columns) */}
            <TechnicalDiagnosticsPanel
              showSma5={showSma5}
              showSma20={showSma20}
              showSma60={showSma60}
              showSma120={showSma120}
              showSma240={showSma240}
              showBb={showBb}
              showRsi={showRsi}
              showMacd={showMacd}
              showEnv={showEnv}
              showFib={showFib}
              showDonchian={showDonchian}
              showAutoTrend={showAutoTrend}
              techAnalysis={{
                ...techAnalysis,
                latestSupport: dynamicLines?.latestSupport ?? techAnalysis.latestSupport,
                latestResistance: dynamicLines?.latestResistance ?? techAnalysis.latestResistance,
                touchCount: dynamicLines?.touchCount ?? 0,
                highTouchCount: dynamicLines?.highTouchCount ?? 0,
                closeTouchCount: dynamicLines?.closeTouchCount ?? 0,
                breakoutCount: dynamicLines?.breakoutCount ?? 0,
                closeBreakoutCount: dynamicLines?.closeBreakoutCount ?? 0,
                highBreakoutCount: dynamicLines?.highBreakoutCount ?? 0,
              }}
              formatMoney={formatMoney}
            />
          </Grid>
        )}
      </Stack>
      <SimulationResultsModal indicators={indicators} />
    </DashboardContent>
  );
}
