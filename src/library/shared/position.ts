/**
 * position.ts
 *
 * ATR 기반 포지션 사이징 계산.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 *
 * 핵심 공식:
 *   riskAmount      = totalCapital × (riskPct / 100)
 *   stopLoss        = currentPrice − ATR × atrMultiplier
 *   lossPerShare    = currentPrice − stopLoss
 *   shares          = floor(riskAmount / lossPerShare)
 *   totalInvestment = shares × currentPrice
 *   target(nR)      = currentPrice + lossPerShare × n
 */

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface PositionInput {
  /** 총 자본 (원 또는 달러) */
  totalCapital:  number;
  /** 허용 리스크 % (e.g. 1 → 1%) */
  riskPct:       number;
  /** 현재가 */
  currentPrice:  number;
  /** ATR 값 (calcATR 결과) */
  atr:           number;
  /** 손절 배수 (ATR × 이 값 = 손절폭, 기본 1.5) */
  atrMultiplier?: number;
  /** 목표 R 배수 목록 (기본 [1, 2, 3]) */
  targetRatios?:  number[];
}

export interface TargetLevel {
  /** R 배수 (1R = 손절폭과 동일한 수익) */
  ratio:      number;
  /** 목표가 */
  price:      number;
  /** 현재가 대비 수익률 % */
  returnPct:  number;
  /** 해당 목표 달성시 총 수익금 */
  profit:     number;
}

export interface PositionResult {
  // ── 입력 요약 ──────────────────────────────────────────────────────────────
  totalCapital:    number;
  riskPct:         number;
  currentPrice:    number;
  atr:             number;
  atrMultiplier:   number;

  // ── 리스크 계산 ────────────────────────────────────────────────────────────
  /** 허용 손실금액 = totalCapital × riskPct / 100 */
  riskAmount:      number;
  /** 손절가 = currentPrice − ATR × atrMultiplier */
  stopLoss:        number;
  /** 손절 % = (currentPrice − stopLoss) / currentPrice × 100 */
  stopLossPct:     number;
  /** 1주당 손실허용폭 = currentPrice − stopLoss */
  lossPerShare:    number;

  // ── 포지션 규모 ────────────────────────────────────────────────────────────
  /** 매수 수량 (소수점 버림) */
  shares:          number;
  /** 총 투자금액 = shares × currentPrice */
  totalInvestment: number;
  /** 총자본 대비 투자 비중 % */
  capitalUsagePct: number;
  /** 실제 리스크금액 = shares × lossPerShare (riskAmount 와 약간 다를 수 있음) */
  actualRisk:      number;

  // ── 목표가 ─────────────────────────────────────────────────────────────────
  targets: TargetLevel[];

  // ── 경고 ───────────────────────────────────────────────────────────────────
  /** 주의가 필요한 상황 설명 목록 */
  warnings: string[];
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────

/**
 * ATR 기반 포지션 사이징 계산.
 *
 * @param input - PositionInput
 * @returns PositionResult
 *
 * @example
 * const result = calcPositionSize({
 *   totalCapital: 10_000_000,
 *   riskPct:      1,
 *   currentPrice: 85_000,
 *   atr:          2_300,
 * });
 * console.log(result.shares);        // 매수 수량
 * console.log(result.stopLoss);      // 손절가
 * console.log(result.targets[1]);    // 2R 목표
 */
export function calcPositionSize(input: PositionInput): PositionResult {
  const {
    totalCapital,
    riskPct,
    currentPrice,
    atr,
    atrMultiplier = 1.5,
    targetRatios  = [1, 2, 3],
  } = input;

  const warnings: string[] = [];

  // ── 유효성 검사 ───────────────────────────────────────────────────────────
  if (totalCapital <= 0) warnings.push("총 자본이 0 이하입니다.");
  if (riskPct <= 0 || riskPct > 100) warnings.push("리스크%는 0 초과 100 이하여야 합니다.");
  if (currentPrice <= 0) warnings.push("현재가가 0 이하입니다.");
  if (atr <= 0) warnings.push("ATR이 0 이하입니다.");

  // ── 리스크 계산 ───────────────────────────────────────────────────────────
  const riskAmount   = round(totalCapital * riskPct / 100, 0);
  const stopLoss     = round(currentPrice - atr * atrMultiplier, 2);
  const lossPerShare = round(currentPrice - stopLoss, 2);
  const stopLossPct  = round(lossPerShare / currentPrice * 100, 2);

  // ── 수량 계산 ─────────────────────────────────────────────────────────────
  let shares = 0;
  if (lossPerShare > 0) {
    shares = Math.floor(riskAmount / lossPerShare);
  }

  const totalInvestment = round(shares * currentPrice, 0);
  const capitalUsagePct = round(totalInvestment / totalCapital * 100, 1);
  const actualRisk      = round(shares * lossPerShare, 0);

  // ── 경고 추가 ─────────────────────────────────────────────────────────────
  if (shares === 0) {
    warnings.push(
      `1주 매수도 불가합니다. ` +
      `1주당 손실허용폭(${lossPerShare.toLocaleString()})이 ` +
      `허용 손실금액(${riskAmount.toLocaleString()})보다 큽니다.`
    );
  }

  if (totalInvestment > totalCapital) {
    warnings.push(
      `투자금액(${totalInvestment.toLocaleString()})이 총 자본(${totalCapital.toLocaleString()})을 초과합니다. ` +
      `리스크%를 낮추거나 atrMultiplier를 높이세요.`
    );
  }

  if (capitalUsagePct > 30) {
    warnings.push(
      `투자 비중(${capitalUsagePct}%)이 30%를 초과합니다. 분산 투자를 고려하세요.`
    );
  }

  if (stopLossPct > 10) {
    warnings.push(
      `손절 폭(${stopLossPct}%)이 10%를 초과합니다. ` +
      `변동성이 매우 높은 종목입니다.`
    );
  }

  if (lossPerShare <= 0) {
    warnings.push("ATR × 배수가 현재가보다 커서 손절가가 음수입니다. atrMultiplier를 줄이세요.");
  }

  // ── 목표가 계산 ───────────────────────────────────────────────────────────
  const targets: TargetLevel[] = targetRatios.map(ratio => {
    const price      = round(currentPrice + lossPerShare * ratio, 2);
    const returnPct  = round((price - currentPrice) / currentPrice * 100, 2);
    const profit     = round(shares * (price - currentPrice), 0);
    return { ratio, price, returnPct, profit };
  });

  return {
    totalCapital,
    riskPct,
    currentPrice,
    atr,
    atrMultiplier,
    riskAmount,
    stopLoss,
    stopLossPct,
    lossPerShare,
    shares,
    totalInvestment,
    capitalUsagePct,
    actualRisk,
    targets,
    warnings,
  };
}
