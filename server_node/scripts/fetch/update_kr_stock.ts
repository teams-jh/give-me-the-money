/**
 * 국내주식 티커 리스트 업데이트 (코스피300 + 코스닥200)
 *
 * 데이터 소스: 한국투자증권 DWS
 *   https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip
 *   https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip
 *
 * 흐름:
 *   1. DWS에서 ZIP 다운로드 (SSL 인증서 예외 처리)
 *   2. .mst 파일 추출 (AdmZip)
 *   3. cp949 디코딩 → 고정폭 라인 파싱 (iconv-lite)
 *   4. Stock 종목만 필터 (그룹코드 == 'ST')
 *   5. 시가총액 기준 내림차순 정렬
 *   6. 상위 N개 추출 → JSON 저장
 *
 * 파싱 구조 참고: https://github.com/Junghyun99/ticker-map
 *
 * 실행:
 *   npx tsx scripts/fetch/update_kr_stock.ts
 */

import fs    from "fs";
import path  from "path";
import https from "https";
import { fileURLToPath } from "url";
import axios   from "axios";
import AdmZip  from "adm-zip";
import iconv   from "iconv-lite";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const DB_DIR           = path.resolve(__dirname, "../../../src/db");
const STOCK_INDEX_DIR  = path.join(DB_DIR, "stock_market_index");
const DWS_BASE = "https://new.real.download.dws.co.kr/common/master";

// DWS 서버 인증서 체인 이슈로 rejectUnauthorized: false 필요 (ticker-map 동일)
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

const INDEXES = [
  {
    name:       "코스피",
    url:        `${DWS_BASE}/kospi_code.mst.zip`,
    mstSuffix:  ".mst",
    byteSize:   228,
    part1Cols:  ["단축코드", "표준코드", "한글명"],
    groupCol:   "그룹코드",          // ST = 주식
    capSizeCol: "시가총액규모",
    nameCol:    "한글명",
    // 시가총액: field spec 누적 위치 212, 폭 9
    marketCapPos:   212,
    marketCapWidth: 9,
    spacCol:        "SPAC",
    topN:        300,
    outputFile:  path.join(STOCK_INDEX_DIR, "kospi300_tickers.json"),
    minCount:    200,
    yahooSuffix: ".KS",
    fieldSpecs: [
      2, 1, 4, 4, 4,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 9, 5, 5, 1,
      1, 1, 2, 1, 1,
      1, 2, 2, 2, 3,
      1, 3, 12, 12, 8,
      15, 21, 2, 7, 1,
      1, 1, 1, 1, 9,
      9, 9, 5, 9, 8,
      9, 3, 1, 1, 1,
    ],
    part2Cols: [
      "그룹코드", "시가총액규모", "지수업종대분류", "지수업종중분류", "지수업종소분류",
      "제조업", "저유동성", "지배구조지수종목", "KOSPI200섹터업종", "KOSPI100",
      "KOSPI50", "KRX", "ETP", "ELW발행", "KRX100",
      "KRX자동차", "KRX반도체", "KRX바이오", "KRX은행", "SPAC",
      "KRX에너지화학", "KRX철강", "단기과열", "KRX미디어통신", "KRX건설",
      "Non1", "KRX증권", "KRX선박", "KRX섹터_보험", "KRX섹터_운송",
      "SRI", "기준가", "매매수량단위", "시간외수량단위", "거래정지",
      "정리매매", "관리종목", "시장경고", "경고예고", "불성실공시",
      "우회상장", "락구분", "액면변경", "증자구분", "증거금비율",
      "신용가능", "신용기간", "전일거래량", "액면가", "상장일자",
      "상장주수", "자본금", "결산월", "공모가", "우선주",
      "공매도과열", "이상급등", "KRX300", "KOSPI", "매출액",
      "영업이익", "경상이익", "당기순이익", "ROE", "기준년월",
      "시가총액", "그룹사코드", "회사신용한도초과", "담보대출가능", "대주가능",
    ],
  },
  {
    name:       "코스닥",
    url:        `${DWS_BASE}/kosdaq_code.mst.zip`,
    mstSuffix:  ".mst",
    byteSize:   222,
    part1Cols:  ["단축코드", "표준코드", "한글종목명"],
    groupCol:   "증권그룹구분코드",   // ST = 주식
    capSizeCol: "시가총액 규모 구분 코드 유가",
    nameCol:    "한글종목명",
    // 시가총액: field spec 59개 합산 위치 216, 폭 5 (단위: 억)
    marketCapPos:   216,
    marketCapWidth: 5,
    spacCol:        "기업인수목적회사여부",
    topN:        200,
    outputFile:  path.join(STOCK_INDEX_DIR, "kosdaq200_tickers.json"),
    minCount:    150,
    yahooSuffix: ".KQ",
    fieldSpecs: [
      2, 1,
      4, 4, 4, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 9,
      5, 5, 1, 1, 1,
      2, 1, 1, 1, 2,
      2, 2, 3, 1, 3,
      12, 12, 8, 15, 21,
      2, 7, 1, 1, 1,
      1, 9, 9, 9, 5,
      9, 8, 9, 3, 1,
      1, 1,
    ],
    part2Cols: [
      "증권그룹구분코드", "시가총액 규모 구분 코드 유가",
      "지수업종 대분류 코드", "지수 업종 중분류 코드", "지수업종 소분류 코드", "벤처기업 여부",
      "저유동성종목 여부", "KRX 종목 여부", "ETP 상품구분코드", "KRX100 종목 여부",
      "KRX 자동차 여부", "KRX 반도체 여부", "KRX 바이오 여부", "KRX 은행 여부", "기업인수목적회사여부",
      "KRX 에너지 화학 여부", "KRX 철강 여부", "단기과열종목구분코드", "KRX 미디어 통신 여부",
      "KRX 건설 여부", "투자주의환기종목여부", "KRX 증권 구분", "KRX 선박 구분",
      "KRX섹터지수 보험여부", "KRX섹터지수 운송여부", "KOSDAQ150지수여부", "주식 기준가",
      "정규 시장 매매 수량 단위", "시간외 시장 매매 수량 단위", "거래정지 여부", "정리매매 여부",
      "관리 종목 여부", "시장 경고 구분 코드", "시장 경고위험 예고 여부", "불성실 공시 여부",
      "우회 상장 여부", "락구분 코드", "액면가 변경 구분 코드", "증자 구분 코드", "증거금 비율",
      "신용주문 가능 여부", "신용기간", "전일 거래량", "주식 액면가", "주식 상장 일자", "상장 주수",
      "자본금", "결산 월", "공모 가격", "우선주 구분 코드", "공매도과열종목여부", "이상급등종목여부",
      "KRX300 종목 여부", "매출액", "영업이익", "경상이익", "단기순이익", "ROE",
      "기준년월",
    ],
  },
] as const;

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface KrIndexJson {
  updated_at:  string;
  source:      string;
  source_url:  string;
  total_count: number;
  tickers:     string[];              // 종목코드 문자열 배열 (russell1000 형식과 동일)
  name_map:    Record<string, string>; // { "005930.KS": "삼성전자" } 한글명 매핑
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 1단계: ZIP 다운로드 ───────────────────────────────────────────────────────

async function downloadZip(url: string): Promise<Buffer> {
  log(`ZIP 다운로드 중: ${url}`);
  const { data } = await axios.get<ArrayBuffer>(url, {
    responseType:  "arraybuffer",
    httpsAgent:    HTTPS_AGENT,
    timeout:       60_000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; give-me-the-money-bot/1.0)",
    },
  });
  const buf = Buffer.from(data);
  log(`다운로드 완료: ${buf.length.toLocaleString()} bytes`);
  return buf;
}

// ── 2단계: ZIP 압축 해제 ──────────────────────────────────────────────────────

function extractMst(zipBuf: Buffer, suffix: string): Buffer {
  const zip   = new AdmZip(zipBuf);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith(suffix));
  if (!entry) throw new Error(`.mst 파일을 ZIP에서 찾을 수 없습니다.`);
  log(`.mst 추출: ${entry.entryName}`);
  return entry.getData();
}

// ── 3단계: .mst 파싱 ─────────────────────────────────────────────────────────

interface ParsedRow {
  code:       string;
  name:       string;
  capSize:    string;
  marketCap:  number;   // 억 단위
  groupCode:  string;
  isSpac:     boolean;  // SPAC(기업인수목적회사) 여부
}

export function parseMst(
  content:        Buffer,
  byteSize:       number,
  part1Cols:      readonly string[],
  part2Cols:      readonly string[],
  fieldSpecs:     readonly number[],
  groupCol:       string,
  capSizeCol:     string,
  nameCol:        string,
  marketCapPos:   number,
  marketCapWidth: number,
  spacCol:        string,
): ParsedRow[] {
  const text  = iconv.decode(content, "cp949");
  const rows: ParsedRow[] = [];

  for (const line of text.split("\n")) {
    const row = line + "\n";
    if (row.length <= byteSize) continue;

    // Part1: 단축코드(0:9), 표준코드(9:21), 한글명(21:~)
    const frontEnd = row.length - byteSize;
    const rf1      = row.slice(0, frontEnd);
    const record: Record<string, string> = {
      [part1Cols[0]]: rf1.slice(0, 9).trimEnd(),
      [part1Cols[1]]: rf1.slice(9, 21).trimEnd(),
      [part1Cols[2]]: rf1.slice(21).trim(),
    };

    // Part2: 고정폭 필드들
    const part2 = row.slice(-byteSize);
    let pos = 0;
    for (let i = 0; i < Math.min(fieldSpecs.length, part2Cols.length); i++) {
      const w = fieldSpecs[i] as number;
      record[part2Cols[i] as string] = part2.slice(pos, pos + w).trimEnd();
      pos += w;
    }

    // 시가총액: field spec 이후 남은 바이트에서 직접 읽기
    const marketCapStr = part2.slice(marketCapPos, marketCapPos + marketCapWidth).trim();
    const marketCap    = parseInt(marketCapStr, 10) || 0;

    rows.push({
      code:      record[part1Cols[0]] ?? "",
      name:      record[nameCol]      ?? "",
      capSize:   record[capSizeCol]   ?? "",
      marketCap,
      groupCode: record[groupCol]     ?? "",
      isSpac:    (record[spacCol]     ?? "").trim() === "1",
    });
  }

  return rows;
}

// ── 4단계: 필터 + 정렬 + 상위 N개 ────────────────────────────────────────────

export function filterAndRank(rows: ParsedRow[], topN: number): ParsedRow[] {
  return rows
    .filter((r) => r.code.length === 6 && r.groupCode === "ST" && !r.isSpac)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, topN);
}

// ── 5단계: JSON 저장 ──────────────────────────────────────────────────────────

export function saveJson(
  tickers:    ParsedRow[],
  sourceUrl:  string,
  outputFile: string,
  yahooSuffix: string,
): void {
  fs.mkdirSync(STOCK_INDEX_DIR, { recursive: true });

  const tickerKeys = tickers.map((t) => `${t.code}${yahooSuffix}`);
  const out: KrIndexJson = {
    updated_at:  new Date().toISOString(),
    source:      `한국투자증권 DWS – ${path.basename(sourceUrl)}`,
    source_url:  sourceUrl,
    total_count: tickers.length,
    tickers:     tickerKeys,  // Yahoo Finance 포맷 (예: 005930.KS)
    name_map:    Object.fromEntries(tickerKeys.map((k, i) => [k, tickers[i]!.name])),  // 한글명 매핑
  };

  fs.writeFileSync(outputFile, JSON.stringify(out, null, 2), "utf8");
  log(`JSON 저장: ${outputFile}  (${tickers.length}개)`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  log("=== 국내주식 티커 업데이트 시작 (DWS) ===");

  for (const idx of INDEXES) {
    log(`--- ${idx.name} 처리 시작 ---`);

    const zipBuf  = await downloadZip(idx.url);
    const mstBuf  = extractMst(zipBuf, idx.mstSuffix);
    const allRows = parseMst(
      mstBuf,
      idx.byteSize,
      idx.part1Cols,
      idx.part2Cols,
      idx.fieldSpecs,
      idx.groupCol,
      idx.capSizeCol,
      idx.nameCol,
      idx.marketCapPos,
      idx.marketCapWidth,
      idx.spacCol,
    );

    log(`전체 파싱: ${allRows.length}개 행`);

    const ranked = filterAndRank(allRows, idx.topN);

    if (ranked.length < idx.minCount) {
      throw new Error(
        `${idx.name} 파싱 결과가 너무 적습니다 (${ranked.length}개). ` +
        `DWS 파일 포맷이 변경되었을 수 있습니다.`,
      );
    }

    log(`상위 ${idx.topN}개 추출 완료`);
    log(`Top5: ${ranked.slice(0, 5).map((t) => `${t.code} ${t.name}(${t.marketCap}억)`).join(", ")}`);

    saveJson(ranked, idx.url, idx.outputFile, idx.yahooSuffix);
  }

  log("=== 업데이트 완료 ===");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
