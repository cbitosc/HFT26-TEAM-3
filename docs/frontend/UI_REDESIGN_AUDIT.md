# UI_REDESIGN_AUDIT

Audit of `frontend/` before the redesign (branch `claude/frontend-contract`, base commit 6254796). Method: read every page/component, the kit's `src/index.js` exports and the implementations of the layout, table, drawer, modal, chart and tab components, then exercised the running app in the in-app browser.

## 1. Kit components already used
`ThemeProvider`, `ToastProvider` (provided, never called), `LinkProvider`, `Button`, `IconButton`, `Card`, `Badge`, `Segmented`, `Tabs`, `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Alert`, `EmptyState`, `ErrorState`, `LoadingState`, `StatCard`, and on the landing page `LandingNav`, `LandingHero`, `FeatureGrid`, `StepList`, `CompareColumns`, `CtaBand`, `SiteFooter`, `AppWindow`, `GradientText`, `Brand`, `SectionHeading`, `LandingSection`.

## 2. Kit components not used (and should be)
`AppShell`, `Sidebar`, `Topbar`, `MobileNav`, `PageHeader`, `Breadcrumb`, `CommandPaletteProvider`/`useCommandPalette`, `ThemeSwitcher`, `DataTable`, `Drawer`, `Modal`/`ConfirmationDialog`, `ActivityTimeline`, `HistoryList`, `ProgressBar`, `Tooltip`, `Pill`, `StatusBadge`, `Sparkline`, `LineChart` (deliberately deferred, see matrix), `useToast`, `useHotkey`, `timeAgo`, `Highlight`, `SkeletonRows`, `Banner`, `Pagination`.

## 3. Defects found
### 3.1 Performance and architecture
- `Workspace` and `Player` subscribe to the **whole** Zustand store (`useWorkspace()`); the master video writes `currentMs` at ~30 Hz, so the whole workspace (timeline SVG with every event, trajectory, findings) re-renders 30 times a second.
- Each `VideoTile` runs a permanent `requestAnimationFrame` canvas loop even when paused or off-screen.
### 3.2 Timestamp bugs
- Three different formats: `clock()` = `MM:SS.cc` (2 decimals), `sec()` = `n.nn s`, timeline ticks = `n.ns`. Event times, uncertainty and the playhead disagree visually; milliseconds are not shown.
- `clock()` has no hour part and no distinction between media time and case time (labels say "case"/"media" but formatting is identical).
- The timeline ruler used a fixed 100 ms…5 s step list and rendered `(t/1000).toFixed(1)s`, so sub-second ticks at high zoom were mislabelled (`0.1s`, `0.2s`).
### 3.3 Playback synchronization
- **Seek is not latest-wins.** `seekRequest.id` is compared to a ref but the `seeked` event is never observed; a late seek completion cannot be told from the newest one.
- **Active event only follows the playhead while playing** (`&& ws.playing`), so scrubbing or clicking the timeline while paused leaves a stale summary. A leftover condition `ws.seekRequest.id < 0` is dead code.
- Selecting an event sets the active event, but the playhead-follow effect can immediately replace it with an overlapping event.
- The paused-sync effect rewrites `currentTime` on every `currentMs` change, which can fight an in-flight seek.
- Pause/play toggles all videos from one effect with stale `currentMs` (reads the value at effect time), so resuming near a source's boundary can start a slave that should stay paused.
### 3.4 Missing capabilities
No fullscreen, no source switching (both videos always shown at equal size), no event markers on the scrubber, no scrubber at all (seeking only through the timeline), no keyboard help.
Evidence trail incomplete: summary items have no link to the exact frame, a witness claim cannot be opened in its statement, a sensor event cannot be opened at its rows.
### 3.5 Layout and responsiveness
- Workspace is a two-column grid that collapses to one very long column below `xl` (1280 px): at tablet and phone widths the user scrolls past video, timeline, trajectory and sensor before reaching the summary.
- The timeline SVG scales as a single image: labels are ~4 px tall on a phone.
- Dashboard: four stat cards and a card grid; no queue, no activity, no review list, no search; header hand-built; the real/synthetic distinction is a small badge only.
- No app shell: every page builds its own header, so navigation is inconsistent and there is no command palette.
### 3.6 Duplicated or hand-rolled pieces to replace with kit components
Hand-built page headers (→ `PageHeader`, `Breadcrumb`, `Topbar`); hand-built evidence list (→ `DataTable`); `<details>` for unplaced events and for explanations (kept; no kit equivalent, see matrix); ad hoc status text for jobs (→ `ProgressBar`, `StatusBadge`); no toasts on review actions (→ `useToast`).
### 3.7 Contract mismatches
Upload polling used job statuses that do not exist (fixed in 6254796). `Evidence.jsx` fetches statements with raw `fetch`, bypassing `api.js`.

## 4. Redesign decisions
- **Shell:** kit `AppShell` + `Sidebar` + `Topbar` + `MobileNav` + `CommandPaletteProvider` on every app page; the workspace uses a full-width content column.
- **Time:** one module `lib/time.js`. Display format is `MM:SS.mmm` (`H:MM:SS.mmm` from one hour). The brief wrote "HH:MM.mmm"; hours-and-minutes would hide everything that matters for second-scale clips, so minutes:seconds.milliseconds is used and hours appear only when needed. Every readout declares its basis: **media**, **case**, **sensor**; wall-clock is never displayed because the backend does not return a trusted one.
- **Clock:** the video element owns the clock while playing; one rAF loop in the master tile writes `currentMs`; display-only consumers (playhead, scrubber, readouts) subscribe outside React and mutate DOM nodes; React-rendered consumers (trajectory, sensor, active event) read through a throttled selector.
- **Seek:** `requestSeek(ms)` returns an incrementing id; each `seeked` event acknowledges the id it was issued for; stale acknowledgements are ignored; only the newest request marks the seek settled.
- **Active event:** a pure function (`lib/active.js`) selects the event from `currentMs` at any time (playing, paused, scrubbing); an explicit selection pins the choice until the playhead moves away from the selected time.
- **Evidence trail:** frame, statement span and sensor rows open in kit `Drawer`s fed by existing endpoints only.
- **Stored summaries only:** nothing calls a model during playback.
