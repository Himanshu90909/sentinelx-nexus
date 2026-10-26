// Prediction audit trail. Every forecast is stored with the full provenance
// needed to answer: "What information did the model have when it made this
// prediction?" Later, actuals resolve the record with error + evaluation time.

import { Candle, HORIZON_MS, Horizon, iso, round } from "./core.js";
import { ForecastRecord, push, truncate, list } from "./store.js";

export function recordForecast(rec: Omit<ForecastRecord, "id">): ForecastRecord {
  const full: ForecastRecord = { id: `pred_${Math.random().toString(36).slice(2, 12)}`, ...rec };
  push("forecasts", full);
  truncate("forecasts", 500);
  return full;
}

/** Resolve forecast records whose target time has passed, using actual closes. */
export function resolveActuals(symbol: string, horizon: Horizon, series: Candle[]): { resolved: number } {
  let resolved = 0;
  for (const f of list<ForecastRecord>("forecasts")) {
    if (f.symbol !== symbol || f.horizon !== horizon || f.resolved) continue;
    if (f.targetTime > series[series.length - 1].eventTime) continue;
    const actual = series.find((c) => c.eventTime >= f.targetTime);
    if (!actual) continue;
    f.actual = actual.close;
    f.error = actual.close - f.point;
    f.resolved = true;
    f.evaluationTime = Date.now();
    resolved++;
  }
  return { resolved };
}

export function forecastHistory(symbol: string, horizon: Horizon | null, limit = 50) {
  return list<ForecastRecord>("forecasts")
    .filter((f) => f.symbol === symbol && (horizon === null || f.horizon === horizon))
    .slice(-limit)
    .reverse()
    .map((f) => ({
      predictionId: f.id,
      symbol: f.symbol,
      horizon: f.horizon,
      predictionTimestamp: iso(f.madeAt),
      targetTime: iso(f.targetTime),
      point: f.point,
      lower: f.lower,
      upper: f.upper,
      model: f.model,
      modelVersion: f.modelVersion,
      regime: f.regime,
      dataMode: f.dataMode,
      dataSnapshotId: f.dataSnapshotId,
      featureVersion: f.featureVersion,
      datasetVersion: f.datasetVersion,
      codeVersion: f.codeVersion,
      latencyMs: f.latencyMs,
      actual: f.actual ?? null,
      error: f.error !== undefined ? round(f.error, 6) : null,
      resolved: f.resolved ?? false,
      evaluationTimestamp: f.evaluationTime ? iso(f.evaluationTime) : null,
    }));
}
