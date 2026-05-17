/**
 * 국내주식 티커 JSON에 kr_name 필드 일괄 주입
 *
 * Yahoo Finance API 호출 없이 all_kr_tickers.json의 name_map만 사용하여
 * 기존 kr_tickers/*.json 파일에 info.kr_name 필드를 추가한다.
 *
 * 실행:
 *   npx tsx scripts/patch/patch_kr_name.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_DIR      = path.resolve(__dirname, "../../src/db");
const TICKERS_DIR = path.join(DB_DIR, "kr_tickers");
const META_FILE   = path.join(DB_DIR, "metadata", "all_kr_tickers.json");

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function main(): void {
  // 1. name_map 로드
  const meta     = JSON.parse(fs.readFileSync(META_FILE, "utf8")) as { name_map?: Record<string, string> };
  const nameMap  = meta.name_map ?? {};
  const mapCount = Object.keys(nameMap).length;
  log(`name_map 로드: ${mapCount}개`);

  if (mapCount === 0) {
    log("name_map이 비어 있습니다. update_kr_stock.ts → merge_kr_tickers.ts 를 먼저 실행하세요.");
    process.exit(1);
  }

  // 2. kr_tickers/*.json 순회
  const files  = fs.readdirSync(TICKERS_DIR).filter((f) => f.endsWith(".json"));
  log(`대상 파일: ${files.length}개`);

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const file of files) {
    const filePath = path.join(TICKERS_DIR, file);
    const data     = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      ticker: string;
      info:   Record<string, unknown>;
    };

    // name_map 조회: "000150.KS" 형식 또는 "000150" 형식 모두 지원
    const ticker   = data.ticker;                    // "000150.KS"
    const krName   = nameMap[ticker] ?? null;

    if (krName === null) {
      noMatch++;
      continue;
    }

    // 이미 동일한 값이면 스킵
    if (data.info["kr_name"] === krName) {
      skipped++;
      continue;
    }

    // info에 kr_name 추가 (name 바로 뒤에 삽입)
    const newInfo: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.info)) {
      newInfo[k] = v;
      if (k === "name") newInfo["kr_name"] = krName;
    }
    // name 키가 없었을 경우 대비
    if (!("kr_name" in newInfo)) newInfo["kr_name"] = krName;

    data.info = newInfo;

    // atomic write
    const tmp = filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
    updated++;
  }

  log(`완료 — 업데이트: ${updated}  /  스킵(이미 동일): ${skipped}  /  매핑 없음: ${noMatch}`);
}

main();
