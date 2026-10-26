import React from 'react';
import { get, LatencyData, LatencySample } from '../api';
import { usePoll } from '../components/usePoll';
import { EmptyState } from '../components/EmptyState';
import { DataTable, Column } from '../components/DataTable';

export const PerformanceLab: React.FC = () => {
  const { data, error, lastUpdated } = usePoll<LatencyData>(() => get<LatencyData>('/api/metrics/latency'), 30000);

  const samples: LatencySample[] = data?.data?.samples ?? [];

  const cols: Column<LatencySample>[] = [
    { key: 'endpoint', header: 'Endpoint', render: (s) => <span className="mono" style={{ color: '#4fd1c5' }}>{s.endpoint}</span> },
    { key: 'p50Ms', header: 'p50 (ms)', render: (s) => <span className="mono">{s.p50Ms}</span> },
    { key: 'p95Ms', header: 'p95 (ms)', render: (s) => <span className="mono" style={{ color: s.p95Ms > 1000 ? '#d69e2e' : '#d7dde6' }}>{s.p95Ms}</span> },
    { key: 'count', header: 'Samples', render: (s) => <span className="mono">{s.count}</span> },
    { key: 'measuredAt', header: 'Measured At', render: (s) => <span className="mono">{s.measuredAt}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <h2 className="page-title">PERFORMANCE LAB</h2>
        <div className="page-question">
          Research Question: What are the measured p50/p95 latencies of each API endpoint?
        </div>
      </div>

      {error && <EmptyState status="DATA_UNAVAILABLE" reason={error} />}

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Server-Side Latency (30s polling)</span>
          <span className="mono" style={{ color: '#8b95a5', fontSize: '11px' }}>
            {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : ''}
          </span>
        </div>
        <DataTable columns={cols} data={samples} keyField="endpoint" emptyMessage="No latency samples recorded yet - exercise the API first" />
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">Method</span></div>
        <div style={{ color: '#8b95a5', fontSize: '12px', lineHeight: '18px' }}>
          Every handler is wrapped and timed server-side; p50/p95 are computed from the per-endpoint ring buffer on this serverless instance.
          Values are <strong>measured</strong>, never estimated or extrapolated. Latency includes provider fetch, feature computation, routing, and inference.
        </div>
      </div>
    </div>
  );
};
