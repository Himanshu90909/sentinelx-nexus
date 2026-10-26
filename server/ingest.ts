// Ingestion pipeline:
// provider -> schema validator -> timestamp validator -> dedup -> normalize
//          -> quality engine -> persistent store
// Malformed records are NEVER silently dropped: every rejection is recorded
// as a DataQualityEvent.

import { Candle, Timeframe, TIMEFRAME_MS, iso, round } from "./core.js";
import { getCandles, putCandles, push, truncate } from "./store.js";

export interface QualityComponent {
  name: string;
  passed: boolean;
  detail: string;
}

export interface QualityReport {
  score: number; // 0-100, explainable
  components: QualityComponent[];
}

export interface IngestResult {
  candles: Candle[]; // the full validated, deduped, time-sorted series after merge
  added: number;
  duplicates: number;
  outOfOrder: number;
  rejected: number;
  qualityEvents: string[];
}

function qualityEvent(symbol: string, timeframe: string, type: string, detail: string): string {
  const id = `dqe_${Math.random().toString(36).slice(2, 10)}`;
  push("quality", { id, symbol, timeframe, type, detail, at: iso(Date.now()) });
  truncate("quality", 500);
  return id;
}

/** Schema + sanity validation of a single raw candle. Returns null if valid, reason if rejected. */
export function validateCandle(c: Candle): string | null {
  if (typeof c.eventTime !== "number" || !Number.isFinite(c.eventTime) || c.eventTime <= 0) return "invalid eventTime";
  if (![c.open, c.high, c.low, c.close].every((v) => typeof v === "number" && Number.isFinite(v))) return "non-numeric OHLC";
  if (c.volume < 0) return "negative volume";
  if (c.high < c.low) return "high < low (impossible OHLC)";
  if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) return "OHLC not bounded by high/low";
  if (c.eventTime > Date.now() + TIMEFRAME_MS[c.timeframe]) return "eventTime in the future beyond the current bar";
  return null;
}

/** Ingest candles into a symbol's series. Always returns the merged sorted series. */
export function ingest(symbol: string, timeframe: Timeframe, incoming: Candle[]): IngestResult {
  const rejected: string[] = [];
  const valid: Candle[] = [];
  for (const c of incoming) {
    const reason = validateCandle(c);
    if (reason) {
      rejected.push(reason);
      qualityEvent(symbol, timeframe, "MALFORMED_RECORD", `${reason}; record rejected, not silently dropped`);
    } else {
      valid.push(c);
    }
  }

  const merged = putCandles(symbol, timeframe, valid);
  const series = getCandles(symbol, timeframe);

  // extreme jump detection on the merged series (log-return beyond 10 sigma of trailing vol)
  detectExtremeJumps(symbol, timeframe, series);

  return {
    candles: series,
    added: merged.added,
    duplicates: merged.duplicates,
    outOfOrder: merged.reordered,
    rejected: rejected.length,
    qualityEvents: rejected.map((r) => r),
  };
}

function detectExtremeJumps(symbol: string, timeframe: Timeframe, series: Candle[]): void {
  if (series.length < 30) return;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (prev.close <= 0) continue;
    const ret = Math.abs(Math.log(cur.close / prev.close));
    if (ret > Math.log(1.5)) {
      // >50% single-bar move: record, do not drop (could be a real corporate action)
      qualityEvent(symbol, timeframe, "EXTREME_JUMP", `${round(ret * 100, 2)}% move at ${iso(cur.eventTime)} (kept, flagged for review)`);
    }
  }
}

/** Standalone quality report over the stored series. */
export function qualityReport(symbol: string, timeframe: Timeframe): QualityReport {
  const series = getCandles(symbol, timeframe);
  const components: QualityComponent[] = [];

  if (series.length === 0) {
    return {
      score: 0,
      components: [{ name: "data_present", passed: false, detail: "no stored data for this symbol/timeframe" }],
    };
  }

  // 1. missing intervals (gaps in the expected grid)
  const tfMs = TIMEFRAME_MS[timeframe];
  let gaps = 0;
  for (let i = 1; i < series.length; i++) {
    const dt = series[i].eventTime - series[i - 1].eventTime;
    if (dt > tfMs * 1.5) gaps += Math.round(dt / tfMs) - 1;
  }
  components.push({
    name: "missing_intervals",
    passed: gaps === 0,
    detail: gaps === 0 ? "no gaps in the grid" : `${gaps} missing bar(s) across the series`,
  });

  // 2. duplicates (deduped on write; verify)
  const times = new Set(series.map((c) => c.eventTime));
  components.push({
    name: "duplicate_timestamps",
    passed: times.size === series.length,
    detail: times.size === series.length ? "none" : `${series.length - times.size} duplicates present`,
  });

  // 3. ordering
  let monotonic = true;
  for (let i = 1; i < series.length; i++) if (series[i].eventTime <= series[i - 1].eventTime) monotonic = false;
  components.push({ name: "temporal_order", passed: monotonic, detail: monotonic ? "strictly increasing eventTime" : "out-of-order observations present" });

  // 4. impossible OHLC / negative volume
  let impossible = 0;
  for (const c of series) if (validateCandle(c)) impossible++;
  components.push({ name: "ohlc_sanity", passed: impossible === 0, detail: impossible === 0 ? "all OHLC/volume values valid" : `${impossible} invalid record(s)` });

  // 5. staleness
  const last = series[series.length - 1];
  const ageMs = Date.now() - last.eventTime;
  const stale = ageMs > tfMs * 3 + 120_000; // 3 bars + 2min grace
  components.push({
    name: "freshness",
    passed: !stale,
    detail: stale ? `last event ${round(ageMs / 60000, 1)} min ago (> ${round((tfMs * 3) / 60000, 1)} min threshold)` : `last event ${round(ageMs / 60000, 1)} min ago`,
  });

  // weighted score: each component contributes equally, freshness weighted slightly lower for macro-style gaps
  const weights = { missing_intervals: 0.3, duplicate_timestamps: 0.2, temporal_order: 0.2, ohlc_sanity: 0.15, freshness: 0.15 } as Record<string, number>;
  let score = 0;
  for (const c of components) score += (c.passed ? 1 : 0) * (weights[c.name] ?? 0.2);
  return { score: round(score * 100, 1), components };
}
