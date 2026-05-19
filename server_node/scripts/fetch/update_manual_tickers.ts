/**
 * 수동 관심 종목 관리 (manual_kr_tickers.json / manual_us_tickers.json)
 *
 * 흐름:
 *   add    : 해당 마켓 manual JSON에 종목 추가 (중복 무시)
 *   remove : 해당 마켓 manual JSON에서 종목 제거
 *   list   : 현재 등록된 종목 목록 출력
 *
 * 실행:
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market kr add    --ticker 005930.KS --name 삼성전자
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market kr add    --ticker 005930.KS
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market kr remove --ticker 005930.KS
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market kr list
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market us add    --ticker AAPL --name Apple
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market us remove --ticker AAPL
 *   npx tsx scripts/fetch/update_manual_tickers.ts --market us list
 *
 * 티커 형식:
 *   kr: 6자리 숫자 + .KS 또는 .KQ  (예: 005930.KS / 247540.KQ)
 *   us: 영문자·숫자·하이픈          (예: AAPL / BRK-B)
 *
 * 주의:
 *   add / remove 후 all_{market}_tickers.json 갱신이 필요하면 아래 명령을 실행하세요.
 *   kr: npx tsx scripts/merge/merge_kr_tickers.ts
 *   us: npx tsx scripts/merge/merge_us_tickers.ts
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 마켓 설정 ─────────────────────────────────────────────────────────────────

const STOCK_INDEX_DIR = path.resolve(__dirname, "../../../src/db/stock_market_index");

interface MarketConfig {
  jsonFile:        string;
  tickerPattern:   RegExp;
  tickerExample:   string;
  mergeScript:     string;
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  kr: {
    jsonFile:      path.join(STOCK_INDEX_DIR, "manual_kr_tickers.json"),
    tickerPattern: /^\d{6}\.(KS|KQ)$/,
    tickerExample: "코스피 예시: 005930.KS  /  코스닥 예시: 247540.KQ",
    mergeScript:   "npx tsx scripts/merge/merge_kr_tickers.ts",
  },
  us: {
    jsonFile:      path.join(STOCK_INDEX_DIR, "manual_us_tickers.json"),
    tickerPattern: /^[A-Z0-9]{1,5}(-[A-Z])?$/,
    tickerExample: "예시: AAPL / BRK-B",
    mergeScript:   "npx tsx scripts/merge/merge_us_tickers.ts",
  },
};

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

function readJson(filePath: string): ManualTickersJson {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as ManualTickersJson;
}

function writeJson(filePath: string, data: ManualTickersJson): void {
  data.updated_at  = new Date().toISOString();
  data.total_count = data.tickers.length;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  log(`저장 완료: ${filePath}`);
}

function validateTicker(ticker: string, config: MarketConfig): void {
  if (!config.tickerPattern.test(ticker)) {
    throw new Error(
      `티커 형식이 올바르지 않습니다: "${ticker}"\n  ${config.tickerExample}`,
    );
  }
}

// ── 인자 파싱 ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  market:  string;
  command: string;
  ticker?: string;
  name?:   string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  // --market 파싱
  const marketIdx = args.indexOf("--market");
  if (marketIdx === -1 || !args[marketIdx + 1]) {
    console.error("오류: --market kr 또는 --market us 가 필요합니다.");
    process.exit(1);
  }
  const market = args[marketIdx + 1]!;
  if (!MARKET_CONFIG[market]) {
    console.error(`오류: 지원하지 않는 마켓입니다: "${market}" (kr / us 중 선택)`);
    process.exit(1);
  }

  // command 파싱 (--market 이후 첫 번째 non-flag 토큰)
  const remaining = args.filter((_, i) => i !== marketIdx && i !== marketIdx + 1);
  const command   = remaining[0];

  if (!command || !["add", "remove", "list"].includes(command)) {
    console.error("사용법:");
    console.error("  npx tsx scripts/fetch/update_manual_tickers.ts --market <kr|us> add    --ticker <TICKER> [--name <종목명>]");
    console.error("  npx tsx scripts/fetch/update_manual_tickers.ts --market <kr|us> remove --ticker <TICKER>");
    console.error("  npx tsx scripts/fetch/update_manual_tickers.ts --market <kr|us> list");
    process.exit(1);
  }

  let ticker: string | undefined;
  let name:   string | undefined;

  for (let i = 1; i < remaining.length; i++) {
    if (remaining[i] === "--ticker" && remaining[i + 1]) ticker = remaining[++i];
    if (remaining[i] === "--name"   && remaining[i + 1]) name   = remaining[++i];
  }

  if ((command === "add" || command === "remove") && !ticker) {
    console.error(`오류: ${command} 명령에는 --ticker 가 필요합니다.`);
    process.exit(1);
  }

  return { market, command, ticker, name };
}

// ── 명령 처리 ─────────────────────────────────────────────────────────────────

function cmdAdd(config: MarketConfig, ticker: string, name?: string): void {
  validateTicker(ticker, config);

  const data = readJson(config.jsonFile);

  if (data.tickers.includes(ticker)) {
    log(`이미 등록된 종목입니다: ${ticker}`);
    if (name) {
      data.name_map[ticker] = name;
      writeJson(config.jsonFile, data);
      log(`종목명 업데이트: ${ticker} → ${name}`);
    }
    return;
  }

  data.tickers.push(ticker);
  data.tickers.sort();
  if (name) data.name_map[ticker] = name;

  writeJson(config.jsonFile, data);
  log(`추가 완료: ${ticker}${name ? ` (${name})` : ""}`);
  log(`현재 수동 종목 수: ${data.tickers.length}개`);
  log(`※ all_tickers.json 갱신이 필요하면 아래 명령을 실행하세요:`);
  log(`  ${config.mergeScript}`);
}

function cmdRemove(config: MarketConfig, ticker: string): void {
  validateTicker(ticker, config);

  const data = readJson(config.jsonFile);

  if (!data.tickers.includes(ticker)) {
    log(`등록되지 않은 종목입니다: ${ticker}`);
    return;
  }

  data.tickers = data.tickers.filter((t) => t !== ticker);
  delete data.name_map[ticker];

  writeJson(config.jsonFile, data);
  log(`제거 완료: ${ticker}`);
  log(`현재 수동 종목 수: ${data.tickers.length}개`);
  log(`※ all_tickers.json 갱신이 필요하면 아래 명령을 실행하세요:`);
  log(`  ${config.mergeScript}`);
}

function cmdList(config: MarketConfig): void {
  const data = readJson(config.jsonFile);

  if (data.tickers.length === 0) {
    log("등록된 수동 종목이 없습니다.");
    return;
  }

  log(`=== 수동 관심 종목 목록 (총 ${data.tickers.length}개) ===`);
  for (const ticker of data.tickers) {
    const name = data.name_map[ticker] ?? "(종목명 없음)";
    console.log(`  ${ticker.padEnd(14)} ${name}`);
  }
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

function main(): void {
  const { market, command, ticker, name } = parseArgs();
  const config = MARKET_CONFIG[market]!;

  if (command === "add")    cmdAdd(config, ticker!, name);
  if (command === "remove") cmdRemove(config, ticker!);
  if (command === "list")   cmdList(config);
}

main();
