/**
 * 미국 전체 티커 리스트 병합
 *
 * 소스: top1000_us_tickers.json (시총 기준 상위 1000) → src/db/stock_market_index
 * 출력: src/db/metadata/all_us_tickers.json
 *
 * 실행:
 *   npx tsx scripts/merge/merge_us_tickers.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import { mergeTickers } from "./merge_tickers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const STOCK_INDEX_DIR = path.resolve(__dirname, "../../src/db/stock_market_index");
const METADATA_DIR    = path.resolve(__dirname, "../../src/db/metadata");

mergeTickers({
  sources: [
    { path: path.join(STOCK_INDEX_DIR, "top1000_us_tickers.json"), label: "top1000" },
  ],
  output: path.join(METADATA_DIR, "all_us_tickers.json"),
});
