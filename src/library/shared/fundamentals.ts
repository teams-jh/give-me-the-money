/**
 * fundamentals.ts
 *
 * 재무 데이터(밸류에이션·실적·소유구조) 기반 매수·매도 이상징후 감지.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 데이터 가용률 (ticker JSON 기준):
 *   PER/PBR       : US 85~96%  /  KR 0% (null 처리 필수)
 *   분기순이익     : US 100%   /  KR 78%
 *   내부자 보유비율: US 100%   /  KR 88%
 *   공매도 비율    : US 100%   /  KR 0%
 *
 * 제공 신호:
 *   - detectValuation          : PER / PBR 절대값 기반 고/저평가
 *   - detectEarningsAcceleration: 분기 순이익 추세 (흑자전환·가속·감속)
 *   - detectOwnership          : 내부자 보유비율 + 공매도 비율
 *   - analyzeFundamentals      : 위 전체 통합 → FundamentalSummary
 */

import type { Alert, SignalDirection, SignalStrength } from "./signals.ts";

// ── 입력 타입 ─────────────────────────────────────────────────────────────────

/** ticker JSON에서 추출한 펀더멘털 데이터 */
export interface FundamentalData {
  // 밸류에이션
  pe:              number | null;   // trailing PER
  pb:              number | null;   // Price to Book
  // 수익성
  roe:             number | null;   // Return on Equity
  operatingMargin: number | null;   // 영업이익률
  revenueGrowth:   number | null;   // 매출 성장률 YoY
  quarterlyEarnings: QuarterlyEarning[];  // 최근 분기 순이익 (시간 내림차순)
  // 소유구조
  insiderPct:      number | null;   // 내부자 보유 비율 (0~1)
  institutionPct:  number | null;   // 기관 보유 비율 (0~1)
  shortRatio:      number | null;   // 공매도 비율 (일 수)
}

export interface QuarterlyEarning {
  quarter:    string;   // e.g. "2025Q4"
  net_income: number;   // 순이익 (음수 = 적자)
}

// ── 출력 타입 ─────────────────────────────────────────────────────────────────

/** 종목별 펀더멘털 신호 요약 */
export interface FundamentalSummary {
  ticker:    string;
  score:     number;          // 양수 = 매수, 음수 = 매도
  pe:        number | null;
  pb:        number | null;
  roe:       number | null;
  insiderPct: number | null;
  shortRatio: number | null;
  earningsTrend: "accelerating" | "decelerating" | "turnaround" | "deteriorating" | "stable" | "insufficient";
  alerts:    Alert[];
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

function makeAlert(
  type:      string,
  direction: SignalDirection,
  strength:  SignalStrength,
  label:     string,
  value?:    number,
): Alert {
  return { type, direction, strength, label, value, scoreAffecting: true };
}

// ── 1. PER / PBR 밸류에이션 신호 ─────────────────────────────────────────────

/**
 * PER / PBR 절대값 기반 고/저평가 감지.
 *
 * 섹터 평균 비교 없이 통용되는 절대 기준 적용:
 *
 * PER 기준:
 *   < 0   : 적자 (정보성, score 제외)
 *   0~10  : 저평가 → bullish
 *   10~20 : 정상 구간 → 신호 없음
 *   20~30 : 주의 구간 → weak bearish
 *   > 30  : 고평가  → normal bearish
 *   > 50  : 과도 고평가 → strong bearish
 *
 * PBR 기준:
 *   < 1   : 청산가치 이하 → bullish
 *   1~3   : 정상 → 신호 없음
 *   > 5   : 고평가 → normal bearish
 *
 * @param data - FundamentalData
 */
export function detectValuation(data: FundamentalData): Alert[] {
  const alerts: Alert[] = [];

  // ── PER ──────────────────────────────────────────────────────────────────
  if (data.pe !== null) {
    if (data.pe < 0) {
      // 적자 기업: scoreAffecting=false (정보성만)
      alerts.push({
        type: "pe_negative", direction: "bearish", strength: "normal",
        label: `PER 음수 (적자기업, PE ${data.pe.toFixed(1)})`,
        value: data.pe, scoreAffecting: false,
      });
    } else if (data.pe > 0 && data.pe <= 10) {
      alerts.push(makeAlert(
        "pe_undervalued", "bullish", "normal",
        `PER 저평가 (PE ${data.pe.toFixed(1)})`, data.pe,
      ));
    } else if (data.pe > 30 && data.pe <= 50) {
      alerts.push(makeAlert(
        "pe_overvalued", "bearish", "normal",
        `PER 고평가 (PE ${data.pe.toFixed(1)})`, data.pe,
      ));
    } else if (data.pe > 50) {
      alerts.push(makeAlert(
        "pe_extreme", "bearish", "strong",
        `PER 과도 고평가 (PE ${data.pe.toFixed(1)})`, data.pe,
      ));
    } else if (data.pe > 20 && data.pe <= 30) {
      alerts.push({
        ...makeAlert("pe_caution", "bearish", "weak",
          `PER 주의 구간 (PE ${data.pe.toFixed(1)})`, data.pe),
        scoreAffecting: false,   // 주의 구간은 정보성만
      });
    }
  }

  // ── PBR ──────────────────────────────────────────────────────────────────
  if (data.pb !== null) {
    if (data.pb < 1) {
      alerts.push(makeAlert(
        "pb_undervalued", "bullish", "normal",
        `PBR 청산가치 이하 (PB ${data.pb.toFixed(2)})`, data.pb,
      ));
    } else if (data.pb > 5) {
      alerts.push(makeAlert(
        "pb_overvalued", "bearish", "normal",
        `PBR 고평가 (PB ${data.pb.toFixed(2)})`, data.pb,
      ));
    }
  }

  return alerts;
}

// ── 2. 분기 순이익 가속도 감지 ────────────────────────────────────────────────

type EarningsTrend = FundamentalSummary["earningsTrend"];

interface EarningsResult {
  trend:  EarningsTrend;
  alerts: Alert[];
}

/**
 * 분기 순이익 추세 감지.
 *
 * quarterlyEarnings 는 시간 내림차순 (최신 → 과거) 배열.
 * 최소 2개 분기 필요. 4개 이상이면 더 정확한 판단 가능.
 *
 * 감지 패턴 (우선순위 순):
 *   1. 흑자 전환   : 직전 분기 적자 → 최신 분기 흑자   → strong bullish
 *   2. 적자 전환   : 직전 분기 흑자 → 최신 분기 적자   → strong bearish
 *   3. 이익 가속   : 최근 2분기 성장률 > 이전 2분기 성장률 (4개 필요) → bullish
 *   4. 이익 감속   : 반대 방향                                        → bearish
 *   5. 연속 흑자   : 4분기 전부 흑자 + 성장                           → weak bullish
 *   6. 연속 적자   : 최근 3분기 이상 적자                             → normal bearish
 */
export function detectEarningsAcceleration(data: FundamentalData): EarningsResult {
  const alerts: Alert[] = [];
  const qe = data.quarterlyEarnings;

  if (qe.length < 2) return { trend: "insufficient", alerts };

  // 최신 → 과거 순 (이미 내림차순으로 저장됨)
  const latest = qe[0]!.net_income;
  const prev1  = qe[1]!.net_income;
  const prev2  = qe.length >= 3 ? qe[2]!.net_income : null;
  const prev3  = qe.length >= 4 ? qe[3]!.net_income : null;

  // ── 1. 흑자 전환 ──────────────────────────────────────────────────────────
  if (latest > 0 && prev1 < 0) {
    alerts.push(makeAlert(
      "earnings_turnaround", "bullish", "strong",
      `흑자 전환 (직전 적자→최신 흑자 ${(latest / 1e8).toFixed(0)}억)`, latest,
    ));
    return { trend: "turnaround", alerts };
  }

  // ── 2. 적자 전환 ──────────────────────────────────────────────────────────
  if (latest < 0 && prev1 > 0) {
    alerts.push(makeAlert(
      "earnings_deteriorating", "bearish", "strong",
      `적자 전환 (직전 흑자→최신 적자 ${(latest / 1e8).toFixed(0)}억)`, latest,
    ));
    return { trend: "deteriorating", alerts };
  }

  // ── 3. 연속 적자 ──────────────────────────────────────────────────────────
  const allNeg3 = latest < 0 && prev1 < 0 && (prev2 === null || prev2 < 0);
  if (allNeg3) {
    alerts.push(makeAlert(
      "earnings_consecutive_loss", "bearish", "normal",
      `연속 적자 (최근 ${qe.length >= 3 ? 3 : 2}분기)`, latest,
    ));
    return { trend: "deteriorating", alerts };
  }

  // ── 4. 이익 가속 / 감속 (4분기 있을 때) ────────────────────────────────────
  if (prev2 !== null && prev3 !== null && prev2 !== 0 && prev3 !== 0) {
    // 최근 성장률: latest vs prev1
    // 이전 성장률: prev1 vs prev2
    const recentGrowth = prev1 !== 0 ? (latest - prev1) / Math.abs(prev1) : 0;
    const priorGrowth  = prev2 !== 0 ? (prev1  - prev2) / Math.abs(prev2) : 0;

    const accelerating = recentGrowth > priorGrowth + 0.1;   // 10%p 이상 가속
    const decelerating = recentGrowth < priorGrowth - 0.1;   // 10%p 이상 감속

    if (accelerating && latest > 0) {
      alerts.push(makeAlert(
        "earnings_accelerating", "bullish", "normal",
        `이익 성장 가속 (최근 ${(recentGrowth * 100).toFixed(0)}% vs 이전 ${(priorGrowth * 100).toFixed(0)}%)`,
        recentGrowth,
      ));
      return { trend: "accelerating", alerts };
    }

    if (decelerating && latest > 0) {
      alerts.push(makeAlert(
        "earnings_decelerating", "bearish", "normal",
        `이익 성장 감속 (최근 ${(recentGrowth * 100).toFixed(0)}% vs 이전 ${(priorGrowth * 100).toFixed(0)}%)`,
        recentGrowth,
      ));
      return { trend: "decelerating", alerts };
    }
  }

  // ── 5. 4분기 연속 흑자 ────────────────────────────────────────────────────
  if (qe.length >= 4 && qe.every(q => q.net_income > 0)) {
    alerts.push({
      ...makeAlert(
        "earnings_all_positive", "bullish", "weak",
        `4분기 연속 흑자`, latest,
      ),
      scoreAffecting: false,   // 정보성
    });
  }

  return { trend: "stable", alerts };
}

// ── 3. 소유구조 신호 ──────────────────────────────────────────────────────────

/**
 * 내부자 보유비율 + 공매도 비율 기반 신호 감지.
 *
 * 내부자 보유비율 기준:
 *   > 50% : 오너 기업, 강한 신뢰 → strong bullish
 *   > 30% : 높은 내부자 신뢰    → normal bullish
 *   > 10% : 보통                → 신호 없음
 *   < 1%  : 경영진 관심 낮음   → 정보성 (scoreAffecting: false)
 *
 * 공매도 비율 (숏 커버에 걸리는 일 수) 기준:
 *   > 20일 : 극단적 공매도 → strong bearish  (단기 쇼트스퀴즈 가능성 언급)
 *   > 10일 : 높은 공매도   → normal bearish
 *   > 5일  : 주의          → weak bearish
 *
 * @param data - FundamentalData
 */
export function detectOwnership(data: FundamentalData): Alert[] {
  const alerts: Alert[] = [];

  // ── 내부자 보유비율 ───────────────────────────────────────────────────────
  if (data.insiderPct !== null) {
    const pct = data.insiderPct * 100;  // 0~1 → %

    if (pct > 50) {
      alerts.push(makeAlert(
        "insider_very_high", "bullish", "strong",
        `내부자 고보유 (${pct.toFixed(1)}%)`, pct,
      ));
    } else if (pct > 30) {
      alerts.push(makeAlert(
        "insider_high", "bullish", "normal",
        `내부자 보유 높음 (${pct.toFixed(1)}%)`, pct,
      ));
    } else if (pct < 1) {
      alerts.push({
        ...makeAlert(
          "insider_very_low", "bearish", "weak",
          `내부자 보유 낮음 (${pct.toFixed(1)}%)`, pct,
        ),
        scoreAffecting: false,
      });
    }
  }

  // ── 공매도 비율 ───────────────────────────────────────────────────────────
  if (data.shortRatio !== null) {
    const sr = data.shortRatio;

    if (sr > 20) {
      alerts.push(makeAlert(
        "short_extreme", "bearish", "strong",
        `극단적 공매도 (숏 커버 ${sr.toFixed(1)}일, 쇼트스퀴즈 주의)`, sr,
      ));
    } else if (sr > 10) {
      alerts.push(makeAlert(
        "short_high", "bearish", "normal",
        `높은 공매도 비율 (숏 커버 ${sr.toFixed(1)}일)`, sr,
      ));
    } else if (sr > 5) {
      alerts.push(makeAlert(
        "short_elevated", "bearish", "weak",
        `공매도 주의 (숏 커버 ${sr.toFixed(1)}일)`, sr,
      ));
    }
  }

  return alerts;
}

// ── 통합 분석 ─────────────────────────────────────────────────────────────────

const SCORE_WEIGHT: Record<string, number> = {
  bullish: 1, bearish: -1, neutral: 0,
};
const STRENGTH_MULT: Record<string, number> = {
  strong: 2, normal: 1, weak: 0.5,
};

/**
 * 펀더멘털 전체 신호 통합 분석.
 *
 * @param ticker - 티커 심볼
 * @param data   - FundamentalData
 */
export function analyzeFundamentals(
  ticker: string,
  data:   FundamentalData,
): FundamentalSummary {
  const valAlerts    = detectValuation(data);
  const earnResult   = detectEarningsAcceleration(data);
  const ownAlerts    = detectOwnership(data);

  const allAlerts: Alert[] = [...valAlerts, ...earnResult.alerts, ...ownAlerts];

  const score = allAlerts.reduce((sum, a) => {
    if (!a.scoreAffecting) return sum;
    return sum + (SCORE_WEIGHT[a.direction] ?? 0) * (STRENGTH_MULT[a.strength] ?? 1);
  }, 0);

  return {
    ticker,
    score:         Math.round(score * 10) / 10,
    pe:            data.pe,
    pb:            data.pb,
    roe:           data.roe,
    insiderPct:    data.insiderPct,
    shortRatio:    data.shortRatio,
    earningsTrend: earnResult.trend,
    alerts:        allAlerts,
  };
}
