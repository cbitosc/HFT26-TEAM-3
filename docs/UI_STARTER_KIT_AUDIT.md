# UI_STARTER_KIT_AUDIT

Audit of the team's UI starter kit, inspected on 2026-10-30.
- **Repository:** `sanjivinsmoke95/ui-kit` (public). Local clone at `/Users/sanjivinsmoke/aac project/ui-kit`.
- **Branch:** `ui-upgrade` at commit `3e36d08`, pushed to origin. **Not merged into `main`**, so `main` lacks the upgraded components.
- **Package:** `@sanjivinsmoke95/ui-kit` 1.0.0, `private: true` (not published to npm).
- **Licence: none.** There is no LICENSE file and GitHub reports no licence. Since the team owns it, add one (e.g., MIT) before the hackathon repository depends on it, so the attribution required by the hackathon rules is clean.

## 1. Stack and how it is consumed
- React 18, Tailwind 3.4 (via `src/tailwind-preset.js`), framer-motion ≥11, lucide-react, clsx. JavaScript, not TypeScript. This is the same stack as the master prompt.
- Entry points: `./src/index.js`, `./styles.css` (`src/styles/kit.css`), `./fonts.css`, `./tailwind-preset`.
- **CLI:** `bin/ui-kit.mjs` with `list`, `init`, and `add` (dependency closure, `--dry-run`, `--force`) copies component source into a project.
- **No router dependency:** the kit uses its own `Link`/`LinkProvider` abstraction, so React Router plugs in through `LinkProvider`.
- Tests: `node --test "test/*.test.mjs"`. These cover colour contrast for every theme, tokens, the CLI, playground guards, and class guards.

**Consumption decision (proposal):** add the kit as a **git dependency pinned to a commit** (`github:sanjivinsmoke95/ui-kit#<commit>`), or merge `ui-upgrade` into `main` first and pin that. Use its Tailwind preset and `kit.css`. Domain components live in our app, not in the kit. The CLI copy approach (`ui-kit add`) is the fallback if dependency resolution causes trouble.

## 2. Theming and tokens
- Themes: selected through `<html data-theme>` with `ThemeProvider`. Available: `forest` (Forest Light, default), `paper` (Paper Ink), **`dark` (Graphite: near-black, signal cyan)**, `blue` (Blue + Dark), `warm`.
- Colour tokens (RGB triplets usable with Tailwind opacity): `bg`, `surface`, `surface-2`, `line`, `fg`, `fg-2`, `fg-3`, `accent`, `accent-text`, `accent-fg`, `accent-deep`, `accent-2`, `success`, `warning`, `danger`, `danger-fg`. Semantic tokens: `sem-blue/purple/teal/orange/red`, `risk-normal/watch/elevated/review`.
- Graphite values: `--bg 8 9 11` (#08090B), `--surface 14 16 19`, `--surface-2 21 24 28`, `--line 37 41 47`, `--fg 244 246 248`, `--fg-2 160 168 178`, `--accent 34 211 238` (#22D3EE), `--success 52 211 153`, `--warning 251 191 36`, `--danger 248 113 113`.
- Other tokens: radii (`--radius-sm` 8 → `--radius-card` 24), motion (`--ease`, `--dur-fast` 150 ms, `--dur` 200 ms), z-layers, widths (`--w-sidebar` 244 px), `--h-topbar` 56 px, and font variables (`--font-sans`, `--font-display`, `--font-mono`, `--display-weight`, `--display-transform`).
- `accentPresets` and `deriveAccent` give a runtime accent with contrast-safe text.
- Fonts available through fontsource: Inter, Geist, Geist Mono, JetBrains Mono, Space Grotesk, Manrope, Sora, DM Sans, Plus Jakarta Sans, Bricolage Grotesque, Anton, Space Mono.

The Graphite theme is already very close to the requested forensic palette. Cards are rounded (`--radius-card` 24 px), which the prompt warns against using everywhere. The design system tightens radii for the workstation (UI_DESIGN_SYSTEM).

## 3. Components that exist (exact exports from `src/index.js`)

| Group | Exports | Use in our app |
|---|---|---|
| Primitives | `Alert`, `AnimatedValue`, `Avatar`, `Badge`, `StatusBadge`, `Breadcrumb`, `BurstToggle`, `Button`, `buttonStyles`, `Card`, `Pill`, `SectionHeader`, `StatCard`, `StatGroup`, `ConfirmationDialog`, `MetricCard`, `Drawer`, `Dropdown`, `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`, `Spinner`, `Checkbox`, `Field`, `Input`, `SearchInput`, `Select`, `Textarea`, `Toggle`, `FileGlyph`, `IconButton`, `FilterChips`, `Highlight`, `ResultCard`, `SearchBox`, `HistoryList`, `ItemCard`, `Modal`, `Scrim`, `Pagination`, `ProgressBar`, `ProgressCircle`, `DataTable`, `Table`, `Td`, `Th`, `Segmented`, `TabPanel`, `Tabs`, `ToastProvider`, `useToast`, `TimeTracker`, `formatClock`, `Tooltip`, `Viz` | Buttons, badges, dialogs, drawers (evidence inspector), tabs, segmented filters, toggles (overlay switches), tables (sensor rows), skeletons and empty/error states, toasts, file glyphs (evidence list), `Highlight` (witness spans), `FilterChips` (timeline filters), progress (jobs) |
| Compositions | `Banner`, `Chip`, `ConfirmDialog`, `LevelBadge`, `PriorityBars`, `Section`, `SkeletonRows`, `TagInput`, `cx`, `useNotify` | Review-priority chips, banners for synthetic-data labels |
| Charts (SVG) | `ActivityTimeline`, `BarChart`, `ComparisonView`, `GaugeChart`, `GapChart`, `DonutChart`, `LineChart`, `ChartLegend`, `ProgressChart`, `Sparkline` | `LineChart` for speed, acceleration, heading; `Sparkline` in evidence cards; `ComparisonView` for claim-vs-claim; `ActivityTimeline` for audit history |
| Effects | `InteractiveBackground`, `Marquee`, `RevealText`, `RotatingText`, `SpotlightCard` | Landing page only, used sparingly |
| Layout | `AppShell`, `Brand`, `BrandMark`, `CommandPaletteProvider`, `useCommandPalette`, `MobileNav`, `PageHeader`, `Sidebar`, `ThemeSwitcher`, `Topbar` | App frame, command palette (jump to event or evidence) |
| Landing | `AppWindow`, `CompareColumns`, `CtaBand`, `FaqList`, `FeatureGrid`, `GradientText`, `LandingHero`, `LandingNav`, `LandingPage`, `LandingSection`, `PricingTable`, `SectionHeading`, `SiteFooter`, `StepList` | Landing page structure; `AppWindow` frames the product preview |
| Hooks and utils | `useElementWidth`, `useHotkey`, `useOverlay`, `ThemeProvider`, `useTheme`, `themes`, `accentPresets`, `LEVEL_STYLE`, `cn`, `timeAgo`, `Link`, `LinkProvider`, `highlightParts`, `groupByDay` | Keyboard shortcuts (`useHotkey`), focus traps, router bridge |

## 4. Gaps (must be built in our app, in the kit's design language)
1. **Video player** with frame stepping, rate, source switching, and a canvas overlay. None exists.
2. **Timeline ruler, scrubber, and zoomable event track.** `ActivityTimeline` is a feed, not a temporal axis.
3. **Range slider.** No `<input type="range">` component found in `src`.
4. **Resizable or collapsible panes** for the three-zone workspace.
5. **Trajectory viewer** (SVG top-down map).
6. **Virtualized long lists** (event explorer, if events exceed a few hundred).
7. **Popover/inspector anchored to a marker** (`Tooltip` and `Dropdown` exist and can be the base).
8. **Keyboard shortcut overlay** (can use `Modal` + `useHotkey`).

## 5. Points to watch
- `cn()` only joins classes (no tailwind-merge). Override variant colours with the `!` modifier (documented in the kit README).
- Tailwind opacity modifiers must be multiples of 5; a kit test enforces this.
- Card radius and pastel tones suit the kit's other themes. The forensic workstation needs tighter radii, defined in a theme-scoped override, not by editing kit components.
- The kit's playground (`playground/`) has dashboard, search, and history pages that show the components working, and serves as visual reference.
