# Final frontend audit

Two records are kept. They were written on different branches and were not re-run as one pass when `origin/claude/final-audit` was merged into `feat/traceline-investigation-flow-v2`. A number in one record is that record's measurement only.

## Record A — `cursor/real-video-pipeline-c915`

Date: 2026-10-30. Written on the pipeline branch before the incident-list commit and before this merge. The shell, dashboard, and workstation redesign were not replaced. Frontend edits in that pass were the report buttons, the short-viewport timeline, and a cap on the video stage so the timeline stays on screen.

### Browsers

| Browser | Tested | Version | Result |
|---|---|---|---|
| Chrome | Yes, headless, against the running app at `http://127.0.0.1:5173/cases/case_d255f851d423` | Google Chrome 156.0.8078.47 | Workspace loaded. Timeline lane, playhead, and ruler were visible at 1366×768, 1440×900, and 1920×1080. |
| Firefox | No | Not installed (`firefox` and `firefox-esr` are absent) | Not claimed. |
| Safari | No | Not installed. This machine is Linux. | Not claimed. |

Safari and Firefox were not launched. Nothing in this document is a claim that the player works in those browsers.

### Timeline

Checked in Chrome only, on the selected real case. At the time of that check the stored timeline still had 1,093 events. That count is the pre-rebuild timeline. It is not a claim about the current database.

| Viewport | What was visible |
|---|---|
| 1366×768 | Video, transport, and the timeline card. The CCTV lane, playhead, and ruler were in the viewport. Category chips sit on one scrolling row; the first chip after All can be clipped until that row is scrolled. |
| 1440×900 | Same. The CCTV lane and ruler were visible under the player. |
| 1920×1080 | All five category chips, zoom controls, the CCTV lane, the playhead, and the legend were visible. |

Below 1100px of viewport height the center column keeps the timeline card and scrolls the video card inside itself. The right-hand inspector still scrolls internally. This is not a new visual design.

### Player and boxes

The player still maps boxes with the element `videoWidth` and `videoHeight`. That matches detections when `/stream` is the upright frame. The selected clip's local playback copy was remuxed to 2392×1352 so it matches that file's detections. The copy is not in git. Overlay alignment was not re-measured pixel by pixel in the browser after the remux.

### Report page

Generate report asks for the investigator format. Full export asks for the 16-section dossier. See `docs/REPORT_FORMAT.md`.

## Record B — `claude/final-audit`

Written on `claude/final-audit` against `main`. The pipeline branch was not merged into that audit and was not the backend under test. Later pipeline commits changed synthetic rejection, report size, rotation, and the workspace. Those later changes are listed after this record. The measurements below were not repeated on this merge.

Backend files were not modified by that audit. Real clip: ACCIDENT benchmark t-bone (CC BY-NC-SA), uploaded through the live API as a `real` case.

### Test results

- Frontend unit/component tests: **50 passed, 0 failed** (`npm test`); production build passes.
- API integration audit `node frontend/audit/api-audit.mjs`: **165 checks passed, 0 failed** across 6 cases (4 synthetic demos, 2 real clips) before the final extra cases were added; covers dashboard totals, stream range support, event ids/sources/spans, case-to-media time mapping for every video and sensor event, overlay boxes == stored detections (same time and bbox), track ids == stored tracks, findings/contradictions/corroborations/gap references, summaries, and report content vs the case (code, scenario, evidence, counts, synthetic label).
- Browser (live): on the real clip, 69/69 overlay boxes drawn on the canvas at the mapped positions at 6 seek times; 22/22 timeline events seek to exactly their own media time (0 ms error); 3 s of playback kept video, case readout and media readout within 17 ms (rate 1.01); 30 rapid scrubs ended on the last target with no stuck "seeking"; report page generated v3 for the right case (code TL-CCDBD7, "contains no synthetic data", validation passed).

### Checklist

| # | Item | Result |
|---|---|---|
| 1 | Dashboard shows real case info | Pass (totals equal API) |
| 2 | Correct uploaded video | Pass (stream is the case's evidence; 206 ranges) |
| 3 | Detections at correct timestamps | Pass (boxes == stored detections; non-square-pixel bug fixed, see below) |
| 4 | Track ids match backend | Pass |
| 5 | Timeline markers from backend events | Pass |
| 6 | Event selection seeks correctly | Pass (0 ms error) |
| 7 | Playback/timeline sync | Pass |
| 8 | Summary from actual findings | Pass; fixed misleading output on busy real footage (below) |
| 9 | Findings link to evidence | Pass |
| 10 | Synthetic cannot leak into real | **Backend gap on `main` at that time**, mitigated in UI (below). Later pipeline commit `0e9ffed` rejects the upload. |
| 11 | Empty/failed states honest | Pass: corrupt upload rejected with message (tested), no-detection and no-event cases say so, no-evidence case does not crash |
| 12 | Report uses the selected case | Pass; see issue on size |

### Defects found and fixed in the frontend

1. **Real busy scene misled the summary:** 1028 events (903 `potential_interaction`) made "1012 key events", 88 findings and five near-identical "possible contact" cards. Now `potential_interaction` is not a key event, uncorroborated candidates of one type are grouped into one finding (all stay in Technical), the headline says "41 candidates flagged, most may be false alarms, none confirmed", unconfirmed vehicles are named by track id, scrubber ticks cluster.
2. **Box drift on non-square-pixel video** (1280x720 coded shown as 1280x723): overlay mapping now uses the API's coded size.
3. **Selecting an event changed nothing visible** in the Overview: added a "Selected moment" card with source buttons.
4. **Synthetic evidence in a `real` case:** on the backend they tested, the case stayed `designation: real`. The workspace shows MIXED plus a warning naming the files (tested).
5. Empty timeline now states why; layout compacted so video, scrubber, controls and summary fit at 1366x768 and the timeline starts in view at 1920x1080 (at 768-900 px height the timeline needs a scroll).

### API notes recorded by that audit

These were observations against `main`, not a contract change:

- That backend accepted synthetic uploads into a real case and did not derive `mixed`.
- Busy real footage yielded about 900 `potential_interaction` and about 85 collision/near-miss candidates.
- Report content listed every event (1028 entries, about 195 KB markdown) for the real clip.
- The pipeline branch says `video.width/height` are the coded grid and rotation is not applied to boxes: that UI handled non-square pixels but not rotated video (untested there).
- Still requested at that time: overview endpoint, activity feed, cross-case jobs/findings, per-event sensor row range.

### Known UI limits from that audit

- Headless-Chrome screenshots of video frames are timing dependent (one 1366 capture was black until retried); the in-app browser rendered video reliably.
- Timeline below the fold at 768-900 px height; box labels overlap on crowded scenes; no automated browser tests; rotated video, touch scrubbing and Safari/Firefox untested; the demo-case "unreviewed count" check is skipped for cases with several scenarios.
- Screenshots from that pass: `docs/frontend/screenshots/` (real clip at 1366x768, 1440x900, 1920x1080; demo case A; dashboard).

## Later pipeline commits, relative to Record B

- `0e9ffed` rejects a synthetic upload into a real case before staging, adds the investigator report as an opt-in format, and stops scaling or double-rotating playback.
- `3bbca88` adds the incident-event list, the deterministic narrative, and real extracted frames. Trajectories stay behind a closed Technical detail disclosure.

## This merge

`origin/claude/final-audit` (which already contains `claude/investigator-ux`) was merged into the pipeline tip. `claude/frontend-contract` had no commits that were not already in the pipeline, so it was not merged again.

Conflicts and how they were kept:

- `Player.jsx`: short-viewport `max-h` from the pipeline and the non-square `maxWidth` from the audit.
- `Timeline.jsx`: Key events / All events control from the audit, and the short-viewport nowrap chips from the pipeline.
- `Workspace.jsx`: audit navigation rail, overview, findings, and inspector, plus the incident overview, vehicles, keyframe gallery, and incident cards. The primary Trajectories panel stays closed inside Technical detail.
- This file: both audit records, labeled by branch.

No new browser pass was run for the merge itself.
