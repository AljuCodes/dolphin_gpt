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

DEFAULT_MODEL="hf.co/TrevorJS/gemma-4-E4B-it-uncensored-GGUF:Q4_K_M"
MODEL="$DEFAULT_MODEL"
if [ -f "$BACKEND_DIR/.env" ]; then
  env_model=$(grep -E '^[[:space:]]*OLLAMA_MODEL[[:space:]]*=' "$BACKEND_DIR/.env" \
    | tail -1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  [ -n "$env_model" ] && MODEL="$env_model"
fi

if ! curl -s http://localhost:11434/api/tags | grep -q "\"$MODEL\""; then
  echo ""
  echo "AI model '$MODEL' is not downloaded yet."
  echo "Downloading now (about 3 GB, one time). You can cancel with Ctrl+C."
  echo ""
  if ! command -v ollama >/dev/null 2>&1; then
    echo "Could not find the 'ollama' command."
    echo "Please run this manually, then restart the launcher:"
    echo "    ollama pull $MODEL"
    read -p "Press enter to close..."
    exit 1
  fi
  if ! ollama pull "$MODEL"; then
    echo ""
    echo "Model download failed. Check your internet connection and try again."
    read -p "Press enter to close..."
    exit 1
  fi
  echo ""
  echo "Model ready."
  echo ""
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
