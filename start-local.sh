#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$PWD"
WORK_DIR="$(dirname "$PROJECT_DIR")/work"
PG_BIN="$WORK_DIR/postgres-runtime/node_modules/@embedded-postgres/darwin-arm64/native/bin"
PG_DATA="$WORK_DIR/traceline-pg"
if [ ! -x "$PG_BIN/initdb" ] || [ ! -f "$WORK_DIR/pg-password" ]; then
  echo "No machine-local embedded PostgreSQL runtime. Using the database configured in root .env."
  exec python3 "$PROJECT_DIR/run-local.py"
fi
export PATH="$WORK_DIR/media-runtime/node_modules/@ffmpeg-installer/darwin-arm64:$WORK_DIR/media-runtime/node_modules/@ffprobe-installer/darwin-arm64:$PATH"
chmod +x "$WORK_DIR/media-runtime/node_modules/@ffprobe-installer/darwin-arm64/ffprobe"
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  "$PG_BIN/initdb" -D "$PG_DATA" --username=traceline --auth=scram-sha-256 --pwfile="$WORK_DIR/pg-password"
fi
if ! "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$WORK_DIR/traceline-postgres.log" -o "-h 127.0.0.1 -p 55432 -k $WORK_DIR" start
fi
backend/.venv/bin/python - <<'PY'
from dotenv import dotenv_values
import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo
url=dotenv_values('.env')['DATABASE_URL'].replace('postgresql+psycopg://','postgresql://')
opts=conninfo_to_dict(url); opts['dbname']='postgres'
with psycopg.connect(make_conninfo(**opts),autocommit=True) as conn:
    if not conn.execute("SELECT 1 FROM pg_database WHERE datname='traceline'").fetchone():
        conn.execute('CREATE DATABASE traceline OWNER traceline')
PY
(cd backend && .venv/bin/alembic upgrade head)
# Seed only a new empty database; never reset existing cases.
COUNT=$(backend/.venv/bin/python - <<'PY'
from dotenv import dotenv_values
import psycopg
url=dotenv_values('.env')['DATABASE_URL'].replace('postgresql+psycopg://','postgresql://')
with psycopg.connect(url) as c: print(c.execute('SELECT count(*) FROM cases').fetchone()[0])
PY
)
if [ "$COUNT" = 0 ]; then
  (cd backend && .venv/bin/python scripts/build_scenarios.py && .venv/bin/python scripts/seed_preview.py)
fi
open "http://127.0.0.1:5176/"
TRACELINE_API_PORT=8010 TRACELINE_WEB_PORT=5176 bash run.sh
