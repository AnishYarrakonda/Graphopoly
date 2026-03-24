import React from 'react';
import { useAnalyzeStore } from '../../stores/analyzeStore';
import { CATEGORIES, chartsByCategory } from '../../lib/chartRegistry';
import { useUIStore } from '../../stores/uiStore';
import { AGENT_COLORS } from '../../lib/chartTheme';

export const ChartNavigator: React.FC = () => {
  const { activeCategory, activeChartId, setCategory, setChart,
    selectedAgents, selectedNodes, toggleAgent, toggleNode, episodeData } = useAnalyzeStore();
  const agentColors = useUIStore(s => s.agentColors);

  const numAgents = episodeData?.metadata?.num_agents ?? 0;
  const numNodes = episodeData?.metadata?.num_nodes ?? 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '16px 24px',
      borderBottom: '1px solid var(--color-border)',
      background: 'rgba(255,255,255,0.01)',
    }}>
      {/* ── CATEGORIES ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: activeCategory === cat.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.03)',
              color: activeCategory === cat.id ? '#fff' : 'var(--color-text-dim)',
              border: activeCategory === cat.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── CHARTS ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {chartsByCategory(activeCategory).map(chart => (
          <button
            key={chart.id}
            onClick={() => setChart(chart.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: activeChartId === chart.id ? 'var(--color-accent-glow)' : 'transparent',
              color: activeChartId === chart.id ? 'var(--color-accent)' : 'var(--color-text-dim)',
              border: activeChartId === chart.id ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {chart.title}
          </button>
        ))}
      </div>

      {/* ── FILTERS ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
        {numAgents > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="text-label" style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.04em' }}>Agents</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: numAgents }, (_, i) => {
                const id = String(i);
                const active = selectedAgents.length === 0 || selectedAgents.includes(id);
                const color = agentColors[i % agentColors.length] ?? AGENT_COLORS[i % AGENT_COLORS.length];
                return (
                  <button
                    key={id}
                    onClick={() => toggleAgent(id)}
                    style={{
                      padding: '2px 8px',
                      fontSize: 9,
                      fontWeight: 700,
                      borderRadius: 4,
                      background: active ? color + '20' : 'transparent',
                      color: active ? color : 'var(--color-text-dim)',
                      border: `1px solid ${active ? color : 'var(--color-border)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    A{i}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {numNodes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
             <span className="text-label" style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.04em' }}>Nodes</span>
             <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 400, scrollbarWidth: 'none' }}>
               {Array.from({ length: numNodes }, (_, i) => {
                 const id = String(i);
                 const active = selectedNodes.length === 0 || selectedNodes.includes(id);
                 const owner = episodeData?.graph?.ownership?.[id] ?? -1;
                 const color = owner >= 0 ? (agentColors[owner % agentColors.length] ?? AGENT_COLORS[owner % AGENT_COLORS.length]) : 'var(--color-text-dim)';
                 return (
                   <button
                     key={id}
                     onClick={() => toggleNode(id)}
                     style={{
                       padding: '2px 8px',
                       fontSize: 9,
                       fontWeight: 700,
                       borderRadius: 4,
                       background: active ? color + '20' : 'transparent',
                       color: active ? color : 'var(--color-text-dim)',
                       border: `1px solid ${active ? color : 'var(--color-border)'}`,
                       cursor: 'pointer',
                       whiteSpace: 'nowrap',
                       transition: 'all 0.15s',
                     }}
                   >
                     N{i}
                   </button>
                 );
               })}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
