// Provider abstraction: base guard with caching, rate limiting, health tracking.
// All provider adapters normalize raw vendor payloads into the internal Candle
// schema. Secrets are read ONLY from server-side env, never logged, never returned.

import { Candle, DataMode, Timeframe, iso } from "../core.js";
import { providerHealth, ProviderHealthRecord } from "../store.js";

export type ProviderCode =
  | "NOT_CONFIGURED"
  | "HTTP_ERROR"
  | "RATE_LIMITED"
  | "BAD_PAYLOAD"
  | "UNSUPPORTED"
  | "TIMEOUT";

export class ProviderError extends Error {
  code: ProviderCode;
  provider: string;
  status?: number;
  constructor(provider: string, code: ProviderCode, message: string, status?: number) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

export interface MarketDataProvider {
  readonly name: string;
  readonly kinds: string[];
  readonly dataMode: DataMode;
  readonly requiredEnv: string[];
  readonly supportedTimeframes: Timeframe[];
  /** True if this provider can serve this asset class */
  supports(assetClass: string): boolean;
  getCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]>;
}

export interface FundamentalsProvider {
  readonly name: string;
  readonly dataMode: DataMode;
  readonly requiredEnv: string[];
  getFundamentals(symbol: string): Promise<{ provider: string; fields: Record<string, { value: number; asOf: string }[]> }>;
}

export interface NewsProvider {
  readonly name: string;
  readonly dataMode: DataMode;
  readonly requiredEnv: string[];
  getNews(symbol: string, limit: number): Promise<{ provider: string; items: { at: string; headline: string; source: string }[] }>;
}

// ---------------- health / cache / rate limit ----------------

interface CacheEntry { at: number; candles: Candle[]; }
const globalRef = globalThis as unknown as {
  __SN_CACHE?: Map<string, CacheEntry>;
  __SN_LASTREQ?: Map<string, number>;
};

function cache(): Map<string, CacheEntry> {
  globalRef.__SN_CACHE ??= new Map();
  return globalRef.__SN_CACHE;
}
function lastReq(): Map<string, number> {
  globalRef.__SN_LASTREQ ??= new Map();
  return globalRef.__SN_LASTREQ;
}

export function healthFor(name: string, kind: string, dataMode: DataMode, requiredEnv: string[]): ProviderHealthRecord {
  const m = providerHealth();
  let rec = m.get(name);
  if (!rec) {
    rec = {
      name,
      kind,
      configured: requiredEnv.every((k) => !!process.env[k]),
      healthy: null,
      dataMode,
      lastSuccess: null,
      lastError: null,
      latencyMs: null,
      requests: 0,
      cacheHits: 0,
      consecutiveFailures: 0,
      requiredEnv,
    };
    m.set(name, rec);
  }
  return rec;
}

export function clearHealth(name: string): void {
  providerHealth().delete(name);
}

/** Minimum spacing between provider requests (ms) to respect published free-tier limits. */
const MIN_SPACING: Record<string, number> = {
  twelvedata: 7600, // 8 req/min free tier
  finnhub: 1100, // 60 req/min free tier
  sec: 120, // 10 req/sec policy
  coingecko: 7000, // public tier ~10/min sustained
  binance: 80,
  alpaca: 200,
  polygon: 700,
  fred: 1100,
  fmp: 1300,
};

async function enforceSpacing(provider: string): Promise<void> {
  const min = MIN_SPACING[provider] ?? 500;
  const now = Date.now();
  const prev = lastReq().get(provider) ?? 0;
  const wait = prev + min - now;
  if (wait > 0) {
    if (wait > 2500) throw new ProviderError(provider, "RATE_LIMITED", "rate-limit spacing guard");
    await new Promise((r) => setTimeout(r, wait));
  }
  lastReq().set(provider, Date.now());
}

/** Cached fetch of candles. Identical historical requests within TTL are never repeated. */
export async function cachedCandles(
  key: string,
  ttlMs: number,
  load: () => Promise<Candle[]>
): Promise<{ candles: Candle[]; cacheHit: boolean }> {
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    const rec = [...providerHealth().values()].find((r) => key.startsWith(r.name)) as ProviderHealthRecord | undefined;
    if (rec) rec.cacheHits++;
    return { candles: hit.candles, cacheHit: true };
  }
  const candles = await load();
  cache().set(key, { at: Date.now(), candles });
  return { candles, cacheHit: false };
}

/** Guarded fetch: timeout, one retry with backoff, 429 handling, health recording. */
export async function guardedFetch(
  providerName: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<unknown> {
  const rec = [...providerHealth().values()].find((r) => r.name === providerName);
  if (rec) rec.requests++;
  await enforceSpacing(providerName);
  const doFetch = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 429) throw new ProviderError(providerName, "RATE_LIMITED", "provider returned 429", 429);
      if (!res.ok) throw new ProviderError(providerName, "HTTP_ERROR", `HTTP ${res.status}`, res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };
  const t0 = Date.now();
  try {
    let json: unknown;
    try {
      json = await doFetch();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      // one retry with backoff on network errors / aborts
      await new Promise((r) => setTimeout(r, 1200));
      json = await doFetch();
    }
    if (rec) {
      rec.latencyMs = Date.now() - t0;
      rec.lastSuccess = iso(Date.now());
      rec.lastError = null;
      rec.consecutiveFailures = 0;
      rec.healthy = true;
    }
    return json;
  } catch (e) {
    if (rec) {
      rec.latencyMs = Date.now() - t0;
      rec.lastError = `${e instanceof Error ? e.message : String(e)} @ ${iso(Date.now())}`;
      rec.consecutiveFailures++;
      if (rec.consecutiveFailures >= 3) rec.healthy = false;
    }
    throw e;
  }
}

export function barTtl(timeframe: Timeframe): number {
  // shorter timeframes change faster; never hammer providers
  const t: Record<string, number> = { "1m": 15_000, "5m": 30_000, "15m": 60_000, "1h": 120_000, "4h": 300_000, "1d": 900_000, "7d": 900_000 };
  return t[timeframe] ?? 60_000;
}

/** Build a normalized candle; ingestion time is stamped at the moment WE receive it. */
export function mkCandle(
  symbol: string,
  timeframe: Timeframe,
  eventTime: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
  provider: string,
  source: string
): Candle {
  return { symbol, timeframe, eventTime, ingestionTime: Date.now(), open: o, high: h, low: l, close: c, volume: v, provider, source };
}
