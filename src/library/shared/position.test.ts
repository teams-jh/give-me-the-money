import { describe, it, expect } from 'vitest';
import { calcPositionSize, type PositionInput } from './position.ts';

// ── 기본 입력 fixture ─────────────────────────────────────────────────────────

const BASE: PositionInput = {
  totalCapital:  10_000_000,  // 1천만원
  riskPct:       1,           // 1%
  currentPrice:  100_000,     // 10만원
  atr:           3_000,       // ATR 3000원
  atrMultiplier: 1.5,
  targetRatios:  [1, 2, 3],
};

// ── 핵심 계산 공식 검증 ───────────────────────────────────────────────────────

describe('calcPositionSize — 핵심 공식', () => {
  it('riskAmount = totalCapital × riskPct / 100', () => {
    const r = calcPositionSize(BASE);
    expect(r.riskAmount).toBe(100_000); // 10_000_000 × 1% = 100_000
  });

  it('stopLoss = currentPrice - atr × atrMultiplier', () => {
    const r = calcPositionSize(BASE);
    // 100_000 - 3_000 × 1.5 = 95_500
    expect(r.stopLoss).toBe(95_500);
  });

  it('lossPerShare = currentPrice - stopLoss', () => {
    const r = calcPositionSize(BASE);
    expect(r.lossPerShare).toBe(4_500); // 100_000 - 95_500
  });

  it('shares = floor(riskAmount / lossPerShare)', () => {
    const r = calcPositionSize(BASE);
    // floor(100_000 / 4_500) = floor(22.22) = 22
    expect(r.shares).toBe(22);
  });

  it('totalInvestment = shares × currentPrice', () => {
    const r = calcPositionSize(BASE);
    expect(r.totalInvestment).toBe(22 * 100_000); // 2_200_000
  });

  it('actualRisk = shares × lossPerShare', () => {
    const r = calcPositionSize(BASE);
    expect(r.actualRisk).toBe(22 * 4_500); // 99_000
  });
});

// ── 목표가 계산 ───────────────────────────────────────────────────────────────

describe('calcPositionSize — 목표가 (targets)', () => {
  it('1R 목표가 = currentPrice + lossPerShare × 1', () => {
    const r = calcPositionSize(BASE);
    expect(r.targets[0]!.price).toBe(100_000 + 4_500); // 104_500
  });

  it('2R 목표가 = currentPrice + lossPerShare × 2', () => {
    const r = calcPositionSize(BASE);
    expect(r.targets[1]!.price).toBe(100_000 + 4_500 * 2); // 109_000
  });

  it('목표가의 profit = shares × (targetPrice - currentPrice)', () => {
    const r = calcPositionSize(BASE);
    const t1 = r.targets[0]!;
    expect(t1.profit).toBe(22 * 4_500); // 99_000
  });

  it('targetRatios가 없으면 기본값 [1,2,3]이 적용된다', () => {
    const { targetRatios: _, ...withoutTargets } = BASE;
    const r = calcPositionSize(withoutTargets);
    expect(r.targets).toHaveLength(3);
    expect(r.targets.map(t => t.ratio)).toEqual([1, 2, 3]);
  });

  it('커스텀 targetRatios가 그대로 반영된다', () => {
    const r = calcPositionSize({ ...BASE, targetRatios: [1.5, 3, 5] });
    expect(r.targets.map(t => t.ratio)).toEqual([1.5, 3, 5]);
  });
});

// ── atrMultiplier 기본값 ──────────────────────────────────────────────────────

describe('calcPositionSize — atrMultiplier 기본값', () => {
  it('atrMultiplier 미입력 시 1.5가 적용된다', () => {
    const { atrMultiplier: _, ...withoutMultiplier } = BASE;
    const r = calcPositionSize(withoutMultiplier);
    expect(r.atrMultiplier).toBe(1.5);
    expect(r.stopLoss).toBe(100_000 - 3_000 * 1.5);
  });
});

// ── 경고 (warnings) ───────────────────────────────────────────────────────────

describe('calcPositionSize — 경고 조건', () => {
  it('shares가 0이면 경고를 추가한다 (자본 너무 적음)', () => {
    const r = calcPositionSize({
      ...BASE,
      totalCapital: 1_000,  // 1000원 → riskAmount=10원 < lossPerShare
      riskPct: 1,
    });
    expect(r.shares).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('capitalUsagePct > 30%이면 경고를 추가한다', () => {
    const r = calcPositionSize({
      ...BASE,
      riskPct:      5,       // 리스크 높임 → 수량 많아짐 → 자본 비중 증가
      atrMultiplier: 0.1,    // 손절폭 줄임 → 수량 폭발적 증가
    });
    expect(r.warnings.some(w => w.includes('30%'))).toBe(true);
  });

  it('stopLossPct > 10%이면 경고를 추가한다 (손절 폭 과다)', () => {
    const r = calcPositionSize({
      ...BASE,
      atr:           20_000, // ATR이 매우 크면 손절 폭이 20%+
      atrMultiplier: 1.5,
    });
    expect(r.warnings.some(w => w.includes('10%'))).toBe(true);
  });

  it('유효한 입력에서는 경고가 없다', () => {
    const r = calcPositionSize(BASE);
    expect(r.warnings).toHaveLength(0);
  });
});

// ── 엣지 케이스 ───────────────────────────────────────────────────────────────

describe('calcPositionSize — 엣지 케이스', () => {
  it('totalCapital이 0이면 경고를 포함하고 riskAmount는 0이다', () => {
    const r = calcPositionSize({ ...BASE, totalCapital: 0 });
    expect(r.riskAmount).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('currentPrice가 0이면 경고를 포함한다', () => {
    const r = calcPositionSize({ ...BASE, currentPrice: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('atr이 0이면 경고를 포함한다', () => {
    const r = calcPositionSize({ ...BASE, atr: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('atrMultiplier가 매우 크면 stopLoss가 음수가 되고 손절폭 경고가 붙는다', () => {
    // atrMultiplier=100 → stopLoss=-200000 (음수), lossPerShare=300000 (양수)
    // position.ts 의 "음수" 경고는 lossPerShare<=0 일 때만 발생하므로
    // 이 케이스에서는 "10%를 초과" 경고가 붙는다 (stopLossPct=300%)
    const r = calcPositionSize({ ...BASE, atrMultiplier: 100 });
    expect(r.stopLoss).toBeLessThan(0);
    expect(r.warnings.some(w => w.includes('10%'))).toBe(true);
  });

  it('반환 객체에 모든 필드가 존재한다', () => {
    const r = calcPositionSize(BASE);
    const requiredKeys: (keyof typeof r)[] = [
      'totalCapital', 'riskPct', 'currentPrice', 'atr', 'atrMultiplier',
      'riskAmount', 'stopLoss', 'stopLossPct', 'lossPerShare',
      'shares', 'totalInvestment', 'capitalUsagePct', 'actualRisk',
      'targets', 'warnings',
    ];
    requiredKeys.forEach(key => {
      expect(r).toHaveProperty(key);
    });
  });

  it('US 종목 (소수점 가격) 계산도 정확하다', () => {
    const r = calcPositionSize({
      totalCapital:  10_000,    // $10,000
      riskPct:       1,
      currentPrice:  185.50,    // AAPL 수준
      atr:           3.20,
      atrMultiplier: 1.5,
    });
    // riskAmount = 100
    // stopLoss = 185.50 - 3.20*1.5 = 180.70
    // lossPerShare = 4.80
    // shares = floor(100/4.80) = 20
    expect(r.riskAmount).toBe(100);
    expect(r.stopLoss).toBeCloseTo(180.70, 1);
    expect(r.shares).toBe(20);
  });
});
