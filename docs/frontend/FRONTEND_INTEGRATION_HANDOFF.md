# FRONTEND_INTEGRATION_HANDOFF

For Cursor (backend/CV/real video). Frontend commit on branch `claude/frontend-contract`. Contract: `docs/INTEGRATION_CONTRACT.md` (unchanged fields).

## Files changed (frontend only)
`frontend/src/`: `layout.jsx` (new app frame), `store.js` (selectors-only clock, latest-wins seek, pinned selection), `hooks.js`, `lib/{time,active,overlay,seek}.js` (+ tests), `components/{Player,Scrubber,TimeReadout,Timeline,SummaryPanel,EvidenceDrawers,DesignationBadge,Findings,Evidence,Sensor,Trajectory}.jsx`, `pages/{Dashboard,Workspace,NewCase,Report}.jsx`, `api.js` (added `event`, `frames`, `statement(s)`, `fullFrameUrl`, ranged `sensorRecords`), tests, `vitest.config.js`, `package.json`. Docs under `docs/frontend/`.

## Endpoints consumed (all exist today; none invented)
cases, dashboard, evidence, actors, scenarios, timeline, events/{id}, events/{id}/summary, contradictions, corroborations, gaps, findings (+PATCH), trajectories, seek, overlays, frames, frames/{id}/image, sensor-records, witnesses/statements/claims, jobs, upload, reports.

## Timestamp usage (matches the contract)
- Player shows **case** and **media** time, labelled; sensor drawer shows **sensor** time. Wall-clock is never displayed.
- Timeline/scrubber use `start_ms/end_ms/span_ms` (case_ms) only; events with `start_ms=null` are listed as unplaced.
- Overlays: `time_ms` (media_ms) compared with `video.currentTime`; a box is drawn only if a stored sample is within 350 ms; never interpolated.
- Per-source shift comes from `GET /seek?case_ms=0` (`media = case + media_ms@0`); sources missing from `targets` are not slaved.

## Needed from the backend (requests; none is a change to an existing field)
1. **Real-video events.** When a real clip is processed the workspace needs `vehicle_*` / `possible_collision` events with `observations.source_time_ms`, plus detections/tracks. The UI already shows whatever arrives; it fabricates nothing. For a single video, the video is its own case clock (implemented).
2. **Audit/activity endpoint** (e.g. `GET /activity?limit=`): the dashboard's "Latest activity" is currently derived from job `finished_at` and evidence `uploaded_at`.
3. **Cross-case jobs and findings** (`GET /jobs?status=active`, `GET /findings?review_status=unreviewed`): the dashboard fans out one request per case (first 12 / 4).
4. **Job `progress` semantics** (0..1 within stage?) and a stage label; the queue shows `progress` as reported.
5. **Event→source rows:** sensor events expose only `observations.source_time_ms`; the UI queries rows by that window. A `source_ref.rows` range on the event would make "open original sensor rows" exact.
6. **Frame lookup by time:** the UI uses `GET /frames?from_ms&to_ms&sampled=false` and picks the nearest; an endpoint returning the nearest frame would be simpler.

## How to verify together
`./run.sh`, open `/dashboard`; seeded synthetic cases are labelled SYNTHETIC. Upload a real clip on `/new` (declare it real): the workspace should show its tracks/detections as boxes and events on the timeline. If detections exist but no events do, the UI shows an empty timeline rather than inventing events.

## Not done / follow-ups
Playwright smoke tests; resizable panes; pinch zoom; profiling playback at 60 fps with many boxes; `Modal` confirm for disputing a finding.
