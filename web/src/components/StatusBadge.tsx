import React from 'react';

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const upper = (status || '').toUpperCase();
  const text = label || upper;

  let className = 'badge badge-historical';
  let isLive = false;

  switch (upper) {
    case 'LIVE':
      className = 'badge badge-live';
      isLive = true;
      break;
    case 'DELAYED':
      className = 'badge badge-delayed';
      break;
    case 'HISTORICAL':
      className = 'badge badge-historical';
      break;
    case 'SYNTHETIC':
      className = 'badge badge-synthetic';
      break;
    case 'OK':
    case 'PASS':
    case 'PASSED':
    case 'STABLE':
    case 'VALIDATED':
    case 'PRODUCTION':
      className = 'badge badge-ok';
      break;
    case 'WARNING':
    case 'CANDIDATE':
    case 'EXPERIMENTAL':
      className = 'badge badge-warning';
      break;
    case 'FAIL':
    case 'FAILED':
    case 'DRIFT':
    case 'DATA_UNAVAILABLE':
    case 'STALE_DATA':
    case 'MODEL_UNAVAILABLE':
    case 'INSUFFICIENT_HISTORY':
    case 'LEAKAGE_DETECTED':
    case 'PROVIDER_RATE_LIMITED':
    case 'NOT_CONFIGURED':
    case 'UNAUTHORIZED':
    case 'REJECTED':
    case 'ARCHIVED':
      className = 'badge badge-error';
      break;
    default:
      className = 'badge badge-historical';
      break;
  }

  return (
    <span className={className}>
      {isLive && <span className="pulse-dot" />}
      {text}
    </span>
  );
};
