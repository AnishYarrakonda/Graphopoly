export const AGENT_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

export const NODE_COLORS = [
  '#636efa', '#ef553b', '#00cc96', '#ab63fa', '#ffa15a',
  '#19d3f3', '#ff6692', '#b6e880', '#ff97ff', '#fecb52',
];

export const CHART_THEME = {
  bgColor: 'transparent',
  textColor: 'rgba(255,255,255,0.5)',
  gridColor: 'rgba(255,255,255,0.06)',
  borderColor: 'rgba(255,255,255,0.08)',
  tooltipBg: 'rgba(0,0,0,0.85)',
  tooltipBorder: 'rgba(255,255,255,0.12)',
  font: "'Inter', 'SF Mono', monospace",
  fontSize: 11,
  replayLineColor: '#9b59f5',
};

export function baseScales() {
  return {
    x: {
      grid: { color: CHART_THEME.gridColor },
      ticks: { color: CHART_THEME.textColor },
    },
    y: {
      grid: { color: CHART_THEME.gridColor },
      ticks: { color: CHART_THEME.textColor },
    },
  };
}

export function replayAnnotation(currentStep: number) {
  return {
    annotations: {
      replayLine: {
        type: 'line' as const,
        xMin: currentStep,
        xMax: currentStep,
        borderColor: CHART_THEME.replayLineColor,
        borderWidth: 2,
        borderDash: [6, 3],
        label: {
          display: true,
          content: `Step ${currentStep}`,
          position: 'start' as const,
          backgroundColor: 'rgba(155,89,245,0.8)',
          color: '#fff',
          font: { size: 10 },
        },
      },
    },
  };
}

export function baseTooltip() {
  return {
    backgroundColor: CHART_THEME.tooltipBg,
    borderColor: CHART_THEME.tooltipBorder,
    borderWidth: 1,
    titleFont: { family: CHART_THEME.font, size: 12 },
    bodyFont: { family: CHART_THEME.font, size: 11 },
    cornerRadius: 4,
    padding: 10,
  };
}
