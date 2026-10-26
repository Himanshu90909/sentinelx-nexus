import React, { useState, useEffect, useCallback } from 'react';
import { get, InstrumentsData, MarketData } from '../api';
import { usePoll } from '../components/usePoll';
import { StatusBadge } from '../components/StatusBadge';
import { CandleChart } from '../components/CandleChart';
import { QualityScore } from '../components/QualityScore';
import { MetricTile } from '../components/MetricTile';
import { EmptyState } from '../components/EmptyState';

export const MarketStream: React.FC = () => {
  const [instruments, setInstruments] = useState<string[]>(['BTCUSDT']);
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [timeframe, setTimeframe] = useState<string>('1h');

  useEffect(() => {
    get<InstrumentsData>('/api/instruments').then((res) => {
      if (res.status === 'OK' && res.data?.instruments?.length) {
        const syms = res.data.instruments.map((i) => i.symbol);
        setInstruments(syms);
        if (!syms.includes(symbol)) {
          setSymbol(syms[0]);
        }
      }
    });
  }, []);

  const fetchMarket = useCallback(() => {
    return get<MarketData>(`/api/market/${symbol}?timeframe=${timeframe}&bars=300`);
  }, [symbol, timeframe]);

  const { data: result, loading, lastUpdated } = usePoll(fetchMarket, 10000, [symbol, timeframe]);

  const market = result?.data;
  const status = result?.status || 'OK';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">MARKET STREAM</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#8b95a5', fontFamily: 'monospace' }}>
              10s polling
            </span>
            <StatusBadge status={result?.dataMode || status} />
          </div>
        </div>
        <div className="page-question">
          Research Question: What are the raw market inputs, data quality checks, and event freshness for selected instruments?
        </div>
      </div>

      {/* Toolbar Controls */}
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="toolbar-label">Instrument:</label>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {instruments.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <label className="toolbar-label">Timeframe:</label>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>

        {lastUpdated && (
          <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#8b95a5', fontFamily: 'monospace' }}>
            Updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {status !== 'OK' || !market ? (
        <EmptyState
          status={status}
          reason={result?.reason}
          missingMessage={`No providers configured or data unavailable for ${symbol} (${timeframe})`}
        />
      ) : (
        <>
          {/* Freshness & Stream Summary Tiles */}
          <div className="grid-3">
            <MetricTile
              label="Data Provider"
              value={result?.provider || 'binance'}
              subtext={`Timeframe: ${market.timeframe}`}
              badge={<StatusBadge status={result?.dataMode || 'LIVE'} />}
              accentColor="#4fd1c5"
            />
            <MetricTile
              label="Event Freshness"
              value={`${market.freshness?.ageSeconds ?? 0}s ago`}
              subtext={`Last: ${market.freshness?.lastEvent || 'N/A'}`}
              badge={<StatusBadge status={market.freshness?.stale ? 'STALE_DATA' : 'OK'} label={market.freshness?.stale ? 'STALE' : 'FRESH'} />}
              accentColor={market.freshness?.stale ? '#d69e2e' : '#48bb78'}
            />
            <MetricTile
              label="Candle Count"
              value={market.candles?.length || 0}
              subtext="Bars loaded in stream buffer"
              accentColor="#9f7aea"
            />
          </div>

          {/* Candle Chart & Data Quality Panel */}
          <div className="grid-3">
            <div style={{ gridColumn: 'span 2' }} className="panel">
              <div className="panel-header">
                <span className="panel-title">{market.symbol} ({market.timeframe}) Candlesticks & Volume</span>
              </div>
              <CandleChart candles={market.candles} height={360} />
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <QualityScore
                score={market.quality?.score ?? 100}
                components={market.quality?.components}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
