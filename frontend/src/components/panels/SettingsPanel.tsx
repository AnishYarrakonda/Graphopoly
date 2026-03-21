import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useUIStore, DEFAULT_AGENT_COLORS } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { api } from '../../api/client';
import { Play, Pause, Square } from 'lucide-react';
import { Stepper, NumberInput, Button, Toggle, ColorPicker } from '../shared';

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 28,
    fontFamily: "'Inter', sans-serif",
  }}>
    {children}
  </h2>
);

const ToggleRow: React.FC<{ label: string; active: boolean; onToggle: () => void }> = ({ label, active, onToggle }) => (
  <div
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
    onClick={onToggle}
  >
    <span style={{ fontSize: 14, color: active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)', transition: 'color 0.2s' }}>{label}</span>
    <span onClick={e => e.stopPropagation()}>
      <Toggle checked={active} onChange={onToggle} />
    </span>
  </div>
);

export const SettingsPanel: React.FC = () => {
  const loadGraph = useGraphStore(s => s.loadGraph);
  const graphData = useGraphStore(s => s.data);
  const graphLayout = useGraphStore(s => s.layout);

  const {
    isTraining, isPaused,
    pauseTraining: storeSetPaused,
    resumeTraining: storeSetResumed,
  } = useTrainingStore();

  const config = useConfigStore(s => s.config);
  const updateConfig = useConfigStore(s => s.updateConfig);
  const loadConfig = useConfigStore(s => s.loadConfig);

  const {
    showIds, showPrices, showDests, showAgents,
    nodeSize, agentColors,
    animSpeed,
    toggleShowIds, toggleShowPrices, toggleShowDests, toggleShowAgents,
    setNodeSize, setAgentColor, resetAgentColors,
    setAnimSpeed,
  } = useUIStore();

  const [numNodes, setNumNodes] = useState(8);
  const [numEdges, setNumEdges] = useState<number | ''>('');
  const [numAgents, setNumAgents] = useState(2);
  const [numDests, setNumDests] = useState(2);
  const [error, setError] = useState<string | null>(null);

  // Sim params synced with backend config
  const [maxPrice, setMaxPriceLocal] = useState(config?.agent?.max_price ?? 20);
  const [tripReward, setTripRewardLocal] = useState(config?.agent?.trip_reward ?? 10);

  // Keep local values in sync when config loads
  useEffect(() => {
    if (config?.agent) {
      setMaxPriceLocal(config.agent.max_price ?? 20);
      setTripRewardLocal(config.agent.trip_reward ?? 10);
    }
  }, [config]);

  // Debounce backend config pushes (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushConfig = (patch: { max_price?: number; trip_reward?: number }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.config.update({ agent: patch });
        updateConfig({ agent: { ...config?.agent, ...patch } as any });
        if (res.config) updateConfig(res.config);
      } catch { /* ignore during training */ }
    }, 300);
  };

  const handleMaxPrice = (val: number) => {
    setMaxPriceLocal(val);
    pushConfig({ max_price: val });
  };
  const handleTripReward = (val: number) => {
    setTripRewardLocal(val);
    pushConfig({ trip_reward: val });
  };

  // Derive actual agent count from live graph data
  const liveNumAgents = React.useMemo(() => {
    if (!graphData) return numAgents;
    const ownerMax = Math.max(0, ...Object.values(graphData.ownership || {}).map(v => Number(v) + 1));
    const destMax = Math.max(0, ...Object.keys(graphData.destinations || {}).map(k => Number(k) + 1));
    return Math.max(ownerMax, destMax, numAgents, 1);
  }, [graphData, numAgents]);

  // Keep numAgents in sync with config
  useEffect(() => {
    if (config?.agent?.num_agents !== undefined && config.agent.num_agents !== numAgents) {
      setNumAgents(config.agent.num_agents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.agent?.num_agents]);

  const handleNumAgentsChange = (val: number) => {
    setNumAgents(val);
    api.config.update({ agent: { num_agents: val } })
      .then(res => { if (res.config) loadConfig(res.config); })
      .catch(() => { });
  };

  const handleRandom = async () => {
    if (isTraining) return;
    setError(null);
    try {
      const res = await api.graph.random({
        num_nodes: numNodes,
        num_edges: numEdges === '' ? null : numEdges,
        num_agents: numAgents,
        num_destinations: numDests,
      });
      loadGraph(res.graph, res.layout);
      // Clear stale episode data so old agents don't persist on the new graph
      useTrainingStore.getState().resetEpisodeData();
    } catch (e: any) {
      setError(e?.message || 'Failed to generate graph');
    }
  };

  const startSimulation = async () => {
    if (isTraining) return;
    setError(null);
    try {
      if (!graphData) { setError('Build or generate a graph first'); return; }
      // Reset all episode data so old agent positions don't bleed into this simulation
      useTrainingStore.getState().startTraining();
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
        for (const [k, v] of Object.entries(graphLayout)) layoutForApi[String(k)] = v;
        await api.graph.syncLayout(layoutForApi);
      }
      await api.simulate.start();
    } catch (e: any) {
      setError(e?.message || 'Failed to start simulation');
    }
  };

  const stopTraining = () => api.train.stop().catch(console.error);
  const pauseTraining = async () => { await api.train.pause().catch(console.error); storeSetPaused(); };
  const resumeTraining = async () => { await api.train.resume().catch(console.error); storeSetResumed(); };

  // Speed label helper
  const speedLabel = animSpeed === 0
    ? 'Instant (no animation)'
    : `${animSpeed}ms per step`;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>

        {/* ── BUILD ─────────────────────────────────────── */}
        <div style={{ padding: '48px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <SectionTitle>Build Graph</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <Stepper label="Nodes" value={numNodes} onChange={setNumNodes} min={2} max={20} />
            <NumberInput label="Edges" value={numEdges} onChangeValue={setNumEdges} placeholder="Auto" />
            <Stepper label="Agents" value={numAgents} onChange={handleNumAgentsChange} min={1} max={10} />
            <Stepper label="Avg Dests" value={numDests} onChange={setNumDests} min={1} max={8} />
          </div>
          <Button data-tour="generate-btn" variant="primary" onClick={handleRandom} disabled={isTraining} style={{ fontSize: 13, padding: '11px 28px' }}>
            Generate Random Graph
          </Button>
          {error && (
            <div style={{ color: '#f87171', fontSize: 13, marginTop: 16, lineHeight: 1.5 }}>{error}</div>
          )}
        </div>

        {/* ── SIMULATION ────────────────────────────────── */}
        <div style={{ padding: '48px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <SectionTitle>Simulation</SectionTitle>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 28, lineHeight: 1.7 }}>
            Simulation runs the trained model on your graph. Pause to scrub through each step below.
          </p>

          {/* Start / Pause / Stop */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
            {isTraining ? (
              <>
                {isPaused ? (
                  <Button variant="primary" onClick={resumeTraining} style={{ fontSize: 13, padding: '11px 24px' }}>
                    <Play size={15} /> Resume
                  </Button>
                ) : (
                  <Button variant="warning" onClick={pauseTraining} style={{ fontSize: 13, padding: '11px 24px' }}>
                    <Pause size={15} /> Pause
                  </Button>
                )}
                <Button variant="danger" onClick={stopTraining} style={{ fontSize: 13, padding: '11px 24px' }}>
                  <Square size={15} /> Stop
                </Button>
              </>
            ) : (
              <Button data-tour="start-sim" variant="primary" onClick={startSimulation} disabled={!graphData} style={{ fontSize: 13, padding: '11px 28px' }}>
                <Play size={15} /> Start Simulation
              </Button>
            )}
          </div>

          {isTraining && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isPaused ? '#fbbf24' : '#4ade80',
                boxShadow: isPaused ? '0 0 8px #fbbf24' : '0 0 8px #4ade80',
                animation: isPaused ? 'none' : 'pulse 1.5s infinite',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                {isPaused ? 'Paused' : 'Running'}
              </span>
            </div>
          )}

          {/* Max node price */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Max Node Price
              </label>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>${maxPrice}</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={1}
              max={100}
              step={1}
              value={maxPrice}
              onChange={e => handleMaxPrice(Number(e.target.value))}
              disabled={isTraining}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              <span>$1</span><span>$100</span>
            </div>
          </div>

          {/* Trip reward (destination revenue) */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Destination Revenue
              </label>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>{tripReward}</span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={1}
              max={50}
              step={1}
              value={tripReward}
              onChange={e => handleTripReward(Number(e.target.value))}
              disabled={isTraining}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              <span>1</span><span>50</span>
            </div>
          </div>

          {/* Animation speed */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Animation Speed
              </label>
              <span style={{ fontSize: 12, color: animSpeed === 0 ? '#4ade80' : 'rgba(255,255,255,0.55)' }}>
                {speedLabel}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>⚡</span>
              <input
                type="range"
                className="range-slider"
                min={0}
                max={1000}
                step={50}
                value={animSpeed}
                onChange={e => setAnimSpeed(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>🐢</span>
            </div>
            {animSpeed === 0 && (
              <div style={{ fontSize: 11, color: 'rgba(74,222,128,0.7)', marginTop: 6, lineHeight: 1.4 }}>
                Turbo mode — simulation runs at max speed, agent animation is hidden.
              </div>
            )}
          </div>
        </div>

        {/* ── DISPLAY ───────────────────────────────────── */}
        <div style={{ padding: '48px' }}>
          <SectionTitle>Display</SectionTitle>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
            <ToggleRow label="Node IDs" active={showIds} onToggle={toggleShowIds} />
            <ToggleRow label="Prices" active={showPrices} onToggle={toggleShowPrices} />
            <ToggleRow label="Destinations" active={showDests} onToggle={toggleShowDests} />
            <ToggleRow label="Agents" active={showAgents} onToggle={toggleShowAgents} />
          </div>

          {/* Node size */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Node Size
              </label>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{nodeSize}px</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>S</span>
              <input
                type="range"
                className="range-slider"
                min={16}
                max={52}
                step={2}
                value={nodeSize}
                onChange={e => setNodeSize(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>L</span>
            </div>
          </div>

          {/* Agent colors */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Agent Colors
              </label>
              <button
                onClick={resetAgentColors}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 11, cursor: 'pointer', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
              >
                Reset
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 10 }}>
              {Array.from({ length: liveNumAgents }, (_, i) => {
                const color = agentColors[i % agentColors.length] ?? DEFAULT_AGENT_COLORS[i % DEFAULT_AGENT_COLORS.length];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <ColorPicker value={color} onChange={hex => setAgentColor(i, hex)} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>A{i}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
