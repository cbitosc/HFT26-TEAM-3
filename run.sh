#!/usr/bin/env bash
# Start the TraceLine API and redesigned frontend together.
set -euo pipefail
cd "$(dirname "$0")"
API_PORT="${TRACELINE_API_PORT:-8010}"
WEB_PORT="${TRACELINE_FRONTEND_PORT:-${TRACELINE_WEB_PORT:-5176}}"
if ! backend/.venv/bin/python -c 'import uvicorn, sqlalchemy, psycopg, pydantic_settings' 2>/dev/null; then
  echo "Backend dependencies missing. Install backend/requirements.txt in backend/.venv first." >&2
  exit 1
fi
if [ ! -f .env ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "Missing configuration: copy .env.example to .env in the repository root and set DATABASE_URL." >&2
  exit 1
fi
(cd backend && ./.venv/bin/python -m app.bootstrap)
(cd backend && exec ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT
cd frontend
if [ ! -d node_modules ]; then npm ci; fi
echo "TraceLine: http://127.0.0.1:$WEB_PORT (API :$API_PORT)"
TRACELINE_API_URL="http://127.0.0.1:$API_PORT" npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort
