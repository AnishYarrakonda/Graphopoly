import React, { useState } from 'react';
import { useAnalyzeStore } from '../../stores/analyzeStore';
import { CATEGORIES, chartsByCategory } from '../../lib/chartRegistry';
import { useUIStore } from '../../stores/uiStore';
import { AGENT_COLORS } from '../../lib/chartTheme';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const ChartNavigator: React.FC = () => {
  const { activeCategory, activeChartId, setCategory, setChart,
    selectedAgents, selectedNodes, toggleAgent, toggleNode, episodeData } = useAnalyzeStore();
  const agentColors = useUIStore(s => s.agentColors);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const numAgents = episodeData?.metadata?.num_agents ?? 0;
  const numNodes = episodeData?.metadata?.num_nodes ?? 0;

  const toggle = (catId: string) => {
    setCollapsed(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div style={{
      width: 240,
      minWidth: 240,
      borderRight: '1px solid rgba(255,255,255,0.06)',
      padding: '16px 0',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {/* Chart categories */}
      {CATEGORIES.map(cat => {
        const charts = chartsByCategory(cat.id);
        const isCollapsed = collapsed[cat.id] ?? false;
        const isActive = activeCategory === cat.id;

        return (
          <div key={cat.id}>
            <button
              onClick={() => { toggle(cat.id); setCategory(cat.id); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              {cat.label}
            </button>

            {!isCollapsed && (
              <div style={{ paddingLeft: 12 }}>
                {charts.map(chart => {
                  const isSelected = activeChartId === chart.id;
                  return (
                    <button
                      key={chart.id}
                      onClick={() => { setCategory(cat.id); setChart(chart.id); }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 16px',
                        background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
                        borderLeft: isSelected ? '2px solid rgba(155,89,245,0.8)' : '2px solid transparent',
                        border: 'none',
                        borderLeftWidth: 2,
                        borderLeftStyle: 'solid',
                        borderLeftColor: isSelected ? 'rgba(155,89,245,0.8)' : 'transparent',
                        color: isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif",
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
                      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'transparent'; } }}
                    >
                      {chart.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 16px' }} />

      {/* Agent filters */}
      {numAgents > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Filter Agents
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Array.from({ length: numAgents }, (_, i) => {
              const id = String(i);
              const active = selectedAgents.length === 0 || selectedAgents.includes(id);
              const color = agentColors[i % agentColors.length] ?? AGENT_COLORS[i % AGENT_COLORS.length];
              return (
                <button
                  key={id}
                  onClick={() => toggleAgent(id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                    border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 4,
                    background: active ? color + '25' : 'transparent',
                    color: active ? color : 'rgba(255,255,255,0.3)',
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

      {/* Node filters */}
      {numNodes > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Filter Nodes
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {Array.from({ length: numNodes }, (_, i) => {
              const id = String(i);
              const active = selectedNodes.length === 0 || selectedNodes.includes(id);
              const owner = episodeData?.graph?.ownership?.[id] ?? -1;
              const color = owner >= 0
                ? (agentColors[owner % agentColors.length] ?? AGENT_COLORS[owner % AGENT_COLORS.length])
                : 'rgba(255,255,255,0.3)';
              return (
                <button
                  key={id}
                  onClick={() => toggleNode(id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                    border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 4,
                    background: active ? color + '25' : 'transparent',
                    color: active ? color : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
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
  );
};
