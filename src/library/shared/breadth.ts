/**
 * breadth.ts
 *
 * 시장 전체 bullish 비율 트래킹 (Market Breadth).
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 핵심 아이디어:
 *   과거 3년치 OHLCV를 보유하고 있으므로,
 *   매 N거래일마다 "그 시점의 과거 lookback봉" 으로 classifyTrend를 재계산하면
 *   시장 전체 bullish 비율의 시계열을 완성할 수 있다.
 *
 *   netBreadth = bullish% - bearish%
 *   → 양수 클수록 강세장, 음수 클수록 약세장
 */

import { classifyTrend } from "./classifyTrend.ts";
import type { StockInput } from "./sector.ts";

// ── 출력 타입 ─────────────────────────────────────────────────────────────────

/** 한 시점의 시장 폭 스냅샷 */
export interface MarketSnapshot {
  date:       string;   // "YYYY-MM-DD"
  bullish:    number;   // bullish 비율 % (소수점 1자리)
  bearish:    number;   // bearish 비율 %
  sideways:   number;   // sideways 비율 %
  recovering: number;   // recovering 비율 %
  netBreadth: number;   // bullish - bearish (순 강세 지표)
  total:      number;   // 집계된 종목 수
}

/** netBreadth 기준 시장 상태 레이블 */
export type MarketCondition =
  | "극단적 강세"   // netBreadth > 40
  | "강세"          // > 20
  | "완만한 강세"   // > 10
  | "중립"          // -10 ~ 10
  | "완만한 약세"   // < -10
  | "약세"          // < -20
  | "극단적 약세";  // < -40

/** 시장 상태 레이블 판정 */
export function getMarketCondition(netBreadth: number): MarketCondition {
  if (netBreadth >  40) return "극단적 강세";
  if (netBreadth >  20) return "강세";
  if (netBreadth >  10) return "완만한 강세";
  if (netBreadth < -40) return "극단적 약세";
  if (netBreadth < -20) return "약세";
  if (netBreadth < -10) return "완만한 약세";
  return "중립";
}

/** calcMarketBreadth 결과 */
export interface MarketBreadthResult {
  /** 분석 기간 레이블 ("3m" | "1y") */
  period:    string;
  /** 스냅샷 1개당 lookback 거래일 수 */
  lookback:  number;
  /** 시간순 스냅샷 배열 */
  snapshots: MarketSnapshot[];
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────

/**
 * 시장 전체 bullish 비율 시계열 계산.
 *
 * @param stocks         - 전체 종목 배열 (StockInput)
 * @param snapshotDates  - 스냅샷 날짜 목록 (시간순, "YYYY-MM-DD")
 * @param lookback       - 각 스냅샷 시점에서 과거로 몇 거래일을 볼 것인가
 * @param minPts         - classifyTrend 최소 데이터 포인트 (기본 5)
 */
export function calcMarketBreadth(
  stocks:        StockInput[],
  snapshotDates: string[],
  lookback:      number,
  minPts:        number = 5,
): MarketBreadthResult {

  // 종목별로 가격 배열을 날짜 → 인덱스 맵으로 미리 구성 (빠른 이진 탐색용)
  type PriceEntry = { date: string; close: number };
  const stockPrices: PriceEntry[][] = stocks.map(s => s.prices);

  const snapshots: MarketSnapshot[] = [];

  for (const snapDate of snapshotDates) {
    const counts = { bullish: 0, bearish: 0, sideways: 0, recovering: 0 };
    let total = 0;

    for (const prices of stockPrices) {
      // snapDate 이하의 가격만 사용 (미래 데이터 유입 방지)
      // 이진 탐색으로 snapDate 위치 찾기
      let lo = 0, hi = prices.length - 1, cutIdx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (prices[mid]!.date <= snapDate) { cutIdx = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (cutIdx < 0) continue;   // 이 종목은 snapDate 이전 데이터 없음

      // 마지막 lookback 봉 추출
      const start  = Math.max(0, cutIdx - lookback + 1);
      const slice  = prices.slice(start, cutIdx + 1);
      if (slice.length < minPts) continue;

      const result = classifyTrend(
        { labels: slice.map(p => p.date), values: slice.map(p => p.close) },
        minPts,
      );
      if (!result) continue;

      counts[result.trend]++;
      total++;
    }

    if (total === 0) continue;

    const bullishPct    = round1(counts.bullish    / total * 100);
    const bearishPct    = round1(counts.bearish    / total * 100);
    const sidewaysPct   = round1(counts.sideways   / total * 100);
    const recoveringPct = round1(counts.recovering / total * 100);
    const netBreadth    = round1(bullishPct - bearishPct);

    snapshots.push({
      date:       snapDate,
      bullish:    bullishPct,
      bearish:    bearishPct,
      sideways:   sidewaysPct,
      recovering: recoveringPct,
      netBreadth,
      total,
    });
  }

  // 스냅샷 레이블에 쓸 period 문자열 결정
  const period = lookback <= 70 ? "3m" : lookback <= 140 ? "6m" : "1y";

  return { period, lookback, snapshots };
}

/**
 * 스냅샷 날짜 목록 생성.
 * 전체 거래일 배열에서 step 간격으로 추출.
 *
 * @param allDates  - 전체 거래일 배열 (시간순)
 * @param step      - 몇 거래일 간격으로 스냅샷을 찍을지 (기본 5 = 주간)
 * @param skipFirst - 초반 lookback 기간 만큼 건너뛸 거래일 수
 */
export function buildSnapshotDates(
  allDates:  string[],
  step:      number = 5,
  skipFirst: number = 0,
): string[] {
  const result: string[] = [];
  const start = skipFirst > 0
    ? Math.min(skipFirst, allDates.length - 1)
    : 0;

  for (let i = start; i < allDates.length; i += step) {
    result.push(allDates[i]!);
  }
  return result;
}
