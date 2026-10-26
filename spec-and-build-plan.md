# SENTINELX NEXUS — Build Plan & Engineering Spec

Autonomous Real-Time Multi-Asset Temporal Intelligence & Forecasting Engine
Research/ML-engineering platform. NOT a trading app, NOT investment advice.

---

## 0. Honest platform constraints (no fabrication)

- All compute runs in **Base44 backend functions (server-side TypeScript)**. Python
  model services (XGBoost, LightGBM, LSTM/GRU/TCN/Transformer, Chronos/TimesFM/Moirai)
  **cannot be trained or hosted inside Base44**. They are supported through a
  **ModelServiceAdapter** interface: any external inference endpoint that speaks the
  internal schema can be registered and routed to. Until such an endpoint exists,
  the platform runs its **measured JS-native models only**: Naive, Seasonal Naive,
  Moving Average, EMA/Exponential Smoothing, rolling quantile intervals, and
  regime/routing logic. No fabricated model names, metrics, or benchmarks.
- Market data reality: with only free-tier keys, several providers give **delayed**
  data. Every API response carries a `data_mode` field: `LIVE | DELAYED | HISTORICAL |
  SYNTHETIC`. Binance public WebSocket/REST is real-time for crypto; equities are
  provider-dependent and labeled per-provider.
- No buy/sell recommendations anywhere. Uncertainty always shown as intervals with
  calibration scores, never as certainty.

---

## 1. App-creation seed prompt (paste once in the Base44 builder)

> Create a dark-themed ML research/observability platform called "SENTINELX NEXUS —
> Autonomous Real-Time Multi-Asset Temporal Intelligence & Forecasting Engine".
> Research infrastructure aesthetic: dense, technical, monospace accents, status
> indicators, minimal animation. Landing page headline "SENTINELX NEXUS", subheadline
> "Autonomous Temporal Intelligence for Real-Time Systems", architecture flow
> Data → Features → Models → Evaluation → Forecast → Monitoring, and the disclaimer
> "This is a research and ML engineering platform, not investment advice."
> Create nothing else yet; I will drive the build in phases.

---

## 2. Entities (Base44 database)

Core time-series (all observations carry instrument_id, event_time, ingestion_time,
provider, source, timeframe; OHLCV where applicable):

- Instrument, Market
- OHLCVBar, Tick, OrderBookSnapshot, Trade
- FundamentalSnapshot, MacroObservation, NewsEvent
- FeatureVector (feature_timestamp, source_timestamp, availability_timestamp)
- DatasetVersion (symbols, range, features, freq, provider, preprocessing version,
  feature version, code commit, checksum — reproducible from metadata, immutable)
- Experiment, Model, ModelVersion (status: EXPERIMENTAL/VALIDATED/CANDIDATE/
  PRODUCTION/ARCHIVED), Forecast, ForecastActual, EvaluationRun
- DriftEvent, Regime, RegimeHistory, LeakageEvent (feature, prediction_time,
  source_time, availability_time, severity, experiment_id)
- ProviderHealth, DataQualityEvent, PipelineRun, PredictionAudit (full audit trail:
  data_snapshot_id, feature/dataset/model/code versions, forecast, uncertainty,
  regime, latency; later actual_value, error, evaluation_timestamp)
- SystemMetric, Alert

Indexes (logical): instrument_id, event_time, timeframe, provider, model_version,
prediction_timestamp. RLS on user-owned admin entities; roles ADMIN/RESEARCHER/VIEWER.

## 3. Provider abstraction (server-side only)

Interfaces: MarketDataProvider, HistoricalDataProvider, StreamingDataProvider,
FundamentalsProvider, MacroDataProvider, NewsProvider — all normalize to one
internal schema. Adapters: Finnhub, Twelve Data, Alpaca, Polygon, Binance (crypto,
public REST/WebSocket), CoinGecko, SEC EDGAR, FMP, FRED, Nasdaq Data Link.

- Health checks, latency, last success, last error, quota info → ProviderHealth.
- Fallback chain per data class; provider switches recorded, never mixed silently.
- Rate-limit manager: caching, dedup, batching, exponential backoff, provider
  priority. Identical historical requests never repeated.
- Malformed records → DataQualityEvent, never silently dropped.

Secrets (Base44 secure secrets, never in frontend, never logged):
FINNHUB_API_KEY, TWELVE_DATA_API_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY,
POLYGON_API_KEY, FRED_API_KEY, FMP_API_KEY, COINGECKO_API_KEY, WANDB_API_KEY,
MODEL_SERVICE_URL / MODEL_SERVICE_KEY (external model adapter).

## 4. Pipeline

Ingestion: provider → adapter → schema validator → timestamp validator →
dedup → normalization → realtime state → DB → features → forecast.
Handles reconnect, backoff, heartbeat, out-of-order, stale-feed detection, failover.

Data Quality Engine: missing/duplicate/out-of-order timestamps, impossible OHLC,
negative volume, extreme jumps, stale data, provider disagreement, timezone
inconsistency → explainable Data Quality Score /100.

Leakage Auditor: every feature has feature/source/availability timestamps; a feature
is usable only if availability_timestamp <= prediction_timestamp. Automated detector
fails any experiment containing leakage (LEAKAGE_DETECTED), stores LeakageEvent.
A dedicated test proves future information cannot enter a past prediction.

Feature engine (modular, versioned): price (returns, log returns, rolling, momentum,
MA, EMA, volatility, ATR, RSI, MACD), microstructure (spread, book imbalance, volume
imbalance, liquidity proxies), time (hour/session/weekday/market session),
cross-asset (rolling correlation, beta, relative strength), macro, news sentiment —
each with source and availability timestamps.

## 5. Modeling & evaluation

- Multi-horizon: 5m / 15m / 1h / 4h / 1d / 7d (per-provider capability aware).
- Model zoo: JS-native baselines + classical (ETS) live; tree/DL/foundation models
  via ModelServiceAdapter only when an endpoint is configured.
- Global multi-series architecture: shared representation + asset embedding +
  horizon embedding + optional regime embedding, vs per-asset baselines.
- Regime detection: TRENDING_UP/DOWN, MEAN_REVERTING, HIGH/LOW_VOLATILITY,
  LIQUIDITY_STRESS, DISTRIBUTION_SHIFT, UNKNOWN — explainable features, stored history.
- Model Router: selects model from walk-forward evidence by regime/asset/horizon,
  with reason, confidence, fallback model. Never test-set-only selection.
- Walk-forward evaluation only (expanding/rolling). Never shuffle. Metrics: MAE,
  RMSE, sMAPE, MASE, directional accuracy, interval coverage, calibration, latency,
  memory, throughput. All models compared against naive baselines.
- Uncertainty engine: point + lower/upper bounds + interval_width + calibration_score.
- Drift: feature/prediction/residual/error/quality/regime monitors → DriftEvent →
  mark model → trigger evaluation → optional retraining proposal. Promotion requires
  validation gate; never auto-replace production models.
- Experiment tracking: W&B integration when WANDB_API_KEY present; otherwise
  internal Experiment records. Reproducible one-command runs documented in README.
- Replay engine: historical replay as-if-real-time with strict no-future-data
  guarantee; shows replay timestamp, available features, prediction, later actual,
  error. Enables offline evaluation of the whole real-time system.
- Synthetic data generator (trend, seasonality, regime shifts, noise, gaps,
  outliers, breaks) clearly labeled SYNTHETIC, used when no keys are configured.
  Also CSV upload / historical import. Data-source banner always visible.

## 6. API surface (Base44 backend functions)

getMarket / getFeatures / getForecast / getForecastHistory / getModels /
getEvaluation / getDrift / getRegime / getDataQuality (per symbol), plus admin:
configureProviders, providerHealth, runIngestion, runEvaluation, promoteModel,
runLeakageAudit, runReplay. Explicit failure statuses returned, never fake
forecasts: DATA_UNAVAILABLE, STALE_DATA, MODEL_UNAVAILABLE, INSUFFICIENT_HISTORY,
LEAKAGE_DETECTED, PROVIDER_RATE_LIMITED.

## 7. Frontend pages (dark research-lab UI)

1. Overview · 2. Live Market Stream · 3. Forecast Explorer · 4. Multi-Asset Matrix
(rows=instruments, cols=horizons; forecast, uncertainty, model, regime, freshness,
model status) · 5. Model Lab · 6. Experiment Tracking · 7. Dataset Registry ·
8. Leakage Auditor · 9. Regime Monitor · 10. Drift Monitor · 11. Reliability Lab ·
12. Performance Lab · 13. Provider Health (admin config) · 14. System Architecture ·
15. Research Reports.

## 8. Build phases (one builder message each, verified between phases)

- P1: entities, provider layer, ingestion, data-quality engine, secrets, admin
  provider-health page, synthetic mode, data-source banner.
- P2: feature engine, dataset versioning, leakage auditor + tests, replay engine.
- P3: model zoo (baselines + intervals), global series design, router, walk-forward
  evaluation, reliability lab.
- P4: regime detection, drift engine, retraining gate, model registry, prediction
  audit trail.
- P5: full frontend (15 pages), multi-asset matrix, research reports, performance
  lab, system architecture page.
- P6: test suite, observability/alerting, README reproducibility docs, final audit
  against section-43 checklist.
