# Final frontend V2 audit

Branch `feat/traceline-investigation-flow-v2-frontend`, merged with backend `8e5cedc` (migration `0010`: case incident fields, report list `format`, storyboard) and with the final-audit UI fixes (`92e03a7`). Files changed are under `frontend/` and `docs/` only. `backend/` was not edited by this branch; the only backend files present are the ones merged in from the backend branch.

## What was built

| Phase | Result |
|---|---|
| 2. Shell | One shell with exactly five sections: Dashboard, Cases, Evidence, Reconstruction, Reports. The selected case is remembered (`traceline.selectedCase`), shown in the sidebar and applied to bare `/evidence`, `/reconstruction`, `/reports` routes. With no remembered case those routes ask the user to pick one. Legacy `/cases/:id` and `/cases/:id/report` redirect. Responsive: sidebar, mobile nav, short-viewport workspace rules kept. Palette is navy and graphite with cyan and teal accents. |
| 3. Landing, create, upload, processing | Landing copy "Reconstruct the incident. Understand what happened." with Start Investigation and View Demo (disabled with an explanation when no demo case exists). Create investigation: title, incident date and time, location, description, optional reference, real or synthetic. Upload accepts several videos; each has camera name, camera type (CCTV, dashcam, other), location text, recording start and end, timezone, clock offset and stated uncertainty. Processing lists only the stages the API returns, with the API's progress. |
| 8. Reconstruction workspace | Order: video, incident summary, vehicles, key observations, keyframe gallery, chronological timeline, contradictions and gaps, reconstruction scenarios, technical details (closed). Camera filter (shown for two or more videos), recording gaps, cross-camera association cards, sensor panel, an Event tab with real frames before, during and after the selected event. The single player clock and the audit layout fixes are untouched. Trajectories stay in the closed technical details. |
| 9. Reports | Executive and Technical tabs, preview, generate, history, PDF link only when the report has a validated PDF. Executive maps to the backend `investigator` format and Technical to `full`. |
| Dashboard | Metrics are the backend's own numbers. Empty states replace decoration. |
| Cases | Search, data-type and status filters, sort, grid and table, create, edit title and status. Designation cannot be edited. |
| Evidence | Grid and table, preview, stored source details, hash and provenance, validation, job stages, synchronization state, offset to another source, witness statements, sensor status. |

## Storage of what the investigator enters

| Value | Stored |
|---|---|
| Title, description, reference (as `code`), designation | Backend, `POST /cases`, `PATCH /cases/{id}` |
| **Incident date and time** | Backend `incident_at`. The form sends it only with a **time zone offset the investigator chooses** (starts at the browser's offset, shown); without one the backend would answer 422 `INCIDENT_TIMEZONE_REQUIRED`, so the UI never sends a bare time. The stored value is shown with its own offset, never converted. |
| **Incident location** | Backend `location_text`, free text, no map. `incident_at_note` from the backend is shown as the tooltip. |
| Camera name/type, location text, recording start/end, timezone | Backend, `PATCH /evidence/{id}/source` |
| Start time with timezone, clock offset, stated uncertainty | Backend, `PUT /evidence/{id}/clock` (`declared_by_investigator`) |
| Offset to another source | Backend, `PATCH /evidence/{id}/source` |

The earlier "kept only in this browser" storage and notice were removed (`LocalCaseMeta`, `lib/caseMeta`).

## Backend fields now wired
- Reports list reads `format` (`executive` | `full`); no report detail is fetched to find the type (a test asserts `reportById` is not called).
- `GET /cases/{id}/storyboard` feeds the Event tab's before / during / after. `before` and `after` are the backend's nearest stored samples on the same file, `during` the cited or in-interval samples. A missing frame is an empty slot ("No stored frame before this event on this file"), omitted events say why (`no_source_time`, ...), and the strips are never interleaved across cameras. The old client-side 1.5 s window was removed.
- Case create, edit (Cases page) and the workspace header use `incident_at` / `location_text`.
- Verified rendering from the live API (two-camera and one-video real cases): associations (none stored, shown as not established, no probability), completeness (one video: stored reasons and gaps; two unsynchronized cameras: "Insufficient evidence", `no_placed_evidence`, `sources_unsynchronized`), `evidence_class`, event `clocks` (wall clock `null` -> Not established), `trace`, `overlaps` (none: "No two placed sources overlap"), `hypotheses` (none: "Insufficient evidence to propose one"), and the narrative `hypothesis_explanation` note. No "Not available from this backend build yet" state remains for anything the backend serves.

## Honest states

Missing data is shown as Not established, Unavailable or Insufficient evidence. Nothing computes a likelihood; hypotheses are labelled as hypotheses with their alternatives and no percentage (asserted in tests). Synthetic data never appears inside a real case: a real case containing a synthetic file shows MIXED with a warning naming the file.

## Tests (final)

| Suite | Result |
|---|---|
| Frontend `npx vitest run` | **9 files, 133 tests, 133 passed, 0 failed** |
| Frontend `npx vite build` | succeeded |
| Backend `pytest` from `backend/` (read only, local checkout with scenario packages) | **267 passed, 3 skipped, 0 failed**. Cursor's run reported 251 passed / 19 skipped because the scenario packages and some fixtures were absent there. |
| API integration audit `node frontend/audit/api-audit.mjs` against the live API | 387 checks, 386 passed, **1 failed**: `TL-E2B0F7` (a deliberate scratch case: a `real` case with a synthetic upload). The failure is the backend gap in `FRONTEND_V2_BACKEND_NEEDS.md` #1, not a frontend fault. |

Tests added or changed this round: incident time with offset (`lib.test.js`, `NewCase.test.jsx`: sent with the chosen offset, omitted when empty, no local storage), report list `format` without detail reads (`App.test.jsx`), storyboard frames, empty slots, omitted events and failure (`Workspace.test.jsx`).

## Screenshots

Headless Chrome 156 against the Vite dev server and the live V2 API, `docs/frontend-v2/screenshots/`, each at `-1366x768`, `-1440x900`, `-1920x1080`:

| Prefix | Page |
|---|---|
| `dashboard`, `cases`, `guided-flow-new` | Dashboard, Cases, guided flow step 1 |
| `one-video-evidence`, `one-video-reconstruction`, `one-video-reports` | One real video, incomplete evidence (an equivalent of TL-C30DD7 built here: the same ACCIDENT clip, case `TL-ECE21F`, with incident time and location set) |
| `two-camera-evidence`, `two-camera-reconstruction` | Two real cameras with no clock relation (an equivalent of TL-395130 built here, case `TL-3D7B3E`) |
| older prefixes (`evidence-TL-C30DD7`, `reconstruction-TL-C30DD7`, `reports-TL-C30DD7`, `evidence-two-camera`, `reconstruction-two-camera`, `landing`, `guided-details`) | Earlier captures kept as they were |

`TL-C30DD7` and `TL-395130` exist only in the other developer's local database; they are not in this one, so the new shots use equivalent cases created here (the same published clips). The cases are labelled "V2 audit" in the dashboard.

## Browsers actually run
Google Chrome 156 (headless for screenshots) and the in-app Chromium browser pane (interactive checks). **Firefox and Safari were not run** and are not claimed.

## Limitations
- No complete-evidence case exists (a synced second camera plus a sensor file plus a witness statement). The screenshots show incomplete evidence and unsynchronized cameras; none is faked.
- Featherless: the UI shows the stored narrative status; no live model call was made.
- `visually_supported_contact` is never emitted by the current video rules, so a possible collision is amber only.
- The V2 scenario tests use synthetic fixtures; only the selected-clip test used real footage. On the real clip the rules still flag many candidates; the UI groups them and says none is confirmed.
- The one-video case's `completeness.defensible` is `true` (backend flag, shown as stored) despite missing calibration, unconfirmed identities and fragmented tracks; see `FRONTEND_V2_BACKEND_NEEDS.md` #2.
- Rotated video, touch scrubbing and the live upload-then-clock sequence in a browser were not tested. The browser pane was also being driven by another session during checks; a separate tab was used.
- A source offset applies only to the next scenario build.
