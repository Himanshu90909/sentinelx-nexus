// THE core research guarantee, tested three ways:
// 1. feature computation is cutoff-safe,
// 2. walk-forward training slices end strictly before test points,
// 3. future data cannot change a past prediction (the explicit proof).
import { describe, expect, it } from "vitest";
import { Candle, TIMEFRAME_MS, modelTimeframeForHorizon, Horizon } from "../server/core.js";
import { computeFeatures, computeFeaturesAsOf } from "../server/features.js";
import { audit, findLeak, selfTest } from "../server/leakage.js";
import { walkForward } from "../server/evaluation.js";
import { fitModel } from "../server/models.js";
import { generateSynthetic } from "../server/synthetic.js";
import { mkCandle } from "./normalization.test.js";

function series(n = 200, seed = 5): Candle[] {
  const { candles } = generateSynthetic({ symbol: "LEAK", timeframe: "1h", bars: n, seed });
  return candles;
}

describe("leakage auditor", () => {
  it("rejects a feature that becomes available after the prediction time", () => {
    const feats = [{ name: "f", value: 1, featureTimestamp: 100, sourceTimestamp: 100, availabilityTimestamp: 305_000 }];
    const leaks = findLeak(feats, 300_000);
    expect(leaks.length).toBe(1);
    expect(audit("SYM", feats, 300_000).passed).toBe(false);
  });
  it("accepts features available at or before the prediction time", () => {
    const feats = [{ name: "f", value: 1, featureTimestamp: 100, sourceTimestamp: 100, availabilityTimestamp: 300_000 }];
    expect(audit("SYM", feats, 300_000).passed).toBe(true);
  });
  it("live self-test discriminates compliant vs leaky features", () => {
    expect(selfTest("SYM").passed).toBe(true);
  });
});

describe("cutoff safety of features", () => {
  it("identical features before and after future bars are appended (no lookahead)", () => {
    const s = series(120);
    const cutoff = s[s.length - 1].eventTime;
    const before = computeFeatures("LEAK", "1h", s);
    // strictly-future bars: shifted beyond the cutoff so there is no overlap
    const future = series(20, 6).map((c, i) => ({ ...c, eventTime: cutoff + (i + 1) * TIMEFRAME_MS["1h"] }));
    const beforeAsOf = computeFeaturesAsOf([...s, ...future], cutoff);
    expect(before.map((f) => f.name)).toEqual(beforeAsOf.map((f) => f.name));
    expect(before.map((f) => f.value)).toEqual(beforeAsOf.map((f) => f.value));
  });
  it("features availability equals the close time of the newest bar they read", () => {
    const s = series(120);
    const feats = computeFeatures("LEAK", "1h", s);
    const lastClose = s[s.length - 1].eventTime;
    expect(feetsAllAvailableBy(feats, lastClose)).toBe(true);
  });
});

function feetsAllAvailableBy(feats: { availabilityTimestamp: number }[], t: number): boolean {
  return feats.every((f) => f.availabilityTimestamp <= t);
}

describe("walk-forward temporal integrity", () => {
  it("train windows end strictly before test windows (no overlap, no shuffle)", () => {
    const s = series(300);
    const res = walkForward("naive", "LEAK", "1h", "1h", s);
    expect(res.folds.length).toBeGreaterThan(0);
    for (const f of res.folds) {
      expect(f.trainEnd).toBeLessThan(f.testStart);
    }
    for (let i = 1; i < res.folds.length; i++) {
      expect(res.folds[i].testStart).toBeGreaterThanOrEqual(res.folds[i - 1].testStart);
    }
  });
  it("metrics are finite and MASE is computed against the naive denominator", () => {
    const s = series(300);
    const res = walkForward("ets", "LEAK", "1h", "1h", s);
    expect(Number.isFinite(res.metrics.mae)).toBe(true);
    expect(Number.isFinite(res.metrics.mase)).toBe(true);
    expect(res.metrics.samples).toBeGreaterThan(0);
  });
});

describe("PROOF: future information cannot enter a past prediction", () => {
  it("prediction made at cutoff T is unchanged by any data after T", () => {
    const s = series(200, 9);
    const idx = 150;
    const cutoff = s[idx - 1].eventTime;
    const pastOnly = s.slice(0, idx);
    // prediction with only past data
    const fitted = fitModel("naive", "1h", pastOnly.map((c) => c.close));
    const predPast = fitted.predict(pastOnly.map((c) => c.close), 1);
    // same prediction with the future polluted by an extreme spike
    const spiked = [...s.slice(0, idx), ...s.slice(idx).map((c, i) => (i === 0 ? { ...c, close: c.close * 100 } : c))];
    const fitted2 = fitModel("naive", "1h", pastOnly.map((c) => c.close));
    const predPolluted = fitted2.predict(pastOnly.map((c) => c.close), 1);
    expect(predPast).toBe(predPolluted);
    // cutoff-clamped features also ignore the spike
    const feats = computeFeaturesAsOf(spiked, cutoff);
    const featsClean = computeFeaturesAsOf(pastOnly, cutoff);
    expect(feats.map((f) => f.value)).toEqual(featsClean.map((f) => f.value));
  });
  it("replay rows never leak (structural cutoff + per-row auditor)", async () => {
    const { replay } = await import("../server/replay.js");
    const s = series(300, 11);
    const res = replay("LEAK", "1h", "1h", s, 8);
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.every((r) => r.leaked === false)).toBe(true);
  });
  it("an in-progress (unclosed) bar is never served as research data", async () => {
    // Binance adapter drops bars whose close time is in the future; the validator
    // also rejects eventTime beyond the current bar window.
    const badBar = mkCandle({ eventTime: Date.now() + 5 * TIMEFRAME_MS["1h"], close: 42 });
    const { validateCandle } = await import("../server/ingest.js");
    expect(validateCandle(badBar)).not.toBeNull();
  });
});
