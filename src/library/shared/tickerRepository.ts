/**
 * 티커 데이터 접근 계층 (Repository) — Issue #64
 *
 * 디스크 IO(fs) 와 경로 규칙을 한 곳으로 격리한다. 분석/시뮬레이션 스크립트는
 * 이 모듈을 통해 "로드 → 도메인 함수 호출 → 저장" 조립만 담당한다.
 *
 * 경로 규칙(일원화):
 *   - 티커 목록 : src/db/metadata/all_{market}_tickers.json
 *   - 티커 데이터: src/db/{market}/tickers/{code}.json
 *   - 저장은 shared/io.ts 의 saveJsonAtomic(#62) 재사용
 */

import type { RawTicker } from './tickerTypes.ts';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { saveJsonAtomic } from './io.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 기본 DB 루트: src/library/shared → src/db */
export const DEFAULT_DB_DIR = path.resolve(__dirname, '../../db');

export interface MarketPaths {
  tickersJson: string;
  tickersDir: string;
}

const SUPPORTED_MARKETS = new Set(['kr', 'us']);

/** Yahoo Finance 티커에서 파일명용 코드 추출 (005930.KS → 005930, AAPL → AAPL) */
export function tickerToFilename(ticker: string): string {
  return ticker.split('.')[0] ?? ticker;
}

/** 마켓별 경로 규칙을 한 곳에서 해석. 알 수 없는 마켓이면 null */
export function resolveMarketPaths(
  market: string,
  dbDir: string = DEFAULT_DB_DIR
): MarketPaths | null {
  if (!SUPPORTED_MARKETS.has(market)) return null;
  return {
    tickersJson: path.join(dbDir, 'metadata', `all_${market}_tickers.json`),
    tickersDir: path.join(dbDir, `${market}/tickers`),
  };
}

/** 마켓의 티커 목록 로드. n 지정 시 상위 n개만 */
export function loadTickerList(
  market: string,
  dbDir: string = DEFAULT_DB_DIR,
  n?: number
): string[] {
  const paths = resolveMarketPaths(market, dbDir);
  if (!paths) throw new Error(`알 수 없는 마켓: ${market}`);
  const data = JSON.parse(fs.readFileSync(paths.tickersJson, 'utf-8')) as { tickers: string[] };
  return n !== undefined ? data.tickers.slice(0, n) : data.tickers;
}

/** 단일 티커 데이터 로드. 파일 없음/마켓 미지원 시 null */
export function loadTicker(
  market: string,
  ticker: string,
  dbDir: string = DEFAULT_DB_DIR
): RawTicker | null {
  const paths = resolveMarketPaths(market, dbDir);
  if (!paths) return null;
  const file = path.join(paths.tickersDir, `${tickerToFilename(ticker)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawTicker;
}

/** 티커를 찾지 못했을 때 signals_all.json 에서 prefix 가 일치하는 티커를 제안. 없으면 null */
export function findSimilarTicker(
  market: string,
  bareTicker: string,
  dbDir: string = DEFAULT_DB_DIR
): string | null {
  const signalsFile = path.join(dbDir, `${market}/signals`, 'signals_all.json');
  if (!fs.existsSync(signalsFile)) return null;
  try {
    const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf-8')) as {
      stocks: { ticker: string }[];
    };
    const prefix = bareTicker.toUpperCase();
    const found = signals.stocks.find((s) => s.ticker.toUpperCase().startsWith(prefix));
    return found ? found.ticker : null;
  } catch {
    return null;
  }
}

/** JSON 을 원자적으로 저장. 부모 디렉토리가 없으면 생성 (shared/io.ts 의 saveJsonAtomic 재사용) */
export function saveJson(outputPath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  saveJsonAtomic(outputPath, data);
}
