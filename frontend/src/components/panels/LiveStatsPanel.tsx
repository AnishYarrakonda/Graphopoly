import React from 'react';
import { useReplayStore } from '../../stores/replayStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useGraphStore } from '../../stores/graphStore';
import { useConfigStore } from '../../stores/configStore';
import { useUIStore } from '../../stores/uiStore';
import { AGENT_COLORS } from '../../lib/chartTheme';

const StatPill: React.FC<{ label: string; value: number | string; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: color || 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
      {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
    </span>
  </div>
);

export const LiveStatsPanel: React.FC = () => {
  const { episodeData, currentStep: replayStep } = useReplayStore();
  const { isTraining, agentDetails, stepHistory, simAnimStep, currentPrices } = useTrainingStore();
  const graphData = useGraphStore(s => s.data);
  const config = useConfigStore(s => s.config);
  const agentColors = useUIStore(s => s.agentColors);

  const isLive = isTraining && stepHistory.length > 0;
  const liveStep = isLive ? stepHistory[simAnimStep] : null;
  const replayTrajectoryStep = !isLive ? episodeData?.trajectory?.[replayStep] : null;

  const displayStep = isLive ? (liveStep?.step ?? simAnimStep) : replayStep;
  const numAgentsDisplay = episodeData?.metadata?.num_agents ?? config?.agent?.num_agents ?? 2;

  if (!isLive && !replayTrajectoryStep && agentDetails.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>NO ACTIVE LIVE DATA</div>
          <div style={{ fontSize: 11 }}>Start a simulation to see real-time agent metrics</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── AGENT CARDS GRID (HORIZONTAL) ────────────────── */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        overflowX: 'auto', 
        paddingBottom: 8,
        scrollbarWidth: 'none',
      }}>
        {Array.from({ length: numAgentsDisplay }, (_, i) => {
          const aid = String(i);
          const replayStats = replayTrajectoryStep?.agent_stats?.[aid];
          const detail = agentDetails.find(a => a.agent_id === i);
          const color = agentColors[i % agentColors.length] ?? AGENT_COLORS[i % AGENT_COLORS.length];

          const reward = detail?.cumulative_reward ?? replayStats?.total_profit ?? 0;
          const trips = detail?.trips_completed ?? replayStats?.trips_completed ?? 0;
          const taxRev = detail?.tax_revenue ?? replayStats?.tax_revenue ?? 0;
          const taxPaid = detail?.tax_paid ?? replayStats?.tax_paid ?? 0;
          const destRev = detail?.dest_revenue ?? replayStats?.dest_revenue ?? 0;

          return (
            <div key={i} style={{
              minWidth: 260,
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '16px',
              borderTop: `4px solid ${color}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color }}>AGENT {i}</span>
                <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, color: 'var(--color-text-dim)' }}>
                   {reward >= 0 ? 'PROFIT' : 'LOSS'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 16px' }}>
                <StatPill label="NET REWARD" value={reward} color={reward >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
                <StatPill label="TRIPS" value={trips} />
                <StatPill label="DEST REV" value={destRev} />
                <StatPill label="TAX REV" value={taxRev} />
                <StatPill label="TAX PAID" value={taxPaid} />
                <StatPill label="AVG/STEP" value={displayStep > 0 ? (reward / (displayStep + 1)) : 0} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── SYSTEM OVERVIEW ─────────────────────────────── */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 32, 
        padding: '12px 20px', 
        background: 'rgba(255,255,255,0.02)', 
        borderRadius: 8,
        border: '1px solid var(--color-border)'
      }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <StatPill label="STEP" value={displayStep} />
          <StatPill label="COMPLETIONS" value={isLive ? (liveStep?.dest_completions?.length ?? 0) : (replayTrajectoryStep?.dest_completions?.length ?? 0)} />
          <StatPill label="ACTIVE AGENTS" value={numAgentsDisplay} />
        </div>
        
        <div style={{ height: 24, width: 1, background: 'var(--color-border)' }} />

        <div style={{ flex: 1, display: 'flex', gap: 24, overflowX: 'auto' }}>
           {/* Quick Node Price Ticker */}
           <div style={{ display: 'flex', gap: 16 }}>
             <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--color-text-dim)', alignSelf: 'center' }}>LIVE PRICES:</span>
             {Array.from({ length: Math.min(graphData?.num_nodes ?? 0, 10) }, (_, i) => {
               const price = isLive ? (liveStep?.prices?.[String(i)] ?? currentPrices?.[String(i)] ?? 0) : (replayTrajectoryStep?.prices?.[String(i)] ?? 0);
               const owner = graphData?.ownership?.[i] ?? -1;
               const color = owner >= 0 ? (agentColors[owner % agentColors.length] ?? AGENT_COLORS[owner % AGENT_COLORS.length]) : 'var(--color-text-dim)';
               return (
                 <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                   <span style={{ fontSize: 10, fontWeight: 700, color }}>N{i}</span>
                   <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>${Number(price).toFixed(1)}</span>
                 </div>
               );
             })}
             {(graphData?.num_nodes ?? 0) > 10 && <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>...</span>}
           </div>
        </div>
      </div>
    </div>
  );
};
