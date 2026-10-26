import React from 'react';
import { statusText } from '../humanize';

interface StatusBadgeProps {
  status: string;
  label?: string;
  /** Show a human-friendly label instead of the raw backend code (default: true) */
  friendly?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, friendly = true }) => {
  const upper = (status || '').toUpperCase();
  const text = label || (friendly ? statusText(upper) : upper);

  let className = 'badge badge-historical';
  let isLive = false;

  switch (upper) {
    case 'LIVE':
    case 'PRODUCTION':
      className = 'badge badge-live';
      isLive = true;
      break;
    case 'DELAYED':
    case 'PENDING':
    case 'HISTORICAL_PENDING':
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
      className = 'badge badge-ok';
      break;
    case 'RESOLVED':
      className = 'badge badge-ok';
      break;
    case 'WARNING':
    case 'CANDIDATE':
    case 'EXPERIMENTAL':
    case 'NOT_CONFIGURED':
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
