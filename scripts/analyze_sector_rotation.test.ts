/**
 * analyze_sector_rotation.test.ts
 *
 * 커버 대상 함수:
 *   colorReturn     — 수익률 ANSI 색상 포맷
 *   rankChangeMark  — 순위 변동 화살표
 *   parseArgs       — CLI 파싱
 *   loadStocks      — fs 기반 데이터 로드
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ── vi.hoisted: 동적 import 후에도 동일 참조 유지 ──────────────────────────
const mockReaddirSync   = vi.hoisted(() => vi.fn());
const mockReadFileSync  = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockMkdirSync     = vi.hoisted(() => vi.fn());
const mockExistsSync    = vi.hoisted(() => vi.fn());

const mockCalcSectorRotation         = vi.hoisted(() => vi.fn());
const mockCalcSectorStrengthRotation = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  default: {
    readdirSync:   mockReaddirSync,
    readFileSync:  mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync:     mockMkdirSync,
    existsSync:    mockExistsSync,
  },
}));

// ── sector 라이브러리 mock ────────────────────────────────────────────────────
vi.mock('../src/library/shared/sector.ts', () => ({
  calcSectorRotation:         mockCalcSectorRotation,
  calcSectorStrengthRotation: mockCalcSectorStrengthRotation,
}));

import fs from 'fs';
import {
  colorReturn,
  rankChangeMark,
  parseArgs,
  loadStocks,
} from './analyze_sector_rotation.ts';

// ANSI 이스케이프 제거
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── colorReturn ───────────────────────────────────────────────────────────────

describe('colorReturn', () => {
  it('null → "  N/A  " 반환', () => {
    expect(colorReturn(null)).toBe('  N/A  ');
  });

  it('v > 3 → 초록(32m)', () => {
    expect(colorReturn(5)).toContain('\x1b[32m');
    expect(colorReturn(3.1)).toContain('\x1b[32m');
  });

  it('0 < v <= 3 → 청록(36m)', () => {
    expect(colorReturn(1)).toContain('\x1b[36m');
    expect(colorReturn(3)).toContain('\x1b[36m'); // 경계값
  });

  it('v < -3 → 빨강(31m)', () => {
    expect(colorReturn(-5)).toContain('\x1b[31m');
    expect(colorReturn(-3.1)).toContain('\x1b[31m');
  });

  it('-3 <= v <= 0 → 노랑(33m)', () => {
    expect(colorReturn(-1)).toContain('\x1b[33m');
    expect(colorReturn(0)).toContain('\x1b[33m');
    expect(colorReturn(-3)).toContain('\x1b[33m'); // 경계값
  });

  it('양수는 + 접두사 포함', () => {
    expect(strip(colorReturn(2))).toContain('+');
  });

  it('출력에 % 기호 포함', () => {
    expect(strip(colorReturn(2))).toContain('%');
  });

  it('수치가 올바르게 포함됨', () => {
    const result = strip(colorReturn(7.5));
    expect(result).toContain('7.5');
  });
});

// ── rankChangeMark ────────────────────────────────────────────────────────────

describe('rankChangeMark', () => {
  it('null → "  " (공백 2칸)', () => {
    expect(rankChangeMark(null)).toBe('  ');
  });

  it('양수 → 초록 ▲ 포함', () => {
    const result = rankChangeMark(3);
    expect(result).toContain('\x1b[32m');
    expect(result).toContain('▲');
    expect(result).toContain('3');
  });

  it('음수 → 빨강 ▼ 포함', () => {
    const result = rankChangeMark(-2);
    expect(result).toContain('\x1b[31m');
    expect(result).toContain('▼');
    expect(result).toContain('2'); // Math.abs(-2) = 2
  });

  it('0 → "─ " 반환', () => {
    expect(rankChangeMark(0)).toBe('─ ');
  });

  it('큰 값 처리', () => {
    const result = rankChangeMark(10);
    expect(strip(result)).toContain('10');
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('기본값: market=kr, quarters=null', () => {
    process.argv = ['node', 'script.ts'];
    const args = parseArgs();
    expect(args.market).toBe('kr');
    expect(args.quarters).toBeNull();
  });

  it('--market us 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us'];
    const args = parseArgs();
    expect(args.market).toBe('us');
  });

  it('--quarters 4 파싱', () => {
    process.argv = ['node', 'script.ts', '--quarters', '4'];
    const args = parseArgs();
    expect(args.quarters).toBe(4);
  });

  it('잘못된 quarters (음수) → null 유지', () => {
    process.argv = ['node', 'script.ts', '--quarters', '-1'];
    const args = parseArgs();
    expect(args.quarters).toBeNull();
  });

  it('잘못된 quarters (문자열) → null 유지', () => {
    process.argv = ['node', 'script.ts', '--quarters', 'abc'];
    const args = parseArgs();
    expect(args.quarters).toBeNull();
  });

  it('market + quarters 동시 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us', '--quarters', '6'];
    const args = parseArgs();
    expect(args.market).toBe('us');
    expect(args.quarters).toBe(6);
  });
});

// ── loadStocks ────────────────────────────────────────────────────────────────

describe('loadStocks', () => {
  function makeWeekdays(n: number): string[] {
    const dates: string[] = [];
    const d = new Date('2023-01-02');
    while (dates.length < n) {
      if (d.getDay() !== 0 && d.getDay() !== 6)
        dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  const dates = makeWeekdays(20);
  const validStock = {
    ticker: 'TSLA',
    info:   { sector: 'Consumer' },
    prices: dates.map((date, i) => ({ date, close: 200 + i })),
  };

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('유효 파일 → StockInput 변환', () => {
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['TSLA'] }))
      .mockReturnValueOnce(JSON.stringify(validStock));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('/fake/meta.json', '/fake/dir');
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe('TSLA');
    expect(result[0]!.sector).toBe('Consumer');
  });

  it('prices 10개 미만 종목 제외', () => {
    const tooShort = { ...validStock, prices: validStock.prices.slice(0, 8) };
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['SHORT'] }))
      .mockReturnValueOnce(JSON.stringify(tooShort));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(loadStocks('/fake/meta.json', '/fake/dir')).toHaveLength(0);
  });

  it('파일이 존재하지 않는 티커 무시', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ tickers: ['TSLA'] }));
    vi.mocked(fs.existsSync).mockReturnValue(false);

    loadStocks('/fake/meta.json', '/fake/dir');
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it('sector 없으면 "Unknown"', () => {
    const noSector = { ...validStock, info: { sector: undefined } };
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['X'] }))
      .mockReturnValueOnce(JSON.stringify(noSector));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('/fake/meta.json', '/fake/dir');
    expect(result[0]!.sector).toBe('Unknown');
  });

  it('prices 날짜·종가 필드 정확히 매핑', () => {
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['TSLA'] }))
      .mockReturnValueOnce(JSON.stringify(validStock));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('/fake/meta.json', '/fake/dir');
    expect(result[0]!.prices[0]).toEqual({ date: dates[0], close: 200 });
  });

  it('빈 tickers 목록 → 빈 배열', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ tickers: [] }));
    expect(loadStocks('/fake/meta.json', '/fake/dir')).toHaveLength(0);
  });
});

// ── main() TC ────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
const __testDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH_SECTOR = resolvePath(__testDir, 'analyze_sector_rotation.ts');

// 픽스처: 2분기 × 2섹터 (bigRiser/bigFaller, 수익률 vs 강도 비교 모두 커버)
const ROTATION_RESULT = {
  quarters: ['2024Q1', '2024Q2'],
  sectors:  ['Technology', 'Finance', 'Energy'],
  rankings: [
    {
      quarter: '2024Q1', complete: true,
      rows: [
        { rank: 1, sector: 'Technology', avgReturn:  5.0, rankChange: null, stockCount: 3, positiveRatio: 0.8 },
        { rank: 2, sector: 'Finance',    avgReturn:  2.0, rankChange: null, stockCount: 2, positiveRatio: 0.6 },
        { rank: 3, sector: 'Energy',     avgReturn: -1.0, rankChange: null, stockCount: 1, positiveRatio: 0.3 },
      ],
    },
    {
      quarter: '2024Q2', complete: false,
      rows: [
        { rank: 1, sector: 'Finance',    avgReturn:  6.0, rankChange:  3, stockCount: 2, positiveRatio: 0.9 }, // bigRiser
        { rank: 2, sector: 'Energy',     avgReturn:  1.0, rankChange:  1, stockCount: 1, positiveRatio: 0.5 },
        { rank: 3, sector: 'Technology', avgReturn: -3.0, rankChange: -3, stockCount: 3, positiveRatio: 0.2 }, // bigFaller
      ],
    },
  ],
  sectorSeries: {
    'Technology': { returns: [5.0, -3.0], ranks: [1, 3], stockCounts: [3, 3] },
    'Finance':    { returns: [2.0,  6.0], ranks: [2, 1], stockCounts: [2, 2] },
    'Energy':     { returns: [-1.0, 1.0], ranks: [3, 2], stockCounts: [1, 1] },
  },
};

const STRENGTH_RESULT = {
  quarters: ['2024Q1', '2024Q2'],
  sectors:  ['Technology', 'Finance', 'Energy'],
  rankings: [
    {
      quarter: '2024Q1', complete: true,
      rows: [
        { rank: 1, sector: 'Energy',     score: 0.9, rankChange: null, stockCount: 1 },
        { rank: 2, sector: 'Technology', score: 0.7, rankChange: null, stockCount: 3 },
        { rank: 3, sector: 'Finance',    score: 0.3, rankChange: null, stockCount: 2 },
      ],
    },
    {
      quarter: '2024Q2', complete: false,
      rows: [
        { rank: 1, sector: 'Energy',     score:  0.8, rankChange:  0, stockCount: 1 }, // 강도Top1
        { rank: 2, sector: 'Technology', score:  0.5, rankChange:  0, stockCount: 3 }, // 강도Top2
        { rank: 3, sector: 'Finance',    score: -0.2, rankChange: -2, stockCount: 2 }, // 꼴찌
      ],
    },
  ],
  strengthSeries: {
    'Technology': { scores: [0.7, 0.5], ranks: [2, 2] },
    'Finance':    { scores: [0.3, -0.2], ranks: [3, 3] },
    'Energy':     { scores: [0.9, 0.8], ranks: [1, 1] },
  },
};

describe('main() TC', () => {
  const origArgv = process.argv;
  const dates15  = Array.from({ length: 15 }, (_, i) => `2023-01-${String(i + 2).padStart(2, '0')}`);
  const stockJson = JSON.stringify({
    ticker: 'AAPL',
    info:   { sector: 'Technology' },
    prices: dates15.map((date, i) => ({ date, close: 100 + i })),
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.clearAllMocks();
  });

  it('TC_S1 - 정상 실행: bigRiser/Faller + 비교 인사이트 → writeFileSync 호출', async () => {
    process.argv = ['node', SCRIPT_PATH_SECTOR, '--market', 'kr'];
    mockReaddirSync.mockReturnValue(['AAPL.json'] as any);
    mockReadFileSync.mockReturnValue(stockJson);
    mockCalcSectorRotation.mockReturnValue(ROTATION_RESULT);
    mockCalcSectorStrengthRotation.mockReturnValue(STRENGTH_RESULT);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('./analyze_sector_rotation.ts');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { market: string };
    expect(written.market).toBe('kr');
  });

  it('TC_S2 - --quarters 필터 적용 → 최근 N분기만 출력', async () => {
    process.argv = ['node', SCRIPT_PATH_SECTOR, '--market', 'us', '--quarters', '1'];
    mockReaddirSync.mockReturnValue(['AAPL.json'] as any);
    mockReadFileSync.mockReturnValue(stockJson);
    mockCalcSectorRotation.mockReturnValue(ROTATION_RESULT);
    mockCalcSectorStrengthRotation.mockReturnValue(STRENGTH_RESULT);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('./analyze_sector_rotation.ts');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('TC_S3 - 알 수 없는 마켓 → process.exit(1)', async () => {
    process.argv = ['node', SCRIPT_PATH_SECTOR, '--market', 'INVALID'];
    mockReaddirSync.mockReturnValue([] as any);
    mockCalcSectorRotation.mockReturnValue(ROTATION_RESULT);
    mockCalcSectorStrengthRotation.mockReturnValue(STRENGTH_RESULT);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    vi.resetModules();
    await expect(import('./analyze_sector_rotation.ts')).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

