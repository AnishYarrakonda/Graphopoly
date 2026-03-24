#!/usr/bin/env python3
"""
Graphopoly — single entry point.

Starts the FastAPI backend and the Vite frontend dev server together.

Usage:
    python main.py                  # Start both backend + Vite dev server
    python main.py --backend-only   # Start backend only
    python main.py --port 9000      # Custom backend port
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

# Ensure the project root is on Python path so `backend.` imports work
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))


def kill_port(port: int) -> None:
    """Kill any process listening on the given port (macOS/Linux)."""
    try:
        result = subprocess.run(
            ["lsof", "-t", f"-i:{port}"],
            capture_output=True, text=True,
        )
        pids = result.stdout.strip().split("\n")
        for pid in pids:
            if pid:
                os.kill(int(pid), signal.SIGTERM)
        if any(pids):
            time.sleep(0.5)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Launch Graphopoly")
    parser.add_argument("--port", type=int, default=8000, help="Backend port (default: 8000)")
    parser.add_argument("--backend-only", action="store_true", help="Start backend only (skip Vite dev server)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Backend host (default: 0.0.0.0)")
    args = parser.parse_args()

    frontend_dir = PROJECT_ROOT / "frontend"
    vite_process = None
    start_frontend = not args.backend_only

    # Kill anything on the port before starting
    kill_port(args.port)

    if start_frontend:
        # Check if frontend deps are installed
        if not (frontend_dir / "node_modules").exists():
            print("📦 Installing frontend dependencies...")
            subprocess.run(
                ["npm", "install"],
                cwd=str(frontend_dir),
                check=True,
            )

        kill_port(5173)

        print(f"🚀 Starting Vite dev server...")
        vite_process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(frontend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

    print(f"""
╔══════════════════════════════════════════╗
║            G R A P H O P O L Y           ║
╠══════════════════════════════════════════╣
║  Backend API:  http://localhost:{args.port}      ║""")

    if start_frontend:
        print(f"║  Frontend:    http://localhost:5173       ║")
        print(f"║  Open → http://localhost:5173             ║")
    else:
        print(f"║  Run frontend: cd frontend && npm run dev ║")

    print(f"""╚══════════════════════════════════════════╝
""")

    try:
        import uvicorn
        from backend.server import app

        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
    finally:
        if vite_process:
            vite_process.terminate()
            vite_process.wait(timeout=5)
            print("🛑 Vite dev server stopped.")


if __name__ == "__main__":
    main()
