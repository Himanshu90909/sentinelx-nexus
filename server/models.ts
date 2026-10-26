// Model zoo (server-side, real implementations).
// Families implemented natively in TypeScript: BASELINE (naive, seasonal-naive,
// moving average) and CLASSICAL (exponential smoothing).
// Tree/DeepLearning/Foundation models are NOT implemented here and are NOT
// advertised: they plug in through a ModelServiceAdapter (external inference
// endpoint) only when MODEL_SERVICE_URL is configured. No fake models.

import { Candle, horizonBars, Horizon, Timeframe, quantile } from "./core.js";

export type ModelId = "naive" | "seasonal_naive" | "ma_20" | "ets";
export type ModelStatus = "EXPERIMENTAL" | "VALIDATED" | "CANDIDATE" | "PRODUCTION" | "ARCHIVED";
export type ModelFamily = "BASELINE" | "CLASSICAL" | "EXTERNAL";

export interface ModelMeta {
  id: ModelId;
  name: string;
  family: ModelFamily;
  status: ModelStatus;
  description: string;
  supportsIntervals: boolean;
}

export const MODELS: ModelMeta[] = [
  { id: "naive", name: "Naive (last value)", family: "BASELINE", status: "PRODUCTION", description: "Random-walk baseline: predicts the last observed close. The reference every other model must beat (MASE).", supportsIntervals: true },
  { id: "seasonal_naive", name: "Seasonal naive (period 24)", family: "BASELINE", status: "VALIDATED", description: "Predicts the value from one seasonal period back (24 bars).", supportsIntervals: true },
  { id: "ma_20", name: "Moving average (20)", family: "BASELINE", status: "EXPERIMENTAL", description: "Mean of the last 20 closes; smooths noise, lags trends.", supportsIntervals: true },
  { id: "ets", name: "Exponential smoothing (alpha tuned)", family: "CLASSICAL", status: "CANDIDATE", description: "Simple exponential smoothing; alpha selected by walk-forward validation on the training slice only.", supportsIntervals: true },
];

export interface ModelPrediction {
  point: number;
}

/** Period for seasonal naive, by timeframe (documented simplification). */
function seasonPeriod(tf: Timeframe): number {
  const p: Record<Timeframe, number> = { "1m": 60, "5m": 12, "15m": 4, "1h": 24, "4h": 6, "1d": 7, "7d": 52 };
  return p[tf];
}

export interface FittedModel {
  id: ModelId;
  /** Predict the close, h bars ahead, using only candles up to `upto` (index, exclusive). */
  predict(closes: number[], h: number): number;
}

export function fitModel(id: ModelId, tf: Timeframe, trainCloses: number[]): FittedModel {
  switch (id) {
    case "naive":
      return { id, predict: (closes) => closes[closes.length - 1] };
    case "seasonal_naive": {
      const p = seasonPeriod(tf);
      return { id, predict: (closes, h) => closes[Math.max(0, closes.length - p)] ?? closes[closes.length - 1] };
    }
    case "ma_20":
      return { id, predict: (closes) => { const w = closes.slice(-20); return w.reduce((a, b) => a + b, 0) / w.length; } };
    case "ets": {
      const alpha = tuneAlpha(trainCloses);
      return {
        id,
        predict: (closes) => {
          let level = closes[0];
          for (const c of closes) level = alpha * c + (1 - alpha) * level;
          return level;
        },
      };
    }
  }
}

/** In-sample one-step grid search over alpha. Uses ONLY the training slice. */
function tuneAlpha(closes: number[]): number {
  let best = 0.3;
  let bestErr = Infinity;
  for (const a of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
    let level = closes[0];
    let err = 0;
    for (let i = 1; i < closes.length; i++) {
      err += Math.abs(closes[i] - level);
      level = a * closes[i] + (1 - a) * level;
    }
    const mae = err / (closes.length - 1);
    if (mae < bestErr) {
      bestErr = mae;
      best = a;
    }
  }
  return best;
}

/** Empirical prediction interval from walk-forward residual quantiles. */
export function residualInterval(residuals: number[], point: number, level = 0.8): { lower: number; upper: number; width: number } {
  if (!residuals.length) return { lower: point, upper: point, width: 0 };
  const lo = quantile(residuals, (1 - level) / 2);
  const hi = quantile(residuals, 1 - (1 - level) / 2);
  const lower = point + lo;
  const upper = point + hi;
  return { lower, upper, width: upper - lower };
}

export function modelMeta(id: string): ModelMeta | undefined {
  return MODELS.find((m) => m.id === id);
}
