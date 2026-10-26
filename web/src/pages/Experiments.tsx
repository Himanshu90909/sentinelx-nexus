import React, { useEffect, useState } from 'react';
import { get, ExperimentsData, Experiment } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export const Experiments: React.FC = () => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [status, setStatus] = useState<string>('OK');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    get<ExperimentsData>('/api/experiments').then((res) => {
      setStatus(res.status);
      if (res.status === 'OK' && res.data?.experiments) {
        setExperiments(res.data.experiments);
      } else {
        setReason(res.reason || 'Failed to fetch experiment tracking records');
      }
    });
  }, []);

  const cols: Column<Experiment>[] = [
    { key: 'experimentId', header: 'Experiment ID', render: (e) => <span className="mono" style={{ color: '#4fd1c5', fontWeight: 'bold' }}>{e.experimentId}</span> },
    { key: 'datasetVersion', header: 'Dataset Version', render: (e) => <span className="mono" style={{ color: '#9f7aea' }}>{e.datasetVersion}</span> },
    { key: 'codeVersion', header: 'Code SHA', render: (e) => <span className="mono" style={{ color: '#8b95a5' }}>{e.codeVersion}</span> },
    { key: 'metrics', header: 'Key Metrics', render: (e) => <span className="mono">{JSON.stringify(e.metrics)}</span> },
    { key: 'reproductionCommand', header: 'Reproduction Command', render: (e) => <code style={{ backgroundColor: '#0a0e14', padding: '3px 6px', border: '1px solid #1e2633', borderRadius: '3px', color: '#4fd1c5' }}>{e.reproductionCommand}</code> },
    { key: 'createdAt', header: 'Created', render: (e) => <span className="mono">{e.createdAt}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">EXPERIMENTS REGISTRY</h2>
          <StatusBadge status={status} />
        </div>
        <div className="page-question">
          Research Question: What active and completed research experiments exist, and how can they be deterministically reproduced?
        </div>
      </div>

      {status !== 'OK' ? (
        <EmptyState status={status} reason={reason} />
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Deterministic ML Experiments</span>
          </div>
          <DataTable
            columns={cols}
            data={experiments}
            keyField="experimentId"
            emptyMessage="No experiments logged in system"
          />
        </div>
      )}
    </div>
  );
};
