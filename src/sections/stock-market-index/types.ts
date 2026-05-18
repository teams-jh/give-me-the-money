export type PeriodKey = '3m' | '1y' | '2y' | '3y';

export interface PeriodData {
  trend: string;
  slope_pct: number;
  r2: number;
  slope_early_pct: number;
  slope_late_pct: number;
  total_return: number;
  chart_labels: string[];
  chart_data: number[];
  regression: number[];
}

export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  current_price: number;
  periods: Record<PeriodKey, PeriodData>;
}

export interface StockData {
  generated_at: string;
  stocks: Stock[];
}
