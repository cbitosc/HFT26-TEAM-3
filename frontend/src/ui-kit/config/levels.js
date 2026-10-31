/**
 * Style maps for four-step priority/severity levels (Critical > High > Medium > Low) and a few status vocabularies.
 * Used by <LevelBadge> / <PriorityBars>; pass your own map via the `styles` prop to use other names.
 */
export const LEVEL_STYLE = {
  Critical: { text: 'text-danger', bg: 'bg-danger', wash: 'bg-danger/10', ring: 'border-danger/30', bars: 4 },
  High: { text: 'text-sem-orange', bg: 'bg-sem-orange', wash: 'bg-sem-orange/10', ring: 'border-sem-orange/30', bars: 3 },
  Medium: { text: 'text-sem-blue', bg: 'bg-sem-blue', wash: 'bg-sem-blue/10', ring: 'border-sem-blue/30', bars: 2 },
  Low: { text: 'text-fg-2', bg: 'bg-fg-3', wash: 'bg-surface-2', ring: 'border-line', bars: 1 },
};
