/**
 * 국내 전체 티커 리스트 병합
 *
 * 소스: kospi300_tickers.json + kosdaq200_tickers.json
 * 출력: src/db/metadata/all_kr_tickers.json
 *
 * 실행:
 *   npx tsx server_node/scripts/merge_kr_tickers.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import { mergeTickers } from "./merge_tickers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const METADATA_DIR = path.resolve(__dirname, "../../src/db/metadata");

mergeTickers({
  sources: [
    { path: path.join(METADATA_DIR, "kospi300_tickers.json"),  label: "kospi300"  },
    { path: path.join(METADATA_DIR, "kosdaq200_tickers.json"), label: "kosdaq200" },
  ],
  output: path.join(METADATA_DIR, "all_kr_tickers.json"),
});
