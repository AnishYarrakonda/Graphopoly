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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
        Select a chart from the sidebar
      </div>
    );
  }

  if (!params) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
        No analysis data available
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px 24px', minWidth: 0 }}>
      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.8)',
          fontFamily: "'Inter', sans-serif",
          margin: 0,
        }}>
          {chart.title}
        </h3>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {chart.syncMode === 'atStep' ? `Step ${params.currentStep}` : `${timeline.length} steps`}
          {' · '}
          {chart.chartType} chart
        </span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: 'relative', minHeight: 400 }}>
        <ChartWrapper chart={chart} params={params} />
      </div>
    </div>
  );
};
