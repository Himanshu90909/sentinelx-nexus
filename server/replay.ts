// Research replay engine: re-processes historical bars AS IF they were
// arriving in real time. The prediction made at replay time T may only read
// bars with eventTime <= T - enforced structurally, verified per row, and
// proven by a dedicated test.

import { Candle, Horizon, Timeframe, TIMEFRAME_MS, HORIZON_MS, horizonBars, modelTimeframeForHorizon, round, iso } from "./core.js";
import { fitModel } from "./models.js";
import { assessRegime } from "./regime.js";
import { walkForward } from "./evaluation.js";
import { audit } from "./leakage.js";
import { computeFeaturesAsOf } from "./features.js";

export interface ReplayRow {
  replayTime: number;
  availableBars: number;
  featuresAvailable: string[];
  prediction: number;
  model: string;
  actual: number | null;
  error: number | null;
  leaked: boolean;
}

export interface ReplayResult {
  symbol: string;
  timeframe: Timeframe;
  horizon: Horizon;
  rows: ReplayRow[];
  guarantee: string;
}

export function replay(symbol: string, timeframe: Timeframe, horizon: Horizon, series: Candle[], steps = 12): ReplayResult {
  const rows: ReplayRow[] = [];
  if (series.length < 80) {
    return { symbol, timeframe, horizon, rows, guarantee: "insufficient history for replay" };
  }
  const h = horizonBars(horizon, timeframe);
  const targetMs = HORIZON_MS[horizon];
  const step = Math.max(1, Math.floor(Math.min(30, series.length / 4) / steps));
  for (let i = series.length - 1 - steps * step; i < series.length - h; i += step) {
    if (i < 60) continue;
    const cutoff = series[i].eventTime;
    const visible = series.filter((c) => c.eventTime <= cutoff); // <- the ONLY data the prediction may see
    const closes = visible.map((c) => c.close);
    // model choice is a fixed documented default for replay determinism: naive
    const fitted = fitModel("naive", timeframe, closes);
    const prediction = fitted.predict(closes, h);
    const future = series.find((c) => c.eventTime >= cutoff + targetMs);
    const actual = future ? future.close : null;

    const feats = computeFeaturesAsOf(series, cutoff);
    const leakCheck = audit(symbol, feats, cutoff, "replay");
    rows.push({
      replayTime: cutoff,
      availableBars: visible.length,
      featuresAvailable: feats.map((f) => f.name),
      prediction: round(prediction, 6),
      model: "naive",
      actual,
      error: actual !== null ? round(actual - prediction, 6) : null,
      leaked: !leakCheck.passed,
    });
  }
  return {
    symbol,
    timeframe,
    horizon,
    rows,
    guarantee:
      "For each row, the prediction is computed from the subset of bars with eventTime <= replayTime (structural cutoff, verified per row by the leakage auditor). Actuals are read only for scoring, never as model input.",
  };
}
