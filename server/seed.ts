// Instrument universe seeding + provider-free synthetic fallback.
// The universe is DYNAMIC: admins add symbols at runtime. The seed list is a
// representative research universe, not a hard-coded limit.

import { AssetClass, DataMode, Instrument, Timeframe, Candle, iso } from "./core.js";
import { instruments, getCandles, putCandles } from "./store.js";
import { generateSynthetic } from "./synthetic.js";

export const SEED_UNIVERSE: Instrument[] = [
  ...["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "JPM", "XOM"].map((s) => ({
    id: `ins_${s}`, symbol: s, name: s, assetClass: "EQUITY" as AssetClass, market: "NASDAQ/NYSE",
    dataMode: "SYNTHETIC" as DataMode, active: true, source: "seed", addedAt: iso(Date.now()),
  })),
  ...["SPY", "QQQ"].map((s) => ({
    id: `ins_${s}`, symbol: s, name: s, assetClass: "ETF" as AssetClass, market: "NYSE ARCA",
    dataMode: "SYNTHETIC" as DataMode, active: true, source: "seed", addedAt: iso(Date.now()),
  })),
  { id: "ins_BTCUSDT", symbol: "BTCUSDT", name: "Bitcoin", assetClass: "CRYPTO", market: "BINANCE", dataMode: "LIVE", active: true, source: "seed", addedAt: iso(Date.now()) },
  { id: "ins_ETHUSDT", symbol: "ETHUSDT", name: "Ethereum", assetClass: "CRYPTO", market: "BINANCE", dataMode: "LIVE", active: true, source: "seed", addedAt: iso(Date.now()) },
  { id: "ins_DGS10", symbol: "DGS10", name: "10-Year Treasury Constant Maturity (FRED)", assetClass: "MACRO", market: "FRED", dataMode: "HISTORICAL", active: true, source: "seed", addedAt: iso(Date.now()) },
  { id: "ins_VIXCLS", symbol: "VIXCLS", name: "CBOE Volatility Index VIX (FRED)", assetClass: "MACRO", market: "FRED", dataMode: "HISTORICAL", active: true, source: "seed", addedAt: iso(Date.now()) },
];

export function ensureSeeded(): void {
  const m = instruments();
  for (const i of SEED_UNIVERSE) if (!m.has(i.symbol)) m.set(i.symbol, i);
}

export function addInstrument(symbol: string, assetClass: AssetClass, market?: string): Instrument | { error: string } {
  const m = instruments();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) return { error: "invalid symbol" };
  if (m.has(symbol)) return { error: "already exists" };
  const ins: Instrument = {
    id: `ins_${symbol}`, symbol, name: symbol, assetClass, market: market ?? "UNKNOWN",
    dataMode: "SYNTHETIC", active: true, source: "admin", addedAt: iso(Date.now()),
  };
  m.set(symbol, ins);
  return ins;
}

/**
 * SYNTHETIC FALLBACK (default ON, can be disabled with SYNTHETIC_FALLBACK=false):
 * when no provider is configured for an instrument's asset class, we generate a
 * clearly-labeled synthetic series so the ML pipeline can be exercised end-to-end.
 * Synthetic data is NEVER presented as market data: dataMode=SYNTHETIC everywhere.
 */
export function syntheticFallback(symbol: string, timeframe: Timeframe, bars: number): Candle[] {
  const existing = getCandles(symbol, timeframe);
  if (existing.length >= bars) return existing.slice(-bars);
  const spec = syntheticSpecFor(symbol, timeframe, bars);
  const { candles } = generateSynthetic(spec);
  putCandles(symbol, timeframe, candles);
  return getCandles(symbol, timeframe).slice(-bars);
}

export function syntheticSpecFor(symbol: string, timeframe: Timeframe, bars: number) {
  // per-symbol deterministic seeds so the universe is varied but reproducible
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    symbol,
    timeframe,
    bars,
    seed: h,
    startPrice: 40 + (h % 500) + 20,
    trendPerBar: 0.01 + ((h >> 3) % 5) / 100,
    volPerBar: 0.4 + ((h >> 5) % 12) / 10,
    seasonality: { period: 24, amplitudePct: (h % 30) / 20 },
    regimeShifts: 2,
    gaps: 1,
    outliers: 2,
    structuralBreak: { atBarPct: 0.55 + ((h >> 7) % 30) / 100, levelShiftPct: 3 + (h % 8) },
  };
}

export function syntheticEnabled(): boolean {
  return process.env.SYNTHETIC_FALLBACK !== "false";
}

export const HORIZONS_SUPPORTED = ["5m", "15m", "1h", "4h", "1d", "7d"] as const;
