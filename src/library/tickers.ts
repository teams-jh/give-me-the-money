/**
 * Ticker Data Library
 *
 * This file provides access to all ticker JSON files in src/db/tickers.
 * Note: Importing all 1000+ JSON files eagerly will significantly increase the bundle size.
 */

export interface TickerData {
  ticker: string;
  updated_at: string;
  info: {
    name: string;
    kr_name?: string;
    exchange: string;
    currency: string;
    sector: string;
    industry: string;
    country: string;
    employees: number;
    website: string;
    description: string;
    is_actively_trading: boolean;
  };
  market: {
    market_cap: number;
    shares_outstanding: number;
    float_shares: number;
    price: number;
    previous_close: number;
    fifty_two_week_high: number;
    fifty_two_week_low: number;
    beta: number;
  };
  liquidity: {
    avg_daily_volume_3m: number;
    avg_daily_volume_10d: number;
  };
  valuation: {
    trailing_pe: number;
    forward_pe: number;
    peg_ratio: number;
    price_to_book: number;
    trailing_eps: number;
    forward_eps: number;
    enterprise_value: number;
  };
  profitability: {
    profit_margins: number;
    gross_margins: number;
    operating_margins: number;
    roe: number;
    roa: number;
    revenue_growth: number;
    earnings_growth: number;
    quarterly_earnings: {
      quarter: string;
      net_income: number;
    }[];
  };
  dividend: {
    rate: number;
    yield: number;
    payout_ratio: number;
  };
  ownership: {
    held_pct_institutions: number;
    held_pct_insiders: number;
    short_ratio: number;
  };
  prices: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adj_close: number;
    volume: number;
  }[];
}

// ----------------------------------------------------------------------

/**
 * 1. Eager Import (All files bundled)
 *
 * Static import from auto-generated file to ensure compatibility with Next.js/Turbopack.
 */
import { allTickersData } from './all-tickers-data';

export { allTickersData };

/**
 * 2. Dynamic Loader (Recommended for performance)
 *
 * Only loads the specific ticker data when needed.
 */
export const getTickerData = async (ticker: string): Promise<TickerData> => {
  // Determine likely market (KR tickers are usually 6-digit numbers)
  const isKr = /^\d+$/.test(ticker);

  try {
    if (isKr) {
      try {
        const module = await import(`../db/kr/tickers/${ticker}.json`);
        return module.default;
      } catch {
        // Fallback to US
        const module = await import(`../db/us/tickers/${ticker}.json`);
        return module.default;
      }
    } else {
      try {
        const module = await import(`../db/us/tickers/${ticker}.json`);
        return module.default;
      } catch {
        // Fallback to KR
        const module = await import(`../db/kr/tickers/${ticker}.json`);
        return module.default;
      }
    }
  } catch (error) {
    console.error(`Failed to load data for ticker: ${ticker}`, error);
    throw error;
  }
};

/**
 * 3. Ticker List
 */
import allKrMetadata from '../db/metadata/all_kr_tickers.json';
import allUsMetadata from '../db/metadata/all_us_tickers.json';

export const tickers = [...allKrMetadata.tickers, ...allUsMetadata.tickers];
