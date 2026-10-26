import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, ForecastData, MatrixData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { regimeText } from '../humanize';

interface LandingForecast {
  status: string;
  data?: ForecastData;
  dataMode?: string;
  reason?: string;
}

const Landing: React.FC = () => {
  const [fc, setFc] = useState<LandingForecast | null>(null);
  const [markets, setMarkets] = useState<{ total: number; live: number }>({ total: 0, live: 0 });

  useEffect(() => {
    get<ForecastData>('/api/forecast/BTCUSDT?horizon=1h').then((res) => {
      setFc({ status: res.status, data: res.data, dataMode: res.dataMode, reason: res.reason });
    });
    get<MatrixData>('/api/matrix').then((res) => {
      const rows = res.data?.rows || [];
      setMarkets({ total: rows.length, live: rows.filter((r) => r.dataMode === 'LIVE').length });
    });
  }, []);

  const f = fc?.data;
  const hasForecast = fc?.status === 'OK' && !!f;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Hero */}
      <div className="panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 className="page-title" style={{ margin: 0 }}>SentinelX Nexus</h2>
          <StatusBadge status="LIVE" label="Research preview" />
        </div>
        <p style={{ color: '#d7dde6', fontSize: '15px', marginTop: '10px', marginBottom: '0' }}>
          A forecasting tool that watches markets, learns their mood, and makes honest predictions —
          it shows a range, tracks every call it makes, and grades its own accuracy.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
          <Link to="/forecast" className="nav-item" style={{ border: '1px solid #4fd1c5', color: '#4fd1c5', padding: '9px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
            See a live forecast
          </Link>
          <Link to="/markets" className="nav-item" style={{ border: "1px solid #3a4656", color: '#d7dde6', padding: '9px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
            Browse all markets
          </Link>
        </div>
      </div>

      {/* Live forecast strip */}
      {fc && fc.status !== 'OK' && fc.status !== 'LOADING' && (
        <EmptyState status={fc.status} reason={fc.reason || 'Live forecast is unavailable right now'} />
      )}
      {hasForecast && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Bitcoin, next hour</span>
            <StatusBadge status={fc!.dataMode || 'SYNTHETIC'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '4px 2px' }}>
            <div className="metric-tile" style={{ border: '1px solid #3a4656', borderRadius: '8px', padding: '14px' }}>
              <div className="metric-label">Expected price</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>${(f!.point || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
              <div className="metric-sub">likely somewhere in ${(f!.lower || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} – ${(f!.upper || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="metric-tile" style={{ border: '1px solid #3a4656', borderRadius: '8px', padding: '14px' }}>
              <div className="metric-label">Market mood</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>{regimeText(typeof f!.regime === 'string' ? f!.regime : f!.regime?.state)}</div>
              <div className="metric-sub">how the market is behaving right now</div>
            </div>
            <div className="metric-tile" style={{ border: '1px solid #3a4656', borderRadius: '8px', padding: '14px' }}>
              <div className="metric-label">Markets tracked</div>
              <div className="metric-value" style={{ fontSize: '22px' }}>{markets.total}</div>
              <div className="metric-sub">{markets.live} live · rest use sample data</div>
            </div>
          </div>
        </div>
      )}

      {/* What it does - plain language */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">What it does</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {[
            {
              t: 'Watches markets',
              d: 'Pulls fresh prices for crypto around the clock. Stocks and macro data light up once data keys are added.',
            },
            {
              t: 'Reads the mood',
              d: 'Each market is continuously classified — calm, trending, or volatile — and the forecast adapts to it.',
            },
            {
              t: 'Forecasts honestly',
              d: 'No single-point crystal ball: every forecast is a range, and the app measures how often reality lands inside it.',
            },
            {
              t: 'Keeps itself honest',
              d: 'It can never peek at future data when predicting the past — a self-check runs on every load and is verified by an automated test suite.',
            },
            {
              t: 'Grades its own work',
              d: 'Every prediction is logged and later compared with what actually happened. Accuracy scores are public, per model.',
            },
            {
              t: 'Explains its choices',
              d: 'The model behind each forecast is picked from recent, measured performance — and the reason is shown in plain words.',
            },
          ].map((card) => (
            <div key={card.t} style={{ border: '1px solid #3a4656', borderRadius: '8px', padding: '16px' }}>
              <div style={{ color: '#4fd1c5', fontWeight: 700, marginBottom: '6px' }}>{card.t}</div>
              <div style={{ color: '#8b95a5', fontSize: '12.5px', lineHeight: 1.55 }}>{card.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Honest notes */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Honest notes</span>
        </div>
        <ul style={{ color: '#8b95a5', fontSize: '12.5px', lineHeight: 1.8, paddingLeft: '20px', margin: 0 }}>
          <li>This is a research and engineering project, <strong style={{ color: '#d69e2e' }}>not investment advice</strong>. Nothing here tells you to buy or sell.</li>
          <li>Crypto prices are live. Stocks and macro series use clearly-labeled sample data until real data sources are connected.</li>
          <li>Forecasts are honest about their limits — they show a range and a confidence, never false certainty.</li>
        </ul>
      </div>
    </div>
  );
};

export default Landing;
