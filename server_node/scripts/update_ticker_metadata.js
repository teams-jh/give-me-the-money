/**
 * 티커별 메타데이터 JSON 생성
 *
 * 흐름:
 *   1. src/db/russell1000_tickers.json 에서 티커 목록 로드
 *   2. 티커별 yahoo-finance2 quoteSummary + historical(3년) 조회
 *   3. S&P 500 편입 조건 자동 계산
 *   4. src/db/tickers/{TICKER}.json 저장
 *
 * 실행:
 *   node server_node/scripts/update_ticker_metadata.js            # 전체
 *   node server_node/scripts/update_ticker_metadata.js --force    # 기존 파일 덮어쓰기
 *   node server_node/scripts/update_ticker_metadata.js --ticker AAPL  # 단일 종목
 */

const fs           = require("fs");
const path         = require("path");
const yahooFinance = require("yahoo-finance2").default;

// ── 설정 ─────────────────────────────────────────────────────────────────────
const DB_DIR        = path.resolve(__dirname, "../../src/db");
const TICKERS_JSON  = path.join(DB_DIR, "russell1000_tickers.json");
const OUTPUT_DIR    = path.join(DB_DIR, "tickers");

const CONCURRENCY   = 5;      // 동시 처리 수
const BATCH_DELAY   = 3000;   // 배치 간 딜레이 (ms)
const PRICE_YEARS   = 3;      // 주가 기간 (년)

// S&P 500 편입 기준값
const SP500_MIN_MARKET_CAP  = 20_500_000_000;  // $20.5B
const SP500_MIN_FLOAT_RATIO = 0.5;             // 유동 비율 50%
const SP500_MIN_ADVT_RATIO  = 1.0;             // 연간 거래량 / 유동시총 ≥ 1.0
const SP500_QUARTERS        = 4;               // 흑자 유지 분기 수

const QUOTE_SUMMARY_MODULES = [
  "price",
  "assetProfile",
  "defaultKeyStatistics",
  "summaryDetail",
  "financialData",
  "incomeStatementHistoryQuarterly",
];

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg)  { console.log(`${new Date().toISOString()} [INFO]  ${msg}`); }
function warn(msg) { console.warn(`${new Date().toISOString()} [WARN]  ${msg}`); }
function err(msg)  { console.error(`${new Date().toISOString()} [ERROR] ${msg}`); }

// 배열을 n개씩 청크로 분할
function chunk(arr, n) {
  const result = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

// ── 1단계: Russell 1000 티커 목록 로드 ───────────────────────────────────────
function loadTickers() {
  if (!fs.existsSync(TICKERS_JSON)) {
    throw new Error(`${TICKERS_JSON} 파일이 없습니다. update_russell1000.js 를 먼저 실행하세요.`);
  }
  const { tickers } = JSON.parse(fs.readFileSync(TICKERS_JSON, "utf8"));
  log(`Russell 1000 티커 ${tickers.length}개 로드`);
  return tickers;
}

// ── 2단계: 종목 데이터 조회 ──────────────────────────────────────────────────
async function fetchQuoteSummary(ticker) {
  return yahooFinance.quoteSummary(ticker, {
    modules: QUOTE_SUMMARY_MODULES,
  }, { validateResult: false });
}

async function fetchPriceHistory(ticker) {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - PRICE_YEARS);

  const rows = await yahooFinance.historical(ticker, {
    period1: period1.toISOString().slice(0, 10),
    period2: period2.toISOString().slice(0, 10),
    interval: "1d",
  }, { validateResult: false });

  return rows.map(({ date, open, high, low, close, adjClose, volume }) => ({
    date:      date.toISOString().slice(0, 10),
    open:      round(open),
    high:      round(high),
    low:       round(low),
    close:     round(close),
    adj_close: round(adjClose),
    volume:    volume ?? null,
  }));
}

// ── 3단계: JSON 구조 빌드 ────────────────────────────────────────────────────
function buildTickerJson(ticker, summary, prices) {
  const p   = summary.price                            ?? {};
  const ap  = summary.assetProfile                     ?? {};
  const ks  = summary.defaultKeyStatistics             ?? {};
  const sd  = summary.summaryDetail                    ?? {};
  const fd  = summary.financialData                    ?? {};
  const ish = summary.incomeStatementHistoryQuarterly  ?? {};

  // 분기 순이익 (최신순)
  const quarterlyEarnings = (ish.incomeStatementHistory ?? [])
    .slice(0, SP500_QUARTERS)
    .map((q) => ({
      quarter:    formatQuarter(q.endDate),
      net_income: q.netIncome ?? null,
    }));

  // S&P 500 편입 조건 계산
  const marketCap        = p.marketCap         ?? null;
  const floatShares      = ks.floatShares       ?? null;
  const sharesOutstanding= ks.sharesOutstanding ?? null;
  const avgDailyVolume   = sd.averageVolume     ?? null;
  const currentPrice     = p.regularMarketPrice ?? fd.currentPrice ?? null;

  const floatRatio = (floatShares && sharesOutstanding)
    ? floatShares / sharesOutstanding : null;

  // 연간 달러 거래량 / 유동시총 = avgVol × 252 × price / (floatShares × price)
  //                             = avgVol × 252 / floatShares
  const advtRatio = (avgDailyVolume && floatShares)
    ? (avgDailyVolume * 252) / floatShares : null;

  const isProfitable = quarterlyEarnings.length >= SP500_QUARTERS
    && quarterlyEarnings.every((q) => q.net_income !== null && q.net_income > 0);

  const exchange = p.exchangeName ?? p.exchange ?? null;
  const isUsExchange = ["NMS","NYQ","NGM","NCM","PCX","NYSEArca"].includes(exchange);
  const isUs         = (ap.country ?? "").toUpperCase().includes("UNITED STATES") || ap.country === "US";

  const eligibility = {
    market_cap_ok:    marketCap !== null ? marketCap >= SP500_MIN_MARKET_CAP  : null,
    float_ratio_ok:   floatRatio !== null ? floatRatio >= SP500_MIN_FLOAT_RATIO : null,
    liquidity_ok:     advtRatio !== null ? advtRatio >= SP500_MIN_ADVT_RATIO   : null,
    profitability_ok: quarterlyEarnings.length >= SP500_QUARTERS ? isProfitable : null,
    country_ok:       ap.country ? isUs           : null,
    exchange_ok:      exchange   ? isUsExchange   : null,
  };
  eligibility.is_eligible = Object.values(eligibility).every((v) => v === true);

  return {
    ticker,
    updated_at: new Date().toISOString(),

    info: {
      name:                 p.longName   ?? p.shortName ?? null,
      exchange:             exchange,
      currency:             p.currency   ?? null,
      sector:               ap.sector    ?? null,
      industry:             ap.industry  ?? null,
      country:              ap.country   ?? null,
      employees:            ap.fullTimeEmployees ?? null,
      website:              ap.website   ?? null,
      description:          ap.longBusinessSummary ?? null,
      is_actively_trading:  p.marketState !== "CLOSED" ? true : null,
    },

    market: {
      market_cap:            marketCap,
      shares_outstanding:    sharesOutstanding,
      float_shares:          floatShares,
      float_ratio:           floatRatio !== null ? round(floatRatio, 4) : null,
      price:                 currentPrice,
      previous_close:        sd.previousClose     ?? null,
      fifty_two_week_high:   sd.fiftyTwoWeekHigh  ?? null,
      fifty_two_week_low:    sd.fiftyTwoWeekLow   ?? null,
      beta:                  sd.beta              ?? null,
    },

    liquidity: {
      avg_daily_volume_3m:   avgDailyVolume,
      avg_daily_volume_10d:  sd.averageVolume10days ?? null,
      advt_to_float_ratio:   advtRatio !== null ? round(advtRatio, 4) : null,
    },

    valuation: {
      trailing_pe:   sd.trailingPE   ?? null,
      forward_pe:    sd.forwardPE    ?? null,
      peg_ratio:     ks.pegRatio     ?? null,
      price_to_book: ks.priceToBook  ?? null,
      trailing_eps:  ks.trailingEps  ?? null,
      forward_eps:   ks.forwardEps   ?? null,
      enterprise_value: ks.enterpriseValue ?? null,
    },

    profitability: {
      profit_margins:    fd.profitMargins    ?? null,
      gross_margins:     fd.grossMargins     ?? null,
      operating_margins: fd.operatingMargins ?? null,
      roe:               fd.returnOnEquity   ?? null,
      roa:               fd.returnOnAssets   ?? null,
      revenue_growth:    fd.revenueGrowth    ?? null,
      earnings_growth:   fd.earningsGrowth   ?? null,
      quarterly_earnings: quarterlyEarnings,
    },

    dividend: {
      rate:               sd.dividendRate  ?? null,
      yield:              sd.dividendYield ?? null,
      payout_ratio:       sd.payoutRatio   ?? null,
    },

    ownership: {
      held_pct_institutions: ks.heldPercentInstitutions ?? null,
      held_pct_insiders:     ks.heldPercentInsiders     ?? null,
      short_ratio:           ks.shortRatio              ?? null,
    },

    sp500_eligibility: eligibility,

    prices,
  };
}

function round(v, d = 2) {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 10 ** d) / 10 ** d;
}

function formatQuarter(date) {
  if (!date) return null;
  const d = new Date(date);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}Q${q}`;
}

// ── 4단계: 파일 저장 ──────────────────────────────────────────────────────────
function saveTickerJson(ticker, data) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${ticker}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ── 5단계: 단일 티커 처리 ────────────────────────────────────────────────────
async function processTicker(ticker, force) {
  const file = path.join(OUTPUT_DIR, `${ticker}.json`);

  if (!force && fs.existsSync(file)) {
    log(`[SKIP] ${ticker} — 이미 존재 (--force 로 덮어쓰기 가능)`);
    return { status: "skipped" };
  }

  try {
    const [summary, prices] = await Promise.all([
      fetchQuoteSummary(ticker),
      fetchPriceHistory(ticker),
    ]);

    const data = buildTickerJson(ticker, summary, prices);
    saveTickerJson(ticker, data);
    return { status: "ok", priceCount: prices.length };

  } catch (e) {
    warn(`[FAIL] ${ticker} — ${e.message}`);
    return { status: "error", message: e.message };
  }
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
async function main() {
  const args    = process.argv.slice(2);
  const force   = args.includes("--force");
  const single  = args.includes("--ticker") ? args[args.indexOf("--ticker") + 1] : null;

  log("=== 티커 메타데이터 업데이트 시작 ===");

  const allTickers = single ? [single.toUpperCase()] : loadTickers();
  const batches    = chunk(allTickers, CONCURRENCY);

  const stats = { ok: 0, skipped: 0, error: 0 };
  let done = 0;

  for (const batch of batches) {
    const results = await Promise.all(batch.map((t) => processTicker(t, force)));

    results.forEach((r, i) => {
      done++;
      stats[r.status] = (stats[r.status] ?? 0) + 1;
      if (r.status === "ok") {
        log(`[${done}/${allTickers.length}] ${batch[i]} ✓  (주가 ${r.priceCount}일)`);
      }
    });

    if (batches.indexOf(batch) < batches.length - 1) await sleep(BATCH_DELAY);
  }

  log(`\n=== 완료 ===`);
  log(`성공: ${stats.ok}  /  스킵: ${stats.skipped}  /  실패: ${stats.error}`);
}

main().catch((e) => { err(e.message); process.exit(1); });
