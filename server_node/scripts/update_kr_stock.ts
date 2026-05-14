/**
 * 국내주식 티커 리스트 업데이트 (코스피200 + 코스닥150)
 *
 * 흐름:
 *   1. KRX 내부 JSON API로 코스피200 / 코스닥150 구성종목 조회
 *   2. 종목코드(6자리) + 종목명 파싱
 *   3. src/db/kospi200_tickers.json, src/db/kosdaq150_tickers.json 저장
 *
 * 비고:
 *   data.krx.co.kr 은 공식 공개 API가 아닌 내부 API 이며,
 *   Referer 헤더 없이 호출하면 차단됩니다.
 *
 * 실행:
 *   npx tsx server_node/scripts/update_kr_stock.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve(__dirname, "../../src/db");

const KRX_URL      = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const KRX_REFERER  = "https://data.krx.co.kr";
const KRX_BLD      = "dbms/MDC/STAT/standard/MDCSTAT00601";

/** 오늘 날짜를 YYYYMMDD 형식으로 반환 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

const INDEXES = [
  {
    name:             "코스피200",
    idxIndMktSrtCd:   "1",
    idxIndMktSrtCd2:  "028",
    outputFile:       path.join(DB_DIR, "kospi200_tickers.json"),
    minCount:         190,   // 최소 종목 수 검증
  },
  {
    name:             "코스닥150",
    idxIndMktSrtCd:   "2",
    idxIndMktSrtCd2:  "163",
    outputFile:       path.join(DB_DIR, "kosdaq150_tickers.json"),
    minCount:         140,
  },
] as const;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface KrxResponseItem {
  ISU_SRT_CD: string;   // 단축코드 (6자리)
  ISU_ABBRV:  string;   // 종목명
  [key: string]: unknown;
}

interface KrxResponse {
  output: KrxResponseItem[];
}

interface KrTicker {
  code: string;   // 6자리 종목코드
  name: string;   // 종목명
}

interface KrIndexJson {
  updated_at:  string;
  source:      string;
  source_url:  string;
  index_name:  string;
  total_count: number;
  tickers:     KrTicker[];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 1단계: KRX API 호출 ───────────────────────────────────────────────────────

async function fetchKrxIndex(
  idxIndMktSrtCd:  string,
  idxIndMktSrtCd2: string,
  indexName:       string,
): Promise<KrxResponseItem[]> {
  log(`KRX ${indexName} 구성종목 조회 중...`);

  const params = new URLSearchParams({
    bld:             KRX_BLD,
    locale:          "ko_KR",
    idxIndMktSrtCd,
    idxIndMktSrtCd2,
    trdDd:           todayStr(),
    money:           "1",
    csvxls_isNo:     "false",
  });

  const { data } = await axios.post<KrxResponse>(KRX_URL, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer":      KRX_REFERER,
      "Accept":       "application/json, text/javascript, */*; q=0.01",
    },
    timeout: 30_000,
  });

  log(`${indexName} 응답 수신: ${data.output?.length ?? 0}개 항목`);
  return data.output ?? [];
}

// ── 2단계: 파싱 ───────────────────────────────────────────────────────────────

function parseItems(items: KrxResponseItem[]): KrTicker[] {
  return items
    .map((item) => ({
      code: item.ISU_SRT_CD.trim(),
      name: item.ISU_ABBRV.trim(),
    }))
    .filter(({ code }) => /^\d{6}$/.test(code));  // 6자리 숫자만
}

// ── 3단계: JSON 저장 ──────────────────────────────────────────────────────────

function saveJson(tickers: KrTicker[], indexName: string, outputFile: string): void {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const output: KrIndexJson = {
    updated_at:  new Date().toISOString(),
    source:      `KRX 데이터 포털 – ${indexName}`,
    source_url:  KRX_URL,
    index_name:  indexName,
    total_count: tickers.length,
    tickers,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf8");
  log(`JSON 저장 완료: ${outputFile}  (${tickers.length}개)`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== 국내주식 티커 업데이트 시작 ===");

  for (const idx of INDEXES) {
    log(`--- ${idx.name} 처리 시작 ---`);

    const items   = await fetchKrxIndex(idx.idxIndMktSrtCd, idx.idxIndMktSrtCd2, idx.name);
    const tickers = parseItems(items);

    if (tickers.length < idx.minCount) {
      throw new Error(
        `${idx.name} 파싱 종목이 너무 적습니다 (${tickers.length}개). ` +
        `KRX API 구조가 변경되었을 수 있습니다.`
      );
    }

    log(`파싱 완료: ${tickers.length}개 종목`);
    log(`상위 5개: ${tickers.slice(0, 5).map((t) => `${t.code} ${t.name}`).join(", ")}`);

    saveJson(tickers, idx.name, idx.outputFile);
  }

  log("=== 업데이트 완료 ===");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
