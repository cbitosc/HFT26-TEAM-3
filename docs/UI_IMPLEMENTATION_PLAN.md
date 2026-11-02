# UI_IMPLEMENTATION_PLAN

Status: **plan only.** The main project is at its architecture gate, so no UI code is written until approval. The UI is built after the backend APIs it needs exist (roadmap phase 12). Before that it is developed against **seeded, labelled synthetic API responses** that follow API_DESIGN.md exactly.

## 1. Project setup
- `frontend/`: Vite + React 18 (JS), Tailwind 3.4 with the UI kit preset, kit CSS and fonts, Framer Motion, React Router 6, lucide-react, Zustand.
- Kit as a pinned git dependency (UI_STARTER_KIT_AUDIT §1); `LinkProvider` bridges to React Router.
- `[data-theme='forensic']` added in the app stylesheet, plus a contrast test.
- API client: fetch wrapper with typed response guards; no secrets in the bundle (the backend proxies all AI calls).

## 2. Routes
| Route | Screen |
|---|---|
| `/` | Landing page |
| `/dashboard` | Investigation dashboard |
| `/cases` | Case list + create |
| `/cases/:caseId` | Case workspace (main screen) |
| `/cases/:caseId/evidence` | Evidence explorer |
| `/cases/:caseId/reconstruction` | Reconstruction workspace (timeline + trajectory + scenarios focus) |
| `/cases/:caseId/report` | Findings and report |

## 3. Landing page (kit landing blocks)
- `LandingNav`: logo, Platform, Capabilities, How it works, Technology, **Launch Workspace** → `/dashboard`. Anchors scroll smoothly.
- `LandingHero`:
  - Headline: "Every Second Matters. Reconstruct What Really Happened."
  - CTAs: "Launch Investigation Workspace" and "Explore the Platform".
  - `visual`: an `AppWindow` holding a **live mini-workspace**. This is the real `InvestigationTimeline`, `IncidentSummaryPanel`, and `TrajectoryViewer` rendered from the seeded demo case, with a looping clip and canvas boxes. It is an actual product render, not an illustration, and is labelled "Demo case · synthetic data".
- `FeatureGrid` (six capabilities), `StepList` (Upload → Extract → Correlate → Reconstruct), a large preview section, "Why this matters" (`CompareColumns`: fragmented evidence vs synchronized reconstruction), `CtaBand` ("Turn Fragmented Evidence Into a Clearer Timeline." / "Start an Investigation"), `SiteFooter`.
- No dead links: footer items without targets render as text (kit behaviour).

## 4. State architecture

```js
// store (Zustand)
{
  caseId, scenarioId,
  sources: {...},            // from API, with clock offsets
  activeSourceId,
  currentTimeMs,             // case time; written by the player rAF loop (throttled to ~30 Hz for subscribers)
  isPlaying, playbackRate,
  activeEventId,             // derived: changes only when currentTimeMs crosses an event interval boundary
  selectedActorId, selectedEvidenceId,
  overlaySettings: { boxes, ids, trajectories, markers, annotations },
  seekRequest: { id, timeMs, sourceId },   // latest-wins
}
```

- **Clock ownership:** while playing, the `<video>` is the clock. A rAF loop reads `video.currentTime`, maps it to case time with the source offset, and updates the playhead DOM (transform) directly. It writes `currentTimeMs` to the store at most ~30 times per second. Components subscribe with selectors, and only the playhead, canvas overlay, and trajectory playhead read `currentTimeMs`.
- **Seeking:** UI actions call `requestSeek(timeMs)`, which increments `seekRequest.id`. The player maps case time to video time, seeks, and on `seeked` checks that the ID is still the latest (stale seeks are ignored). This removes races when the user clicks rapidly.
- **Active event:** computed with a binary search over the sorted event intervals. A new value is written only when it changes, so the summary never flickers during playback.
- **Data:** events, summaries, tracks, and trajectories are fetched once per case and scenario and cached in memory with a keyed cache. Overlays are prefetched in windows (`/overlays?from_ms&to_ms`, 10 s chunks).
- **Unsynchronized sources:** time mapping returns `null`, and the UI shows "Not synchronized: set a clock offset" with a link to the sync dialog.

## 5. Workspace components and behaviour
| Component | Behaviour |
|---|---|
| `ForensicVideoPlayer` | Play/pause, seek, ±1 frame (uses frame times from `/frames`), rates 0.25–2×, fullscreen, source switcher, timestamp display (mono), toggles. Canvas overlay draws boxes and IDs for the current frame; the selected actor is highlighted with class and confidence |
| `InvestigationTimeline` | SVG time ruler with zoom (wheel/pinch, buttons), lanes per source and sync group, markers per category (UI_DESIGN_SYSTEM §2), contradiction and corroboration brackets, gap bands, playhead, filters (`FilterChips`), legend. Click → select event + seek; keyboard ←/→ between events |
| `IncidentSummaryPanel` | Reads the stored `/events/{id}/summary`. Sections: Observations, Detections, Witness claims, Sensor observations, Inferences, Involved entities, Supporting evidence (chips), Status, Uncertainty, Open questions. Animated by event ID. Actions: expand, open source, annotate, mark reviewed (PATCH) |
| `EventExplorer` | Cards with filters (type, vehicle, source, time range, status, contradiction, corroboration). Virtualized beyond 200 items |
| `TrajectoryViewer` | SVG: road or grid layer (from case geometry if any), paths per actor (solid = observed, dashed = interpolated or inferred, shaded = uncertainty, gaps marked), direction arrows, time ticks, playhead positions, candidate collision region only if provided by the API. A frame chip says "Image space: not to scale" or "Calibrated grid (mat units)". Clicking a segment opens its source frames |
| `SensorTelemetryPanel` | Kit `LineChart` for speed, acceleration, heading; anomaly markers; click → select the linked event and seek |
| `EvidenceInspector` (Drawer) | Video: seek + frame + highlighted detection. Witness: full statement with `Highlight` on the claim span. Sensor: `DataTable` rows around the referenced rows |
| `ContradictionCard` / `CorroborationCard` | Claim A vs claim B (`ComparisonView`), related observation, timestamps, references, explanation, independence note, open questions |
| `ScenarioSwitcher` | Baseline vs alternatives, with a "differs from baseline" diff list |

Keyboard: Space play/pause, ←/→ frame step (Shift = 1 s), ↑/↓ rate, `[`/`]` previous/next event, Esc closes expanded views, `?` opens the shortcut help. Inactive while typing.

## 6. Dashboard
Counts from `/dashboard`: total cases, active, processing jobs with progress, recent evidence, findings needing review, quick create. Empty states use kit `EmptyState`. No invented metrics.

## 7. Phases (mirrors the UI master prompt)
1. Kit inspection (done, audit).
2. Tokens, `forensic` theme, typography, contrast test.
3. Landing page.
4. App shell (`AppShell`, `Sidebar`, `Topbar`, `CommandPaletteProvider`) and dashboard.
5. Workspace layout (resizable and collapsible zones, responsive variants).
6. Video player + store + seek protocol.
7. Interactive timeline.
8. Incident summaries + event explorer.
9. Trajectory + telemetry.
10. Evidence inspector + findings.
11. Switch from seeded responses to the live API.
12. Motion, responsive, and accessibility polish.
13. End-to-end tests.

## 8. Testing
- Unit: time mapping, active-event binary search, latest-wins seek, category encodings.
- Component: timeline selection → store; summary keyed transitions.
- End-to-end in the browser pane:
  - landing at 1440 and 390 px;
  - the demo sequence (§9);
  - rapid clicks across ten events with no desync (the player time equals the selected event within one frame);
  - keyboard controls;
  - empty, loading, and error states;
  - no horizontal overflow and no console errors;
  - contrast checks.
- Performance:
  - React Profiler during 30 s of playback, with no summary re-renders within an event;
  - frame budget for the overlay canvas.

## 9. Demo sequence that must work live
Open the demo case → click "Possible collision" on the timeline → the video jumps to it, boxes appear, the summary switches → select vehicle A → its trajectory highlights → open the supporting CCTV frame → open the contradiction (Witness A vs Witness B vs CCTV track) → read why it was flagged → switch to the alternative scenario and see what changes.

## 10. Acceptance checklist
Every item in the UI prompt's quality bar (§24) must be answered "yes", with evidence from the end-to-end run, before the UI is called done.
