// PeriodKey의 단일 출처는 library/shared/signals.ts. 자체 재정의 대신 재export한다. (#67)
export type { PeriodKey } from 'src/library/shared/signals';

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
  actual_prices?: number[];
}

export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  current_price: number;
  market_cap?: number;
  periods: Record<PeriodKey, PeriodData>;
}

export interface StockData {
  generated_at: string;
  stocks: Stock[];
}
