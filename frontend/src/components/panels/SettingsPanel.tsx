import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useUIStore, DEFAULT_AGENT_COLORS, UIMode } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { api } from '../../api/client';
import { 
  Play, Pause, Square, ChevronDown, ChevronRight, 
  Layout, Activity, Gauge, FlaskConical, 
  MousePointer2, CircleDashed, Spline, User, MapPin, Trash2 
} from 'lucide-react';
import { Stepper, NumberInput, Button, Toggle, ColorPicker } from '../shared';

const Accordion: React.FC<{ 
  title: string; 
  icon: React.ReactNode;
  children: React.ReactNode; 
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text)',
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: isOpen ? 'var(--color-accent)' : 'var(--color-text-dim)', transition: 'color 0.2s' }}>{icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: isOpen ? 'var(--color-text)' : 'var(--color-text-dim)' }}>
            {title}
          </span>
        </div>
        {isOpen ? <ChevronDown size={14} color="var(--color-text-dim)" /> : <ChevronRight size={14} color="var(--color-text-dim)" />}
      </button>
      {isOpen && (
        <div style={{ padding: '4px 20px 24px 20px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export const SettingsPanel: React.FC = () => {
  const loadGraph = useGraphStore(s => s.loadGraph);
  const graphData = useGraphStore(s => s.data);
  const graphLayout = useGraphStore(s => s.layout);
  const clearAll = useGraphStore(s => s.clearAll);

  const {
    isTraining, isPaused,
    pauseTraining: storeSetPaused,
    resumeTraining: storeSetResumed,
  } = useTrainingStore();
  const config = useConfigStore(s => s.config);

  const updateConfig = useConfigStore(s => s.updateConfig);
  const loadConfig = useConfigStore(s => s.loadConfig);

  const {
    mode, setMode,
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

  const [priceBudget, setPriceBudgetLocal] = useState(config?.agent?.price_budget ?? 100);
  const [tripReward, setTripRewardLocal] = useState(config?.agent?.trip_reward ?? 25);

  useEffect(() => {
    if (config?.agent) {
      setPriceBudgetLocal(config.agent.price_budget ?? 100);
      setTripRewardLocal(config.agent.trip_reward ?? 25);
    }
  }, [config]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushConfig = (patch: { price_budget?: number; trip_reward?: number }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await api.config.update({ agent: patch });
        updateConfig({ agent: { ...config?.agent, ...patch } as any });
      } catch { }
    }, 300);
  };

  const handlePriceBudget = (val: number) => {
    setPriceBudgetLocal(val);
    pushConfig({ price_budget: val });
  };
  const handleTripReward = (val: number) => {
    setTripRewardLocal(val);
    pushConfig({ trip_reward: val });
  };

  const liveNumAgents = React.useMemo(() => {
    if (!graphData) return numAgents;
    const ownerMax = Math.max(0, ...Object.values(graphData.ownership || {}).map(v => Number(v) + 1));
    const destMax = Math.max(0, ...Object.keys(graphData.destinations || {}).map(k => Number(k) + 1));
    return Math.max(ownerMax, destMax, numAgents, 1);
  }, [graphData, numAgents]);

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
      useTrainingStore.getState().resetEpisodeData();
    } catch (e: any) {
      setError(e?.message || 'Failed to generate graph');
    }
  };

  const startSimulation = async () => {
    if (isTraining) return;
    setError(null);
    try {
      if (!graphData) { setError('Build graph first'); return; }
      useTrainingStore.getState().startTraining();
      await api.graph.build({
        num_nodes: graphData.num_nodes,
        edges: graphData.edges,
        ownership: Object.fromEntries(Object.entries(graphData.ownership).map(([k, v]) => [String(k), Number(v)])),
        destinations: Object.fromEntries(Object.entries(graphData.destinations).map(([k, v]) => [String(k), v as number[]])),
        starting_positions: Object.fromEntries(Object.entries(graphData.starting_positions || {}).map(([k, v]) => [String(k), Number(v)])),
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

  const buildTools: { m: UIMode; icon: React.ReactNode; label: string }[] = [
    { m: 'view', icon: <MousePointer2 size={14} />, label: 'Pointer' },
    { m: 'build_node', icon: <CircleDashed size={14} />, label: 'Node' },
    { m: 'build_edge', icon: <Spline size={14} />, label: 'Edge' },
    { m: 'build_owner', icon: <User size={14} />, label: 'Owner' },
    { m: 'build_dest', icon: <MapPin size={14} />, label: 'Dest' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* ── SESSION CONTROL ────────────────────────────────── */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--color-border)', background: 'rgba(99, 102, 241, 0.03)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {isTraining ? (
            <>
              {isPaused ? (
                <Button variant="primary" onClick={resumeTraining} style={{ flex: 1, height: 36 }}>
                  <Play size={14} fill="currentColor" /> RESUME
                </Button>
              ) : (
                <Button variant="warning" onClick={pauseTraining} style={{ flex: 1, height: 36 }}>
                  <Pause size={14} fill="currentColor" /> PAUSE
                </Button>
              )}
              <Button variant="danger" onClick={stopTraining} style={{ flex: 1, height: 36 }}>
                <Square size={14} fill="currentColor" /> STOP
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={startSimulation} disabled={!graphData} style={{ width: '100%', height: 42 }}>
              <Play size={16} fill="currentColor" /> START SIMULATION
            </Button>
          )}
        </div>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{error.toUpperCase()}</div>}
      </div>

      {/* ── BUILD TOOLS ───────────────────────────────────── */}
      <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {buildTools.map(t => (
            <Button 
              key={t.m} 
              variant={mode === t.m ? 'primary' : 'secondary'} 
              onClick={() => setMode(t.m)}
              disabled={isTraining && t.m !== 'view'}
              style={{ height: 32, fontSize: 9, padding: 0, gap: 6 }}
            >
              {t.icon} {t.label.toUpperCase()}
            </Button>
          ))}
          <Button 
            variant="danger" 
            onClick={() => { if(window.confirm('Clear all graph data?')) clearAll(); }}
            disabled={isTraining}
            style={{ height: 32, fontSize: 9, padding: 0, gap: 6, gridColumn: 'span 2' }}
          >
            <Trash2 size={13} /> CLEAR CANVAS
          </Button>
        </div>
      </div>

      {/* ── SECTIONS ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Accordion title="Graph Generator" icon={<Layout size={16} />} defaultOpen={!isTraining}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
            <Stepper label="Nodes" value={numNodes} onChange={setNumNodes} min={2} max={50} />
            <NumberInput label="Edges" value={numEdges} onChangeValue={setNumEdges} placeholder="Auto" />
            <Stepper label="Agents" value={numAgents} onChange={handleNumAgentsChange} min={1} max={10} />
            <Stepper label="Avg Dests" value={numDests} onChange={setNumDests} min={1} max={8} />
          </div>
          <Button variant="secondary" onClick={handleRandom} disabled={isTraining} style={{ width: '100%', marginTop: 24, height: 32 }}>
            GENERATE RANDOM
          </Button>
        </Accordion>

        <Accordion title="Simulation Config" icon={<Activity size={16} />} defaultOpen={isTraining}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 8 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 9, fontWeight: 800, color: 'var(--color-text-dim)' }}>
                <span>PRICE BUDGET</span>
                <span style={{ color: 'var(--color-text)' }}>${priceBudget}</span>
              </div>
              <input type="range" className="range-slider" min={20} max={500} step={10} value={priceBudget} onChange={e => handlePriceBudget(Number(e.target.value))} disabled={isTraining} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 9, fontWeight: 800, color: 'var(--color-text-dim)' }}>
                <span>TRIP REWARD</span>
                <span style={{ color: 'var(--color-text)' }}>+{tripReward}</span>
              </div>
              <input type="range" className="range-slider" min={5} max={100} step={5} value={tripReward} onChange={e => handleTripReward(Number(e.target.value))} disabled={isTraining} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 9, fontWeight: 800, color: 'var(--color-text-dim)' }}>
                <span>ANIMATION DELAY</span>
                <span style={{ color: animSpeed === 0 ? 'var(--color-success)' : 'var(--color-text)' }}>{animSpeed === 0 ? 'TURBO' : `${animSpeed}MS`}</span>
              </div>
              <input type="range" className="range-slider" min={0} max={1000} step={50} value={animSpeed} onChange={e => setAnimSpeed(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
        </Accordion>

        <Accordion title="Display Toggles" icon={<Gauge size={16} />}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: showIds ? 'var(--color-text)' : 'var(--color-text-dim)' }}>IDs</span>
              <Toggle checked={showIds} onChange={toggleShowIds} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: showPrices ? 'var(--color-text)' : 'var(--color-text-dim)' }}>Prices</span>
              <Toggle checked={showPrices} onChange={toggleShowPrices} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: showDests ? 'var(--color-text)' : 'var(--color-text-dim)' }}>Dests</span>
              <Toggle checked={showDests} onChange={toggleShowDests} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: showAgents ? 'var(--color-text)' : 'var(--color-text-dim)' }}>Agents</span>
              <Toggle checked={showAgents} onChange={toggleShowAgents} />
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 9, fontWeight: 800, color: 'var(--color-text-dim)' }}>
              <span>NODE SIZE</span>
              <span style={{ color: 'var(--color-text)' }}>{nodeSize}PX</span>
            </div>
            <input type="range" className="range-slider" min={16} max={54} step={2} value={nodeSize} onChange={e => setNodeSize(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
        </Accordion>

        <Accordion title="Agent Palette" icon={<FlaskConical size={16} />}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={resetAgentColors} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 9, fontWeight: 800, cursor: 'pointer', padding: 0 }}>RESET COLORS</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 12 }}>
            {Array.from({ length: liveNumAgents }, (_, i) => {
              const color = agentColors[i % agentColors.length] ?? DEFAULT_AGENT_COLORS[i % DEFAULT_AGENT_COLORS.length];
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <ColorPicker value={color} onChange={hex => setAgentColor(i, hex)} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)' }}>A{i}</span>
                </div>
              );
            })}
          </div>
        </Accordion>
      </div>
    </div>
  );
};
