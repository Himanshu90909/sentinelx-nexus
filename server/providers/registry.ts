// Provider registry: fallback chains, provider health snapshots, routing by asset class.
// Provider switches are recorded (ProviderHealth + a quality event), never mixed silently.

import { AssetClass, Candle, DataMode, Timeframe, ApiStatus, iso } from "../core.js";
import { ProviderError } from "./base.js";
import { MARKET_PROVIDERS } from "./market.js";
import { fred, secEdgar, fmp, finnhubNews } from "./research.js";
import { getCandles, putCandles, push, truncate, providerHealth } from "../store.js";
import { ingest } from "../ingest.js";

// Priority-ordered fallback chains per asset class.
const CHAINS: Record<AssetClass, { provider: string; timeframes?: Timeframe[] }[]> = {
  CRYPTO: [{ provider: "binance" }, { provider: "kraken" }, { provider: "coingecko", timeframes: ["1d"] }],
  EQUITY: [{ provider: "polygon" }, { provider: "finnhub" }, { provider: "twelvedata" }, { provider: "alpaca" }],
  ETF: [{ provider: "polygon" }, { provider: "finnhub" }, { provider: "twelvedata" }, { provider: "alpaca" }],
  INDEX: [{ provider: "polygon" }, { provider: "finnhub" }, { provider: "twelvedata" }],
  FOREX: [{ provider: "twelvedata" }, { provider: "finnhub" }],
  COMMODITY: [{ provider: "twelvedata" }],
  MACRO: [{ provider: "fred" }],
};

export function providersFor(assetClass: AssetClass) {
  const chain = CHAINS[assetClass] ?? [];
  const all = [...MARKET_PROVIDERS, fred as never] as { name: string; requiredEnv: string[]; dataMode: DataMode; kinds: string[] | undefined; supports: (a: string) => boolean }[];
  return chain
    .map((c) => all.find((p) => p.name === c.provider))
    .filter((p): p is NonNullable<typeof p> => !!p);
}

export interface MarketFetchResult {
  status: ApiStatus;
  reason?: string;
  candles: Candle[];
  provider: string | null;
  dataMode: DataMode;
  switchedFrom: string[];
}

/**
 * Fetch market data with failover. Tries each configured provider in the chain,
 * records switches, and ingests successful results through the quality pipeline.
 */
export async function fetchMarketData(
  symbol: string,
  assetClass: AssetClass,
  timeframe: Timeframe,
  bars: number
): Promise<MarketFetchResult> {
  const switchedFrom: string[] = [];
  for (const prov of providersFor(assetClass)) {
    const configured = prov.requiredEnv.every((k) => !!process.env[k]);
    if (!configured) {
      switchedFrom.push(prov.name);
      continue;
    }
    try {
      const candles = await (prov as unknown as { getCandles(s: string, t: Timeframe, b: number): Promise<Candle[]> }).getCandles(symbol, timeframe, bars);
      const ingestRes = ingest(symbol, timeframe, candles); // validate, dedup, quality-check, persist
      return {
        status: "OK",
        candles: ingestRes.candles,
        provider: prov.name,
        dataMode: (prov as unknown as { dataMode: DataMode }).dataMode,
        switchedFrom,
      };
    } catch (e) {
      const pe = e instanceof ProviderError ? e : null;
      const msg = pe ? `${pe.code}: ${pe.message}` : String(e);
      switchedFrom.push(prov.name);
      push("quality", { id: `dqe_${Date.now()}_${switchedFrom.length}`, symbol, timeframe, type: "PROVIDER_FAIL", detail: `${prov.name} -> ${msg}`, at: iso(Date.now()) });
      truncate("quality", 500);
      if (pe && pe.code === "RATE_LIMITED") {
        continue; // try next provider
      }
      continue;
    }
  }
  return {
    status: assetClass === "MACRO" ? "NOT_CONFIGURED" : "DATA_UNAVAILABLE",
    reason:
      assetClass === "MACRO"
        ? "No macro provider configured. Set FRED_API_KEY to enable macroeconomic series."
        : `All providers in the ${assetClass} chain are unconfigured or failing. See /api/providers.`,
    candles: [],
    provider: null,
    dataMode: "SYNTHETIC",
    switchedFrom,
  };
}

/** Health snapshot for the admin/provider-health page. */
export function providerSnapshot() {
  ensureHealthRecords();
  return [...providerHealth().values()].map((r) => ({
    name: r.name,
    kind: r.kind,
    configured: r.configured,
    healthy: r.healthy,
    dataMode: r.dataMode,
    lastSuccess: r.lastSuccess,
    lastError: r.lastError,
    latencyMs: r.latencyMs,
    requests: r.requests,
    cacheHitRate: r.requests + r.cacheHits > 0 ? r.cacheHits / (r.requests + r.cacheHits) : 0,
    requiredEnv: r.requiredEnv,
  }));
}

function ensureHealthRecords(): void {
  const health = providerHealth();
  const known: { name: string; kind: string; mode: DataMode; env: string[] }[] = [
    { name: "binance", kind: "CRYPTO/LIVE (public)", mode: "LIVE", env: [] },
    { name: "kraken", kind: "CRYPTO/LIVE (public)", mode: "LIVE", env: [] },
    { name: "coingecko", kind: "CRYPTO (public, delayed)", mode: "DELAYED", env: [] },
    { name: "finnhub", kind: "EQUITY/NEWS", mode: "DELAYED", env: ["FINNHUB_API_KEY"] },
    { name: "twelvedata", kind: "EQUITY/FOREX", mode: "DELAYED", env: ["TWELVE_DATA_API_KEY"] },
    { name: "alpaca", kind: "EQUITY (IEX, 15m delayed)", mode: "DELAYED", env: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"] },
    { name: "polygon", kind: "EQUITY/INDEX", mode: (process.env.POLYGON_DATA_MODE as DataMode) || "DELAYED", env: ["POLYGON_API_KEY"] },
    { name: "fred", kind: "MACRO", mode: "HISTORICAL", env: ["FRED_API_KEY"] },
    { name: "sec", kind: "FUNDAMENTALS (public)", mode: "HISTORICAL", env: [] },
    { name: "fmp", kind: "FUNDAMENTALS", mode: "HISTORICAL", env: ["FMP_API_KEY"] },
  ];
  for (const k of known) {
    if (!health.has(k.name)) {
      health.set(k.name, {
        name: k.name, kind: k.kind, configured: k.env.every((e) => !!process.env[e]), healthy: null,
        dataMode: k.mode, lastSuccess: null, lastError: null, latencyMs: null, requests: 0, cacheHits: 0,
        consecutiveFailures: 0, requiredEnv: k.env,
      });
    }
  }
}

export { secEdgar, fmp, finnhubNews };
