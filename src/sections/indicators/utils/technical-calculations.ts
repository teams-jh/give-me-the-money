// Technical Indicators Helper Math Functions
// All pure functions — no React, no side effects.

export function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(data[i]); // Not enough data, fallback to close price
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(Number((sum / period).toFixed(2)));
    }
  }
  return sma;
}

export function calculateRSI(data: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      rsi.push(50);
      continue;
    }

    const diff = data[i] - data[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);

    if (i < period) {
      rsi.push(50);
    } else {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      }
    }
  }
  return rsi;
}

export function calculateBollingerBands(data: number[], period: number = 20, multiplier: number = 2) {
  const sma = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(data[i]);
      lower.push(data[i]);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      upper.push(Number((mean + multiplier * stdDev).toFixed(2)));
      lower.push(Number((mean - multiplier * stdDev).toFixed(2)));
    }
  }

  return { sma, upper, lower };
}

export function calculateMACD(data: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const calculateEMA = (arr: number[], length: number): number[] => {
    const ema: number[] = [];
    const k = 2 / (length + 1);
    let prevEma = arr[0] || 0;
    ema.push(prevEma);

    for (let i = 1; i < arr.length; i++) {
      const curEma = arr[i] * k + prevEma * (1 - k);
      ema.push(curEma);
      prevEma = curEma;
    }
    return ema;
  };

  const ema12 = calculateEMA(data, shortPeriod);
  const ema26 = calculateEMA(data, longPeriod);

  const macdLine = ema12.map((val, idx) => Number((val - ema26[idx]).toFixed(2)));
  const signalLine = calculateEMA(macdLine, signalPeriod).map(val => Number(val.toFixed(2)));
  const histogram = macdLine.map((val, idx) => Number((val - signalLine[idx]).toFixed(2)));

  return { macdLine, signalLine, histogram };
}

export function calculateEnvelope(data: number[], period: number = 20, percent: number = 0.1) {
  const sma = calculateSMA(data, period);
  const upper = sma.map(val => Number((val * (1 + percent)).toFixed(2)));
  const lower = sma.map(val => Number((val * (1 - percent)).toFixed(2)));
  return { sma, upper, lower };
}

export function calculateDonchianChannels(data: number[], period: number = 20) {
  const upper: number[] = [];
  const lower: number[] = [];
  const middle: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(data[i]);
      lower.push(data[i]);
      middle.push(data[i]);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const high = Math.max(...slice);
      const low = Math.min(...slice);
      upper.push(Number(high.toFixed(2)));
      lower.push(Number(low.toFixed(2)));
      middle.push(Number(((high + low) / 2).toFixed(2)));
    }
  }

  return { upper, lower, middle };
}
