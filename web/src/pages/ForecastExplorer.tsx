import React, { useState, useEffect } from 'react';
import {
  get,
  InstrumentsData,
  ForecastData,
  HistoricalForecast,
  MarketData,
} from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { ForecastChart } from '../components/ForecastChart';
import { MetricTile } from '../components/MetricTile';
import { DataTable, Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export const ForecastExplorer: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [horizon, setHorizon] = useState<string>('1h');

  const [forecastRes, setForecastRes] = useState<{
    status: string;
    data?: ForecastData;
    reason?: string;
  }>({ status: 'OK' });

  const [history, setHistory] = useState<HistoricalForecast[]>([]);
  const [candles, setCandles] = useState<Array<{ t: number; c: number }>>([]);

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((res) => {
      if (res.status === 'OK' && res.data?.instruments?.length) {
        const syms = res.data.instruments.map((i) => i.symbol);
        setInstruments(syms);
      }
    });
  }, []);

  useEffect(() => {
    // Fetch forecast
    get<ForecastData>(`/api/forecast/${symbol}?horizon=${horizon}`).then((res) => {
      setForecastRes({
        status: res.status,
        data: res.data,
        reason: res.reason,
      });
    });

    // Fetch history
    get<{ forecasts: HistoricalForecast[] }>(
      `/api/forecast/${symbol}?view=history&limit=50`
    ).then((res) => {
      if (res.status === 'OK' && res.data?.forecasts) {
        setHistory(res.data.forecasts);
      } else {
        setHistory([]);
      }
    });

    // Fetch market candles for chart background
    get<MarketData>(`/api/market/${symbol}?timeframe=${horizon === '7d' ? '1d' : horizon}&bars=50`).then((res) => {
      if (res.status === 'OK' && res.data?.candles) {
        setCandles(res.data.candles.map((c) => ({ t: c.t, c: c.c })));
      } else {
        setCandles([]);
      }
    });
  }, [symbol, horizon]);

  const fc = forecastRes.data;

  const historyCols: Column<HistoricalForecast>[] = [
    { key: 'targetTime', header: 'Target Time', render: (r) => <span className="mono">{r.targetTime || r.madeAt}</span> },
    { key: 'horizon', header: 'Horizon', render: (r) => <span className="mono">{r.horizon}</span> },
    { key: 'model', header: 'Model', render: (r) => <span className="mono" style={{ color: '#4fd1c5' }}>{r.model?.id}</span> },
    { key: 'point', header: 'Prediction', render: (r) => <span className="mono">{r.point?.toFixed(2)}</span> },
    { key: 'interval', header: '80% Interval', render: (r) => <span className="mono">[{r.lower?.toFixed(2)}, {r.upper?.toFixed(2)}]</span> },
    { key: 'actual', header: 'Actual', render: (r) => <span className="mono">{r.actual !== null && r.actual !== undefined ? r.actual.toFixed(2) : '-'}</span> },
    { key: 'error', header: 'Error', render: (r) => <span className="mono" style={{ color: r.error && r.error > 0 ? '#d69e2e' : '#48bb78' }}>{r.error !== null && r.error !== undefined ? r.error.toFixed(2) : '-'}</span> },
    { key: 'resolved', header: 'Status', render: (r) => <StatusBadge status={r.resolved ? 'OK' : 'HISTORICAL'} label={r.resolved ? 'RESOLVED' : 'PENDING'} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">FORECAST EXPLORER</h2>
          <StatusBadge status={forecastRes.status} />
        </div>
        <div className="page-question">
          Research Question: What is the calibrated uncertainty interval, routing evidence, and historical accuracy for this forecast?
        </div>
      </div>

      {/* Toolbar Controls */}
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="toolbar-label">Instrument:</label>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {instruments.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <label className="toolbar-label">Horizon:</label>
          <select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
            {['5m', '15m', '1h', '4h', '1d', '7d'].map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
      </div>

      {/* STRICT RULE: NEVER render a forecast when status !== 'OK' */}
      {forecastRes.status !== 'OK' || !fc ? (
        <EmptyState
          status={forecastRes.status}
          reason={forecastRes.reason}
          missingMessage={`Forecast withheld or unavailable for ${symbol} horizon=${horizon}`}
        />
      ) : (
        <>
          {/* Forecast Summary Tiles */}
          <div className="grid-4">
            <MetricTile
              label="Point Prediction"
              value={fc.point.toFixed(2)}
              subtext={`Target: ${fc.targetTime || 'Next Step'}`}
              badge={<StatusBadge status="OK" label="CALIBRATED" />}
              accentColor="#4fd1c5"
            />
            <MetricTile
              label="80% Uncertainty Band"
              value={`[${fc.lower.toFixed(2)}, ${fc.upper.toFixed(2)}]`}
              subtext={`Band Width: ${fc.intervalWidth?.toFixed(2) || (fc.upper - fc.lower).toFixed(2)}`}
              accentColor="#9f7aea"
            />
            <MetricTile
              label="Selected Model"
              value={fc.model?.id || 'N/A'}
              subtext={`Version: ${fc.model?.version || 'v1'}`}
              accentColor="#48bb78"
            />
            <MetricTile
              label="Inference Latency"
              value={`${fc.latencyMs ?? 0} ms`}
              subtext={`Regime: ${fc.regime || 'NORMAL'}`}
              accentColor="#d69e2e"
            />
          </div>

          {/* Model Router Reason Evidence Panel */}
          {fc.router?.reason && (
            <div className="panel" style={{ borderLeft: '3px solid #4fd1c5' }}>
              <div className="panel-header">
                <span className="panel-title">Model Router Decision Evidence</span>
              </div>
              <p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#d7dde6' }}>
                {fc.router.reason}
              </p>
            </div>
          )}

          {/* Forecast Chart */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">{fc.symbol} {fc.horizon} Uncertainty Projection</span>
            </div>
            <ForecastChart candles={candles} forecast={fc} height={320} />
          </div>

          {/* Forecast History Table */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Historical Predictions vs Resolved Outcomes</span>
            </div>
            <DataTable
              columns={historyCols}
              data={history}
              keyField={(r, i) => `${r.targetTime || r.madeAt}-${i}`}
              emptyMessage="No historical prediction records found for this symbol"
            />
          </div>
        </>
      )}
    </div>
  );
};
