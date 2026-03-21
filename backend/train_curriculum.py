"""
Curriculum training for Graphopoly GNN models.

Creates a pool of random graphs of a given size with VARIABLE agent counts
(1-10), trains on each sequentially, and repeats for multiple passes.
Records per-episode metrics to training_data/size_{N}/metrics.jsonl.

Usage:
    python3 -m backend.train_curriculum --nodes 2 --graphs 200 --passes 10
    python3 -m backend.train_curriculum --nodes 4 --graphs 100 --passes 5 --lr 1e-3
"""

from __future__ import annotations

import argparse
import json
import math
import time
from collections import deque
from dataclasses import asdict
from pathlib import Path

import networkx as nx
import numpy as np
import torch

from backend.config import GraphopolyConfig
from backend.core.graph_world import GraphWorld
from backend.core.env import GraphopolyEnv
from backend.agent.gnn_network import GraphopolyGNN
from backend.agent.ppo import PPOTrainer

MODELS_DIR = Path(__file__).parent.parent / "models"
TRAINING_DATA_DIR = Path(__file__).parent.parent / "training_data"


def _fmt_time(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}m"
    else:
        return f"{seconds / 3600:.1f}h"


# ── Diverse graph pool builder ──────────────────────────────────────────


def _topology_edges(
    topology: str,
    n: int,
    rng: np.random.Generator,
) -> list[tuple[int, int]] | None:
    """Return an edge list for a named topology on n nodes, or None if inapplicable."""
    max_e = n * (n - 1) // 2

    if topology == "path":
        return [(i, i + 1) for i in range(n - 1)]

    if topology == "ring":
        if n < 3:
            return None
        return [(i, (i + 1) % n) for i in range(n)]

    if topology == "star":
        return [(0, i) for i in range(1, n)]

    if topology == "double_star":
        if n < 4:
            return None
        mid = max(2, n // 2)
        edges = [(0, 1)]
        for i in range(2, mid):
            edges.append((0, i))
        for i in range(mid, n):
            edges.append((1, i))
        return edges

    if topology == "clustered":
        # Two dense clusters connected by a single bridge
        if n < 5:
            return None
        h = n // 2
        edges: list[tuple[int, int]] = []
        for i in range(h):
            for j in range(i + 1, h):
                edges.append((i, j))
        for i in range(h, n):
            for j in range(i + 1, n):
                edges.append((i, j))
        edges.append((h - 1, h))
        return edges

    if topology == "grid":
        if n < 4:
            return None
        cols = max(2, int(round(math.sqrt(n))))
        edges_set: set[tuple[int, int]] = set()
        for i in range(n):
            _, c = divmod(i, cols)
            if c + 1 < cols and i + 1 < n:
                edges_set.add((i, i + 1))
            if i + cols < n:
                edges_set.add((i, i + cols))
        for i in range(n - 1):  # guarantee connectivity
            edges_set.add((i, i + 1))
        return list(edges_set)

    if topology == "dense":
        # 65-90% of maximum possible edges
        target = max(n - 1, int(rng.uniform(0.65, 0.90) * max_e))
        perm = rng.permutation(n).tolist()
        edges_set = {
            (min(perm[i], perm[i + 1]), max(perm[i], perm[i + 1]))
            for i in range(n - 1)
        }
        all_missing = [
            (i, j) for i in range(n) for j in range(i + 1, n)
            if (i, j) not in edges_set
        ]
        idxs = rng.permutation(len(all_missing)).tolist()
        for k in idxs[: max(0, target - len(edges_set))]:
            edges_set.add(all_missing[k])
        return list(edges_set)

    if topology == "hub_spoke":
        # 2-4 hub nodes fully connected to each other, leaves distributed evenly
        if n < 4:
            return None
        num_hubs = min(4, max(2, n // 4))
        edges = []
        for i in range(num_hubs):
            for j in range(i + 1, num_hubs):
                edges.append((i, j))
        for k, leaf in enumerate(range(num_hubs, n)):
            edges.append((k % num_hubs, leaf))
        return edges

    return None


def build_diverse_graphs(
    num_nodes: int,
    num_graphs: int,
    min_agents: int = 1,
    max_agents: int = 10,
    rng: np.random.Generator | None = None,
) -> list[tuple[GraphWorld, int, int]]:
    """Build a structurally diverse pool of GraphWorld instances.

    Topology mix: ~60% structured (path, ring, star, double_star, clustered,
    grid, dense, hub_spoke) + ~40% random at varying edge densities.

    For small N where a topology degenerates, falls back to random.
    """
    if rng is None:
        rng = np.random.default_rng()

    STRUCTURED = ["path", "ring", "star", "double_star", "clustered",
                  "grid", "dense", "hub_spoke"]
    RANDOM_FRAC = 0.40

    n_random = max(1, int(round(num_graphs * RANDOM_FRAC)))
    n_structured = num_graphs - n_random
    per_topo = n_structured // len(STRUCTURED)
    extras = n_structured % len(STRUCTURED)

    plan: list[str] = []
    for i, t in enumerate(STRUCTURED):
        plan.extend([t] * (per_topo + (1 if i < extras else 0)))
    plan.extend(["random"] * n_random)
    rng.shuffle(plan)

    max_e = num_nodes * (num_nodes - 1) // 2
    max_a = min(max_agents, num_nodes)
    num_destinations = min(2, num_nodes)

    def _try_make(topology: str, graph_rng: np.random.Generator) -> GraphWorld | None:
        if topology == "random":
            num_e = int(graph_rng.integers(num_nodes - 1, max_e + 1))
            return GraphWorld.random_connected(num_nodes, num_e, graph_rng)
        edges = _topology_edges(topology, num_nodes, graph_rng)
        if edges is None:
            return GraphWorld.random_connected(num_nodes, None, graph_rng)
        world = GraphWorld.from_custom(edges, num_nodes)
        if not nx.is_connected(world.graph):
            return GraphWorld.random_connected(num_nodes, None, graph_rng)
        return world

    graphs: list[tuple[GraphWorld, int, int]] = []
    for topology in plan:
        num_agents = int(rng.integers(min_agents, max_a + 1))
        graph_rng = np.random.default_rng(int(rng.integers(0, 2 ** 31)))
        try:
            world = _try_make(topology, graph_rng) or GraphWorld.random_connected(
                num_nodes, None, graph_rng
            )
            world.assign_territories(num_agents, graph_rng)
            world.assign_destinations(num_agents, num_destinations, graph_rng)
            world.assign_starting_positions(num_agents, graph_rng)
            world.validate(num_agents, min_destinations=num_destinations,
                           trip_reward=10.0, max_price=20)
            graphs.append((world, num_agents, num_destinations))
        except Exception:
            try:
                world = GraphWorld.random_connected(num_nodes, None, graph_rng)
                world.assign_territories(num_agents, graph_rng)
                world.assign_destinations(num_agents, num_destinations, graph_rng)
                world.assign_starting_positions(num_agents, graph_rng)
                world.validate(num_agents, min_destinations=num_destinations,
                               trip_reward=10.0, max_price=20)
                graphs.append((world, num_agents, num_destinations))
            except Exception:
                continue

    if not graphs:
        raise RuntimeError(f"Could not build any valid {num_nodes}-node diverse graphs")
    return graphs


# ── Random graph pool builder (legacy) ──────────────────────────────────

def build_curriculum_graphs(
    num_nodes: int,
    num_graphs: int,
    min_agents: int = 1,
    max_agents: int = 10,
    rng: np.random.Generator | None = None,
) -> list[tuple[GraphWorld, int, int]]:
    """Build a pool of random graphs with variable agent counts.

    Returns list of (world, num_agents, num_destinations) tuples.
    """
    if rng is None:
        rng = np.random.default_rng()

    max_possible_edges = num_nodes * (num_nodes - 1) // 2
    min_edges = num_nodes - 1
    max_dests = num_nodes  # can't have more destinations than nodes

    graphs: list[tuple[GraphWorld, int, int]] = []
    attempts = 0

    while len(graphs) < num_graphs and attempts < num_graphs * 10:
        attempts += 1
        num_agents = int(rng.integers(min_agents, max_agents + 1))
        num_destinations = min(2, max_dests)  # 2 destinations or max available
        num_edges = int(rng.integers(min_edges, max_possible_edges + 1))

        graph_rng = np.random.default_rng(int(rng.integers(0, 2**31)))

        try:
            world = GraphWorld.random_connected(num_nodes, num_edges, graph_rng)
            world.assign_territories(num_agents, graph_rng)
            world.assign_destinations(num_agents, num_destinations, graph_rng)
            world.assign_starting_positions(num_agents, graph_rng)
            world.validate(
                num_agents,
                min_destinations=num_destinations,
                trip_reward=10.0,
                max_price=20,
            )
            graphs.append((world, num_agents, num_destinations))
        except ValueError:
            continue

    if not graphs:
        raise RuntimeError(f"Could not build any valid {num_nodes}-node graphs")

    return graphs


# ── Main curriculum training ────────────────────────────────────────────

def train_curriculum(
    num_nodes: int = 2,
    num_graphs: int = 200,
    num_passes: int = 10,
    lr: float = 3e-4,
    print_every: int = 5,
    save_every: int = 200,
) -> Path:
    """Train a GNN on a diverse pool of graphs with variable agent counts.

    Args:
        num_nodes:   Graph size (all graphs in pool have this many nodes).
        num_graphs:  Number of random graphs in the pool.
        num_passes:  Number of complete passes through the pool.
        lr:          Adam learning rate.
        print_every: Print metrics every N episodes.
        save_every:  Checkpoint model every N episodes.

    Returns:
        Path to the saved model file.
    """
    config = GraphopolyConfig()
    config.train.lr = lr
    device = torch.device("cpu")

    total_episodes = num_graphs * num_passes

    # ── Header ────────────────────────────────────────────────────────────
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║        GRAPHOPOLY — CURRICULUM GNN TRAINING                ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()
    print(f"  Graph size:    {num_nodes} nodes")
    print(f"  Pool size:     {num_graphs} graphs (agents 1-10, variable edges)")
    print(f"  Passes:        {num_passes}")
    print(f"  Total episodes:{total_episodes:,}")
    print(f"  Steps/episode: {config.train.steps_per_episode}")
    print(f"  Learning rate: {lr}")
    print(f"  Device:        {device}")
    print()

    # ── Build graph pool ──────────────────────────────────────────────────
    print("Building graph pool...")
    rng = np.random.default_rng()
    graphs = build_curriculum_graphs(num_nodes, num_graphs, rng=rng)
    print(f"  {len(graphs)} valid graphs ready")

    # Report agent count distribution
    agent_counts = [g[1] for g in graphs]
    from collections import Counter
    ac = Counter(agent_counts)
    print(f"  Agent distribution: {dict(sorted(ac.items()))}")
    print()

    # ── Shared network + optimizer ────────────────────────────────────────
    network = GraphopolyGNN(config=config.network).to(device)
    optimizer = torch.optim.Adam(network.parameters(), lr=lr)

    param_count = sum(p.numel() for p in network.parameters())
    print(f"  Network:       {param_count:,} parameters")
    print(f"  Architecture:  {config.network.max_gnn_layers}× GATv2 (dynamic depth) "
          f"(H={config.network.hidden_dim}, heads={config.network.gat_heads})")
    print()

    # ── Entropy annealing ─────────────────────────────────────────────────
    base_entropy = config.train.entropy_coef
    final_entropy = config.train.entropy_coef_final
    anneal_eps = max(1, int(total_episodes * config.train.entropy_anneal_frac))

    # ── Metrics output ────────────────────────────────────────────────────
    out_dir = TRAINING_DATA_DIR / f"size_{num_nodes}"
    out_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = out_dir / "metrics.jsonl"
    print(f"  Metrics file:  {metrics_path}")
    print()

    # ── Rolling windows ───────────────────────────────────────────────────
    WINDOW = min(100, total_episodes)
    reward_window: deque[float] = deque(maxlen=WINDOW)
    trip_window: deque[float] = deque(maxlen=WINDOW)
    policy_loss_window: deque[float] = deque(maxlen=WINDOW)
    value_loss_window: deque[float] = deque(maxlen=WINDOW)
    entropy_window: deque[float] = deque(maxlen=WINDOW)
    tax_paid_window: deque[float] = deque(maxlen=WINDOW)
    best_trips_window: deque[int] = deque(maxlen=WINDOW)
    trips_per_step_window: deque[float] = deque(maxlen=WINDOW)
    dest_rev_window: deque[float] = deque(maxlen=WINDOW)
    tax_rev_window: deque[float] = deque(maxlen=WINDOW)

    # Plateau detection
    plateau_window: deque[float] = deque(maxlen=50)
    plateau_bumps = 0

    best_avg_reward = float("-inf")
    best_avg_trips = 0.0
    prev_smooth_r: float | None = None

    t0 = time.time()
    ep_global = 0

    # ── Column header ─────────────────────────────────────────────────────
    print("─" * 120)
    print(f"{'Episode':>8}  {'Pass':>5}  {'Agents':>6}  {'AvgReward':>10}  {'Δ':>7}  {'AvgTrips':>8}  "
          f"{'PolicyL':>8}  {'ValueL':>8}  {'Entropy':>8}  "
          f"{'ep/s':>6}  {'ETA':>6}")
    print(f"{'':>8}  {'':>5}  {'':>6}  {'BestTrips':>10}  {'T/Step':>7}  {'DestRev':>8}  "
          f"{'TaxRev':>8}  {'TaxPaid':>8}")
    print("─" * 120)

    with open(metrics_path, "w") as metrics_file:
        for pass_num in range(1, num_passes + 1):
            # Shuffle graph order each pass
            order = rng.permutation(len(graphs))

            for gi in order:
                world, num_agents, num_destinations = graphs[gi]
                ep_global += 1

                # ── Entropy annealing ─────────────────────────────────────
                if ep_global <= anneal_eps:
                    ent_coef = base_entropy + (final_entropy - base_entropy) * (ep_global / anneal_eps)
                else:
                    ent_coef = final_entropy
                # Allow plateau bumps to override
                config.train.entropy_coef = max(ent_coef, config.train.entropy_coef) if plateau_bumps > 0 else ent_coef
                if plateau_bumps > 0:
                    plateau_bumps -= 1
                    if plateau_bumps == 0:
                        config.train.entropy_coef = ent_coef  # revert

                # Update config for this graph's agent count
                config.agent.num_agents = num_agents
                config.agent.num_destinations = num_destinations

                env = GraphopolyEnv(config, world)
                edge_index = env.get_edge_index().to(device)

                trainers = {
                    aid: PPOTrainer(network, optimizer, config.train, edge_index)
                    for aid in range(num_agents)
                }

                # ── Collect rollout ───────────────────────────────────────
                env.reset()
                actual_steps = 0

                for step in range(config.train.steps_per_episode):
                    shared = env._build_shared_node_data()
                    actions: list[dict] = []

                    for aid in range(num_agents):
                        node_feats = env.get_node_features(aid, shared).to(device)
                        current_pos = env.agents[aid].position
                        valid_nbrs = env.get_valid_neighbors(aid)
                        owned = env.get_owned_nodes(aid)
                        action, _lp, _val = trainers[aid].select_action(
                            node_feats, current_pos, valid_nbrs, owned
                        )
                        actions.append(action)

                    _obs, rewards, done, info = env.step(actions)
                    actual_steps += 1

                    for aid in range(num_agents):
                        trainers[aid].store_reward(rewards[aid], done)
                    if done:
                        break

                # ── PPO update ────────────────────────────────────────────
                shared_final = env._build_shared_node_data()
                ep_losses: list[dict[str, float]] = []
                for aid in range(num_agents):
                    node_feats = env.get_node_features(aid, shared_final).to(device)
                    current_pos = env.agents[aid].position
                    valid_nbrs = env.get_valid_neighbors(aid)
                    owned = env.get_owned_nodes(aid)
                    last_val = trainers[aid].get_value(node_feats, current_pos, valid_nbrs)
                    losses = trainers[aid].update(last_val, owned)
                    ep_losses.append(losses)

                # ── Metrics ───────────────────────────────────────────────
                ep_rewards = [a.cumulative_reward for a in env.agents]
                ep_trips = [a.trips_completed for a in env.agents]
                ep_tax_paid = [a.tax_paid for a in env.agents]
                ep_dest_rev = [a.dest_revenue for a in env.agents]
                ep_tax_rev = [a.tax_revenue for a in env.agents]
                avg_r = sum(ep_rewards) / len(ep_rewards)
                avg_t = sum(ep_trips) / len(ep_trips)

                avg_pl = sum(l["policy_loss"] for l in ep_losses) / len(ep_losses)
                avg_vl = sum(l["value_loss"] for l in ep_losses) / len(ep_losses)
                avg_ent = sum(l["entropy"] for l in ep_losses) / len(ep_losses)

                # Write JSONL record
                record = {
                    "episode": ep_global,
                    "pass": pass_num,
                    "graph_idx": int(gi),
                    "num_agents": num_agents,
                    "avg_reward": round(avg_r, 3),
                    "max_reward": round(max(ep_rewards), 3),
                    "min_reward": round(min(ep_rewards), 3),
                    "best_trips": max(ep_trips),
                    "avg_trips": round(avg_t, 3),
                    "trips_per_step": round(sum(ep_trips) / max(actual_steps, 1), 4),
                    "avg_dest_rev": round(sum(ep_dest_rev) / len(ep_dest_rev), 3),
                    "avg_tax_rev": round(sum(ep_tax_rev) / len(ep_tax_rev), 3),
                    "avg_tax_paid": round(sum(ep_tax_paid) / len(ep_tax_paid), 3),
                    "policy_loss": round(avg_pl, 6),
                    "value_loss": round(avg_vl, 3),
                    "entropy": round(avg_ent, 4),
                    "entropy_coef": round(config.train.entropy_coef, 5),
                    "per_agent_rewards": [round(r, 2) for r in ep_rewards],
                    "per_agent_trips": ep_trips,
                }
                metrics_file.write(json.dumps(record) + "\n")
                metrics_file.flush()

                # Rolling windows
                reward_window.append(avg_r)
                trip_window.append(avg_t)
                policy_loss_window.append(avg_pl)
                value_loss_window.append(avg_vl)
                entropy_window.append(avg_ent)
                tax_paid_window.append(sum(ep_tax_paid) / len(ep_tax_paid))
                best_trips_window.append(max(ep_trips))
                trips_per_step_window.append(sum(ep_trips) / max(actual_steps, 1))
                dest_rev_window.append(sum(ep_dest_rev) / len(ep_dest_rev))
                tax_rev_window.append(sum(ep_tax_rev) / len(ep_tax_rev))

                smooth_r = sum(reward_window) / len(reward_window)
                smooth_t = sum(trip_window) / len(trip_window)
                if smooth_r > best_avg_reward:
                    best_avg_reward = smooth_r
                if smooth_t > best_avg_trips:
                    best_avg_trips = smooth_t

                # ── Plateau detection ─────────────────────────────────────
                plateau_window.append(avg_r)
                if len(plateau_window) == plateau_window.maxlen and ep_global > 100:
                    first_half = list(plateau_window)[:25]
                    second_half = list(plateau_window)[25:]
                    improvement = (sum(second_half) / 25) - (sum(first_half) / 25)
                    if abs(improvement) < 0.5:  # very small improvement over 50 episodes
                        print(f"  ⚠ PLATEAU at ep {ep_global}: Δreward={improvement:+.2f} over 50 eps")
                        config.train.entropy_coef = min(0.05, config.train.entropy_coef * 2)
                        plateau_bumps = 20  # keep elevated for 20 episodes
                        print(f"    → Bumping entropy to {config.train.entropy_coef:.4f} for 20 eps")
                        plateau_window.clear()

                # ── Print ─────────────────────────────────────────────────
                if ep_global % print_every == 0 or ep_global == 1:
                    now = time.time()
                    elapsed = now - t0
                    eps_per_sec = ep_global / elapsed
                    eta = (total_episodes - ep_global) / max(eps_per_sec, 0.01)

                    smooth_pl = sum(policy_loss_window) / len(policy_loss_window)
                    smooth_vl = sum(value_loss_window) / len(value_loss_window)
                    smooth_ent = sum(entropy_window) / len(entropy_window)

                    delta_str = ""
                    if prev_smooth_r is not None:
                        delta = smooth_r - prev_smooth_r
                        delta_str = f"{delta:>+7.1f}"
                    else:
                        delta_str = f"{'':>7}"
                    prev_smooth_r = smooth_r

                    print(
                        f"{ep_global:>8,}  {pass_num:>5}  {num_agents:>6}  "
                        f"{smooth_r:>+10.2f}  {delta_str}  {smooth_t:>8.2f}  "
                        f"{smooth_pl:>8.4f}  {smooth_vl:>8.4f}  {smooth_ent:>8.3f}  "
                        f"{eps_per_sec:>5.1f}   {_fmt_time(eta):>5}"
                    )
                    smooth_best_t = sum(best_trips_window) / len(best_trips_window)
                    smooth_tps = sum(trips_per_step_window) / len(trips_per_step_window)
                    smooth_dest_rev = sum(dest_rev_window) / len(dest_rev_window)
                    smooth_tax_rev = sum(tax_rev_window) / len(tax_rev_window)
                    smooth_tax_paid = sum(tax_paid_window) / len(tax_paid_window)
                    print(
                        f"{'':>8}  {'':>5}  {'':>6}  "
                        f"{smooth_best_t:>10.1f}  {smooth_tps:>7.3f}  {smooth_dest_rev:>8.1f}  "
                        f"{smooth_tax_rev:>8.1f}  {smooth_tax_paid:>8.1f}"
                    )

                # ── Checkpoint ────────────────────────────────────────────
                if ep_global % save_every == 0:
                    MODELS_DIR.mkdir(exist_ok=True)
                    save_path = MODELS_DIR / f"model_{num_nodes}.pt"
                    torch.save({
                        "model_state_dict": network.state_dict(),
                        "network_config": asdict(config.network),
                        "num_nodes": num_nodes,
                        "episode": ep_global,
                        "best_avg_reward": best_avg_reward,
                    }, save_path)
                    print(f"         ↳ checkpoint saved to {save_path}")

            # End of pass summary
            print(f"\n  ── Pass {pass_num}/{num_passes} complete "
                  f"(avg_reward={smooth_r:+.2f}, avg_trips={smooth_t:.2f}) ──\n")

    # ── Final save ────────────────────────────────────────────────────────
    MODELS_DIR.mkdir(exist_ok=True)
    save_path = MODELS_DIR / f"model_{num_nodes}.pt"
    torch.save({
        "model_state_dict": network.state_dict(),
        "network_config": asdict(config.network),
        "num_nodes": num_nodes,
        "episode": ep_global,
        "best_avg_reward": best_avg_reward,
    }, save_path)

    elapsed = time.time() - t0

    # ── Summary ───────────────────────────────────────────────────────────
    print()
    print("─" * 120)
    print()
    print("  CURRICULUM TRAINING COMPLETE")
    print()
    print(f"  Total time:           {_fmt_time(elapsed)}")
    print(f"  Total episodes:       {ep_global:,}")
    print(f"  Throughput:           {ep_global / elapsed:.1f} ep/s")
    print()
    print(f"  Best avg reward:      {best_avg_reward:+.2f}  (rolling {WINDOW}-ep window)")
    print(f"  Best avg trips:       {best_avg_trips:.2f}")
    print(f"  Final avg reward:     {sum(reward_window) / len(reward_window):+.2f}")
    print(f"  Final avg trips:      {sum(trip_window) / len(trip_window):.2f}")
    print()
    print(f"  Metrics saved to:     {metrics_path}")
    print(f"  Model saved to:       {save_path}")
    print()

    return save_path


def main():
    parser = argparse.ArgumentParser(
        description="Curriculum training for Graphopoly GNN on variable-agent graphs"
    )
    parser.add_argument("--nodes", type=int, default=2,
                        help="Graph size (default: 2)")
    parser.add_argument("--graphs", type=int, default=200,
                        help="Number of random graphs in pool (default: 200)")
    parser.add_argument("--passes", type=int, default=10,
                        help="Number of passes through the pool (default: 10)")
    parser.add_argument("--lr", type=float, default=3e-4,
                        help="Learning rate (default: 3e-4)")
    parser.add_argument("--print-every", type=int, default=5,
                        help="Print metrics every N episodes (default: 5)")
    parser.add_argument("--save-every", type=int, default=200,
                        help="Checkpoint every N episodes (default: 200)")

    args = parser.parse_args()

    if not 2 <= args.nodes <= 20:
        parser.error("--nodes must be between 2 and 20")

    train_curriculum(
        num_nodes=args.nodes,
        num_graphs=args.graphs,
        num_passes=args.passes,
        lr=args.lr,
        print_every=args.print_every,
        save_every=args.save_every,
    )


if __name__ == "__main__":
    main()
