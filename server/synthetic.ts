// Synthetic data generator for pipeline testing and provider-free demos.
// Deterministic by seed. ALWAYS labeled SYNTHETIC (provider="synthetic").
// Injects, optionally: trend, seasonality, regime shifts (vol changes),
// gaps (missing bars), outliers, and a structural break.

import { Candle, Timeframe, TIMEFRAME_MS, gaussian } from "./core.js";
import { mulberry32 } from "./core.js";

export interface SyntheticSpec {
  symbol: string;
  timeframe: Timeframe;
  bars: number;
  seed?: number;
  startPrice?: number;
  trendPerBar?: number; // drift in %/bar
  seasonality?: { period: number; amplitudePct: number } | null;
  volPerBar?: number; // %/bar
  regimeShifts?: number; // how many vol-regime shifts to inject
  gaps?: number; // number of bars to delete
  outliers?: number; // number of extreme bars
  structuralBreak?: { atBarPct: number; levelShiftPct: number } | null;
}

export function generateSynthetic(spec: SyntheticSpec): { candles: Candle[]; injected: Record<string, unknown> } {
  const seed = spec.seed ?? 42;
  const rng = mulberry32(seed);
  const tf = spec.timeframe;
  const n = Math.max(60, spec.bars);
  const start = Date.now() - n * TIMEFRAME_MS[tf];
  let price = spec.startPrice ?? 100;
  const baseVol = spec.volPerBar ?? 1; // percent per bar
  const injected: Record<string, unknown> = { seed, bars: n, baseVolPct: baseVol, trendPerBar: spec.trendPerBar ?? 0.02 };

  // vol regimes
  const shifts: number[] = [];
  let vol = baseVol;
  if (spec.regimeShifts) {
    for (let i = 0; i < spec.regimeShifts; i++) {
      const at = Math.floor((rng() * 0.8 + 0.1) * n);
      shifts.push(at);
      vol = baseVol * (rng() < 0.5 ? 0.4 : 2.5); // calm <-> stressed regime
    }
    injected.regimeShiftsAtBars = shifts;
  }

  const raw: (Candle | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (shifts.includes(i)) vol = baseVol * (rng() < 0.5 ? 0.4 : 2.5);
    let ret = (spec.trendPerBar ?? 0) / 100 + (gaussian(rng) * vol) / 100;
    if (spec.seasonality) {
      ret += (spec.seasonality.amplitudePct / 100) * Math.sin((2 * Math.PI * i) / spec.seasonality.period);
    }
    if (spec.structuralBreak && i === Math.floor(spec.structuralBreak.atBarPct * n)) {
      price *= 1 + spec.structuralBreak.levelShiftPct / 100;
      injected.structuralBreakAtBar = i;
    }
    price *= 1 + ret;
    const open = price * (1 - (gaussian(rng) * vol) / 400);
    const close = price;
    const hi = Math.max(open, close) * (1 + Math.abs(gaussian(rng)) * vol / 300);
    const lo = Math.min(open, close) * (1 - Math.abs(gaussian(rng)) * vol / 300);
    const volume = Math.round(1000 * (0.5 + rng()) * (1 + Math.abs(ret) * 10));
    raw.push({ symbol: spec.symbol, timeframe: tf, eventTime: start + (i + 1) * TIMEFRAME_MS[tf], ingestionTime: Date.now(), open: round6(open), high: round6(hi), low: round6(lo), close: round6(close), volume, provider: "synthetic", source: "synthetic-seed-" + seed });
  }

  let final = raw;
  if (spec.outliers) {
    const copy = [...final];
    for (let i = 0; i < spec.outliers; i++) {
      const at = Math.floor(rng() * copy.length);
      const c = copy[at];
      if (c) copy[at] = { ...c, close: round6(c.close * (1 + (rng() < 0.5 ? -1 : 1) * 0.12)) };
    }
    injected.outliers = spec.outliers;
    final = copy;
  }
  if (spec.gaps) {
    const copy = [...final];
    for (let i = 0; i < spec.gaps; i++) {
      const at = Math.floor(rng() * copy.length);
      copy[at] = null;
    }
    injected.gaps = spec.gaps;
    final = copy;
  }
  return { candles: final.filter(Boolean) as Candle[], injected };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
