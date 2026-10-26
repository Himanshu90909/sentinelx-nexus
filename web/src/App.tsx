import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import Landing from './pages/Landing';
import { Overview } from './pages/Overview';
import { Markets } from './pages/Markets';
import { AssetDetail } from './pages/AssetDetail';
import { ForecastExplorer } from './pages/ForecastExplorer';
import { Matrix } from './pages/Matrix';
import { ModelLab } from './pages/ModelLab';
import { Experiments } from './pages/Experiments';
import { Datasets } from './pages/Datasets';
import { LeakageAuditor } from './pages/LeakageAuditor';
import { RegimeMonitor } from './pages/RegimeMonitor';
import { DriftMonitor } from './pages/DriftMonitor';
import { ReliabilityLab } from './pages/ReliabilityLab';
import { PerformanceLab } from './pages/PerformanceLab';
import { ProviderHealth } from './pages/ProviderHealth';
import { ReplayEngine } from './pages/ReplayEngine';

export const App: React.FC = () => (
  <HashRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/asset/:symbol" element={<AssetDetail />} />
            <Route path="/forecast" element={<ForecastExplorer />} />
        <Route path="/matrix" element={<Matrix />} />
        <Route path="/models" element={<ModelLab />} />
        <Route path="/experiments" element={<Experiments />} />
        <Route path="/datasets" element={<Datasets />} />
        <Route path="/leakage" element={<LeakageAuditor />} />
        <Route path="/regime" element={<RegimeMonitor />} />
        <Route path="/drift" element={<DriftMonitor />} />
        <Route path="/reliability" element={<ReliabilityLab />} />
        <Route path="/performance" element={<PerformanceLab />} />
        <Route path="/providers" element={<ProviderHealth />} />
        <Route path="/replay" element={<ReplayEngine />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  </HashRouter>
);
