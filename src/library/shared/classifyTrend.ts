/**
 * classifyTrend.ts
 *
 * Python analyze_stocks.py 의 classify_trend() 를 순수 TypeScript 로 변환.
 * 외부 라이브러리 없음 — 프론트엔드 / 백엔드 공용.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrendType = 'bullish' | 'bearish' | 'sideways' | 'recovering';

/** classify_trend() 에 넘기는 가격 시계열 */
export interface PriceSeries {
  /** 날짜 문자열 배열. e.g. "2024-01-28"  (values 와 같은 길이) */
  labels: string[];
  /** 종가 배열 */
  values: number[];
}

/** classify_trend() 반환값 */
export interface TrendResult {
  // 추세 분류
  trend: TrendType;
  /** 전체 기울기 (%/봉, 평균가 기준) */
  slopePct: number;
  /** 결정계수 R² (0 ~ 1, 추세 명확도) */
  r2: number;
  /** 전반 2/3 기울기 (%/봉) */
  slopeEarlyPct: number;
  /** 후반 1/3 기울기 (%/봉) */
  slopeLatePct: number;

  // 보조 지표
  /** 기간 전체 수익률 (%) */
  totalReturn: number;

  // 차트용 데이터 (base = 100 정규화)
  chartLabels: string[];
  chartData: number[];
  regression: number[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface LinregressResult {
  slope: number;
  intercept: number;
  r: number;
}

/**
 * 단순 선형회귀 (OLS).
 * scipy.stats.linregress 와 동일한 수식.
 *
 * slope     = (n·Σxy − Σx·Σy)  / (n·Σx² − (Σx)²)
 * intercept = (Σy − slope·Σx)  / n
 * r         = (n·Σxy − Σx·Σy)  / √[(n·Σx²−(Σx)²)·(n·Σy²−(Σy)²)]
 */
function linregress(x: number[], y: number[]): LinregressResult {
  const n = x.length;
  let sx = 0,
    sy = 0,
    sxy = 0,
    sx2 = 0,
    sy2 = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i] as number;
    const yi = y[i] as number;
    sx += xi;
    sy += yi;
    sxy += xi * yi;
    sx2 += xi * xi;
    sy2 += yi * yi;
  }

  const denom = n * sx2 - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const rDenom = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  const r = rDenom === 0 ? 0 : (n * sxy - sx * sy) / rDenom;

  return { slope, intercept, r };
}

/** 배열 평균 */
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** 소수점 d 자리 반올림 */
function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * 선형회귀 기울기(slope) + R² + 전/후반 기울기로 추세를 분류한다.
 *
 * @param series  - 날짜 레이블 + 종가 배열
 * @param minPts  - 분류에 필요한 최소 데이터 포인트 수
 * @returns TrendResult, 데이터 부족 시 null
 */
export function classifyTrend(series: PriceSeries, minPts: number): TrendResult | null {
  // ── guard ──────────────────────────────────────────────────────────────────
  const vals = series.values;
  if (vals.length < minPts) return null;

  const n = vals.length;
  const x = Array.from({ length: n }, (_, i) => i); // [0, 1, 2, ..., n-1]

  // ── 전체 선형회귀 ──────────────────────────────────────────────────────────
  const { slope: slopeAll, intercept, r } = linregress(x, vals);
  const r2 = round(r ** 2, 3);
  const slopePct = round((slopeAll / mean(vals)) * 100, 3);

  // ── 전/후반 분할 ───────────────────────────────────────────────────────────
  // Python: split = max(4, int(n * 2 / 3))
  const split = Math.max(4, Math.floor((n * 2) / 3));

  const xEarly = x.slice(0, split);
  const vEarly = vals.slice(0, split);
  const xLate = x.slice(split);
  const vLate = vals.slice(split);

  const { slope: sE } = linregress(xEarly, vEarly);
  const { slope: sL } = linregress(xLate, vLate);

  const slopeEarlyPct = round((sE / mean(vEarly)) * 100, 3);
  const slopeLatePct = round((sL / mean(vLate)) * 100, 3);

  // ── 추세 분류 ──────────────────────────────────────────────────────────────
  let trend: TrendType;

  if (slopeEarlyPct < -0.2 && slopeLatePct > 0.4) trend = 'recovering';
  else if (slopePct > 0.3 && r2 >= 0.35) trend = 'bullish';
  else if (slopePct < -0.3 && r2 >= 0.35) trend = 'bearish';
  else trend = 'sideways';

  // ── 보조 지표 ──────────────────────────────────────────────────────────────
  const first = vals[0] as number;
  const last = vals[n - 1] as number;
  const totalReturn = round((last / first - 1) * 100, 1);

  // ── 차트 데이터 (base = 100 정규화) ────────────────────────────────────────
  const base = first;
  const chartData = vals.map((v) => round((v / base) * 100, 2));
  const regression = x.map((i) => round(((intercept + slopeAll * i) / base) * 100, 2));

  return {
    trend,
    slopePct,
    r2,
    slopeEarlyPct,
    slopeLatePct,
    totalReturn,
    chartLabels: series.labels,
    chartData,
    regression,
  };
}
