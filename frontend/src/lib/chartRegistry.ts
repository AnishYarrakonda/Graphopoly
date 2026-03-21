import type { ChartData, ChartOptions } from 'chart.js';
import type { TimelineEntry, EpisodeJSON } from '../types/episode';
import { AGENT_COLORS, NODE_COLORS, baseScales, replayAnnotation, baseTooltip } from './chartTheme';

// ── Types ────────────────────────────────────────────────────────────────

export type ChartCategory = 'agents' | 'nodes' | 'economy' | 'system';
export type SyncMode = 'verticalLine' | 'atStep' | 'none';
export type ChartKind = 'line' | 'bar' | 'doughnut' | 'radar' | 'scatter';

export interface BuildParams {
  timeline: TimelineEntry[];
  currentStep: number;
  episodeData: EpisodeJSON;
  selectedAgents: string[];
  selectedNodes: string[];
  agentColors: string[];
}

export interface ChartDef {
  id: string;
  category: ChartCategory;
  title: string;
  chartType: ChartKind;
  syncMode: SyncMode;
  csvFilename: string;
  buildData: (p: BuildParams) => ChartData<any>;
  buildOptions: (p: BuildParams) => ChartOptions<any>;
  buildCsv: (p: BuildParams) => { headers: string[]; rows: (string | number)[][] };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function agentIds(p: BuildParams): string[] {
  const n = p.episodeData.metadata.num_agents;
  const all = Array.from({ length: n }, (_, i) => String(i));
  return p.selectedAgents.length > 0 ? p.selectedAgents : all;
}

function nodeIds(p: BuildParams): string[] {
  const n = p.episodeData.metadata.num_nodes;
  const all = Array.from({ length: n }, (_, i) => String(i));
  return p.selectedNodes.length > 0 ? p.selectedNodes : all;
}

function steps(p: BuildParams): number[] {
  return p.timeline.map(t => t.timestep);
}

function agentColor(aid: string, p: BuildParams): string {
  const i = parseInt(aid);
  return p.agentColors[i % p.agentColors.length] ?? AGENT_COLORS[i % AGENT_COLORS.length];
}

function nodeColor(nid: string, p: BuildParams): string {
  const owner = p.timeline[0]?.nodes[nid]?.owner;
  if (owner !== undefined && owner >= 0) return agentColor(String(owner), p);
  return NODE_COLORS[parseInt(nid) % NODE_COLORS.length];
}

function lineOptions(p: BuildParams, xLabel: string, yLabel: string): ChartOptions<'line'> {
  const s = baseScales();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      tooltip: baseTooltip(),
      legend: { labels: { color: 'rgba(255,255,255,0.5)', boxWidth: 12, padding: 12 } },
      annotation: replayAnnotation(p.currentStep),
    },
    scales: {
      x: { ...s.x, title: { display: true, text: xLabel, color: 'rgba(255,255,255,0.4)' } },
      y: { ...s.y, title: { display: true, text: yLabel, color: 'rgba(255,255,255,0.4)' } },
    },
  };
}

function barOptions(_p: BuildParams, xLabel: string, yLabel: string): ChartOptions<'bar'> {
  const s = baseScales();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: baseTooltip(),
      legend: { display: false },
    },
    scales: {
      x: { ...s.x, title: { display: true, text: xLabel, color: 'rgba(255,255,255,0.4)' } },
      y: { ...s.y, title: { display: true, text: yLabel, color: 'rgba(255,255,255,0.4)' }, beginAtZero: true },
    },
  };
}

function doughnutOptions(): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: baseTooltip(),
      legend: { labels: { color: 'rgba(255,255,255,0.5)', boxWidth: 12, padding: 12 }, position: 'right' },
    },
  };
}

function radarOptions(): ChartOptions<'radar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: baseTooltip(),
      legend: { labels: { color: 'rgba(255,255,255,0.5)', boxWidth: 12, padding: 12 } },
    },
    scales: {
      r: {
        angleLines: { color: 'rgba(255,255,255,0.08)' },
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: 'rgba(255,255,255,0.4)', backdropColor: 'transparent' },
        pointLabels: { color: 'rgba(255,255,255,0.5)' },
        beginAtZero: true,
      },
    },
  };
}

function scatterOptions(_p: BuildParams, xLabel: string, yLabel: string): ChartOptions<'scatter'> {
  const s = baseScales();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: baseTooltip(),
      legend: { labels: { color: 'rgba(255,255,255,0.5)', boxWidth: 12, padding: 12 } },
    },
    scales: {
      x: { ...s.x, title: { display: true, text: xLabel, color: 'rgba(255,255,255,0.4)' } },
      y: { ...s.y, title: { display: true, text: yLabel, color: 'rgba(255,255,255,0.4)' } },
    },
  };
}

// ── Chart Definitions ────────────────────────────────────────────────────

export const CHARTS: ChartDef[] = [

  // ━━━━ AGENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'agent-cumulative-reward',
    category: 'agents',
    title: 'Cumulative Reward',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'agent_rewards.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: agentIds(p).map(a => ({
        label: `Agent ${a}`,
        data: p.timeline.map(t => t.agents[a]?.cumulative_reward ?? 0),
        borderColor: agentColor(a, p),
        backgroundColor: agentColor(a, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Reward'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_reward`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.cumulative_reward ?? 0)]),
      };
    },
  },

  {
    id: 'agent-trips-completed',
    category: 'agents',
    title: 'Trips Completed',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'agent_trips.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: agentIds(p).map(a => ({
        label: `Agent ${a}`,
        data: p.timeline.map(t => t.agents[a]?.trips_completed ?? 0),
        borderColor: agentColor(a, p),
        backgroundColor: agentColor(a, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Trips'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_trips`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.trips_completed ?? 0)]),
      };
    },
  },

  {
    id: 'agent-dest-revenue',
    category: 'agents',
    title: 'Destination Revenue',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'agent_revenue.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: agentIds(p).map(a => ({
        label: `Agent ${a}`,
        data: p.timeline.map(t => t.agents[a]?.dest_revenue ?? 0),
        borderColor: agentColor(a, p),
        backgroundColor: agentColor(a, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Revenue'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_dest_revenue`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.dest_revenue ?? 0)]),
      };
    },
  },

  {
    id: 'agent-reward-comparison',
    category: 'agents',
    title: 'Reward Comparison',
    chartType: 'bar',
    syncMode: 'atStep',
    csvFilename: 'agent_rewards.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const entry = p.timeline[p.currentStep];
      return {
        labels: aids.map(a => `Agent ${a}`),
        datasets: [{
          data: aids.map(a => entry?.agents[a]?.cumulative_reward ?? 0),
          backgroundColor: aids.map(a => agentColor(a, p)),
          borderWidth: 0,
          borderRadius: 4,
        }],
      };
    },
    buildOptions: (p) => barOptions(p, 'Agent', 'Reward'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_reward`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.cumulative_reward ?? 0)]),
      };
    },
  },

  {
    id: 'agent-pricing-strategy',
    category: 'agents',
    title: 'Pricing Strategy',
    chartType: 'bar',
    syncMode: 'atStep',
    csvFilename: 'agent_pricing.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const counts: Record<string, { dec: number; hold: number; inc: number }> = {};
      aids.forEach(a => { counts[a] = { dec: 0, hold: 0, inc: 0 }; });

      const limit = Math.min(p.currentStep + 1, p.episodeData.trajectory.length);
      for (let s = 0; s < limit; s++) {
        const step = p.episodeData.trajectory[s];
        if (!step?.actions) continue;
        for (const a of aids) {
          const pc = step.actions[a]?.price_changes;
          if (!pc) continue;
          for (const delta of Object.values(pc)) {
            if (delta < 0) counts[a].dec++;
            else if (delta > 0) counts[a].inc++;
            else counts[a].hold++;
          }
        }
      }

      return {
        labels: aids.map(a => `Agent ${a}`),
        datasets: [
          { label: 'Decrease (-1)', data: aids.map(a => counts[a].dec), backgroundColor: '#e15759', borderRadius: 4 },
          { label: 'Hold (0)', data: aids.map(a => counts[a].hold), backgroundColor: '#76b7b2', borderRadius: 4 },
          { label: 'Increase (+1)', data: aids.map(a => counts[a].inc), backgroundColor: '#59a14f', borderRadius: 4 },
        ],
      };
    },
    buildOptions: (p) => {
      const opts = barOptions(p, 'Agent', 'Count');
      opts.plugins!.legend = { display: true, labels: { color: 'rgba(255,255,255,0.5)', boxWidth: 12, padding: 12 } };
      return opts;
    },
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.flatMap(a => [`agent_${a}_dec`, `agent_${a}_hold`, `agent_${a}_inc`])],
        rows: p.episodeData.trajectory.map((step, s) => {
          const row: (string | number)[] = [s];
          for (const a of aids) {
            const pc = step.actions?.[a]?.price_changes ?? {};
            let dec = 0, hold = 0, inc = 0;
            for (const d of Object.values(pc)) { if (d < 0) dec++; else if (d > 0) inc++; else hold++; }
            row.push(dec, hold, inc);
          }
          return row;
        }),
      };
    },
  },

  {
    id: 'agent-profile-radar',
    category: 'agents',
    title: 'Agent Profile',
    chartType: 'radar',
    syncMode: 'atStep',
    csvFilename: 'agent_profile.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const entry = p.timeline[p.currentStep];
      if (!entry) return { labels: [], datasets: [] };

      const metrics = ['Trips', 'Dest Revenue', 'Tax Revenue', 'Tax Paid', 'Reward'];
      const raw = aids.map(a => {
        const ag = entry.agents[a];
        return [ag?.trips_completed ?? 0, ag?.dest_revenue ?? 0, ag?.tax_revenue ?? 0, ag?.tax_paid ?? 0, ag?.cumulative_reward ?? 0];
      });

      // Normalize per metric
      const maxes = metrics.map((_, mi) => Math.max(1, ...raw.map(r => Math.abs(r[mi]))));
      return {
        labels: metrics,
        datasets: aids.map((a, ai) => ({
          label: `Agent ${a}`,
          data: raw[ai].map((v, mi) => v / maxes[mi]),
          borderColor: agentColor(a, p),
          backgroundColor: agentColor(a, p) + '30',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: agentColor(a, p),
        })),
      };
    },
    buildOptions: () => radarOptions(),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.flatMap(a => [`agent_${a}_trips`, `agent_${a}_dest_rev`, `agent_${a}_tax_rev`, `agent_${a}_tax_paid`, `agent_${a}_reward`])],
        rows: p.timeline.map(t => {
          const row: (string | number)[] = [t.timestep];
          for (const a of aids) {
            const ag = t.agents[a];
            row.push(ag?.trips_completed ?? 0, ag?.dest_revenue ?? 0, ag?.tax_revenue ?? 0, ag?.tax_paid ?? 0, ag?.cumulative_reward ?? 0);
          }
          return row;
        }),
      };
    },
  },

  // ━━━━ NODES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'node-prices-over-time',
    category: 'nodes',
    title: 'Node Prices Over Time',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'node_prices.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: nodeIds(p).map(n => ({
        label: `Node ${n}`,
        data: p.timeline.map(t => t.nodes[n]?.current_price ?? 0),
        borderColor: nodeColor(n, p),
        backgroundColor: nodeColor(n, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Price'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_price`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.current_price ?? 0)]),
      };
    },
  },

  {
    id: 'node-prices-at-step',
    category: 'nodes',
    title: 'Node Prices Snapshot',
    chartType: 'bar',
    syncMode: 'atStep',
    csvFilename: 'node_prices.csv',
    buildData: (p) => {
      const nids = nodeIds(p);
      const entry = p.timeline[p.currentStep];
      return {
        labels: nids.map(n => `Node ${n}`),
        datasets: [{
          data: nids.map(n => entry?.nodes[n]?.current_price ?? 0),
          backgroundColor: nids.map(n => nodeColor(n, p)),
          borderWidth: 0,
          borderRadius: 4,
        }],
      };
    },
    buildOptions: (p) => barOptions(p, 'Node', 'Price'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_price`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.current_price ?? 0)]),
      };
    },
  },

  {
    id: 'node-revenue-over-time',
    category: 'nodes',
    title: 'Node Revenue',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'node_revenue.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: nodeIds(p).map(n => ({
        label: `Node ${n}`,
        data: p.timeline.map(t => t.nodes[n]?.revenue_collected ?? 0),
        borderColor: nodeColor(n, p),
        backgroundColor: nodeColor(n, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Revenue'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_revenue`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.revenue_collected ?? 0)]),
      };
    },
  },

  {
    id: 'node-visits-bar',
    category: 'nodes',
    title: 'Node Traffic',
    chartType: 'bar',
    syncMode: 'atStep',
    csvFilename: 'node_visits.csv',
    buildData: (p) => {
      const nids = nodeIds(p);
      const entry = p.timeline[p.currentStep];
      return {
        labels: nids.map(n => `Node ${n}`),
        datasets: [{
          data: nids.map(n => entry?.nodes[n]?.total_visits ?? 0),
          backgroundColor: nids.map(n => nodeColor(n, p)),
          borderWidth: 0,
          borderRadius: 4,
        }],
      };
    },
    buildOptions: (p) => barOptions(p, 'Node', 'Visits'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_visits`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.total_visits ?? 0)]),
      };
    },
  },

  {
    id: 'node-cumulative-visits',
    category: 'nodes',
    title: 'Cumulative Visits',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'node_visits.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: nodeIds(p).map(n => ({
        label: `Node ${n}`,
        data: p.timeline.map(t => t.nodes[n]?.total_visits ?? 0),
        borderColor: nodeColor(n, p),
        backgroundColor: nodeColor(n, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Visits'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_visits`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.total_visits ?? 0)]),
      };
    },
  },

  {
    id: 'node-avg-visits',
    category: 'nodes',
    title: 'Avg Visits/Step',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'node_visits.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: nodeIds(p).map(n => ({
        label: `Node ${n}`,
        data: p.timeline.map(t => t.nodes[n]?.avg_visits_per_step ?? 0),
        borderColor: nodeColor(n, p),
        backgroundColor: nodeColor(n, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Avg Visits'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_avg_visits`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.avg_visits_per_step ?? 0)]),
      };
    },
  },

  // ━━━━ ECONOMY / TAXES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'econ-tax-revenue',
    category: 'economy',
    title: 'Tax Revenue Earned',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'agent_tax.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: agentIds(p).map(a => ({
        label: `Agent ${a}`,
        data: p.timeline.map(t => t.agents[a]?.tax_revenue ?? 0),
        borderColor: agentColor(a, p),
        backgroundColor: agentColor(a, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Tax Revenue'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_tax_revenue`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.tax_revenue ?? 0)]),
      };
    },
  },

  {
    id: 'econ-tax-paid',
    category: 'economy',
    title: 'Tax Paid',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'agent_tax.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: agentIds(p).map(a => ({
        label: `Agent ${a}`,
        data: p.timeline.map(t => t.agents[a]?.tax_paid ?? 0),
        borderColor: agentColor(a, p),
        backgroundColor: agentColor(a, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Tax Paid'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_tax_paid`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.tax_paid ?? 0)]),
      };
    },
  },

  {
    id: 'econ-tax-per-node',
    category: 'economy',
    title: 'Tax Collected by Node',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'node_revenue.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: nodeIds(p).map(n => ({
        label: `Node ${n}`,
        data: p.timeline.map(t => t.nodes[n]?.revenue_collected ?? 0),
        borderColor: nodeColor(n, p),
        backgroundColor: nodeColor(n, p),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      })),
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Revenue'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.map(n => `node_${n}_revenue`)],
        rows: p.timeline.map(t => [t.timestep, ...nids.map(n => t.nodes[n]?.revenue_collected ?? 0)]),
      };
    },
  },

  {
    id: 'econ-revenue-pie',
    category: 'economy',
    title: 'Revenue Distribution',
    chartType: 'doughnut',
    syncMode: 'atStep',
    csvFilename: 'system_revenue.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const entry = p.timeline[p.currentStep];
      return {
        labels: aids.map(a => `Agent ${a}`),
        datasets: [{
          data: aids.map(a => entry?.system?.revenue_distribution?.[a] ?? 0),
          backgroundColor: aids.map(a => agentColor(a, p)),
          borderWidth: 0,
        }],
      };
    },
    buildOptions: () => doughnutOptions(),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_revenue_share`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.system?.revenue_distribution?.[a] ?? 0)]),
      };
    },
  },

  {
    id: 'econ-price-occupancy',
    category: 'economy',
    title: 'Price vs Traffic',
    chartType: 'scatter',
    syncMode: 'atStep',
    csvFilename: 'node_prices.csv',
    buildData: (p) => {
      const nids = nodeIds(p);
      const entry = p.timeline[p.currentStep];
      if (!entry) return { datasets: [] };
      return {
        datasets: nids.map(n => ({
          label: `Node ${n}`,
          data: [{ x: entry.nodes[n]?.current_price ?? 0, y: entry.nodes[n]?.total_visits ?? 0 }],
          backgroundColor: nodeColor(n, p),
          pointRadius: 8,
          pointHoverRadius: 12,
        })),
      };
    },
    buildOptions: (p) => scatterOptions(p, 'Price', 'Visits'),
    buildCsv: (p) => {
      const nids = nodeIds(p);
      return {
        headers: ['step', ...nids.flatMap(n => [`node_${n}_price`, `node_${n}_visits`])],
        rows: p.timeline.map(t => {
          const row: (string | number)[] = [t.timestep];
          for (const n of nids) { row.push(t.nodes[n]?.current_price ?? 0, t.nodes[n]?.total_visits ?? 0); }
          return row;
        }),
      };
    },
  },

  // ━━━━ SYSTEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'sys-total-reward',
    category: 'system',
    title: 'Total System Reward',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'system_metrics.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: [{
        label: 'System Reward',
        data: p.timeline.map(t => t.system.total_system_reward),
        borderColor: '#1de99b',
        backgroundColor: '#1de99b',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: { target: 'origin', above: 'rgba(29,233,155,0.08)' },
      }],
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Reward'),
    buildCsv: (p) => ({
      headers: ['step', 'total_system_reward', 'avg_node_price'],
      rows: p.timeline.map(t => [t.timestep, t.system.total_system_reward, t.system.avg_node_price]),
    }),
  },

  {
    id: 'sys-avg-price',
    category: 'system',
    title: 'Average Network Price',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'system_metrics.csv',
    buildData: (p) => ({
      labels: steps(p),
      datasets: [{
        label: 'Avg Price',
        data: p.timeline.map(t => t.system.avg_node_price),
        borderColor: '#f5c518',
        backgroundColor: '#f5c518',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: { target: 'origin', above: 'rgba(245,197,24,0.08)' },
      }],
    }),
    buildOptions: (p) => lineOptions(p, 'Step', 'Price'),
    buildCsv: (p) => ({
      headers: ['step', 'total_system_reward', 'avg_node_price'],
      rows: p.timeline.map(t => [t.timestep, t.system.total_system_reward, t.system.avg_node_price]),
    }),
  },

  {
    id: 'sys-competition-index',
    category: 'system',
    title: 'Competition Index',
    chartType: 'line',
    syncMode: 'verticalLine',
    csvFilename: 'system_metrics.csv',
    buildData: (p) => {
      const data = p.timeline.map(t => {
        const rewards = Object.values(t.agents).map(a => a.cumulative_reward);
        if (rewards.length < 2) return 0;
        const mean = rewards.reduce((s, v) => s + v, 0) / rewards.length;
        if (Math.abs(mean) < 0.01) return 0;
        const variance = rewards.reduce((s, v) => s + (v - mean) ** 2, 0) / rewards.length;
        return Math.sqrt(variance) / Math.abs(mean); // coefficient of variation
      });
      return {
        labels: steps(p),
        datasets: [{
          label: 'Competition Index (CV)',
          data,
          borderColor: '#ff6b6b',
          backgroundColor: '#ff6b6b',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: { target: 'origin', above: 'rgba(255,107,107,0.08)' },
        }],
      };
    },
    buildOptions: (p) => lineOptions(p, 'Step', 'CV (higher = more unequal)'),
    buildCsv: (p) => ({
      headers: ['step', 'competition_index'],
      rows: p.timeline.map(t => {
        const rewards = Object.values(t.agents).map(a => a.cumulative_reward);
        const mean = rewards.reduce((s, v) => s + v, 0) / (rewards.length || 1);
        const variance = rewards.reduce((s, v) => s + (v - mean) ** 2, 0) / (rewards.length || 1);
        return [t.timestep, Math.abs(mean) < 0.01 ? 0 : Math.sqrt(variance) / Math.abs(mean)];
      }),
    }),
  },

  {
    id: 'sys-trip-distribution',
    category: 'system',
    title: 'Trip Distribution',
    chartType: 'doughnut',
    syncMode: 'atStep',
    csvFilename: 'agent_trips.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const entry = p.timeline[p.currentStep];
      return {
        labels: aids.map(a => `Agent ${a}`),
        datasets: [{
          data: aids.map(a => entry?.agents[a]?.trips_completed ?? 0),
          backgroundColor: aids.map(a => agentColor(a, p)),
          borderWidth: 0,
        }],
      };
    },
    buildOptions: () => doughnutOptions(),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_trips`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.trips_completed ?? 0)]),
      };
    },
  },

  {
    id: 'sys-reward-vs-trips',
    category: 'system',
    title: 'Reward vs Trips',
    chartType: 'scatter',
    syncMode: 'atStep',
    csvFilename: 'agent_rewards.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const entry = p.timeline[p.currentStep];
      if (!entry) return { datasets: [] };
      return {
        datasets: aids.map(a => ({
          label: `Agent ${a}`,
          data: [{ x: entry.agents[a]?.trips_completed ?? 0, y: entry.agents[a]?.cumulative_reward ?? 0 }],
          backgroundColor: agentColor(a, p),
          pointRadius: 10,
          pointHoverRadius: 14,
        })),
      };
    },
    buildOptions: (p) => scatterOptions(p, 'Trips', 'Reward'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.flatMap(a => [`agent_${a}_trips`, `agent_${a}_reward`])],
        rows: p.timeline.map(t => {
          const row: (string | number)[] = [t.timestep];
          for (const a of aids) { row.push(t.agents[a]?.trips_completed ?? 0, t.agents[a]?.cumulative_reward ?? 0); }
          return row;
        }),
      };
    },
  },

  {
    id: 'sys-trips-by-agent',
    category: 'system',
    title: 'Total Trips by Agent',
    chartType: 'bar',
    syncMode: 'atStep',
    csvFilename: 'agent_trips.csv',
    buildData: (p) => {
      const aids = agentIds(p);
      const entry = p.timeline[p.currentStep];
      return {
        labels: aids.map(a => `Agent ${a}`),
        datasets: [{
          data: aids.map(a => entry?.agents[a]?.trips_completed ?? 0),
          backgroundColor: aids.map(a => agentColor(a, p)),
          borderWidth: 0,
          borderRadius: 4,
        }],
      };
    },
    buildOptions: (p) => barOptions(p, 'Agent', 'Trips'),
    buildCsv: (p) => {
      const aids = agentIds(p);
      return {
        headers: ['step', ...aids.map(a => `agent_${a}_trips`)],
        rows: p.timeline.map(t => [t.timestep, ...aids.map(a => t.agents[a]?.trips_completed ?? 0)]),
      };
    },
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────────

export const CHART_MAP = new Map(CHARTS.map(c => [c.id, c]));

export function chartsByCategory(cat: ChartCategory): ChartDef[] {
  return CHARTS.filter(c => c.category === cat);
}

export const CATEGORIES: { id: ChartCategory; label: string }[] = [
  { id: 'agents', label: 'Agent Metrics' },
  { id: 'nodes', label: 'Node Metrics' },
  { id: 'economy', label: 'Economy / Taxes' },
  { id: 'system', label: 'System Metrics' },
];
