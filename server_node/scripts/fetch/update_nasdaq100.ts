/**
 * Nasdaq 100 티커 리스트 업데이트
 *
 * 흐름:
 *   1. Wikipedia Nasdaq-100 페이지 HTML 다운로드
 *   2. cheerio로 구성 종목 테이블 파싱
 *   3. src/db/nasdaq100_tickers.json 저장
 *
 * 변경 이유:
 *   Invesco 공식 CSV URL이 GitHub Actions 등 클라우드/데이터센터 IP를
 *   Fastly CDN 레벨에서 차단(HTTP 406)하므로 Wikipedia로 소스 변경.
 *
 * 실행:
 *   npx tsx scripts/fetch/update_nasdaq100.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db/stock_market_index");
const OUTPUT = path.join(DB_DIR, "nasdaq100_tickers.json");

const WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/Nasdaq-100";

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface Nasdaq100Json {
  updated_at:  string;
  source:      string;
  source_url:  string;
  total_count: number;
  tickers:     string[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 1단계: Wikipedia HTML 다운로드 ───────────────────────────────────────────

async function fetchWikipediaHtml(): Promise<string> {
  log("Wikipedia Nasdaq-100 페이지 다운로드 중...");

  const { data } = await axios.get<string>(WIKIPEDIA_URL, {
    headers: {
      "User-Agent":      "Mozilla/5.0 (compatible; give-me-the-money-bot/1.0)",
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    },
    responseType: "text",
    timeout:      30_000,
  });

  log(`HTML 다운로드 완료 (${data.length.toLocaleString()} bytes)`);
  return data;
}

// ── 2단계: HTML 파싱 ──────────────────────────────────────────────────────────

function parseWikipediaHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const tickers: string[] = [];

  // Wikipedia Nasdaq-100 페이지의 "Components" 섹션 테이블을 탐색
  // 테이블 헤더에 "Ticker" 컬럼이 있는 테이블을 찾음
  $("table.wikitable").each((_tableIdx, table) => {
    const headers: string[] = [];
    $(table).find("tr").first().find("th").each((_i, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    const tickerColIdx = headers.findIndex(
      (h) => h.includes("ticker") || h.includes("symbol")
    );

    if (tickerColIdx === -1) return; // 이 테이블은 건너뜀

    log(`종목 테이블 발견 — 헤더: [${headers.join(", ")}], ticker 열: ${tickerColIdx}`);

    $(table).find("tr").slice(1).each((_rowIdx, row) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return;

      const rawTicker = $(cells[tickerColIdx]).text().trim();
      // 각주 문자([1], * 등) 제거 후 첫 번째 토큰만 사용
      const ticker = rawTicker.replace(/\[.*?\]|\*/g, "").split(/\s+/)[0] ?? "";

      if (ticker && /^[A-Z]{1,5}$/.test(ticker)) {
        tickers.push(ticker);
      }
    });
  });

  return tickers;
}

// ── 3단계: JSON 저장 ──────────────────────────────────────────────────────────

function saveJson(tickers: string[]): void {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const output: Nasdaq100Json = {
    updated_at:  new Date().toISOString(),
    source:      "Wikipedia – Nasdaq-100",
    source_url:  WIKIPEDIA_URL,
    total_count: tickers.length,
    tickers,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  log(`JSON 저장 완료: ${OUTPUT}  (${tickers.length}개)`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== Nasdaq 100 티커 업데이트 시작 ===");

  const html    = await fetchWikipediaHtml();
  const tickers = parseWikipediaHtml(html);

  if (tickers.length < 90) {
    throw new Error(
      `파싱된 종목이 너무 적습니다 (${tickers.length}개). Wikipedia 페이지 구조가 변경되었을 수 있습니다.`
    );
  }

  log(`파싱 완료: ${tickers.length}개 종목`);
  log(`상위 5개: ${tickers.slice(0, 5).join(", ")}`);

  saveJson(tickers);
  log("=== 업데이트 완료 ===");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
