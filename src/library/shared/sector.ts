/**
 * sector.ts
 *
 * 분기별 섹터 강도 랭킹 및 섹터 로테이션 분석.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 핵심 아이디어:
 *   각 종목의 분기 수익률을 섹터별로 평균내어 랭킹 정렬 →
 *   분기마다 랭킹이 어떻게 바뀌는지 보면 섹터 순환 파악 가능
 */

// ── 입력 타입 ─────────────────────────────────────────────────────────────────

/** calcSectorRotation 에 넘기는 종목 데이터 */
export interface StockInput {
  ticker: string;
  sector: string;
  /** 일봉 가격 배열 (시간순) */
  prices: { date: string; close: number }[];
}

// ── 출력 타입 ─────────────────────────────────────────────────────────────────

/** 특정 분기 × 섹터의 통계 */
export interface SectorQuarterStats {
  sector:        string;
  avgReturn:     number;   // 섹터 내 종목 수익률 단순평균 (%)
  medianReturn:  number;   // 중앙값 (%)
  stockCount:    number;   // 데이터 있는 종목 수
  positiveRatio: number;   // 상승 종목 비율 (0~1)
}

/** 한 분기의 섹터 랭킹 행 */
export interface RankingRow extends SectorQuarterStats {
  rank:       number;
  rankChange: number | null;   // 이전 분기 대비 순위 변동 (양수 = 상승)
}

/** 분기별 전체 랭킹 */
export interface QuarterRanking {
  quarter:  string;         // e.g. "2024Q2"
  complete: boolean;        // 완전한 분기(첫 거래일이 분기 시작월)인지 여부
  rows:     RankingRow[];   // 1위부터 정렬
}

/** 섹터별 시계열 (차트용) */
export interface SectorSeries {
  returns:     (number | null)[];   // 분기별 수익률, 데이터 없으면 null
  ranks:       (number | null)[];   // 분기별 순위
  stockCounts: (number | null)[];   // 분기별 집계 종목 수
}

/** calcSectorRotation 최종 결과 */
export interface SectorRotationResult {
  quarters:     string[];                         // 시간순 분기 목록
  sectors:      string[];                         // 발견된 섹터 목록 (전체 기간 avgReturn 기준 정렬)
  rankings:     QuarterRanking[];                 // 분기별 랭킹
  sectorSeries: Record<string, SectorSeries>;     // 섹터 → 시계열 데이터
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "YYYYQn" */
export function getQuarterKey(dateStr: string): string {
  const year  = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const q     = Math.ceil(month / 3);
  return `${year}Q${q}`;
}

/** 분기 시작월 (1→1, 2→4, 3→7, 4→10) */
function quarterStartMonth(q: number): number {
  return (q - 1) * 3 + 1;
}

/** 해당 분기가 완전한지 판단 (첫 거래일이 분기 시작월이어야 함) */
function isCompleteQuarter(firstDate: string, quarter: string): boolean {
  const month  = parseInt(firstDate.slice(5, 7), 10);
  const qNum   = parseInt(quarter.slice(-1), 10);
  return month === quarterStartMonth(qNum);
}

/** 배열 중앙값 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── 종목별 분기 수익률 계산 ────────────────────────────────────────────────────

interface StockQuarterReturn {
  quarter:     string;
  returnPct:   number;
  priceStart:  number;
  priceEnd:    number;
  complete:    boolean;
}

function calcStockQuarterReturns(stock: StockInput): StockQuarterReturn[] {
  // 분기별로 가격을 그룹핑
  const qMap = new Map<string, { date: string; close: number }[]>();

  for (const p of stock.prices) {
    const q = getQuarterKey(p.date);
    if (!qMap.has(q)) qMap.set(q, []);
    qMap.get(q)!.push(p);
  }

  const results: StockQuarterReturn[] = [];

  for (const [quarter, prices] of qMap.entries()) {
    if (prices.length < 2) continue;   // 봉이 2개 미만이면 스킵

    const firstPrice = prices[0]!.close;
    const lastPrice  = prices[prices.length - 1]!.close;
    if (firstPrice === 0) continue;

    const returnPct = round2((lastPrice / firstPrice - 1) * 100);
    const complete  = isCompleteQuarter(prices[0]!.date, quarter);

    results.push({ quarter, returnPct, priceStart: firstPrice, priceEnd: lastPrice, complete });
  }

  return results;
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────

/**
 * 분기별 섹터 강도 랭킹 및 로테이션 분석.
 *
 * @param stocks      - 전체 종목 배열
 * @param minStocks   - 섹터당 최소 종목 수 (미달 섹터는 랭킹에서 제외, 기본 3)
 * @param excludePartialFirst - 데이터 시작 시점의 부분 분기 제외 여부 (기본 true)
 */
export function calcSectorRotation(
  stocks:               StockInput[],
  minStocks:            number = 3,
  excludePartialFirst:  boolean = true,
): SectorRotationResult {

  // ── 1. 종목별 분기 수익률 수집 ───────────────────────────────────────────
  // quarter → sector → returns[]
  const qSectorReturns = new Map<string, Map<string, number[]>>();
  const qCompleteMap   = new Map<string, boolean>();   // quarter → isComplete

  for (const stock of stocks) {
    if (!stock.sector || stock.sector === "Unknown") continue;

    const quarterReturns = calcStockQuarterReturns(stock);

    for (const qr of quarterReturns) {
      if (!qSectorReturns.has(qr.quarter)) {
        qSectorReturns.set(qr.quarter, new Map());
      }
      const sectorMap = qSectorReturns.get(qr.quarter)!;
      if (!sectorMap.has(stock.sector)) sectorMap.set(stock.sector, []);
      sectorMap.get(stock.sector)!.push(qr.returnPct);

      // 완전 분기 여부 (any stock 기준으로 결정 — 모두 동일해야 함)
      if (!qCompleteMap.has(qr.quarter)) {
        qCompleteMap.set(qr.quarter, qr.complete);
      }
    }
  }

  // ── 2. 분기 목록 정렬 ────────────────────────────────────────────────────
  let quarters = Array.from(qSectorReturns.keys()).sort();

  // 첫 번째 부분 분기 제외 옵션
  if (excludePartialFirst && quarters.length > 0) {
    const first = quarters[0]!;
    if (qCompleteMap.get(first) === false) {
      quarters = quarters.slice(1);
    }
  }

  // ── 3. 분기별 섹터 통계 계산 ─────────────────────────────────────────────
  const rankingsMap = new Map<string, SectorQuarterStats[]>();

  for (const quarter of quarters) {
    const sectorMap = qSectorReturns.get(quarter);
    if (!sectorMap) continue;

    const stats: SectorQuarterStats[] = [];

    for (const [sector, returns] of sectorMap.entries()) {
      if (returns.length < minStocks) continue;   // 종목 수 미달 제외

      const avgReturn     = round2(returns.reduce((s, v) => s + v, 0) / returns.length);
      const medianRet     = round2(median(returns));
      const positiveCount = returns.filter(r => r > 0).length;

      stats.push({
        sector,
        avgReturn,
        medianReturn: medianRet,
        stockCount:   returns.length,
        positiveRatio: round2(positiveCount / returns.length),
      });
    }

    // avgReturn 내림차순 정렬 → 랭킹 부여
    stats.sort((a, b) => b.avgReturn - a.avgReturn);
    rankingsMap.set(quarter, stats);
  }

  // ── 4. 랭킹 변동 계산 ────────────────────────────────────────────────────
  const rankings: QuarterRanking[] = [];
  const prevRankMap = new Map<string, number>();   // sector → prevRank

  for (const quarter of quarters) {
    const stats    = rankingsMap.get(quarter) ?? [];
    const complete = qCompleteMap.get(quarter) ?? true;

    const rows: RankingRow[] = stats.map((s, idx) => {
      const rank       = idx + 1;
      const prevRank   = prevRankMap.get(s.sector);
      const rankChange = prevRank !== undefined ? prevRank - rank : null;
      return { ...s, rank, rankChange };
    });

    // 이번 분기 랭킹을 prevRankMap에 저장
    rows.forEach(r => prevRankMap.set(r.sector, r.rank));

    rankings.push({ quarter, complete, rows });
  }

  // ── 5. 섹터 시계열 구성 (차트용) ──────────────────────────────────────────
  // 전체 기간에 등장한 섹터 목록
  const allSectors = new Set<string>();
  for (const stats of rankingsMap.values()) {
    stats.forEach(s => allSectors.add(s.sector));
  }

  // 전체 기간 avgReturn 합산으로 섹터 정렬 (강한 섹터부터)
  const sectorTotalReturn = new Map<string, number>();
  for (const sector of allSectors) {
    let total = 0;
    for (const stats of rankingsMap.values()) {
      const found = stats.find(s => s.sector === sector);
      if (found) total += found.avgReturn;
    }
    sectorTotalReturn.set(sector, total);
  }
  const sectors = Array.from(allSectors)
    .sort((a, b) => (sectorTotalReturn.get(b) ?? 0) - (sectorTotalReturn.get(a) ?? 0));

  const sectorSeries: Record<string, SectorSeries> = {};

  for (const sector of sectors) {
    const returns:     (number | null)[] = [];
    const ranks:       (number | null)[] = [];
    const stockCounts: (number | null)[] = [];

    for (const quarter of quarters) {
      const stats = rankingsMap.get(quarter) ?? [];
      const found = stats.find(s => s.sector === sector);
      const rankRow = rankings.find(r => r.quarter === quarter)?.rows.find(r => r.sector === sector);

      returns.push(found ? found.avgReturn : null);
      ranks.push(rankRow ? rankRow.rank : null);
      stockCounts.push(found ? found.stockCount : null);
    }

    sectorSeries[sector] = { returns, ranks, stockCounts };
  }

  return { quarters, sectors, rankings, sectorSeries };
}
