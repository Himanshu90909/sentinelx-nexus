import React from 'react';
import { get, ProvidersData, ProviderInfo } from '../api';
import { usePoll } from '../components/usePoll';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { providerText, timeAgo } from '../humanize';

export const ProviderHealth: React.FC = () => {
  const { data, lastUpdated } = usePoll<ProvidersData>(() => get<ProvidersData>('/api/providers'), 30000);

  const providers: ProviderInfo[] = data?.data?.providers ?? [];

  const cols: Column<ProviderInfo>[] = [
    { key: 'name', header: 'Data source', render: (p) => <span className="mono" style={{ color: '#4fd1c5' }}>{providerText(p.name)}</span> },
    { key: 'kind', header: 'What it provides', render: (p) => <span style={{ fontSize: '12px' }}>{p.kind}</span> },
    {
      key: 'configured',
      header: 'API key',
      render: (p) => <StatusBadge status={p.configured ? 'OK' : 'NOT_CONFIGURED'} label={p.configured ? 'Ready' : 'Not added'} />,
    },
    {
      key: 'healthy',
      header: 'Status',
      render: (p) =>
        p.healthy === null ? (
          <span className="mono" style={{ color: '#8b95a5' }}>not used yet</span>
        ) : (
          <StatusBadge status={p.healthy ? 'OK' : 'FAIL'} label={p.healthy ? 'Connected' : 'Having issues'} />
        ),
    },
    { key: 'dataMode', header: 'Data freshness', render: (p) => <StatusBadge status={p.dataMode} /> },
    {
      key: 'latencyMs',
      header: 'Response time',
      render: (p) => <span className="mono">{p.latencyMs != null ? `${p.latencyMs}ms` : '-'}</span>,
    },
    {
      key: 'lastSuccess',
      header: 'Last used',
      render: (p) => {
        if (!p.lastSuccess) return <span className="mono" style={{ color: '#8b95a5' }}>never</span>;
        const secs = (Date.now() - new Date(p.lastSuccess).getTime()) / 1000;
        return <span className="mono" style={{ color: '#8b95a5' }}>{timeAgo(secs)}</span>;
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <h2 className="page-title">DATA SOURCES</h2>
        <div className="page-question">
          Where does the platform's data come from, and is every source working right now?
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">All sources (checked every 30s)</span>
          <span className="mono" style={{ color: '#8b95a5', fontSize: '11px' }}>
            {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : ''}
          </span>
        </div>
        <DataTable columns={cols} data={providers} keyField="name" emptyMessage="Loading data sources..." />
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">How fallback works</span></div>
        <div style={{ color: '#8b95a5', fontSize: '12px', lineHeight: '18px' }}>
          If a source fails, the platform automatically switches to the next one and records the switch - it never
          mixes sources silently. Sources without an API key are skipped; until you add keys, those markets run on
          clearly-labeled <span className="mono" style={{ color: '#9f7aea' }}>sample data</span>.
        </div>
      </div>
    </div>
  );
};
