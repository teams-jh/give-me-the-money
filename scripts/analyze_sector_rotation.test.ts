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

vi.mock('fs', () => ({
  default: {
    readdirSync:   vi.fn(),
    readFileSync:  vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync:     vi.fn(),
    existsSync:    vi.fn(),
  },
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
    vi.mocked(fs.readdirSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('유효 파일 → StockInput 변환', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['TSLA.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validStock));

    const result = loadStocks('/fake/dir');
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe('TSLA');
    expect(result[0]!.sector).toBe('Consumer');
  });

  it('prices 10개 미만 종목 제외', () => {
    const tooShort = { ...validStock, prices: validStock.prices.slice(0, 8) };
    vi.mocked(fs.readdirSync).mockReturnValue(['SHORT.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tooShort));

    expect(loadStocks('/fake/dir')).toHaveLength(0);
  });

  it('.json 아닌 파일 무시', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['TSLA.json', 'note.txt'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validStock));

    loadStocks('/fake/dir');
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it('sector 없으면 "Unknown"', () => {
    const noSector = { ...validStock, info: { sector: undefined } };
    vi.mocked(fs.readdirSync).mockReturnValue(['X.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(noSector));

    const result = loadStocks('/fake/dir');
    expect(result[0]!.sector).toBe('Unknown');
  });

  it('prices 날짜·종가 필드 정확히 매핑', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['TSLA.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validStock));

    const result = loadStocks('/fake/dir');
    expect(result[0]!.prices[0]).toEqual({ date: dates[0], close: 200 });
  });

  it('빈 디렉토리 → 빈 배열', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    expect(loadStocks('/fake/dir')).toHaveLength(0);
  });
});
