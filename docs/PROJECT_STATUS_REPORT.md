# TraceLine: project status report

State: `main` at `5cf2fd1` (V2 merged). Written to help decide what to change next. Everything below was built or measured in this repository; items marked **unverified** were not run.

## 1. What it is
An investigation-support tool for road-accident evidence. It ingests dashcam/CCTV video, witness statements and vehicle sensor CSVs, finds objects and tracks them, places sources on a shared clock, builds events, compares sources (contradictions, corroborations, gaps), shows an investigator-first workspace, and exports a validated report. It never assigns fault, and it keeps observed, reported, inferred and unknown apart.

## 2. Size
Backend app ~7.8k lines Python, backend tests ~4.6k, frontend (excluding the copied UI kit) ~5.7k, 51 docs, 10 migrations, 68 API paths.

## 3. Backend (`backend/`, FastAPI + PostgreSQL)
| Area | What exists | Real or demo |
|---|---|---|
| Evidence | Upload with SHA-256, content sniffing, read-only originals, hash-chained audit log, DB integrity triggers (immutable evidence/statements, append-only events) | real |
| Video | Frame index from container PTS, thumbnails, playback copy, Range streaming | real |
| Detection | YOLO26s (pinned weights, hash + pickle scan), accident-cue model as a weak note only | real; **boxes can also be imported** and are then labelled `oracle:` / `external:` |
| Tracking | ByteTrack (CCTV), BoT-SORT (dashcam), first-detection backfill, gaps never filled, continuation candidates never merged | real |
| Video events | Rules over tracks: enters/leaves, slowing, stopped, turn, maneuver, interaction, possible collision / near miss | rule-based, heuristic thresholds, **not validated on real data** |
| Sensors | Investigator-declared column mapping and units to SI, rules: hard braking, acceleration spike, collision flag, stop, heading, gaps | real |
| Witness claims | Strict schema, verbatim-quote check, code-derived maneuver; Featherless Qwen3-14B extraction (policy-gated) | LLM path tested with a stand-in client in V2; 10 synthetic statements earlier |
| Time sync | Declared edges/clock records only; bounds add along paths; cycles flagged; proposals never auto-applied; lone source is its own clock | real |
| Reconstruction | Scenarios (immutable assumptions), canonical append-only events, 6 comparison rules, 1 inference rule, gap records, trajectories (image; ground plane only if calibrated), stored summaries | rule-based |
| V2 additions | Source annotations, per-camera tracking, overlaps, uncertain cross-camera associations (no probability), completeness, hypotheses with alternatives, storyboard, incident time/location, report list `format`, Featherless citation checks | real |
| Reports | 16-section full export and an executive (investigator) format; validator rejects fault language; PDF only if valid | real |
| Synthetic demo | 4 generated scenarios with exact ground truth, loader, seed and evaluation scripts | **synthetic**, labelled |

## 4. Frontend (`frontend/`, React 18 + Vite + Tailwind + copied UI kit)
Five-page shell: **Dashboard, Cases, Evidence, Reconstruction, Reports**, plus Landing and a guided New-investigation flow (details, upload with per-source metadata, live job stages, build). Reconstruction workspace: video with real detection overlays and one player clock (video-owned, latest-wins seeking, rAF-driven playhead), source switching, scrubber with event ticks, timeline with lanes/gap lane/finding band, summary-first overview, structured findings (observed / reported / inferred / unknown), technical drill-down, evidence drawers (exact frame, statement span, sensor rows), storyboard before/during/after, associations form, completeness, hypotheses, sensor column mapping, command palette, rounded themed shell, styled upload pickers. Real vs synthetic: badges everywhere, MIXED warning if a case mixes them.

## 5. Tests and checks (last run on `main`)
Frontend 133 passed / 0 failed, build passes. Backend 267 passed / 3 skipped / 0 failed. Live API audit 386/387 (the one failure is an intentional real-case-with-synthetic-upload scratch case). Mutation checks were done on the earlier engine and frontend logic.

## 6. Measured results (all small samples)
- Synthetic scenarios (oracle boxes): all pre-registered rule outcomes met; contact timing error 10-30 ms (sensor), 220-240 ms (video, limited by 5 fps); sensor braking onset 0-30 ms.
- Real detector on the synthetic renders: **0 objects** (not photographic), so synthetic video cannot stand in for real footage.
- Real clip (ACCIDENT benchmark t-bone, CC BY-NC-SA): detection, tracking, events, overlays, seek (0 ms error on 22 events) and 3 s of playback sync (<=17 ms) verified. The earlier engine flagged 1028 events on it; the V2 backend reduces that to ~140, but the UI still groups many "possible contact" candidates because overlapping boxes are common in a busy scene.

## 7. What does NOT exist or is not proven
- Detector/tracker accuracy on labelled real footage (BDD100K was unavailable); rule thresholds are untuned heuristics.
- A complete-evidence demo (synced second camera + sensor + witness). Only incomplete evidence is demonstrated.
- A live Featherless call in the pipeline; the key was exposed in chat and should be rotated.
- Wall-clock times per event, map/geolocation, vehicle make/model/plate (deliberately not built).
- `visually_supported_contact` is never emitted; a possible collision is amber only.
- Firefox/Safari, rotated video, touch gestures, automated browser (Playwright) tests.
- Auth/users (an `X-Actor` header only), deployment, backups.
- Licences: the accident model's repo and the UI kit have no licence file; demo clips are CC BY-NC-SA (non-commercial).

## 8. Known issues to decide on
1. Backend accepts synthetic uploads into a real case (UI warns only).
2. `completeness.defensible` is true for a one-camera case with missing calibration and unconfirmed identities.
3. Full report lists every event (very long on busy clips).
4. Dashboard fans out per case for jobs/findings; no activity endpoint; event significance and the case overview are computed in the browser.
5. The `code` field doubles as the user reference.
6. Dev database contains many audit/scratch cases (cannot be deleted through the API).

## 9. Where to change things
| Goal | Files |
|---|---|
| Rule thresholds / candidate noise | `backend/app/services/video_events.py`, `engine_rules.py` |
| Plain-language wording of findings | `frontend/src/lib/overview.js` |
| Contract between the two sides | `docs/INTEGRATION_CONTRACT.md`, `docs/FRONTEND_V2_BACKEND_NEEDS.md` |
| Detector/tracker settings and weights | `backend/app/config.py`, `backend/models.lock.json`, `scripts/fetch_models.py` |
| Workspace layout and player | `frontend/src/pages/Workspace.jsx`, `components/Player.jsx`, `Timeline.jsx` |
| Reports | `backend/app/services/report.py`, `frontend/src/pages/Report.jsx` |
| Demo data | `backend/scenarios/`, `backend/scripts/seed_demo.py` |

## 10. Run it
`./run.sh` (API :8000 + web :5173; needs PostgreSQL and `alembic upgrade head`). Tests: `cd backend && .venv/bin/python -m pytest -q`; `cd frontend && npx vitest run`; live audit `node frontend/audit/api-audit.mjs`. Key docs: `FINAL_FRONTEND_V2_AUDIT.md`, `FINAL_V2_AUDIT.md`, `RISKS_AND_LIMITATIONS.md`, `IMPLEMENTATION_ROADMAP.md`.
