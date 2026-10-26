import React, { useState, useEffect } from 'react';
import { get, InstrumentsData, RegimeData, RegimeDriver } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { MetricTile } from '../components/MetricTile';
import { DataTable, Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export const RegimeMonitor: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [symbol, setSymbol] = useState<string>('BTCUSDT');

  const [regimeRes, setRegimeRes] = useState<{
    status: string;
    data?: RegimeData;
    reason?: string;
  }>({ status: 'OK' });

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((res) => {
      if (res.status === 'OK' && res.data?.instruments?.length) {
        setInstruments(res.data.instruments.map((i) => i.symbol));
      }
    });
  }, []);

  useEffect(() => {
    get<RegimeData>(`/api/regime/${symbol}`).then((res) => {
      setRegimeRes({
        status: res.status,
        data: res.data,
        reason: res.reason,
      });
    });
  }, [symbol]);

  const regData = regimeRes.data;

  const driverCols: Column<RegimeDriver>[] = [
    { key: 'name', header: 'Feature Driver', render: (d) => <span className="mono" style={{ color: '#4fd1c5' }}>{d.name}</span> },
    { key: 'value', header: 'Observed Value', render: (d) => <span className="mono">{d.value.toFixed(4)}</span> },
    { key: 'contribution', header: 'Contribution Weight', render: (d) => <span className="mono" style={{ color: d.contribution > 0.3 ? '#d69e2e' : '#48bb78' }}>{(d.contribution * 100).toFixed(1)}%</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">REGIME MONITOR</h2>
          <StatusBadge status={regData?.regime || 'STABLE'} />
        </div>
        <div className="page-question">
          Research Question: What structural market regime is currently active, and what feature drivers induced the shift?
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
      </div>

      {regimeRes.status !== 'OK' || !regData ? (
        <EmptyState status={regimeRes.status} reason={regimeRes.reason} />
      ) : (
        <>
          {/* Regime State Summary */}
          <div className="grid-3">
            <MetricTile
              label="Active Regime"
              value={regData.regime}
              subtext={`Since: ${regData.since || 'N/A'}`}
              badge={<StatusBadge status="OK" label={regData.regime} />}
              accentColor="#4fd1c5"
            />
            <MetricTile
              label="Classifier Confidence"
              value={`${(regData.confidence * 100).toFixed(1)}%`}
              subtext="GMM / HMM posterior probability"
              accentColor="#9f7aea"
            />
            <MetricTile
              label="Top Driver Impact"
              value={regData.drivers?.[0] ? `${(regData.drivers[0].contribution * 100).toFixed(1)}%` : '0%'}
              subtext={regData.drivers?.[0]?.name || 'N/A'}
              accentColor="#d69e2e"
            />
          </div>

          {/* Drivers Table */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Feature Drivers Inducing Regime Classification</span>
            </div>
            <DataTable
              columns={driverCols}
              data={regData.drivers}
              keyField="name"
              emptyMessage="No regime feature drivers identified"
            />
          </div>

          {/* Regime History Timeline */}
          {regData.history && regData.history.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Historical Regime Transition Timeline</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {regData.history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: '#0a0e14',
                      border: '1px solid #1e2633',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  >
                    <div style={{ color: '#8b95a5', fontSize: '10px' }}>{String(h.t)}</div>
                    <div style={{ color: '#4fd1c5', fontWeight: 'bold', marginTop: '2px' }}>{h.regime}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
