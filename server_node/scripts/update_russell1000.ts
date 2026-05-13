/**
 * Russell 1000 티커 리스트 업데이트
 *
 * 흐름:
 *   1. iShares Russell 1000 ETF(IWB) 홀딩스 CSV 다운로드
 *   2. Equity 종목만 파싱 (Cash / 선물 제외)
 *   3. src/db/russell1000_tickers.json 저장
 *
 * 실행:
 *   npx tsx server_node/scripts/update_russell1000.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db");
const OUTPUT = path.join(DB_DIR, "russell1000_tickers.json");

const IWB_CSV_URL =
  "https://www.ishares.com/us/products/239707/ISHARES-RUSSELL-1000-ETF/1467271812596.ajax?tab=holdings&fileType=csv";

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface Stock {
  ticker: string;
  name:   string;
}

interface Russell1000Json {
  updated_at:  string;
  source:      string;
  source_url:  string;
  total_count: number;
  tickers:     string[];
  stocks:      Stock[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 1단계: CSV 다운로드 ───────────────────────────────────────────────────────

async function downloadCsv(): Promise<string> {
  log("iShares IWB 홀딩스 CSV 다운로드 중...");

  const { data } = await axios.get<string>(IWB_CSV_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    responseType: "text",
    timeout:      30_000,
  });

  log(`CSV 다운로드 완료 (${data.length.toLocaleString()} bytes)`);
  return data;
}

// ── 2단계: CSV 파싱 ───────────────────────────────────────────────────────────

/** CSV 한 행을 파싱 (따옴표 내 쉼표 처리) */
function parseRow(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function parseCsv(raw: string): Stock[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  // 헤더 행 탐색: "Ticker" 컬럼이 포함된 첫 번째 행
  const headerIdx = lines.findIndex((l) => l.toLowerCase().startsWith("ticker"));
  if (headerIdx === -1) {
    throw new Error("헤더 행을 찾을 수 없습니다. CSV 포맷이 변경되었을 수 있습니다.");
  }

  const headerLine = lines[headerIdx];
  if (headerLine === undefined) throw new Error("헤더 행이 비어 있습니다.");

  const headers       = parseRow(headerLine).map((h) => h.toLowerCase().trim());
  const tickerIdx     = headers.indexOf("ticker");
  const nameIdx       = headers.indexOf("name");
  const assetClassIdx = headers.indexOf("asset class");

  log(`헤더 인덱스 — ticker:${tickerIdx}, name:${nameIdx}, asset class:${assetClassIdx}`);

  const stocks: Stock[] = [];

  for (const line of lines.slice(headerIdx + 1)) {
    const cols       = parseRow(line);
    const ticker     = (cols[tickerIdx]     ?? "").trim();
    const name       = (cols[nameIdx]       ?? "").trim();
    const assetClass = (cols[assetClassIdx] ?? "").trim().toLowerCase();

    // Cash, Futures, "-" 티커 제외 → Equity만
    if (!ticker || ticker === "-" || assetClass !== "equity") continue;

    stocks.push({ ticker, name });
  }

  return stocks;
}

// ── 3단계: JSON 저장 ──────────────────────────────────────────────────────────

function saveJson(stocks: Stock[]): void {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const output: Russell1000Json = {
    updated_at:  new Date().toISOString(),
    source:      "iShares Russell 1000 ETF (IWB)",
    source_url:  IWB_CSV_URL,
    total_count: stocks.length,
    tickers:     stocks.map((s) => s.ticker),
    stocks,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  log(`JSON 저장 완료: ${OUTPUT}  (${stocks.length}개)`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== Russell 1000 티커 업데이트 시작 ===");

  const raw    = await downloadCsv();
  const stocks = parseCsv(raw);

  if (stocks.length === 0) throw new Error("파싱된 종목이 없습니다.");

  log(`파싱 완료: ${stocks.length}개 Equity 종목`);
  log(`상위 5개: ${stocks.slice(0, 5).map((s) => s.ticker).join(", ")}`);

  saveJson(stocks);
  log("=== 업데이트 완료 ===");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
