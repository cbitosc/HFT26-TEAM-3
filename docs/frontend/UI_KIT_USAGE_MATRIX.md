# UI_KIT_USAGE_MATRIX

Every export of `frontend/src/ui-kit/index.js` (copied from `sanjivinsmoke95/ui-kit`, branch `ui-upgrade`) and where it is used after the redesign. Status: **Used**, **Deferred** (fits, not built yet) or **N/A** (does not fit the product). Pages: Landing (L), Dashboard (D), New investigation (N), Workspace (W), Report (R), App frame (F = `layout.jsx`, wraps D, N, W, R).

| Component | Status | Where | Notes |
|---|---|---|---|
| `AppShell` | Used | F | skip link, sidebar offset, content column; `wide` content on the workspace |
| `Sidebar`, `Brand` | Used | F | primary nav + "New investigation" action |
| `Topbar` | Used | F | breadcrumbs, search trigger, theme switcher, page actions |
| `MobileNav` | Used | F | bottom tab bar below `lg` |
| `PageHeader` | Used | D | accent on last word |
| `Breadcrumb` | Used | F (via `Topbar`) | |
| `CommandPaletteProvider`, `useCommandPalette` | Used | F | ⌘/Ctrl+K: jump to real cases, reports, actions (case list from the API) |
| `ThemeProvider`, `ThemeSwitcher`, `useTheme` | Used | root, F | Graphite is the default forensic theme |
| `ToastProvider`, `useToast` | Used | W (`Findings` review save success/failure) | |
| `Card`, `SectionHeader` | Used | D, W, N, R | every panel |
| `StatCard`, `StatGroup` | Used | D | five real metrics; `AnimatedValue` is inside `StatCard` |
| `Button`, `IconButton` | Used | everywhere | including `as={Link}`/`as="a"` |
| `Badge`, `StatusBadge` | Used | D, W, drawers | `StatusBadge` for queue job state |
| `Alert` | Used | D, W, N, R, drawers | synthetic-data notice, errors |
| `Tabs` | Used | W (Summary / Findings / Evidence) | |
| `Segmented` | Used | W (speed, finding kind, trajectory frame) | |
| `FilterChips` | Used | W (`Timeline` category filter, with counts) | |
| `DataTable` | Used | D (cases, evidence), W (`SensorDrawer` rows) | `renderMobileRow` on dashboard tables |
| `Drawer` | Used | W (`FrameDrawer`, `StatementDrawer`, `SensorDrawer`) | the evidence trail |
| `Field`, `Input`, `Select`, `Textarea`, `Checkbox` | Used | N, D (quick create), W (scenario, overlays) | |
| `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton` | Used | D, W, Findings, drawers | |
| `ProgressBar` | Used | D (processing queue) | value is the job's own `progress` |
| `ActivityTimeline` | Used | D (latest activity) | from real job/evidence timestamps |
| `timeAgo` | Used | D | |
| `useElementWidth` | Used | W (`Timeline`) | crisp un-scaled SVG text |
| `Link`, `LinkProvider` | Used | root | React Router bridge |
| `Brand`, `LandingNav`, `LandingHero`, `AppWindow`, `GradientText`, `FeatureGrid`, `StepList`, `CompareColumns`, `CtaBand`, `SiteFooter`, `SectionHeading`, `LandingSection` | Used | L | hero embeds the real timeline from the API |
| `LandingPage`, `FaqList`, `PricingTable` | N/A | | no pricing; FAQ not needed for the hackathon |
| `Modal`, `ConfirmationDialog`, `ConfirmDialog` | Deferred | | no destructive action exists in the UI yet; use for "dispute finding" confirmation if wanted |
| `Tooltip` | Deferred | | `IconButton` already provides tooltips; SVG markers use native `<title>` |
| `HistoryList` | N/A | | the dashboard feed is `ActivityTimeline`; `HistoryList` needs deletable user history |
| `LineChart`, `ChartLegend`, `Sparkline`, `BarChart`, `DonutChart`, `GaugeChart`, `GapChart`, `ProgressChart`, `ComparisonView` | Deferred / N/A | | `LineChart` spaces points by sample index, so a sensor gap would be hidden; the sensor and trajectory charts are bespoke SVG on a true time axis. `ComparisonView` could present contradiction A-vs-B later |
| `Pagination` | N/A | | lists are short; add with server paging |
| `ItemCard`, `MetricCard`, `Pill`, `Avatar`, `FileGlyph`, `Banner`, `Chip`, `LevelBadge`, `PriorityBars`, `TagInput`, `Section`, `SkeletonRows`, `Toggle`, `SearchBox`, `ResultCard`, `Highlight`, `Marquee`, `RevealText`, `RotatingText`, `SpotlightCard`, `InteractiveBackground`, `BurstToggle`, `TimeTracker`, `Dropdown`, `Viz` | N/A / Deferred | | decorative or not matched to a screen; `Highlight` highlights query words, not character spans, so statement spans use `<mark>` |
| `useHotkey`, `useOverlay` | Deferred | | hotkeys are handled by the workspace keyboard layer (needs event-level checks for inputs) |

## What is custom and why
`Timeline`, `Scrubber`, `Trajectory`, `Sensor` charts, the canvas overlay and the player controls are bespoke because no kit component models a multi-lane interval timeline on a true time axis, a seek bar with event ticks, a trajectory plot or video overlays. They use kit tokens (`--accent`, `--line`, `--surface-2`, …) and kit controls (`Button`, `IconButton`, `Segmented`, `FilterChips`).
`<details>` is used for explanations and the unplaced-events list (no kit disclosure component).
