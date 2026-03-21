import React, { useMemo } from 'react';
import { useAnalyzeStore } from '../../stores/analyzeStore';
import { useReplayStore } from '../../stores/replayStore';
import { useUIStore } from '../../stores/uiStore';
import { CHART_MAP, type BuildParams } from '../../lib/chartRegistry';
import { AGENT_COLORS } from '../../lib/chartTheme';
import { ChartWrapper } from './ChartWrapper';

export const ChartDisplay: React.FC = () => {
  const { activeChartId, episodeData, timeline, selectedAgents, selectedNodes } = useAnalyzeStore();
  const currentStep = useReplayStore(s => s.currentStep);
  const agentColors = useUIStore(s => s.agentColors);

  const chart = CHART_MAP.get(activeChartId);

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

  if (!chart) {
    return (
      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: 13, opacity: 0.5 }}>
        SELECT A CHART TO VISUALIZE
      </div>
    );
  }

  if (!params) {
    return (
      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: 13, opacity: 0.5 }}>
        NO DATA AVAILABLE FOR THIS CHART
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', minWidth: 0 }}>
      {/* Title */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h3 style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--color-text)',
            fontFamily: "'Inter', sans-serif",
            margin: '0 0 4px 0',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {chart.title}
          </h3>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>
            {chart.syncMode === 'atStep' ? `Current Step: ${params.currentStep}` : `Full Timeline: ${timeline.length} steps`}
            {' · '}
            {chart.chartType} visualization
          </span>
        </div>
        
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: 4, padding: '2px 6px' }}>
           PRO ANALYSIS
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: 'relative', minHeight: 350 }}>
        <ChartWrapper chart={chart} params={params} />
      </div>
    </div>
  );
};
