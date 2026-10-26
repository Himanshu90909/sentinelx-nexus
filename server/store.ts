// Storage layer.
//
// HONESTY NOTE: on Vercel serverless, each instance keeps state in memory only.
// This Store interface documents the persistence contract; the default
// InMemoryStore is process-local. Durable storage = implement the same
// interface against Postgres (see sql/schema.sql) and set STORE_DRIVER=postgres.
// We do not pretend ephemeral serverless memory is a database.

import { Candle, Instrument } from "./core.js";

export interface LeakageEvent {
  id: string;
  symbol: string;
  feature: string;
  predictionTime: number;
  sourceTime: number;
  availabilityTime: number;
  severity: "HIGH" | "MEDIUM";
  experimentId: string | null;
  at: string;
}

export interface DataQualityEvent {
  id: string;
  symbol: string;
  timeframe: string;
  type: string;
  detail: string;
  at: string;
}

export interface DriftEventRecord {
  id: string;
  symbol: string;
  type: string;
  detail: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  at: string;
}

export interface RegimeRecord {
  id: string;
  symbol: string;
  regime: string;
  confidence: number;
  at: number;
}

export interface ForecastRecord {
  id: string;
  symbol: string;
  horizon: string;
  madeAt: number;
  targetTime: number;
  point: number;
  lower: number;
  upper: number;
  model: string;
  modelVersion: string;
  regime: string;
  dataMode: string;
  dataSnapshotId: string;
  featureVersion: string;
  datasetVersion: string;
  codeVersion: string;
  latencyMs: number;
  // resolution
  actual?: number;
  error?: number;
  resolved?: boolean;
  evaluationTime?: number;
}

export interface ExperimentRecord {
  experimentId: string;
  type: string;
  config: Record<string, unknown>;
  datasetVersion: string;
  codeVersion: string;
  metrics: Record<string, number> | null;
  reproductionCommand: string;
  createdAt: string;
}

export interface DatasetVersionRecord {
  datasetId: string;
  version: string;
  symbols: string[];
  rangeStart: number;
  rangeEnd: number;
  featureVersion: string;
  preprocessingVersion: string;
  provider: string;
  timeframe: string;
  barCount: number;
  checksum: string;
  createdAt: string;
  immutable: true;
}

export interface ProviderHealthRecord {
  name: string;
  kind: string;
  configured: boolean;
  healthy: boolean | null;
  dataMode: string;
  lastSuccess: string | null;
  lastError: string | null;
  latencyMs: number | null;
  requests: number;
  cacheHits: number;
  consecutiveFailures: number;
  requiredEnv: string[];
}

interface Collections {
  candles: Map<string, Map<string, Candle>>; // symbol -> timeframe key -> latest candle (dedup by eventTime)
  candleSeries: Map<string, Candle[]>; // symbol|timeframe -> sorted candles
  instruments: Map<string, Instrument>;
  leakage: LeakageEvent[];
  quality: DataQualityEvent[];
  drift: DriftEventRecord[];
  regimes: RegimeRecord[];
  forecasts: ForecastRecord[];
  experiments: ExperimentRecord[];
  datasets: DatasetVersionRecord[];
  providers: Map<string, ProviderHealthRecord>;
}

const globalRef = globalThis as unknown as { __SN_STORE?: Collections };

function collections(): Collections {
  if (!globalRef.__SN_STORE) {
    globalRef.__SN_STORE = {
      candles: new Map(),
      candleSeries: new Map(),
      instruments: new Map(),
      leakage: [],
      quality: [],
      drift: [],
      regimes: [],
      forecasts: [],
      experiments: [],
      datasets: [],
      providers: new Map(),
    };
  }
  return globalRef.__SN_STORE;
}

// candle series helpers -------------------------------------------------

export function seriesKey(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

export function getCandles(symbol: string, timeframe: string): Candle[] {
  return collections().candleSeries.get(seriesKey(symbol, timeframe)) ?? [];
}

/** Insert candles; validates ordering on insert and keeps the series strictly time-sorted and deduped. */
export function putCandles(symbol: string, timeframe: string, incoming: Candle[]): { added: number; duplicates: number; reordered: number } {
  const c = collections();
  const key = seriesKey(symbol, timeframe);
  const existing = c.candleSeries.get(key) ?? [];
  const byTime = new Map<number, Candle>();
  for (const k of existing) byTime.set(k.eventTime, k);
  let duplicates = 0;
  for (const k of incoming) {
    if (byTime.has(k.eventTime)) {
      duplicates++;
      continue;
    }
    byTime.set(k.eventTime, k);
  }
  const before = existing.map((x) => x.eventTime).join(",");
  const merged = [...byTime.values()].sort((a, b) => a.eventTime - b.eventTime);
  const after = merged.map((x) => x.eventTime).join(",");
  const reordered = merged.length === existing.length && before !== after ? 1 : 0;
  c.candleSeries.set(key, merged);
  return { added: merged.length - existing.length, duplicates, reordered };
}

// generic list/put helpers ------------------------------------------------

export function list<T>(name: keyof Collections): T[] {
  return collections()[name] as unknown as T[];
}

export function push<T>(name: "leakage" | "quality" | "drift" | "regimes" | "forecasts" | "experiments" | "datasets", item: T): void {
  (collections()[name] as unknown as T[]).push(item);
}

export function truncate(name: "leakage" | "quality" | "drift" | "regimes" | "forecasts" | "experiments" | "datasets", max: number): void {
  const arr = collections()[name] as unknown as unknown[];
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function instruments(): Map<string, Instrument> {
  return collections().instruments;
}

export function providerHealth(): Map<string, ProviderHealthRecord> {
  return collections().providers;
}

export function storeDriverInfo(): { driver: string; durable: boolean } {
  const driver = process.env.STORE_DRIVER ?? "memory";
  return { driver: driver === "postgres" ? "postgres" : "memory", durable: driver === "postgres" };
}
