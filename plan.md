Graphopoly Comprehensive Redesign Plan

Context
Research project studying emergent competitive pricing strategies in multi-agent RL on graphs. Four major changes: (1) price budget distribution system, (2) grouped-size model training, (3) merged CLI training scripts, (4) professional frontend redesign with sidebar+bottom panel layout.

Part 1: Price Budget Distribution System
Design Decisions (Confirmed)
Fixed total budget — same for all agents regardless of node count (e.g., 100)
Full softmax distribution each step — GNN outputs weights → × budget = prices
Agents with fewer nodes can price higher; agents with more nodes spread thin
Configurable — user can set price_budget via UI slider
trip_reward increased to 25.0 (from 10.0) — makes travel worthwhile
Config changes (backend/config.py)
python
@dataclass
class AgentConfig:
    num_agents: int = 2
    num_destinations: int = 2
    trip_reward: float = 25.0           # ↑ from 10 — travel is worthwhile
    price_budget: float = 100.0         # NEW — fixed total per agent
    # REMOVE: max_price, initial_price
GNN pricing head (backend/agent/gnn_network.py)
Old: Linear(H, 3) → 3-class Categorical per owned node (loop)
New: Linear(H, 1) → raw score per owned node → softmax → × budget
python
# One forward pass, no loop:
raw_scores = self.price_head(owned_embeds)       # [K, 1]
weights = F.softmax(raw_scores.squeeze(-1), dim=0)  # [K]
prices = weights * total_budget                   # [K]
Sampling: Dirichlet distribution for exploration during training
Log-prob: Dirichlet log-prob or log-softmax of the chosen allocation
Faster than current — single softmax vs K separate Categoricals
Environment (backend/core/env.py)
step(): prices come as absolute floats, set directly (no ±1 deltas)
Remove delta clamping logic
Feature #2: price / price_budget (normalized)
Feature #10: price_budget / 1000.0 (replaces max_price / 100)
Update _build_shared_node_data() for float prices
Agent state (backend/core/agent_state.py)
prices: dict[int, float] (float not int)
reset(): uniform distribution (budget / num_owned each)
PPO (backend/agent/ppo.py)
Transition.action_prices: dict[int, float]
Update evaluate_actions for Dirichlet/continuous pricing
Part 2: Grouped-Size Model Training
Design Decisions (Confirmed)
5 groups aligned with GNN depth breakpoints
Max nodes increased from 20 to 50 (allowing larger graphs)
Updated depth function for larger graphs
Groups
Group	Name	Sizes	GNN Depth	Model File
1	tiny	2-4	2	model_group_tiny.pt
2	small	5-7	3	model_group_small.pt
3	medium	8-10	3	model_group_medium.pt
4	large	11-15	4	model_group_large.pt
5	xl	16-20	5	model_group_xl.pt
6	xxl	21-30	5-6	model_group_xxl.pt
7	huge	31-50	6-7	model_group_huge.pt
Max nodes increase
GraphConfig.num_nodes max → 50 (from 20)
Update _get_depth() in GNN:
python
@staticmethod
def _get_depth(num_nodes: int) -> int:
    if num_nodes <= 4: return 2
    if num_nodes <= 10: return 3
    if num_nodes <= 15: return 4
    if num_nodes <= 25: return 5
    if num_nodes <= 35: return 6
    return 7
```
- Update `max_gnn_layers` in NetworkConfig from 5 → 7
- Frontend stepper: max nodes = 50 (from 20)

### Files
- `backend/config.py` — update NetworkConfig.max_gnn_layers
- `backend/agent/gnn_network.py` — update `_get_depth()`, add layers
- `backend/train_offline.py` — group-aware training (see Part 3)
- `frontend/src/components/panels/SettingsPanel.tsx` — increase node max

---

## Part 3: Training Pipeline

### Merge CLI scripts
- Keep `backend/train.py` (GUI-facing, unchanged API)
- Create new `backend/train_offline.py` from merged `train_curriculum.py` + `train_all.py`
  - `--mode curriculum --nodes 8` → trains on 8-node graphs only
  - `--mode group --group medium` → trains on sizes 8-10
  - `--mode universal` → trains on all sizes
- Extract shared helpers: `_collect_rollout()`, `_ppo_update()`, `_compute_metrics()`
- Delete `backend/train_curriculum.py` and `backend/train_all.py`

### Speed optimizations
- `steps_per_episode` = 50 for graphs ≤ 10 nodes, 75 for larger
- `entropy_anneal_frac` = 0.3 (from 0.5)
- Pre-compute edge_index at graph pool creation

---

## Part 4: Frontend Redesign

### Layout (Confirmed: Sidebar + Bottom Panel)
```
┌──────┬────────────────────────┐
│HEADER│  status badges    48px │
├──────┼────────────────────────┤
│      │                        │
│ SIDE │     GRAPH CANVAS       │
│ BAR  │     (flex-1)           │
│320px │                        │
│      │                        │
│Build │                        │
│Ctrl  ├────────────────────────┤
│Disp  │  BOTTOM PANEL (35vh)   │
│      │  Live | Analysis       │
└──────┴────────────────────────┘
Design System (tokens.css)
css
--color-bg: #0a0a0b;
--color-bg-elevated: #141416;
--color-bg-surface: #1a1a1e;
--color-accent: #6366f1;           /* Indigo */
--radius-card: 8px;
--radius-btn: 6px;
--shadow-card: 0 1px 3px rgba(0,0,0,0.3);
Component Changes
Delete: CursorTrail.tsx

Header — 48px, normal letter-spacing, status pills integrated, no magnetic effect

New Sidebar (from SettingsPanel):

320px left, collapsible accordion sections
Build: graph gen (compact), node stepper max=50
Controls: play/pause/stop icons + sliders (budget, trip reward, animation)
Display: toggles in 2-col grid
GraphCanvas — cleaner bg, better zoom controls (pill − % +), toolbar merged into sidebar

New Bottom Panel (from LiveStats + Analysis):

Resizable with drag handle, collapsible
"Live" tab: horizontal scrolling agent cards
"Analysis" tab: horizontal pill categories → full-width chart
Charts — remove 240px sidebar → horizontal pills above chart, inline filters

Shared Components — indigo accent buttons, 8px radius cards, tighter spacing

Files to modify
frontend/src/styles/tokens.css
frontend/src/styles/globals.css
frontend/src/App.tsx — new layout
frontend/src/components/layout/AppShell.tsx
frontend/src/components/layout/Header.tsx — 48px compact
frontend/src/components/layout/StatusBar.tsx — merge into header
frontend/src/components/graph/GraphCanvas.tsx
frontend/src/components/graph/GraphRenderer.tsx
frontend/src/components/graph/GraphToolbar.tsx — merge into sidebar
frontend/src/components/panels/SettingsPanel.tsx → sidebar
frontend/src/components/panels/LiveStatsPanel.tsx → bottom panel
frontend/src/components/panels/AnalysisReplayPanel.tsx → bottom panel
frontend/src/components/charts/ChartNavigator.tsx → horizontal pills
frontend/src/components/charts/ChartDisplay.tsx
frontend/src/components/shared/Button.tsx
frontend/src/components/shared/GlassCard.tsx
frontend/src/components/CursorTrail.tsx — DELETE
frontend/src/types/config.ts
frontend/src/stores/configStore.ts
Implementation Order
Backend: config.py (new fields, remove old)
Backend: agent_state.py (float prices, budget init)
Backend: env.py (absolute pricing, updated features)
Backend: gnn_network.py (softmax pricing head, extended depth, more layers)
Backend: ppo.py (continuous pricing, Dirichlet sampling)
Backend: train_offline.py (merge CLI scripts, group training)
Backend: delete train_curriculum.py, train_all.py
Frontend: tokens.css + globals.css
Frontend: layout restructure (App, AppShell, Header)
Frontend: sidebar (SettingsPanel refactor)
Frontend: bottom panel (LiveStats + Analysis)
Frontend: charts (horizontal pills, full-width)
Frontend: shared components polish
Frontend: config type updates + UI sliders for new params
Delete CursorTrail
Integration testing
Verification
python -c "from backend.core.env import GraphopolyEnv; print('OK')"
Start backend + frontend, generate graph (up to 50 nodes)
Run simulation, verify softmax pricing works
Verify budget distribution visible in live stats
Check analysis charts render in new layout
CLI: python -m backend.train_offline --mode group --group medium
Screenshot comparison before/after


Another change I want you to add/implement:



"Scan this codebase and create a CLAUDE.md file in the root directory. Optimize it for token efficiency by focusing on:

1. Project Map: High-level directory structure and purpose of key files.

2. Tech Stack & Versions: Essential libraries and environmental constraints only.

3. Critical Commands: Concise list of build, test, and run scripts.

4. Enforced Patterns: Naming conventions and architecture rules to prevent rework.

5. Verification Flow: How you should verify your changes before finishing.

Constraint: Keep the file under 1,000 tokens. Do not include large code samples or explanations of basic programming concepts."
