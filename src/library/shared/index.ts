export { classifyTrend } from "./classifyTrend";
export type { PriceSeries, TrendResult, TrendType } from "./classifyTrend";

export { calcMA, calcEMA, calcRSI, calcMACD, calcBollingerBands, calcATR, calcOBV, calcMDD } from "./indicators";
export type { OHLCV, MACDPoint, BBPoint } from "./indicators";

export { analyzeSignals, detectGoldenCross, detectRSISignal, detectMACDCross, detectBBBreakout, detectVolumeSpike, detectOBVDivergence, detectRiskSignal } from "./signals";
export type { Alert, SignalSummary, SignalDirection, SignalStrength, CrossSignal, RSISignal, MACDCrossSignal, BBBreakoutSignal, VolumeSignal, OBVSignal, RiskSignal } from "./signals";
