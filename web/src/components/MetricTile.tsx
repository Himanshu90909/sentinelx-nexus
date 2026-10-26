import React from 'react';

interface MetricTileProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  badge?: React.ReactNode;
  accentColor?: string;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  subtext,
  badge,
  accentColor,
}) => {
  return (
    <div
      className="metric-tile"
      style={{
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="metric-label">{label}</span>
        {badge}
      </div>
      <div className="metric-value">{value}</div>
      {subtext && <div className="metric-sub">{subtext}</div>}
    </div>
  );
};
