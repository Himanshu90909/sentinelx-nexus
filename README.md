# SENTINELX NEXUS

**Autonomous Real-Time Multi-Asset Temporal Intelligence & Forecasting Engine**

> Learn across heterogeneous time series. Detect regime shifts. Audit temporal leakage.
> Forecast with calibrated uncertainty. Evaluate every prediction.

**This is a research and ML engineering platform, not investment advice.**
No buy/sell recommendations are produced anywhere in the system.

---

## What this is

A temporal-intelligence research platform that:

- ingests market data through a **provider abstraction layer** with fallback chains, health checks, rate limiting, and one normalized internal schema
- builds **leakage-safe datasets** (every observation carries `eventTime` separately from `ingestionTime`; every feature carries `feature/source/availability` timestamps)
- runs **strict expanding-window walk-forward evaluation** (never shuffled) with MAE, RMSE, sMAPE, MASE, directional accuracy, measured interval coverage and calibration
- detects **regimes** (TRENDING_UP/DOWN, MEAN_REVERTING, HIGH/LOW_VOLATILITY, LIQUIDITY_STRESS, DISTRIBUTION_SHIFT, UNKNOWN) from explainable drivers
- monitors **concept drift** (PSI on feature distributions) and raises monitoring without ever silently swapping a production model
- routes forecasting through a **model router** selected by measured recent walk-forward evidence, conditioned on the current regime
- produces **probabilistic forecasts**: point + empirical 80% interval + measured coverage
- keeps a **full prediction audit trail**: every forecast is reproducible from its data snapshot, dataset version, feature version, model version, and code version
- ships a **replay engine** that re-processes history as-if-real-time with a structural cutoff, proving future data cannot enter past predictions

## What this is NOT (honesty section)

- Not a trading app, not investment advice, no buy/sell UI.
- Deep-learning / foundation models (LSTM, TCN, Transformer, Chronos, TimesFM, Moirai) are **not implemented natively** and are **not advertised**. They plug in through a `ModelServiceAdapter` when an external inference endpoint (`MODEL_SERVICE_URL`) is configured. The natively shipped models are: Naive, Seasonal Naive, Moving Average, and tuned Exponential Smoothing, all with measured metrics.
- On Vercel serverless there are **no inbound WebSocket servers**: the live stream page uses short polling, labeled as such.
- Serverless instances are ephemeral: the default store is in-memory per instance. Durable persistence requires the documented Postgres path (below).
- Free-tier market data is **delayed**; every response and page is labeled `LIVE` / `DELAYED` / `HISTORICAL` / `SYNTHETIC`. With no API keys, the platform runs on clearly-labeled synthetic data so the full ML pipeline can be exercised.

## Quick start

```bash
npm install
npm run dev            # vite dev server (frontend); API is served by Vercel CLI below
npx vercel dev         # local serverless API + frontend together
npm test               # 59 tests incl. the temporal-leakage proof
npm run build          # production frontend build
```

## One-command reproducibility

Every experiment is a config file + a single command:

```bash
npm run reproduce -- --config configs/eval-ets.json
npm run reproduce:all
```

Output includes the dataset version + checksum, the exact walk-forward metrics (measured, not invented), the experiment id, code version, and the reproduction command. See `configs/` for the shipped experiment set.

## API surface

All endpoints under `/api/*` return `{ status, data?, reason?, dataMode?, generatedAt }`.
Failure statuses are explicit: `DATA_UNAVAILABLE`, `STALE_DATA`, `MODEL_UNAVAILABLE`, `INSUFFICIENT_HISTORY`, `LEAKAGE_DETECTED`, `PROVIDER_RATE_LIMITED`, `NOT_CONFIGURED`, `BAD_REQUEST`, `UNAUTHORIZED`. A forecast is never produced when its inputs fail.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | service status + data-mode banner |
| `GET /api/providers` | provider health: configured, latency, last success/error, cache hit rate |
| `GET /api/instruments` | dynamic universe (add via POST, admin) |
| `GET /api/market/:symbol` | OHLCV + data quality score + freshness |
| `GET /api/features/:symbol` | feature vector with availability timestamps |
| `GET /api/forecast/:symbol` | forecast + interval + router evidence + provenance |
| `GET /api/forecast/:symbol?view=history` | predictions vs actuals vs error |
| `GET /api/matrix` | instruments x horizons matrix with explicit cell statuses |
| `GET /api/models` | model registry (statuses incl. EXPERIMENTAL..PRODUCTION) |
| `GET /api/evaluation/:model` | walk-forward evidence (folds + metrics) |
| `GET /api/regime/:symbol` | regime + explainable drivers + history |
| `GET /api/drift/:symbol` | PSI per feature + drift events + monitoring level |
| `GET /api/leakage/:symbol` | leakage events + live auditor self-test |
| `GET /api/data-quality/:symbol` | quality score with component breakdown |
| `GET /api/replay/:symbol` | as-if-real-time replay with no-lookahead guarantee |
| `GET /api/datasets`, `/api/experiments` | dataset registry (checksummed, immutable), experiment tracking |
| `GET /api/metrics/latency` | measured p50/p95 per endpoint |
| `POST /api/synthetic` | synthetic series generator (always labeled) |
| `POST /api/admin/retrain` | retraining gate: candidate must beat production on walk-forward |
| `POST /api/admin/promote` | promotion requires validation experiment evidence |

Admin routes require `Authorization: Bearer $ADMIN_TOKEN` (disabled unless the token is set).

## Secrets (server-side only, never in frontend code, never logged)

```
FINNHUB_API_KEY= TWELVE_DATA_API_KEY= ALPACA_API_KEY= ALPACA_SECRET_KEY=
POLYGON_API_KEY= FRED_API_KEY= FMP_API_KEY= COINGECKO_API_KEY=
ADMIN_TOKEN= MODEL_SERVICE_URL= MODEL_SERVICE_KEY= WANDB_API_KEY=
SYNTHETIC_FALLBACK=false   # disable the labeled synthetic fallback
POLYGON_DATA_MODE=LIVE     # only if your Polygon plan actually provides real-time
```

Configure them in Vercel Project Settings > Environment Variables (or locally in `.env`, which is gitignored).

## Data labeling

| Label | Meaning | Examples |
|---|---|---|
| LIVE | genuinely real-time | Binance public REST (closed bars only) |
| DELAYED | provider-dependent delay (IEX is 15 min; Twelve Data free is delayed) | equities via Finnhub/TwelveData/Alpaca/Polygon defaults |
| HISTORICAL | released on a schedule | FRED macro series, SEC EDGAR facts |
| SYNTHETIC | generated by the built-in seedable generator, never market data | provider-free demo/CI mode |

## Durable storage (documented extension)

The store is an interface in `server/store.ts` with an in-memory default. For durable
deployment on Vercel, implement the same interface against Postgres using
`sql/schema.sql` (JSONB-backed entity tables + the required indexes on
`instrument_id`, `event_time`, `timeframe`, `provider`, `model_version`,
`prediction_timestamp`) and set `STORE_DRIVER=postgres` with `DATABASE_URL`.
No provider data is ever silently mixed; every record keeps its provider.

## Temporal leakage: the rules

1. Every observation carries `eventTime` (market close time) and `ingestionTime` (receipt).
2. Only CLOSED bars enter research (in-progress bars are dropped at ingestion).
3. Every feature records `featureTimestamp`, `sourceTimestamp`, and `availabilityTimestamp`.
4. A feature may be used only if `availabilityTimestamp <= predictionTimestamp`. Violations are recorded as `LeakageEvent`s and fail the experiment.
5. `tests/leakage.test.ts` proves, three ways, that future information cannot enter a past prediction (cutoff-clamped features, strictly ordered walk-forward folds, and the replay guarantee).

## Reproducibility chain

`config -> provider -> ingestion pipeline -> dataset version (checksum) -> walk-forward -> experiment record -> report`

`npm test` guards: normalization, timestamp handling, dedup/out-of-order, leakage, feature math, dataset splits, model inference, interval calibration, drift detection, replay, synthetic determinism, API behavior, admin auth, and the refusal to promote without validation.

## Deployment (Vercel)

1. Push this repo to GitHub.
2. In Vercel: New Project -> import the repo (framework preset: Vite; build `npm run build`, output `dist`).
3. Add the environment variables above as needed. With none set, the app runs in labeled synthetic mode.
4. Deploy. `/api/*` is served by `api/[[...route]].ts`; all other paths fall back to the SPA.

`vercel.json` already contains the rewrites; the catch-all route file is
`api/[[...route]].ts` (brackets are literal - Vercel optional catch-all).

## Architecture

Data -> Features -> Models -> Evaluation -> Forecast -> Monitoring
(see `server/architecture.ts`, served at `GET /api/architecture`)

- `server/providers/` - provider abstraction, adapters, health, rate limiting, fallback
- `server/ingest.ts` - validation, dedup, out-of-order, quality events, quality score
- `server/features.ts` - trailing-window feature engine with availability stamps
- `server/leakage.ts` - leakage auditor + live self-test
- `server/models.ts`, `server/evaluation.ts`, `server/router.ts` - model zoo, walk-forward, router
- `server/regime.ts`, `server/drift.ts` - regime + drift monitors
- `server/replay.ts`, `server/synthetic.ts` - replay engine, synthetic generator
- `server/datasets.ts`, `server/audit.ts` - versioning + prediction audit trail
- `server/orchestrator.ts` - failure-first operations behind the API
- `web/` - research dashboard (15 pages), dark ML-infrastructure design
