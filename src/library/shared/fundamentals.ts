/**
 * fundamentals.ts
 *
 * 재무 데이터(밸류에이션·실적·소유구조) 기반 매수·매도 이상징후 감지.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 데이터 가용률 (ticker JSON 기준):
 *   PER/PBR        : US 85~96%  /  KR 0%  (null 처리 필수)
 *   PEG            : US 70%     /  KR 7%
 *   배당수익률      : US 75%     /  KR 70%
 *   분기순이익      : US 100%   /  KR 78%
 *   내부자 보유비율 : US 100%   /  KR 88%
 *   공매도 비율     : US 100%   /  KR 0%
 *   ROA             : US 100%   /  KR 77%
 *   순이익률        : US 100%   /  KR 83%
 *
 * 제공 신호:
 *   - detectValuation            : PER / PBR 절대값 기반 고/저평가
 *   - detectEarningsAcceleration : 분기 순이익 추세 (흑자전환·가속·감속)
 *   - detectOwnership            : 내부자 보유비율 + 공매도 비율
 *   - detectGrowthQuality        : 매출성장 + 이익률 품질 + PEG 보조
 *   - detectDividend             : 배당수익률 · 배당성향 매력도
 *   - detectProfitabilityTrend   : ROE · ROA · 영업이익률 종합 수익성
 *   - analyzeFundamentals        : 위 전체 통합 → FundamentalSummary
 */

import type { Alert, SignalDirection, SignalStrength } from "./signals.ts";

// ── 입력 타입 ─────────────────────────────────────────────────────────────────

/** ticker JSON에서 추출한 펀더멘털 데이터 */
export interface FundamentalData {
  // 밸류에이션
  pe:              number | null;   // trailing PER
  pb:              number | null;   // Price to Book
  pegRatio:        number | null;   // PEG Ratio (PER ÷ 이익성장률)
  // 수익성
  roe:             number | null;   // Return on Equity
  roa:             number | null;   // Return on Assets
  operatingMargin: number | null;   // 영업이익률
  profitMargins:   number | null;   // 순이익률
  revenueGrowth:   number | null;   // 매출 성장률 YoY
  quarterlyEarnings: QuarterlyEarning[];  // 최근 분기 순이익 (시간 내림차순)
  // 배당
  dividendYield:   number | null;   // 배당수익률 (0~1)
  payoutRatio:     number | null;   // 배당성향 (0~1)
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
  roa:       number | null;
  dividendYield: number | null;
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

// ── 4. 성장 품질 신호 ─────────────────────────────────────────────────────────

/**
 * 매출 성장률 × 순이익률 조합으로 성장 품질 판단.
 * PEG Ratio 보조 활용.
 *
 * 조합 판단:
 *   revenue_growth > 20% + profit_margins > 10%  → bullish strong  (고성장·고수익)
 *   revenue_growth > 10% + profit_margins > 5%   → bullish normal  (균형 성장)
 *   revenue_growth > 0%  + profit_margins < 0%   → bearish normal  (외형성장·이익잠식)
 *   revenue_growth < -10%                        → bearish normal  (매출 역성장)
 *   revenue_growth < 0%  + profit_margins < 0%   → bearish strong  (역성장·적자)
 *
 * PEG 보조:
 *   0 < PEG < 1  → bullish weak  (성장 대비 저평가)
 *   PEG > 3      → bearish weak  (성장 대비 고평가)
 */
export function detectGrowthQuality(data: FundamentalData): Alert[] {
  const alerts: Alert[] = [];
  const rg = data.revenueGrowth;   // YoY 소수 (0.15 = 15%)
  const pm = data.profitMargins;   // 소수

  if (rg !== null && pm !== null) {
    const rgPct = rg * 100;
    const pmPct = pm * 100;

    if (rgPct > 20 && pmPct > 10) {
      alerts.push(makeAlert(
        "growth_high_quality", "bullish", "strong",
        `고성장·고수익 (매출+${rgPct.toFixed(0)}% / 순이익률 ${pmPct.toFixed(1)}%)`,
      ));
    } else if (rgPct > 10 && pmPct > 5) {
      alerts.push(makeAlert(
        "growth_balanced", "bullish", "normal",
        `균형 성장 (매출+${rgPct.toFixed(0)}% / 순이익률 ${pmPct.toFixed(1)}%)`,
      ));
    } else if (rgPct < 0 && pmPct < 0) {
      alerts.push(makeAlert(
        "growth_double_negative", "bearish", "strong",
        `역성장·적자 (매출${rgPct.toFixed(0)}% / 순이익률 ${pmPct.toFixed(1)}%)`,
      ));
    } else if (rgPct > 0 && pmPct < 0) {
      alerts.push(makeAlert(
        "growth_margin_erosion", "bearish", "normal",
        `외형성장·이익잠식 (매출+${rgPct.toFixed(0)}% / 순이익률 ${pmPct.toFixed(1)}%)`,
      ));
    } else if (rgPct < -10) {
      alerts.push(makeAlert(
        "growth_revenue_decline", "bearish", "normal",
        `매출 역성장 경보 (${rgPct.toFixed(0)}% YoY)`,
      ));
    }
  } else if (rg !== null) {
    // profitMargins 없을 때 매출 성장만으로 판단
    const rgPct = rg * 100;
    if (rgPct < -10) {
      alerts.push(makeAlert(
        "growth_revenue_decline", "bearish", "normal",
        `매출 역성장 경보 (${rgPct.toFixed(0)}% YoY)`,
      ));
    }
  }

  // PEG 보조 (scoreAffecting: true 이지만 weak — 보조 지표 역할)
  if (data.pegRatio !== null) {
    const peg = data.pegRatio;
    if (peg > 0 && peg < 1) {
      alerts.push({
        ...makeAlert("peg_undervalued", "bullish", "weak",
          `PEG 저평가 (${peg.toFixed(2)} — 성장 대비 저평가)`, peg),
        scoreAffecting: true,
      });
    } else if (peg > 3) {
      alerts.push({
        ...makeAlert("peg_overvalued", "bearish", "weak",
          `PEG 고평가 (${peg.toFixed(2)} — 성장 대비 고평가)`, peg),
        scoreAffecting: true,
      });
    }
  }

  return alerts;
}

// ── 5. 배당 매력도 신호 ───────────────────────────────────────────────────────

/**
 * 배당수익률 × 배당성향 조합으로 배당 매력도 판단.
 *
 * 고배당·지속가능:
 *   yield > 5% + payout < 70%  → bullish strong
 *   yield > 3% + payout < 80%  → bullish normal
 *   yield > 1%                 → bullish weak   (scoreAffecting: false, 정보성)
 *
 * 배당 위험:
 *   payout > 100%              → bearish normal (배당 지속 불가)
 *   payout > 80% + yield < 2%  → bearish weak   (고성향·저수익률)
 *
 * 무배당:
 *   yield == 0 or null         → 신호 없음 (성장주는 무배당 정상)
 */
export function detectDividend(data: FundamentalData): Alert[] {
  const alerts: Alert[] = [];
  const yld     = data.dividendYield;    // 0~1
  const payout  = data.payoutRatio;      // 0~1 (>1 = 적자배당)

  if (yld === null || yld === 0) return alerts;

  const yldPct    = yld * 100;
  const payoutPct = payout !== null ? payout * 100 : null;

  // ── 배당 매력 ────────────────────────────────────────────────────────────
  if (yldPct > 5 && (payoutPct === null || payoutPct < 70)) {
    alerts.push(makeAlert(
      "dividend_high_sustainable", "bullish", "strong",
      `고배당·지속가능 (수익률 ${yldPct.toFixed(1)}%${payoutPct !== null ? ` / 성향 ${payoutPct.toFixed(0)}%` : ""})`,
      yldPct,
    ));
  } else if (yldPct > 3 && (payoutPct === null || payoutPct < 80)) {
    alerts.push(makeAlert(
      "dividend_attractive", "bullish", "normal",
      `배당 매력 (수익률 ${yldPct.toFixed(1)}%${payoutPct !== null ? ` / 성향 ${payoutPct.toFixed(0)}%` : ""})`,
      yldPct,
    ));
  } else if (yldPct > 1) {
    alerts.push({
      ...makeAlert("dividend_exists", "bullish", "weak",
        `배당 지급 (수익률 ${yldPct.toFixed(1)}%)`, yldPct),
      scoreAffecting: false,   // 정보성
    });
  }

  // ── 배당 위험 ────────────────────────────────────────────────────────────
  if (payoutPct !== null) {
    if (payoutPct > 100) {
      alerts.push(makeAlert(
        "dividend_unsustainable", "bearish", "normal",
        `배당 지속 불가 (성향 ${payoutPct.toFixed(0)}% — 이익 초과 배당)`,
        payoutPct,
      ));
    } else if (payoutPct > 80 && yldPct < 2) {
      alerts.push(makeAlert(
        "dividend_high_payout_low_yield", "bearish", "weak",
        `고성향·저수익 배당 (성향 ${payoutPct.toFixed(0)}% / 수익률 ${yldPct.toFixed(1)}%)`,
        payoutPct,
      ));
    }
  }

  return alerts;
}

// ── 6. 수익성 종합 신호 ───────────────────────────────────────────────────────

/**
 * ROE × ROA × 영업이익률 조합으로 수익성 종합 판단.
 *
 * ROE 기준 (자본 효율성):
 *   > 20% + ROA > 10%  → bullish strong  (우수한 자본·자산 효율)
 *   > 15%              → bullish normal
 *   < 0%               → bearish normal  (자본 잠식 위험)
 *   < -20%             → bearish strong  (심각한 자본 훼손)
 *
 * 영업이익률 보조:
 *   < -10%             → bearish normal  (영업 구조 문제)
 *   > 20%              → bullish weak    (우수한 영업 구조, scoreAffecting: false)
 *
 * ROA 단독 (ROE null 시):
 *   > 10%              → bullish normal
 *   < 0%               → bearish normal
 */
export function detectProfitabilityTrend(data: FundamentalData): Alert[] {
  const alerts: Alert[] = [];
  const roe = data.roe;
  const roa = data.roa;
  const om  = data.operatingMargin;

  // ── ROE 기반 ─────────────────────────────────────────────────────────────
  if (roe !== null) {
    const roePct = roe * 100;
    const roaPct = roa !== null ? roa * 100 : null;

    if (roePct > 20 && roaPct !== null && roaPct > 10) {
      alerts.push(makeAlert(
        "profitability_excellent", "bullish", "strong",
        `우수한 수익성 (ROE ${roePct.toFixed(1)}% / ROA ${roaPct.toFixed(1)}%)`,
      ));
    } else if (roePct > 15) {
      alerts.push(makeAlert(
        "profitability_good", "bullish", "normal",
        `양호한 자본효율 (ROE ${roePct.toFixed(1)}%)`,
        roePct,
      ));
    } else if (roePct < -20) {
      alerts.push(makeAlert(
        "profitability_critical", "bearish", "strong",
        `심각한 자본 훼손 (ROE ${roePct.toFixed(1)}%)`,
        roePct,
      ));
    } else if (roePct < 0) {
      alerts.push(makeAlert(
        "profitability_negative_roe", "bearish", "normal",
        `자본 잠식 위험 (ROE ${roePct.toFixed(1)}%)`,
        roePct,
      ));
    }
  } else if (roa !== null) {
    // ROE 없을 때 ROA만으로 판단
    const roaPct = roa * 100;
    if (roaPct > 10) {
      alerts.push(makeAlert(
        "profitability_roa_good", "bullish", "normal",
        `우수한 자산효율 (ROA ${roaPct.toFixed(1)}%)`,
        roaPct,
      ));
    } else if (roaPct < 0) {
      alerts.push(makeAlert(
        "profitability_roa_negative", "bearish", "normal",
        `자산 수익성 악화 (ROA ${roaPct.toFixed(1)}%)`,
        roaPct,
      ));
    }
  }

  // ── 영업이익률 보조 ────────────────────────────────────────────────────
  if (om !== null) {
    const omPct = om * 100;
    if (omPct < -10) {
      alerts.push(makeAlert(
        "profitability_operating_loss", "bearish", "normal",
        `영업 구조 문제 (영업이익률 ${omPct.toFixed(1)}%)`,
        omPct,
      ));
    } else if (omPct > 20) {
      alerts.push({
        ...makeAlert("profitability_high_margin", "bullish", "weak",
          `우수한 영업이익률 (${omPct.toFixed(1)}%)`, omPct),
        scoreAffecting: false,   // 정보성 (ROE와 중복 방지)
      });
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
  const growthAlerts = detectGrowthQuality(data);
  const divAlerts    = detectDividend(data);
  const profAlerts   = detectProfitabilityTrend(data);

  const allAlerts: Alert[] = [
    ...valAlerts,
    ...earnResult.alerts,
    ...ownAlerts,
    ...growthAlerts,
    ...divAlerts,
    ...profAlerts,
  ];

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
    roa:           data.roa,
    dividendYield: data.dividendYield,
    insiderPct:    data.insiderPct,
    shortRatio:    data.shortRatio,
    earningsTrend: earnResult.trend,
    alerts:        allAlerts,
  };
}
