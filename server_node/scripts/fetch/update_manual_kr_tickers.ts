/**
 * 수동 관심 종목 관리 (manual_kr_tickers.json)
 *
 * 흐름:
 *   add    : manual_kr_tickers.json에 종목 추가 (중복 무시)
 *   remove : manual_kr_tickers.json에서 종목 제거
 *   list   : 현재 등록된 종목 목록 출력
 *
 * 실행:
 *   npx tsx scripts/fetch/update_manual_kr_tickers.ts add    --ticker 005930.KS --name 삼성전자
 *   npx tsx scripts/fetch/update_manual_kr_tickers.ts add    --ticker 005930.KS              # name 없이도 가능
 *   npx tsx scripts/fetch/update_manual_kr_tickers.ts remove --ticker 005930.KS
 *   npx tsx scripts/fetch/update_manual_kr_tickers.ts list
 *
 * 티커 형식:
 *   코스피 종목 → 6자리 코드 + .KS  (예: 005930.KS)
 *   코스닥 종목 → 6자리 코드 + .KQ  (예: 247540.KQ)
 *
 * 주의:
 *   add 후 all_kr_tickers.json 갱신이 필요하면 아래 명령을 추가로 실행하세요.
 *   npx tsx scripts/merge/merge_kr_tickers.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 경로 ─────────────────────────────────────────────────────────────────────

const MANUAL_TICKERS_PATH = path.resolve(
  __dirname,
  "../../../src/db/stock_market_index/manual_kr_tickers.json",
);

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface ManualTickersJson {
  updated_at:  string;
  source:      string;
  source_url:  string;
  total_count: number;
  tickers:     string[];
  name_map:    Record<string, string>;
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function readManualTickers(): ManualTickersJson {
  const raw = fs.readFileSync(MANUAL_TICKERS_PATH, "utf8");
  return JSON.parse(raw) as ManualTickersJson;
}

function writeManualTickers(data: ManualTickersJson): void {
  data.updated_at  = new Date().toISOString();
  data.total_count = data.tickers.length;
  fs.writeFileSync(MANUAL_TICKERS_PATH, JSON.stringify(data, null, 2), "utf8");
  log(`저장 완료: ${MANUAL_TICKERS_PATH}`);
}

function validateTicker(ticker: string): void {
  const pattern = /^\d{6}\.(KS|KQ)$/;
  if (!pattern.test(ticker)) {
    throw new Error(
      `티커 형식이 올바르지 않습니다: "${ticker}"\n` +
      `  코스피 예시: 005930.KS\n` +
      `  코스닥 예시: 247540.KQ`,
    );
  }
}

function parseArgs(): { command: string; ticker?: string; name?: string } {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !["add", "remove", "list"].includes(command)) {
    console.error("사용법:");
    console.error("  npx tsx scripts/fetch/update_manual_kr_tickers.ts add    --ticker <TICKER> [--name <종목명>]");
    console.error("  npx tsx scripts/fetch/update_manual_kr_tickers.ts remove --ticker <TICKER>");
    console.error("  npx tsx scripts/fetch/update_manual_kr_tickers.ts list");
    process.exit(1);
  }

  let ticker: string | undefined;
  let name:   string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--ticker" && args[i + 1]) {
      ticker = args[++i];
    } else if (args[i] === "--name" && args[i + 1]) {
      name = args[++i];
    }
  }

  if ((command === "add" || command === "remove") && !ticker) {
    console.error(`오류: ${command} 명령에는 --ticker 가 필요합니다.`);
    process.exit(1);
  }

  return { command, ticker, name };
}

// ── 명령 처리 ─────────────────────────────────────────────────────────────────

function cmdAdd(ticker: string, name?: string): void {
  validateTicker(ticker);

  const data = readManualTickers();

  if (data.tickers.includes(ticker)) {
    log(`이미 등록된 종목입니다: ${ticker}`);

    // name이 주어졌으면 name_map만 업데이트
    if (name) {
      data.name_map[ticker] = name;
      writeManualTickers(data);
      log(`종목명 업데이트: ${ticker} → ${name}`);
    }
    return;
  }

  data.tickers.push(ticker);
  data.tickers.sort();

  if (name) {
    data.name_map[ticker] = name;
  }

  writeManualTickers(data);
  log(`추가 완료: ${ticker}${name ? ` (${name})` : ""}`);
  log(`현재 수동 종목 수: ${data.tickers.length}개`);
  log(`※ all_kr_tickers.json 갱신이 필요하면 아래 명령을 실행하세요:`);
  log(`  npx tsx scripts/merge/merge_kr_tickers.ts`);
}

function cmdRemove(ticker: string): void {
  validateTicker(ticker);

  const data = readManualTickers();

  if (!data.tickers.includes(ticker)) {
    log(`등록되지 않은 종목입니다: ${ticker}`);
    return;
  }

  data.tickers  = data.tickers.filter((t) => t !== ticker);
  delete data.name_map[ticker];

  writeManualTickers(data);
  log(`제거 완료: ${ticker}`);
  log(`현재 수동 종목 수: ${data.tickers.length}개`);
  log(`※ all_kr_tickers.json 갱신이 필요하면 아래 명령을 실행하세요:`);
  log(`  npx tsx scripts/merge/merge_kr_tickers.ts`);
}

function cmdList(): void {
  const data = readManualTickers();

  if (data.tickers.length === 0) {
    log("등록된 수동 종목이 없습니다.");
    return;
  }

  log(`=== 수동 관심 종목 목록 (총 ${data.tickers.length}개) ===`);
  for (const ticker of data.tickers) {
    const name = data.name_map[ticker] ?? "(종목명 없음)";
    console.log(`  ${ticker.padEnd(12)} ${name}`);
  }
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

function main(): void {
  const { command, ticker, name } = parseArgs();

  if (command === "add")    cmdAdd(ticker!, name);
  if (command === "remove") cmdRemove(ticker!);
  if (command === "list")   cmdList();
}

main();
