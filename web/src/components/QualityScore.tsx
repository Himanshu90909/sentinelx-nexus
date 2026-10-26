import React from 'react';
import { QualityComponent } from '../api';

interface QualityScoreProps {
  score: number;
  components?: QualityComponent[];
}

export const QualityScore: React.FC<QualityScoreProps> = ({ score, components }) => {
  let scoreClass = 'quality-score-high';
  if (score < 70) scoreClass = 'quality-score-low';
  else if (score < 90) scoreClass = 'quality-score-med';

  return (
    <div className="quality-box">
      <div className="quality-header">
        <span className="panel-title" style={{ fontSize: '11px' }}>Data Quality Index</span>
        <span className={`quality-score-value ${scoreClass}`}>{score.toFixed(1)} / 100</span>
      </div>

      {components && components.length > 0 && (
        <div className="quality-components-list">
          {components.map((c, i) => (
            <div key={i} className="quality-component-item">
              <span style={{ color: '#d7dde6', fontFamily: 'monospace' }}>{c.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: '#8b95a5' }}>{c.detail}</span>
                <span
                  style={{
                    color: c.passed ? '#48bb78' : '#e05252',
                    fontWeight: 'bold',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                  }}
                >
                  {c.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
