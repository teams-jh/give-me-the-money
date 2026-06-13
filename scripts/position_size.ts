/**
 * position_size.ts
 *
 * ATR 기반 포지션 사이징 계산 스크립트.
 * ticker JSON에서 현재가·ATR을 자동 로드하여 계산 결과를 출력한다.
 *
 * 실행 예 (루트 디렉토리에서):
 *   server_node/node_modules/.bin/tsx scripts/position_size.ts \
 *     --market us --ticker AAPL --capital 10000000 --risk 1
 *
 *   server_node/node_modules/.bin/tsx scripts/position_size.ts \
 *     --market kr --ticker 005930 --capital 50000000 --risk 0.5 --multiplier 2
 *
 *   server_node/node_modules/.bin/tsx scripts/position_size.ts \
 *     --market us --ticker NVDA --capital 10000000 --risk 2 --targets 1,2,3,5
 *
 * 옵션:
 *   --market     us | kr          (필수)
 *   --ticker     티커 심볼         (필수)
 *   --capital    총 자본           (필수)
 *   --risk       리스크 %          (기본 1)
 *   --multiplier ATR 손절 배수     (기본 1.5)
 *   --targets    목표 R 배수 목록   (기본 1,2,3)
 */

import path from "path";
import { fileURLToPath } from "url";

import { calcATR }          from "../src/library/shared/indicators.ts";
import { calcPositionSize } from "../src/library/shared/position.ts";
import type { OHLCV }       from "../src/library/shared/indicators.ts";
import { loadTicker as repoLoadTicker, findSimilarTicker } from "../src/library/shared/tickerRepository.ts";
import { toOHLCV } from "../src/library/shared/tickerMapper.ts";
import type { RawTicker } from "../src/library/shared/tickerTypes.ts";

// ── 경로 설정 ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SUPPORTED_MARKETS = new Set(["us", "kr"]);

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  market:      string;
  ticker:      string;
  capital:     number;
  risk:        number;
  multiplier:  number;
  targets:     number[];
}

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

export function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let market     = "";
  let ticker     = "";
  let capital    = 0;
  let risk       = 1;
  let multiplier = 1.5;
  let targets    = [1, 2, 3];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === "--market")     { market     = args[++i] ?? ""; }
    else if (a === "--ticker")     { ticker     = (args[++i] ?? "").toUpperCase(); }
    else if (a === "--capital")    { capital    = parseFloat(args[++i] ?? "0"); }
    else if (a === "--risk")       { risk       = parseFloat(args[++i] ?? "1"); }
    else if (a === "--multiplier") { multiplier = parseFloat(args[++i] ?? "1.5"); }
    else if (a === "--targets")    {
      targets = (args[++i] ?? "1,2,3").split(",").map(Number).filter(n => n > 0);
    }
  }

  // 필수 옵션 검사
  const missing: string[] = [];
  if (!market)  missing.push("--market");
  if (!ticker)  missing.push("--ticker");
  if (!capital) missing.push("--capital");

  if (missing.length > 0 || !SUPPORTED_MARKETS.has(market)) {
    console.error(`
❌ 사용법:
   server_node/node_modules/.bin/tsx scripts/position_size.ts \\
     --market us|kr  --ticker 심볼  --capital 총자본 \\
     [--risk 1]  [--multiplier 1.5]  [--targets 1,2,3]

예시:
   ... --market us --ticker AAPL --capital 10000000 --risk 1
   ... --market kr --ticker 005930 --capital 50000000 --risk 0.5
`);
    if (missing.length) console.error(`  누락된 옵션: ${missing.join(", ")}`);
    if (!SUPPORTED_MARKETS.has(market)) console.error(`  알 수 없는 마켓: '${market}'`);
    process.exit(1);
  }

  return { market, ticker, capital, risk, multiplier, targets };
}

// ── 데이터 로드 ───────────────────────────────────────────────────────────────

export function loadTicker(market: string, ticker: string): RawTicker {
  // KR 티커는 .KS/.KQ suffix가 없는 파일명으로 저장됨. 대문자로 정규화하여 조회.
  const bare = ticker.split(".")[0]!.toUpperCase();
  const raw  = repoLoadTicker(market, bare);

  if (raw === null) {
    // signals_all.json 에서 유사 티커 힌트 제공 (Repository 가 올바른 {market}/signals 경로 사용)
    const found = findSimilarTicker(market, bare);
    const hint  = found ? `\n  혹시 이 티커를 찾으시나요? → ${found}` : "";
    console.error(`❌ 파일 없음: ${bare} (${market})${hint}`);
    process.exit(1);
  }

  return raw;
}

// ── 출력 헬퍼 ─────────────────────────────────────────────────────────────────

export function fmt(n: number, currency: string): string {
  if (currency === "KRW") return n.toLocaleString("ko-KR") + "원";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function bar(pct: number, max: number = 30): string {
  const filled = Math.round(Math.min(pct, 100) / 100 * max);
  return "█".repeat(filled) + "░".repeat(max - filled);
}

// ── main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs();

  // 1. 데이터 로드
  const raw  = loadTicker(args.market, args.ticker);
  const name = raw.info.kr_name ?? raw.info.name;

  // 2. ATR 계산 (전체 prices 사용, 최근 14일 기준)
  const ohlcv: OHLCV[] = toOHLCV(raw);

  const atrArr = calcATR(ohlcv, 14);
  const atr    = atrArr[atrArr.length - 1];

  if (atr === null || atr === undefined) {
    console.error("❌ ATR 계산 실패: 데이터가 부족합니다 (최소 15봉 필요).");
    process.exit(1);
  }

  const currentPrice = raw.market.price;
  const currency     = args.market === "kr" ? "KRW" : "USD";

  // 3. 포지션 사이징 계산
  const result = calcPositionSize({
    totalCapital:  args.capital,
    riskPct:       args.risk,
    currentPrice,
    atr,
    atrMultiplier: args.multiplier,
    targetRatios:  args.targets,
  });

  // ── 4. 결과 출력 ──────────────────────────────────────────────────────────

  const line = "─".repeat(60);
  const dline = "═".repeat(60);

  console.log(`\n${dline}`);
  console.log(`  📐 포지션 사이징 계산 결과`);
  console.log(`  ${raw.ticker}  ${name}  [${raw.info.sector}]`);
  console.log(dline);

  // 입력 요약
  console.log(`\n  ┌─ 입력 조건 ${"─".repeat(43)}`);
  console.log(`  │  총 자본       : ${fmt(result.totalCapital, currency)}`);
  console.log(`  │  허용 리스크   : ${result.riskPct}%  →  허용 손실금액 ${fmt(result.riskAmount, currency)}`);
  console.log(`  │  현재가        : ${fmt(result.currentPrice, currency)}`);
  console.log(`  │  ATR (14일)    : ${fmt(atr, currency)}`);
  console.log(`  │  손절 배수     : ${result.atrMultiplier}×`);
  console.log(`  └${"─".repeat(50)}`);

  // 손절 계산
  console.log(`\n  ┌─ 손절 계산 ${"─".repeat(44)}`);
  console.log(`  │  1주당 손절폭  : ${fmt(result.lossPerShare, currency)}  (${result.stopLossPct}%)`);
  console.log(`  │  손절가        : ${fmt(result.stopLoss, currency)}`);
  console.log(`  └${"─".repeat(50)}`);

  // 포지션 규모
  console.log(`\n  ┌─ 포지션 규모 ${"─".repeat(43)}`);
  console.log(`  │`);
  console.log(`  │  매수 수량     : ${result.shares.toLocaleString()} 주`);
  console.log(`  │  총 투자금액   : ${fmt(result.totalInvestment, currency)}`);
  console.log(`  │  실제 리스크   : ${fmt(result.actualRisk, currency)}`);
  console.log(`  │`);
  console.log(`  │  자본 사용 비중  ${bar(result.capitalUsagePct)}  ${result.capitalUsagePct}%`);
  console.log(`  └${"─".repeat(50)}`);

  // 목표가 (R배수)
  console.log(`\n  ┌─ 목표가 (R배수) ${"─".repeat(40)}`);
  console.log(`  │  현재가   : ${fmt(result.currentPrice, currency)}  (기준)`);
  for (const t of result.targets) {
    const label = `  │  ${t.ratio}R 목표  : ${fmt(t.price, currency)}`.padEnd(42);
    console.log(`${label}  +${t.returnPct}%  /  +${fmt(t.profit, currency)}`);
  }
  console.log(`  │  손절가   : ${fmt(result.stopLoss, currency)}  (-${result.stopLossPct}%)`);
  console.log(`  └${"─".repeat(50)}`);

  // 경고
  if (result.warnings.length > 0) {
    console.log(`\n  ⚠️  경고`);
    for (const w of result.warnings) {
      console.log(`  │  ${w}`);
    }
  }

  console.log(`\n${dline}\n`);
}

const _isEntryPosition = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;
if (_isEntryPosition) main();
