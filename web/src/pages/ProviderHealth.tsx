import React from 'react';
import { get, ProvidersData, ProviderInfo } from '../api';
import { usePoll } from '../components/usePoll';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';

interface LegendRow {
  name: string;
  env: string;
  note: string;
}

const ENV_LEGEND: LegendRow[] = [
  { name: 'binance', env: '(none - public REST)', note: 'LIVE crypto; geo-blocked (HTTP 451) in some regions' },
  { name: 'kraken', env: '(none - public REST)', note: 'LIVE crypto fallback; works from US serverless regions' },
  { name: 'coingecko', env: 'COINGECKO_API_KEY (optional)', note: 'supplementary crypto metadata, delayed' },
  { name: 'finnhub', env: 'FINNHUB_API_KEY', note: 'US equities/news/fundamentals; candle access is plan-gated' },
  { name: 'twelvedata', env: 'TWELVE_DATA_API_KEY', note: 'equities/forex; free tier is delayed' },
  { name: 'alpaca', env: 'ALPACA_API_KEY + ALPACA_SECRET_KEY', note: 'equities; IEX feed is 15-min delayed on free tier' },
  { name: 'polygon', env: 'POLYGON_API_KEY', note: 'equities/indices; data mode is plan-dependent' },
  { name: 'fred', env: 'FRED_API_KEY', note: 'macro series; released on schedule (HISTORICAL)' },
  { name: 'sec', env: '(none - public)', note: 'SEC EDGAR company facts' },
  { name: 'fmp', env: 'FMP_API_KEY', note: 'fundamentals fallback' },
];

export const ProviderHealth: React.FC = () => {
  const { data, lastUpdated } = usePoll<ProvidersData>(() => get<ProvidersData>('/api/providers'), 30000);

  const providers: ProviderInfo[] = data?.data?.providers ?? [];

  const cols: Column<ProviderInfo>[] = [
    { key: 'name', header: 'Provider', render: (p) => <span className="mono" style={{ color: '#4fd1c5' }}>{p.name}</span> },
    { key: 'kind', header: 'Kind', render: (p) => p.kind },
    {
      key: 'configured',
      header: 'Configured',
      render: (p) => <StatusBadge status={p.configured ? 'OK' : 'NOT_CONFIGURED'} label={p.configured ? 'CONFIGURED' : 'NOT CONFIGURED'} />,
    },
    {
      key: 'healthy',
      header: 'Health',
      render: (p) =>
        p.healthy === null ? (
          <span className="mono" style={{ color: '#8b95a5' }}>unprobed</span>
        ) : (
          <StatusBadge status={p.healthy ? 'OK' : 'DRIFT'} label={p.healthy ? 'HEALTHY' : 'FAILING'} />
        ),
    },
    { key: 'dataMode', header: 'Data Mode', render: (p) => <StatusBadge status={p.dataMode} /> },
    { key: 'latencyMs', header: 'Last Latency', render: (p) => <span className="mono">{p.latencyMs != null ? `${p.latencyMs}ms` : '-'}</span> },
    { key: 'requests', header: 'Requests', render: (p) => <span className="mono">{p.requests ?? 0}</span> },
    {
      key: 'cacheHitRate',
      header: 'Cache Hit Rate',
      render: (p) => <span className="mono">{p.cacheHitRate != null ? `${(p.cacheHitRate * 100).toFixed(0)}%` : '-'}</span>,
    },
    { key: 'lastSuccess', header: 'Last Success', render: (p) => <span className="mono">{p.lastSuccess ?? '-'}</span> },
    {
      key: 'lastError',
      header: 'Last Error',
      render: (p) => (
        <span className="mono" style={{ color: '#e05252', fontSize: '10px', wordBreak: 'break-all' }}>
          {p.lastError ? p.lastError.split(' @ ')[0] : '-'}
        </span>
      ),
    },
  ];

  const legendCols: Column<LegendRow>[] = [
    { key: 'name', header: 'Provider', render: (l) => <span className="mono" style={{ color: '#4fd1c5' }}>{l.name}</span> },
    { key: 'env', header: 'Env', render: (l) => <span className="mono">{l.env}</span> },
    { key: 'note', header: 'Notes', render: (l) => l.note },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <h2 className="page-title">PROVIDER HEALTH</h2>
        <div className="page-question">
          Research Question: Which data providers are configured, healthy, and what did they last serve?
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Provider Registry (30s polling)</span>
          <span className="mono" style={{ color: '#8b95a5', fontSize: '11px' }}>
            {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : ''}
          </span>
        </div>
        <DataTable columns={cols} data={providers} keyField="name" emptyMessage="Loading provider registry..." />
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">Required Environment Variables (server-side only, never exposed to this client)</span></div>
        <DataTable columns={legendCols} data={ENV_LEGEND} keyField="name" emptyMessage="" />
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">Fallback Policy</span></div>
        <div style={{ color: '#8b95a5', fontSize: '12px', lineHeight: '18px' }}>
          Each asset class has a priority-ordered fallback chain. A failing provider is skipped and the switch is recorded (never mixed silently).
          If the entire chain is unconfigured, the platform serves <span className="mono" style={{ color: '#9f7aea' }}>SYNTHETIC</span> labeled data
          (disable with SYNTHETIC_FALLBACK=false).
        </div>
      </div>
    </div>
  );
};
