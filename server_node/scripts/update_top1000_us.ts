/**
 * 미국 시총 상위 1000 종목 업데이트
 *
 * 흐름:
 *   1. DWS 마스터 데이터에서 NYS/NAS/AMS 종목 목록 다운로드 (.cod.zip)
 *   2. cp949 탭구분 파일 파싱 → Stock(sectype=2) 필터
 *   3. Yahoo Finance에서 시총(marketCap) 배치 조회
 *   4. 시총 기준 내림차순 정렬 → 상위 1000개 선정
 *   5. src/db/metadata/top1000_us_tickers.json 저장
 *
 * 실행:
 *   npx tsx server_node/scripts/update_top1000_us.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios            from "axios";
import AdmZip           from "adm-zip";
import iconv            from "iconv-lite";
import yahooFinance     from "yahoo-finance2";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db/metadata");
const OUTPUT = path.join(DB_DIR, "top1000_us_tickers.json");

const DWS_BASE = "https://new.real.download.dws.co.kr/common/master";

const SOURCES: { exchange: string; url: string }[] = [
  { exchange: "NYS", url: `${DWS_BASE}/nysmst.cod.zip` },
  { exchange: "NAS", url: `${DWS_BASE}/nasmst.cod.zip` },
  { exchange: "AMS", url: `${DWS_BASE}/amsmst.cod.zip` },
];

/** 한 번에 Yahoo Finance에 조회할 배치 크기 */
const BATCH_SIZE = 100;

/** 배치 요청 사이 대기 시간 (ms) — rate limit 방어 */
const BATCH_DELAY_MS = 500;

/** 시총 조회 실패 종목 재시도 횟수 */
const MAX_RETRY = 2;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface CodRecord {
  exchange: string;  // NYS | NAS | AMS
  symbol:   string;
  knam:     string;  // 한글명
  sectype:  number;  // 1:Index 2:Stock 3:ETF 4:Warrant
  isdr:     string;  // DR 여부 (Y/N)
  currency: string;
}

interface TickerInfo {
  symbol:     string;
  knam:       string;
  exchange:   string;
  marketCap:  number;
}

interface Top1000Json {
  updated_at:  string;
  source:      string;
  total_count: number;
  tickers:     { symbol: string; knam: string; exchange: string; market_cap: number }[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 1단계: .cod.zip 다운로드 & 파싱 ──────────────────────────────────────────

/** 컬럼 순서 (overseas_cod_parser.py 와 동일) */
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

async function downloadAndParse(exchange: string, url: string): Promise<CodRecord[]> {
  log(`[${exchange}] 다운로드 중: ${url}`);

  const resp = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 30_000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const zip     = new AdmZip(Buffer.from(resp.data));
  const entries = zip.getEntries();
  const codEntry = entries.find((e) => e.entryName.endsWith(".cod"));
  if (!codEntry) throw new Error(`[${exchange}] .cod 파일을 찾을 수 없습니다.`);

  const raw  = zip.readFile(codEntry);
  if (!raw)  throw new Error(`[${exchange}] .cod 파일 내용이 비어 있습니다.`);

  const text = iconv.decode(raw, "cp949");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  log(`[${exchange}] 전체 행 수: ${lines.length.toLocaleString()}`);

  const records: CodRecord[] = [];
  for (const line of lines) {
    const fields = line.split("\t");
    const rec: Record<string, string> = {};
    COD_COLUMNS.forEach((col, i) => {
      rec[col] = (fields[i] ?? "").trim();
    });

    const sectype = parseInt(rec.stis ?? "", 10);
    if (sectype !== 2) continue;          // Stock만 (Index, ETF, Warrant 제외)
    if (!rec.symb)     continue;          // 심볼 없는 행 제외

    records.push({
      exchange,
      symbol:  rec.symb,
      knam:    rec.knam || rec.symb,      // 한글명 없으면 심볼로 대체
      sectype,
      isdr:    rec.isdr,
      currency: rec.curr,
    });
  }

  log(`[${exchange}] Stock 종목 수: ${records.length.toLocaleString()}`);
  return records;
}

// ── 2단계: Yahoo Finance 시총 배치 조회 ───────────────────────────────────────

async function fetchMarketCaps(
  symbols: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const total  = symbols.length;
  log(`시총 조회 시작 — 총 ${total.toLocaleString()}개 종목, 배치 ${BATCH_SIZE}개씩`);

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch  = symbols.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    let attempt = 0;
    while (attempt <= MAX_RETRY) {
      try {
        const quotes = await yahooFinance.quote(batch);
        const arr = Array.isArray(quotes) ? quotes : [quotes];
        for (const q of arr) {
          if (q?.symbol && q.marketCap && q.marketCap > 0) {
            result.set(q.symbol, q.marketCap);
          }
        }
        break;
      } catch (err) {
        attempt++;
        if (attempt > MAX_RETRY) {
          log(`[경고] 배치 ${batchNo}/${totalBatches} 시총 조회 실패 (포기): ${err}`);
        } else {
          log(`[경고] 배치 ${batchNo}/${totalBatches} 재시도 ${attempt}/${MAX_RETRY}`);
          await sleep(BATCH_DELAY_MS * 2);
        }
      }
    }

    if (batchNo % 10 === 0 || batchNo === totalBatches) {
      log(`시총 조회 진행 — ${batchNo}/${totalBatches} 배치 완료 (누적 ${result.size}개)`);
    }
    await sleep(BATCH_DELAY_MS);
  }

  log(`시총 조회 완료 — 유효 데이터: ${result.size}/${total}개`);
  return result;
}

// ── 3단계: 시총 정렬 → 상위 1000 선정 ───────────────────────────────────────

function selectTop1000(
  records: CodRecord[],
  marketCaps: Map<string, number>,
): TickerInfo[] {
  const withCap: TickerInfo[] = [];

  for (const r of records) {
    const cap = marketCaps.get(r.symbol);
    if (!cap) continue;  // 시총 조회 실패 종목 제외
    withCap.push({
      symbol:    r.symbol,
      knam:      r.knam,
      exchange:  r.exchange,
      marketCap: cap,
    });
  }

  withCap.sort((a, b) => b.marketCap - a.marketCap);
  const top1000 = withCap.slice(0, 1000);

  log(`시총 있는 종목: ${withCap.length.toLocaleString()}개 → 상위 1000개 선정`);
  log(`1위: ${top1000[0]?.symbol} ($${(top1000[0]?.marketCap ?? 0 / 1e12).toFixed(2)}T)`);
  log(`1000위: ${top1000[999]?.symbol} ($${((top1000[999]?.marketCap ?? 0) / 1e9).toFixed(1)}B)`);

  return top1000;
}

// ── 4단계: JSON 저장 ──────────────────────────────────────────────────────────

function saveJson(top1000: TickerInfo[]): void {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const output: Top1000Json = {
    updated_at:  new Date().toISOString(),
    source:      "DWS 마스터 데이터 (NYS/NAS/AMS) + Yahoo Finance 시총",
    total_count: top1000.length,
    tickers:     top1000.map((t) => ({
      symbol:     t.symbol,
      knam:       t.knam,
      exchange:   t.exchange,
      market_cap: t.marketCap,
    })),
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
  log(`저장 완료: ${OUTPUT}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== 미국 시총 상위 1000 업데이트 시작 ===");

  // 1. 세 거래소 .cod 파일 다운로드 & 파싱
  const allRecords: CodRecord[] = [];
  for (const src of SOURCES) {
    const records = await downloadAndParse(src.exchange, src.url);
    allRecords.push(...records);
  }
  log(`전체 Stock 종목 합계: ${allRecords.length.toLocaleString()}개`);

  // 중복 심볼 제거 (동일 심볼이 여러 거래소에 있을 경우 첫 번째 우선)
  const seen    = new Set<string>();
  const unique  = allRecords.filter((r) => {
    if (seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
  log(`중복 제거 후: ${unique.length.toLocaleString()}개`);

  // 2. 시총 배치 조회
  const symbols    = unique.map((r) => r.symbol);
  const marketCaps = await fetchMarketCaps(symbols);

  // 3. 시총 기준 상위 1000 선정
  const top1000 = selectTop1000(unique, marketCaps);

  // 4. 저장
  saveJson(top1000);

  log("=== 완료 ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
