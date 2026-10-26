import React, { useEffect, useState } from 'react';
import { get, ArchitectureData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

export const Landing: React.FC = () => {
  const [arch, setArch] = useState<ArchitectureData | null>(null);
  const [status, setStatus] = useState<string>('OK');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    get<ArchitectureData>('/api/architecture').then((res) => {
      setStatus(res.status);
      if (res.status === 'OK' && res.data) {
        setArch(res.data);
      } else {
        setReason(res.reason || 'Failed to fetch platform architecture schema');
      }
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">SENTINELX NEXUS</h2>
          <StatusBadge status="LIVE" label="RESEARCH PLATFORM" />
        </div>
        <p style={{ color: '#8b95a5', fontSize: '13px', fontWeight: 500 }}>
          Autonomous Temporal Intelligence for Real-Time Systems
        </p>
        <p style={{ color: '#d7dde6', fontSize: '12px', marginTop: '4px' }}>
          Learn across heterogeneous time series. Detect regime shifts. Audit temporal leakage. Forecast with calibrated uncertainty. Evaluate every prediction.
        </p>
        <div className="page-question">
          How is the SENTINELX NEXUS multi-layer temporal intelligence architecture structured?
        </div>
      </div>

      {status !== 'OK' ? (
        <EmptyState status={status} reason={reason} />
      ) : (
        <>
          {/* Architecture Pipeline Flow */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">End-to-End Pipeline Flow</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', padding: '8px 0' }}>
              {['Data', 'Features', 'Models', 'Evaluation', 'Forecast', 'Monitoring'].map((step, idx, arr) => (
                <React.Fragment key={step}>
                  <div
                    style={{
                      backgroundColor: '#111721',
                      border: '1px solid #4fd1c5',
                      color: '#4fd1c5',
                      padding: '10px 16px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                    }}
                  >
                    {idx + 1}. {step.toUpperCase()}
                  </div>
                  {idx < arr.length - 1 && (
                    <span style={{ color: '#8b95a5', fontFamily: 'monospace' }}>→</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Architecture Layers */}
          {arch?.layers && (
            <div className="grid-3">
              {arch.layers.map((layer, idx) => (
                <div key={idx} className="panel">
                  <div className="panel-header">
                    <span className="panel-title">{layer.name}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#8b95a5', marginBottom: '10px' }}>
                    {layer.role}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {layer.components.map((comp, cIdx) => (
                      <div
                        key={cIdx}
                        style={{
                          backgroundColor: '#0a0e14',
                          border: '1px solid #1e2633',
                          padding: '6px 10px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#d7dde6',
                        }}
                      >
                        {comp}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Architectural System Limitations */}
          {arch?.limitations && arch.limitations.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">System Limitations & Scope Boundaries</span>
              </div>
              <ul style={{ paddingLeft: '20px', color: '#8b95a5', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {arch.limitations.map((lim, lIdx) => (
                  <li key={lIdx} style={{ fontFamily: 'monospace' }}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div
        style={{
          borderTop: '1px solid #1e2633',
          paddingTop: '12px',
          color: '#8b95a5',
          fontSize: '11px',
          textAlign: 'center',
          fontFamily: 'monospace',
        }}
      >
        This is a research and ML engineering platform, not investment advice.
      </div>
    </div>
  );
};
