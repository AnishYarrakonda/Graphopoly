import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { useUIStore } from '../../stores/uiStore';
import { useGraphStore } from '../../stores/graphStore';
import { useConfigStore } from '../../stores/configStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { api } from '../../api/client';
import { GraphRenderer } from './GraphRenderer';
import { GraphToolbar } from './GraphToolbar';
import { Button } from '../shared';
import { Plus, Minus, RefreshCw } from 'lucide-react';

export const GraphCanvas: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity.translate(400, 300).scale(1));
  const [transform, setTransform] = useState<d3.ZoomTransform>(transformRef.current);

  const mode = useUIStore(s => s.mode);
  const selectedAgent = useUIStore(s => s.selectedAgent);
  const setSelectedAgent = useUIStore(s => s.setSelectedAgent);
  const agentColors = useUIStore(s => s.agentColors);

  const { data, layout, addNode, addEdge, setOwner, toggleDestination, updateNodePosition, setLayout } = useGraphStore();
  const config = useConfigStore(s => s.config);
  const isTraining = useTrainingStore(s => s.isTraining);
  const isPaused   = useTrainingStore(s => s.isPaused);
  const storeSetPaused   = useTrainingStore(s => s.pauseTraining);
  const storeSetResumed  = useTrainingStore(s => s.resumeTraining);
  const pausedForDragRef = useRef(false);

  // Derive actual agent count from graph ownership/destinations, not just config
  const numAgents = React.useMemo(() => {
    const configAgents = config?.agent?.num_agents ?? 2;
    if (!data) return configAgents;
    const ownerMax = Math.max(0, ...Object.values(data.ownership || {}).map(v => Number(v) + 1));
    const destMax = Math.max(0, ...Object.keys(data.destinations || {}).map(k => Number(k) + 1));
    return Math.max(ownerMax, destMax, configAgents, 1);
  }, [data, config?.agent?.num_agents]);

  const edgeSourceRef = useRef<number | null>(null);
  const [edgeSource, setEdgeSource] = useState<number | null>(null); // for display only

  // Node drag state
  const dragNodeRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  // Click vs drag distinction for build actions
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // ── D3 Zoom: pan/zoom only in view mode ─────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 8])
      .filter((event) => {
        // Scroll wheel: never (we have buttons)
        if (event.type === 'wheel') return false;
        // Drag-pan: ONLY in view mode, ONLY on background
        if (event.type === 'mousedown' || event.type === 'pointerdown') {
          if (mode !== 'view') return false; // ← block zoom in build modes
          const tag = (event.target as Element).tagName;
          if (tag !== 'rect' && tag !== 'svg') return false;
          return event.button === 0;
        }
        return false;
      })
      .on('zoom', (e) => {
        transformRef.current = e.transform;
        setTransform(e.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;
    return () => { svg.on('.zoom', null); };
  }, [mode]); // re-init when mode changes so filter closure is fresh

  // ── Programmatic zoom buttons ────────────────────────────────
  const zoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    zoomRef.current.scaleBy(d3.select(svgRef.current).transition().duration(200) as any, 1.4);
  }, []);
  const zoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    zoomRef.current.scaleBy(d3.select(svgRef.current).transition().duration(200) as any, 1 / 1.4);
  }, []);

  // ── Coordinate helpers ───────────────────────────────────────
  const screenToGraph = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const t = transformRef.current;
    return [(clientX - rect.left - t.x) / t.k, (clientY - rect.top - t.y) / t.k];
  }, []);

  const findNearestNode = useCallback((x: number, y: number, radius: number): number | null => {
    if (!layout) return null;
    let closest: number | null = null;
    let closestDist = radius;
    for (const [idStr, pos] of Object.entries(layout)) {
      const dx = pos[0] - x;
      const dy = pos[1] - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) { closestDist = dist; closest = Number(idStr); }
    }
    return closest;
  }, [layout]);

  const centerView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || !layout) return;
    const nodes = Object.values(layout);
    if (nodes.length === 0) return;

    const [minX, maxX] = d3.extent(nodes, d => d[0]) as [number, number];
    const [minY, maxY] = d3.extent(nodes, d => d[1]) as [number, number];
    
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const svg = d3.select(svgRef.current);
    const box = svg.node()!.getBoundingClientRect();
    const w = box.width;
    const h = box.height;

    const t = d3.zoomIdentity
      .translate(w / 2, h / 2)
      .scale(0.8)
      .translate(-midX, -midY);

    svg.transition().duration(500).call(zoomRef.current.transform, t);
  }, [layout]);

  const normalizeGraph = useCallback(() => {
    if (!data) return;
    const n = data.num_nodes;
    const nextLayout: Record<number, [number, number]> = {};
    const R = Math.max(200, Math.min(400, n * 30));
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      nextLayout[i] = [R * Math.cos(angle), R * Math.sin(angle)];
    }
    setLayout(nextLayout);
    // Center it after store updates
    setTimeout(centerView, 50);
  }, [data, setLayout, centerView]);

  // Auto-center on load
  const lastDataId = useRef<string>('');
  useEffect(() => {
    if (!data) return;
    const dataId = `${data.num_nodes}-${data.edges.length}`;
    if (dataId !== lastDataId.current) {
      lastDataId.current = dataId;
      setTimeout(centerView, 100);
    }
  }, [data, centerView]);

  // ── Mouse handlers: NODE DRAG + auto-pause during training ──
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

    const [gx, gy] = screenToGraph(e.clientX, e.clientY);
    const hitNode = findNearestNode(gx, gy, 40 / transformRef.current.k);
    if (hitNode !== null) {
      dragNodeRef.current = hitNode;
      dragMovedRef.current = false;
      e.stopPropagation(); // prevent D3 pan when starting on a node

      // Auto-pause training while dragging to prevent visual glitches
      if (isTraining && !isPaused) {
        pausedForDragRef.current = true;
        storeSetPaused();
        api.train.pause().catch(console.error);
      }
    }
  }, [screenToGraph, findNearestNode, isTraining, isPaused, storeSetPaused]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragNodeRef.current === null) return;
    dragMovedRef.current = true;
    const [gx, gy] = screenToGraph(e.clientX, e.clientY);
    updateNodePosition(dragNodeRef.current, [gx, gy]);
  }, [screenToGraph, updateNodePosition]);

  const handleMouseUp = useCallback(() => {
    // If we auto-paused, always resume (even on a click without drag)
    if (pausedForDragRef.current) {
      // If nodes were actually moved, sync the new layout first
      if (dragMovedRef.current && layout) {
        const layoutForApi: Record<string, [number, number]> = {};
        for (const [k, v] of Object.entries(layout)) layoutForApi[String(k)] = v;
        api.graph.syncLayout(layoutForApi).catch(console.error);
      }
      api.train.resume().catch(console.error);
      storeSetResumed();
      pausedForDragRef.current = false;
    }
    dragNodeRef.current = null;
    dragMovedRef.current = false;
  }, [layout, storeSetResumed]);

  // ── onClick: all BUILD ACTIONS ───────────────────────────────
  // onClick fires reliably regardless of D3's pointer event handling.
  // We check the movement distance to skip if it was a drag.
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (mode === 'view') return;

    // Was this a real click or the end of a drag?
    if (mouseDownPosRef.current) {
      const dx = e.clientX - mouseDownPosRef.current.x;
      const dy = e.clientY - mouseDownPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return; // drag, skip
    }

    const [gx, gy] = screenToGraph(e.clientX, e.clientY);
    const hitNode = findNearestNode(gx, gy, 40 / transformRef.current.k);

    switch (mode) {
      case 'build_node': {
        if (hitNode !== null) return; // don't place on existing node
        const nextId = data?.num_nodes ?? 0;
        addNode(nextId, [gx, gy]);
        break;
      }
      case 'build_edge': {
        if (hitNode === null) {
          edgeSourceRef.current = null;
          setEdgeSource(null);
          return;
        }
        if (edgeSourceRef.current === null) {
          edgeSourceRef.current = hitNode;
          setEdgeSource(hitNode);
        } else {
          if (edgeSourceRef.current !== hitNode) addEdge(edgeSourceRef.current, hitNode);
          edgeSourceRef.current = null;
          setEdgeSource(null);
        }
        break;
      }
      case 'build_owner': {
        if (hitNode !== null) {
          setOwner(hitNode, parseInt(selectedAgent ?? '0'));
        }
        break;
      }
      case 'build_dest': {
        if (hitNode !== null) {
          toggleDestination(selectedAgent ?? '0', hitNode);
        }
        break;
      }
    }
  }, [mode, data, addNode, addEdge, setOwner, toggleDestination, selectedAgent, screenToGraph, findNearestNode]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <GraphToolbar />

      {/* Zoom ± */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Button onClick={zoomIn} style={{ width: 32, height: 32, padding: 0 }}><Plus size={16} /></Button>
        <Button onClick={zoomOut} style={{ width: 32, height: 32, padding: 0 }}><Minus size={16} /></Button>
      </div>

      {/* Normalize Button (Bottom Right) */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 10 }}>
        <Button 
          onClick={normalizeGraph}
          style={{
            padding: '10px 20px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            borderRadius: 20,
          }}
        >
          <RefreshCw size={14} /> NORMALIZE
        </Button>
      </div>

      {/* Agent picker for OWNER / DEST modes */}
      {(mode === 'build_dest' || mode === 'build_owner') && (
        <div style={{
          position: 'absolute', top: 20, right: 64, zIndex: 10,
          display: 'flex', gap: 6, background: 'rgba(20,20,20,0.85)',
          backdropFilter: 'blur(8px)', padding: '6px 12px',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, alignSelf: 'center', marginRight: 4 }}>
            {mode === 'build_owner' ? 'OWNER:' : 'DEST:'}
          </span>
          {Array.from({ length: numAgents }, (_, i) => {
            const c = agentColors[i % agentColors.length];
            const isSelected = (selectedAgent ?? '0') === String(i);
            return (
              <Button 
                key={i} 
                onClick={() => setSelectedAgent(String(i))} 
                magnetic={false}
                style={{
                  width: 28, height: 28, borderRadius: '50%', padding: 0,
                  border: isSelected ? `2px solid ${c}` : '1px solid rgba(255,255,255,0.1)',
                  background: isSelected ? c : 'transparent',
                  color: isSelected ? '#000' : 'rgba(255,255,255,0.5)',
                  fontWeight: 700, fontSize: 11,
                }}
              >
                {i}
              </Button>
            );
          })}
        </div>
      )}

      {/* Edge source hint */}
      {mode === 'build_edge' && edgeSource !== null && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, background: 'rgba(78,121,167,0.9)', backdropFilter: 'blur(8px)',
          padding: '6px 16px', fontSize: 12, color: '#fff',
        }}>
          Node {edgeSource} selected — click another node to connect
        </div>
      )}

      <svg
        ref={svgRef}
        style={{
          width: '100%', height: '100%', display: 'block',
          cursor: mode === 'view' ? 'grab' : (mode === 'build_node' ? 'crosshair' : 'pointer'),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (pausedForDragRef.current) {
            if (dragMovedRef.current && layout) {
              const layoutForApi: Record<string, [number, number]> = {};
              for (const [k, v] of Object.entries(layout)) layoutForApi[String(k)] = v;
              api.graph.syncLayout(layoutForApi).catch(console.error);
            }
            api.train.resume().catch(console.error);
            storeSetResumed();
            pausedForDragRef.current = false;
          }
          dragNodeRef.current = null;
          dragMovedRef.current = false;
        }}
        onClick={handleClick}
      >
        <defs>
          <pattern id="dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="0.8" fill="rgba(255,255,255,0.04)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
        <g transform={transform.toString()}>
          <GraphRenderer />
        </g>
      </svg>
    </div>
  );
};
