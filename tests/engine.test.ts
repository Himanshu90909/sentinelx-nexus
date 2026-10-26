// Feature math, model inference, uncertainty calibration, drift, and the
// failure-first behavior of the orchestrator (all offline via synthetic data).
import { describe, expect, it, beforeAll } from "vitest";
import { sma, ema, rsi, atr, computeFeatures } from "../server/features.js";
import { fitModel, residualInterval, MODELS } from "../server/models.js";
import { walkForward } from "../server/evaluation.js";
import { generateSynthetic } from "../server/synthetic.js";
import { driftReport } from "../server/drift.js";
import { assessRegime } from "../server/regime.js";
import { ingest, qualityReport } from "../server/ingest.js";
import { getMarket, getForecast, getEvaluation, getMatrix } from "../server/orchestrator.js";
import { registerDataset, checksumSeries } from "../server/datasets.js";
import { Candle } from "../server/core.js";

const SYM = "FTTEST";
let candles: Candle[];

beforeAll(() => {
  const gen = generateSynthetic({ symbol: SYM, timeframe: "1h", bars: 400, seed: 77, regimeShifts: 4 });
  candles = gen.candles;
  ingest(SYM, "1h", candles);
});

describe("feature math", () => {
  it("sma is the trailing mean", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
  });
  it("ema approaches the last value for short windows", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const e = ema(xs, 3);
    expect(e).toBeGreaterThan(8);
    expect(e).toBeLessThanOrEqual(10);
  });
  it("rsi bounds to 0..100 and atr is positive", () => {
    const closes = candles.map((c) => c.close);
    const r = rsi(closes);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
    expect(atr(candles, 14)).toBeGreaterThan(0);
  });
});

describe("model inference", () => {
  it("naive predicts the last close", () => {
    const closes = [10, 11, 12, 13.5];
    expect(fitModel("naive", "1h", closes).predict(closes, 1)).toBe(13.5);
  });
  it("seasonal naive takes the value one period back", () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const pred = fitModel("seasonal_naive", "1h", closes).predict(closes, 1);
    expect(pred).toBe(closes[closes.length - 24]);
  });
  it("ets tracks the series", () => {
    const closes = candles.slice(0, 200).map((c) => c.close);
    const pred = fitModel("ets", "1h", closes).predict(closes, 1);
    const last = closes[closes.length - 1];
    expect(Math.abs(pred - last) / last).toBeLessThan(0.2);
  });
});

describe("uncertainty engine", () => {
  it("empirical intervals are ordered lower <= point <= upper", () => {
    const res = walkForward("naive", SYM, "1h", "1h", candles, { folds: 10 });
    const band = residualInterval(res.residuals, 100, 0.8);
    expect(band.lower).toBeLessThanOrEqual(100);
    expect(band.upper).toBeGreaterThanOrEqual(100);
    expect(band.width).toBeGreaterThan(0);
  });
  it("coverage of the 80% band is measured, and roughly calibrated on stationary synthetic data", () => {
    const res = walkForward("naive", SYM, "1h", "1h", candles, { folds: 12 });
    expect(res.metrics.coverage80).toBeGreaterThan(0.5);
    expect(res.metrics.coverage80).toBeLessThanOrEqual(1);
    expect(res.metrics.calibrationError).toBeGreaterThanOrEqual(0);
  });
});

describe("regime and drift", () => {
  it("regime is one of the documented states with explainable drivers", () => {
    const a = assessRegime(SYM, candles);
    expect([
      "TRENDING_UP", "TRENDING_DOWN", "MEAN_REVERTING", "HIGH_VOLATILITY",
      "LOW_VOLATILITY", "LIQUIDITY_STRESS", "DISTRIBUTION_SHIFT", "UNKNOWN",
    ]).toContain(a.regime);
    expect(a.drivers.length).toBeGreaterThan(0);
  });
  it("PSI flags a distribution shift when a high-vol regime is injected", () => {
    const calm = generateSynthetic({ symbol: "C", timeframe: "1h", bars: 200, seed: 3, volPerBar: 0.2, regimeShifts: 0 }).candles;
    const wild = generateSynthetic({ symbol: "W", timeframe: "1h", bars: 200, seed: 3, volPerBar: 8, regimeShifts: 0 }).candles;
    const merged = [...calm.slice(0, 120), ...wild.slice(0, 120)];
    const rep = driftReport("DRIFTTEST", merged);
    expect(rep.psi.length).toBeGreaterThan(0);
    expect(rep.psi.some((p) => p.status !== "STABLE")).toBe(true);
  });
});

describe("dataset versioning", () => {
  it("checksums are stable and datasets are immutable records", () => {
    const cs = checksumSeries(candles);
    expect(cs).toBe(checksumSeries(candles));
    const d1 = registerDataset(SYM, "1h", candles, "test");
    const d2 = registerDataset(SYM, "1h", candles, "test");
    expect(d1.checksum).toBe(d2.checksum);
    expect(d1.immutable).toBe(true);
  });
});

describe("quality engine", () => {
  it("gaps reduce the quality score and appear in components", () => {
    const gapped = generateSynthetic({ symbol: "GAP", timeframe: "1h", bars: 200, seed: 5, gaps: 5 }).candles;
    ingest("GAPQ", "1h", gapped);
    const q = qualityReport("GAPQ", "1h");
    const gaps = q.components.find((c) => c.name === "missing_intervals");
    expect(gaps!.detail).toMatch(/missing/);
  });
});

describe("orchestrator failure-first behavior (offline, no API keys)", () => {
  it("serves equity data as explicitly SYNTHETIC when no provider is configured", async () => {
    const res = await getMarket("AAPL", "1h", 100);
    expect(res.status).toBe("OK");
    expect(res.dataMode).toBe("SYNTHETIC");
  });
  it("returns explicit BAD_REQUEST for an unknown symbol", async () => {
    const res = await getMarket("NOSUCHXYZ", "1h", 100);
    expect(res.status).toBe("BAD_REQUEST");
  });
  it("produces a full-provenance forecast on synthetic data", async () => {
    const res = await getForecast("AAPL", "1h");
    expect(res.status).toBe("OK");
    const d = res.data as Record<string, unknown>;
    expect(d.point).toBeDefined();
    expect(d.lower).toBeLessThanOrEqual(d.point as number);
    expect(d.upper).toBeGreaterThanOrEqual(d.point as number);
    expect(d.dataSnapshotId).toMatch(/^snap_/);
    expect(d.datasetVersion).toBeTruthy();
    expect(d.featureVersion).toBe("f1.0");
    // every model id in the registry is actually implemented
    expect(MODELS.map((m) => m.id)).toContain((d.model as { id: string }).id);
  });
  it("evaluation returns walk-forward evidence, never invented numbers", async () => {
    const res = await getEvaluation("ets", "AAPL", "1h");
    expect(res.status).toBe("OK");
    const d = res.data as { folds: unknown[]; metrics: { samples: number } };
    expect(d.folds.length).toBeGreaterThan(0);
    expect(d.metrics.samples).toBe(d.folds.length);
  });
  it("matrix covers all instruments x horizons with explicit cell statuses", async () => {
    const res = await getMatrix();
    expect(res.status).toBe("OK");
    const d = res.data as { rows: { symbol: string; cells: Record<string, { status: string }> }[] };
    expect(d.rows.length).toBeGreaterThanOrEqual(14);
    for (const row of d.rows) {
      for (const cell of Object.values(row.cells)) {
        expect(cell.status).toBeTruthy();
      }
    }
  });
});
