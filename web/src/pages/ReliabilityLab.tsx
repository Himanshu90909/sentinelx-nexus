import React, { useEffect, useState } from 'react';
import { get, InstrumentsData, ModelsData, EvaluationData, ModelInfo } from '../api';
import { EmptyState } from '../components/EmptyState';
import { DataTable, Column } from '../components/DataTable';

interface ComparisonRow {
  model: string;
  mae?: number;
  rmse?: number;
  smape?: number;
  mase?: number;
  directionalAccuracy?: number;
  coverage80?: number;
  latencyMs?: number;
  status: string;
}

const HORIZONS = ['5m', '15m', '1h', '4h', '1d', '7d'];

export const ReliabilityLab: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [horizon, setHorizon] = useState('1h');
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((r) => {
      if (r.status === 'OK' && r.data?.instruments?.length) {
        setInstruments(r.data.instruments.map((i) => i.symbol));
      }
    });
    get<ModelsData>('/api/models').then((r) => {
      if (r.status === 'OK' && r.data?.models) setModels(r.data.models);
    });
  }, []);

  const run = async () => {
    setRunning(true);
    setRows([]);
    const out: ComparisonRow[] = [];
    for (const m of models) {
      setProgress(`evaluating ${m.id}...`);
      const r = await get<EvaluationData>(`/api/evaluation/${m.id}?symbol=${symbol}&horizon=${horizon}`);
      if (r.status === 'OK' && r.data) {
        out.push({
          model: m.id,
          mae: r.data.metrics.mae,
          rmse: r.data.metrics.rmse,
          smape: r.data.metrics.smape,
          mase: r.data.metrics.mase,
          directionalAccuracy: r.data.metrics.directionalAccuracy,
          coverage80: r.data.metrics.coverage80,
          latencyMs: r.data.latencyMs,
          status: r.status,
        });
      } else {
        out.push({ model: m.id, status: r.status });
      }
      setRows([...out]);
    }
    setRunning(false);
    setProgress('');
  };

  const cols: Column<ComparisonRow>[] = [
    { key: 'model', header: 'Model', render: (r) => <span className="mono" style={{ color: '#4fd1c5' }}>{r.model}</span> },
    { key: 'mae', header: 'MAE', render: (r) => <span className="mono">{r.mae !== undefined ? r.mae.toFixed(4) : '-'}</span> },
    { key: 'rmse', header: 'RMSE', render: (r) => <span className="mono">{r.rmse !== undefined ? r.rmse.toFixed(4) : '-'}</span> },
    { key: 'smape', header: 'sMAPE %', render: (r) => <span className="mono">{r.smape !== undefined ? r.smape.toFixed(2) : '-'}</span> },
    {
      key: 'mase',
      header: 'MASE',
      render: (r) =>
        r.mase === undefined ? (
          <span className="mono">-</span>
        ) : (
          <span className="mono" style={{ color: r.mase > 1 ? '#e05252' : '#48bb78' }}>{r.mase.toFixed(3)}</span>
        ),
    },
    { key: 'directionalAccuracy', header: 'Dir. Acc.', render: (r) => <span className="mono">{r.directionalAccuracy !== undefined ? (r.directionalAccuracy * 100).toFixed(1) + '%' : '-'}</span> },
    { key: 'coverage80', header: 'Coverage 80%', render: (r) => <span className="mono">{r.coverage80 !== undefined ? (r.coverage80 * 100).toFixed(1) + '%' : '-'}</span> },
    { key: 'latencyMs', header: 'Eval Latency', render: (r) => <span className="mono">{r.latencyMs !== undefined ? r.latencyMs + 'ms' : '-'}</span> },
    { key: 'status', header: 'Status', render: (r) => (r.mae === undefined ? <span className="mono" style={{ color: '#e05252' }}>{r.status}</span> : <span className="mono" style={{ color: '#48bb78' }}>OK</span>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <h2 className="page-title">RELIABILITY LAB</h2>
        <div className="page-question">
          Research Question: Which model is most accurate, best calibrated, and most robust across walk-forward folds for a given instrument and horizon?
        </div>
      </div>

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
            {HORIZONS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <button className="run-button" onClick={run} disabled={running}>
          {running ? progress || 'Running...' : 'Run walk-forward comparison'}
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Measured Walk-Forward Results ({models.length} models)</span>
        </div>
        <DataTable columns={cols} data={rows} keyField="model" emptyMessage="Not yet measured - run the comparison to produce measured results" />
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">Reading the table</span></div>
        <div style={{ color: '#8b95a5', fontSize: '12px', lineHeight: '18px' }}>
          Metrics come from expanding-window walk-forward validation (never shuffled). Baselines (naive) are the reference: <span className="mono">MASE &gt; 1</span> means the model is <strong>worse than the naive baseline</strong>. Coverage 80% should be near 80% for a well-calibrated interval. Only measured results are displayed.
        </div>
      </div>
    </div>
  );
};
