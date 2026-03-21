# Graphopoly — Multi-Agent RL on Graphs

A game-theoretic multi-agent reinforcement learning research platform where agents navigate a graph, earn rewards by travelling between destination nodes, and compete by setting tolls on owned territory. Agents learn via **PPO** using a **shared GATv2 Graph Neural Network** — enabling emergent economic strategies to be studied across arbitrary graph topologies.

---

## Quick Start

**Requirements:** Python 3.10+, Node 18+

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Start the FastAPI backend
python3 main.py

# 3. In a new terminal — start the React frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

> **Offline training** (trains a model for a specific graph size):
> ```bash
> python -m backend.train_offline --nodes 8 --pool-size 50 --episodes 5000
> ```

> **Curriculum training** (trains across many random graphs with variable agent counts):
> ```bash
> python -m backend.train_curriculum --nodes 2 --graphs 200 --passes 10
> ```

---

## Project Structure

```
graphopoly/
├── requirements.txt           # Python dependencies (includes torch_geometric)
├── main.py                    # Entry point alias for server.py
│
├── models/                    # Pre-trained GNN models (one per graph size 2–20)
│   ├── model_2.pt             # Generated via curriculum training
│   ├── model_3.pt
│   ├── ...
│   └── model_20.pt
│
├── training_data/             # Curriculum training metrics (developer reference)
│   └── size_2/
│       └── metrics.jsonl      # Per-episode metrics from curriculum training
│
├── backend/
│   ├── config.py              # All hyperparameters — edit to change defaults
│   ├── simulate.py            # Inference-only simulation loop (used by web UI)
│   ├── train.py               # Single-graph training loop (called by server)
│   ├── train_offline.py       # CLI offline training with graph pools
│   ├── train_curriculum.py    # CLI curriculum training (variable agents, multiple passes)
│   ├── server.py              # FastAPI + WebSocket server
│   ├── logger.py              # JSON episode logging
│   ├── analyze.py             # Post-training analysis utilities
│   ├── db_export.py           # Data export helpers
│   │
│   ├── agent/
│   │   ├── gnn_network.py     # GraphopolyGNN: shared GATv2 policy + value network
│   │   └── ppo.py             # PPO trainer (shared network + shared optimizer)
│   │
│   └── core/
│       ├── env.py             # Multi-agent environment (reward conservation enforced)
│       ├── graph_world.py     # Graph creation, territory assignment, BFS utilities
│       └── agent_state.py     # Per-agent mutable state (position, prices, stats)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root component — Settings / Replay / Analysis tabs
│   │   ├── api/client.ts      # REST + WebSocket client
│   │   ├── components/        # Graph renderer, panels, charts, shared UI
│   │   ├── stores/            # Zustand state (training, replay, graph, config, UI)
│   │   ├── hooks/             # useWebSocket, usePlayback, useSimulationPlayback, …
│   │   ├── types/             # TypeScript types for API, episodes, config, graph
│   │   └── lib/               # CSV export, chart config helpers
│   ├── package.json
│   └── vite.config.ts
│
├── episodes/                  # Saved episode JSON files (auto-created per session)
└── logs/                      # Training logs (auto-created)
```

---

## Two Modes: Simulation vs Offline Training

### Web UI — Simulation (inference only)
The frontend loads a pre-trained model for the current graph size and runs episodes **without learning**. Click **Start Simulation** to watch agents navigate the graph using the model's learned policy.

### CLI — Offline Training
```bash
python -m backend.train_offline --nodes 8 --pool-size 50 --episodes 5000 --print-every 5
```
This creates a pool of random 8-node graphs with diverse topologies (trees through fully-connected), trains a shared GNN on all of them via PPO, and saves the result to `models/model_8.pt`. Training uses CPU by default (fastest for small graphs N≤20). Stats are printed every 5 episodes with reward deltas and intelligence metrics.

### CLI — Curriculum Training
```bash
python -m backend.train_curriculum --nodes 2 --graphs 200 --passes 10 --print-every 5
```
Builds a pool of random N-node graphs, each with a random agent count (1–10). Trains a single shared GNN across all graphs in multiple passes. Metrics are logged to `training_data/size_{N}/metrics.jsonl` in JSONL format. Includes automatic plateau detection — if rewards stall over a 50-episode window, entropy is temporarily boosted to encourage exploration.

If a model file doesn't exist yet when simulation starts, a randomly initialised model is created automatically.

---

## How It Works

### The Game

- **Graph**: N nodes (max 20) connected by edges. Agents live on nodes and traverse edges.
- **Destinations**: Each agent has assigned destination nodes. Completing a trip between two different destinations earns `trip_reward`.
- **Territory**: Every node is owned by exactly one agent. Owners set a price; anyone who steps on that node pays the toll to the owner.
- **Pricing**: Each step, an agent can change any owned node's price by ±1, clamped to `[0, max_price]`.
- **Conservation law**: Taxes are pure transfers (zero-sum). Trip rewards are the *only* money injected. `total_reward = trips_completed × trip_reward` — always.

### The Neural Network — GATv2 GNN

All agents share a single **GraphopolyGNN** (~23,500 parameters) — one set of weights, separate forward passes per agent. Each agent sees the graph from its own perspective.

**Input: 12 node features per node, per agent**

| # | Feature | What it encodes |
|---|---------|----------------|
| 0 | `am_I_here` | Agent's current position |
| 1 | `is_my_owned_node` | 1 if I own this node, 0 if opponent owns it |
| 2 | `price / max_price` | Normalized toll cost (0–1) |
| 3 | `is_my_destination` | I need to visit this node to earn a trip reward |
| 4 | `is_my_last_visited_dest` | Can't collect again here until I visit another dest first |
| 5 | `num_opponents_here / (A−1)` | Congestion — active toll liability |
| 6 | `num_opponents_targeting_j / (A−1)` | Competition — others racing toward this node |
| 7 | `dist_to_nearest_valid_dest / D` | Routing pull — how far am I from a payoff? |
| 8 | `dist_to_last_dest / D` | Distance context from previous reward |
| 9 | `trip_reward / 100` | Global economic scale (same for all nodes) |
| 10 | `max_price / 100` | Price ceiling context (same for all nodes) |
| 11 | `price_norm × opponents_norm` | Expected income signal — traffic × price |

**GNN backbone: 2× GATv2Conv layers**

Each layer runs attention-weighted message passing over the graph edges with 4 attention heads (averaged). After 2 rounds, every node's 64-dim embedding contains information about its 2-hop neighbourhood.

GATv2 uses *dynamic attention* — the score between nodes i and j depends on both embeddings simultaneously, making it more expressive than the original GAT for economic reasoning tasks. Self-loops are included so each node retains its own features through aggregation.

**Three action heads:**

| Head | Input | Output | Decision |
|------|-------|--------|----------|
| Movement | `[embed_current ‖ embed_candidate]` × C | C logits | Which node to move to (stay + neighbors) |
| Pricing | `embed_owned_node` per owned node | 3 logits per node | Price delta: −1, 0, or +1 |
| Value | `[global_mean ‖ embed_current]` | scalar | How much future reward to expect |

### Learning — PPO

Training happens offline via `train_offline.py` or `train_curriculum.py`. Each episode:
1. A random graph is drawn from the training pool.
2. Agents collect a rollout on that graph (GNN forward pass, sample actions, observe rewards).
3. **GAE** computes advantages (`γ=0.99`, `λ=0.95`).
4. **PPO** runs 4 update epochs with clipped surrogate loss.
5. All agents share one `Adam` optimizer — a single optimizer state prevents conflicting momentum when updating shared weights.
6. **Entropy annealing**: entropy coefficient linearly decays from `0.01` to `0.001` over the first half of training, balancing exploration and exploitation.

### Why Shared Weights?

- **Transfer**: the same trained policy works on any graph topology of the same size
- **Efficiency**: ~23.5K parameters total vs ~270K with per-agent MLPs
- **Research value**: ablate topology effects without confounding policy differences between agents

---

## Config Reference (`backend/config.py`)

### Graph
| Parameter | Default | Description |
|-----------|---------|-------------|
| `graph.num_nodes` | 10 | Nodes in randomly generated graph (max 20) |
| `graph.num_edges` | None | Target edge count (None = uniform random) |

### Agents
| Parameter | Default | Description |
|-----------|---------|-------------|
| `agent.num_agents` | 5 | Number of agents (max 10) |
| `agent.num_destinations` | 2 | Destination nodes per agent |
| `agent.trip_reward` | 10.0 | Reward per completed destination trip |
| `agent.max_price` | 20 | Price ceiling per node |
| `agent.initial_price` | 5 | Starting price for all owned nodes |

### Training
| Parameter | Default | Description |
|-----------|---------|-------------|
| `train.steps_per_episode` | 100 | Environment steps per episode |
| `train.lr` | 3e-4 | Adam learning rate (shared optimizer) |
| `train.gamma` | 0.99 | Discount factor |
| `train.gae_lambda` | 0.95 | GAE smoothing parameter |
| `train.clip_epsilon` | 0.2 | PPO clipping range |
| `train.entropy_coef` | 0.01 | Initial entropy bonus weight (exploration) |
| `train.entropy_coef_final` | 0.001 | Final entropy coefficient after annealing |
| `train.entropy_anneal_frac` | 0.5 | Fraction of training over which entropy anneals |
| `train.value_coef` | 0.5 | Value loss weight |
| `train.ppo_epochs` | 4 | Update passes per episode |
| `train.batch_size` | 64 | Mini-batch size for PPO updates |

### GNN Architecture
| Parameter | Default | Description |
|-----------|---------|-------------|
| `network.hidden_dim` | 64 | Node embedding size per GATv2 layer |
| `network.num_gnn_layers` | 2 | GATv2 message-passing rounds |
| `network.gat_heads` | 4 | Attention heads per layer (averaged) |
| `network.move_mlp_hidden` | 32 | Hidden dim of movement scoring MLP |
| `network.dropout` | 0.0 | Dropout rate in GATv2 layers |

### Device
| Parameter | Default | Description |
|-----------|---------|-------------|
| `device` | auto | Auto-detected: MPS → CUDA → CPU |

---

## Web UI Guide

### Settings Tab
- **Generate Random Graph** — Creates a random connected graph with configurable nodes/agents/destinations. Edge count is sampled uniformly from [N−1, N(N−1)/2] for topology diversity.
- **Manual Build** — Place nodes, draw edges, assign ownership and destinations by hand.
- **Start Simulation** — Loads the trained model for the graph's size and runs inference-only episodes.
- **Economy Settings** — Configure trip reward, max price cap, and animation speed.

### Replay Tab
- **Load Episode** — Upload a saved episode JSON; graph is reconstructed automatically.
- **Playback Controls** — Play/pause, step forward/back, scrub with slider.
- **Per-Agent Stats** — Rewards, trips completed, tax revenue/paid, prices per episode.

### Analysis Tab
- **Charts** — Reward curves, price evolution, node visit frequency, tax flows, and more.
- **Fullscreen** — Expand any chart for detailed inspection.
- **Export CSV** — Download all chart data as a ZIP of CSV files.

---

## Curriculum Training

The curriculum trainer (`train_curriculum.py`) is designed to build robust models by exposing the GNN to diverse graph configurations:

```bash
# Train on 200 random 2-node graphs, 10 passes each (2,000 total episodes)
python -m backend.train_curriculum --nodes 2 --graphs 200 --passes 10

# Train on 5-node graphs with more passes
python -m backend.train_curriculum --nodes 5 --graphs 100 --passes 20 --print-every 10
```

**Features:**
- Each graph gets a random agent count (1–10) — the GNN learns to handle variable competition
- Metrics logged to `training_data/size_{N}/metrics.jsonl` (one JSON object per episode)
- Automatic plateau detection: if average reward improvement drops below threshold over a 50-episode window, entropy is temporarily doubled to escape local optima
- Checkpoints saved every 200 episodes to `models/model_{N}_checkpoint.pt`
- Per-pass summary statistics printed at the end of each pass

**Metric fields in JSONL output:**
```json
{"episode": 1, "pass_num": 1, "graph_idx": 42, "num_agents": 3,
 "avg_reward": 12.5, "best_trips": 8, "avg_trips": 5.2,
 "trips_per_step": 0.15, "policy_loss": 0.03, "value_loss": 150.2,
 "entropy": 1.4, "avg_dest_rev": 50.0, "avg_tax_rev": 12.0, "avg_tax_paid": 8.0}
```

---

## Research Questions

- Do agents prioritize **commuting** (more trips) or **toll extraction** (high prices)?
- Does **bottleneck monopolization** emerge — agents pricing key bridge nodes to tax all routes?
- Do agents set **negative prices** as strategic subsidies to reroute opponents away from their destinations?
- Does the system converge to a **Nash equilibrium**, or do strategies cycle indefinitely?
- How does **graph topology** affect equilibrium — hub-and-spoke vs grid vs random?
- How does the GATv2 **attention pattern** evolve during training — which neighbours does each node attend to?

---

## Dependencies

```
torch>=2.0
torch_geometric>=2.4     # GATv2Conv — Graph Attention Network v2
networkx>=3.0            # Graph algorithms (BFS, diameter, layout)
numpy>=1.24
fastapi>=0.100
uvicorn[standard]>=0.23
pydantic>=2.0
websockets>=11.0
python-multipart>=0.0.6
```
