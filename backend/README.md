# TraceLine backend

FastAPI + SQLAlchemy 2 + Alembic on PostgreSQL 16. Phase 1: environment, full v3 schema with database-level integrity rules, settings, health, Featherless live-check script. Phase 2: evidence ingestion (uploads, validation, witnesses, jobs, audit). Phase 3: video preprocessing (frame index from PTS, thumbnails + quality metrics, browser playback copy, frame-accurate stills, interval reprocessing). Phase 4: pretrained detection (YOLO26s + accident cue) with pinned, scanned weights. Phase 5: tracking (ByteTrack / BoT-SORT on stored detections) with continuity metadata. Phase 6: witness claim extraction through Featherless (policy-gated, verified, ledgered) plus a manual path.

## Setup (macOS)
```bash
brew install ffmpeg postgresql@16            # PostgreSQL 16 must be running
cd backend
/opt/homebrew/bin/python3.11 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp ../.env.example ../.env                    # then fill in DATABASE_URL, TEST_DATABASE_URL, FEATHERLESS_API_KEY
```
Create the role and databases once (run in `psql`; choose your own password and put the same one in `.env`):
```sql
CREATE ROLE traceline LOGIN PASSWORD '...';
CREATE DATABASE traceline OWNER traceline;
CREATE DATABASE traceline_test OWNER traceline;
```
```bash
./.venv/bin/alembic upgrade head             # applies 0001 (30 tables) and 0002 (integrity triggers)
./.venv/bin/uvicorn app.main:app --reload    # http://127.0.0.1:8000/api/v1/health
./.venv/bin/python -m pytest -q              # runs only against TEST_DATABASE_URL
./.venv/bin/python scripts/featherless_check.py   # live Featherless checks (needs the key); writes research/featherless_check/report.json
```

## Layout
```
app/config.py            settings (secrets are SecretStr, never returned or logged)
app/db.py                engine, sessions, id helper
app/models/              30 tables (core, analysis, reconstruction, ops)
app/api/health.py        GET /api/v1/health
alembic/versions/0001    schema generated from the models
alembic/versions/0002    triggers: immutable originals, append-only audit log/events, witness span check, inference rules
alembic/versions/0003    stored_path may be shared (content-addressed store)
alembic/versions/0004-5  video pts_start_ms; job params/result
app/services/video.py    frame PTS, sampling grid, decode + thumbnails, playback copy, full-frame stills
app/services/weights.py  pinned-hash + pickle-scan loader (models.lock.json)
app/services/detection.py detector / accident-cue inference, class mapping
app/llm/featherless.py   Featherless client: policy gate, ledger/cache, retries (key never stored)
app/services/witness.py  claim schema, prompt, verbatim-span location, event-type hints
app/services/tracking.py  association, first-observation backfill, gaps/flags/continuation candidates
app/eval/                detection metrics (AP50 equal to Ultralytics' compute_ap); tracking metrics via trackers.eval
scripts/fetch_models.py  download + verify weights into <STORAGE_ROOT>/models
scripts/eval_accident_model.py  regression check on the accident model's validation split
app/storage.py           staging, hashing, read-only content-addressed originals, safe path resolution
app/services/            filetypes (content sniffing), validators (ffprobe etc.), jobs (queue), audit (hash chain), ingest
app/api/                 cases, evidence, witnesses, jobs, dashboard, health
app/worker.py            optional standalone job worker: python -m app.worker
scripts/featherless_check.py
tests/                   schema guarantees (exact error codes) and health
```

## Database guarantees (tested)
- `evidence_files`: only `status`/`validation` can change; no deletes. Duplicate content in a case is rejected.
- `witness_statements`: original text immutable; `witness_claims.source_text` must equal the exact statement span.
- `sensor_records`: raw timestamp text and raw values immutable.
- `audit_log`: append-only. `events`: append-only (only `review_status` may change).
- Events other than inferences must have a source reference by commit time. Inferences need existing non-inference premises, a non-empty alternatives list, and the `engine` source type.
- Findings must reference something; image-space trajectories must name their camera.

These guards also hold for the table owner's normal DML. A superuser can still disable triggers or TRUNCATE; this is tamper-evidence for the application, not forensic certification.

## API quick tour (Phase 2)
```bash
B=http://127.0.0.1:8000/api/v1
curl -s -X POST $B/cases -H 'Content-Type: application/json' -d '{"title":"Intersection A","designation":"staged"}'
curl -s -X POST $B/cases/<case_id>/evidence -F file=@dashcam.mp4 -F kind=dashcam -F synthetic=false
curl -s $B/cases/<case_id>/evidence          # status becomes valid/invalid once validation finishes
curl -s -H 'Range: bytes=0-1023' $B/evidence/<evidence_id>/original   # original bytes, byte-range capable
```
`synthetic` is mandatory on every upload. Interactive docs: `/docs`.

Response field names, nullability, units, and clocks (media time, container PTS, case clock, wall-clock) are listed in [../docs/INTEGRATION_CONTRACT.md](../docs/INTEGRATION_CONTRACT.md). That file is the contract the frontend should bind to. `docs/API_DESIGN.md` is the earlier design note.

## Vision pipeline
Detection and tracking need the pinned weights and these packages (installed beside `requirements.txt`; weights stay in `data/models` and are not committed):

```bash
./.venv/bin/pip install -r requirements-vision.txt
./.venv/bin/python scripts/fetch_models.py --include-accident   # hash-checked; skips files already present
```

## Video time convention (Phase 3)
`time_ms` on every frame is media time from the first frame (container PTS). The playback copy (`/stream`) starts at 0, so the browser's `video.currentTime * 1000` equals `time_ms`. The container's own start offset is `pts_start_ms`. These are not wall-clock times. One uploaded source is its own case clock. Two sources stay unrelated until a recorded sync edge joins them.

## Models (Phase 4)
```bash
./.venv/bin/python scripts/fetch_models.py --include-accident   # downloads into data/models and verifies hash + pickle scan
./.venv/bin/python scripts/eval_accident_model.py               # reproduces the accident model's validation metrics
```
Weights are never committed. The accident model's source repository has no licence: local use as a weak cue only.

## Live Featherless checks (Phase 6)
```bash
./.venv/bin/python scripts/featherless_check.py           # key, catalogue, text/JSON, vision, parallel requests
./.venv/bin/python scripts/eval_claim_models.py           # compare text models on claim extraction (first attempt only)
```
Both read `FEATHERLESS_API_KEY` from `.env` and never print or write it. `FEATHERLESS_DISABLE_THINKING=true` (default) is required for Qwen3 models.
