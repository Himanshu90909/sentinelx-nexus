import { regimeText } from '../humanize';
import React, { useEffect, useState } from 'react';
import { get, MatrixData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export const Matrix: React.FC = () => {
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [status, setStatus] = useState<string>('OK');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    get<MatrixData>('/api/matrix').then((res) => {
      setStatus(res.status);
      if (res.status === 'OK' && res.data) {
        setMatrix(res.data);
      } else {
        setReason(res.reason || 'Failed to retrieve multi-horizon forecast matrix');
      }
    });
  }, []);

  const horizons = matrix?.horizons || ['5m', '15m', '1h', '4h', '1d'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">Horizon Matrix</h2>
          <StatusBadge status={status} />
        </div>
        <div className="page-question">
          How do forecast availability, models, and uncertainty spans compare across all instruments and horizons?
        </div>
      </div>

      {status !== 'OK' || !matrix ? (
        <EmptyState status={status} reason={reason} />
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Cross-Asset Horizon Grid</span>
          </div>
          <div className="table-container">
            <table className="dense-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Symbol</th>
                  <th style={{ width: '90px' }}>Mode</th>
                  <th style={{ width: '120px' }}>Regime</th>
                  <th style={{ width: '90px' }}>Freshness</th>
                  {horizons.map((h) => (
                    <th key={h} style={{ textAlign: 'center', minWidth: '130px' }}>
                      Horizon {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.symbol}>
                    <td style={{ fontWeight: 'bold', color: '#ffffff', fontFamily: 'monospace' }}>
                      {row.symbol}
                    </td>
                    <td>
                      <StatusBadge status={row.dataMode} />
                    </td>
                    <td style={{ fontFamily: 'monospace', color: '#4fd1c5', fontSize: '10px' }}>
                      {regimeText(row.regime)}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: '#8b95a5', fontSize: '10px' }}>
                      {row.freshnessAgeSeconds !== undefined ? `${row.freshnessAgeSeconds}s ago` : '-'}
                    </td>
                    {horizons.map((h) => {
                      const cell = row.cells?.[h];

                      if (!cell) {
                        return (
                          <td key={h} style={{ textAlign: 'center' }}>
                            <StatusBadge status="DATA_UNAVAILABLE" />
                          </td>
                        );
                      }

                      if (cell.status !== 'OK') {
                        return (
                          <td key={h} style={{ textAlign: 'center' }}>
                            <StatusBadge status={cell.status} />
                          </td>
                        );
                      }

                      return (
                        <td key={h} style={{ textAlign: 'center', padding: '6px' }}>
                          <div className="matrix-cell">
                            <span className="matrix-point">
                              {cell.point !== undefined ? cell.point.toFixed(2) : '-'}
                            </span>
                            {cell.lower !== undefined && cell.upper !== undefined && (
                              <span className="matrix-range">
                                [{cell.lower.toFixed(2)}, {cell.upper.toFixed(2)}]
                              </span>
                            )}
                            <span className="matrix-model">{cell.model || 'model'}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
