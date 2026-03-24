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
import { useUIStore } from './stores/uiStore';
import { Activity, BarChart3 } from 'lucide-react';

type TabID = 'live' | 'analysis';

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ active, onClick, icon, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '10px 16px',
      background: active ? 'var(--color-accent-surface)' : 'none',
      border: 'none',
      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      color: active ? 'var(--color-text)' : 'var(--color-text-dim)',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: '0.02em',
      cursor: 'pointer',
      transition: 'all var(--transition-base)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--color-text-dim)'; }}
  >
    {icon}
    {children}
  </button>
);

export default function App() {
  useKeyboard();
  usePlayback();
  useSimulationPlayback();
  const loadConfig = useConfigStore(s => s.loadConfig);
  const isSidebarCollapsed = useUIStore(s => s.isSidebarCollapsed);
  const [activeTab, setActiveTab] = useState<TabID>('live');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(35);

  useEffect(() => {
    api.config.get().then(config => loadConfig(config)).catch(e => console.error('Config fetch failed', e));
  }, [loadConfig]);

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

      {/* ── SIDEBAR ────────────────────────────────── */}
      <aside style={{
        width: isSidebarCollapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        height: '100%',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        overflowY: 'auto',
        transition: 'width var(--transition-slow)',
      }}>
        <SettingsPanel />
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────── */}
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
            height: '6px',
            cursor: 'ns-resize',
            background: 'transparent',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
          onMouseEnter={e => {
            const bar = e.currentTarget.querySelector('.drag-indicator') as HTMLElement;
            if (bar) bar.style.background = 'var(--color-accent)';
          }}
          onMouseLeave={e => {
            const bar = e.currentTarget.querySelector('.drag-indicator') as HTMLElement;
            if (bar) bar.style.background = 'var(--color-text-muted)';
          }}
        >
          <div
            className="drag-indicator"
            style={{
              width: 32,
              height: 3,
              borderRadius: 2,
              background: 'var(--color-text-muted)',
              transition: 'background var(--transition-fast)',
            }}
          />
        </div>

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
            padding: '0 20px',
            borderBottom: '1px solid var(--color-border)',
            background: 'rgba(255,255,255,0.01)',
            gap: 4,
          }}>
            <TabButton
              active={activeTab === 'live'}
              onClick={() => setActiveTab('live')}
              icon={<Activity size={13} />}
            >
              Live Status
            </TabButton>
            <TabButton
              active={activeTab === 'analysis'}
              onClick={() => setActiveTab('analysis')}
              icon={<BarChart3 size={13} />}
            >
              Analysis & Replay
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
