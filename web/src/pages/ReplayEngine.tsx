import React, { useEffect, useState } from 'react';
import { get, InstrumentsData, ReplayData, ReplayRowData } from '../api';
import { EmptyState } from '../components/EmptyState';
import { DataTable, Column } from '../components/DataTable';

const HORIZONS = ['5m', '15m', '1h', '4h', '1d', '7d'];

export const ReplayEngine: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [horizon, setHorizon] = useState('1h');
  const [steps, setSteps] = useState(12);
  const [res, setRes] = useState<{ status: string; data?: ReplayData; reason?: string }>({ status: 'OK' });
  const [running, setRunning] = useState(false);

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((r) => {
      if (r.status === 'OK' && r.data?.instruments?.length) {
        setInstruments(r.data.instruments.map((i) => i.symbol));
      }
    });
  }, []);

  const run = async () => {
    setRunning(true);
    const r = await get<ReplayData>(`/api/replay/${symbol}?horizon=${horizon}&steps=${steps}`);
    setRes({ status: r.status, data: r.data, reason: r.reason });
    setRunning(false);
  };

  const d = res.data;
  const rows: ReplayRowData[] = d?.rows ?? [];
  const allClean = rows.length > 0 && rows.every((r) => !r.leaked);

  const cols: Column<ReplayRowData>[] = [
    { key: 'replayTime', header: 'Replay Time (T)', render: (r) => <span className="mono">{r.replayTime}</span> },
    { key: 'availableBars', header: 'Bars Visible at T', render: (r) => <span className="mono">{r.availableBars}</span> },
    {
      key: 'featuresAvailable',
      header: 'Features Available',
      render: (r) => <span className="mono" style={{ fontSize: '10px' }}>{r.featuresAvailable.length} trailing-window features</span>,
    },
    { key: 'prediction', header: 'Prediction (made at T)', render: (r) => <span className="mono" style={{ color: '#4fd1c5' }}>{r.prediction.toFixed(4)}</span> },
    { key: 'model', header: 'Model', render: (r) => <span className="mono">{r.model}</span> },
    { key: 'actual', header: 'Actual (T + horizon)', render: (r) => <span className="mono">{r.actual !== null ? r.actual.toFixed(4) : '-'}</span> },
    {
      key: 'error',
      header: 'Error',
      render: (r) => (
        <span className="mono" style={{ color: r.error === null ? '#8b95a5' : '#d69e2e' }}>
          {r.error !== null ? r.error.toFixed(4) : 'unresolved'}
        </span>
      ),
    },
    {
      key: 'leaked',
      header: 'Leakage Check',
      render: (r) => (
        <span className="mono" style={{ color: r.leaked ? '#e05252' : '#48bb78' }}>{r.leaked ? 'LEAKED' : 'false'}</span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <h2 className="page-title">Replay Engine</h2>
        <div className="page-question">
          If we replay history as if it were arriving in real time, do predictions made at T use only information available at T?
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
        <div className="toolbar-group">
          <label className="toolbar-label">Steps:</label>
          <input
            type="number"
            min={1}
            max={24}
            value={steps}
            onChange={(e) => setSteps(Math.max(1, Math.min(24, Number(e.target.value) || 12)))}
            style={{ width: '60px' }}
          />
        </div>
        <button className="run-button" onClick={run} disabled={running}>
          {running ? 'Replaying...' : 'Run replay'}
        </button>
      </div>

      {res.status !== 'OK' || !d ? (
        <EmptyState status={res.status} reason={res.reason} missingMessage="Configure a replay run to evaluate the pipeline as-if-real-time" />
      ) : (
        <>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Replay Audit Trail</span>
              {allClean && <span className="mono" style={{ color: '#48bb78', fontSize: '11px' }}>ALL ROWS LEAK-FREE</span>}
            </div>
            <DataTable columns={cols} data={rows} keyField="replayTime" emptyMessage="Not enough history to replay this instrument" />
          </div>

          <div className="panel">
            <div className="panel-header"><span className="panel-title">No-Lookahead Guarantee</span></div>
            <div style={{ color: '#8b95a5', fontSize: '12px', lineHeight: '18px' }}>
              {d.guarantee}
              <br /><br />
              Rule: a feature may be used only if <span className="mono">availability_timestamp &lt;= prediction_timestamp</span>. Every replay row is
              verified by the leakage auditor; a leaked row would fail loudly, not silently.
            </div>
          </div>
        </>
      )}
    </div>
  );
};
