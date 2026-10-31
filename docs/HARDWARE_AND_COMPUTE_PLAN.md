# HARDWARE_AND_COMPUTE_PLAN

Version 3. Supersedes `archive/HARDWARE_AND_DEPLOYMENT.md`. No paid cloud GPU anywhere in the design.

## 1. Machine (measured 2026-10-30)

| Item | Value |
|---|---|
| CPU/GPU | Apple M5, integrated GPU with Metal; PyTorch MPS **available** |
| Memory | 16 GB unified |
| Free disk | ~225 GB |
| Python | System 3.9.6; **Homebrew 3.11 present** (`/opt/homebrew/bin/python3.11`) and used for research |
| FFmpeg | Not installed (Phase 1 setup: `brew install ffmpeg`) |
| Docker, Node | Installed |

## 2. Where each workload runs

| Workload | Runs on | Notes |
|---|---|---|
| Detection (YOLO26s/n), accident cue (YOLOv8s), tracking | Local, MPS preferred, CPU fallback | Device configurable: `auto` → MPS if available, else CPU |
| Frame sampling, thumbnails, transcode | Local FFmpeg/OpenCV | |
| Sensor maths, sync, engine, trajectories | Local Python (NumPy/Pandas) | |
| Witness extraction, frame interpretation, explanations, report wording | Featherless API | Policy-gated, cached, rate-limited |
| Simulation (optional CARLA) | **Not on this Mac** | CARLA needs an NVIDIA GPU on Windows/Ubuntu (its docs); only a borrowed machine would work |

## 3. Measured throughput (synthetic pan of one image; speed only)

Source: `research/phase2_benchmark/`, `research/stage1_probes/`.

| Operation | MPS | CPU |
|---|---|---|
| YOLO26n detect @640 | 7.9 ms/frame | 15.9 ms/frame |
| YOLO26s detect @640 | 12.3 ms/frame | 31.6 ms/frame |
| YOLO26n + ByteTrack @640 | 9.5 ms/frame | 16.8 ms/frame |
| YOLO26n + BoT-SORT @640 | 12.3 ms/frame | 20.0 ms/frame |
| Accident model (YOLOv8s best.pt) inference @640 | ~3–6 ms/img (validation run; excludes ~11 ms post-processing) | not measured |

**Estimate (extrapolated, to be re-measured on real footage):** a 60 s clip sampled at 5 fps is 300 frames. YOLO26s + tracking + accident cue on MPS is roughly 300 × (12 + 3 + 6) ms ≈ 6–7 s of model time, plus decoding and I/O. CPU-only machines need about 3× that.

**Measured in Phase 3 (real pipeline, not extrapolated):** a 20 s 1280×720 30 fps HEVC clip (600 frames) went from upload to finished preprocessing in **2.2 s wall time**. That covers validation, frame index, 100 thumbnails with quality metrics, and an H.264 transcode, on the M5, CPU decode/encode. Detection and tracking (Phase 4–5) are not included.

**Measured in Phase 4 (real pipeline):** 20 s of 1280×960 30 fps video (600 frames, 100 sampled) → validate + preprocess + detect (YOLO26s + accident cue) in **6.3 s wall time**. Detector 21.8 ms per frame and accident cue 11.8 ms per frame on MPS, batch 8. Tracking (Phase 5) not included.

## 4. Default processing configuration

| Setting | Default | Range | Purpose |
|---|---|---|---|
| `sample_fps` | 5 | 1–30 | Frames analysed per second of video |
| `detector_imgsz` | 640 | 320–1280 | Detector input size |
| `det_conf` | 0.25 | 0.05–0.9 | Detection threshold (stored per run) |
| `accident_conf` | 0.40 | 0.1–0.9 | Accident cue threshold |
| `max_frames` | 3000 | — | Safety cap per job |
| `max_processing_seconds` | 600 | — | Job time budget; exceeded → partial results |
| `device` | auto | cpu / mps | |
| `reprocess_interval` | — | `[t0, t1]` at full frame rate | Investigator-selected high-detail pass |

Tracking at 5 fps is coarser than at full rate. Fast vehicles move further between frames, which raises the risk of identity switches. That is why intervals around candidate events can be reprocessed at full rate. The trade-off is measured on BDD100K MOT data, which itself is labelled at 5 Hz.

## 5. Featherless budget

- About 25 USD; billing type (per-token vs subscription units) is unconfirmed.
- Listed per-token prices for the chosen models put one keyframe interpretation at roughly USD 0.0005 and one statement extraction at about USD 0.0002 (estimates; MODEL_SELECTION §5).
- Concurrency limiter sized to the plan's units (1-unit models: Qwen3-VL-8B, Qwen3-14B; 2-unit: Qwen3-32B).
- Keyframes per case capped (default 12) and all responses cached by input hash.

## 6. Local deployment

**As built in Phase 1:** the Docker daemon was not running on the dev Mac, but Homebrew PostgreSQL 16 already was. We use it with a dedicated `traceline` role and two databases (`traceline`, `traceline_test`), isolated from other projects on that server. A `docker compose` file is not needed for local work and can be added later for teammates without a local PostgreSQL.

```
cd backend && ./.venv/bin/alembic upgrade head
./.venv/bin/uvicorn app.main:app        # API
python -m app.worker                    # job worker (Phase 2)
npm run dev  (frontend)                 # Vite dev server (UI phase)
```
See `backend/README.md`.
Environment (`.env`, git-ignored): `DATABASE_URL`, `STORAGE_ROOT`, `FEATHERLESS_API_KEY`, `FEATHERLESS_BASE_URL=https://api.featherless.ai/v1`, `FEATHERLESS_TEXT_MODEL`, `FEATHERLESS_VISION_MODEL`.

## 7. Demo resilience

Seeded demo cases are processed ahead of time. Results and model responses are stored, so a live demo does not depend on network latency. Live upload-and-process is shown on a short clip. A screen recording serves as a backup.
