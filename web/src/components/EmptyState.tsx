import React from 'react';
import { StatusBadge } from './StatusBadge';

interface EmptyStateProps {
  status?: string;
  reason?: string;
  missingMessage?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  status,
  reason,
  missingMessage,
}) => {
  const displayStatus = status || 'DATA_UNAVAILABLE';
  const displayReason =
    missingMessage || reason || 'No data or configuration found for this query.';

  return (
    <div className="empty-state">
      <div style={{ marginBottom: '4px' }}>
        <StatusBadge status={displayStatus} />
      </div>
      <div className="empty-state-reason">{displayReason}</div>
    </div>
  );
};
