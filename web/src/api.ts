export type ApiStatus =
  | 'OK'
  | 'DATA_UNAVAILABLE'
  | 'STALE_DATA'
  | 'MODEL_UNAVAILABLE'
  | 'INSUFFICIENT_HISTORY'
  | 'LEAKAGE_DETECTED'
  | 'PROVIDER_RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST';

export interface ApiResult<T> {
  status: ApiStatus;
  data?: T;
  reason?: string;
  dataMode?: string;
  provider?: string;
  generatedAt?: string;
}

export interface HealthData {
  service: string;
  version: string;
  uptimeSeconds: number;
  instanceId: string;
  dataModeBanner: string;
}

export interface ArchitectureLayer {
  name: string;
  role: string;
  components: string[];
}

export interface PipelineStep {
  step: string;
  description: string;
}

export interface ArchitectureData {
  layers: ArchitectureLayer[];
  pipeline: PipelineStep[];
  limitations: string[];
}

export interface ProviderInfo {
  name: string;
  kind: string;
  configured: boolean;
  healthy: boolean | null;
  dataMode: string;
  lastSuccess?: string | null;
  lastError?: string | null;
  latencyMs?: number | null;
  requests?: number;
  requests24h?: number;
  cacheHitRate?: number;
  requiredEnv?: string[];
}

export interface ProvidersData {
  providers: ProviderInfo[];
}

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  spark: number[];
  high: number;
  low: number;
  volume: number;
  dataMode: string;
  asOf: string;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  market: string;
  dataMode: string;
  active: boolean;
  source?: string;
  quote?: Quote | null;
  quoteStatus?: string;
}

export interface InstrumentsData {
  instruments: Instrument[];
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface QualityComponent {
  name: string;
  passed: boolean;
  detail: string;
}

export interface MarketData {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  quality?: {
    score: number;
    components: QualityComponent[];
  };
  freshness?: {
    lastEvent: string;
    ageSeconds: number;
    stale: boolean;
  };
}

export interface FeatureItem {
  name: string;
  value: number;
  featureTimestamp: string;
  sourceTimestamp: string;
  availabilityTimestamp: string;
}

export interface FeaturesData {
  symbol: string;
  timeframe: string;
  featureVersion: string;
  features: FeatureItem[];
}

export interface ForecastModel {
  id: string;
  version: string;
}

export interface ForecastRouter {
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface ForecastData {
  symbol: string;
  horizon: string;
  madeAt: string;
  targetTime: string;
  point: number;
  lower: number;
  upper: number;
  intervalWidth: number;
  confidence: number;
  model: ForecastModel;
  router?: ForecastRouter;
  regime?: { state: string; confidence?: number; drivers?: { name: string; value: number; contribution?: string }[] } | string;
  dataSnapshotId?: string;
  featureVersion?: string;
  datasetVersion?: string;
  codeVersion?: string;
  latencyMs?: number;
}

export interface HistoricalForecast extends Omit<ForecastData, 'model'> {
  model?: { id: string; version: string } | string;
  actual?: number | null;
  error?: number | null;
  resolved?: boolean;
}

export interface MatrixCell {
  status: ApiStatus;
  point?: number;
  lower?: number;
  upper?: number;
  model?: string;
  modelStatus?: string;
}

export interface MatrixRow {
  symbol: string;
  dataMode: string;
  regime?: string;
  freshnessAgeSeconds?: number;
  cells: Record<string, MatrixCell>;
}

export interface MatrixData {
  horizons: string[];
  rows: MatrixRow[];
}

export interface ModelMeasured {
  symbol: string;
  horizon: string;
  smape?: number;
  mase?: number;
  coverage80?: number;
}

export interface ModelInfo {
  id: string;
  family: 'BASELINE' | 'CLASSICAL' | 'EXTERNAL' | string;
  status: 'EXPERIMENTAL' | 'VALIDATED' | 'CANDIDATE' | 'PRODUCTION' | 'ARCHIVED' | string;
  description: string;
  supportsIntervals: boolean;
  measured?: ModelMeasured[];
}

export interface ModelsData {
  models: ModelInfo[];
}


export interface RegimeDriver {
  name: string;
  value: number;
  contribution: string;
}

export interface RegimeHistory {
  t: string | number;
  regime: string;
}

export interface RegimeData {
  symbol: string;
  regime: string;
  since?: string;
  confidence: number;
  drivers: RegimeDriver[];
  history: RegimeHistory[];
}

export interface LeakageEvent {
  feature: string;
  predictionTime: string;
  sourceTime: string;
  availabilityTime: string;
  severity: string;
  experimentId?: string;
}

export interface LeakageData {
  events: LeakageEvent[];
  selfTest?: {
    ran: boolean;
    passed: boolean;
    description: string;
  };
}

export interface DatasetVersion {
  datasetId: string;
  version: string;
  symbols: string[];
  range: string;
  featureVersion: string;
  provider: string;
  checksum: string;
  createdAt: string;
  immutable: boolean;
}

export interface DatasetsData {
  versions: DatasetVersion[];
}

export interface Experiment {
  experimentId: string;
  config: Record<string, unknown>;
  datasetVersion: string;
  codeVersion: string;
  metrics: Record<string, unknown>;
  createdAt: string;
  reproductionCommand: string;
}

export interface ExperimentsData {
  experiments: Experiment[];
}

export async function get<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      return {
        status: res.status === 401 ? 'UNAUTHORIZED' : res.status === 400 ? 'BAD_REQUEST' : 'DATA_UNAVAILABLE',
        reason: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
    const json = await res.json();
    return json;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network fetch failed';
    return {
      status: 'DATA_UNAVAILABLE',
      reason: msg,
    };
  }
}

export async function post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      return {
        status: res.status === 401 ? 'UNAUTHORIZED' : res.status === 400 ? 'BAD_REQUEST' : 'DATA_UNAVAILABLE',
        reason: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
    const json = await res.json();
    return json;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network fetch failed';
    return {
      status: 'DATA_UNAVAILABLE',
      reason: msg,
    };
  }
}

export interface PsiItem {
  feature: string;
  psi: number;
  status: 'STABLE' | 'WARNING' | 'DRIFT' | string;
}

export interface DriftEventItem {
  at: string;
  type: string;
  detail: string;
  severity: string;
}

export interface DriftData {
  symbol: string;
  psi: PsiItem[];
  events: DriftEventItem[];
  monitoringLevel: string;
}

export interface EvaluationMetrics {
  mae: number;
  rmse: number;
  smape: number;
  mase: number;
  directionalAccuracy: number;
  coverage80: number;
  calibrationError: number;
  samples: number;
}

export interface EvaluationFold {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  predicted: number;
  actual: number;
  within80?: boolean;
}

export interface EvaluationData {
  model: string;
  symbol: string;
  timeframe: string;
  horizon: string;
  folds: EvaluationFold[];
  metrics: EvaluationMetrics;
  latencyMs: number;
  experimentId: string;
  datasetVersion: string;
  codeVersion: string;
  reproductionCommand: string;
}

export interface LatencySample {
  endpoint: string;
  p50Ms: number;
  p95Ms: number;
  count: number;
  measuredAt: string;
}

export interface LatencyData {
  samples: LatencySample[];
  note?: string;
}

export interface ReplayRowData {
  replayTime: string;
  availableBars: number;
  featuresAvailable: string[];
  prediction: number;
  model: string;
  actual: number | null;
  error: number | null;
  leaked: boolean;
}

export interface ReplayData {
  symbol: string;
  timeframe: string;
  horizon: string;
  rows: ReplayRowData[];
  guarantee: string;
}
