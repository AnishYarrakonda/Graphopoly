# Graphopoly - Project Map & Standards

## Project Map
- `root/`: Python/TS workspace. `main.py` launches both backend and frontend.
- `backend/`: Core logic (GNNs, Env, PPO).
  - `core/`: Environment (`env.py`), Graph logic (`graph_world.py`), Agent state (`agent_state.py`).
  - `agent/`: GNN architecture (`gnn_network.py`), Trainers (`ppo.py`).
  - `server.py`: FastAPI WebSocket server.
  - `train_offline.py`: Merged CLI training script.
- `frontend/`: React + Vite + TypeScript.
  - `src/components/`: UI components (Layout, Graph, Panels, shared).
  - `src/stores/`: Zustand state management.
  - `src/api/`: WebSocket/HTTP client.
- `models/`: Saved `.pt` GNN checkpoints.
- `training_data/`: JSONL metrics and logs.

## Tech Stack & Versions
- Backend: Python 3.10+, PyTorch 2.x, PyTorch Geometric, FastAPI.
- Frontend: React 18, Vite, TypeScript, Zustand, Recharts, Cytoscape.js.

## Critical Commands
- Full App: `python main.py`
- Training: `python -m backend.train_offline --mode <curriculum|group|universal>`
- Frontend Dev: `cd frontend && npm run dev`
- Backend Lint: `flake8 backend`

## Enforced Patterns
- Naming: `snake_case` (Python), `PascalCase` (React Components), `camelCase` (Variables/Functions).
- Architecture: Functional React components, decoupled Zustand stores, unified config via `backend/config.py`.
- Style: STUNNING modern UI (Sidebar+Bottom layout), indigo accent, dark mode, rich micro-animations.

## Verification Flow
1. Backend: `python -c "from backend.core.env import GraphopolyEnv; print('OK')"`
2. UI: Check layout responsiveness and sidebar/bottom panel interactions.
3. Integration: Generate graph, play simulation, verify pricing updates in live stats.
