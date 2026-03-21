import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useReplayStore } from '../../stores/replayStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useGraphStore } from '../../stores/graphStore';
import { useConfigStore } from '../../stores/configStore';
import { useUIStore } from '../../stores/uiStore';
import { AGENT_COLORS } from '../../lib/chartTheme';

type StatsTab = 'agents' | 'nodes' | 'system';

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{
    fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)', marginBottom: 28, fontFamily: "'Inter', sans-serif",
  }}>
    {children}
  </h2>
);

const StatRow: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>{label}</span>
    <span style={{ color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
      {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}
    </span>
  </div>
);

const SystemCard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 24 }}>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.75)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

export const LiveStatsPanel: React.FC = () => {
  const { episodeData, currentStep: replayStep } = useReplayStore();
  const { isTraining, isPaused, agentDetails, stepHistory, simAnimStep, currentPrices } = useTrainingStore();
  const graphData = useGraphStore(s => s.data);
  const config = useConfigStore(s => s.config);
  const agentColors = useUIStore(s => s.agentColors);

  const [statsTab, setStatsTab] = useState<StatsTab>('agents');
  const [showRankings, setShowRankings] = useState(false);
  const [rankingsCollapsed, setRankingsCollapsed] = useState(false);
  const prevTrainingRef = useRef(isTraining);

  // Show rankings when simulation stops (isTraining: true → false)
  useEffect(() => {
    if (prevTrainingRef.current && !isTraining && agentDetails.length > 0) {
      setShowRankings(true);
      setRankingsCollapsed(false);
    }
    if (!prevTrainingRef.current && isTraining) {
      setShowRankings(false);
    }
    prevTrainingRef.current = isTraining;
  }, [isTraining, agentDetails.length]);

  // ── Derive the "current step" data depending on mode ──────────────────
  // During live simulation: use trainingStore's stepHistory + simAnimStep
  // After simulation (replay): use replayStore's episodeData + currentStep
  const isLive = isTraining && stepHistory.length > 0;

  const liveStep = isLive ? stepHistory[simAnimStep] : null;
  const replayTrajectoryStep = !isLive ? episodeData?.trajectory?.[replayStep] : null;

  // The step number to display
  const displayStep = isLive
    ? (liveStep?.step ?? simAnimStep)
    : replayStep;

  // Agent count and node count
  const numAgentsDisplay = episodeData?.metadata?.num_agents ?? config?.agent?.num_agents ?? 2;
  const numNodesDisplay = episodeData?.metadata?.num_nodes ?? graphData?.num_nodes ?? 0;

  // ── Compute cumulative node stats from live step history ───────────────
  // Accumulate visits (from positions) and tax revenue (from taxes) up to
  // the current animation step so the nodes tab has real data during sim.
  const liveNodeStats = useMemo(() => {
    if (!isLive) return null;
    const visits: Record<string, number> = {};
    const taxCollected: Record<string, number> = {};

    const upTo = Math.min(simAnimStep + 1, stepHistory.length);
    for (let s = 0; s < upTo; s++) {
      const entry = stepHistory[s];
      // Count visits: each agent's position counts as a visit to that node
      if (entry.positions) {
        for (const pos of entry.positions as number[]) {
          const key = String(pos);
          visits[key] = (visits[key] ?? 0) + 1;
        }
      }
      // Count tax revenue collected per node:
      // taxes is { payer_id: { receiver_id: amount } }
      // The tax is collected at the node the payer is on (owned by receiver)
      // We attribute it to the node the payer moved to (their current position)
      if (entry.taxes && entry.positions) {
        for (const [payerStr, receivers] of Object.entries(entry.taxes)) {
          const payerIdx = parseInt(payerStr);
          const nodeVisited = String((entry.positions as number[])[payerIdx]);
          for (const amt of Object.values(receivers as Record<string, number>)) {
            taxCollected[nodeVisited] = (taxCollected[nodeVisited] ?? 0) + Number(amt);
          }
        }
      }
    }
    return { visits, taxCollected };
  }, [isLive, stepHistory, simAnimStep]);

  // Do we have anything to show?
  const hasStats = liveStep || replayTrajectoryStep || agentDetails.length > 0;

  if (!hasStats) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", padding: '80px 48px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, lineHeight: 1.8 }}>
          Start a simulation to see live stats here.
        </p>
      </div>
    );
  }

  // ── Helper: get price for a node ──────────────────────────────────────
  const getNodePrice = (nodeId: number): number => {
    if (isLive) {
      // From live step history entry
      return liveStep?.prices?.[String(nodeId)] ?? currentPrices?.[String(nodeId)] ?? 0;
    }
    return replayTrajectoryStep?.prices?.[String(nodeId)] ?? 0;
  };

  // ── Helper: get node stats ────────────────────────────────────────────
  const getNodeVisits = (nodeId: string): number => {
    if (isLive) return liveNodeStats?.visits?.[nodeId] ?? 0;
    return replayTrajectoryStep?.node_stats?.[nodeId]?.visits ?? 0;
  };

  const getNodeRevenue = (nodeId: string): number => {
    if (isLive) return liveNodeStats?.taxCollected?.[nodeId] ?? 0;
    return replayTrajectoryStep?.node_stats?.[nodeId]?.revenue_collected ?? 0;
  };

  // ── Helper: all prices for system avg ─────────────────────────────────
  const getAllPrices = (): number[] => {
    if (isLive && liveStep?.prices) {
      return Object.values(liveStep.prices).map(Number);
    }
    if (replayTrajectoryStep?.prices) {
      return Object.values(replayTrajectoryStep.prices).map(Number);
    }
    if (currentPrices && Object.keys(currentPrices).length > 0) {
      return Object.values(currentPrices).map(Number);
    }
    return [];
  };

  // ── Helper: get live rewards from current step ────────────────────────
  const getLiveRewards = (): number[] => {
    if (isLive && liveStep?.rewards) {
      return (liveStep.rewards as number[]);
    }
    if (replayTrajectoryStep?.rewards) {
      return Object.values(replayTrajectoryStep.rewards).map(Number);
    }
    return [];
  };

  // ── Helper: dest completions count ────────────────────────────────────
  const getCompletions = (): number => {
    if (isLive && liveStep?.dest_completions) {
      return Array.isArray(liveStep.dest_completions) ? liveStep.dest_completions.length : 0;
    }
    if (replayTrajectoryStep?.dest_completions) {
      return Array.isArray(replayTrajectoryStep.dest_completions) ? replayTrajectoryStep.dest_completions.length : 0;
    }
    return 0;
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", padding: '48px' }}>
      <SectionTitle>Live Stats</SectionTitle>

      {/* Rankings card — shown when simulation stops */}
      {showRankings && agentDetails.length > 0 && (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 24,
          overflow: 'hidden',
        }}>
          <button
            onClick={() => setRankingsCollapsed(c => !c)}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 24px',
              borderBottom: rankingsCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
            }}>
              Final Standings
            </span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
              {rankingsCollapsed ? '+' : '-'}
            </span>
          </button>
          {!rankingsCollapsed && (
            <div style={{ padding: '8px 24px 20px' }}>
              {[...agentDetails]
                .sort((a, b) => b.cumulative_reward - a.cumulative_reward)
                .map((agent, rank) => {
                  const color = agentColors[agent.agent_id % agentColors.length]
                    ?? AGENT_COLORS[agent.agent_id % AGENT_COLORS.length];
                  const reward = agent.cumulative_reward;
                  const trips = agent.trips_completed;
                  const label = rank === 0 ? '1st' : rank === 1 ? '2nd' : rank === 2 ? '3rd' : `${rank + 1}th`;
                  const status = reward < 0 && trips === 0 ? 'BANKRUPT' : reward < 0 ? 'DEBT' : '';

                  return (
                    <div key={agent.agent_id} style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '10px 0',
                      borderBottom: rank < agentDetails.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    }}>
                      <span style={{
                        fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
                        width: 32, textAlign: 'right',
                      }}>{label}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color, width: 80 }}>Agent {agent.agent_id}</span>
                      <span style={{
                        fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                        color: reward >= 0 ? 'rgba(100,220,100,0.8)' : 'rgba(255,100,100,0.7)',
                        width: 80, textAlign: 'right',
                      }}>
                        {reward >= 0 ? '+' : ''}{reward.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                        ({trips} trip{trips !== 1 ? 's' : ''})
                      </span>
                      {status && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                          color: 'rgba(255,100,100,0.6)', textTransform: 'uppercase',
                        }}>{status}</span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {(['agents', 'nodes', 'system'] as StatsTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setStatsTab(tab)}
            style={{
              background: 'none', border: 'none',
              borderBottom: statsTab === tab ? '2px solid rgba(255,255,255,0.65)' : '2px solid transparent',
              color: statsTab === tab ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
              fontSize: 12, fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              padding: '10px 32px', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              transition: 'all 0.2s', marginBottom: -1,
            }}
            onMouseEnter={e => { if (statsTab !== tab) e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
            onMouseLeave={e => { if (statsTab !== tab) e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* AGENTS */}
      {statsTab === 'agents' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {Array.from({ length: numAgentsDisplay }, (_, i) => {
            const aid = String(i);
            const replayStats = replayTrajectoryStep?.agent_stats?.[aid];
            const detail = agentDetails.find(a => a.agent_id === i);
            const color = agentColors[i % agentColors.length] ?? AGENT_COLORS[i % AGENT_COLORS.length];

            // Prefer live agentDetails during simulation, fall back to replay stats
            const reward = detail?.cumulative_reward ?? replayStats?.total_profit ?? 0;
            const trips = detail?.trips_completed ?? replayStats?.trips_completed ?? 0;
            const taxRev = detail?.tax_revenue ?? replayStats?.tax_revenue ?? 0;
            const taxPaid = detail?.tax_paid ?? replayStats?.tax_paid ?? 0;
            const destRev = detail?.dest_revenue ?? replayStats?.dest_revenue ?? 0;

            return (
              <div key={i} style={{
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                padding: 24, borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color }}>Agent {i}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {isLive ? 'Live' : `Step ${replayStep}`}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 28px' }}>
                  <StatRow label="Reward" value={reward} />
                  <StatRow label="Trips" value={trips} />
                  <StatRow label="Tax Rev" value={taxRev} />
                  <StatRow label="Tax Paid" value={taxPaid} />
                  <StatRow label="Dest Rev" value={destRev} />
                  <StatRow label="Avg Reward"
                    value={displayStep > 0 ? (reward / (displayStep + 1)).toFixed(2) : '—'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NODES */}
      {statsTab === 'nodes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {Array.from({ length: numNodesDisplay }, (_, i) => {
            const nid = String(i);
            const price = getNodePrice(i);
            const owner = episodeData?.graph?.ownership?.[nid] ?? graphData?.ownership?.[i] ?? -1;
            const ownerColor = owner >= 0
              ? (agentColors[owner % agentColors.length] ?? AGENT_COLORS[owner % AGENT_COLORS.length])
              : 'rgba(255,255,255,0.15)';
            const dests = episodeData?.graph?.destinations ?? graphData?.destinations ?? {};
            const destOf: number[] = [];
            for (const [agId, nodeIds] of Object.entries(dests)) {
              if ((nodeIds as number[]).includes(i)) destOf.push(parseInt(agId));
            }
            return (
              <div key={i} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontWeight: 600, color: ownerColor, fontSize: 15 }}>Node {i}</span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>${price}</span>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <StatRow label="Owner" value={owner >= 0 ? `Agent ${owner}` : 'None'} />
                  <StatRow label="Visits" value={getNodeVisits(nid)} />
                  <StatRow label="Tax Collected" value={getNodeRevenue(nid)} />
                </div>
                {destOf.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>Dest of: </span>
                    {destOf.map(a => (
                      <span key={a} style={{
                        color: agentColors[a % agentColors.length] ?? AGENT_COLORS[a % AGENT_COLORS.length],
                        marginRight: 8, fontSize: 12, fontWeight: 600,
                      }}>A{a}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SYSTEM */}
      {statsTab === 'system' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <SystemCard label="Step" value={displayStep} />
          <SystemCard label="Total Agents" value={numAgentsDisplay} />
          <SystemCard label="Total Nodes" value={numNodesDisplay} />
          <SystemCard label="Total Edges" value={graphData?.edges?.length ?? episodeData?.graph?.edges?.length ?? 0} />
          {isTraining && (
            <SystemCard label="Status" value={isPaused ? 'Paused' : 'Running'} />
          )}
          {(() => {
            const prices = getAllPrices();
            if (prices.length > 0) {
              return (
                <SystemCard
                  label="Avg Price"
                  value={(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)}
                />
              );
            }
            return null;
          })()}
          {(() => {
            const rewards = getLiveRewards();
            if (rewards.length > 0) {
              return (
                <SystemCard
                  label="Step Reward"
                  value={rewards.reduce((a, b) => a + b, 0).toFixed(2)}
                />
              );
            }
            return null;
          })()}
          <SystemCard label="Completions" value={getCompletions()} />
        </div>
      )}
    </div>
  );
};
