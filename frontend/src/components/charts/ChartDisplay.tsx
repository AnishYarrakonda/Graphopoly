import React, { useMemo } from 'react';
import { useAnalyzeStore } from '../../stores/analyzeStore';
import { useReplayStore } from '../../stores/replayStore';
import { useUIStore } from '../../stores/uiStore';
import { chartsByCategory, type BuildParams } from '../../lib/chartRegistry';
import { AGENT_COLORS } from '../../lib/chartTheme';
import { ChartWrapper } from './ChartWrapper';

export const ChartDisplay: React.FC = () => {
  const { activeCategory, episodeData, timeline, selectedAgents, selectedNodes } = useAnalyzeStore();
  const currentStep = useReplayStore(s => s.currentStep);
  const agentColors = useUIStore(s => s.agentColors);

  const params: BuildParams | null = useMemo(() => {
    if (!episodeData || timeline.length === 0) return null;
    return {
      timeline,
      currentStep: Math.min(currentStep, timeline.length - 1),
      episodeData,
      selectedAgents,
      selectedNodes,
      agentColors: agentColors.length > 0 ? agentColors : AGENT_COLORS,
    };
  }, [timeline, currentStep, episodeData, selectedAgents, selectedNodes, agentColors]);

  const charts = chartsByCategory(activeCategory);

  if (!params) {
    return (
      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: 'var(--text-base)', opacity: 0.5 }}>
        No data available
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
      gap: 20,
      padding: '20px 24px',
      alignContent: 'start',
    }}>
      {charts.map(chart => (
        <div
          key={chart.id}
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 360,
          }}
        >
          {/* Card header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text)' }}>
                {chart.title}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 2 }}>
                {chart.syncMode === 'atStep' ? `Step ${params.currentStep}` : `${timeline.length} steps`}
                {' · '}{chart.chartType}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div style={{ flex: 1, position: 'relative', minHeight: 280 }}>
            <ChartWrapper chart={chart} params={params} />
          </div>
        </div>
      ))}
    </div>
  );
};
