import React, { useState, useMemo } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useUIStore } from '../../stores/uiStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useReplayStore } from '../../stores/replayStore';

const EDGE_W = 1.5;

export const GraphRenderer: React.FC = () => {
  const data = useGraphStore(s => s.data);
  const layout = useGraphStore(s => s.layout);

  const { showIds, showPrices, showDests, showAgents, mode, nodeSize, agentColors, animSpeed } = useUIStore();
  const NODE_R = nodeSize;
  const GLOW_R = Math.round(nodeSize * 0.27); // ~8 at default size 30

  const currentPrices = useTrainingStore(s => s.currentPrices);
  const isTraining = useTrainingStore(s => s.isTraining);
  const stepHistory = useTrainingStore(s => s.stepHistory);
  const simAnimStep = useTrainingStore(s => s.simAnimStep);

  const episodeData = useReplayStore(s => s.episodeData);
  const currentStep = useReplayStore(s => s.currentStep);

  const [hoverNode, setHoverNode] = useState<number | null>(null);

  const agentPositions = useMemo<Record<string, number>>(() => {
    if (episodeData && episodeData.trajectory && episodeData.trajectory.length > 0) {
      const step = episodeData.trajectory[currentStep];
      if (step?.agent_positions) return step.agent_positions;
    }
    if (isTraining && stepHistory && stepHistory.length > 0) {
      // Use the animated step index instead of always the last step
      const stepIdx = Math.min(simAnimStep, stepHistory.length - 1);
      const animatedStep = stepHistory[stepIdx];
      if (animatedStep?.positions) {
        const pos: Record<string, number> = {};
        animatedStep.positions.forEach((nodeId: number, agentId: number) => {
          pos[String(agentId)] = nodeId;
        });
        return pos;
      }
    }
    // Fallback: show agents at their starting positions on the graph
    if (data?.starting_positions) {
      const pos: Record<string, number> = {};
      for (const [agentId, nodeId] of Object.entries(data.starting_positions)) {
        pos[String(agentId)] = Number(nodeId);
      }
      if (Object.keys(pos).length > 0) return pos;
    }
    return {};
  }, [episodeData, currentStep, isTraining, stepHistory, simAnimStep, data]);

  // Prices to display — also use animated step during simulation
  const displayPrices = useMemo<Record<string, number>>(() => {
    if (episodeData && episodeData.trajectory && episodeData.trajectory.length > 0) {
      const step = episodeData.trajectory[currentStep];
      if (step?.prices) {
        const p: Record<string, number> = {};
        for (const [k, v] of Object.entries(step.prices)) p[k] = Number(v);
        return p;
      }
    }
    if (isTraining && stepHistory && stepHistory.length > 0) {
      const stepIdx = Math.min(simAnimStep, stepHistory.length - 1);
      const animatedStep = stepHistory[stepIdx];
      if (animatedStep?.prices) {
        const p: Record<string, number> = {};
        for (const [k, v] of Object.entries(animatedStep.prices)) p[k] = Number(v);
        return p;
      }
    }
    if (Object.keys(currentPrices).length > 0) return currentPrices;
    return {};
  }, [episodeData, currentStep, isTraining, stepHistory, simAnimStep, currentPrices]);

  if (!data || !layout) return null;
  const nodesList = Array.from({ length: data.num_nodes }, (_, i) => i);

  const getPos = (id: number): [number, number] | null =>
    layout[id] ?? layout[String(id) as unknown as number] ?? null;

  const getColor = (agentId: number) =>
    agentColors[agentId % agentColors.length] ?? '#888';

  return (
    <>
      {/* Edges */}
      <g id="edgeLayer">
        {data.edges.map((e, idx) => {
          const s = getPos(e[0]);
          const t = getPos(e[1]);
          if (!s || !t) return null;
          return (
            <line
              key={idx}
              x1={s[0]} y1={s[1]} x2={t[0]} y2={t[1]}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={EDGE_W}
            />
          );
        })}
      </g>

      {/* Nodes */}
      <g id="nodeLayer">
        {nodesList.map(id => {
          const pos = getPos(id);
          if (!pos) return null;

          const owner = data.ownership[id] ?? data.ownership[String(id) as unknown as number];
          const hasOwner = owner !== undefined && owner >= 0;
          const color = hasOwner ? getColor(Number(owner)) : 'rgba(255,255,255,0.35)';
          const price = displayPrices[String(id)] ?? 5.0;
          const isHover = hoverNode === id;
          const isBuildMode = mode !== 'view';

          // Destination pips — ALWAYS in the upper half (angles between -150° and -30°)
          const destEntries = Object.entries(data.destinations).filter(([, dests]) => dests.includes(id));
          const totalDests = destEntries.length;
          const pipSpread = Math.PI * 0.55; 
          const pipAngles = destEntries.map(([agentId], i) => {
            const center = -Math.PI / 2; 
            const offset = totalDests > 1
              ? (i / (totalDests - 1) - 0.5) * pipSpread
              : 0;
            return { agentId: parseInt(agentId), angle: center + offset };
          });

          return (
            <g
              key={id}
              transform={`translate(${pos[0]}, ${pos[1]})`}
              onMouseEnter={() => setHoverNode(id)}
              onMouseLeave={() => setHoverNode(null)}
              style={{ cursor: isBuildMode ? 'pointer' : 'default' }}
            >
              {/* Hit area */}
              <circle r={NODE_R + 14} fill="transparent" />

              {/* Glow */}
              {(hasOwner || isHover) && (
                <circle
                  r={NODE_R + GLOW_R + (isHover ? 6 : 2)}
                  fill={color}
                  className={hasOwner ? 'node-owned-glow' : ''}
                  opacity={isHover ? 0.4 : 0.18}
                  style={{ filter: 'blur(7px)', transition: 'all 0.2s' }}
                />
              )}

              {/* Body */}
              <circle
                r={NODE_R}
                fill={hasOwner ? `${color}22` : 'rgba(255,255,255,0.06)'}
                stroke={hasOwner ? color : 'rgba(255,255,255,0.2)'}
                strokeWidth={1.5}
                style={{ filter: isHover ? 'brightness(1.5)' : 'none', transition: 'filter 0.2s' }}
              />

              {/* Node ID */}
              {showIds && (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  fontSize={Math.max(10, NODE_R * 0.48)}
                  fontWeight="600"
                  fontFamily="'Inter', sans-serif"
                  pointerEvents="none"
                  style={{ userSelect: 'none' }}
                >
                  {id}
                </text>
              )}

              {/* Price label — always BELOW the node */}
              {showPrices && hasOwner && (
                <text
                  y={NODE_R + 18}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.65)"
                  fontSize={15}
                  fontFamily="'Inter', sans-serif"
                  pointerEvents="none"
                >
                  ${price}
                </text>
              )}

              {/* Destination pips — UPPER HALF ONLY, never covers price label */}
              {showDests && pipAngles.map(({ agentId, angle }) => {
                const pipR = NODE_R + 10;
                const px = Math.cos(angle) * pipR;
                const py = Math.sin(angle) * pipR;
                const pipColor = getColor(agentId);
                return (
                  <circle
                    key={`dest-${agentId}`}
                    cx={px}
                    cy={py}
                    r={6}
                    fill={pipColor}
                    stroke="rgba(0,0,0,0.6)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          );
        })}
      </g>

      {/* Agent dots — hidden in turbo mode ONLY while actively simulating */}
      <g id="agentLayer">
        {showAgents && !(isTraining && animSpeed === 0) && Object.entries(agentPositions).map(([agentIdStr, nodeId]) => {
          const pos = getPos(nodeId);
          if (!pos) return null;
          const agentId = parseInt(agentIdStr);
          const color = getColor(agentId);

          const sameNodeAgents = Object.entries(agentPositions)
            .filter(([, n]) => n === nodeId);
          const agentCount = sameNodeAgents.length;
          const agentIndex = sameNodeAgents.findIndex(([id]) => id === agentIdStr);
          const offsetAngle = agentCount > 1 ? (agentIndex / agentCount) * Math.PI * 2 : 0;
          const offsetR = agentCount > 1 ? 14 : 0;
          const ox = Math.cos(offsetAngle) * offsetR;
          const oy = Math.sin(offsetAngle) * offsetR;

          // Smooth agent movement via CSS transform with transition
          const transitionMs = animSpeed > 0 ? Math.min(animSpeed * 0.8, 400) : 0;
          const agentX = pos[0] + ox;
          const agentY = pos[1] + oy;
          return (
            <g
              key={`agent-${agentId}`}
              style={{
                transform: `translate(${agentX}px, ${agentY}px)`,
                transition: transitionMs > 0 ? `transform ${transitionMs}ms ease-out` : 'none',
              }}
            >
              <circle
                r={9}
                fill={color}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.97}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }}
              />
            </g>
          );
        })}
      </g>
    </>
  );
};
