import { TickerData } from 'src/library/tickers';
import { classifyTrend as sharedClassifyTrend, PriceSeries } from '../../library/shared';
import { Stock, PeriodKey, PeriodData } from './types';


/**
 * Transform raw TickerData into the Stock format used in views
 */
export function transformTickerToStock(data: TickerData): Stock {
  const periods: Record<PeriodKey, PeriodData> = {
    '3m': calculatePeriodData(data, 63), // ~63 trading days in 3 months
    '1y': calculatePeriodData(data, 252), // ~252 trading days in 1 year
    '2y': calculatePeriodData(data, 504),
    '3y': calculatePeriodData(data, 756),
  };

  return {
    ticker: data.ticker,
    name: data.info.name,
    sector: data.info.sector,
    current_price: data.market.price,
    periods,
  };
}

function calculatePeriodData(data: TickerData, days: number): PeriodData {
  const allPrices = data.prices || [];
  const slice = allPrices.slice(-days);
  
  const series: PriceSeries = {
    labels: slice.map(p => p.date),
    values: slice.map(p => p.adj_close),
  };

  const result = sharedClassifyTrend(series, 5);

  if (!result) {
    return {
      trend: 'sideways',
      slope_pct: 0,
      r2: 0,
      slope_early_pct: 0,
      slope_late_pct: 0,
      total_return: 0,
      chart_labels: [],
      chart_data: [],
      regression: [],
    };
  }

  // The shared function returns data normalized to 100, 
  // but we might want the actual price-based regression for some views.
  // Actually, the current charts seem to use the regression as is.
  // Let's check how regression was calculated before:
  // regression = data.map((_, i) => slope * i + intercept);
  // It was based on original prices.
  
  // The shared classifyTrend returns:
  // chartData: values.map(v => round(v / base * 100, 2))
  // regression: x.map(i => round((intercept + slopeAll * i) / base * 100, 2))
  
  // If we want to keep the UI exactly the same (price based), we might need to denormalize.
  // However, the user said "use the shared function to draw regression".
  // If we use the normalized data, the chart will look slightly different but correct relative to itself.
  
  // Wait, let's look at BigChart in top100-charts.tsx:
  // const min = Math.min(...data.chart_data, ...data.regression);
  // It handles its own min/max, so normalized vs price doesn't matter for the VISUAL result,
  // AS LONG AS both chart_data and regression are on the same scale.
  
  return {
    trend: result.trend,
    slope_pct: result.slopePct,
    r2: result.r2,
    slope_early_pct: result.slopeEarlyPct,
    slope_late_pct: result.slopeLatePct,
    total_return: result.totalReturn,
    chart_labels: result.chartLabels,
    chart_data: result.chartData,
    regression: result.regression,
  };
}
