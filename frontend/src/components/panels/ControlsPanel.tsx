import React, { useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useReplayStore } from '../../stores/replayStore';
import { useAnalyzeStore } from '../../stores/analyzeStore';
import { useUIStore } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { api } from '../../api/client';
import { Play, Pause, Square, SkipBack, SkipForward, FastForward, Rewind, BarChart2 } from 'lucide-react';
import { Stepper, NumberInput, Button, RangeSlider, Toggle } from '../shared';

const AGENT_COLORS = ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f","#edc948","#b07aa1","#ff9da7","#9c755f","#bab0ac"];

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.25)',
    marginBottom: 24,
    fontFamily: "'Inter', sans-serif",
  }}>
    {children}
  </h2>
);

type StatsTab = 'agents' | 'nodes' | 'system';

export const ControlsPanel: React.FC = () => {
  const loadGraph = useGraphStore(s => s.loadGraph);
  const graphData = useGraphStore(s => s.data);
  const graphLayout = useGraphStore(s => s.layout);
  const {
    isTraining, isPaused, agentDetails,
    pauseTraining: storeSetPaused, resumeTraining: storeSetResumed,
  } = useTrainingStore();
  const config = useConfigStore(s => s.config);
  const loadConfig = useConfigStore(s => s.loadConfig);
  const { episodeData, currentStep, totalSteps, isPlaying, play, pause, setStep, stepBack, stepForward, jumpBack, jumpForward } = useReplayStore();
  const setAnalysisData = useAnalyzeStore(s => s.setAnalysisData);
  const { showIds, showPrices, showDests, showAgents, animSpeed, toggleShowIds, toggleShowPrices, toggleShowDests, toggleShowAgents, setAnimSpeed } = useUIStore();

  // Build state
  const [numNodes, setNumNodes] = useState(8);
  const [numEdges, setNumEdges] = useState<number | ''>('');
  const [numAgents, setNumAgents] = useState(2);
  const [numDests, setNumDests] = useState(2);
  const [buildError, setBuildError] = useState<string | null>(null);

  // Stats tab
  const [statsTab, setStatsTab] = useState<StatsTab>('agents');

  const handleNumAgentsChange = (val: number) => {
    setNumAgents(val);
    api.config.update({ agent: { num_agents: val } })
      .then(res => { if (res.config) loadConfig(res.config); })
      .catch(() => {});
  };

  const handleRandom = async () => {
    if (isTraining) return;
    setBuildError(null);
    try {
      const res = await api.graph.random({
        num_nodes: numNodes,
        num_edges: numEdges === '' ? null : numEdges,
        num_agents: numAgents,
        num_destinations: numDests,
      });
      loadGraph(res.graph, res.layout);
    } catch (e: any) {
      setBuildError(e?.message || 'Failed to generate graph');
    }
  };

  const startTraining = async () => {
    if (isTraining) return;
    setBuildError(null);
    try {
      if (!graphData) {
        setBuildError('Build or generate a graph first');
        return;
      }
      // Always sync the full graph to the backend first.
      // For random graphs this is idempotent; for custom-built graphs it is required.
      await api.graph.build({
        num_nodes: graphData.num_nodes,
        edges: graphData.edges,
        ownership: Object.fromEntries(
          Object.entries(graphData.ownership).map(([k, v]) => [String(k), Number(v)])
        ),
        destinations: Object.fromEntries(
          Object.entries(graphData.destinations).map(([k, v]) => [String(k), v as number[]])
        ),
        starting_positions: Object.fromEntries(
          Object.entries(graphData.starting_positions || {}).map(([k, v]) => [String(k), Number(v)])
        ),
      });
      if (graphLayout) {
        const layoutForApi: Record<string, [number, number]> = {};
        for (const [k, v] of Object.entries(graphLayout)) {
          layoutForApi[String(k)] = v;
        }
        await api.graph.syncLayout(layoutForApi);
      }
      await api.train.start();
    } catch (e: any) {
      setBuildError(e?.message || 'Failed to start training');
    }
  };

  const stopTraining = () => api.train.stop().catch(console.error);
  const pauseTraining = async () => {
    await api.train.pause().catch(console.error);
    storeSetPaused(); // update local state so UI swaps immediately
  };
  const resumeTraining = async () => {
    await api.train.resume().catch(console.error);
    storeSetResumed(); // update local state so UI swaps immediately
  };

  const handleAnalyze = async () => {
    if (!episodeData) return;
    try {
      const res = await api.analyze.compute(episodeData);
      setAnalysisData(episodeData, res.timeline);
    } catch { setBuildError('Analysis failed'); }
  };

  const currentTrajectoryStep = episodeData?.trajectory?.[currentStep];
  const numAgentsDisplay = episodeData?.metadata?.num_agents ?? config?.agent?.num_agents ?? numAgents;
  const numNodesDisplay = episodeData?.metadata?.num_nodes ?? graphData?.num_nodes ?? 0;
  const hasStats = currentTrajectoryStep || agentDetails.length > 0;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── ROW 1: BUILD | SIMULATION ─────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* BUILD */}
        <div style={{ padding: '36px 48px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          <SectionTitle>Build Graph</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Stepper label="Nodes" value={numNodes} onChange={setNumNodes} min={2} max={30} />
            <NumberInput label="Edges" value={numEdges} onChangeValue={setNumEdges} placeholder="Auto" />
            <Stepper label="Agents" value={numAgents} onChange={handleNumAgentsChange} min={1} max={10} />
            <Stepper label="Dests" value={numDests} onChange={setNumDests} min={1} max={8} />
          </div>
          <div style={{ marginTop: 24 }}>
            <Button variant="primary" onClick={handleRandom} disabled={isTraining} style={{ fontSize: 13, padding: '10px 24px' }}>
              Generate Random Graph
            </Button>
          </div>
          {buildError && (
            <div style={{ color: '#f87171', fontSize: 12, marginTop: 12, lineHeight: 1.4 }}>{buildError}</div>
          )}
        </div>

        {/* SIMULATION */}
        <div style={{ padding: '36px 48px' }}>
          <SectionTitle>Simulation</SectionTitle>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 20, lineHeight: 1.5 }}>
            Training runs continuously until you stop it. Pause to scrub through each step.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {isTraining ? (
              <>
                {isPaused ? (
                  <Button variant="primary" onClick={resumeTraining} style={{ fontSize: 13, padding: '10px 20px' }}>
                    <Play size={15} /> Resume
                  </Button>
                ) : (
                  <Button onClick={pauseTraining} style={{ fontSize: 13, padding: '10px 20px', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}>
                    <Pause size={15} /> Pause
                  </Button>
                )}
                <Button variant="danger" onClick={stopTraining} style={{ fontSize: 13, padding: '10px 20px' }}>
                  <Square size={15} /> Stop
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={startTraining} disabled={!graphData} style={{ fontSize: 13, padding: '10px 24px' }}>
                <Play size={15} /> Start Training
              </Button>
            )}
          </div>

        </div>
      </div>

      {/* ── ROW 2: REPLAY | DISPLAY SETTINGS ─────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* REPLAY */}
        <div style={{ padding: '36px 48px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          <SectionTitle>Replay</SectionTitle>
          {episodeData ? (
            <>
              <RangeSlider
                value={currentStep}
                min={0}
                max={totalSteps > 0 ? totalSteps - 1 : 0}
                onChange={setStep}
                label={`Step ${currentStep}`}
                formatValue={(_v: number) => `/ ${totalSteps - 1}`}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
                <Button style={{ padding: '8px 12px' }} onClick={() => jumpBack(10)}><Rewind size={15} /></Button>
                <Button style={{ padding: '8px 12px' }} onClick={stepBack}><SkipBack size={15} /></Button>
                {isPlaying ? (
                  <Button variant="primary" style={{ padding: '10px 16px' }} onClick={pause}><Pause size={17} /></Button>
                ) : (
                  <Button variant="primary" style={{ padding: '10px 16px' }} onClick={play}><Play size={17} /></Button>
                )}
                <Button style={{ padding: '8px 12px' }} onClick={stepForward}><SkipForward size={15} /></Button>
                <Button style={{ padding: '8px 12px' }} onClick={() => jumpForward(10)}><FastForward size={15} /></Button>
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <Button onClick={handleAnalyze} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                  <BarChart2 size={14} /> Open Analysis
                </Button>
              </div>
            </>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
              {isTraining ? 'Stop or pause training to replay the latest simulation.' : 'Start and stop a simulation to enable replay.'}
            </p>
          )}
        </div>

        {/* DISPLAY SETTINGS */}
        <div style={{ padding: '36px 48px' }}>
          <SectionTitle>Display</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
            <ToggleRow label="Node IDs" active={showIds} onToggle={toggleShowIds} />
            <ToggleRow label="Prices" active={showPrices} onToggle={toggleShowPrices} />
            <ToggleRow label="Destinations" active={showDests} onToggle={toggleShowDests} />
            <ToggleRow label="Agents" active={showAgents} onToggle={toggleShowAgents} />
          </div>
          <div style={{ marginTop: 28 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
              Animation Speed
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Fast</span>
              <input
                type="range"
                className="range-slider"
                min={50}
                max={1000}
                step={10}
                value={animSpeed}
                onChange={e => setAnimSpeed(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Slow</span>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              {animSpeed}ms per step
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: STATS — TABBED ────────────────────────── */}
      {hasStats && (
        <div style={{ padding: '36px 48px' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {(['agents', 'nodes', 'system'] as StatsTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setStatsTab(tab)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: statsTab === tab ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent',
                  color: statsTab === tab ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)',
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  padding: '10px 28px',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.2s',
                  marginBottom: -1,
                }}
                onMouseEnter={e => { if (statsTab !== tab) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                onMouseLeave={e => { if (statsTab !== tab) e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* AGENTS TAB */}
          {statsTab === 'agents' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {Array.from({ length: numAgentsDisplay }, (_, i) => {
                const aid = String(i);
                const stats = currentTrajectoryStep?.agent_stats?.[aid];
                const detail = agentDetails.find(a => a.agent_id === i);
                const color = AGENT_COLORS[i % AGENT_COLORS.length];

                return (
                  <div key={i} style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    padding: 24,
                    borderLeft: `3px solid ${color}`,
                    transition: 'border-color 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color }}>Agent {i}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                        {stats ? `Step ${currentStep}` : 'Live'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13 }}>
                      <StatRow label="Reward" value={stats?.total_profit ?? detail?.cumulative_reward ?? 0} />
                      <StatRow label="Trips" value={stats?.trips_completed ?? detail?.trips_completed ?? 0} />
                      <StatRow label="Tax Rev" value={stats?.tax_revenue ?? detail?.tax_revenue ?? 0} />
                      <StatRow label="Tax Paid" value={stats?.tax_paid ?? detail?.tax_paid ?? 0} />
                      <StatRow label="Dest Rev" value={stats?.dest_revenue ?? detail?.dest_revenue ?? 0} />
                      <StatRow label="Avg Reward"
                        value={currentStep > 0 ? ((stats?.total_profit ?? 0) / (currentStep + 1)).toFixed(2) : '—'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* NODES TAB */}
          {statsTab === 'nodes' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {Array.from({ length: numNodesDisplay }, (_, i) => {
                const nid = String(i);
                const nStats = currentTrajectoryStep?.node_stats?.[nid];
                const price = currentTrajectoryStep?.prices?.[nid] ?? 0;
                const owner = episodeData?.graph?.ownership?.[nid] ?? graphData?.ownership?.[i] ?? -1;
                const ownerColor = owner >= 0 ? AGENT_COLORS[owner % AGENT_COLORS.length] : 'rgba(255,255,255,0.15)';

                const destOf: number[] = [];
                const dests = episodeData?.graph?.destinations ?? graphData?.destinations ?? {};
                for (const [agentId, nodeIds] of Object.entries(dests)) {
                  if (nodeIds.includes(i)) destOf.push(parseInt(agentId));
                }

                return (
                  <div key={i} style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    padding: 20,
                    fontSize: 13,
                    transition: 'border-color 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontWeight: 600, color: ownerColor, fontSize: 14 }}>Node {i}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>${price}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <StatRow label="Owner" value={owner >= 0 ? `Agent ${owner}` : 'None'} />
                      <StatRow label="Visits" value={nStats?.visits ?? 0} />
                      <StatRow label="Tax Collected" value={nStats?.revenue_collected ?? 0} />
                    </div>
                    {destOf.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>Dest of: </span>
                        {destOf.map(a => (
                          <span key={a} style={{ color: AGENT_COLORS[a % AGENT_COLORS.length], marginRight: 6, fontSize: 12, fontWeight: 600 }}>A{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SYSTEM TAB */}
          {statsTab === 'system' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
              <SystemCard label="Step" value={currentStep} />
              <SystemCard label="Total Agents" value={numAgentsDisplay} />
              <SystemCard label="Total Nodes" value={numNodesDisplay} />
              <SystemCard label="Total Edges" value={graphData?.edges?.length ?? episodeData?.graph?.edges?.length ?? 0} />
              {isTraining && (
                <SystemCard label="Status" value={isPaused ? 'Paused' : 'Running'} />
              )}
              {currentTrajectoryStep && (
                <>
                  <SystemCard
                    label="Avg Price"
                    value={(() => {
                      const prices = Object.values(currentTrajectoryStep.prices || {});
                      if (prices.length === 0) return '—';
                      return (prices.reduce((a, b) => a + Number(b), 0) / prices.length).toFixed(2);
                    })()}
                  />
                  <SystemCard
                    label="Total Reward"
                    value={(() => {
                      const rewards = Object.values(currentTrajectoryStep.rewards || {});
                      if (rewards.length === 0) return '—';
                      return rewards.reduce((a, b) => a + Number(b), 0).toFixed(2);
                    })()}
                  />
                  <SystemCard label="Completions" value={currentTrajectoryStep.dest_completions?.length ?? 0} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ToggleRow: React.FC<{ label: string; active: boolean; onToggle: () => void }> = ({ label, active, onToggle }) => (
  <div
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
    onClick={onToggle}
  >
    <span style={{ fontSize: 13, color: active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)', transition: 'color 0.2s' }}>{label}</span>
    {/* stopPropagation so Toggle's internal click doesn't double-fire the row's onClick */}
    <span onClick={e => e.stopPropagation()}>
      <Toggle checked={active} onChange={onToggle} />
    </span>
  </div>
);

const StatRow: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: 'rgba(255,255,255,0.25)' }}>{label}</span>
    <span style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
      {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}
    </span>
  </div>
);

const SystemCard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div style={{
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    padding: 24,
  }}>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
      {label}
    </div>
    <div style={{ fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
  </div>
);
