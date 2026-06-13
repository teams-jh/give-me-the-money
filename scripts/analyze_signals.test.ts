/**
 * analyze_signals.test.ts
 *
 * 커버 대상 함수:
 *   tickerToFilename   — 티커 → 파일명 변환
 *   round1             — 소수점 1자리 반올림
 *   nowStr             — 현재 시간 ISO 문자열
 *   toOHLCV            — RawTicker → OHLCV 변환
 *   toFundamentalData  — RawTicker → FundamentalData 변환
 *   resolveOutputFile  — 출력 파일 경로 결정
 *   parseArgs          — CLI 파싱
 *   loadTickers        — 티커 목록 로드
 *   loadTicker         — 개별 티커 데이터 로드
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

const mockAnalyzeSignals      = vi.hoisted(() => vi.fn());
const mockAnalyzeFundamentals = vi.hoisted(() => vi.fn());

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

// ── signals / fundamentals 라이브러리 mock ────────────────────────────────────
vi.mock('../src/library/shared/signals.ts', () => ({
  analyzeSignals: mockAnalyzeSignals,
}));
vi.mock('../src/library/shared/fundamentals.ts', () => ({
  analyzeFundamentals: mockAnalyzeFundamentals,
}));

import fs from 'fs';
import {
  round1,
  nowStr,
  resolveOutputFile,
  parseArgs,
} from './analyze_signals.ts';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── 픽스처 ───────────────────────────────────────────────────────────────────

// ── round1 ────────────────────────────────────────────────────────────────────

describe('round1', () => {
  it('소수점 1자리 반올림', () => {
    expect(round1(1.25)).toBe(1.3);
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.0)).toBe(1.0);
  });

  it('음수 처리', () => {
    // JS Math.round: -1.25 * 10 = -12.5 → Math.round(-12.5) = -12 → -1.2
    // -1.35 * 10 = -13.5 → Math.round(-13.5) = -13 → -1.3
    expect(round1(-1.35)).toBe(-1.3);
    expect(round1(-1.24)).toBe(-1.2);
  });

  it('0 처리', () => {
    expect(round1(0)).toBe(0);
  });

  it('정수 처리', () => {
    expect(round1(5)).toBe(5);
  });

  it('큰 수 처리', () => {
    expect(round1(1234.567)).toBe(1234.6);
  });
});

// ── nowStr ────────────────────────────────────────────────────────────────────

describe('nowStr', () => {
  it('YYYY-MM-DD HH:MM 형식 반환', () => {
    const result = nowStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('16자 길이', () => {
    expect(nowStr()).toHaveLength(16);
  });
});

// ── resolveOutputFile ─────────────────────────────────────────────────────────

describe('resolveOutputFile', () => {
  it('n 없으면 signals_all.json', () => {
    expect(resolveOutputFile('kr')).toContain('signals_all.json');
  });

  it('n = 100 이면 signals_100.json', () => {
    expect(resolveOutputFile('kr', 100)).toContain('signals_100.json');
  });

  it('마켓별 signals 경로 포함', () => {
    expect(resolveOutputFile('kr', 50)).toContain('kr/signals');
    expect(resolveOutputFile('us', 50)).toContain('us/signals');
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('기본값: market=kr, n=undefined, minScore=0', () => {
    process.argv = ['node', 'script.ts'];
    const args = parseArgs();
    expect(args.market).toBe('kr');
    expect(args.n).toBeUndefined();
    expect(args.minScore).toBe(0);
  });

  it('--market us 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us'];
    expect(parseArgs().market).toBe('us');
  });

  it('-n 50 파싱', () => {
    process.argv = ['node', 'script.ts', '-n', '50'];
    expect(parseArgs().n).toBe(50);
  });

  it('--min-score 1.5 파싱', () => {
    process.argv = ['node', 'script.ts', '--min-score', '1.5'];
    expect(parseArgs().minScore).toBe(1.5);
  });

  it('모든 옵션 동시 파싱', () => {
    process.argv = ['node', 'script.ts', '--market', 'us', '-n', '100', '--min-score', '2'];
    const args = parseArgs();
    expect(args.market).toBe('us');
    expect(args.n).toBe(100);
    expect(args.minScore).toBe(2);
  });
});

// ── main() TC ────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
const __testDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH_SIGNALS = resolvePath(__testDir, 'analyze_signals.ts');

/** 30개 이상 가격 데이터를 포함한 유효 티커 픽스처 */
function makeSignalTicker(priceCount = 35): object {
  return {
    ticker: 'AAPL',
    info:   { name: 'Apple', kr_name: '애플', sector: 'Technology' },
    market: { price: 175, fifty_two_week_high: 200, fifty_two_week_low: 140, beta: 1.2 },
    liquidity: { avg_daily_volume_3m: 50_000_000, avg_daily_volume_10d: 45_000_000 },
    valuation: { trailing_pe: 28.5, price_to_book: 45.3, peg_ratio: 2.1 },
    profitability: {
      roe: 0.15, roa: 0.08, operating_margins: 0.3, profit_margins: 0.25,
      revenue_growth: 0.08,
      quarterly_earnings: [
        { quarter: '2024Q3', net_income: 21_000_000_000 },
        { quarter: '2024Q2', net_income: 19_000_000_000 },
      ],
    },
    ownership: {
      held_pct_insiders:     0.02,
      held_pct_institutions: 0.60,
      short_ratio:           1.2,
    },
    prices: Array.from({ length: priceCount }, (_, i) => ({
      date:      `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:      170 + i, high: 175 + i, low: 165 + i,
      close:     170 + i, adj_close: 170 + i, volume: 5_000_000,
    })),
  };
}

const SIGNAL_SUMMARY = {
  ticker: 'AAPL', score: 2, rsi: 65, macd: 0.5, bandWidth: 5,
  volRatio: 1.5, atr: 3.0, stopLoss: 165, mdd: -10,
  high52w: 200, low52w: 140, stochK: 70, roc20: 5,
  mfi: 60, adx: 25, supertrendDir: 'bullish' as const,
  alerts: [{ type: 'rsi_overbought', direction: 'bullish' as const, strength: 'normal' as const, label: 'RSI 강세', value: 65, scoreAffecting: true }],
};
const FUND_SUMMARY = {
  score: 1, pe: 28.5, pb: 45, roe: 0.15, roa: 0.08,
  dividendYield: 0.005, insiderPct: 0.02, shortRatio: 1.2,
  earningsTrend: 'improving' as const,
  alerts: [],
};

// 티커 목록 JSON (all_us_tickers.json)
const TICKERS_JSON = JSON.stringify({ tickers: ['AAPL'] });

describe('main() TC', () => {
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
    vi.clearAllMocks();
  });

  it('TC_SG1 - 정상 실행: 매수 신호 1개 → writeFileSync 호출', async () => {
    process.argv = ['node', SCRIPT_PATH_SIGNALS, '--market', 'us'];
    // loadTickers: 티커 목록
    mockReadFileSync
      .mockReturnValueOnce(TICKERS_JSON)
      // loadTicker: AAPL 데이터 (35봉)
      .mockReturnValueOnce(JSON.stringify(makeSignalTicker(35)));
    mockExistsSync.mockReturnValue(true);  // loadTicker existsSync
    mockAnalyzeSignals.mockReturnValue(SIGNAL_SUMMARY);
    mockAnalyzeFundamentals.mockReturnValue(FUND_SUMMARY);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('./analyze_signals.ts');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as {
      summary: { bullish_count: number };
    };
    expect(written.summary.bullish_count).toBe(1);
  });

  it('TC_SG2 - prices < 30 → SKIP (analyzeSignals 미호출)', async () => {
    process.argv = ['node', SCRIPT_PATH_SIGNALS, '--market', 'us'];
    mockReadFileSync
      .mockReturnValueOnce(TICKERS_JSON)
      .mockReturnValueOnce(JSON.stringify(makeSignalTicker(5))); // 5봉 < 30
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('./analyze_signals.ts');

    expect(mockAnalyzeSignals).not.toHaveBeenCalled();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as {
      skipped_count: number;
    };
    expect(written.skipped_count).toBe(1);
  });

  it('TC_SG3 - 알 수 없는 마켓 → process.exit(1)', async () => {
    process.argv = ['node', SCRIPT_PATH_SIGNALS, '--market', 'INVALID'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    vi.resetModules();
    await expect(import('./analyze_signals.ts')).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('TC_SG4 - 매도 신호: score < 0 → bearish_count 증가', async () => {
    process.argv = ['node', SCRIPT_PATH_SIGNALS, '--market', 'us'];
    mockReadFileSync
      .mockReturnValueOnce(TICKERS_JSON)
      .mockReturnValueOnce(JSON.stringify(makeSignalTicker(35)));
    mockExistsSync.mockReturnValue(true);
    mockAnalyzeSignals.mockReturnValue({ ...SIGNAL_SUMMARY, score: -2, supertrendDir: 'bearish' as const });
    mockAnalyzeFundamentals.mockReturnValue({ ...FUND_SUMMARY, score: -1 });
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);

    vi.resetModules();
    await import('./analyze_signals.ts');

    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string) as {
      summary: { bearish_count: number };
    };
    expect(written.summary.bearish_count).toBe(1);
  });
});

