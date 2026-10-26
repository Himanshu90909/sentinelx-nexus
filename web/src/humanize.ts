// Human-friendly labels for the dashboard. Backend codes stay in the API;
// the UI speaks plain language.

export function statusText(code: string | undefined): string {
  switch ((code || '').toUpperCase()) {
    case 'OK':
    case 'READY':
      return 'Working';
    case 'LIVE':
      return 'Live data';
    case 'DELAYED':
      return 'Delayed data';
    case 'HISTORICAL':
      return 'Historical data';
    case 'SYNTHETIC':
      return 'Sample data';
    case 'PENDING':
    case 'HISTORICAL_PENDING':
      return 'Awaiting result';
    case 'RESOLVED':
      return 'Checked';
    case 'DATA_UNAVAILABLE':
      return 'Data unavailable right now';
    case 'STALE_DATA':
      return 'Data is outdated';
    case 'MODEL_UNAVAILABLE':
      return 'No model available';
    case 'INSUFFICIENT_HISTORY':
      return 'Not enough history yet';
    case 'LEAKAGE_DETECTED':
      return 'Leakage check failed';
    case 'PROVIDER_RATE_LIMITED':
      return 'Data provider busy';
    case 'NOT_CONFIGURED':
      return 'Needs API key';
    case 'UNAUTHORIZED':
      return 'Admin access only';
    case 'BAD_REQUEST':
      return 'Invalid request';
    case 'PASS':
    case 'PASSED':
    case 'VALIDATED':
      return 'Passed';
    case 'FAILED':
    case 'FAIL':
    case 'REJECTED':
      return 'Failed';
    case 'STABLE':
      return 'Stable';
    case 'WARNING':
      return 'Watch';
    case 'DRIFT':
      return 'Drifting';
    case 'CANDIDATE':
    case 'EXPERIMENTAL':
      return 'Experimental';
    case 'PRODUCTION':
      return 'In use';
    case 'HISTORICAL':
      return 'Past';
    case 'MUTABLE':
      return 'Draft';
    default:
      return (code || 'Unknown').replace(/_/g, ' ').toLowerCase();
  }
}

export function regimeText(state: string | undefined): string {
  switch ((state || '').toUpperCase()) {
    case 'TRENDING_UP':
      return 'Trending up';
    case 'TRENDING_DOWN':
      return 'Trending down';
    case 'MEAN_REVERTING':
      return 'Range-bound';
    case 'HIGH_VOLATILITY':
      return 'High volatility';
    case 'LOW_VOLATILITY':
      return 'Low volatility';
    case 'LIQUIDITY_STRESS':
      return 'Thin trading';
    case 'UNKNOWN':
      return 'Unclassified';
    default:
      return (state || '-').replace(/_/g, ' ').toLowerCase();
  }
}

export function modelText(id: string | undefined): string {
  switch (id) {
    case 'naive':
      return 'Naive (last price)';
    case 'seasonal_naive':
      return 'Seasonal naive';
    case 'ma_20':
      return '20-bar average';
    case 'ets':
      return 'Exponential smoothing';
    default:
      return id || '-';
  }
}

export function providerText(name: string | undefined): string {
  if (!name) return '-';
  const map: Record<string, string> = {
    binance: 'Binance',
    kraken: 'Kraken',
    coingecko: 'CoinGecko',
    finnhub: 'Finnhub',
    twelvedata: 'Twelve Data',
    alpaca: 'Alpaca',
    polygon: 'Polygon',
    fred: 'FRED (St. Louis Fed)',
    sec: 'SEC EDGAR',
    fmp: 'FMP',
    synthetic: 'Built-in sample generator',
  };
  return map[name] || name;
}

export function timeAgo(seconds: number | null | undefined): string {
  if (seconds == null) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function dataModeSummary(banner: string | undefined): string {
  if (!banner) return 'Sample data';
  if (banner.startsWith('MIXED')) return 'Live: Crypto · Sample: Stocks & macro';
  return 'Sample data (add provider keys to go live)';
}
