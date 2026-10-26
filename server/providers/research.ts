// Macro / fundamentals / news providers: FRED, SEC EDGAR, FMP.

import { Candle, Timeframe, TIMEFRAME_MS } from "../core.js";
import { FundamentalsProvider, guardedFetch, mkCandle, NewsProvider, ProviderError } from "./base.js";

// ---------------- FRED (macroeconomic series; published with release lag = HISTORICAL) ----------------

// Seed macro series mapped to instruments. Extend via env/seed data.
export const FRED_SERIES: Record<string, string> = {
  DGS10: "10-Year Treasury Constant Maturity",
  DGS2: "2-Year Treasury Constant Maturity",
  CPIAUCSL: "Consumer Price Index for All Urban Consumers",
  UNRATE: "Civilian Unemployment Rate",
  VIXCLS: "CBOE Volatility Index: VIX",
};

export const fred: MarketDataProviderLike = {
  name: "fred",
  dataMode: "HISTORICAL", // macro series are released on schedule, not real-time
  requiredEnv: ["FRED_API_KEY"],
  supports: (assetClass: string) => assetClass === "MACRO",
  async getCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]> {
    const key = process.env.FRED_API_KEY;
    if (!key) throw new ProviderError("fred", "NOT_CONFIGURED", "FRED_API_KEY not set");
    if (!(symbol in FRED_SERIES)) throw new ProviderError("fred", "UNSUPPORTED", `${symbol} is not a configured FRED series`);
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${symbol}&api_key=${key}&file_type=json&sort_order=desc&limit=${Math.min(bars, 1000)}`;
    const raw = (await guardedFetch("fred", url)) as { observations?: { date: string; value: string }[] };
    if (!raw.observations) throw new ProviderError("fred", "BAD_PAYLOAD", "no observations");
    return raw.observations
      .filter((o) => o.value !== ".")
      .map((o) => {
        const v = +o.value;
        const t = Date.parse(o.date + "T00:00:00Z");
        return mkCandle(symbol, "1d", t + TIMEFRAME_MS["1d"], v, v, v, v, 0, "fred", "fred-api");
      })
      .reverse();
  },
};

interface MarketDataProviderLike {
  name: string;
  dataMode: "LIVE" | "DELAYED" | "HISTORICAL" | "SYNTHETIC";
  requiredEnv: string[];
  supports(assetClass: string): boolean;
  getCandles(symbol: string, timeframe: Timeframe, bars: number): Promise<Candle[]>;
}

// ---------------- SEC EDGAR (company facts, public; HISTORICAL by nature) ----------------

// CIK map for the seed equity universe (config data, editable in seed.ts).
export const SEC_CIK: Record<string, string> = {
  AAPL: "0000320193", MSFT: "0000789019", NVDA: "0001045813", AMZN: "0001018729",
  GOOGL: "0001652044", META: "0001326801", TSLA: "0001318605", AMD: "0000002488",
  JPM: "0000019617", XOM: "0000034088",
};

export const secEdgar: FundamentalsProvider = {
  name: "sec",
  dataMode: "HISTORICAL",
  requiredEnv: [], // public, User-Agent required
  async getFundamentals(symbol: string) {
    const cik = SEC_CIK[symbol.toUpperCase()];
    if (!cik) throw new ProviderError("sec", "UNSUPPORTED", `no CIK mapping for ${symbol}`);
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/Revenues.json`;
    const raw = (await guardedFetch("sec", url, { headers: { "User-Agent": "sentinelx-nexus research contact@sutharindustry" } })) as {
      units?: { USD?: { end: string; val: number; fy: number; fp: string }[] };
    };
    const rev = (raw.units?.USD ?? []).slice(-40).map((u) => ({ value: u.val, asOf: u.end }));
    return { provider: "sec", fields: { revenues: rev } };
  },
};

// ---------------- Financial Modeling Prep (fallback fundamentals) ----------------

export const fmp: FundamentalsProvider = {
  name: "fmp",
  dataMode: "HISTORICAL",
  requiredEnv: ["FMP_API_KEY"],
  async getFundamentals(symbol: string) {
    const key = process.env.FMP_API_KEY;
    if (!key) throw new ProviderError("fmp", "NOT_CONFIGURED", "FMP_API_KEY not set");
    const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${key}`;
    const raw = (await guardedFetch("fmp", url)) as unknown as { symbol: string; price: number; mktCap: number; beta: number }[];
    if (!Array.isArray(raw) || !raw[0]) throw new ProviderError("fmp", "BAD_PAYLOAD", "no profile");
    const p = raw[0];
    return {
      provider: "fmp",
      fields: { profile: [{ value: p.price, asOf: new Date().toISOString() }], marketCap: [{ value: p.mktCap, asOf: new Date().toISOString() }], beta: [{ value: p.beta, asOf: new Date().toISOString() }] },
    };
  },
};

// ---------------- Finnhub news (adapter; requires FINNHUB_API_KEY) ----------------

export const finnhubNews: NewsProvider = {
  name: "finnhub-news",
  dataMode: "LIVE",
  requiredEnv: ["FINNHUB_API_KEY"],
  async getNews(symbol: string, limit: number) {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) throw new ProviderError("finnhub-news", "NOT_CONFIGURED", "FINNHUB_API_KEY not set");
    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&token=${key}`;
    const raw = (await guardedFetch("finnhub-news", url)) as { datetime: number; headline: string; source: string }[];
    return { provider: "finnhub", items: raw.slice(0, limit).map((n) => ({ at: new Date(n.datetime * 1000).toISOString(), headline: n.headline, source: n.source })) };
  },
};
