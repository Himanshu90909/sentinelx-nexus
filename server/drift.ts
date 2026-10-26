// Concept drift engine: PSI (population stability index) on feature
// distributions + residual drift. Creates DriftEvents, never auto-replaces a
// production model: it raises monitoring level and marks affected models.

import { Candle, round, iso } from "./core.js";
import { returns } from "./features.js";
import { push, truncate, list } from "./store.js";

export interface PsiItem { feature: string; psi: number; status: "STABLE" | "WARNING" | "DRIFT"; }

function psi(recent: number[], reference: number[], bins = 10): number {
  if (recent.length < 10 || reference.length < 10) return 0;
  const lo = Math.min(...reference, ...recent);
  const hi = Math.max(...reference, ...recent);
  if (hi === lo) return 0;
  const edges = Array.from({ length: bins - 1 }, (_, i) => lo + ((hi - lo) * (i + 1)) / bins);
  const bucket = (v: number) => {
    let b = 0;
    for (const e of edges) if (v > e) b++;
    return b;
  };
  const countsR = new Array(bins).fill(0);
  const countsA = new Array(bins).fill(0);
  for (const v of reference) countsR[bucket(v)]++;
  for (const v of recent) countsA[bucket(v)]++;
  let psiTotal = 0;
  for (let i = 0; i < bins; i++) {
    const pr = (countsR[i] + 1e-9) / (reference.length + bins * 1e-9);
    const pa = (countsA[i] + 1e-9) / (recent.length + bins * 1e-9);
    psiTotal += (pa - pr) * Math.log(pa / pr);
  }
  return psiTotal;
}

export interface DriftReport {
  psi: PsiItem[];
  events: { at: string; type: string; detail: string; severity: string }[];
  monitoringLevel: "NORMAL" | "ELEVATED";
}

export function driftReport(symbol: string, series: Candle[]): DriftReport {
  const items: PsiItem[] = [];
  if (series.length >= 120) {
    const rets = returns(series.map((c) => c.close));
    const recent = rets.slice(-40);
    const reference = rets.slice(-120, -40);
    const retPsi = psi(recent, reference);
    items.push({ feature: "return_distribution", psi: round(retPsi, 4), status: threshold(retPsi) });

    const vols = series.map((c) => c.volume);
    const vPsi = psi(vols.slice(-40), vols.slice(-120, -40));
    items.push({ feature: "volume_distribution", psi: round(vPsi, 4), status: threshold(vPsi) });

    // rolling vol level drift
    const rollVol = (window: number[]): number => {
      const m = window.reduce((a, b) => a + b, 0) / (window.length || 1);
      return Math.sqrt(window.reduce((a, b) => a + (b - m) ** 2, 0) / (window.length || 1));
    };
    const volPsi = psi([rollVol(recent)], reference.map((_, i) => rollVol(rets.slice(Math.max(0, i - 20), i + 1))).filter((v, i, a) => Number.isFinite(v) && a.indexOf(v) === i));
    if (Number.isFinite(volPsi)) items.push({ feature: "volatility_level", psi: round(volPsi, 4), status: threshold(volPsi) });
  }

  for (const it of items) {
    if (it.status !== "STABLE") {
      push("drift", {
        id: `drift_${Math.random().toString(36).slice(2, 10)}`,
        symbol,
        type: "DISTRIBUTION_DRIFT",
        detail: `${it.feature}: PSI=${it.psi} (${it.status}). Monitoring elevated; affected models marked for re-evaluation.`,
        severity: it.status === "DRIFT" ? "CRITICAL" : "WARNING",
        at: iso(Date.now()),
      });
      truncate("drift", 500);
    }
  }

  const events = list<{ symbol: string; at: string; type: string; detail: string; severity: string }>("drift")
    .filter((e) => e.symbol === symbol)
    .slice(-30)
    .reverse();

  const elevated = items.some((i) => i.status !== "STABLE");
  return { psi: items, events, monitoringLevel: elevated ? "ELEVATED" : "NORMAL" };
}

function threshold(p: number): "STABLE" | "WARNING" | "DRIFT" {
  if (p > 0.25) return "DRIFT";
  if (p > 0.1) return "WARNING";
  return "STABLE";
}
