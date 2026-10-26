// Orchestrator: high-level operations backing every API route.
// Failure-first: any break in the chain returns an explicit status, never a
// fabricated forecast.

import {
  ApiResult, AssetClass, Candle, DataMode, Horizon, Instrument, MATRIX_HORIZONS,
  Timeframe, HORIZON_MS, TIMEFRAME_MS, VERSIONS, modelTimeframeForHorizon,
  horizonBars, iso, round, isTimeframe, isHorizon, fnv1a,
} from "./core.js";
import { instruments, getCandles, ForecastRecord } from "./store.js";
import { fetchMarketData } from "./providers/registry.js";
import { qualityReport } from "./ingest.js";
import { computeFeatures, FEATURE_VERSION } from "./features.js";
import { audit, selfTest, leakageEvents } from "./leakage.js";
import { assessRegime, regimeHistory } from "./regime.js";
import { MODELS } from "./models.js";
import { walkForward } from "./evaluation.js";
import { route } from "./router.js";
import { driftReport } from "./drift.js";
import { replay } from "./replay.js";
import { registerDataset, datasetsFor } from "./datasets.js";
import { recordForecast, resolveActuals, forecastHistory } from "./audit.js";
import { ensureSeeded, syntheticFallback, syntheticEnabled, addInstrument } from "./seed.js";
import { list } from "./store.js";
import { latencySnapshot } from "./metrics.js";

const globalRef = globalThis as unknown as { __SN_BOOT?: string };
globalRef.__SN_BOOT ??= iso(Date.now());

function ok<T>(data: T, dataMode?: DataMode, provider?: string): ApiResult<T> {
  return { status: "OK", data, dataMode, provider, generatedAt: iso(Date.now()) };
}
function fail<T>(status: ApiResult<T>["status"], reason: string): ApiResult<T> {
  return { status, reason, generatedAt: iso(Date.now()) };
}

export function getInstrument(symbol: string): Instrument | null {
  ensureSeeded();
  return instruments().get(symbol.toUpperCase()) ?? null;
}

// ---------------- market data ----------------

export async function getMarket(symbol: string, timeframeStr: string, bars: number): Promise<ApiResult<unknown>> {
  if (!isTimeframe(timeframeStr)) return fail("BAD_REQUEST", `unsupported timeframe ${timeframeStr}`);
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", `unknown symbol ${symbol}`);
  const fetchRes = await fetchMarketData(ins.symbol, ins.assetClass, timeframeStr, bars);
  let candles = fetchRes.candles;
  let dataMode = fetchRes.dataMode;
  let provider = fetchRes.provider ?? "none";

  if (fetchRes.status !== "OK") {
    if (syntheticEnabled()) {
      candles = syntheticFallback(ins.symbol, timeframeStr, bars);
      dataMode = "SYNTHETIC";
      provider = "synthetic";
    } else {
      return fail(fetchRes.status, fetchRes.reason ?? "no data");
    }
  }
  if (candles.length < 10) return fail("DATA_UNAVAILABLE", "provider returned too few bars");

  const q = qualityReport(ins.symbol, timeframeStr);
  const last = candles[candles.length - 1];
  const stale = Date.now() - last.eventTime > TIMEFRAME_MS[timeframeStr] * 3 + 120_000;
  if (dataMode !== "SYNTHETIC" && stale && q.score < 60) {
    return fail("STALE_DATA", `last closed bar is ${round((Date.now() - last.eventTime) / 60000, 1)} min old; refusing to serve as fresh`);
  }
  return ok({
    symbol: ins.symbol,
    timeframe: timeframeStr,
    candles: candles.slice(-bars).map((c) => ({ t: c.eventTime, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })),
    quality: q,
    freshness: { lastEvent: iso(last.eventTime), ageSeconds: Math.round((Date.now() - last.eventTime) / 1000), stale },
  }, dataMode, provider);
}

// ---------------- features ----------------

export async function getFeatures(symbol: string, timeframeStr: string): Promise<ApiResult<unknown>> {
  if (!isTimeframe(timeframeStr)) return fail("BAD_REQUEST", `unsupported timeframe`);
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", `unknown symbol`);
  const market = await getMarket(symbol, timeframeStr, 200);
  if (market.status !== "OK") return market;
  const candles = getCandles(ins.symbol, timeframeStr).slice(-200);
  const features = computeFeatures(ins.symbol, timeframeStr, candles);
  if (!features.length) return fail("INSUFFICIENT_HISTORY", "need >= 30 closed bars for a feature vector");
  return ok({ symbol: ins.symbol, timeframe: timeframeStr, featureVersion: FEATURE_VERSION, features }, market.dataMode, market.provider);
}

// ---------------- forecast ----------------

export async function getForecast(symbol: string, horizonStr: string): Promise<ApiResult<unknown>> {
  if (!isHorizon(horizonStr)) return fail("BAD_REQUEST", `unsupported horizon ${horizonStr}`);
  const horizon = horizonStr as Horizon;
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", `unknown symbol`);
  const tf = modelTimeframeForHorizon(horizon);
  const market = await getMarket(symbol, tf, 300);
  if (market.status !== "OK") return market;
  const candles = getCandles(ins.symbol, tf).slice(-300);
  if (candles.length < 80) return fail("INSUFFICIENT_HISTORY", `need >= 80 closed bars on ${tf} (have ${candles.length})`);

  const t0 = Date.now();
  const regime = assessRegime(ins.symbol, candles);
  const decision = route(ins.symbol, tf, horizon, candles, regime);
  const features = computeFeatures(ins.symbol, tf, candles);

  // LEAKAGE SELF-AUDIT: features available only at/after 'now' -> reject.
  const leakAudit = audit(ins.symbol, features, Date.now(), null);
  if (!leakAudit.passed) {
    return fail("LEAKAGE_DETECTED", "feature availability audit failed; forecast withheld");
  }

  // fit selected model on all visible bars and predict h bars ahead
  const closes = candles.map((c) => c.close);
  const h = horizonBars(horizon, tf);
  const { fitModel } = await import("./models.js");
  const fitted = fitModel(decision.selected, tf, closes);
  const point = fitted.predict(closes, h);

  // interval from walk-forward residuals of the selected model
  const wf = walkForward(decision.selected, ins.symbol, tf, horizon, candles, { folds: 10 });
  const { residualInterval } = await import("./models.js");
  const band = residualInterval(wf.residuals, point, 0.8);
  const calibrationScore = round(Math.max(0, 1 - wf.metrics.calibrationError * 2), 3);

  const dataset = registerDataset(ins.symbol, tf, candles, market.provider ?? "unknown");
  const rec = recordForecast({
    symbol: ins.symbol, horizon, madeAt: Date.now(), targetTime: candles[candles.length - 1].eventTime + HORIZON_MS[horizon],
    point: round(point, 6), lower: round(band.lower, 6), upper: round(band.upper, 6),
    model: decision.selected, modelVersion: `${decision.selected}@${VERSIONS.code}`,
    regime: regime.regime, dataMode: market.dataMode ?? "SYNTHETIC",
    dataSnapshotId: `snap_${fnv1a(candles.map((c) => c.eventTime).join(","))}`,
    featureVersion: FEATURE_VERSION, datasetVersion: dataset.version, codeVersion: VERSIONS.code,
    latencyMs: Date.now() - t0,
  } as Omit<ForecastRecord, "id">);

  resolveActuals(ins.symbol, horizon, candles);

  return ok({
    predictionId: rec.id,
    symbol: ins.symbol,
    horizon,
    madeAt: iso(rec.madeAt),
    targetTime: iso(rec.targetTime),
    point: rec.point,
    lower: rec.lower,
    upper: rec.upper,
    intervalWidth: round(rec.upper - rec.lower, 6),
    confidence: decision.confidence,
    calibrationScore,
    coverage80Measured: wf.metrics.coverage80,
    model: { id: decision.selected, version: rec.modelVersion },
    router: { reason: decision.reason, fallbackModel: decision.fallback, evidence: decision.evidence },
    regime: { state: regime.regime, confidence: regime.confidence, drivers: regime.drivers },
    dataSnapshotId: rec.dataSnapshotId,
    featureVersion: rec.featureVersion,
    datasetVersion: rec.datasetVersion,
    codeVersion: rec.codeVersion,
    latencyMs: rec.latencyMs,
    intervalNote: "80% empirical interval from walk-forward residuals; coverage is measured, not assumed.",
  }, market.dataMode, market.provider);
}

export function getForecastHistory(symbol: string, horizonStr: string | null): ApiResult<unknown> {
  const h = horizonStr && isHorizon(horizonStr) ? (horizonStr as Horizon) : null;
  return ok({ forecasts: forecastHistory(symbol.toUpperCase(), h) });
}

// ---------------- matrix / regime / drift / quality ----------------

export async function getMatrix(): Promise<ApiResult<unknown>> {
  ensureSeeded();
  const rows: unknown[] = [];
  for (const ins of [...instruments().values()].filter((i) => i.active)) {
    const cells: Record<string, unknown> = {};
    for (const h of MATRIX_HORIZONS) {
      const f = await getForecast(ins.symbol, h);
      cells[h] = f.status === "OK"
        ? {
            status: "OK",
            point: (f.data as { point: number }).point,
            lower: (f.data as { lower: number }).lower,
            upper: (f.data as { upper: number }).upper,
            model: (f.data as { model: { id: string } }).model.id,
            regime: (f.data as { regime: { state: string } }).regime.state,
            dataMode: f.dataMode,
          }
        : { status: f.status, reason: f.reason };
    }
    const tf = "1h";
    const candles = getCandles(ins.symbol, tf);
    rows.push({
      symbol: ins.symbol,
      assetClass: ins.assetClass,
      dataMode: cells[MATRIX_HORIZONS[2]] && (cells[MATRIX_HORIZONS[2]] as { status: string }).status === "OK" ? (cells[MATRIX_HORIZONS[2]] as { dataMode: string }).dataMode : "SYNTHETIC",
      regime: (cells[MATRIX_HORIZONS[2]] as { regime?: string }).regime ?? "UNKNOWN",
      freshnessAgeSeconds: candles.length ? Math.round((Date.now() - candles[candles.length - 1].eventTime) / 1000) : null,
      cells,
    });
  }
  return ok({ horizons: MATRIX_HORIZONS, rows });
}

export async function getRegime(symbol: string): Promise<ApiResult<unknown>> {
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", "unknown symbol");
  const market = await getMarket(symbol, "1h", 300);
  if (market.status !== "OK") return market;
  const candles = getCandles(ins.symbol, "1h").slice(-300);
  const a = assessRegime(ins.symbol, candles);
  return ok({
    symbol: ins.symbol,
    regime: a.regime,
    since: regimeHistory(ins.symbol, 1)[0] ? iso(regimeHistory(ins.symbol, 1)[0].at) : iso(Date.now()),
    confidence: a.confidence,
    drivers: a.drivers,
    history: regimeHistory(ins.symbol, 50).map((r) => ({ t: iso(r.at), regime: r.regime, confidence: r.confidence })),
  }, market.dataMode, market.provider);
}

export async function getDrift(symbol: string): Promise<ApiResult<unknown>> {
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", "unknown symbol");
  const market = await getMarket(symbol, "1h", 300);
  if (market.status !== "OK") return market;
  const candles = getCandles(ins.symbol, "1h").slice(-300);
  const rep = driftReport(ins.symbol, candles);
  return ok({ symbol: ins.symbol, ...rep, note: "Drift raises monitoring and marks models for re-evaluation; it never auto-replaces a production model." }, market.dataMode, market.provider);
}

export async function getDataQuality(symbol: string, timeframeStr: string): Promise<ApiResult<unknown>> {
  if (!isTimeframe(timeframeStr)) return fail("BAD_REQUEST", "unsupported timeframe");
  const market = await getMarket(symbol, timeframeStr, 300);
  if (market.status !== "OK" && market.status !== "STALE_DATA") return market;
  const q = qualityReport(symbol.toUpperCase(), timeframeStr);
  const events = list<{ symbol: string; at: string; type: string; detail: string }>("quality")
    .filter((e) => e.symbol === symbol.toUpperCase()).slice(-30).reverse();
  return ok({ score: q.score, components: q.components, events }, market.dataMode, market.provider);
}

export async function getLeakageReport(symbol: string): Promise<ApiResult<unknown>> {
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", "unknown symbol");
  return ok({
    symbol: ins.symbol,
    events: leakageEvents(ins.symbol),
    selfTest: selfTest(ins.symbol),
    rule: "A feature may only be used if availability_timestamp <= prediction_timestamp.",
  });
}

// ---------------- evaluation / models / experiments ----------------

export async function getEvaluation(model: string, symbol: string, horizonStr: string, timeframeStr?: string): Promise<ApiResult<unknown>> {
  if (!MODELS.find((m) => m.id === model)) return fail("BAD_REQUEST", `unknown model ${model}`);
  if (!isHorizon(horizonStr)) return fail("BAD_REQUEST", "unsupported horizon");
  const horizon = horizonStr as Horizon;
  const tf = timeframeStr && isTimeframe(timeframeStr) ? (timeframeStr as Timeframe) : modelTimeframeForHorizon(horizon);
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", "unknown symbol");
  const market = await getMarket(symbol, tf, 400);
  if (market.status !== "OK") return market;
  const candles = getCandles(ins.symbol, tf).slice(-400);
  if (candles.length < 80) return fail("INSUFFICIENT_HISTORY", `need >= 80 bars (have ${candles.length})`);
  const res = walkForward(model as never, ins.symbol, tf, horizon, candles);
  const dataset = registerDataset(ins.symbol, tf, candles, market.provider ?? "unknown");
  return ok({
    model, symbol: ins.symbol, timeframe: tf, horizon,
    folds: res.folds.map((f) => ({ trainStart: iso(f.trainStart), trainEnd: iso(f.trainEnd), testStart: iso(f.testStart), testEnd: iso(f.testEnd), predicted: round(f.predicted, 6), actual: round(f.actual, 6), within80: f.within80 })),
    metrics: res.metrics,
    latencyMs: res.latencyMs,
    experimentId: res.experimentId,
    datasetVersion: dataset.version,
    codeVersion: VERSIONS.code,
    reproductionCommand: `npm run reproduce -- --config configs/eval-${model}.json`,
  }, market.dataMode, market.provider);
}

export function getModels(): ApiResult<unknown> {
  return ok({
    models: MODELS.map((m) => ({ ...m })),
    note: "Tree/Deep/Foundation models are not implemented natively; they plug in via an external ModelServiceAdapter when MODEL_SERVICE_URL is configured. No unimplemented model is advertised as available.",
  });
}

export function getExperiments(): ApiResult<unknown> {
  return ok({ experiments: [...list<Record<string, unknown>>("experiments")].slice(-100).reverse() });
}

export function getDatasets(symbol?: string): ApiResult<unknown> {
  return ok({ versions: datasetsFor(symbol?.toUpperCase()).slice(-100).reverse() });
}

// ---------------- replay ----------------

export async function getReplay(symbol: string, horizonStr: string, steps: number): Promise<ApiResult<unknown>> {
  if (!isHorizon(horizonStr)) return fail("BAD_REQUEST", "unsupported horizon");
  const horizon = horizonStr as Horizon;
  const tf = modelTimeframeForHorizon(horizon);
  const ins = getInstrument(symbol);
  if (!ins) return fail("BAD_REQUEST", "unknown symbol");
  const market = await getMarket(symbol, tf, 400);
  if (market.status !== "OK") return market;
  const candles = getCandles(ins.symbol, tf).slice(-400);
  const res = replay(ins.symbol, tf, horizon, candles, Math.min(Math.max(steps, 1), 24));
  return ok({ ...res, rows: res.rows.map((r) => ({ ...r, replayTime: iso(r.replayTime) })) }, market.dataMode, market.provider);
}

// ---------------- instruments / admin ----------------

export function getInstruments(): ApiResult<unknown> {
  ensureSeeded();
  return ok({ instruments: [...instruments().values()].map((i) => ({ ...i })) });
}

export function adminAddInstrument(symbol: string, assetClass: AssetClass, market?: string): ApiResult<unknown> {
  const res = addInstrument(symbol.toUpperCase(), assetClass, market);
  if ("error" in res) return fail("BAD_REQUEST", res.error);
  return ok({ instrument: res });
}

/**
 * Retraining gate (admin). A candidate is only VALIDATED if it beats the
 * production model on walk-forward validation; promotion is a separate,
 * explicit step. Lower training loss alone never promotes anything.
 */
export async function adminRetrain(symbol: string, horizonStr: string): Promise<ApiResult<unknown>> {
  if (!isHorizon(horizonStr)) return fail("BAD_REQUEST", "unsupported horizon");
  const horizon = horizonStr as Horizon;
  const tf = modelTimeframeForHorizon(horizon);
  const market = await getMarket(symbol, tf, 400);
  if (market.status !== "OK") return market;
  const candles = getCandles(symbol.toUpperCase(), tf).slice(-400);
  if (candles.length < 80) return fail("INSUFFICIENT_HISTORY", "insufficient history for validation");
  const candidate = walkForward("ets", symbol.toUpperCase(), tf, horizon, candles);
  const production = walkForward("naive", symbol.toUpperCase(), tf, horizon, candles);
  const better = candidate.metrics.smape < production.metrics.smape;
  return ok({
    result: better ? "VALIDATED" : "REJECTED",
    reason: better
      ? "Candidate (ETS) beat the production baseline on walk-forward validation sMAPE; eligible for promotion review."
      : "Candidate did NOT beat the production baseline on walk-forward validation; rejected by the gate. Lower training loss alone never promotes a model.",
    gate: "walk-forward benchmark vs production baseline (naive)",
    candidateMetrics: candidate.metrics,
    productionMetrics: production.metrics,
    note: "Promotion to PRODUCTION is a separate explicit admin action; this gate only validates candidacy.",
  }, market.dataMode, market.provider);
}

// ---------------- system ----------------

export function getHealth(): ApiResult<unknown> {
  ensureSeeded();
  const instanceId = fnv1a(`${Date.now()}|${process.pid ?? 0}`).slice(0, 8);
  const anyLive = [...instruments().values()].some((i) => i.dataMode === "LIVE");
  return ok({
    service: "sentinelx-nexus",
    version: VERSIONS.code,
    uptimeSeconds: Math.round((Date.now() - Date.parse(globalRef.__SN_BOOT!)) / 1000),
    instanceId,
    dataModeBanner: anyLive ? "MIXED: LIVE crypto (Binance) + labeled data for other classes" : "SYNTHETIC / HISTORICAL: no live equity provider configured",
    disclaimer: "Research and ML engineering platform. Not investment advice.",
  });
}

export function metricsLatency(): ApiResult<unknown> {
  return ok({ samples: latencySnapshot(), note: "Measured server-side around each handler; no estimates." });
}
