// Market data adapters: Binance (LIVE crypto), CoinGecko (supplementary),
// Finnhub, Twelve Data, Alpaca (IEX = delayed), Polygon (plan-dependent).

import { Candle, DataMode, Timeframe, TIMEFRAME_MS } from "../core.js";
import { cachedCandles, guardedFetch, MarketDataProvider, mkCandle, barTtl, ProviderError } from "./base.js";
import { kraken } from "./kraken.js";

// ---------------- Binance (public, no key, real-time crypto) ----------------

const BINANCE_TF: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "7d": "1w" };

export const binance: MarketDataProvider = {
  name: "binance",
  kinds: ["MARKET", "HISTORICAL", "STREAMING", "CRYPTO"],
  dataMode: "LIVE",
  requiredEnv: [], // public REST; a streaming adapter would use the same public WS
  supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "7d"],
  supports: (a) => a === "CRYPTO",
  async getCandles(symbol, timeframe, bars) {
    if (!BINANCE_TF[timeframe]) throw new ProviderError("binance", "UNSUPPORTED", `timeframe ${timeframe}`);
    const key = `binance|${symbol}|${timeframe}|${bars}`;
    const { candles, cacheHit } = await cachedCandles(key, barTtl(timeframe), async () => {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${BINANCE_TF[timeframe]}&limit=${Math.min(bars, 1000)}`;
      const raw = (await guardedFetch("binance", url)) as unknown[][];
      const now = Date.now();
      return raw
        .map((row: unknown) => {
          const k = row as unknown[];
          const closeTime = Number(k[6]);
          return mkCandle(symbol, timeframe, closeTime, Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5]), "binance", "binance-rest");
        })
        .filter((c) => c.eventTime <= now); // drop the still-open bar: only CLOSED bars enter research
    });
    if (!cacheHit && candles.length === 0) throw new ProviderError("binance", "BAD_PAYLOAD", "no candles returned");
    return candles;
  },
};

// ---------------- CoinGecko (supplementary crypto metadata, delayed) ----------------

export const coingecko: MarketDataProvider = {
  name: "coingecko",
  kinds: ["MARKET", "CRYPTO"],
  dataMode: "DELAYED", // prices refresh roughly every 30-60s on the public tier
  requiredEnv: [],
  supportedTimeframes: ["1d"],
  supports: (a) => a === "CRYPTO",
  async getCandles(symbol, timeframe, bars) {
    if (timeframe !== "1d") throw new ProviderError("coingecko", "UNSUPPORTED", "coingecko serves daily history only");
    const id = coingeckoId(symbol);
    if (!id) throw new ProviderError("coingecko", "UNSUPPORTED", `no coingecko mapping for ${symbol}`);
    const days = Math.min(bars, 365);
    const key = `coingecko|${symbol}|1d|${bars}`;
    const { candles } = await cachedCandles(key, barTtl("1d"), async () => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
      const raw = (await guardedFetch("coingecko", url)) as { prices: [number, number][]; total_volumes: [number, number][] };
      return raw.prices.map((p, i) =>
        mkCandle(symbol, "1d", p[0], p[1], p[1], p[1], p[1], raw.total_volumes[i]?.[1] ?? 0, "coingecko", "coingecko-rest")
      );
    });
    return candles;
  },
};

function coingeckoId(symbol: string): string | null {
  const map: Record<string, string> = { BTCUSDT: "bitcoin", ETHUSDT: "ethereum", SOLUSDT: "solana", ADAUSDT: "cardano", DOGEUSDT: "dogecoin" };
  return map[symbol.toUpperCase()] ?? null;
}

// ---------------- Finnhub (US equities; free tier candle access is plan-gated) ----------------

const FINNHUB_TF: Record<Timeframe, string> = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D", "7d": "W" };

export const finnhub: MarketDataProvider = {
  name: "finnhub",
  kinds: ["MARKET", "HISTORICAL", "NEWS", "FUNDAMENTALS"],
  dataMode: "DELAYED", // conservative default; quote freshness depends on plan
  requiredEnv: ["FINNHUB_API_KEY"],
  supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "7d"],
  supports: (a) => a === "EQUITY" || a === "ETF" || a === "INDEX" || a === "FOREX",
  async getCandles(symbol, timeframe, bars) {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) throw new ProviderError("finnhub", "NOT_CONFIGURED", "FINNHUB_API_KEY not set");
    const to = Math.floor(Date.now() / 1000);
    const span = TIMEFRAME_MS[timeframe] * bars / 1000;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${FINNHUB_TF[timeframe]}&from=${to - span}&to=${to}&token=${key}`;
    const raw = (await guardedFetch("finnhub", url)) as { s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
    if (raw.s !== "ok" || !raw.t) throw new ProviderError("finnhub", "BAD_PAYLOAD", `candle response status ${raw.s}`);
    return raw.t.map((t, i) =>
      mkCandle(symbol, timeframe, (t + TIMEFRAME_MS[timeframe] / 1000) * 1000, raw.o![i], raw.h![i], raw.l![i], raw.c![i], raw.v?.[i] ?? 0, "finnhub", "finnhub-rest")
    );
  },
};

// ---------------- Twelve Data (equities/forex/crypto; free = delayed US) ----------------

const TWELVE_TF: Record<Timeframe, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day", "7d": "1week" };

export const twelvedata: MarketDataProvider = {
  name: "twelvedata",
  kinds: ["MARKET", "HISTORICAL"],
  dataMode: "DELAYED", // free plan: US stock data is delayed
  requiredEnv: ["TWELVE_DATA_API_KEY"],
  supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "7d"],
  supports: (a) => a === "EQUITY" || a === "ETF" || a === "INDEX" || a === "FOREX" || a === "COMMODITY",
  async getCandles(symbol, timeframe, bars) {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key) throw new ProviderError("twelvedata", "NOT_CONFIGURED", "TWELVE_DATA_API_KEY not set");
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${TWELVE_TF[timeframe]}&outputsize=${Math.min(bars, 5000)}&order=ASC&apikey=${key}`;
    const raw = (await guardedFetch("twelvedata", url)) as {
      status?: string; message?: string; values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[];
    };
    if (raw.status === "error" || !raw.values) throw new ProviderError("twelvedata", "BAD_PAYLOAD", raw.message ?? "bad payload");
    return raw.values.map((v) =>
      mkCandle(symbol, timeframe, Date.parse(v.datetime.endsWith("Z") ? v.datetime : v.datetime + "Z"), +v.open, +v.high, +v.low, +v.close, +(v.volume ?? 0), "twelvedata", "twelvedata-rest")
    );
  },
};

// ---------------- Alpaca (IEX feed: 15-minute delayed on the free tier) ----------------

const ALPACA_TF: Record<Timeframe, string> = { "1m": "1Min", "5m": "5Min", "15m": "15Min", "1h": "1Hour", "4h": "4Hour", "1d": "1Day", "7d": "1Week" };

export const alpaca: MarketDataProvider = {
  name: "alpaca",
  kinds: ["MARKET", "HISTORICAL"],
  dataMode: "DELAYED", // IEX feed, 15 min delay on free tier
  requiredEnv: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"],
  supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "7d"],
  supports: (a) => a === "EQUITY" || a === "ETF",
  async getCandles(symbol, timeframe, bars) {
    const key = process.env.ALPACA_API_KEY;
    const sec = process.env.ALPACA_SECRET_KEY;
    if (!key || !sec) throw new ProviderError("alpaca", "NOT_CONFIGURED", "ALPACA keys not set");
    const start = new Date(Date.now() - TIMEFRAME_MS[timeframe] * bars).toISOString();
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${symbol}&timeframe=${ALPACA_TF[timeframe]}&start=${start}&limit=10000&adjustment=raw`;
    const raw = (await guardedFetch("alpaca", url, { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": sec } })) as {
      bars?: Record<string, { t: string; o: number; h: number; l: number; c: number; v: number }[]>;
    };
    const list = raw.bars?.[symbol];
    if (!list) throw new ProviderError("alpaca", "BAD_PAYLOAD", "no bars");
    return list.map((b) => mkCandle(symbol, timeframe, Date.parse(b.t), b.o, b.h, b.l, b.c, b.v, "alpaca", "alpaca-iex"));
  },
};

// ---------------- Polygon (data mode is plan-dependent, labeled conservatively) ----------------

const POLYGON_TF: Record<Timeframe, [string, string]> = {
  "1m": ["1", "minute"], "5m": ["5", "minute"], "15m": ["15", "minute"],
  "1h": ["1", "hour"], "4h": ["4", "hour"], "1d": ["1", "day"], "7d": ["1", "week"],
};

export const polygon: MarketDataProvider = {
  name: "polygon",
  kinds: ["MARKET", "HISTORICAL"],
  dataMode: (process.env.POLYGON_DATA_MODE as DataMode) || "DELAYED", // set to LIVE only if your plan provides real-time
  requiredEnv: ["POLYGON_API_KEY"],
  supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "7d"],
  supports: (a) => a === "EQUITY" || a === "ETF" || a === "INDEX" || a === "OPTION",
  async getCandles(symbol, timeframe, bars) {
    const key = process.env.POLYGON_API_KEY;
    if (!key) throw new ProviderError("polygon", "NOT_CONFIGURED", "POLYGON_API_KEY not set");
    const [mult, span] = POLYGON_TF[timeframe];
    const to = new Date();
    const from = new Date(to.getTime() - TIMEFRAME_MS[timeframe] * bars);
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/ranged/${mult}/${span}/${from.toISOString().slice(0, 10)}/${to.toISOString().slice(0, 10)}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;
    const raw = (await guardedFetch("polygon", url)) as { results?: { T: number; o: number; h: number; l: number; c: number; v: number }[]; status?: string };
    if (!raw.results) throw new ProviderError("polygon", "BAD_PAYLOAD", `status ${raw.status ?? "none"}`);
    return raw.results.map((r) => mkCandle(symbol, timeframe, r.T, r.o, r.h, r.l, r.c, r.v, "polygon", "polygon-aggs"));
  },
};

export const MARKET_PROVIDERS: MarketDataProvider[] = [binance, kraken, coingecko, finnhub, twelvedata, alpaca, polygon];
