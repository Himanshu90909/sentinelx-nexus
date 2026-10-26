-- SENTINELX NEXUS - durable storage schema (Postgres).
-- The default store is in-memory (serverless-friendly demo); set
-- STORE_DRIVER=postgres + DATABASE_URL and implement server/store.ts's
-- interface against these tables for durable deployment.
-- Entities are stored as JSONB documents; the columns below are the
-- indexed, queryable projections.

CREATE TABLE IF NOT EXISTS instruments (
  symbol        TEXT PRIMARY KEY,
  doc           JSONB NOT NULL,
  asset_class   TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_data (
  id            BIGSERIAL PRIMARY KEY,
  symbol        TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  event_time    BIGINT NOT NULL,          -- market close time (ms epoch)
  ingestion_time BIGINT NOT NULL,         -- receipt time (ms epoch, kept separate)
  provider      TEXT NOT NULL,
  source        TEXT NOT NULL,
  open          DOUBLE PRECISION NOT NULL,
  high          DOUBLE PRECISION NOT NULL,
  low           DOUBLE PRECISION NOT NULL,
  close         DOUBLE PRECISION NOT NULL,
  volume        DOUBLE PRECISION NOT NULL,
  UNIQUE (symbol, timeframe, event_time, provider)
);

CREATE TABLE IF NOT EXISTS feature_vectors (
  id            BIGSERIAL PRIMARY KEY,
  symbol        TEXT NOT NULL,
  name          TEXT NOT NULL,
  value         DOUBLE PRECISION,
  feature_timestamp   BIGINT NOT NULL,
  source_timestamp    BIGINT NOT NULL,
  availability_timestamp BIGINT NOT NULL,
  feature_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  dataset_id    TEXT NOT NULL,
  version       TEXT NOT NULL,
  symbols       TEXT[] NOT NULL,
  range_start   BIGINT NOT NULL,
  range_end     BIGINT NOT NULL,
  feature_version    TEXT NOT NULL,
  preprocessing_version TEXT NOT NULL,
  provider      TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  bar_count     INTEGER NOT NULL,
  checksum      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, version)
);

CREATE TABLE IF NOT EXISTS experiments (
  experiment_id TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  config       JSONB NOT NULL,
  dataset_version TEXT,
  code_version TEXT NOT NULL,
  metrics      JSONB,
  reproduction_command TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS models (
  id           TEXT PRIMARY KEY,          -- model id
  family       TEXT NOT NULL,
  status       TEXT NOT NULL,             -- EXPERIMENTAL/VALIDATED/CANDIDATE/PRODUCTION/ARCHIVED
  doc          JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id           BIGSERIAL PRIMARY KEY,
  model_id     TEXT NOT NULL REFERENCES models(id),
  model_version TEXT NOT NULL,
  dataset_version TEXT,
  feature_version TEXT,
  metrics      JSONB,
  training_config JSONB,
  code_version TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecasts (
  prediction_id          TEXT PRIMARY KEY,
  symbol                 TEXT NOT NULL,
  horizon                TEXT NOT NULL,
  made_at                BIGINT NOT NULL,
  target_time            BIGINT NOT NULL,
  point                  DOUBLE PRECISION NOT NULL,
  lower                  DOUBLE PRECISION NOT NULL,
  upper                  DOUBLE PRECISION NOT NULL,
  model_version          TEXT NOT NULL,
  regime                 TEXT NOT NULL,
  data_mode              TEXT NOT NULL,
  data_snapshot_id       TEXT NOT NULL,
  dataset_version        TEXT NOT NULL,
  feature_version        TEXT NOT NULL,
  code_version           TEXT NOT NULL,
  latency_ms             INTEGER NOT NULL,
  actual                 DOUBLE PRECISION,
  error                  DOUBLE PRECISION,
  resolved               BOOLEAN NOT NULL DEFAULT FALSE,
  evaluation_time        BIGINT
);

CREATE TABLE IF NOT EXISTS leakage_events (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  feature       TEXT NOT NULL,
  prediction_time BIGINT NOT NULL,
  source_time   BIGINT NOT NULL,
  availability_time BIGINT NOT NULL,
  severity      TEXT NOT NULL,
  experiment_id TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drift_events (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  type          TEXT NOT NULL,
  detail        TEXT NOT NULL,
  severity      TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regime_history (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  regime        TEXT NOT NULL,
  confidence    DOUBLE PRECISION NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_quality_events (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  type          TEXT NOT NULL,
  detail        TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_health (
  name          TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  configured    BOOLEAN NOT NULL,
  healthy       BOOLEAN,
  data_mode     TEXT NOT NULL,
  last_success  TIMESTAMPTZ,
  last_error    TEXT,
  latency_ms    INTEGER,
  requests      INTEGER NOT NULL DEFAULT 0,
  cache_hits    INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  required_env  TEXT[] NOT NULL
);

-- Required indexes (spec section 38)
CREATE INDEX IF NOT EXISTS idx_market_symbol_tf_time ON market_data (symbol, timeframe, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_market_provider ON market_data (provider);
CREATE INDEX IF NOT EXISTS idx_features_symbol_time ON feature_vectors (symbol, feature_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_features_availability ON feature_vectors (availability_timestamp);
CREATE INDEX IF NOT EXISTS idx_forecasts_symbol_time ON forecasts (symbol, target_time DESC);
CREATE INDEX IF NOT EXISTS idx_forecasts_model_version ON forecasts (model_version);
CREATE INDEX IF NOT EXISTS idx_leakage_symbol ON leakage_events (symbol, at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_symbol ON drift_events (symbol, at DESC);
CREATE INDEX IF NOT EXISTS idx_regime_symbol ON regime_history (symbol, at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_symbol ON data_quality_events (symbol, at DESC);
