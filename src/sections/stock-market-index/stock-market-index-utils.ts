import type { TickerData } from 'src/library/tickers';
import type { PriceSeries } from '../../library/shared';
import type { Stock, PeriodKey, PeriodData } from './types';

import { classifyTrend as sharedClassifyTrend } from '../../library/shared';

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
    market_cap: data.market?.market_cap || 0,
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
