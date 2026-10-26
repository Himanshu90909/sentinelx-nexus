// Market regime detection with explainable drivers.
// States: TRENDING_UP, TRENDING_DOWN, MEAN_REVERTING, HIGH_VOLATILITY,
//          LOW_VOLATILITY, LIQUIDITY_STRESS, DISTRIBUTION_SHIFT, UNKNOWN

import { Candle, round } from "./core.js";
import { ema, returns } from "./features.js";
import { push, truncate, list } from "./store.js";

export type Regime =
  | "TRENDING_UP" | "TRENDING_DOWN" | "MEAN_REVERTING"
  | "HIGH_VOLATILITY" | "LOW_VOLATILITY" | "LIQUIDITY_STRESS"
  | "DISTRIBUTION_SHIFT" | "UNKNOWN";

export interface RegimeAssessment {
  regime: Regime;
  confidence: number; // 0-1, how strongly the drivers agree
  drivers: { name: string; value: number; contribution: string }[];
}

function percentileOf(value: number, reference: number[]): number {
  const sorted = [...reference].sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) if (v <= value) below++;
  return below / sorted.length;
}

function lag1Autocorr(xs: number[]): number {
  if (xs.length < 20) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) den += (xs[i] - m) ** 2;
  for (let i = 1; i < xs.length; i++) num += (xs[i] - m) * (xs[i - 1] - m);
  return den === 0 ? 0 : num / den;
}

/** Assess the current regime from the series. All drivers are explainable and returned. */
export function assessRegime(symbol: string, series: Candle[]): RegimeAssessment {
  if (series.length < 60) {
    return { regime: "UNKNOWN", confidence: 0, drivers: [{ name: "insufficient_history", value: series.length, contribution: "need >= 60 closed bars" }] };
  }
  const closes = series.map((c) => c.close);
  const rets = returns(closes);
  const recentVol = stdOfNum(rets.slice(-20));
  const refVols: number[] = [];
  for (let i = 40; i < rets.length - 20; i += 20) refVols.push(stdOfNum(rets.slice(i - 20, i)));
  const volPct = refVols.length >= 3 ? percentileOf(recentVol, refVols) : 0.5;

  const ema10 = ema(closes.slice(-40), 10);
  const ema40 = ema(closes.slice(-40), 40);
  const vol = recentVol || 1e-9;
  const trendZ = (ema10 - ema40) / (closes[closes.length - 1] * vol * Math.sqrt(10) + 1e-12);
  const ac = lag1Autocorr(rets.slice(-60));
  const volRatio = refVols.length ? recentVol / (mean(refVols) || 1e-12) : 1;

  // volume stress proxy: recent volume collapse vs trailing average
  const vols = series.slice(-20).map((c) => c.volume);
  const refV = series.slice(-60, -20).map((c) => c.volume);
  const volCollapse = refV.length && mean(refV) > 0 ? mean(vols) / mean(refV) : 1;

  const drivers = [
    { name: "realized_vol_20", value: round(recentVol, 6), contribution: "20-bar return std" },
    { name: "vol_percentile", value: round(volPct, 3), contribution: "recent vol vs trailing distribution" },
    { name: "trend_z", value: round(trendZ, 3), contribution: "(EMA10 - EMA40) / (price * vol)" },
    { name: "lag1_autocorr", value: round(ac, 3), contribution: "mean reversion (<0) vs momentum (>0)" },
    { name: "volume_ratio_20_60", value: round(volCollapse, 3), contribution: "liquidity proxy" },
  ];

  let regime: Regime = "UNKNOWN";
  let confidence = 0;
  if (volPct >= 0.95 && volRatio > 2.5) {
    regime = "LIQUIDITY_STRESS";
    confidence = clamp01((volPct - 0.9) * 5) * 0.7 + clamp01((volRatio - 2) / 2) * 0.3;
  } else if (volPct >= 0.8) {
    regime = "HIGH_VOLATILITY";
    confidence = clamp01((volPct - 0.8) * 5);
  } else if (volPct <= 0.2) {
    regime = "LOW_VOLATILITY";
    confidence = clamp01((0.2 - volPct) * 5);
  } else if (Math.abs(trendZ) > 0.5 && ac >= 0) {
    regime = trendZ > 0 ? "TRENDING_UP" : "TRENDING_DOWN";
    confidence = clamp01(Math.abs(trendZ) / 2);
  } else if (ac < -0.15) {
    regime = "MEAN_REVERTING";
    confidence = clamp01(-ac * 3);
  } else {
    regime = "UNKNOWN";
    confidence = 0.3;
  }

  // persist regime history (dedup consecutive identical regimes)
  const history = list<{ symbol: string; regime: string }>("regimes");
  const lastRec = [...history].reverse().find((r) => r.symbol === symbol);
  if (!lastRec || lastRec.regime !== regime) {
    push("regimes", { id: `reg_${Math.random().toString(36).slice(2, 10)}`, symbol, regime, confidence, at: Date.now() });
    truncate("regimes", 1000);
  }
  return { regime, confidence: round(confidence, 3), drivers };
}

function stdOfNum(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function regimeHistory(symbol: string, limit = 50) {
  return list<{ symbol: string; regime: string; at: number; confidence: number }>("regimes")
    .filter((r) => r.symbol === symbol)
    .slice(-limit)
    .reverse();
}
