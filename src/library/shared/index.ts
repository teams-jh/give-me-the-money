export { calcPositionSize } from "./position";
export { classifyTrend } from "./classifyTrend";

export { getQuarterKey, calcSectorRotation } from "./sector";
export { detectHighLowBreakout, detectPriceVolumeDivergence } from "./signals";

export { calcMarketBreadth, buildSnapshotDates, getMarketCondition } from "./breadth";
export { calcMA, calcEMA, calcRSI, calcATR, calcOBV, calcMDD, calcMACD, calcBollingerBands } from "./indicators";
export { convertToWeeklyBars } from "./indicators";
export type { OHLCBar } from "./indicators";
export { detectValuation, detectOwnership, analyzeFundamentals, detectEarningsAcceleration } from "./fundamentals";
export { analyzeSignals, detectRSISignal, detectMACDCross, detectBBBreakout, detectRiskSignal, detectGoldenCross, detectVolumeSpike, detectOBVDivergence } from "./signals";

export type { OHLCV, BBPoint, MACDPoint } from "./indicators";
export type { HighLowSignal, PriceVolumeDivSignal } from "./signals";

export type { TrendType, PriceSeries, TrendResult } from "./classifyTrend";
export type { TargetLevel, PositionInput, PositionResult } from "./position";

export type { MarketSnapshot, MarketCondition, MarketBreadthResult } from "./breadth";
export type { FundamentalData, QuarterlyEarning, FundamentalSummary } from "./fundamentals";

export type { StockInput, RankingRow, SectorSeries, QuarterRanking, SectorQuarterStats, SectorRotationResult } from "./sector";
export type { Alert, RSISignal, OBVSignal, RiskSignal, CrossSignal, VolumeSignal, SignalSummary, SignalStrength, SignalDirection, MACDCrossSignal, BBBreakoutSignal } from "./signals";
export { calcTrendTouchPoints, intersectSimResults } from "./signals";
export type { CalcTrendTouchPointsParams, TrendTouchPoint, CalcTrendTouchPointsResult, TrendPeriodKey, TrendSimEntry, TrendPeriodStat, TrendSimFinalResult } from "./signals";

export {
  PERIOD_BARS,
  snapDateUp, snapDateDown,
  buildTrendIndices,
  selectPriceBasis,
  calcTrendLine,
  buildChartData,
  calcSlopeInfo,
  filterTouchPoints,
  runTickerSim,
  sortSimResults,
  applyPatternFilter,
  convertToWeeklyBars as convertToWeeklyBarsSim,
} from "./trendSim";
export type {
  PeriodKey,
  BarUnit,
  PeriodConfig,
  PriceDataPoint,
  TouchPoint,
  SimResult,
  TrendLineResult,
  ChartData,
  SlopeInfo,
  FilterTouchPointsResult,
} from "./trendSim";

// ── 데이터 접근 계층 / 매퍼 (Issue #64) ──────────────────────────────────────
export { saveJsonAtomic, isUpdatedToday } from "./io";
export { toOHLCV, toDailyPrices, toFundamentalData } from "./tickerMapper";
export {
  tickerToFilename,
  resolveMarketPaths,
  loadTickerList,
  loadTicker,
  findSimilarTicker,
  saveJson,
  DEFAULT_DB_DIR,
} from "./tickerRepository";
export type { MarketPaths } from "./tickerRepository";
export type { RawTicker, RawPrice, DailyPrice } from "./tickerTypes";
