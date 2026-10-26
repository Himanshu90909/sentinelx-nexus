import React, { useEffect, useState } from 'react';
import { get, DatasetsData, DatasetVersion } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export const Datasets: React.FC = () => {
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [status, setStatus] = useState<string>('OK');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    get<DatasetsData>('/api/datasets').then((res) => {
      setStatus(res.status);
      if (res.status === 'OK' && res.data?.versions) {
        setDatasets(res.data.versions);
      } else {
        setReason(res.reason || 'Failed to fetch dataset version registry');
      }
    });
  }, []);

  const cols: Column<DatasetVersion>[] = [
    { key: 'version', header: 'Version ID', render: (d) => <span className="mono" style={{ color: '#4fd1c5', fontWeight: 'bold' }}>{d.version}</span> },
    { key: 'symbols', header: 'Symbols', render: (d) => <span className="mono">{d.symbols.join(', ')}</span> },
    { key: 'range', header: 'Temporal Range', render: (d) => <span className="mono" style={{ color: '#8b95a5' }}>{d.range}</span> },
    { key: 'featureVersion', header: 'Feature Schema', render: (d) => <span className="mono" style={{ color: '#9f7aea' }}>{d.featureVersion}</span> },
    { key: 'provider', header: 'Source Provider', render: (d) => <span className="mono">{d.provider}</span> },
    { key: 'checksum', header: 'SHA256 Checksum', render: (d) => <span className="mono" style={{ color: '#8b95a5' }}>{d.checksum ? `${d.checksum.slice(0, 12)}...` : '-'}</span> },
    { key: 'immutable', header: 'Immutable', render: (d) => <StatusBadge status={d.immutable ? 'OK' : 'WARNING'} label={d.immutable ? 'LOCK' : 'MUTABLE'} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">DATASET REGISTRY</h2>
          <StatusBadge status={status} />
        </div>
        <div className="page-question">
          Research Question: Which immutable data snapshot versions underpin model training, evaluation, and feature store state?
        </div>
      </div>

      {status !== 'OK' ? (
        <EmptyState status={status} reason={reason} />
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Immutable Data Snapshot Versions</span>
          </div>
          <DataTable
            columns={cols}
            data={datasets}
            keyField="version"
            emptyMessage="No dataset versions found in registry"
          />
        </div>
      )}
    </div>
  );
};
