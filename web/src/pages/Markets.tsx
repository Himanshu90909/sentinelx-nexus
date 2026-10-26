import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { get, InstrumentsData, Instrument } from '../api';
import { usePoll } from '../components/usePoll';
import { StatusBadge } from '../components/StatusBadge';
import { Sparkline } from '../components/Sparkline';

// Groww-style markets page: quotes strip, category tabs, gainers/losers, search.
export const Markets: React.FC = () => {
  const { data: res, error, loading, lastUpdated } = usePoll<InstrumentsData>(
    () => get<InstrumentsData>('/api/instruments'), 15000
  );
  const status = loading ? 'LOADING' : error ? 'DATA_UNAVAILABLE' : res?.status ?? 'OK';
  const [tab, setTab] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const list = res?.data?.instruments ?? [];
    return list.filter((i: Instrument) => i.active !== false && i.quote);
  }, [res]);

  const withChange = useMemo(
    () => rows.map((i: Instrument) => ({ ...i, chg: i.quote!.changePct })).filter((i) => i.chg !== undefined),
    [rows]
  );
  const gainers = useMemo(() => [...withChange].sort((a, b) => b.chg - a.chg).slice(0, 5), [withChange]);
  const losers = useMemo(() => [...withChange].sort((a, b) => a.chg - b.chg).slice(0, 5), [withChange]);

  const tabs = [
    { id: 'ALL', label: 'All' },
    { id: 'CRYPTO', label: 'Crypto' },
    { id: 'EQUITY', label: 'Stocks' },
    { id: 'ETF', label: 'ETFs' },
    { id: 'MACRO', label: 'Macro' },
  ];
  const TAB_CLASS: Record<string, string> = { CRYPTO: 'Crypto', EQUITY: 'Stock', ETF: 'ETF', MACRO: 'Macro' };

  const filtered = useMemo(() => {
    let f = tab === 'ALL' ? withChange : withChange.filter((i) => i.assetClass === tab);
    const q = search.trim().toUpperCase();
    if (q) f = f.filter((i) => i.symbol.includes(q) || (i.name ?? '').toUpperCase().includes(q));
    return f;
  }, [withChange, tab, search]);

  const fmt = (n: number) => (n >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : n.toFixed(2));
  const chgColor = (n: number) => (n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : '#8b95a5');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <h2 className="page-title">Markets</h2>
          <StatusBadge status={status} />
          {lastUpdated && <span className="metric-sub">updated {lastUpdated.toLocaleTimeString()}</span>}
        </div>
        <div className="page-question">Live prices and 1-hour moves for every asset we track.</div>
      </div>

      {status !== 'OK' && rows.length === 0 ? null : (
        <>
          {/* Ticker strip */}
          <div className="quotes-strip">
            {rows.slice(0, 8).map((i) => {
              const q = i.quote!;
              return (
                <Link to={`/asset/${i.symbol}`} key={i.symbol} className="quote-card">
                  <div className="quote-card-top">
                    <span className="quote-symbol">{i.symbol}</span>
                    <span className="quote-mode">{q.dataMode === 'LIVE' ? 'LIVE' : 'SAMPLE'}</span>
                  </div>
                  <div className="quote-price">{fmt(q.price)}</div>
                  <div className="quote-change" style={{ color: chgColor(q.changePct) }}>
                    {q.changePct > 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Gainers / Losers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
            {[
              { title: 'Top gainers', list: gainers, good: true },
              { title: 'Top losers', list: losers, good: false },
            ].map((sec) => (
              <div className="panel" key={sec.title}>
                <div className="panel-header"><span className="panel-title">{sec.title}</span></div>
                <div className="gl-list">
                  {sec.list.map((i) => (
                    <Link to={`/asset/${i.symbol}`} className="gl-row" key={i.symbol}>
                      <div>
                        <div className="gl-name">{i.name || i.symbol}</div>
                        <div className="metric-sub">{i.symbol}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono">{fmt(i.quote!.price)}</div>
                        <div className="mono" style={{ color: chgColor(i.chg) }}>
                          {i.chg > 0 ? '+' : ''}{i.chg.toFixed(2)}%
                        </div>
                      </div>
                      <Sparkline data={i.quote!.spark.slice(-16)} width={70} height={24} color={chgColor(i.chg)} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs + search */}
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div className="tab-row">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    className={tab === t.id ? 'tab-btn tab-btn-active' : 'tab-btn'}
                    onClick={() => setTab(t.id)}
                  >{t.label}</button>
                ))}
              </div>
              <input
                className="search-input"
                placeholder="Search (e.g. BTC, AAPL)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="mkt-rows">
              {filtered.map((i) => {
                const q = i.quote!;
                return (
                  <Link to={`/asset/${i.symbol}`} className="mkt-row" key={i.symbol}>
                    <Sparkline data={q.spark.slice(-24)} width={110} height={32} color={chgColor(q.changePct)} />
                    <div className="mkt-info">
                      <div className="gl-name">{i.name || i.symbol}</div>
                      <div className="metric-sub">{i.symbol} · {TAB_CLASS[i.assetClass] ?? i.assetClass}</div>
                    </div>
                    <div className="mkt-quote">
                      <div className="mono" style={{ fontSize: '14px' }}>{fmt(q.price)}</div>
                      <div className="mono" style={{ color: chgColor(q.changePct), fontSize: '12px' }}>
                        {q.changePct > 0 ? '+' : ''}{q.changePct.toFixed(2)}% (1h)
                      </div>
                    </div>
                    <StatusBadge status={q.dataMode} />
                  </Link>
                );
              })}
              {filtered.length === 0 && (
                <div className="empty-state"><div className="empty-state-title">Nothing matches "{search}"</div></div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
