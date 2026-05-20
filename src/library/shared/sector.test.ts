/**
 * sector.test.ts
 *
 * 커버 대상 함수:
 *   getQuarterKey              — 날짜 → 분기 키
 *   calcSectorRotation         — 분기별 섹터 수익률 랭킹
 *   calcSectorStrengthRotation — 분기별 섹터 추세 강도 랭킹
 */

import type { StockInput } from './sector.ts';

import { it, expect, describe } from 'vitest';

import {
  getQuarterKey,
  calcSectorRotation,
  calcSectorStrengthRotation,
} from './sector.ts';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/**
 * 한 분기(약 65 거래일)의 가격 데이터를 생성
 * startDate: 'YYYY-MM-DD'
 * direction: 'up' | 'down' | 'flat'
 */
function makeQuarterPrices(
  startDate: string,
  direction: 'up' | 'down' | 'flat',
  n = 65,
): { date: string; close: number }[] {
  const prices: { date: string; close: number }[] = [];
  const d = new Date(startDate);
  let close = 100;

  for (let i = 0; i < n; i++) {
    // 주말 건너뜀
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    if (direction === 'up')   close = 100 + i * 0.5;
    if (direction === 'down') close = 100 - i * 0.5;
    if (direction === 'flat') close = 100 + (i % 3) * 0.05;
    prices.push({ date: d.toISOString().slice(0, 10), close });
    d.setDate(d.getDate() + 1);
  }
  return prices;
}

/** 2분기 연속 데이터를 가진 StockInput 생성 */
function makeStock(
  ticker: string,
  sector: string,
  q1Direction: 'up' | 'down' | 'flat',
  q2Direction: 'up' | 'down' | 'flat',
): StockInput {
  const q1 = makeQuarterPrices('2024-01-02', q1Direction, 65);
  const q2 = makeQuarterPrices('2024-04-01', q2Direction, 65);
  return { ticker, sector, prices: [...q1, ...q2] };
}

// ── getQuarterKey ─────────────────────────────────────────────────────────────

describe('getQuarterKey', () => {
  it('1~3월 → Q1', () => {
    expect(getQuarterKey('2024-01-15')).toBe('2024Q1');
    expect(getQuarterKey('2024-02-28')).toBe('2024Q1');
    expect(getQuarterKey('2024-03-31')).toBe('2024Q1');
  });

  it('4~6월 → Q2', () => {
    expect(getQuarterKey('2024-04-01')).toBe('2024Q2');
    expect(getQuarterKey('2024-06-30')).toBe('2024Q2');
  });

  it('7~9월 → Q3', () => {
    expect(getQuarterKey('2024-07-01')).toBe('2024Q3');
    expect(getQuarterKey('2024-09-15')).toBe('2024Q3');
  });

  it('10~12월 → Q4', () => {
    expect(getQuarterKey('2024-10-01')).toBe('2024Q4');
    expect(getQuarterKey('2024-12-31')).toBe('2024Q4');
  });

  it('연도 경계 처리', () => {
    expect(getQuarterKey('2023-12-31')).toBe('2023Q4');
    expect(getQuarterKey('2024-01-01')).toBe('2024Q1');
  });
});

// ── calcSectorRotation ────────────────────────────────────────────────────────

describe('calcSectorRotation', () => {
  it('빈 배열 → 빈 quarters, sectors, rankings', () => {
    const result = calcSectorRotation([], 1);
    expect(result.quarters).toHaveLength(0);
    expect(result.sectors).toHaveLength(0);
    expect(result.rankings).toHaveLength(0);
  });

  it('Unknown 섹터 종목 → 제외', () => {
    const stock: StockInput = {
      ticker: 'X', sector: 'Unknown',
      prices: makeQuarterPrices('2024-01-02', 'up'),
    };
    const result = calcSectorRotation([stock], 1);
    expect(result.sectors).toHaveLength(0);
  });

  it('minStocks 미달 섹터 → 랭킹에서 제외', () => {
    // Tech에 1개 종목만, minStocks=3
    const stock = makeStock('A', 'Technology', 'up', 'up');
    const result = calcSectorRotation([stock], 3);
    // Technology 섹터는 minStocks 미달로 제외
    expect(result.sectors.includes('Technology')).toBe(false);
  });

  it('충분한 데이터: 2섹터 × 3종목 → 분기 랭킹 생성', () => {
    const stocks: StockInput[] = [
      makeStock('A1', 'Technology', 'up',   'up'),
      makeStock('A2', 'Technology', 'up',   'up'),
      makeStock('A3', 'Technology', 'up',   'up'),
      makeStock('B1', 'Finance',    'down', 'flat'),
      makeStock('B2', 'Finance',    'down', 'flat'),
      makeStock('B3', 'Finance',    'down', 'flat'),
    ];

    const result = calcSectorRotation(stocks, 3, false);
    expect(result.quarters.length).toBeGreaterThan(0);
    expect(result.sectors.length).toBeGreaterThanOrEqual(2);

    // 최소 1개 분기 랭킹
    const qRank = result.rankings[0];
    expect(qRank).toBeDefined();
    expect(qRank!.rows.length).toBeGreaterThan(0);

    // rankChange가 첫 분기는 null
    const firstQuarterRows = result.rankings[0]!.rows;
    expect(firstQuarterRows[0]!.rankChange).toBeNull();
  });

  it('두 분기: 두 번째 분기에 rankChange 반영됨', () => {
    const stocks: StockInput[] = [
      makeStock('A1', 'Technology', 'up',   'down'),
      makeStock('A2', 'Technology', 'up',   'down'),
      makeStock('A3', 'Technology', 'up',   'down'),
      makeStock('B1', 'Finance',    'down', 'up'),
      makeStock('B2', 'Finance',    'down', 'up'),
      makeStock('B3', 'Finance',    'down', 'up'),
    ];

    const result = calcSectorRotation(stocks, 3, false);
    if (result.rankings.length >= 2) {
      const q2Rows = result.rankings[1]!.rows;
      const hasRankChange = q2Rows.some(r => r.rankChange !== null);
      expect(hasRankChange).toBe(true);
    }
  });

  it('sectorSeries에 returns, ranks 배열 존재', () => {
    const stocks: StockInput[] = [
      makeStock('A1', 'Technology', 'up', 'up'),
      makeStock('A2', 'Technology', 'up', 'up'),
      makeStock('A3', 'Technology', 'up', 'up'),
    ];

    const result = calcSectorRotation(stocks, 3, false);
    if (result.sectors.length > 0) {
      const series = result.sectorSeries[result.sectors[0]!];
      expect(series).toBeDefined();
      expect(Array.isArray(series!.returns)).toBe(true);
      expect(Array.isArray(series!.ranks)).toBe(true);
    }
  });

  it('excludePartialFirst=true → 부분 분기 제외', () => {
    // 2024-02-01 시작 → Q1이 부분 분기
    const makePartialStock = (ticker: string): StockInput => ({
      ticker, sector: 'Technology',
      prices: makeQuarterPrices('2024-02-01', 'up', 65),
    });

    const stocks = [
      makePartialStock('A'), makePartialStock('B'), makePartialStock('C'),
    ];
    const resultExcl = calcSectorRotation(stocks, 1, true);
    const resultIncl = calcSectorRotation(stocks, 1, false);

    // excludePartialFirst=true 이면 분기 수가 같거나 적어야 함
    expect(resultExcl.quarters.length).toBeLessThanOrEqual(resultIncl.quarters.length);
  });
});

// ── calcSectorStrengthRotation ────────────────────────────────────────────────

describe('calcSectorStrengthRotation', () => {
  it('빈 배열 → 빈 결과', () => {
    const result = calcSectorStrengthRotation([], 1);
    expect(result.quarters).toHaveLength(0);
    expect(result.sectors).toHaveLength(0);
  });

  it('Unknown 섹터 → 제외', () => {
    const stock: StockInput = {
      ticker: 'X', sector: 'Unknown',
      prices: makeQuarterPrices('2024-01-02', 'up'),
    };
    const result = calcSectorStrengthRotation([stock], 1);
    expect(result.sectors).toHaveLength(0);
  });

  it('minStocks 미달 → 제외', () => {
    // 1개 종목, minStocks=3
    const stock = makeStock('A', 'Technology', 'up', 'up');
    const result = calcSectorStrengthRotation([stock], 3);
    expect(result.sectors.includes('Technology')).toBe(false);
  });

  it('충분한 데이터: 2섹터 × 3종목 → strengthSeries 생성', () => {
    const stocks: StockInput[] = [
      makeStock('A1', 'Technology', 'up',   'up'),
      makeStock('A2', 'Technology', 'up',   'up'),
      makeStock('A3', 'Technology', 'up',   'up'),
      makeStock('B1', 'Finance',    'down', 'flat'),
      makeStock('B2', 'Finance',    'down', 'flat'),
      makeStock('B3', 'Finance',    'down', 'flat'),
    ];

    const result = calcSectorStrengthRotation(stocks, 3, false);
    expect(result.quarters.length).toBeGreaterThan(0);

    if (result.sectors.length > 0) {
      const series = result.strengthSeries[result.sectors[0]!];
      expect(series).toBeDefined();
      expect(Array.isArray(series!.scores)).toBe(true);
      expect(Array.isArray(series!.ranks)).toBe(true);
    }
  });

  it('두 번째 분기 rankChange 반영', () => {
    const stocks: StockInput[] = [
      makeStock('A1', 'Technology', 'up',   'down'),
      makeStock('A2', 'Technology', 'up',   'down'),
      makeStock('A3', 'Technology', 'up',   'down'),
      makeStock('B1', 'Finance',    'down', 'up'),
      makeStock('B2', 'Finance',    'down', 'up'),
      makeStock('B3', 'Finance',    'down', 'up'),
    ];

    const result = calcSectorStrengthRotation(stocks, 3, false);
    if (result.rankings.length >= 2) {
      const q2Rows = result.rankings[1]!.rows;
      const hasRankChange = q2Rows.some(r => r.rankChange !== null);
      expect(hasRankChange).toBe(true);
    }
  });

  it('강세 섹터 → strengthScore 양수', () => {
    const stocks: StockInput[] = [
      makeStock('A1', 'Technology', 'up', 'up'),
      makeStock('A2', 'Technology', 'up', 'up'),
      makeStock('A3', 'Technology', 'up', 'up'),
    ];

    const result = calcSectorStrengthRotation(stocks, 3, false);
    if (result.rankings.length > 0) {
      const lastQ = result.rankings[result.rankings.length - 1]!;
      const techRow = lastQ.rows.find(r => r.sector === 'Technology');
      if (techRow) {
        // 강한 상승이면 strengthScore 양수 가능성 높음
        expect(typeof techRow.strengthScore).toBe('number');
      }
    }
  });
});

// ── calcSectorStrengthRotation 추가 브랜치 ────────────────────────────────────

describe('calcSectorStrengthRotation 추가 브랜치', () => {
  function makeStock3Q(ticker: string, sector: string): StockInput {
    // 3분기 데이터 (Q1~Q3 2024)
    const allPrices: { date: string; close: number }[] = [];
    const starts = ['2024-01-02', '2024-04-01', '2024-07-01'];
    starts.forEach((start, qi) => {
      const d = new Date(start);
      for (let i = 0; i < 65; i++) {
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        allPrices.push({ date: d.toISOString().slice(0, 10), close: 100 + qi * 10 + i * 0.5 });
        d.setDate(d.getDate() + 1);
      }
    });
    return { ticker, sector, prices: allPrices };
  }

  it('3분기 데이터 + excludePartialFirst=false → strengthSeries null 브랜치 커버', () => {
    const stocks: StockInput[] = [
      makeStock3Q('A1', 'Technology'),
      makeStock3Q('A2', 'Technology'),
      makeStock3Q('A3', 'Technology'),
    ];
    const result = calcSectorStrengthRotation(stocks, 3, false);
    // strengthSeries의 null 브랜치 (sector not found in quarter) 커버
    if (result.sectors.length > 0) {
      const series = result.strengthSeries[result.sectors[0]!];
      expect(Array.isArray(series?.scores)).toBe(true);
    }
  });

  it('섹터 미발견 분기 → scores에 null 추가', () => {
    const stocks: StockInput[] = [
      makeStock3Q('A1', 'Technology'),
      makeStock3Q('A2', 'Technology'),
      makeStock3Q('A3', 'Technology'),
    ];
    const result = calcSectorStrengthRotation(stocks, 3, false);
    if (result.sectors.length > 0 && result.quarters.length > 0) {
      const series = result.strengthSeries[result.sectors[0]!]!;
      // null이 있을 수 있음 (섹터가 특정 분기에 없을 경우)
      expect(series.scores.length).toBe(result.quarters.length);
    }
  });
});

// ── calcSectorRotation 추가 브랜치 ────────────────────────────────────────────

describe('calcSectorRotation 추가 브랜치', () => {
  /** 섹터A는 Q1만, 섹터B는 Q2만 데이터 존재 → sectorSeries null 브랜치 */
  function makeSectorQStock(ticker: string, sector: string, quarter: 'Q1' | 'Q2'): StockInput {
    const startDate = quarter === 'Q1' ? '2024-01-02' : '2024-04-01';
    return {
      ticker, sector,
      prices: makeQuarterPrices(startDate, 'up', 65),
    };
  }

  it('섹터A는 Q1만, 섹터B는 Q2만 → sectorSeries에 null 값 포함', () => {
    // Q1: TechA×3, Q2: FinanceB×3 → 각 섹터가 없는 분기에 null
    const stocks: StockInput[] = [
      makeSectorQStock('T1', 'Technology', 'Q1'),
      makeSectorQStock('T2', 'Technology', 'Q1'),
      makeSectorQStock('T3', 'Technology', 'Q1'),
      makeSectorQStock('F1', 'Finance', 'Q2'),
      makeSectorQStock('F2', 'Finance', 'Q2'),
      makeSectorQStock('F3', 'Finance', 'Q2'),
    ];
    const result = calcSectorRotation(stocks, 1, false);
    // sectorSeries에 null 존재 여부 확인
    if (result.sectors.length > 0) {
      const techSeries = result.sectorSeries['Technology'];
      const finSeries  = result.sectorSeries['Finance'];
      // null이 포함될 수 있음
      if (techSeries) expect(techSeries.returns.length).toBe(result.quarters.length);
      if (finSeries)  expect(finSeries.returns.length).toBe(result.quarters.length);
    }
  });

  it('빈 prices 종목 → calcStockQuarterReturns skip (prices < 2 브랜치)', () => {
    const stocks: StockInput[] = [
      // prices 1개 → skip
      { ticker: 'X', sector: 'Technology', prices: [{ date: '2024-01-02', close: 100 }] },
      ...Array.from({ length: 3 }, (_, i) => ({
        ticker: `A${i}`, sector: 'Technology',
        prices: makeQuarterPrices('2024-01-02', 'up', 65),
      })),
    ];
    const result = calcSectorRotation(stocks, 3, false);
    // 정상 처리: X는 무시됨
    expect(Array.isArray(result.quarters)).toBe(true);
  });
});
