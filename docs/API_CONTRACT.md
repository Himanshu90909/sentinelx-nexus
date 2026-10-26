# SENTINELX NEXUS — HTTP API Contract (v1)

Base: same origin. All endpoints return JSON. Every payload carries `status`.

```
status: OK | DATA_UNAVAILABLE | STALE_DATA | MODEL_UNAVAILABLE |
        INSUFFICIENT_HISTORY | LEAKAGE_DETECTED | PROVIDER_RATE_LIMITED |
        NOT_CONFIGURED | UNAUTHORIZED
```

If `status !== "OK"`, `data` may be absent and `reason` explains the failure.
NEVER render a forecast when status is not OK. Never invent values client-side.

Common meta on data endpoints:
```json
{ "dataMode": "LIVE|DELAYED|HISTORICAL|SYNTHETIC",
  "provider": "binance|finnhub|synthetic|...",
  "generatedAt": "ISO-8601" }
```

---

## GET /api/health
`{ status:"OK", data:{ service, version, uptimeSeconds, instanceId, dataModeBanner } }`

## GET /api/architecture
`{ status:"OK", data:{ layers:[{name, role, components[]}], pipeline:[...], limitations:[...string] } }`

## GET /api/providers
`{ status:"OK", data:{ providers:[{ name, kind:"MARKET|HISTORICAL|STREAMING|FUNDAMENTALS|MACRO|NEWS|CRYPTO",
  configured, healthy, dataMode, lastSuccess, lastError, latencyMsMs, requests24h, cacheHitRate, requiredEnv }] } }`

## GET /api/instruments
`{ status:"OK", data:{ instruments:[{ id, symbol, name, assetClass, market, dataMode, active, source }] } }`
POST /api/instruments `{symbol, assetClass, market?}` + `Authorization: Bearer $ADMIN_TOKEN` → adds instrument (ADMIN only).

## GET /api/market/:symbol?timeframe=1h&bars=300
```json
{ "status":"OK", "dataMode":"LIVE", "provider":"binance",
  "data":{ "symbol","timeframe",
    "candles":[{"t":1698...,"o":..,"h":..,"l":..,"c":..,"v":..}],
    "quality":{"score":98.7,"components":[{"name":"missing_intervals","passed":true,"detail":"..."}]},
    "freshness":{"lastEvent":"ISO","ageSeconds":42,"stale":false} } }
```
Errors: NOT_CONFIGURED (no provider for that asset class), DATA_UNAVAILABLE, PROVIDER_RATE_LIMITED.

## GET /api/features/:symbol?timeframe=1h
`{ status, dataMode, data:{ symbol, timeframe, featureVersion, features:[{name,value,featureTimestamp,sourceTimestamp,availabilityTimestamp}] } }`

## GET /api/forecast/:symbol?horizon=1h
```json
{ "status":"OK","dataMode":"LIVE",
  "data":{ "symbol","horizon","madeAt","targetTime",
    "point":123.4,"lower":118.1,"upper":129.9,"intervalWidth":11.8,
    "confidence":0.72,
    "model":{"id":"ets_alpha_tuned","version":"v1"},
    "router":{"reason":"lowest sMAPE in walk-forward validation under current regime","evidence":{...}},
    "regime":"HIGH_VOLATILITY",
    "dataSnapshotId":"dsv_...","featureVersion":"f1.0","datasetVersion":"ds...","codeVersion":"git sha",
    "latencyMs":23 } }
```
Errors: INSUFFICIENT_HISTORY, MODEL_UNAVAILABLE, DATA_UNAVAILABLE, LEAKAGE_DETECTED (self-audit failure -> forecast withheld).

## GET /api/forecast/:symbol?view=history&limit=50
`{ data:{ forecasts:[{...forecast..., "actual":123.9|null, "error":0.5|null, "resolved":true}] } }`

## GET /api/matrix
`{ data:{ horizons:["5m","15m","1h","4h","1d"], rows:[{ symbol, dataMode, regime, freshnessAgeSeconds, cells:{ "1h":{status, point, lower, upper, model, modelStatus} , ...} }] } }`
Cell status can be a failure status; render it explicitly.

## GET /api/models
`{ data:{ models:[{ id, family:"BASELINE|CLASSICAL|EXTERNAL", status:"EXPERIMENTAL|VALIDATED|CANDIDATE|PRODUCTION|ARCHIVED",
  description, supportsIntervals:true, measured:[{symbol,horizon,smape,mase,coverage80}] } ] } }`

## GET /api/evaluation/:model?symbol=BTCUSDT&horizon=1h&timeframe=1h
Runs/returns walk-forward validation (expanding window, never shuffled).
`{ data:{ model, symbol, timeframe, horizon, folds:[{trainStart,trainEnd,testStart,testEnd,metrics}],
  metrics:{mae,rmse,smape,mase,directionalAccuracy,coverage80,calibrationError,samples}, latencyMs, experimentId } }`

## GET /api/regime/:symbol
`{ data:{ symbol, regime, since, confidence, drivers:[{name,value,contribution}], history:[{t,regime}] } }`

## GET /api/drift/:symbol
`{ data:{ symbol, psi:[{feature,psi,status:"STABLE|WARNING|DRIFT"}], events:[{t,type,detail,severity}], monitoringLevel } }`

## GET /api/data-quality/:symbol?timeframe=1h
`{ data:{ score, components:[...], events:[{t,type,detail}] } }`

## GET /api/leakage/:symbol
`{ data:{ events:[{feature,predictionTime,sourceTime,availabilityTime,severity,experimentId}],
  selfTest:{ ran, passed, description } } }`

## GET /api/replay/:symbol?horizon=1h&steps=12&timeframe=1h
`{ data:{ rows:[{ replayTime, availableBars, featuresAvailable, prediction, model, actual, error, leaked:false }] } }`
Guarantee: prediction at replayTime T uses ONLY bars with eventTime <= T. Test-enforced.

## GET /api/datasets
`{ data:{ versions:[{ datasetId, version, symbols, range, featureVersion, provider, checksum, createdAt, immutable }] } }`

## POST /api/synthetic  {symbol, bars, seed, trend, seasonality, vol, regimeShifts, gaps, outliers, break}
`{ dataMode:"SYNTHETIC", data:{ ...series metadata, candles:[...] } }` — always labeled SYNTHETIC.

## GET /api/experiments
`{ data:{ experiments:[{experimentId, config, datasetVersion, codeVersion, metrics, createdAt, reproductionCommand}] } }`

## GET /api/metrics/latency
`{ data:{ samples:[{endpoint, p50Ms, p95Ms, count, measuredAt}], note:"measured server-side, no estimates"} }`

## POST /api/admin/retrain  (+ ADMIN bearer)
`{ data:{ result:"VALIDATED|REJECTED", reason, candidateMetrics, productionMetrics, gate:"walk-forward benchmark vs production" } }`
Retraining never auto-promotes. Promotion: POST /api/admin/promote {modelId} requires validation evidence.
