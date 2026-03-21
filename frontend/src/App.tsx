import React, { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { GraphCanvas } from './components/graph/GraphCanvas';
import { SettingsPanel } from './components/panels/SettingsPanel';
import { LiveStatsPanel } from './components/panels/LiveStatsPanel';
import { AnalysisReplayPanel } from './components/panels/AnalysisReplayPanel';
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay';
import { useKeyboard } from './hooks/useKeyboard';
import { usePlayback } from './hooks/usePlayback';
import { useSimulationPlayback } from './hooks/useSimulationPlayback';
import { api } from './api/client';
import { useConfigStore } from './stores/configStore';
import { CursorTrail } from './components/CursorTrail';
import { Button } from './components/shared';

type TabID = 'settings' | 'livestats' | 'analysis';

const TabButton: React.FC<{
  id: TabID;
  active: boolean;
  onClick: () => void;
  children: string;
}> = ({ id, active, onClick, children }) => {
  return (
    <Button
      variant="ghost"
      data-tour={`tab-${id}`}
      onClick={onClick}
      style={{
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: active ? '#fff' : 'rgba(255,255,255,0.35)',
        background: 'transparent',
        border: 'none',
        padding: '12px 24px',
        transition: 'color 0.3s',
      }}
    >
      {children}
    </Button>
  );
};

export default function App() {
  useKeyboard();
  usePlayback();
  useSimulationPlayback();
  const loadConfig = useConfigStore(s => s.loadConfig);
  const [activeTab, setActiveTab] = React.useState<TabID>('settings');

  useEffect(() => {
    api.config.get().then(config => loadConfig(config)).catch(e => console.error('Config fetch failed', e));
  }, [loadConfig]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll('.reveal-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <AppShell>
      <CursorTrail />
      <OnboardingOverlay />

      {/* ── PLAYGROUND ─────────────────────────────────────── */}
      <section
        id="playground"
        data-tour="playground"
        style={{
          height: '75vh',
          position: 'relative',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <GraphCanvas />
      </section>

      {/* ── TAB NAVIGATION ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 48px',
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 64,
        zIndex: 50,
      }}>
        <TabButton id="settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</TabButton>
        <TabButton id="livestats" active={activeTab === 'livestats'} onClick={() => setActiveTab('livestats')}>Live Stats</TabButton>
        <TabButton id="analysis" active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')}>Analysis</TabButton>
      </div>

      {/* ── TAB CONTENT ────────────────────────────────────── */}
      <main style={{ minHeight: '40vh', background: 'var(--color-bg)' }}>
        {activeTab === 'settings' && <SettingsPanel />}
        {activeTab === 'livestats' && <LiveStatsPanel />}
        {activeTab === 'analysis' && <AnalysisReplayPanel />}
      </main>
    </AppShell>
  );
}
