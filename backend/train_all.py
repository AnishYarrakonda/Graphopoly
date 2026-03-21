"""
Universal GNN training for Graphopoly (Option A).

Trains a SINGLE model on diverse graphs across ALL sizes 2-20.
Dynamic-depth GATv2 adapts message-passing rounds to each graph's size.

Usage:
    python3 -m backend.train_all
    python3 -m backend.train_all --epochs 15 --graphs-per-size 100
    python3 -m backend.train_all --resume
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import deque
from dataclasses import asdict
from pathlib import Path

# Force unbuffered output so prints appear immediately (even through pipes)
import builtins
_original_print = builtins.print
def _flush_print(*args, **kwargs):
    kwargs.setdefault("flush", True)
    _original_print(*args, **kwargs)
builtins.print = _flush_print

import numpy as np
import torch

from backend.config import GraphopolyConfig, NetworkConfig
from backend.core.graph_world import GraphWorld
from backend.core.env import GraphopolyEnv
from backend.agent.gnn_network import GraphopolyGNN
from backend.agent.ppo import PPOTrainer
from backend.train_curriculum import build_curriculum_graphs

MODELS_DIR = Path(__file__).parent.parent / "models"
TRAINING_DATA_DIR = Path(__file__).parent.parent / "training_data"


def _fmt_time(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}m"
    else:
        return f"{seconds / 3600:.1f}h"


def _detect_device() -> torch.device:
    """Auto-detect best device: CUDA → CPU.

    MPS (Apple Silicon GPU) is supported but NOT auto-selected because the
    per-transition Python loop in PPO updates causes excessive CPU↔GPU
    synchronization, making MPS ~10-30x SLOWER than CPU for this workload.
    Use --device mps to force it (useful if the PPO loop is later vectorized).
    """
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def train_universal(
    graphs_per_size: int = 100,
    epochs: int = 15,
    lr: float = 3e-4,
    benchmark_per_size: int = 3,
    resume: bool = False,
    print_every: int = 25,
    device_override: str | None = None,
) -> Path:
    """Train a universal GNN on graphs of all sizes 2-20."""
    config = GraphopolyConfig()
    config.train.lr = lr

    # Device selection
    if device_override:
        device = torch.device(device_override)
    else:
        device = _detect_device()

    sizes = list(range(2, 21))  # 2-20 nodes
    num_sizes = len(sizes)

    # ── Header ──────────────────────────────────────────────────────────
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║           GRAPHOPOLY — UNIVERSAL GNN TRAINING                ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()

    # ── Build graph pools ───────────────────────────────────────────────
    print("Building graph pools for sizes 2-20...")
    rng = np.random.default_rng(42)

    train_graphs: list[tuple[GraphWorld, int, int, int]] = []
    benchmark_graphs: list[tuple[GraphWorld, int, int, int]] = []

    for n in sizes:
        total_needed = graphs_per_size + benchmark_per_size
        pool = build_curriculum_graphs(n, total_needed, rng=rng)
        for i, (world, na, nd) in enumerate(pool):
            if i < graphs_per_size:
                train_graphs.append((world, na, nd, n))
            elif i < graphs_per_size + benchmark_per_size:
                benchmark_graphs.append((world, na, nd, n))

    total_train = len(train_graphs)
    total_benchmark = len(benchmark_graphs)
    total_episodes = total_train * epochs

    print(f"  Sizes:           2-20 ({num_sizes} sizes)")
    print(f"  Training graphs: {total_train} ({graphs_per_size}/size)")
    print(f"  Benchmark:       {total_benchmark} ({benchmark_per_size}/size)")
    print(f"  Epochs:          {epochs}")
    print(f"  Total episodes:  {total_episodes:,}")
    print(f"  Features/node:   {config.network.node_feature_dim}")
    print(f"  Max GNN depth:   {config.network.max_gnn_layers} (dynamic: 2-5)")
    print(f"  Device:          {device}")
    print()

    # ── Network + optimizer ─────────────────────────────────────────────
    network = GraphopolyGNN(config=config.network).to(device)
    optimizer = torch.optim.Adam(network.parameters(), lr=lr)

    start_epoch = 0
    ep_global = 0
    best_bmk_reward = float("-inf")

    if resume:
        model_path = MODELS_DIR / "model_universal.pt"
        if model_path.exists():
            ckpt = torch.load(model_path, map_location=device, weights_only=True)
            net_cfg = NetworkConfig(**{
                k: v for k, v in ckpt["network_config"].items()
                if k in NetworkConfig.__dataclass_fields__
            })
            network = GraphopolyGNN(config=net_cfg).to(device)
            network.load_state_dict(ckpt["model_state_dict"])
            optimizer = torch.optim.Adam(network.parameters(), lr=lr)
            start_epoch = ckpt.get("epoch", 0)
            ep_global = ckpt.get("episode", 0)
            best_bmk_reward = ckpt.get("best_benchmark_reward", float("-inf"))
            print(f"  Resumed from epoch {start_epoch}, episode {ep_global}")

    param_count = sum(p.numel() for p in network.parameters())
    print(f"  Network:         {param_count:,} parameters")
    print(f"  PPO:             batched GNN embedding (fast)")
    print()

    # ── Entropy annealing ───────────────────────────────────────────────
    base_entropy = config.train.entropy_coef
    final_entropy = config.train.entropy_coef_final
    anneal_eps = max(1, int(total_episodes * config.train.entropy_anneal_frac))

    # ── Metrics output ──────────────────────────────────────────────────
    out_dir = TRAINING_DATA_DIR / "universal"
    out_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = out_dir / "metrics.jsonl"
    epochs_path = out_dir / "epochs.jsonl"
    print(f"  Metrics:         {metrics_path}")
    print()

    # ── Rolling windows (per-size tracking) ─────────────────────────────
    WINDOW = 50
    # Global rolling windows
    reward_window: deque[float] = deque(maxlen=WINDOW)
    trip_window: deque[float] = deque(maxlen=WINDOW)
    policy_loss_window: deque[float] = deque(maxlen=WINDOW)
    entropy_window: deque[float] = deque(maxlen=WINDOW)

    # Per-size rolling windows for the periodic size breakdown
    size_reward_windows: dict[int, deque] = {n: deque(maxlen=20) for n in sizes}
    size_trip_windows: dict[int, deque] = {n: deque(maxlen=20) for n in sizes}

    # Plateau detection
    plateau_window: deque[float] = deque(maxlen=50)
    plateau_bumps = 0

    best_avg_reward = float("-inf")

    t0 = time.time()
    last_size_print = 0

    # ── Column header ───────────────────────────────────────────────────
    print("─" * 100)
    print(f"{'Epoch':>5}  {'Episode':>8}  {'N':>3}  {'A':>3}  {'Depth':>5}  "
          f"{'AvgRew':>8}  {'AvgTrip':>7}  "
          f"{'PolicyL':>8}  {'Ent':>6}  "
          f"{'ep/s':>6}  {'Elapsed':>7}  {'ETA':>6}")
    print("─" * 100)

    mode = "a" if resume else "w"
    with open(metrics_path, mode) as mf, open(epochs_path, mode) as ef:
        for epoch in range(start_epoch + 1, start_epoch + epochs + 1):
            # SCRAMBLE: random order each epoch — mixes all sizes
            order = rng.permutation(total_train)
            epoch_rewards: list[float] = []
            epoch_trips: list[float] = []
            epoch_t0 = time.time()

            for oi, idx in enumerate(order):
                world, num_agents, num_destinations, num_nodes = train_graphs[idx]
                ep_global += 1

                # Entropy annealing
                if ep_global <= anneal_eps:
                    ent_coef = base_entropy + (final_entropy - base_entropy) * (ep_global / anneal_eps)
                else:
                    ent_coef = final_entropy
                if plateau_bumps > 0:
                    config.train.entropy_coef = max(ent_coef, config.train.entropy_coef)
                    plateau_bumps -= 1
                    if plateau_bumps == 0:
                        config.train.entropy_coef = ent_coef
                else:
                    config.train.entropy_coef = ent_coef

                config.agent.num_agents = num_agents
                config.agent.num_destinations = num_destinations

                env = GraphopolyEnv(config, world)
                edge_index = env.get_edge_index().to(device)

                trainers = {
                    aid: PPOTrainer(network, optimizer, config.train, edge_index)
                    for aid in range(num_agents)
                }

                # ── Collect rollout ────────────────────────────────────
                env.reset()
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
                    for aid in range(num_agents):
                        trainers[aid].store_reward(rewards[aid], done)
                    if done:
                        break

                # ── PPO update ─────────────────────────────────────────
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

                # ── Metrics ────────────────────────────────────────────
                ep_rewards = [a.cumulative_reward for a in env.agents]
                ep_trips = [a.trips_completed for a in env.agents]
                avg_r = sum(ep_rewards) / len(ep_rewards)
                avg_t = sum(ep_trips) / len(ep_trips)

                avg_pl = sum(l["policy_loss"] for l in ep_losses) / len(ep_losses)
                avg_ent = sum(l["entropy"] for l in ep_losses) / len(ep_losses)

                reward_window.append(avg_r)
                trip_window.append(avg_t)
                policy_loss_window.append(avg_pl)
                entropy_window.append(avg_ent)
                epoch_rewards.append(avg_r)
                epoch_trips.append(avg_t)

                # Per-size tracking
                size_reward_windows[num_nodes].append(avg_r)
                size_trip_windows[num_nodes].append(avg_t)

                smooth_r = sum(reward_window) / len(reward_window)
                if smooth_r > best_avg_reward:
                    best_avg_reward = smooth_r

                # JSONL record
                record = {
                    "episode": ep_global,
                    "epoch": epoch,
                    "num_nodes": num_nodes,
                    "num_agents": num_agents,
                    "avg_reward": round(avg_r, 3),
                    "avg_trips": round(avg_t, 3),
                    "policy_loss": round(avg_pl, 6),
                    "entropy": round(avg_ent, 4),
                    "depth": GraphopolyGNN._get_depth(num_nodes),
                }
                mf.write(json.dumps(record) + "\n")

                # Plateau detection
                plateau_window.append(avg_r)
                if len(plateau_window) == plateau_window.maxlen and ep_global > 200:
                    first_half = list(plateau_window)[:25]
                    second_half = list(plateau_window)[25:]
                    improvement = (sum(second_half) / 25) - (sum(first_half) / 25)
                    if abs(improvement) < 0.5:
                        config.train.entropy_coef = min(0.05, config.train.entropy_coef * 2)
                        plateau_bumps = 20
                        plateau_window.clear()

                # ── Print every N episodes ─────────────────────────────
                if ep_global % print_every == 0:
                    now = time.time()
                    elapsed = now - t0
                    eps_per_sec = ep_global / elapsed if elapsed > 0 else 0
                    remaining_eps = total_episodes - (ep_global - start_epoch * total_train)
                    eta = remaining_eps / max(eps_per_sec, 0.01)

                    smooth_t = sum(trip_window) / len(trip_window)
                    smooth_pl = sum(policy_loss_window) / len(policy_loss_window)
                    smooth_ent = sum(entropy_window) / len(entropy_window)
                    depth = GraphopolyGNN._get_depth(num_nodes)

                    print(
                        f"{epoch:>5}  {ep_global:>8,}  {num_nodes:>3}  {num_agents:>3}  "
                        f"{depth:>5}  "
                        f"{smooth_r:>+8.2f}  {smooth_t:>7.2f}  "
                        f"{smooth_pl:>8.4f}  {smooth_ent:>6.3f}  "
                        f"{eps_per_sec:>5.1f}   {_fmt_time(elapsed):>6}  {_fmt_time(eta):>5}"
                    )

                # Print per-size breakdown every 250 episodes
                if ep_global % (print_every * 10) == 0 and ep_global > last_size_print:
                    last_size_print = ep_global
                    parts = []
                    for n in [2, 5, 8, 10, 15, 20]:
                        w = size_reward_windows[n]
                        if w:
                            sr = sum(w) / len(w)
                            tw = size_trip_windows[n]
                            st = sum(tw) / len(tw) if tw else 0
                            parts.append(f"N={n}:{sr:>+.1f}r/{st:.1f}t")
                    if parts:
                        print(f"         Size breakdown: {' | '.join(parts)}")

            # ── End of epoch: flush + benchmark ─────────────────────────
            mf.flush()
            epoch_elapsed = time.time() - epoch_t0
            epoch_avg_r = sum(epoch_rewards) / len(epoch_rewards) if epoch_rewards else 0
            epoch_avg_t = sum(epoch_trips) / len(epoch_trips) if epoch_trips else 0
            print(f"\n  ── Epoch {epoch} done ({_fmt_time(epoch_elapsed)}) — "
                  f"avg reward: {epoch_avg_r:+.2f}, avg trips: {epoch_avg_t:.2f}")
            print(f"     Running benchmark ({total_benchmark} graphs)...")

            bmk_results: dict[int, list[float]] = {n: [] for n in sizes}
            bmk_trips: dict[int, list[float]] = {n: [] for n in sizes}

            network.eval()
            with torch.no_grad():
                for world, num_agents, num_destinations, num_nodes in benchmark_graphs:
                    config.agent.num_agents = num_agents
                    config.agent.num_destinations = num_destinations

                    env = GraphopolyEnv(config, world)
                    edge_index = env.get_edge_index().to(device)
                    env.reset()

                    for step in range(config.train.steps_per_episode):
                        shared = env._build_shared_node_data()
                        actions: list[dict] = []
                        for aid in range(num_agents):
                            node_feats = env.get_node_features(aid, shared).to(device)
                            current_pos = env.agents[aid].position
                            valid_nbrs = env.get_valid_neighbors(aid)
                            owned = env.get_owned_nodes(aid)
                            action, _, _, _ = network.get_action_and_value(
                                node_feats, edge_index,
                                current_pos, valid_nbrs, owned,
                                deterministic=True,
                            )
                            actions.append(action)
                        _obs, rewards, _done, info = env.step(actions)

                    ep_rewards = [a.cumulative_reward for a in env.agents]
                    ep_trips = [a.trips_completed for a in env.agents]
                    bmk_results[num_nodes].append(sum(ep_rewards) / len(ep_rewards))
                    bmk_trips[num_nodes].append(sum(ep_trips) / len(ep_trips))

            network.train()

            bmk_summary = {}
            overall_bmk = []
            for n in sizes:
                if bmk_results[n]:
                    avg_r = sum(bmk_results[n]) / len(bmk_results[n])
                    avg_t = sum(bmk_trips[n]) / len(bmk_trips[n])
                    bmk_summary[n] = {"reward": round(avg_r, 2), "trips": round(avg_t, 2)}
                    overall_bmk.append(avg_r)

            overall_avg = sum(overall_bmk) / len(overall_bmk) if overall_bmk else 0

            print(f"     Benchmark results:")
            for n in [2, 5, 8, 10, 15, 20]:
                if n in bmk_summary:
                    s = bmk_summary[n]
                    print(f"       N={n:>2}: reward={s['reward']:>+7.2f}  trips={s['trips']:.2f}")
            print(f"       Overall: {overall_avg:+.2f}")

            epoch_record = {
                "epoch": epoch,
                "episode": ep_global,
                "avg_train_reward": round(epoch_avg_r, 3),
                "avg_train_trips": round(epoch_avg_t, 3),
                "benchmark": bmk_summary,
                "benchmark_overall": round(overall_avg, 3),
            }
            ef.write(json.dumps(epoch_record) + "\n")
            ef.flush()

            # ── Checkpoint ──────────────────────────────────────────────
            MODELS_DIR.mkdir(exist_ok=True)
            save_path = MODELS_DIR / "model_universal.pt"
            ckpt_data = {
                "model_state_dict": network.state_dict(),
                "network_config": asdict(config.network),
                "epoch": epoch,
                "episode": ep_global,
                "best_benchmark_reward": max(best_bmk_reward, overall_avg),
                "trained_sizes": sizes,
                "node_feature_dim": config.network.node_feature_dim,
                "max_gnn_layers": config.network.max_gnn_layers,
            }
            torch.save(ckpt_data, save_path)

            if overall_avg > best_bmk_reward:
                best_bmk_reward = overall_avg
                torch.save(ckpt_data, MODELS_DIR / "model_universal_best.pt")
                print(f"     ★ New best benchmark: {best_bmk_reward:+.2f}")

            print()

    # ── Summary ─────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    print("═" * 100)
    print()
    print("  UNIVERSAL TRAINING COMPLETE")
    print()
    print(f"  Total time:           {_fmt_time(elapsed)}")
    print(f"  Total episodes:       {ep_global:,}")
    print(f"  Throughput:           {ep_global / elapsed:.1f} ep/s")
    print()
    print(f"  Best benchmark:       {best_bmk_reward:+.2f}")
    print(f"  Best avg reward:      {best_avg_reward:+.2f}  (rolling {WINDOW}-ep)")
    print()
    print(f"  Model:                {save_path}")
    print(f"  Best model:           {MODELS_DIR / 'model_universal_best.pt'}")
    print(f"  Metrics:              {metrics_path}")
    print()

    summary = {
        "total_time_seconds": round(elapsed, 1),
        "total_episodes": ep_global,
        "epochs": epochs,
        "best_benchmark_reward": round(best_bmk_reward, 3),
        "best_avg_reward": round(best_avg_reward, 3),
        "graphs_per_size": graphs_per_size,
        "sizes": sizes,
        "device": str(device),
    }
    with open(out_dir / "summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    return save_path


def main():
    parser = argparse.ArgumentParser(
        description="Universal GNN training for Graphopoly (all sizes 2-20)"
    )
    parser.add_argument("--graphs-per-size", type=int, default=100,
                        help="Training graphs per node count (default: 100)")
    parser.add_argument("--epochs", type=int, default=15,
                        help="Full passes through all graphs (default: 15)")
    parser.add_argument("--lr", type=float, default=3e-4,
                        help="Learning rate (default: 3e-4)")
    parser.add_argument("--benchmark", type=int, default=3,
                        help="Benchmark graphs per size (default: 3)")
    parser.add_argument("--resume", action="store_true",
                        help="Resume from existing model_universal.pt")
    parser.add_argument("--print-every", type=int, default=25,
                        help="Print metrics every N episodes (default: 25)")
    parser.add_argument("--device", type=str, default=None,
                        help="Force device (cpu/mps/cuda). Default: auto-detect")

    args = parser.parse_args()

    train_universal(
        graphs_per_size=args.graphs_per_size,
        epochs=args.epochs,
        lr=args.lr,
        benchmark_per_size=args.benchmark,
        resume=args.resume,
        print_every=args.print_every,
        device_override=args.device,
    )


if __name__ == "__main__":
    main()
