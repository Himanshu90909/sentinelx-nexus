import React, { useEffect, useState } from 'react';
import { get, InstrumentsData, DriftData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export const DriftMonitor: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [res, setRes] = useState<{ status: string; data?: DriftData; reason?: string }>({ status: 'OK' });

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((r) => {
      if (r.status === 'OK' && r.data?.instruments?.length) {
        setInstruments(r.data.instruments.map((i) => i.symbol));
      }
    });
  }, []);

  useEffect(() => {
    get<DriftData>(`/api/drift/${symbol}`).then((r) =>
      setRes({ status: r.status, data: r.data, reason: r.reason })
    );
  }, [symbol]);

  const d = res.data;

  const psiCols: Column<{ feature: string; psi: number; status: string }>[] = [
    { key: 'feature', header: 'Feature', render: (p) => <span className="mono" style={{ color: '#4fd1c5' }}>{p.feature}</span> },
    { key: 'psi', header: 'PSI (0=stable)', render: (p) => <span className="mono">{p.psi.toFixed(4)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
  ];

  const eventCols: Column<{ at: string; type: string; detail: string; severity: string }>[] = [
    { key: 'at', header: 'Time', render: (e) => <span className="mono">{e.at}</span> },
    { key: 'type', header: 'Type', render: (e) => <span className="mono">{e.type}</span> },
    { key: 'detail', header: 'Detail', render: (e) => e.detail },
    { key: 'severity', header: 'Severity', render: (e) => <StatusBadge status={e.severity === 'CRITICAL' ? 'DRIFT' : e.severity} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">DRIFT MONITOR</h2>
          {d && <StatusBadge status={d.monitoringLevel === 'ELEVATED' ? 'WARNING' : 'STABLE'} label={d.monitoringLevel} />}
        </div>
        <div className="page-question">
          Research Question: Has the feature distribution shifted relative to its reference window (PSI &gt; 0.1 warning, &gt; 0.25 drift)?
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
      </div>

      {res.status !== 'OK' || !d ? (
        <EmptyState status={res.status} reason={res.reason} />
      ) : (
        <>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Population Stability Index per Feature (recent 40 vs prior 80 window)</span>
            </div>
            <DataTable columns={psiCols} data={d.psi} keyField="feature" emptyMessage="Need at least 120 bars of history to compute PSI" />
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Drift Events</span>
            </div>
            <DataTable columns={eventCols} data={d.events} keyField="at" emptyMessage="No drift events recorded" />
          </div>

          <div className="panel">
            <div className="panel-header"><span className="panel-title">Policy</span></div>
            <div style={{ color: '#8b95a5', fontSize: '12px', lineHeight: '18px' }}>
              Drift raises monitoring level and marks affected models for re-evaluation. It <strong style={{ color: '#d69e2e' }}>never</strong> automatically replaces a production model; promotion requires the admin validation gate.
            </div>
          </div>
        </>
      )}
    </div>
  );
};
