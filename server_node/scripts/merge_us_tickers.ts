/**
 * 미국 전체 티커 리스트 병합
 *
 * 소스: nasdaq100_tickers.json + russell1000_tickers.json
 * 출력: src/db/metadata/all_us_tickers.json
 *
 * 실행:
 *   npx tsx server_node/scripts/merge_us_tickers.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import { mergeTickers } from "./merge_tickers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const METADATA_DIR = path.resolve(__dirname, "../../src/db/metadata");

mergeTickers({
  sources: [
    { path: path.join(METADATA_DIR, "nasdaq100_tickers.json"),  label: "nasdaq100"  },
    { path: path.join(METADATA_DIR, "russell1000_tickers.json"), label: "russell1000" },
  ],
  output: path.join(METADATA_DIR, "all_us_tickers.json"),
});
