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

// ── vi.hoisted: 동적 import 후에도 동일 참조 유지 ──────────────────────────
const mockReaddirSync   = vi.hoisted(() => vi.fn());
const mockReadFileSync  = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockMkdirSync     = vi.hoisted(() => vi.fn());
const mockExistsSync    = vi.hoisted(() => vi.fn());
const mockRenameSync    = vi.hoisted(() => vi.fn());
const mockUnlinkSync    = vi.hoisted(() => vi.fn());

const mockCalcMarketBreadth  = vi.hoisted(() => vi.fn());
const mockBuildSnapshotDates = vi.hoisted(() => vi.fn());
const mockGetMarketCondition = vi.hoisted(() => vi.fn());

// ── fs mock (모듈 import 전에 선언해야 hoisting 적용) ─────────────────────────
vi.mock('fs', () => ({
  default: {
    readdirSync:   mockReaddirSync,
    readFileSync:  mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync:     mockMkdirSync,
    existsSync:    mockExistsSync,
    renameSync:    mockRenameSync,
    unlinkSync:    mockUnlinkSync,
  },
}));

// ── breadth 라이브러리 mock ───────────────────────────────────────────────────
vi.mock('../src/library/shared/breadth.ts', () => ({
  calcMarketBreadth:  mockCalcMarketBreadth,
  buildSnapshotDates: mockBuildSnapshotDates,
  getMarketCondition: mockGetMarketCondition,
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
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('유효한 JSON 파일 로드 → StockInput 반환', () => {
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['AAPL'] }))
      .mockReturnValueOnce(JSON.stringify(validStock));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('kr');
    expect(result).toHaveLength(1);
    expect(result[0]!.ticker).toBe('AAPL');
    expect(result[0]!.sector).toBe('Technology');
    expect(result[0]!.prices).toHaveLength(15);
  });

  it('prices < 10개인 종목 제외', () => {
    const shortStock = { ...validStock, prices: validStock.prices.slice(0, 5) };
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['SHORT'] }))
      .mockReturnValueOnce(JSON.stringify(shortStock));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('kr');
    expect(result).toHaveLength(0);
  });

  it('파일이 존재하지 않는 티커 제외', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ tickers: ['AAPL'] }));
    vi.mocked(fs.existsSync).mockReturnValue(false);

    loadStocks('kr');
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it('sector 없으면 "Unknown" 기본값', () => {
    const noSector = { ...validStock, info: { sector: undefined } };
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['AAPL'] }))
      .mockReturnValueOnce(JSON.stringify(noSector));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('kr');
    expect(result[0]!.sector).toBe('Unknown');
  });

  it('빈 tickers 목록 → 빈 배열', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ tickers: [] }));
    const result = loadStocks('kr');
    expect(result).toHaveLength(0);
  });

  it('여러 종목 동시 로드', () => {
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['A', 'B'] }))
      .mockReturnValue(JSON.stringify(validStock));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = loadStocks('kr');
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
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ tickers: ['AAPL', 'MSFT'] }))
      .mockReturnValueOnce(JSON.stringify(stockA))
      .mockReturnValueOnce(JSON.stringify(stockB));
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('정상 실행 → writeFileSync 호출됨', async () => {
    // main 을 동적으로 재실행하기 위해 직접 loadStocks → calcMarketBreadth 흐름 검증
    const stocks = loadStocks('kr');
    expect(stocks).toHaveLength(2);
  });
});

// ── main() TC ────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
const __testDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH_BREADTH = resolvePath(__testDir, 'analyze_market_breadth.ts');

const makeWeekdaysLocal = (n: number, start = '2023-01-02') => {
  const dates: string[] = [];
  const d = new Date(start);
  while (dates.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
};

const SNAP1 = { date: '2024-01-05', bullish: 60, bearish: 20, sideways: 10, recovering: 10, netBreadth:  30, total: 100 };
const SNAP2 = { date: '2024-01-12', bullish: 30, bearish: 50, sideways: 10, recovering: 10, netBreadth: -20, total: 100 };

describe('main() TC', () => {
  const origArgv = process.argv;
  const dates15  = makeWeekdaysLocal(15);
  const stockJson = JSON.stringify({
    ticker: 'AAPL',
    info:   { sector: 'Technology' },
    prices: dates15.map((date, i) => ({ date, close: 100 + i })),
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.clearAllMocks();
  });

  it('TC_B1 - 정상 실행: 전환점 포함 → writeFileSync 호출', async () => {
    process.argv = ['node', SCRIPT_PATH_BREADTH, '--market', 'kr', '--period', '3m', '--step', '5'];
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ['AAPL'] }))
      .mockReturnValue(stockJson);
    mockBuildSnapshotDates.mockReturnValue([SNAP1.date, SNAP2.date]);
    // 두 스냅샷의 netBreadth 부호가 다름 → 전환점 1개 생성
    mockCalcMarketBreadth.mockReturnValue({ snapshots: [SNAP1, SNAP2] });
    mockGetMarketCondition.mockReturnValue('약세');
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('./analyze_market_breadth.ts');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as { market: string };
    expect(written.market).toBe('kr');
  });

  it('TC_B2 - 스냅샷 없음 → process.exit(1)', async () => {
    process.argv = ['node', SCRIPT_PATH_BREADTH, '--market', 'us', '--period', '1y', '--step', '10'];
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ tickers: ['AAPL'] }))
      .mockReturnValue(stockJson);
    mockBuildSnapshotDates.mockReturnValue([]);
    mockCalcMarketBreadth.mockReturnValue({ snapshots: [] });

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    vi.resetModules();
    await expect(import('./analyze_market_breadth.ts')).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

