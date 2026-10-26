// Dynamic model router.
// Selection is based on MEASURED recent walk-forward performance, conditioned
// on the current regime when sample size permits - never on arbitrary rules,
// never on a single test set. All evidence numbers are computed at request time.

import { Candle, Horizon, Timeframe, round } from "./core.js";
import { MODELS, ModelId } from "./models.js";
import { walkForward } from "./evaluation.js";
import { assessRegime, RegimeAssessment } from "./regime.js";

export interface RouterEvidence {
  candidates: { model: ModelId; smape: number; mase: number; folds: number }[];
  regime: string;
  regimeMatchedFolds: number;
  method: string;
}

export interface RouterDecision {
  selected: ModelId;
  fallback: ModelId;
  reason: string;
  confidence: number;
  evidence: RouterEvidence;
}

/**
 * Route: evaluate every candidate with walk-forward on the recent series,
 * prefer the best sMAPE measured on folds whose regime matched the current one.
 */
export function route(symbol: string, timeframe: Timeframe, horizon: Horizon, series: Candle[], regime: RegimeAssessment): RouterDecision {
  const candidates = MODELS.map((m) => m.id);
  const evals = candidates.map((id) => ({ id, res: walkForward(id, symbol, timeframe, horizon, series, { folds: 10 }) }));

  // regime-conditioned scores: keep folds whose local regime matches the current regime
  const scored = evals.map(({ id, res }) => {
    const matched = res.folds.map((f) => ({ f, r: foldRegime(series, f) }));
    const inRegime = matched.filter((m) => m.r.regime === regime.regime);
    const smape = inRegime.length >= 3
      ? meanSmape(inRegime.map((m) => m.f))
      : res.metrics.smape; // not enough regime-matched folds: use overall recent walk-forward
    return { model: id, smape, mase: res.metrics.mase, folds: res.folds.length, matched: inRegime.length };
  }).filter((s) => Number.isFinite(s.smape));

  scored.sort((a, b) => a.smape - b.smape);
  const best = scored[0];
  const fallback = scored.find((s) => s.model === "naive") ?? scored[scored.length - 1];
  const spread = scored.length > 1 ? scored[scored.length - 1].smape - best.smape : 0;
  const confidence = round(Math.max(0.2, Math.min(0.95, 0.5 + spread * 0.04)), 3);

  return {
    selected: best.model,
    fallback: fallback.model,
    reason:
      best.matched >= 3
        ? `best recent walk-forward sMAPE (${round(best.smape, 2)}) among ${scored.length} candidates on folds matching regime ${regime.regime}`
        : `best recent walk-forward sMAPE (${round(best.smape, 2)}) among ${scored.length} candidates (too few regime-matched folds for full conditioning; overall recent evidence used)`,
    confidence,
    evidence: {
      candidates: scored.map((s) => ({ model: s.model, smape: round(s.smape, 3), mase: s.mase, folds: s.folds })),
      regime: regime.regime,
      regimeMatchedFolds: best.matched,
      method: "expanding-window walk-forward on the trailing series, per-fold regime conditioning",
    },
  };
}

/** Local regime at a fold's test time - computed on data strictly before the test point. */
function foldRegime(series: Candle[], f: { testStart: number }): RegimeAssessment {
  const visible = series.filter((c) => c.eventTime <= f.testStart);
  return assessRegime("router", visible.slice(-120));
}

function meanSmape(folds: { predicted: number; actual: number }[]): number {
  if (!folds.length) return NaN;
  return folds.reduce((a, f) => a + (Math.abs(f.actual - f.predicted) / ((Math.abs(f.actual) + Math.abs(f.predicted)) / 2)) * 100, 0) / folds.length;
}
