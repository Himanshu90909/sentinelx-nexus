// SENTINELX NEXUS - core types, time handling, and numeric utilities.
// Pure, dependency-free. Everything here is deterministic and testable.

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "7d";
export type Horizon = "5m" | "15m" | "1h" | "4h" | "1d" | "7d";
export type AssetClass = "EQUITY" | "ETF" | "INDEX" | "CRYPTO" | "FOREX" | "COMMODITY" | "MACRO";
export type DataMode = "LIVE" | "DELAYED" | "HISTORICAL" | "SYNTHETIC";
export type MarketDataKind = "MARKET" | "HISTORICAL" | "STREAMING" | "FUNDAMENTALS" | "MACRO" | "NEWS" | "CRYPTO";

export type FailureStatus =
  | "DATA_UNAVAILABLE"
  | "STALE_DATA"
  | "MODEL_UNAVAILABLE"
  | "INSUFFICIENT_HISTORY"
  | "LEAKAGE_DETECTED"
  | "PROVIDER_RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "BAD_REQUEST";

export type ApiStatus = "OK" | FailureStatus;

export interface ApiResult<T> {
  status: ApiStatus;
  data?: T;
  reason?: string;
  dataMode?: DataMode;
  provider?: string;
  generatedAt: string;
}

export interface Candle {
  symbol: string;
  timeframe: Timeframe;
  eventTime: number; // when the bar closed in the market (ms epoch)
  ingestionTime: number; // when we received it (ms epoch) - kept separate, critical for leakage safety
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  source: string;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  market: string;
  dataMode: DataMode;
  active: boolean;
  source: string; // who added it
  addedAt: string;
}

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "7d": 604_800_000,
};

export const HORIZON_MS: Record<Horizon, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "7d": 604_800_000,
};

export const ALL_HORIZONS: Horizon[] = ["5m", "15m", "1h", "4h", "1d", "7d"];
export const MATRIX_HORIZONS: Horizon[] = ["5m", "15m", "1h", "4h", "1d"];

export function isTimeframe(s: string): s is Timeframe {
  return s in TIMEFRAME_MS;
}
export function isHorizon(s: string): s is Horizon {
  return s in HORIZON_MS;
}

// A horizon's forecast target must land on a bar boundary of the timeframe we model on.
export function modelTimeframeForHorizon(h: Horizon): Timeframe {
  const map: Record<Horizon, Timeframe> = {
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "1h",
    "1d": "1d",
    "7d": "1d",
  };
  return map[h];
}

export function horizonBars(h: Horizon, tf: Timeframe): number {
  return Math.max(1, Math.round(HORIZON_MS[h] / TIMEFRAME_MS[tf]));
}

// ---------- numeric utilities ----------

export function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/** Empirical quantile (linear interpolation, type 7). */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function round(x: number, digits = 4): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

/** Deterministic 32-bit string hash (FNV-1a) for dataset checksums. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic PRNG (mulberry32) so synthetic data & experiments are reproducible by seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal sample from a uniform RNG. */
export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function iso(t: number): string {
  return new Date(t).toISOString();
}

/** Safe integer id. */
let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export const VERSIONS = {
  code: "v1.0.0",
  features: "f1.0",
  preprocessing: "p1.0",
} as const;
