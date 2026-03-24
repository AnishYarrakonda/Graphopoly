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
  const [bottomPanelHeight, setBottomPanelHeight] = useState(42);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  useEffect(() => {
    api.config.get().then(config => loadConfig(config)).catch(e => console.error('Config fetch failed', e));
  }, [loadConfig]);

  const startResizingBottom = (mouseDownEvent: React.MouseEvent) => {
    const startY = mouseDownEvent.clientY;
    const startHeight = bottomPanelHeight;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const delta = startY - mouseMoveEvent.clientY;
      const newHeight = Math.min(Math.max(startHeight + (delta / window.innerHeight) * 100, 15), 85);
      setBottomPanelHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startResizingSidebar = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(startWidth + (e.clientX - startX), 180), 600);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const effectiveSidebarWidth = isSidebarCollapsed ? 56 : sidebarWidth;

  return (
    <AppShell>
      <OnboardingOverlay />

      {/* ── SIDEBAR ────────────────────────────────── */}
      <aside style={{
        width: effectiveSidebarWidth,
        minWidth: effectiveSidebarWidth,
        height: '100%',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        overflowY: 'auto',
        position: 'relative',
        flexShrink: 0,
        transition: isSidebarCollapsed ? 'width var(--transition-slow)' : 'none',
      }}>
        <SettingsPanel />
        {/* Sidebar resize handle */}
        {!isSidebarCollapsed && (
          <div
            onMouseDown={startResizingSidebar}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 5,
              height: '100%',
              cursor: 'ew-resize',
              zIndex: 20,
              background: 'transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent)'; e.currentTarget.style.opacity = '0.4'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '1'; }}
          />
        )}
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
          background: 'radial-gradient(circle at 40% 40%, #0d1e3a 0%, var(--color-bg) 100%)',
        }}>
          <GraphCanvas />
        </section>

        {/* DRAG HANDLE */}
        <div
          onMouseDown={startResizingBottom}
          style={{
            height: '10px',
            cursor: 'ns-resize',
            background: 'transparent',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            flexShrink: 0,
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
              width: 48,
              height: 4,
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
