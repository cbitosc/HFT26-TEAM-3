# FRONTEND_TEST_REPORT

Branch `claude/frontend-contract`. Backend: Cursor-owned; **not modified**. Data: seeded synthetic demo cases through the real API (no mock data in the app).

## Automated (vitest + Testing Library, jsdom)
`cd frontend && npm test` → **28 tests, 28 passed, 0 failed**; `npm run build` passes.
| Area | Tests |
|---|---|
| Timestamp formatting | MM:SS.mmm padding, hours from 1 h, null/NaN never invented, negative, basis labels, ruler steps and tick precision |
| Active-event selection | latest-started covering event, gaps → null, uncertainty+tail bounds, explicit selection pin |
| Overlay coordinate mapping | letterbox, pillarbox, latest sample only (no interpolation), jitter tolerance |
| Latest-wins seeking | ids increase, only the newest ack settles, stale ack ignored (state and store) |
| Timeline | marker click and keyboard selection, pressed state, unplaced events listed not drawn, category filter, gap band tooltip uses case-clock times, **playhead follows the store through the DOM** |
| Summary | late response for a previous event is ignored; error state |
| Drawers | regression: closing a drawer after use does not crash (a real bug found in browser testing) |
| Badges / states | real vs synthetic vs mixed text badges; dashboard empty, error, and populated (queue shows only active jobs) |
Mutation checks (break behaviour, confirm a test fails, restore): honouring stale seek acks → fails; playhead not following the store → fails; allowing a stale summary → fails.

## Browser (in-app browser, live API + seeded cases)
| Check | Result |
|---|---|
| Console errors during a broad interaction run (tabs, review, filters, play/pause, ⌘K palette, event select) | none |
| Select an event on the timeline | video seeks both sources (case 4.600 → CCTV media 4.600, dashcam 3.600 via the recorded 1.000 s offset), summary changes, marker pressed |
| Rapid scrubbing (5 requests in 150 ms) | ends on the newest target; no stuck "seeking" state |
| Play 2.5 s | case clock advances, slave video follows, active event changes during playback (to "Vehicle A appears to stop") |
| Frame step | ±1 frame = 100 ms (measured fps) |
| Evidence trail | event → exact frame (frame #46, 2 stored boxes drawn); witness claim → original statement with both claim spans, selected one emphasised; sensor event → 51 original rows; drawers reopen after closing |
| Horizontal overflow | none at 375 px on landing, dashboard (fixed; evidence table overflowed), workspace, report, new-investigation; none at ~1140 and 1500 px |
| Layout | three-column workstation ≥1280 px; stacked below; secondary video below the main one until 2xl |
Not measured: frame-rate/jank profile (no profiler run), Safari/Firefox, touch gestures on the scrubber, real-video overlays (needs Cursor's real detections), long-running playback drift.

## Defects found and fixed during testing
1. Dashboard overflowed horizontally on phones (grid item min-content from the evidence table) → `min-w-0`, scroller, mobile rows.
2. Closing a drawer after use threw (`event` undefined) and blanked the workspace → guarded, regression test.
3. (Earlier) Upload polling used non-existent job statuses.

## Known limitations
No automated browser (Playwright) tests; scrubber drag not touch-tested; `Timeline` zoom/pan is mouse/button driven (no pinch); the activity feed is derived from job and upload times because no audit endpoint exists; `HH:MM.mmm` in the brief is implemented as `MM:SS.mmm` (see audit).
