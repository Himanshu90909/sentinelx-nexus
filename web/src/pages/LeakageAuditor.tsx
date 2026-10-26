import React, { useState, useEffect } from 'react';
import { get, InstrumentsData, LeakageData, LeakageEvent } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { MetricTile } from '../components/MetricTile';
import { EmptyState } from '../components/EmptyState';

export const LeakageAuditor: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [symbol, setSymbol] = useState<string>('BTCUSDT');

  const [leakageRes, setLeakageRes] = useState<{
    status: string;
    data?: LeakageData;
    reason?: string;
  }>({ status: 'OK' });

  const [testing, setTesting] = useState<boolean>(false);

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((res) => {
      if (res.status === 'OK' && res.data?.instruments?.length) {
        setInstruments(res.data.instruments.map((i) => i.symbol));
      }
    });
  }, []);

  const fetchLeakage = () => {
    setTesting(true);
    get<LeakageData>(`/api/leakage/${symbol}`).then((res) => {
      setLeakageRes({
        status: res.status,
        data: res.data,
        reason: res.reason,
      });
      setTesting(false);
    });
  };

  useEffect(() => {
    fetchLeakage();
  }, [symbol]);

  const lData = leakageRes.data;
  const selfTestPassed = lData?.selfTest?.passed ?? true;

  const cols: Column<LeakageEvent>[] = [
    { key: 'feature', header: 'Feature Name', render: (e) => <span className="mono" style={{ color: '#4fd1c5' }}>{e.feature}</span> },
    { key: 'predictionTime', header: 'Prediction Time (T)', render: (e) => <span className="mono">{e.predictionTime}</span> },
    { key: 'sourceTime', header: 'Source Time', render: (e) => <span className="mono">{e.sourceTime}</span> },
    { key: 'availabilityTime', header: 'Availability Time (T_avail)', render: (e) => <span className="mono" style={{ color: e.availabilityTime > e.predictionTime ? '#e05252' : '#48bb78' }}>{e.availabilityTime}</span> },
    { key: 'severity', header: 'Severity', render: (e) => <StatusBadge status={e.severity} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">TEMPORAL LEAKAGE AUDITOR</h2>
          <StatusBadge status={selfTestPassed ? 'OK' : 'LEAKAGE_DETECTED'} label={selfTestPassed ? 'ZERO LEAKAGE' : 'LEAKAGE DETECTED'} />
        </div>
        <div className="page-question">
          Research Question: Are feature timestamps strictly non-causal (availability &lt;= prediction time) with zero lookahead bias?
        </div>
      </div>

      {/* Controls & Toolbar */}
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="toolbar-label">Instrument:</label>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {instruments.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <button className="primary" onClick={fetchLeakage} disabled={testing}>
          {testing ? 'Auditing Causality...' : 'Run live self-test'}
        </button>
      </div>

      {leakageRes.status !== 'OK' || !lData ? (
        <EmptyState status={leakageRes.status} reason={leakageRes.reason} />
      ) : (
        <>
          {/* Big Pass / Fail Audit Panel */}
          <div
            className="panel"
            style={{
              backgroundColor: selfTestPassed ? 'rgba(72, 187, 120, 0.08)' : 'rgba(224, 82, 82, 0.08)',
              borderColor: selfTestPassed ? '#48bb78' : '#e05252',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: selfTestPassed ? '#48bb78' : '#e05252', fontFamily: 'monospace' }}>
                  {selfTestPassed ? 'SELF-TEST PASSED: ZERO TEMPORAL LEAKAGE' : 'AUDIT FAILED: LOOKAHEAD LEAKAGE DETECTED'}
                </h3>
                <p style={{ fontSize: '12px', color: '#8b95a5', marginTop: '4px' }}>
                  {lData.selfTest?.description || 'Strict causality assertion: availability_timestamp <= prediction_timestamp'}
                </p>
              </div>
              <StatusBadge status={selfTestPassed ? 'PASS' : 'FAIL'} />
            </div>
          </div>

          {/* Temporal Causality Mathematical Guarantee Explanation */}
          <div className="panel" style={{ borderLeft: '3px solid #4fd1c5' }}>
            <div className="panel-header">
              <span className="panel-title">Strict Causality Axiom</span>
            </div>
            <p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#d7dde6' }}>
              Axiom: For any prediction executed at timestamp <span style={{ color: '#4fd1c5' }}>T_pred</span>, every feature value <span style={{ color: '#4fd1c5' }}>X_i</span> incorporated into model inference MUST satisfy:
            </p>
            <div style={{ backgroundColor: '#0a0e14', padding: '10px', marginTop: '8px', border: '1px solid #1e2633', fontFamily: 'monospace', fontSize: '12px', color: '#48bb78' }}>
              availability_timestamp(X_i) &lt;= prediction_timestamp(T_pred)
            </div>
          </div>

          {/* Detected Events Table */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Feature Event Causality Log ({lData.events.length} events)</span>
            </div>
            <DataTable
              columns={cols}
              data={lData.events}
              keyField={(row, i) => `${row.feature}-${i}`}
              emptyMessage="No causality violations or leakage events detected"
            />
          </div>
        </>
      )}
    </div>
  );
};
