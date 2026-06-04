#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/backend/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/backend/.env"
  set +a
elif [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.local"
  set +a
fi

cd "$ROOT/backend"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' EXIT
wait
