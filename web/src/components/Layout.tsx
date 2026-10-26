import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { get, HealthData } from '../api';
import { dataModeSummary } from '../humanize';
import { StatusBadge } from './StatusBadge';

export const Layout: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    get<HealthData>('/api/health').then((res) => {
      if (res.status === 'OK' && res.data) {
        setHealth(res.data);
      }
    });
  }, []);

  const navGroups = [
    {
      title: 'Core Engine',
      items: [
        { path: '/overview', label: 'Overview' },
        { path: '/stream', label: 'Live Prices' },
        { path: '/forecast', label: 'Forecast Explorer' },
        { path: '/matrix', label: 'All Markets' },
      ],
    },
    {
      title: 'ML Registry & Lab',
      items: [
        { path: '/models', label: 'Model Lab' },
        { path: '/experiments', label: 'Experiment Log' },
        { path: '/datasets', label: 'Datasets' },
        { path: '/reliability', label: 'Reliability Lab' },
      ],
    },
    {
      title: 'Observability & Integrity',
      items: [
        { path: '/leakage', label: 'Quality Checks' },
        { path: '/regime', label: 'Market Mood' },
        { path: '/drift', label: 'Drift Monitor' },
        { path: '/providers', label: 'Data Sources' },
        { path: '/performance', label: 'Performance Lab' },
        { path: '/replay', label: 'Replay Engine' },
      ],
    },
  ];

  return (
    <div className="app-container">
      {/* Persistent Top Banner */}
      <div className="top-banner">
        <div className="banner-left">
          <span className="banner-title">SentinelX Nexus</span>
          <StatusBadge status="LIVE" label={dataModeSummary(health?.dataModeBanner)} />
          {health?.version && (
            <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
              {health.version}
            </span>
          )}
        </div>
        <div className="banner-disclaimer">
          Research platform - not investment advice
        </div>
      </div>

      <div className="app-body">
        {/* Sidebar Navigation */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <h1>SENTINELX</h1>
            <p>Temporal Intelligence</p>
          </div>
          <nav className="sidebar-nav">
            {navGroups.map((group, gIdx) => (
              <div key={gIdx}>
                <div className="nav-section-title">{group.title}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      isActive ? 'nav-item active' : 'nav-item'
                    }
                  >
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Outlet */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
