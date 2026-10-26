// Dataset versioning: immutable, reproducible snapshots of a symbol/timeframe
// series with checksums. A dataset version can be described fully by its
// metadata and rebuilt from the provider + parameters.

import { Candle, Timeframe, fnv1a, iso, VERSIONS } from "./core.js";
import { push, truncate, list } from "./store.js";

export interface DatasetVersion {
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

/** Canonical serialization for checksumming: stable field order, rounded floats. */
export function checksumSeries(series: Candle[]): string {
  const canon = series
    .map((c) => `${c.eventTime}:${c.open.toFixed(6)},${c.high.toFixed(6)},${c.low.toFixed(6)},${c.close.toFixed(6)},${c.volume.toFixed(2)}`)
    .join("|");
  return fnv1a(canon);
}

/** Register an immutable dataset version (duplicate checksum returns the existing record). */
export function registerDataset(symbol: string, timeframe: Timeframe, series: Candle[], provider: string): DatasetVersion {
  if (!series.length) throw new Error("empty series");
  const checksum = checksumSeries(series);
  const existing = list<DatasetVersion>("datasets").find((d) => d.checksum === checksum && d.timeframe === timeframe);
  if (existing) return existing;
  const rec: DatasetVersion = {
    datasetId: `ds_${fnv1a(`${symbol}|${timeframe}`)}`,
    version: `${series.length}-${series[series.length - 1].eventTime}`,
    symbols: [symbol],
    rangeStart: series[0].eventTime,
    rangeEnd: series[series.length - 1].eventTime,
    featureVersion: VERSIONS.features,
    preprocessingVersion: VERSIONS.preprocessing,
    provider,
    timeframe,
    barCount: series.length,
    checksum,
    createdAt: iso(Date.now()),
    immutable: true,
  };
  push("datasets", rec);
  truncate("datasets", 200);
  return rec;
}

export function datasetsFor(symbol?: string) {
  const all = list<DatasetVersion>("datasets");
  return symbol ? all.filter((d) => d.symbols.includes(symbol)) : all;
}
