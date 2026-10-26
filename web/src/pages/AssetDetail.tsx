import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, MarketData, ForecastData, RegimeData, Candle } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { CandleChart } from '../components/CandleChart';
import { regimeText, modelText } from '../humanize';

interface Res<T> { status: string; data?: T; reason?: string; dataMode?: string }

// Groww-style asset page: price header, chart, key stats, honest forecast.
export const AssetDetail: React.FC = () => {
  const { symbol = 'BTCUSDT' } = useParams();
  const [market, setMarket] = useState<Res<MarketData>>({ status: 'OK' });
  const [forecast, setForecast] = useState<Res<ForecastData>>({ status: 'OK' });
  const [regime, setRegime] = useState<Res<RegimeData>>({ status: 'OK' });

  useEffect(() => {
    setMarket({ status: 'OK' }); setForecast({ status: 'OK' }); setRegime({ status: 'OK' });
    get<MarketData>(`/api/market/${symbol}?timeframe=1h&bars=72`).then(setMarket);
    get<ForecastData>(`/api/forecast/${symbol}?horizon=1h`).then(setForecast);
    get<RegimeData>(`/api/regime/${symbol}`).then(setRegime);
  }, [symbol]);

  const candles: Candle[] = market.data?.candles ?? [];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = last?.c;
  const changePct = last && prev && prev.c ? ((last.c - prev.c) / prev.c) * 100 : 0;
  const fmt = (n?: number) => (n === undefined ? '-' : n >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : n.toFixed(2));
  const chgColor = (n: number) => (n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : '#8b95a5');
  const fc = forecast.data;

  const stats: Array<[string, string]> = candles.length >= 2 ? [
    ['Day high', fmt(Math.max(...candles.slice(-24).map((c) => c.h)))],
    ['Day low', fmt(Math.min(...candles.slice(-24).map((c) => c.l)))],
    ['24h volume', candles.slice(-24).reduce((a, c) => a + (c.v ?? 0), 0).toLocaleString('en-IN')],
    ['Data freshness', market.data?.freshness?.stale ? 'Delayed' : 'Current'],
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">{symbol}</h2>
          <StatusBadge status={market.dataMode || market.status} />
        </div>
        <div className="page-question"><Link to="/markets" style={{ color: '#4fd1c5' }}>← All markets</Link></div>
      </div>

      {/* Price header */}
      <div className="panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '34px', fontWeight: 700 }}>{fmt(price)}</span>
          <span style={{ fontSize: '16px', fontWeight: 600, color: chgColor(changePct) }}>
            {changePct > 0 ? '+' : ''}{changePct.toFixed(2)}% (1h)
          </span>
          <span className="metric-sub">last updated {market.data?.freshness?.lastEvent ? new Date(market.data.freshness.lastEvent).toLocaleTimeString() : '-'}</span>
        </div>
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {stats.map(([k, v]) => (
            <div key={k} className="stat-cell">
              <div className="metric-sub">{k}</div>
              <div className="mono" style={{ fontSize: '14px' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="panel">
        <div className="panel-header"><span className="panel-title">Price (last 3 days, hourly)</span></div>
        <div style={{ padding: '14px' }}>
          {candles.length > 2 ? (
            <CandleChart
              candles={candles}
              height={320}
              forecastOverlay={fc && forecast.status === 'OK' && fc.targetTime ? { point: fc.point, lower: fc.lower, upper: fc.upper, targetTime: fc.targetTime } : undefined}
            />
          ) : (
            <div className="empty-state"><div className="empty-state-title">No price data yet</div><div className="empty-state-reason">{market.reason || 'Try again in a moment'}</div></div>
          )}
        </div>
      </div>

      {/* Forecast + mood */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
        <div className="panel" style={{ padding: '18px' }}>
          <span className="panel-title">Next hour forecast</span>
          {forecast.status === 'OK' && fc ? (
            <>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '8px' }}>{fmt(fc.point)}</div>
              <div className="metric-sub" style={{ marginTop: '2px' }}>
                Likely range {fmt(fc.lower)} – {fmt(fc.upper)}
              </div>
              <div style={{ marginTop: '10px', fontSize: '13px', color: '#d7dde6' }}>
                Model: {modelText(fc.model?.id || '')} · Market mood: {regimeText(typeof fc.regime === 'string' ? fc.regime : fc.regime?.state || '')}
              </div>
              <div className="metric-sub" style={{ marginTop: '8px' }}>
                This is a measured statistical estimate, not a tip. We score every forecast after the hour closes.
              </div>
            </>
          ) : (
            <div className="empty-state"><div className="empty-state-title">Forecast unavailable</div><div className="empty-state-reason">{forecast.reason || 'Not enough price history yet'}</div></div>
          )}
        </div>

        <div className="panel" style={{ padding: '18px' }}>
          <span className="panel-title">Market mood</span>
          {regime.status === 'OK' && regime.data ? (
            <>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '8px' }}>
                {regimeText(regime.data.regime)}
              </div>
              <div className="metric-sub" style={{ marginTop: '2px' }}>
                Confidence: {((regime.data.confidence ?? 0) * 100).toFixed(0)}%
              </div>
              <div style={{ marginTop: '10px', fontSize: '13px', color: '#d7dde6' }}>
                What moves it: {(regime.data.drivers ?? []).slice(0, 3).map((d) => d.name.replace(/_/g, ' ')).join(', ') || '-'}
              </div>
              <div className="metric-sub" style={{ marginTop: '8px' }}>Mood is computed from recent volatility and trend, and it changes as the market changes.</div>
            </>
          ) : (
            <div className="empty-state"><div className="empty-state-title">Mood not classified yet</div><div className="empty-state-reason">{regime.reason || 'Needs more data'}</div></div>
          )}
        </div>
      </div>
    </div>
  );
};
