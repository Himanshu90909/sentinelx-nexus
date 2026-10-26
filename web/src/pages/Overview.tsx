import { regimeText } from '../humanize';
import React, { useEffect, useState } from 'react';
import { get, HealthData, MatrixData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { MetricTile } from '../components/MetricTile';
import { EmptyState } from '../components/EmptyState';

export const Overview: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [healthStatus, setHealthStatus] = useState<string>('OK');
  const [matrixStatus, setMatrixStatus] = useState<string>('OK');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    get<HealthData>('/api/health').then((res) => {
      setHealthStatus(res.status);
      if (res.status === 'OK' && res.data) {
        setHealth(res.data);
      } else {
        setReason(res.reason || 'Health check failed');
      }
    });

    get<MatrixData>('/api/matrix').then((res) => {
      setMatrixStatus(res.status);
      if (res.status === 'OK' && res.data) {
        setMatrix(res.data);
      }
    });
  }, []);

  const totalCells = matrix?.rows
    ? matrix.rows.reduce((acc, row) => acc + Object.keys(row.cells).length, 0)
    : 0;

  const okCells = matrix?.rows
    ? matrix.rows.reduce(
        (acc, row) =>
          acc +
          Object.values(row.cells).filter((c) => c.status === 'OK').length,
        0
      )
    : 0;

  const healthScore = totalCells > 0 ? ((okCells / totalCells) * 100).toFixed(1) : '100.0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">Overview</h2>
          <StatusBadge status={healthStatus} />
        </div>
        <div className="page-question">
          What is the overall operational health across data streams, model inference, and forecast quality?
        </div>
      </div>

      {healthStatus !== 'OK' ? (
        <EmptyState status={healthStatus} reason={reason} />
      ) : (
        <>
          {/* Health Summary Tiles */}
          <div className="grid-4">
            <MetricTile
              label="System Service"
              value={health?.service || 'SENTINELX'}
              subtext={`Version v${health?.version || '1.0'}`}
              badge={<StatusBadge status="OK" label="ACTIVE" />}
              accentColor="#4fd1c5"
            />
            <MetricTile
              label="Uptime Seconds"
              value={health?.uptimeSeconds ? health.uptimeSeconds.toLocaleString() : '0'}
              subtext="Live health check"
              accentColor="#4fd1c5"
            />
            <MetricTile
              label="Data Mode State"
              value={health?.dataModeBanner || 'LIVE'}
              subtext="Global pipeline banner"
              badge={<StatusBadge status={health?.dataModeBanner || 'LIVE'} />}
              accentColor="#9f7aea"
            />
            <MetricTile
              label="Forecast Grid Health"
              value={`${healthScore}%`}
              subtext={`${okCells} / ${totalCells} cells active`}
              badge={<StatusBadge status={Number(healthScore) >= 90 ? 'OK' : 'WARNING'} />}
              accentColor="#48bb78"
            />
          </div>

          {/* Matrix Health Summary Panel */}
          {matrixStatus === 'OK' && matrix ? (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Active Asset Horizons Summary</span>
                <StatusBadge status={matrix.rows.length > 0 ? 'OK' : 'DATA_UNAVAILABLE'} />
              </div>
              <div className="grid-3">
                {matrix.rows.map((row) => {
                  const cells = Object.values(row.cells);
                  const valid = cells.filter((c) => c.status === 'OK').length;
                  return (
                    <div
                      key={row.symbol}
                      style={{
                        backgroundColor: '#0a0e14',
                        border: '1px solid #1e2633',
                        padding: '12px',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px', color: '#ffffff' }}>
                          {row.symbol}
                        </span>
                        <StatusBadge status={row.dataMode} />
                      </div>
                      <div style={{ fontSize: '11px', color: '#8b95a5', fontFamily: 'monospace' }}>
                        Regime: <span style={{ color: '#4fd1c5' }}>{regimeText(row.regime)}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#8b95a5', fontFamily: 'monospace' }}>
                        Coverage: {valid} / {cells.length} horizons
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState status={matrixStatus} missingMessage="No horizon matrix data returned" />
          )}
        </>
      )}
    </div>
  );
};
