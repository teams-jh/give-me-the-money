/**
 * 미국 시총 상위 1000 종목 업데이트
 *
 * 흐름:
 *   1. Yahoo Finance 스크리너 API → NYS/NAS/AMS 시총 상위 1000 조회 (~4회 요청)
 *   2. DWS 마스터 데이터(.cod.zip) → 한글명(knam) 조회용 맵 구축
 *   3. 심볼 기준으로 한글명 매핑
 *   4. src/db/stock_market_index/top1000_us_tickers.json 저장
 *
 * 실행:
 *   npx tsx scripts/fetch/update_top1000_us.ts
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

const DB_DIR = path.resolve(__dirname, "../../src/db/stock_market_index");
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
// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface OutputJson {
  updated_at:  string;
  source:      string;
  total_count: number;
  tickers:     string[];
  name_map:    Record<string, string>;
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 1단계: Yahoo Finance 스크리너로 시총 상위 1000 조회 ───────────────────────
//
// Yahoo Finance 스크리너는 crumb 인증 토큰이 필요합니다.
// 1) finance.yahoo.com 방문 → 쿠키 획득
// 2) /v1/test/getcrumb → crumb 획득
// 3) 스크리너 요청 시 쿠키 + crumb 포함
// ─────────────────────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

interface ScreenerQuote {
  symbol:     string;
  marketCap?: number;
  longName?:  string;
}

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string }> {
  // Step 1: 쿠키 획득
  //   - 가벼운 quote 페이지 사용 (홈은 헤더가 너무 큼 → HPE_HEADER_OVERFLOW)
  //   - maxRedirects: 0 으로 리다이렉트 따라가지 않음 (302 응답의 set-cookie만 필요)
  //   - validateStatus: 200·302 모두 정상 처리
  const r1 = await axios.get("https://finance.yahoo.com/quote/AAPL", {
    headers: {
      "User-Agent": UA,
      Accept:       "text/html,application/xhtml+xml,application/xml",
    },
    maxRedirects:   0,
    validateStatus: (status) => status >= 200 && status < 400,
    timeout:        15_000,
  });
  const cookie = ((r1.headers["set-cookie"] ?? []) as string[])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("Yahoo 쿠키 획득 실패 (set-cookie 헤더 없음)");

  // Step 2: crumb 획득
  const r2 = await axios.get(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: {
        "User-Agent": UA,
        Cookie:       cookie,
        Origin:       "https://finance.yahoo.com",
        Referer:      "https://finance.yahoo.com/quote/AAPL",
        Accept:       "*/*",
      },
      timeout: 10_000,
    }
  );
  const crumb = String(r2.data ?? "").trim();
  if (!crumb) throw new Error("crumb 획득 실패 (빈 응답)");
  log(`crumb 획득 완료 (${crumb.length}자)`);
  return { crumb, cookie };
}

async function fetchTop1000FromScreener(): Promise<ScreenerQuote[]> {
  const SCREENER_URL = "https://query1.finance.yahoo.com/v1/finance/screener";

  // crumb 인증 토큰 획득
  const { crumb, cookie } = await getYahooCrumb();

  const results: ScreenerQuote[] = [];
  const pages = Math.ceil(TARGET / PAGE_SIZE);

  for (let page = 0; page < pages; page++) {
    const offset = page * PAGE_SIZE;
    log(`스크리너 조회 — 페이지 ${page + 1}/${pages} (offset=${offset})`);

    const body = {
      offset,
      size:      PAGE_SIZE,
      sortField: "intradaymarketcap",   // Yahoo Finance 스크리너 표준 필드명
      sortType:  "DESC",
      quoteType: "EQUITY",
      query: {
        operator: "AND",
        operands: [
          { operator: "eq",  operands: ["region", "us"] },
          {
            operator: "or",
            operands: [
              { operator: "eq", operands: ["exchange", "NYQ"] },
              { operator: "eq", operands: ["exchange", "NMS"] },
              { operator: "eq", operands: ["exchange", "NGM"] },
              { operator: "eq", operands: ["exchange", "NCM"] },
              { operator: "eq", operands: ["exchange", "ASE"] },
            ],
          },
        ],
      },
      userId:     "",
      userIdType: "guid",
    };

    let resp;
    try {
      resp = await axios.post(
        `${SCREENER_URL}?crumb=${encodeURIComponent(crumb)}`,
        body,
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent":   UA,
            Cookie:         cookie,
            Origin:         "https://finance.yahoo.com",
            Referer:        "https://finance.yahoo.com/screener/",
          },
          timeout: 30_000,
        }
      );
    } catch (err: any) {
      // Yahoo의 실제 에러 응답을 로그로 출력
      const status = err?.response?.status;
      const respBody = JSON.stringify(err?.response?.data ?? {}, null, 2);
      log(`[ERROR] 스크리너 응답 ${status}:\n${respBody}`);
      throw err;
    }

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
  const filtered = quotes
    .filter((q) => q.symbol && q.marketCap && q.marketCap > 0)
    .slice(0, TARGET);

  const tickers:  string[]              = filtered.map((q) => q.symbol);
  const name_map: Record<string, string> = {};
  for (const q of filtered) {
    name_map[q.symbol] = knamMap.get(q.symbol) ?? q.longName ?? q.symbol;
  }

  log(`최종 저장 종목 수: ${tickers.length}개`);
  if (tickers.length > 0) {
    log(`1위:    ${tickers[0]} (${name_map[tickers[0]]})`);
    log(`1000위: ${tickers[tickers.length-1]} (${name_map[tickers[tickers.length-1]]})`);
  }

  fs.mkdirSync(DB_DIR, { recursive: true });
  const output: OutputJson = {
    updated_at:  new Date().toISOString(),
    source:      "Yahoo Finance 스크리너 (NYS/NAS/AMS 시총 기준) + DWS 한글명 (KIS 마스터 데이터)",
    total_count: tickers.length,
    tickers,
    name_map,
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
