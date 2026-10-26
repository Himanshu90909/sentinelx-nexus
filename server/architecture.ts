// Static system architecture description (served to the frontend verbatim).

export const ARCHITECTURE = {
  name: "SENTINELX NEXUS",
  tagline: "Autonomous Temporal Intelligence for Real-Time Systems",
  pipeline: ["Data", "Features", "Models", "Evaluation", "Forecast", "Monitoring"],
  layers: [
    {
      name: "Data",
      role: "Provider abstraction with fallback chains, health checks, rate limiting, and schema normalization to one internal schema (event_time kept separate from ingestion_time).",
      components: ["Binance (LIVE crypto)", "CoinGecko (delayed)", "Finnhub / Twelve Data / Alpaca (IEX, 15m delayed) / Polygon (plan-dependent)", "FRED macro (historical)", "SEC EDGAR + FMP fundamentals", "Synthetic generator (clearly labeled)"],
    },
    {
      name: "Ingestion & Quality",
      role: "Schema validation, timestamp validation, deduplication, out-of-order handling, extreme-jump flags; every rejection recorded as a DataQualityEvent. Explainable Data Quality Score.",
      components: ["schema validator", "timestamp validator", "dedup", "quality engine"],
    },
    {
      name: "Features & Leakage Control",
      role: "Trailing-window feature engine (price, volume, time). Every feature carries feature/source/availability timestamps; the leakage auditor enforces availability <= prediction time.",
      components: ["feature engine (f1.0)", "leakage auditor", "replay engine (structural cutoff)"],
    },
    {
      name: "Models & Evaluation",
      role: "Naive, seasonal-naive, moving-average, and tuned exponential smoothing; empirical prediction intervals from walk-forward residuals; strict expanding-window walk-forward validation, never shuffled. External model services plug in via an adapter when configured.",
      components: ["model zoo", "walk-forward evaluation", "uncertainty engine", "model router"],
    },
    {
      name: "Monitoring",
      role: "Regime detection, drift (PSI) monitoring, prediction audit trail with dataset/feature/model/code versions, measured latency tracking.",
      components: ["regime monitor", "drift monitor", "audit trail", "performance lab"],
    },
  ],
  limitations: [
    "No inbound WebSocket servers on serverless: the live stream page uses short polling (labeled as such), not fake realtime.",
    "Serverless instances are ephemeral; the default in-memory store resets per instance. Durable persistence requires the documented Postgres adapter.",
    "Deep-learning / foundation models (LSTM, TCN, Transformer, Chronos, TimesFM) are NOT implemented natively and are not advertised; they integrate via an external ModelServiceAdapter when MODEL_SERVICE_URL is configured.",
    "Free-tier market data is delayed; every response is labeled LIVE / DELAYED / HISTORICAL / SYNTHETIC.",
    "This is a research and ML engineering platform, not investment advice.",
  ],
};
