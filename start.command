#!/bin/bash
# dolphin_gpt launcher for macOS / Linux
# Double-click this file (Mac) or run ./start.command from a terminal.

set -e
cd "$(dirname "$0")"

BACKEND_DIR="backend"
FRONTEND_DIR="frontend"

if [ ! -d "$BACKEND_DIR/venv" ]; then
  echo "Backend is not set up yet. Run the first-time setup steps in README.md."
  read -p "Press enter to close..."
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Frontend is not set up yet. Run the first-time setup steps in README.md."
  read -p "Press enter to close..."
  exit 1
fi

if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "Ollama does not appear to be running."
  echo "Open the Ollama app first, then try again."
  read -p "Press enter to close..."
  exit 1
fi

echo "Starting backend on http://localhost:8000"
(
  cd "$BACKEND_DIR"
  source venv/bin/activate
  exec uvicorn main:app --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:3000"
(
  cd "$FRONTEND_DIR"
  exec npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 4
if command -v open >/dev/null 2>&1; then
  open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000
fi

echo ""
echo "dolphin_gpt is running."
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "Close this window to stop."
echo ""

wait
