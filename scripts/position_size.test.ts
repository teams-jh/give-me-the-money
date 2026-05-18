/**
 * position_size.test.ts
 *
 * 커버 대상 함수:
 *   fmt         — 통화 포맷팅
 *   bar         — 퍼센트 막대 출력
 *   parseArgs   — CLI 파싱
 *   loadTicker  — 티커 데이터 로드
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ── vi.hoisted: 동적 import 후에도 동일 참조 유지 ──────────────────────────
const mockReaddirSync   = vi.hoisted(() => vi.fn());
const mockReadFileSync  = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockMkdirSync     = vi.hoisted(() => vi.fn());
const mockExistsSync    = vi.hoisted(() => vi.fn());

const mockCalcATR          = vi.hoisted(() => vi.fn());
const mockCalcPositionSize = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  default: {
    readdirSync:   mockReaddirSync,
    readFileSync:  mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync:     mockMkdirSync,
    existsSync:    mockExistsSync,
  },
}));

// ── indicators / position 라이브러리 mock ─────────────────────────────────────
vi.mock('../src/library/shared/indicators.ts', () => ({
  calcATR: mockCalcATR,
}));
vi.mock('../src/library/shared/position.ts', () => ({
  calcPositionSize: mockCalcPositionSize,
}));

import fs from 'fs';
import { fmt, bar, parseArgs, loadTicker } from './position_size.ts';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── 픽스처 ───────────────────────────────────────────────────────────────────

function makeRawTicker(overrides: Partial<any> = {}): any {
  return {
    ticker: 'AAPL',
    info:   { name: 'Apple Inc.', kr_name: '애플', sector: 'Technology' },
    market: { price: 175.5 },
    prices: Array.from({ length: 20 }, (_, i) => ({
      date:      `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:      170 + i,
      high:      175 + i,
      low:       165 + i,
      close:     170 + i,
      adj_close: 170 + i,
      volume:    5000000,
    })),
    ...overrides,
  };
}

// ── fmt ───────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('KRW → 원화 단위(원) 포함', () => {
    const result = fmt(10000000, 'KRW');
    expect(result).toContain('원');
  });

  it('KRW → 한국 로케일 콤마 포함 (10,000,000원)', () => {
    const result = fmt(10000000, 'KRW');
    expect(result).toContain(',');
    expect(result).toContain('원');
  });

  it('USD → $ 접두사 포함', () => {
    const result = fmt(1234.56, 'USD');
    expect(result).toContain('$');
  });

  it('USD → 소수점 2자리 포함', () => {
    const result = fmt(100, 'USD');
    expect(result).toMatch(/\$100\.00/);
  });

  it('USD → 콤마 구분자 포함 (1,234.56)', () => {
    const result = fmt(1234.56, 'USD');
    expect(result).toContain('1,234.56');
  });

  it('0 처리 — KRW', () => {
    const result = fmt(0, 'KRW');
    expect(result).toContain('원');
    expect(result).toContain('0');
  });

  it('0 처리 — USD', () => {
    const result = fmt(0, 'USD');
    expect(result).toContain('$0.00');
  });

  it('소수점 포함 KRW', () => {
    // KRW는 toLocaleString으로 소수점 반올림될 수 있음
    const result = fmt(100.7, 'KRW');
    expect(result).toContain('원');
  });
});

// ── bar ───────────────────────────────────────────────────────────────────────

describe('bar', () => {
  it('0% → 전부 빈 블록(░)', () => {
    expect(bar(0)).toBe('░'.repeat(30));
  });

  it('100% → 전부 채운 블록(█)', () => {
    expect(bar(100)).toBe('█'.repeat(30));
  });

  it('50% → 절반씩', () => {
    const result = bar(50);
    expect(result).toBe('█'.repeat(15) + '░'.repeat(15));
  });

  it('총 길이 = max(30)', () => {
    expect(bar(0)).toHaveLength(30);
    expect(bar(50)).toHaveLength(30);
    expect(bar(100)).toHaveLength(30);
  });

  it('max 파라미터 커스텀', () => {
    expect(bar(100, 10)).toBe('█'.repeat(10));
    expect(bar(0, 5)).toBe('░'.repeat(5));
  });

  it('100% 초과는 100%로 클램프', () => {
    const result = bar(150);
    // pct > 100이어도 전부 채워야 함
    expect(result).toBe('█'.repeat(30));
  });

  it('25% 처리', () => {
    const result = bar(25); // round(0.25 * 30) = round(7.5) = 8
    expect(result.split('█').length - 1).toBe(8);
    expect(result.split('░').length - 1).toBe(22);
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  const validArgs = ['node', 'script.ts', '--market', 'us', '--ticker', 'AAPL', '--capital', '10000000'];

  it('유효한 필수 옵션 파싱', () => {
    process.argv = validArgs;
    const args = parseArgs();
    expect(args.market).toBe('us');
    expect(args.ticker).toBe('AAPL');
    expect(args.capital).toBe(10000000);
  });

  it('기본값: risk=1, multiplier=1.5, targets=[1,2,3]', () => {
    process.argv = validArgs;
    const args = parseArgs();
    expect(args.risk).toBe(1);
    expect(args.multiplier).toBe(1.5);
    expect(args.targets).toEqual([1, 2, 3]);
  });

  it('--risk 2 파싱', () => {
    process.argv = [...validArgs, '--risk', '2'];
    expect(parseArgs().risk).toBe(2);
  });

  it('--multiplier 2.0 파싱', () => {
    process.argv = [...validArgs, '--multiplier', '2.0'];
    expect(parseArgs().multiplier).toBe(2.0);
  });

  it('--targets 1,2,3,5 파싱', () => {
    process.argv = [...validArgs, '--targets', '1,2,3,5'];
    expect(parseArgs().targets).toEqual([1, 2, 3, 5]);
  });

  it('--targets에서 0 이하 필터', () => {
    process.argv = [...validArgs, '--targets', '0,1,2,-1,3'];
    expect(parseArgs().targets).toEqual([1, 2, 3]);
  });

  it('kr 마켓 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'kr', '--ticker', '005930', '--capital', '50000000'];
    const args = parseArgs();
    expect(args.market).toBe('kr');
    expect(args.ticker).toBe('005930');
  });

  it('ticker → 대문자 변환', () => {
    process.argv = [...validArgs.map(v => v === 'AAPL' ? 'aapl' : v)];
    const args = parseArgs();
    expect(args.ticker).toBe('AAPL');
  });

  it('필수 옵션 누락(market) → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--ticker', 'AAPL', '--capital', '1000'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('필수 옵션 누락(ticker) → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--market', 'us', '--capital', '1000'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    exitSpy.mockRestore();
  });

  it('필수 옵션 누락(capital) → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--market', 'us', '--ticker', 'AAPL'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    exitSpy.mockRestore();
  });

  it('알 수 없는 market → process.exit(1)', () => {
    process.argv = ['node', 'script.ts', '--market', 'jp', '--ticker', 'TYO', '--capital', '1000'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => parseArgs()).toThrow('exit');
    exitSpy.mockRestore();
  });
});

// ── loadTicker ────────────────────────────────────────────────────────────────

describe('loadTicker', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('파일 존재 → RawTicker 반환', () => {
    const raw = makeRawTicker();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));

    const result = loadTicker('us', 'AAPL');
    expect(result.ticker).toBe('AAPL');
    expect(result.market.price).toBe(175.5);
  });

  it('파일 없으면 process.exit(1)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => loadTicker('us', 'UNKNOWN')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('KR 티커 .KS 접미사 제거 후 탐색', () => {
    const raw = makeRawTicker({ ticker: '005930' });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));

    loadTicker('kr', '005930.KS');
    // existsSync가 005930.json으로 탐색했는지 확인
    const calledPath = vi.mocked(fs.existsSync).mock.calls[0]![0] as string;
    expect(calledPath).toContain('005930.json');
    expect(calledPath).not.toContain('.KS');
  });

  it('소문자 ticker → 대문자로 변환 후 탐색', () => {
    const raw = makeRawTicker();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));

    loadTicker('us', 'aapl');
    const calledPath = vi.mocked(fs.existsSync).mock.calls[0]![0] as string;
    expect(calledPath).toContain('AAPL.json');
  });

  it('파일 없을 때 signals_all.json 힌트 탐색 (존재 시)', () => {
    // 첫 existsSync(ticker 파일) → false, 두 번째(signals_all) → true
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ stocks: [{ ticker: 'AAPL' }] }));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    expect(() => loadTicker('us', 'AAPL_MISSING')).toThrow('exit');
    exitSpy.mockRestore();
  });
});

// ── bar() ─────────────────────────────────────────────────────────────────────

describe('bar()', () => {
  it('0% → 전부 빈 블록(░)', () => {
    expect(bar(0)).toBe('░'.repeat(30));
  });

  it('100% → 전부 채운 블록(█)', () => {
    expect(bar(100)).toBe('█'.repeat(30));
  });

  it('50% → 절반씩', () => {
    const result = bar(50);
    expect(result).toBe('█'.repeat(15) + '░'.repeat(15));
  });

  it('max 파라미터 동작', () => {
    expect(bar(100, 10)).toBe('█'.repeat(10));
    expect(bar(0, 5)).toBe('░'.repeat(5));
  });

  it('100 초과 pct → 100으로 클리핑', () => {
    expect(bar(150, 10)).toBe('█'.repeat(10));
  });
});

// ── main() TC ────────────────────────────────────────────────────────────────

const SCRIPT_PATH_POS = '/home/claude/give-me-the-money/scripts/position_size.ts';

const POSITION_RESULT = {
  totalCapital:    10_000_000,
  riskPct:         1,
  riskAmount:      100_000,
  currentPrice:    175.5,
  atrMultiplier:   2,
  stopLoss:        168.5,
  stopLossPct:     3.98,
  lossPerShare:    7.0,
  shares:          14,
  totalInvestment: 2_457,
  capitalUsagePct: 24.57,
  actualRisk:      98,
  targets: [
    { ratio: 1, price: 182.5, returnPct: 4.0,  profit: 98 },
    { ratio: 2, price: 189.5, returnPct: 8.0,  profit: 196 },
    { ratio: 3, price: 196.5, returnPct: 12.0, profit: 294 },
  ],
  warnings: [],
};

function makePositionTicker(): object {
  return {
    ticker: 'AAPL',
    info:   { name: 'Apple Inc.', kr_name: '애플', sector: 'Technology' },
    market: { price: 175.5 },
    prices: Array.from({ length: 20 }, (_, i) => ({
      date:      `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:      170 + i, high: 175 + i, low: 165 + i,
      close:     170 + i, adj_close: 170 + i, volume: 5_000_000,
    })),
  };
}

describe('main() TC', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
    vi.clearAllMocks();
  });

  it('TC_P1 - 정상 실행: ATR 유효 → 결과 출력(console.log)', async () => {
    process.argv = [
      'node', SCRIPT_PATH_POS,
      '--market', 'us', '--ticker', 'AAPL',
      '--capital', '1000000', '--risk', '1',
    ];
    mockReadFileSync.mockReturnValue(JSON.stringify(makePositionTicker()));
    mockExistsSync.mockReturnValue(true);
    mockCalcATR.mockReturnValue([3.5]);                    // 유효 ATR
    mockCalcPositionSize.mockReturnValue(POSITION_RESULT); // 정상 결과

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    vi.resetModules();
    await import('./position_size.ts');
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('TC_P2 - ATR null → process.exit(1)', async () => {
    process.argv = [
      'node', SCRIPT_PATH_POS,
      '--market', 'us', '--ticker', 'AAPL',
      '--capital', '1000000', '--risk', '1',
    ];
    mockReadFileSync.mockReturnValue(JSON.stringify(makePositionTicker()));
    mockExistsSync.mockReturnValue(true);
    mockCalcATR.mockReturnValue([null]); // ATR = null → exit(1)

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    vi.resetModules();
    await expect(import('./position_size.ts')).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('TC_P3 - kr 마켓 + 경고 메시지 포함 → warnings 출력 경로 커버', async () => {
    process.argv = [
      'node', SCRIPT_PATH_POS,
      '--market', 'kr', '--ticker', '005930',
      '--capital', '1000000', '--risk', '5',
    ];
    mockReadFileSync.mockReturnValue(JSON.stringify({
      ...makePositionTicker(),
      ticker: '005930',
      market: { price: 70_000 },
    }));
    mockExistsSync.mockReturnValue(true);
    mockCalcATR.mockReturnValue([5_000]);
    mockCalcPositionSize.mockReturnValue({
      ...POSITION_RESULT,
      warnings: ['자본 대비 투자 비중이 높습니다.'],
    });

    vi.resetModules();
    await import('./position_size.ts');

    expect(mockCalcPositionSize).toHaveBeenCalledOnce();
  });
});

