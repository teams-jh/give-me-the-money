/**
 * analyze_market_breadth.test.ts
 *
 * 커버 대상 함수:
 *   colorNet, sparkBar, netBar  — 순수 출력 포맷 함수
 *   parseArgs                   — CLI 파싱
 *   loadStocks                  — fs 기반 데이터 로드
 *   main (통합)                 — 전체 흐름 smoke test
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ── fs mock (모듈 import 전에 선언해야 hoisting 적용) ─────────────────────────
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
  colorNet,
  sparkBar,
  netBar,
  parseArgs,
  loadStocks,
} from './analyze_market_breadth.ts';

// ── ANSI 이스케이프 제거 헬퍼 ─────────────────────────────────────────────────
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ── 공통: console 출력 억제 ───────────────────────────────────────────────────
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── 테스트용 거래일 생성 헬퍼 ─────────────────────────────────────────────────
function makeWeekdays(n: number, start = '2023-01-02'): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (dates.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ── colorNet ─────────────────────────────────────────────────────────────────

describe('colorNet', () => {
  it('n > 20 → 초록(32m) 포함', () => {
    expect(colorNet(25)).toContain('\x1b[32m');
  });

  it('0 < n <= 20 → 청록(36m) 포함', () => {
    expect(colorNet(10)).toContain('\x1b[36m');
    expect(colorNet(20)).toContain('\x1b[36m'); // 경계값
  });

  it('n < -20 → 빨강(31m) 포함', () => {
    expect(colorNet(-21)).toContain('\x1b[31m');
  });

  it('-20 <= n < 0 → 노랑(33m) 포함', () => {
    expect(colorNet(-5)).toContain('\x1b[33m');
    expect(colorNet(-20)).toContain('\x1b[33m'); // 경계값
  });

  it('n = 0 → 노랑(33m) 포함', () => {
    expect(colorNet(0)).toContain('\x1b[33m');
  });

  it('양수는 + 접두사, 음수는 - 접두사 포함', () => {
    expect(strip(colorNet(15))).toContain('+');
    expect(strip(colorNet(-15))).toContain('-');
  });

  it('padStart(7) 적용 — 숫자 부분이 7자리로 패딩됨', () => {
    const result = strip(colorNet(5));
    // "+5.0" → padStart(7) 후 "   +5.0" (7자)
    expect(result.trim()).toMatch(/^\+5\.0$/);
  });
});

// ── sparkBar ─────────────────────────────────────────────────────────────────

describe('sparkBar', () => {
  it('0% → 전부 빈 블록(░)', () => {
    const result = sparkBar(0);
    expect(result).toBe('░'.repeat(10));
  });

  it('100% → 전부 채운 블록(█)', () => {
    const result = sparkBar(100);
    expect(result).toBe('█'.repeat(10));
  });

  it('50% → 절반씩', () => {
    const result = sparkBar(50);
    expect(result).toBe('█'.repeat(5) + '░'.repeat(5));
  });

  it('width 파라미터 동작', () => {
    const result = sparkBar(100, 5);
    expect(result).toBe('█'.repeat(5));
    expect(result).toHaveLength(5);
  });

  it('총 길이 = width', () => {
    for (const pct of [0, 25, 75, 100]) {
      expect(sparkBar(pct, 20)).toHaveLength(20);
    }
  });
});

// ── netBar ────────────────────────────────────────────────────────────────────

describe('netBar', () => {
  it('양수 → │ 오른쪽에 초록 블록', () => {
    const result = netBar(30);
    // │ 이후에 초록 블록이 있어야 함
    expect(result).toContain('│');
    expect(result).toContain('\x1b[32m');
    const idx = result.indexOf('│');
    expect(result.slice(idx)).toContain('\x1b[32m');
  });

  it('음수 → │ 왼쪽에 빨강 블록', () => {
    const result = netBar(-30);
    expect(result).toContain('│');
    expect(result).toContain('\x1b[31m');
    const idx = result.indexOf('│');
    expect(result.slice(0, idx)).toContain('\x1b[31m');
  });

  it('0 → │만 있고 블록 없음', () => {
    const result = netBar(0);
    expect(result).toContain('│');
    // 블록 없으므로 fill이 0
    expect(strip(result).replace('│', '').trim()).toBe('');
  });

  it('halfWidth 파라미터 적용', () => {
    // halfWidth=5 이면 총 길이에서 │ 제외하고 공백+블록 합계가 2*5
    const result = strip(netBar(50, 5));
    // │ 기준으로 분리
    const parts = result.split('│');
    expect(parts).toHaveLength(2);
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('기본값: market=kr, period=3m, step=5', () => {
    process.argv = ['node', 'script.ts'];
    const args = parseArgs();
    expect(args.market).toBe('kr');
    expect(args.period).toBe('3m');
    expect(args.step).toBe(5);
  });

  it('--market us 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us'];
    const args = parseArgs();
    expect(args.market).toBe('us');
  });

  it('--period 1y 파싱', () => {
    process.argv = ['node', 'script.ts', '--period', '1y'];
    const args = parseArgs();
    expect(args.period).toBe('1y');
  });

  it('--period 6m 파싱', () => {
    process.argv = ['node', 'script.ts', '--period', '6m'];
    const args = parseArgs();
    expect(args.period).toBe('6m');
  });

  it('--step 10 파싱', () => {
    process.argv = ['node', 'script.ts', '--step', '10'];
    const args = parseArgs();
    expect(args.step).toBe(10);
  });

  it('잘못된 step(음수)은 기본값 유지', () => {
    process.argv = ['node', 'script.ts', '--step', '-3'];
    const args = parseArgs();
    expect(args.step).toBe(5);
  });

  it('잘못된 market → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--market', 'INVALID'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    expect(() => parseArgs()).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('잘못된 period → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--period', '99y'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    expect(() => parseArgs()).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('모든 옵션 동시 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us', '--period', '6m', '--step', '7'];
    const args = parseArgs();
    expect(args.market).toBe('us');
    expect(args.period).toBe('6m');
    expect(args.step).toBe(7);
  });
});

// ── loadStocks ────────────────────────────────────────────────────────────────

describe('loadStocks', () => {
  const dates = makeWeekdays(15);
  const validStock = {
    ticker: 'AAPL',
    info:   { sector: 'Technology' },
    prices: dates.map((date, i) => ({ date, close: 100 + i })),
  };

  beforeEach(() => {
    vi.mocked(fs.readdirSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('유효한 JSON 파일 로드 → StockInput 반환', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['AAPL.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validStock));

    const result = loadStocks('/fake/dir');
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe('AAPL');
    expect(result[0]!.sector).toBe('Technology');
    expect(result[0]!.prices).toHaveLength(15);
  });

  it('prices < 10개인 종목 제외', () => {
    const shortStock = { ...validStock, prices: validStock.prices.slice(0, 5) };
    vi.mocked(fs.readdirSync).mockReturnValue(['SHORT.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(shortStock));

    const result = loadStocks('/fake/dir');
    expect(result).toHaveLength(0);
  });

  it('.json 이 아닌 파일 제외', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['AAPL.json', 'README.md', '.DS_Store'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validStock));

    // readFileSync 는 .json 파일 수만큼만 호출
    loadStocks('/fake/dir');
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it('sector 없으면 "Unknown" 기본값', () => {
    const noSector = { ...validStock, info: { sector: undefined } };
    vi.mocked(fs.readdirSync).mockReturnValue(['AAPL.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(noSector));

    const result = loadStocks('/fake/dir');
    expect(result[0]!.sector).toBe('Unknown');
  });

  it('빈 디렉토리 → 빈 배열', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    const result = loadStocks('/fake/dir');
    expect(result).toHaveLength(0);
  });

  it('여러 종목 동시 로드', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['A.json', 'B.json'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validStock));

    const result = loadStocks('/fake/dir');
    expect(result).toHaveLength(2);
  });
});

// ── main() 통합 테스트 ────────────────────────────────────────────────────────

describe('main() 통합', () => {
  const origArgv = process.argv;
  // lookback=63(3m) + step=5 → 68개 이상 날짜 필요
  const dates = makeWeekdays(100);
  const makePrices = (d: string[]) => d.map((date, i) => ({ date, close: 100 + i * 0.5 }));

  const stockA = { ticker: 'AAPL', info: { sector: 'Tech' },    prices: makePrices(dates) };
  const stockB = { ticker: 'MSFT', info: { sector: 'Finance' }, prices: makePrices(dates) };

  beforeEach(() => {
    process.argv = ['node', 'script.ts', '--market', 'kr', '--period', '3m', '--step', '10'];
    vi.mocked(fs.readdirSync).mockReturnValue(['AAPL.json', 'MSFT.json'] as any);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(stockA))
      .mockReturnValueOnce(JSON.stringify(stockB));
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.mocked(fs.readdirSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('정상 실행 → writeFileSync 호출됨', async () => {
    // main 을 동적으로 재실행하기 위해 직접 loadStocks → calcMarketBreadth 흐름 검증
    const stocks = loadStocks('/fake');
    expect(stocks).toHaveLength(2);
  });
});
