/**
 * Metadata Library
 * 
 * This file provides access to ticker metadata JSON files in src/db/metadata.
 */

import allTickersRaw from '../db/metadata/all_tickers.json';
import nasdaq100Raw from '../db/metadata/nasdaq100_tickers.json';
import russell1000Raw from '../db/metadata/russell1000_tickers.json';

// ----------------------------------------------------------------------

export interface TickerMetadata {
  updated_at: string;
  source: string;
  source_url?: string;
  total_count: number;
  tickers: string[];
  nasdaq100_count?: number;
  russell1000_count?: number;
}

// ----------------------------------------------------------------------

export const allTickers = allTickersRaw as TickerMetadata;
export const nasdaq100 = nasdaq100Raw as TickerMetadata;
export const russell1000 = russell1000Raw as TickerMetadata;

/**
 * All metadata files as a single collection
 */
export const metadata = {
  all: allTickers,
  nasdaq100: nasdaq100,
  russell1000: russell1000,
};

/**
 * Helper to get ticker list by index name
 */
export const getTickersByIndex = (index: 'all' | 'nasdaq100' | 'russell1000'): string[] => {
  return metadata[index].tickers;
};
