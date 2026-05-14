import { TickerData } from 'src/library/tickers';
import { Stock, PeriodKey, PeriodData } from './types';

/**
 * Linear Regression calculation
 */
function calculateLinearRegression(data: number[]) {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0, regression: [], r2: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const y = data[i];
    const x = i;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const regression = data.map((_, i) => slope * i + intercept);

  // R-squared
  const meanY = sumY / n;
  const ssRes = data.reduce((acc, y, i) => acc + Math.pow(y - regression[i], 2), 0);
  const ssTot = data.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
  const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

  return { slope, intercept, regression, r2 };
}

/**
 * Classify trend based on slope and r2
 */
function classifyTrend(slope: number, r2: number, slopeEarly: number, slopeLate: number): string {
  const slopeThreshold = 0.0001; // Tiny threshold for flat
  
  if (r2 < 0.3) return 'sideways';
  
  if (slope > slopeThreshold) {
    if (slopeEarly < 0 && slopeLate > slopeThreshold) return 'recovering';
    return 'bullish';
  }
  
  if (slope < -slopeThreshold) return 'bearish';
  
  return 'sideways';
}

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
  const chart_data = slice.map(p => p.adj_close);
  const chart_labels = slice.map(p => p.date);

  const { slope, regression, r2 } = calculateLinearRegression(chart_data);

  // Early/Late slopes for recovering trend detection
  const mid = Math.floor(chart_data.length / 2);
  const earlyData = chart_data.slice(0, mid);
  const lateData = chart_data.slice(mid);
  const slopeEarly = calculateLinearRegression(earlyData).slope;
  const slopeLate = calculateLinearRegression(lateData).slope;

  const total_return = chart_data.length > 1 
    ? ((chart_data[chart_data.length - 1] / chart_data[0]) - 1) * 100 
    : 0;

  return {
    trend: classifyTrend(slope, r2, slopeEarly, slopeLate),
    slope_pct: slope, // Simplified
    r2,
    slope_early_pct: slopeEarly,
    slope_late_pct: slopeLate,
    total_return,
    chart_labels,
    chart_data,
    regression,
  };
}
