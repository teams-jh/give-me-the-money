/**
 * Nasdaq 100 티커 리스트 업데이트
 *
 * 흐름:
 *   1. Invesco QQQ ETF 홀딩스 CSV 다운로드
 *   2. 주식 종목만 파싱 (Cash 등 제외)
 *   3. src/db/nasdaq100_tickers.json 저장
 *
 * 실행:
 *   npx tsx server_node/scripts/update_nasdaq100.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db");
const OUTPUT = path.join(DB_DIR, "nasdaq100_tickers.json");

const QQQ_CSV_URL =
  "https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ";

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface Stock {
  ticker: string;
  name:   string;
}

interface Nasdaq100Json {
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
  log("Invesco QQQ 홀딩스 CSV 다운로드 중...");

  const { data } = await axios.get<string>(QQQ_CSV_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Accept":     "text/csv,application/csv,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  // 헤더 행 탐색: "Ticker" 또는 "Holding Ticker" 컬럼이 포함된 첫 번째 행
  const headerIdx = lines.findIndex((l) => {
    const lower = l.toLowerCase();
    return lower.includes("ticker") || lower.includes("holding ticker");
  });

  if (headerIdx === -1) {
    throw new Error("헤더 행을 찾을 수 없습니다. CSV 포맷이 변경되었을 수 있습니다.");
  }

  const headerLine = lines[headerIdx];
  if (headerLine === undefined) throw new Error("헤더 행이 비어 있습니다.");

  const headers = parseRow(headerLine).map((h) => h.toLowerCase().trim());
  
  let tickerIdx = headers.indexOf("holding ticker");
  if (tickerIdx === -1) tickerIdx = headers.indexOf("ticker");
  
  const nameIdx = headers.indexOf("name");
  
  // Invesco CSV의 경우 Class 관련 컬럼 이름이 다양할 수 있음
  let assetClassIdx = headers.indexOf("class");
  if (assetClassIdx === -1) assetClassIdx = headers.indexOf("security type");
  if (assetClassIdx === -1) assetClassIdx = headers.indexOf("asset class");

  log(`헤더 인덱스 — ticker:${tickerIdx}, name:${nameIdx}, class:${assetClassIdx}`);

  if (tickerIdx === -1) {
    throw new Error("Ticker 컬럼을 찾을 수 없습니다.");
  }

  const stocks: Stock[] = [];

  for (const line of lines.slice(headerIdx + 1)) {
    const cols       = parseRow(line);
    let ticker       = (cols[tickerIdx] ?? "").trim();
    const name       = (cols[nameIdx] ?? "").trim();

    // Invesco CSV에서 티커에 추가 공백 등이 있을 수 있음
    ticker = ticker.split(" ")[0] || "";

    // 유효하지 않은 티커나 현금성 자산 제외
    if (!ticker || ticker === "-" || ticker.toLowerCase() === "cash" || ticker.toUpperCase() === "USD") {
      continue;
    }

    // Class 컬럼이 존재할 경우 Equity(주식)가 아닌 항목(예: Currency, Cash) 제외
    if (assetClassIdx !== -1) {
      const assetClass = (cols[assetClassIdx] ?? "").trim().toLowerCase();
      if (assetClass.includes("cash") || assetClass.includes("currency") || assetClass === "fx") {
        continue;
      }
    }

    stocks.push({ ticker, name });
  }

  return stocks;
}

// ── 3단계: JSON 저장 ──────────────────────────────────────────────────────────

function saveJson(stocks: Stock[]): void {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const output: Nasdaq100Json = {
    updated_at:  new Date().toISOString(),
    source:      "Invesco QQQ ETF",
    source_url:  QQQ_CSV_URL,
    total_count: stocks.length,
    tickers:     stocks.map((s) => s.ticker),
    stocks,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  log(`JSON 저장 완료: ${OUTPUT}  (${stocks.length}개)`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== Nasdaq 100 (QQQ) 티커 업데이트 시작 ===");

  const raw    = await downloadCsv();
  
  // Invesco 웹사이트가 CSV 대신 HTML(SPA 등)을 반환할 수 있으므로 방어 코드 추가
  if (raw.trim().toLowerCase().startsWith("<!doctype html>") || raw.trim().toLowerCase().startsWith("<html")) {
    log("[경고] 다운로드된 내용이 HTML입니다. Invesco 측 API 변경으로 인해 CSV 직접 다운로드가 차단되었을 수 있습니다.");
    log("만약 실행이 실패한다면, 브라우저에서 직접 CSV를 다운로드하여 로컬 파일로 처리하도록 스크립트를 수정해야 합니다.");
  }
  
  const stocks = parseCsv(raw);

  if (stocks.length === 0) throw new Error("파싱된 종목이 없습니다.");

  log(`파싱 완료: ${stocks.length}개 종목`);
  log(`상위 5개: ${stocks.slice(0, 5).map((s) => s.ticker).join(", ")}`);

  saveJson(stocks);
  log("=== 업데이트 완료 ===");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
