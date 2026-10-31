# UI_DESIGN_SYSTEM

Direction: **a premium forensic intelligence workstation.** It should be dark, precise and dense but readable, with restrained motion and colour used for meaning. It is built on the UI kit's token system and components (UI_STARTER_KIT_AUDIT).

## 1. Theme: `forensic` (an app-level theme on the kit's token contract)
Defined in the app's CSS as `[data-theme='forensic']`, using the kit's token names so every kit component adapts. Values below are starting points; the kit's contrast test approach is reused to verify WCAG AA for text tokens before adoption.

| Kit token | Value | Role |
|---|---|---|
| `--bg` | `9 13 20` (#090D14) | App background |
| `--surface` | `16 23 34` (#101722) | Panels |
| `--surface-2` | `21 31 45` (#151F2D) | Elevated panels, hover |
| `--line` | `38 50 68` (#263244) | Borders, rulers |
| `--fg` | `242 245 249` (#F2F5F9) | Primary text |
| `--fg-2` | `145 160 181` (#91A0B5) | Secondary text |
| `--fg-3` | to be set ≥ 4.5:1 on `--surface` | Tertiary text (verified by test) |
| `--accent` | `66 189 235` (#42BDEB) | Selection, playhead, evidence links |
| `--warning` | `242 184 75` (#F2B84B) | Quality warnings, needs review |
| `--danger` | `229 107 111` (#E56B6F) | Potential contradictions |
| `--success` | `66 201 154` (#42C99A) | Corroboration ("consistent with") |

Domain semantic tokens (new, app-level):
- `--src-video` = accent (cyan)
- `--src-witness` = sem-purple
- `--src-sensor` = sem-teal
- `--src-vlm` = sem-blue
- `--cat-inference` = fg-3, rendered dashed
- `--uncertainty` = accent at 15% fill

Colour is never the only signal. Every category also has an icon (lucide) and a shape or line style.

## 2. Category encoding (used everywhere: timeline, cards, summaries, trajectory)

| Category | Marker | Line style | Icon | Label wording |
|---|---|---|---|---|
| Direct observation | Filled square | Solid | `Gauge` (sensor) / `FileText` | "Recorded" |
| Machine detection | Filled circle | Solid | `ScanSearch` | "Detected" + model |
| Witness claim | Hollow circle | Solid | `MessageSquareQuote` | "Reported by W…" |
| Inference | Hollow diamond | Dashed | `Sparkles` | "Possible (inferred)" |
| Contradiction | Red bracket joining two markers | Dotted | `GitCompareArrows` | "Potential contradiction" |
| Corroboration | Green bracket | Solid | `Link2` | "Consistent with" / "Independently supported" |
| Gap | Hatched band | — | `Unplug` | "No evidence for t1–t2" |

## 3. Typography
- UI: **Inter** (`@fontsource-variable/inter`, already in the kit).
- Technical text (timestamps, IDs, telemetry, frame numbers): **JetBrains Mono** (`@fontsource-variable/jetbrains-mono`) with `font-variant-numeric: tabular-nums`. Set through the kit's `--font-mono`.
- Display headings (landing only): Inter at heavier weight, sentence case. The kit's uppercase display transform is turned off for this theme (`--display-transform: none`).
- Scale: 12 / 13 / 14 (base workspace) / 16 / 20 / 28 / 40 / 56 (landing hero).
- Timestamp format: `00:00:07.800`, plus `±200 ms` in fg-2 and the sync group shown as a small chip when there is more than one.

## 4. Spacing, radius, elevation
- 4-px grid; workspace gutters 12 px; landing sections 96–128 px vertical.
- Radius: workspace panels 10 px, controls 8 px, chips full. The kit's 24-px card radius is used on the landing page only.
- Elevation through surface steps and 1-px `line` borders, not heavy shadows. A soft cyan glow is used only on the landing hero preview and the active playhead.

## 5. Motion (Framer Motion; kit timing tokens)
| Interaction | Motion |
|---|---|
| Event selection | Active marker scales 1 → 1.15, ring fades in (150 ms); previous ring fades out |
| Summary change | Cross-fade + 8 px slide, keyed by event ID (200 ms); no animation during continuous playback updates within the same event |
| Panel open/close | Width/height spring (stiffness ~400, damping ~40) |
| Playhead | Position written directly (transform) from the rAF loop; never through React state per frame |
| Lists | Layout animation on filter changes only |
| Loading | Kit `Skeleton` |

`prefers-reduced-motion`: transitions become instant fades of 0–100 ms.

## 6. Layout system
- **Workspace (≥1280 px):** a 12-column grid.
  - Left rail (evidence sources) 280 px, collapsible to 56 px.
  - Centre (player + timeline) fills the remainder; the player keeps the source aspect ratio and the timeline sits below at 180–260 px, resizable.
  - Right panel (incident summary + findings) 380 px, collapsible.
  - Bottom drawer (trajectory + telemetry) 260–420 px, collapsible.
- **Tablet (768–1279 px):** two columns (player + timeline | tabbed side panel: Evidence / Summary / Findings); trajectory in a tab.
- **Mobile (<768 px):** stacked. Full-width player; compact timeline as a horizontally scrollable strip with snap points; summary as a bottom sheet (kit `Drawer`, side bottom); evidence and findings as tabs.

## 7. Components (domain, built on kit primitives)
`InvestigationWorkspace`, `ForensicVideoPlayer` (native `<video>` + canvas `VehicleTrackOverlay`), `InvestigationTimeline` (SVG ruler + lanes + `TimelineEvent` markers), `IncidentSummaryPanel`, `EventExplorer` (cards with `FilterChips`), `EvidenceInspector` (kit `Drawer` + `Highlight` for spans + `DataTable` for rows), `TrajectoryViewer` (SVG), `SensorTelemetryPanel` (kit `LineChart`), `ContradictionCard`, `CorroborationCard`, `ScenarioSwitcher` (kit `Segmented`), `SourceSwitcher`, `OverlayToggles` (kit `Toggle`), `ShortcutHelp` (kit `Modal` + `useHotkey`), `SyntheticDataBanner` (kit `Banner`).

## 8. Content rules
- Wording: "Potential contradiction", "Consistent with", "Independently supported", "Requires verification", "Insufficient evidence".
- Never use "caused", "at fault", "guilty", or "proved".
- Every finding shows its source chips (e.g., `CCTV 02 · f234`, `Sensor · row 124`, `Witness A · "turned left…"`), and each chip opens the evidence inspector.
- Synthetic, staged, or demo data shows a persistent `SyntheticDataBanner` in the case header and a chip on each source.

## 9. Accessibility
- AA contrast for all text tokens, enforced by a test.
- Visible focus rings (kit style).
- All markers reachable by keyboard: the timeline is a listbox, with arrow keys moving between events.
- `aria-live="polite"` announces the active-event change only when it changes, not per frame.
- The player's controls have labels.
- Shortcuts are ignored while focus is in a text input (kit `useHotkey` with a guard).
