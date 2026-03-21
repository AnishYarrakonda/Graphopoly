/**
 * Transforms the backend's raw simulation metrics (step_history format)
 * into the EpisodeJSON format that replayStore and the analysis system expect.
 *
 * Backend sends:
 *   - step_history: [{ step, positions: number[], prices, actions: array[], rewards: number[], taxes, dest_completions }]
 *   - graph_data: { num_nodes, edges, ownership, destinations, starting_positions }
 *   - agent_details: [{ agent_id, position, cumulative_reward, ... }]
 *   - env_snapshot, config_snapshot, layout, episode_rewards, episode_trips
 *
 * Frontend expects EpisodeJSON:
 *   - trajectory: [{ step, agent_positions: Record, prices, actions: Record, rewards: Record, taxes, dest_completions, node_stats, agent_stats }]
 *   - graph: { nodes, edges, ownership, destinations, starting_positions }
 *   - metadata: { num_steps, num_agents, num_nodes, ... }
 */

import type { GraphData } from '../types/graph';
import type { StepHistoryEntry } from '../types/websocket';
import type { EpisodeJSON, TrajectoryStep } from '../types/episode';

interface RawMetrics {
  step_history?: StepHistoryEntry[];
  graph_data?: GraphData;
  graph_embedded?: GraphData;
  agent_details?: unknown[];
  env_snapshot?: { agents: { position: number }[] };
  config_snapshot?: any; // Config is complex, keeping for now or use FullConfig
  layout?: Record<string, [number, number]>;
  episode_rewards?: number[];
  episode_trips?: number[];
  episode?: number;
  total_episodes?: number;
  losses?: Record<string, unknown>;
  // Already in EpisodeJSON format (from proper episode saves)
  trajectory?: TrajectoryStep[];
  graph?: GraphData;
  metadata?: Record<string, unknown>;
}

export function adaptToEpisodeJSON(raw: RawMetrics): EpisodeJSON {
  // If already in EpisodeJSON format, return as-is
  if (raw.trajectory && raw.graph && raw.metadata) {
    return raw as unknown as EpisodeJSON;
  }

  const graphData: Partial<GraphData> = raw.graph_data || raw.graph_embedded || {};
  const numNodes = graphData.num_nodes ?? 0;
  const numAgents = raw.agent_details?.length ?? raw.env_snapshot?.agents?.length ?? 0;
  const stepHistory = raw.step_history ?? [];
  const layout = raw.layout ?? {};

  // Build graph section
  const nodes = Array.from({ length: numNodes }, (_, i) => ({
    id: i,
    owner: graphData.ownership?.[String(i)] ?? -1,
    position: (layout[String(i)] ?? layout[i] ?? [0, 0]) as [number, number],
  }));

  // Build trajectory by transforming step_history entries
  // We need to accumulate agent stats across steps
  const agentCumReward: number[] = new Array(numAgents).fill(0);
  const agentTrips: number[] = new Array(numAgents).fill(0);
  const agentTaxRevenue: number[] = new Array(numAgents).fill(0);
  const agentTaxPaid: number[] = new Array(numAgents).fill(0);
  const agentDestRevenue: number[] = new Array(numAgents).fill(0);
  const nodeVisits: number[] = new Array(numNodes).fill(0);
  const nodeRevenue: number[] = new Array(numNodes).fill(0);

  const tripReward = raw.config_snapshot?.agent?.trip_reward ?? 10;

  const trajectory: TrajectoryStep[] = stepHistory.map((sh: StepHistoryEntry, _idx: number) => {
    const positions = sh.positions ?? [];
    const rewards = sh.rewards ?? [];
    const actions = sh.actions ?? [];
    const taxes = sh.taxes ?? {};
    const destCompletions = sh.dest_completions ?? [];

    // Convert positions array → agent_positions record
    const agent_positions: Record<string, number> = {};
    for (let a = 0; a < positions.length; a++) {
      agent_positions[String(a)] = positions[a];
    }

    // Convert rewards array → rewards record
    const rewardsRecord: Record<string, number> = {};
    for (let a = 0; a < rewards.length; a++) {
      rewardsRecord[String(a)] = rewards[a];
      agentCumReward[a] += rewards[a];
    }

    // Convert actions array → actions record
    const actionsRecord: Record<string, { move: number; price_changes: Record<string, number> }> = {};
    for (let a = 0; a < actions.length; a++) {
      actionsRecord[String(a)] = {
        move: actions[a]?.move ?? 0,
        price_changes: actions[a]?.price_changes ?? {},
      };
    }

    // Track visits — each agent at a position visits that node
    for (let a = 0; a < positions.length; a++) {
      const nodeId = positions[a];
      if (nodeId >= 0 && nodeId < numNodes) {
        nodeVisits[nodeId]++;
      }
    }

    // Track tax flows
    for (const [payerStr, recvMap] of Object.entries(taxes)) {
      const payer = parseInt(payerStr);
      if (!isNaN(payer) && payer < numAgents) {
        for (const [recvStr, amt] of Object.entries(recvMap as Record<string, number>)) {
          const recv = parseInt(recvStr);
          agentTaxPaid[payer] += amt;
          if (!isNaN(recv) && recv < numAgents) {
            agentTaxRevenue[recv] += amt;
          }
        }
      }
    }

    // Track node revenue from taxes
    for (let a = 0; a < positions.length; a++) {
      const nodeId = positions[a];
      if (nodeId >= 0 && nodeId < numNodes) {
        const owner = graphData.ownership?.[String(nodeId)];
        if (owner !== undefined && owner !== a) {
          const price = sh.prices?.[String(nodeId)] ?? 0;
          nodeRevenue[nodeId] += price;
        }
      }
    }

    // Track dest completions
    for (const dc of destCompletions) {
      const aid = dc.agent;
      if (aid >= 0 && aid < numAgents) {
        agentTrips[aid]++;
        agentDestRevenue[aid] += tripReward;
      }
    }

    // Build node_stats
    const node_stats: Record<string, { visits: number; revenue_collected: number }> = {};
    for (let n = 0; n < numNodes; n++) {
      node_stats[String(n)] = {
        visits: nodeVisits[n],
        revenue_collected: nodeRevenue[n],
      };
    }

    // Build agent_stats
    const agent_stats: Record<string, {
      trips_completed: number;
      total_profit: number;
      tax_revenue: number;
      tax_paid: number;
      dest_revenue: number;
    }> = {};
    for (let a = 0; a < numAgents; a++) {
      agent_stats[String(a)] = {
        trips_completed: agentTrips[a],
        total_profit: agentCumReward[a],
        tax_revenue: agentTaxRevenue[a],
        tax_paid: agentTaxPaid[a],
        dest_revenue: agentDestRevenue[a],
      };
    }

    return {
      step: sh.step ?? _idx,
      agent_positions,
      actions: actionsRecord,
      prices: sh.prices ?? {},
      rewards: rewardsRecord,
      taxes,
      dest_completions: destCompletions,
      node_stats,
      agent_stats,
    };
  });

  // Build metadata
  const metadata = {
    episode_id: `sim_${Date.now()}`,
    timestamp: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    num_steps: trajectory.length,
    num_episodes: 1,
    num_agents: numAgents,
    num_nodes: numNodes,
    description: 'Simulation run',
  };

  // Build initial_state from first step
  const firstStep = stepHistory[0];
  const initialPositions: Record<string, number> = {};
  for (let a = 0; a < (firstStep?.positions?.length ?? 0); a++) {
    initialPositions[String(a)] = firstStep.positions[a];
  }

  return {
    metadata,
    graph: {
      nodes,
      edges: graphData.edges ?? [],
      ownership: graphData.ownership ?? {},
      destinations: graphData.destinations ?? {},
      starting_positions: graphData.starting_positions ?? initialPositions,
    },
    config: raw.config_snapshot ?? {},
    initial_state: {
      agent_positions: initialPositions,
      agent_destinations: graphData.destinations ?? {},
      agent_owned_nodes: {},
      prices: firstStep?.prices ?? {},
      agent_stats: {},
    },
    trajectory,
    training_metrics: {
      episode_rewards: [],
      episode_trips: [],
      losses: { policy_loss: [], value_loss: [], entropy_bonus: [] },
      num_episodes_trained: 0,
    },
    aggregate_stats: { agents: {}, nodes: {}, system: {} },
  };
}
