// Kraken public REST adapter (LIVE crypto OHLC, no key required).
// Added because api.binance.com is geo-blocked (HTTP 451) from US serverless
// regions; Kraken's public feed serves closed candles from anywhere and is
// used as the primary-or-fallback LIVE crypto source.

import { Candle, Timeframe } from "../core.js";
import { cachedCandles, guardedFetch, MarketDataProvider, barTtl, ProviderError, mkCandle } from "./base.js";

const KRAKEN_TF: Record<Timeframe, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440, "7d": 1440 };
const KRAKEN_PAIR: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD", ADAUSDT: "ADAUSD", XRPUSDT: "XRPUSD" };

export const kraken: MarketDataProvider = {
  name: "kraken",
  kinds: ["MARKET", "HISTORICAL", "CRYPTO"],
  dataMode: "LIVE",
  requiredEnv: [],
  supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d"],
  supports: (a) => a === "CRYPTO",
  async getCandles(symbol, timeframe, bars) {
    if (!(timeframe in KRAKEN_TF)) throw new ProviderError("kraken", "UNSUPPORTED", `timeframe ${timeframe}`);
    const pair = KRAKEN_PAIR[symbol.toUpperCase()];
    if (!pair) throw new ProviderError("kraken", "UNSUPPORTED", `no kraken pair mapping for ${symbol}`);
    const key = `kraken|${symbol}|${timeframe}|${bars}`;
    const { candles } = await cachedCandles(key, barTtl(timeframe), async () => {
      const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${KRAKEN_TF[timeframe]}`;
      const raw = (await guardedFetch("kraken", url)) as { result?: Record<string, unknown> & { last?: number } };
      // Kraken keys the rows under its canonical pair name (e.g. XXBTZUSD) plus a "last" field.
      const resultObj = (raw.result ?? {}) as Record<string, unknown>;
      const pairKey = Object.keys(resultObj).find((k) => k !== "last" && Array.isArray(resultObj[k]));
      const series = (pairKey ? resultObj[pairKey] : undefined) as [number, string, string, string, string, string, string, number][] | undefined;
      if (!series) throw new ProviderError("kraken", "BAD_PAYLOAD", "no OHLC rows");
      const intervalSec = KRAKEN_TF[timeframe];
      const now = Date.now();
      return series
        .map((r) => mkCandle(symbol, timeframe, (r[0] + intervalSec) * 1000, +r[1], +r[2], +r[3], +r[4], +r[6], "kraken", "kraken-rest"))
        .filter((c) => c.eventTime <= now) // only CLOSED bars enter research
        .slice(-Math.min(bars, 720));
    });
    if (!candles.length) throw new ProviderError("kraken", "BAD_PAYLOAD", "no candles returned");
    return candles;
  },
};
