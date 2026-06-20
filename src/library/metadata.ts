/**
 * Metadata Library
 *
 * This file provides access to ticker metadata JSON files in src/db/metadata.
 */

import allKrTickersRaw from '../db/metadata/all_kr_tickers.json';
import allUsTickersRaw from '../db/metadata/all_us_tickers.json';
import kospi300Raw from '../db/stock_market_index/kospi300_tickers.json';
import nasdaq100Raw from '../db/stock_market_index/nasdaq100_tickers.json';
import kosdaq200Raw from '../db/stock_market_index/kosdaq200_tickers.json';
import russell1000Raw from '../db/stock_market_index/russell1000_tickers.json';
import manualKrTickersRaw from '../db/stock_market_index/manual_kr_tickers.json';
import manualUsTickersRaw from '../db/stock_market_index/manual_us_tickers.json';

// ----------------------------------------------------------------------

export interface TickerMetadata {
  updated_at: string;
  source: string;
  source_url?: string;
  description?: string;
  total_count: number;
  tickers: string[];
  nasdaq100_count?: number;
  russell1000_count?: number;
  kospi300_count?: number;
  kosdaq200_count?: number;
  manual_count?: number;
  manual_us_count?: number;
}

// ----------------------------------------------------------------------

export const allKrTickers = allKrTickersRaw as TickerMetadata;
export const allUsTickers = allUsTickersRaw as TickerMetadata;
export const nasdaq100 = nasdaq100Raw as TickerMetadata;
export const russell1000 = russell1000Raw as TickerMetadata;
export const kospi300 = kospi300Raw as TickerMetadata;
export const kosdaq200 = kosdaq200Raw as TickerMetadata;
export const manualKrTickers = manualKrTickersRaw as TickerMetadata;
export const manualUsTickers = manualUsTickersRaw as TickerMetadata;

/**
 * All metadata files as a single collection
 */
export const metadata = {
  all: {
    updated_at: new Date().toISOString(),
    source: 'Merged KR and US',
    total_count: allKrTickers.total_count + allUsTickers.total_count,
    tickers: [...allKrTickers.tickers, ...allUsTickers.tickers],
  } as TickerMetadata,
  kr: allKrTickers,
  us: allUsTickers,
  nasdaq100,
  russell1000,
  kospi300,
  kosdaq200,
  manualKr: manualKrTickers,
  manualUs: manualUsTickers,
};

/**
 * Helper to get ticker list by index name
 */
export const getTickersByIndex = (
  index:
    | 'all'
    | 'kr'
    | 'us'
    | 'nasdaq100'
    | 'russell1000'
    | 'kospi300'
    | 'kosdaq200'
    | 'manualKr'
    | 'manualUs'
): string[] => metadata[index].tickers;
