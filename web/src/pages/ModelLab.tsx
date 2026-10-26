import React, { useEffect, useState } from 'react';
import {
  get,
  ModelsData,
  ModelInfo,
  EvaluationData,
  InstrumentsData,
} from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { MetricTile } from '../components/MetricTile';
import { EmptyState } from '../components/EmptyState';

export const ModelLab: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [horizon, setHorizon] = useState<string>('1h');

  const [evalRes, setEvalRes] = useState<{
    status: string;
    data?: EvaluationData;
    reason?: string;
  } | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);

  useEffect(() => {
    get<ModelsData>('/api/models').then((res) => {
      if (res.status === 'OK' && res.data?.models) {
        setModels(res.data.models);
        if (res.data.models.length > 0) {
          setSelectedModel(res.data.models[0].id);
        }
      }
    });

    get<InstrumentsData>('/api/instruments').then((res) => {
      if (res.status === 'OK' && res.data?.instruments?.length) {
        setInstruments(res.data.instruments.map((i) => i.symbol));
      }
    });
  }, []);

  const runEvaluation = () => {
    if (!selectedModel) return;
    setEvaluating(true);
    get<EvaluationData>(
      `/api/evaluation/${selectedModel}?symbol=${symbol}&horizon=${horizon}&timeframe=${horizon}`
    ).then((res) => {
      setEvalRes({
        status: res.status,
        data: res.data,
        reason: res.reason,
      });
      setEvaluating(false);
    });
  };

  const modelCols: Column<ModelInfo>[] = [
    { key: 'id', header: 'Model ID', render: (m) => <span className="mono" style={{ color: '#4fd1c5', fontWeight: 'bold' }}>{m.id}</span> },
    { key: 'family', header: 'Family', render: (m) => <span className="mono">{m.family}</span> },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
    { key: 'supportsIntervals', header: 'Intervals', render: (m) => <StatusBadge status={m.supportsIntervals ? 'OK' : 'HISTORICAL'} label={m.supportsIntervals ? 'YES' : 'NO'} /> },
    { key: 'description', header: 'Description', render: (m) => <span style={{ color: '#8b95a5' }}>{m.description}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">MODEL LAB</h2>
          <StatusBadge status="OK" label="REGISTRY ACTIVE" />
        </div>
        <div className="page-question">
          Research Question: Which model architectures are registered, what are their baseline metrics, and how do they perform in walk-forward evaluation?
        </div>
      </div>

      {/* Models Registry Table */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Registered Model Architectures</span>
        </div>
        <DataTable
          columns={modelCols}
          data={models}
          keyField="id"
          emptyMessage="No models registered in registry"
        />
      </div>

      {/* Walk-Forward Evaluation Controls */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Run Walk-Forward Evaluation</span>
        </div>
        <div className="toolbar">
          <div className="toolbar-group">
            <label className="toolbar-label">Model:</label>
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.id} ({m.family})</option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Symbol:</label>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {instruments.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Horizon:</label>
            <select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              {['5m', '15m', '1h', '4h', '1d'].map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <button className="primary" onClick={runEvaluation} disabled={evaluating || !selectedModel}>
            {evaluating ? 'Running Walk-Forward...' : 'Run walk-forward evaluation'}
          </button>
        </div>
      </div>

      {/* Evaluation Results */}
      {evalRes && (
        <>
          {evalRes.status !== 'OK' || !evalRes.data ? (
            <EmptyState status={evalRes.status} reason={evalRes.reason} />
          ) : (
            <>
              <div className="grid-4">
                <MetricTile
                  label="sMAPE"
                  value={`${(evalRes.data.metrics.smape * 100).toFixed(2)}%`}
                  subtext="Symmetric Mean Abs Pct Error"
                  accentColor="#4fd1c5"
                />
                <MetricTile
                  label="MASE"
                  value={evalRes.data.metrics.mase.toFixed(3)}
                  subtext={evalRes.data.metrics.mase > 1 ? 'Worse than naive (>1.0)' : 'Better than naive (<1.0)'}
                  badge={<StatusBadge status={evalRes.data.metrics.mase <= 1 ? 'OK' : 'WARNING'} />}
                  accentColor={evalRes.data.metrics.mase <= 1 ? '#48bb78' : '#d69e2e'}
                />
                <MetricTile
                  label="Coverage 80%"
                  value={`${(evalRes.data.metrics.coverage80 * 100).toFixed(1)}%`}
                  subtext="Target: 80.0% nominal"
                  accentColor="#9f7aea"
                />
                <MetricTile
                  label="Directional Accuracy"
                  value={`${(evalRes.data.metrics.directionalAccuracy * 100).toFixed(1)}%`}
                  subtext={`Folds evaluated: ${evalRes.data.folds.length}`}
                  accentColor="#48bb78"
                />
              </div>

              {/* Folds Table */}
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Expanding Window Walk-Forward Folds</span>
                </div>
                <div className="table-container">
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th>Fold #</th>
                        <th>Train Window</th>
                        <th>Test Window</th>
                        <th>Predicted</th>
                        <th>Actual</th>
                        <th>80% Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalRes.data.folds.map((fold, idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'monospace' }}>Fold {idx + 1}</td>
                          <td style={{ fontFamily: 'monospace', color: '#8b95a5' }}>
                            {fold.trainStart} → {fold.trainEnd}
                          </td>
                          <td style={{ fontFamily: 'monospace', color: '#8b95a5' }}>
                            {fold.testStart} → {fold.testEnd}
                          </td>
                          <td style={{ fontFamily: 'monospace', color: '#4fd1c5' }}>{fold.predicted.toFixed(4)}</td>
                          <td style={{ fontFamily: 'monospace' }}>{fold.actual.toFixed(4)}</td>
                          <td style={{ fontFamily: 'monospace', color: fold.within80 === undefined ? '#8b95a5' : fold.within80 ? '#48bb78' : '#e05252' }}>
                            {fold.within80 === undefined ? '-' : fold.within80 ? 'in band' : 'outside'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
