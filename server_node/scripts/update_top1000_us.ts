/**
 * 미국 시총 상위 1000 종목 업데이트
 *
 * 흐름:
 *   1. Yahoo Finance 스크리너 API → NYS/NAS/AMS 시총 상위 1000 조회 (~4회 요청)
 *   2. DWS 마스터 데이터(.cod.zip) → 한글명(knam) 조회용 맵 구축
 *   3. 심볼 기준으로 한글명 매핑
 *   4. src/db/metadata/top1000_us_tickers.json 저장
 *
 * 실행:
 *   npx tsx server_node/scripts/update_top1000_us.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios    from "axios";
import AdmZip   from "adm-zip";
import iconv    from "iconv-lite";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db/metadata");
const OUTPUT = path.join(DB_DIR, "top1000_us_tickers.json");

const DWS_BASE = "https://new.real.download.dws.co.kr/common/master";
const DWS_SOURCES = [
  { exchange: "NYS", url: `${DWS_BASE}/nysmst.cod.zip` },
  { exchange: "NAS", url: `${DWS_BASE}/nasmst.cod.zip` },
  { exchange: "AMS", url: `${DWS_BASE}/amsmst.cod.zip` },
];

/** Yahoo Finance 스크리너 — 한 번에 조회할 최대 건수 (API 한계: 250) */
const PAGE_SIZE = 250;
/** 목표 선정 종목 수 */
const TARGET    = 1000;
/** Yahoo Finance exchange 코드 → DWS exchange 코드 매핑 */
const EXCHANGE_MAP: Record<string, string> = {
  NYQ: "NYS",
  NMS: "NAS",
  NGM: "NAS",
  NCM: "NAS",
  ASE: "AMS",
};

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface TickerRow {
  symbol:     string;
  knam:       string;
  exchange:   string;
  market_cap: number;
}

interface OutputJson {
  updated_at:  string;
  source:      string;
  total_count: number;
  tickers:     TickerRow[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 1단계: Yahoo Finance 스크리너로 시총 상위 1000 조회 ───────────────────────

interface ScreenerQuote {
  symbol:     string;
  marketCap?: number;
  exchange?:  string;
  longName?:  string;
}

async function fetchTop1000FromScreener(): Promise<ScreenerQuote[]> {
  const SCREENER_URL =
    "https://query1.finance.yahoo.com/v1/finance/screener";

  const results: ScreenerQuote[] = [];
  const pages = Math.ceil(TARGET / PAGE_SIZE);

  for (let page = 0; page < pages; page++) {
    const offset = page * PAGE_SIZE;
    log(`스크리너 조회 — 페이지 ${page + 1}/${pages} (offset=${offset})`);

    const body = {
      offset,
      size:      PAGE_SIZE,
      sortField: "marketcap",
      sortType:  "DESC",
      quoteType: "EQUITY",
      query: {
        operator: "AND",
        operands: [
          { operator: "eq",  operands: ["region", "us"] },
          {
            operator: "in",
            operands: ["exchange", ["NYQ", "NMS", "NGM", "NCM", "ASE"]],
          },
        ],
      },
      userId:     "",
      userIdType: "guid",
    };

    const resp = await axios.post(SCREENER_URL, body, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 30_000,
    });

    const quotes: ScreenerQuote[] =
      resp.data?.finance?.result?.[0]?.quotes ?? [];

    log(`  → ${quotes.length}개 수신`);
    results.push(...quotes);

    if (quotes.length < PAGE_SIZE) {
      log("  → 마지막 페이지 도달, 조회 종료");
      break;
    }

    if (page < pages - 1) await sleep(300);
  }

  log(`스크리너 총 ${results.length}개 수신`);
  return results;
}

// ── 2단계: DWS 마스터 데이터 → 한글명 맵 구축 ───────────────────────────────

const COD_COLUMNS = [
  "ncod", "exid", "excd", "exnm",
  "symb", "rsym", "knam", "enam",
  "stis", "curr",
  "zdiv", "ztyp", "base",
  "bnit", "anit",
  "mstm", "metm",
  "isdr", "drcd", "icod", "sjong",
  "ttyp", "etyp", "ttyp_sb",
] as const;

async function buildKnamMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const src of DWS_SOURCES) {
    log(`[${src.exchange}] 한글명 맵 구축 중...`);
    try {
      const resp = await axios.get<ArrayBuffer>(src.url, {
        responseType: "arraybuffer",
        timeout:      30_000,
        headers:      { "User-Agent": "Mozilla/5.0" },
      });

      const zip      = new AdmZip(Buffer.from(resp.data));
      const codEntry = zip.getEntries().find((e) => e.entryName.endsWith(".cod"));
      if (!codEntry) { log(`[${src.exchange}] .cod 없음 — 건너뜀`); continue; }

      const raw  = zip.readFile(codEntry)!;
      const text = iconv.decode(raw, "cp949");
      let count  = 0;

      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const fields = line.split("\t");
        const rec: Record<string, string> = {};
        COD_COLUMNS.forEach((col, i) => { rec[col] = (fields[i] ?? "").trim(); });
        if (rec.symb && rec.knam) { map.set(rec.symb, rec.knam); count++; }
      }
      log(`[${src.exchange}] 한글명 ${count.toLocaleString()}개 로드`);
    } catch (err) {
      log(`[${src.exchange}] 다운로드 실패 (한글명 없이 진행): ${err}`);
    }
  }

  log(`전체 한글명 맵: ${map.size.toLocaleString()}개`);
  return map;
}

// ── 3단계: 결합 & 저장 ───────────────────────────────────────────────────────

function buildAndSave(quotes: ScreenerQuote[], knamMap: Map<string, string>): void {
  const tickers: TickerRow[] = quotes
    .filter((q) => q.symbol && q.marketCap && q.marketCap > 0)
    .slice(0, TARGET)
    .map((q) => ({
      symbol:     q.symbol,
      knam:       knamMap.get(q.symbol) ?? q.longName ?? q.symbol,
      exchange:   EXCHANGE_MAP[q.exchange ?? ""] ?? q.exchange ?? "",
      market_cap: q.marketCap!,
    }));

  log(`최종 저장 종목 수: ${tickers.length}개`);
  if (tickers.length > 0) {
    log(`1위:    ${tickers[0].symbol} (${tickers[0].knam}) — $${(tickers[0].market_cap / 1e12).toFixed(2)}T`);
    log(`1000위: ${tickers[tickers.length-1].symbol} (${tickers[tickers.length-1].knam}) — $${(tickers[tickers.length-1].market_cap / 1e9).toFixed(1)}B`);
  }

  fs.mkdirSync(DB_DIR, { recursive: true });
  const output: OutputJson = {
    updated_at:  new Date().toISOString(),
    source:      "Yahoo Finance 스크리너 (NYS/NAS/AMS 시총 기준) + DWS 한글명",
    total_count: tickers.length,
    tickers,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
  log(`저장 완료: ${OUTPUT}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== 미국 시총 상위 1000 업데이트 시작 ===");

  const quotes  = await fetchTop1000FromScreener();
  const knamMap = await buildKnamMap();
  buildAndSave(quotes, knamMap);

  log("=== 완료 ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
