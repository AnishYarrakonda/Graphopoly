import React, { useEffect, useState } from 'react';
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

type TabID = 'live' | 'analysis';

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '14px 0',
      background: 'none',
      border: 'none',
      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      color: active ? 'var(--color-text)' : 'var(--color-text-dim)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.15em',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }}
  >
    {children}
  </button>
);

export default function App() {
  useKeyboard();
  usePlayback();
  useSimulationPlayback();
  const loadConfig = useConfigStore(s => s.loadConfig);
  const [activeTab, setActiveTab] = useState<TabID>('live');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(35); // vh

  useEffect(() => {
    api.config.get().then(config => loadConfig(config)).catch(e => console.error('Config fetch failed', e));
  }, [loadConfig]);

  // Handle panel resizing
  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    const startY = mouseDownEvent.clientY;
    const startHeight = bottomPanelHeight;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const delta = startY - mouseMoveEvent.clientY;
      const newHeight = Math.min(Math.max(startHeight + (delta / window.innerHeight) * 100, 10), 80);
      setBottomPanelHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <AppShell>
      <OnboardingOverlay />
      
      {/* ── SIDEBAR ─────────────────────────────────────── */}
      <aside style={{
        width: 'var(--sidebar-w)',
        height: '100%',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        overflowY: 'auto',
      }}>
        <SettingsPanel />
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <main style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'var(--color-bg)',
      }}>
        {/* GRAPH CANVAS AREA */}
        <section style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(circle at center, #111114 0%, var(--color-bg) 100%)',
        }}>
          <GraphCanvas />
        </section>

        {/* DRAG HANDLE */}
        <div 
          onMouseDown={startResizing}
          style={{
            height: '4px',
            cursor: 'ns-resize',
            background: 'var(--color-border)',
            zIndex: 20,
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-accent)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-border)'}
        />

        {/* BOTTOM PANEL */}
        <section style={{
          height: `${bottomPanelHeight}vh`,
          background: 'var(--color-bg-surface)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        }}>
          {/* TAB BAR */}
          <div style={{
            display: 'flex',
            padding: '0 24px',
            borderBottom: '1px solid var(--color-border)',
            background: 'rgba(255,255,255,0.01)',
            gap: 24,
          }}>
            <TabButton 
              active={activeTab === 'live'} 
              onClick={() => setActiveTab('live')}
            >
              LIVE STATUS
            </TabButton>
            <TabButton 
              active={activeTab === 'analysis'} 
              onClick={() => setActiveTab('analysis')}
            >
              ANALYSIS & REPLAY
            </TabButton>
          </div>

          {/* TAB CONTENT */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {activeTab === 'live' ? <LiveStatsPanel /> : <AnalysisReplayPanel />}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
