/**
 * 미국 시총 상위 1000위 티커 리스트 업데이트
 *
 * 흐름:
 *   1. Wikipedia에서 S&P 500 / 400 / 600 티커 수집 (~1500개 시드)
 *   2. yahoo-finance2 로 시총 배치 조회
 *   3. 시총 내림차순 정렬 → 상위 1000개 추출
 *   4. src/db/ 에 CSV / JSON 저장
 *
 * 실행:
 *   node server_node/scripts/update_us_tickers.js
 */

const fs           = require("fs");
const path         = require("path");
const axios        = require("axios");
const cheerio      = require("cheerio");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

// ── 설정 ─────────────────────────────────────────────────────────────────────
// __dirname = server_node/scripts/ → ../../src/db = 레포 루트/src/db
const DB_DIR      = path.resolve(__dirname, "../../src/db");
const OUTPUT_CSV  = path.join(DB_DIR, "us_top1000_tickers.csv");
const OUTPUT_META = path.join(DB_DIR, "us_top1000_meta.json");

const TARGET_COUNT = 1000;
const BATCH_SIZE   = 100;    // yahoo-finance2 한 번에 처리할 티커 수
const BATCH_DELAY  = 2000;   // 배치 간 딜레이 (ms)

const INDEX_URLS = [
  {
    name:     "S&P 500",
    url:      "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    colHints: ["symbol", "ticker"],
  },
  {
    name:     "S&P 400",
    url:      "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies",
    colHints: ["ticker", "symbol"],
  },
  {
    name:     "S&P 600",
    url:      "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies",
    colHints: ["ticker", "symbol"],
  },
];

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

// ── 1단계: Wikipedia에서 시드 티커 수집 ──────────────────────────────────────
async function fetchSeedTickers() {
  const tickerSet = new Set();

  for (const { name, url, colHints } of INDEX_URLS) {
    try {
      const { data: html } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000,
      });

      const $     = cheerio.load(html);
      const table = $("table.wikitable").first();

      // 헤더 파싱
      const headers = [];
      table.find("tr").first().find("th, td").each((_, el) => {
        headers.push($(el).text().trim().toLowerCase());
      });

      // 티커 컬럼 인덱스 탐색
      const colIdx = headers.findIndex((h) =>
        colHints.some((hint) => h.includes(hint))
      );

      if (colIdx === -1) {
        console.warn(`[${name}] 티커 컬럼 없음. 헤더: ${headers.join(", ")}`);
        continue;
      }

      // 데이터 행 파싱
      let count = 0;
      table.find("tr").slice(1).each((_, row) => {
        const cells = $(row).find("td");
        const raw   = $(cells[colIdx]).text().trim().toUpperCase();
        if (raw) {
          tickerSet.add(raw.replace(/\./g, "-")); // BRK.B → BRK-B
          count++;
        }
      });

      log(`[${name}] ${count}개 수집 (누계 ${tickerSet.size}개)`);
    } catch (err) {
      console.error(`[${name}] 수집 실패: ${err.message}`);
    }
  }

  const result = [...tickerSet].sort();
  log(`시드 티커 총 ${result.length}개`);
  return result;
}

// ── 2단계: yahoo-finance2 시총 배치 조회 ─────────────────────────────────────
async function fetchMarketCaps(tickers) {
  const records     = [];
  const total       = tickers.length;
  const totalBatches = Math.ceil(total / BATCH_SIZE);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch    = tickers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    log(`배치 ${batchNum}/${totalBatches}  (${i + 1}~${Math.min(i + BATCH_SIZE, total)}번째)`);

    await Promise.all(
      batch.map(async (symbol) => {
        try {
          const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
          const cap   = quote?.marketCap;
          if (cap && cap > 0) {
            records.push({
              ticker:     symbol,
              market_cap: cap,
              price:      quote?.regularMarketPrice ?? null,
              exchange:   quote?.exchange ?? null,
              name:       quote?.shortName ?? quote?.longName ?? null,
            });
          }
        } catch {
          // 조회 실패 종목 건너뜀
        }
      })
    );

    log(`  → 유효 시총 누계: ${records.length}개`);
    if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY);
  }

  return records;
}

// ── 3단계: 정렬 및 상위 1000 추출 ────────────────────────────────────────────
function buildTop1000(records) {
  const unique = new Map();
  for (const r of records) {
    if (!unique.has(r.ticker) && r.market_cap > 0) {
      unique.set(r.ticker, r);
    }
  }

  return [...unique.values()]
    .sort((a, b) => b.market_cap - a.market_cap)
    .slice(0, TARGET_COUNT)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

// ── 4단계: src/db/ 에 CSV / JSON 저장 ────────────────────────────────────────
function saveOutputs(top1000) {
  fs.mkdirSync(DB_DIR, { recursive: true });

  // CSV 저장
  const header = "rank,ticker,name,market_cap,price,exchange\n";
  const rows   = top1000
    .map(({ rank, ticker, name, market_cap, price, exchange }) =>
      [
        rank,
        ticker,
        `"${(name ?? "").replace(/"/g, '""')}"`,
        market_cap,
        price   ?? "",
        exchange ?? "",
      ].join(",")
    )
    .join("\n");

  fs.writeFileSync(OUTPUT_CSV, header + rows, "utf8");
  log(`CSV 저장: ${OUTPUT_CSV}  (${top1000.length}개)`);

  // JSON 메타 저장
  const meta = {
    updated_at:  new Date().toISOString(),
    total_count: top1000.length,
    source:      "Wikipedia S&P 500/400/600 + yahoo-finance2",
    top10:       top1000.slice(0, 10).map(({ rank, ticker, name, market_cap }) => ({
      rank, ticker, name, market_cap,
    })),
  };
  fs.writeFileSync(OUTPUT_META, JSON.stringify(meta, null, 2), "utf8");
  log(`메타 저장: ${OUTPUT_META}`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
async function main() {
  log("=== 미국 시총 상위 1000 티커 업데이트 시작 ===");

  const seedTickers = await fetchSeedTickers();
  if (seedTickers.length === 0) throw new Error("시드 티커 수집 실패");

  const records = await fetchMarketCaps(seedTickers);
  if (records.length === 0) throw new Error("시총 조회 결과 없음");

  const top1000 = buildTop1000(records);

  log("\n[상위 10개]");
  top1000.slice(0, 10).forEach(({ rank, ticker, market_cap }) => {
    log(`  ${String(rank).padStart(4)}위  ${ticker.padEnd(8)}  $${(market_cap / 1e12).toFixed(2)}T`);
  });

  saveOutputs(top1000);
  log("=== 업데이트 완료 ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
