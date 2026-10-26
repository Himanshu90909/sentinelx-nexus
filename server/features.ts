// Feature engine. Every feature carries THREE timestamps:
//   featureTimestamp    - the bar the feature describes
//   sourceTimestamp     - the last raw observation used to compute it
//   availabilityTimestamp - the earliest wall-clock instant the value could
//                            legitimately be used by a model (bar close + receipt)
// All features are TRAILING-window only: no feature ever reads a future bar.

import { Candle, Timeframe, round } from "./core.js";

export interface FeatureValue {
  name: string;
  value: number;
  featureTimestamp: number;
  sourceTimestamp: number;
  availabilityTimestamp: number;
}

export const FEATURE_VERSION = "f1.0";

// ---- pure math helpers (also unit-tested directly) ----

export function sma(xs: number[], w: number): number {
  if (xs.length < w) return NaN;
  return xs.slice(-w).reduce((a, b) => a + b, 0) / w;
}

export function emaSeries(xs: number[], w: number): number[] {
  const a = 2 / (w + 1);
  const out: number[] = [];
  let prev = xs[0];
  for (const x of xs) {
    prev = prev === undefined ? x : a * x + (1 - a) * prev;
    out.push(prev);
  }
  return out;
}

export function ema(xs: number[], w: number): number {
  if (!xs.length) return NaN;
  return emaSeries(xs, w)[xs.length - 1];
}

export function returns(xs: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < xs.length; i++) r.push(xs[i] / xs[i - 1] - 1);
  return r;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (gains + losses === 0) return 50;
  const rs = gains / Math.max(losses, 1e-12);
  return 100 - 100 / (1 + rs);
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return NaN;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}

export function macd(closes: number[]): { macd: number; signal: number; hist: number } | null {
  if (closes.length < 35) return null;
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const line = fast.map((f, i) => f - slow[i]);
  const signal = emaSeries(line.slice(26), 9);
  const m = line[line.length - 1];
  const s = signal[signal.length - 1];
  return { macd: m, signal: s, hist: m - s };
}

/** Market session by UTC hour (documented simplification; NYSE hours 14:30-21:00 UTC). */
export function session(hourUtc: number): string {
  if (hourUtc >= 14 && hourUtc < 21) return "NYSE_REGULAR";
  if (hourUtc >= 12 && hourUtc < 21) return "NYSE_PRE_POST";
  return "CLOSED";
}

/**
 * Compute the current feature vector for the last CLOSED bar of a series.
 * availabilityTimestamp = close time of the newest bar the feature reads.
 */
export function computeFeatures(symbol: string, timeframe: Timeframe, series: Candle[]): FeatureValue[] {
  if (series.length < 30) return [];
  const last = series[series.length - 1];
  const closes = series.map((c) => c.close);
  const avail = last.eventTime; // when this bar closed, the feature became usable
  const rets = returns(closes);
  const mk = (name: string, value: number): FeatureValue => ({
    name,
    value: Number.isFinite(value) ? round(value, 6) : value,
    featureTimestamp: last.eventTime,
    sourceTimestamp: last.eventTime,
    availabilityTimestamp: avail,
  });

  const out: FeatureValue[] = [
    mk("return_1", rets[rets.length - 1]),
    mk("log_return_1", Math.log(closes[closes.length - 1] / closes[closes.length - 2])),
    mk("return_20", closes[closes.length - 1] / closes[closes.length - 21] - 1),
    mk("momentum_10", closes[closes.length - 1] / closes[closes.length - 11] - 1),
    mk("sma_20", sma(closes, 20)),
    mk("ema_20", ema(closes, 20)),
    mk("ema_50", ema(closes, 50)),
    {
      ...mk("volatility_20", stdOf(rets.slice(-20))),
      value: round(stdOf(rets.slice(-20)), 6),
    },
    mk("atr_14", atr(series, 14)),
    mk("rsi_14", rsi(closes)),
    ...(macd(closes) ? [mk("macd_hist", macd(closes)!.hist)] : []),
    mk("hour_utc", new Date(last.eventTime).getUTCHours()),
    mk("weekday", new Date(last.eventTime).getUTCDay()),
    mk("volume_z_20", volumeZ(series, 20)),
  ];
  return out;
}

function stdOf(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

function volumeZ(series: Candle[], w: number): number {
  if (series.length < w) return NaN;
  const vols = series.slice(-w).map((c) => c.volume);
  const m = vols.reduce((a, b) => a + b, 0) / vols.length;
  const s = stdOf(vols);
  if (s === 0) return 0;
  return (vols[vols.length - 1] - m) / s;
}

/**
 * Features computed AS OF a cutoff: only bars with eventTime <= cutoff may be read.
 * This is the replay/backtest-safe variant.
 */
export function computeFeaturesAsOf(series: Candle[], cutoff: number): FeatureValue[] {
  const visible = series.filter((c) => c.eventTime <= cutoff);
  return visible.length >= 30 ? computeFeatures(visible[0].symbol, visible[0].timeframe, visible) : [];
}
