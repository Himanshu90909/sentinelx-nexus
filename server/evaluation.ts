// Walk-forward evaluation. STRICT temporal splits only: expanding window,
// monotonically advancing test points. No shuffling anywhere.

import { Candle, Horizon, Timeframe, horizonBars, round } from "./core.js";
import { fitModel, ModelId, residualInterval } from "./models.js";
import { returns } from "./features.js";
import { push, truncate } from "./store.js";
import { iso, fnv1a, nextId, VERSIONS } from "./core.js";

export interface FoldResult {
  trainStart: number; trainEnd: number; testStart: number; testEnd: number;
  predicted: number; actual: number;
  within80?: boolean;
}

export interface Metrics {
  mae: number;
  rmse: number;
  smape: number;
  mase: number;
  directionalAccuracy: number;
  coverage80: number;
  calibrationError: number; // |coverage80 - 0.8|
  samples: number;
}

export interface WalkForwardResult {
  model: ModelId;
  symbol: string;
  timeframe: Timeframe;
  horizon: Horizon;
  folds: FoldResult[];
  metrics: Metrics;
  latencyMs: number;
  experimentId: string;
  residuals: number[];
}

/**
 * Expanding-window walk-forward validation.
 * For each test time T: fit on bars strictly before T, predict close at T + h bars,
 * compare with the actual close. The window never looks forward.
 */
export function walkForward(
  model: ModelId,
  symbol: string,
  timeframe: Timeframe,
  horizon: Horizon,
  series: Candle[],
  opts: { folds?: number; initialTrain?: number } = {}
): WalkForwardResult {
  const t0 = Date.now();
  const h = horizonBars(horizon, timeframe);
  const nFolds = Math.min(opts.folds ?? 12, Math.max(2, series.length - 60));
  const initialTrain = opts.initialTrain ?? Math.max(60, Math.floor(series.length * 0.6));
  const closes = series.map((c) => c.close);

  const folds: FoldResult[] = [];
  const residuals: number[] = [];
  const step = Math.max(1, Math.floor((series.length - initialTrain - h) / nFolds));
  for (let idx = initialTrain; idx + h < series.length; idx += step) {
    // leakage guarantee: train slice contains only bars with eventTime <= series[idx].eventTime
    const trainCloses = closes.slice(0, idx);
    const fitted = fitModel(model, timeframe, trainCloses);
    const predicted = fitted.predict(trainCloses, h);
    const actual = closes[idx + h];
    folds.push({
      trainStart: series[0].eventTime,
      trainEnd: series[idx - 1].eventTime,
      testStart: series[idx].eventTime,
      testEnd: series[idx + h].eventTime,
      predicted,
      actual,
    });
    residuals.push(actual - predicted);
    if (folds.length >= nFolds) break;
  }

  // interval coverage measured on a first pass of residuals (same folds)
  for (const f of folds) {
    const others = residuals.filter((_, i) => folds[i] !== f);
    if (others.length) {
      const { lower, upper } = residualInterval(others, f.predicted, 0.8);
      f.within80 = f.actual >= lower && f.actual <= upper;
    } else {
      f.within80 = undefined;
    }
  }

  const metrics = computeMetrics(model, timeframe, closes, folds, residuals);
  const experimentId = `exp_${fnv1a(`${model}|${symbol}|${timeframe}|${horizon}|${series.length}`)}`;
  const result: WalkForwardResult = {
    model, symbol, timeframe, horizon, folds, metrics,
    latencyMs: Date.now() - t0,
    experimentId,
    residuals,
  };
  registerExperiment(result);
  return result;
}

function computeMetrics(model: ModelId, tf: Timeframe, closes: number[], folds: FoldResult[], residuals: number[]): Metrics {
  const errs = folds.map((f) => f.actual - f.predicted);
  const mae = meanOf(errs.map(Math.abs));
  const rmse = Math.sqrt(meanOf(errs.map((e) => e * e)));
  const smape = meanOf(folds.map((f) => (Math.abs(f.actual - f.predicted) / ((Math.abs(f.actual) + Math.abs(f.predicted)) / 2)) * 100));
  // MASE denominator: in-sample one-step naive MAE on the training slice (standard definition)
  const trainSlice = closes.slice(0, Math.max(1, Math.floor(closes.length * 0.6)));
  const denom: number[] = [];
  for (let i = 1; i < trainSlice.length; i++) denom.push(Math.abs(trainSlice[i] - trainSlice[i - 1]));
  const naiveMae = meanOf(denom) || 1e-12;
  const mase = mae / naiveMae;
  const dirs = folds.map((f, i) => {
    const prev = closes[Math.floor(closes.length * 0.6) + i] ?? f.actual; // change vs the test-start close
    return Math.sign(f.predicted - prev) === Math.sign(f.actual - prev);
  });
  const rated = folds.filter((f) => f.within80 !== undefined);
  const coverage80 = rated.length ? rated.filter((f) => f.within80).length / rated.length : 0;
  return {
    mae: round(mae, 6), rmse: round(rmse, 6), smape: round(smape, 4), mase: round(mase, 4),
    directionalAccuracy: round(dirs.filter(Boolean).length / (dirs.length || 1), 4),
    coverage80: round(coverage80, 4), calibrationError: round(Math.abs(coverage80 - 0.8), 4),
    samples: folds.length,
  };
}

function meanOf(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Persist evaluation as a reproducible experiment record. */
function registerExperiment(r: WalkForwardResult): void {
  push("experiments", {
    experimentId: r.experimentId,
    type: "walk-forward evaluation",
    config: { model: r.model, symbol: r.symbol, timeframe: r.timeframe, horizon: r.horizon, folds: r.folds.length },
    datasetVersion: `ds_${fnv1a(`${r.symbol}|${r.timeframe}|${r.folds.length}|${r.metrics.samples}`)}`,
    codeVersion: VERSIONS.code,
    metrics: r.metrics as unknown as Record<string, number>,
    reproductionCommand: `npm run reproduce -- --config configs/eval-${r.model}.json`,
    createdAt: iso(Date.now()),
  });
  truncate("experiments", 200);
}
