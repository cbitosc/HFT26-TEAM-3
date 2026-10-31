export const SORTS = {
  newest: { label: 'Newest first', cmp: (a, b) => (a.created_at < b.created_at ? 1 : -1) },
  oldest: { label: 'Oldest first', cmp: (a, b) => (a.created_at < b.created_at ? -1 : 1) },
  title: { label: 'Title A–Z', cmp: (a, b) => a.title.localeCompare(b.title) },
  evidence: { label: 'Most evidence', cmp: (a, b) => (b.counts?.evidence_total ?? 0) - (a.counts?.evidence_total ?? 0) },
  review: { label: 'Most to review', cmp: (a, b) => (b.counts?.findings_unreviewed ?? 0) - (a.counts?.findings_unreviewed ?? 0) },
};

/** Search matches title, code and description text exactly as stored. Filters and sort only reorder or hide rows; they never change values. */
export function filterCases(cases, { q = '', designation = 'all', status = 'all', sort = 'newest' } = {}) {
  const needle = q.trim().toLowerCase();
  return cases
    .filter((c) => (designation === 'all' || c.designation === designation) && (status === 'all' || c.status === status))
    .filter((c) => !needle || [c.title, c.code, c.description].some((v) => (v || '').toLowerCase().includes(needle)))
    .sort((SORTS[sort] || SORTS.newest).cmp);
}
