/** Unifies the three stored finding families (contradictions, corroborations, evidence gaps) for the findings workspace.
 *  Everything is read from API records. Nothing is invented: priority exists only if the backend sends one, an empty field stays empty,
 *  and the number of independent sources is counted from the distinct sources of the cited events, never taken from a flag alone. */

export const CATEGORIES = ['contradiction', 'corroboration', 'gap'];
export const CATEGORY_LABEL = { contradiction: 'Contradiction', corroboration: 'Corroboration', gap: 'Evidence gap' };
export const CATEGORY_PLURAL = { contradiction: 'Contradictions', corroboration: 'Corroborations', gap: 'Evidence gaps' };

/** The backend stores three review states for a finding. No other state is offered or implied. */
export const REVIEW_LABEL = { unreviewed: 'Unreviewed', reviewed: 'Reviewed', disputed: 'Disputed' };

const GAP_TITLE = {
  video_missing_interval: 'Missing interval in the recording',
  sensor_missing_interval: 'Missing interval in the sensor data',
  no_camera_calibration: 'No camera calibration',
  clock_inconsistency: 'Clock relations disagree',
  unsynchronized_source: 'Source clock not related to another source',
  unconfirmed_vehicle_identity: 'Vehicle identity not confirmed',
  tracking_fragmentation: 'Some tracks may be fragments of one vehicle',
  low_visual_quality: 'Footage quality is low',
  untestable_claim: 'A statement could not be checked',
  no_visual_coverage_at_candidate_collision: 'No video covers the possible contact',
};
export const gapTitle = (type) => GAP_TITLE[type] || String(type || 'Evidence gap').split('_').join(' ').replace(/^./, (c) => c.toUpperCase());

const sentence = (s) => (s ? String(s).replace(/^./, (c) => c.toUpperCase()) : null);

/** Review state lives on the investigation finding that points at the record (ref_ids). Records carry their own value only as a fallback. */
function reviewOf(id, own, finds) {
  const f = finds.find((x) => (x.ref_ids || []).includes(id));
  return { status: f?.review_status || own || 'unreviewed', findingId: f?.id || null };
}

const side = (e, nameOf) => (e ? {
  id: e.id, title: e.title || e.event_type, source: e.source_id ? nameOf(e.source_id) : null, sourceId: e.source_id || null,
  timeMs: e.start_ms ?? null, uncertaintyMs: e.uncertainty_ms ?? null, kind: e.category || null, text: e.observations?.quote || e.description || null,
} : null);

/** @returns {Array} one flat list of findings, each with the same base fields so cards can share filtering and sorting. */
export function buildFindings({ cons = [], crbs = [], gaps = [], finds = [], events = [], nameOf = (x) => x }) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const out = [];

  cons.forEach((c) => {
    const a = side(byId.get(c.event_a), nameOf); const b = side(byId.get(c.event_b), nameOf);
    const r = reviewOf(c.id, c.review_status, finds);
    out.push({
      key: `contradiction:${c.id}`, category: 'contradiction', id: c.id, title: a && b ? `${a.title} / ${b.title}` : 'Two sources describe the same thing differently',
      explanation: c.explanation, sides: [a, b], strength: c.strength || null, rule: c.rule_id, questions: c.unresolved_questions || [],
      timeMs: Math.min(...[a?.timeMs, b?.timeMs].filter((x) => x != null), Infinity), eventIds: [c.event_a, c.event_b], ...r,
    });
  });

  crbs.forEach((c) => {
    const evs = (c.events || []).map((id) => side(byId.get(id), nameOf)).filter(Boolean);
    const distinct = new Set(evs.map((e) => e.sourceId).filter(Boolean));
    const r = reviewOf(c.id, c.review_status, finds);
    out.push({
      key: `corroboration:${c.id}`, category: 'corroboration', id: c.id, title: evs[0]?.title || 'Independent sources agree',
      explanation: c.explanation, sources: evs, independentCount: distinct.size, independent: !!c.independent && distinct.size >= 2, independenceReason: c.independence_reason || null,
      relation: c.temporal_relation || null, rule: c.rule_id, timeMs: Math.min(...evs.map((e) => e.timeMs).filter((x) => x != null), Infinity), eventIds: c.events || [], ...r,
    });
  });

  gaps.forEach((g) => {
    const r = reviewOf(g.id, g.review_status, finds);
    out.push({
      key: `gap:${g.id}`, category: 'gap', id: g.id, title: gapTitle(g.gap_type), type: g.gap_type,
      scope: g.scope?.evidence_id ? { evidenceId: g.scope.evidence_id, name: nameOf(g.scope.evidence_id) } : null,
      fromMs: g.scope?.from_ms ?? null, toMs: g.scope?.to_ms ?? null, label: g.details?.label || null, effect: sentence(g.details?.effect),
      recommendation: g.recommendation || null, refs: g.refs || [], priority: g.priority ?? g.severity ?? null, timeMs: g.scope?.from_ms ?? Infinity, eventIds: [], ...r,
    });
  });

  return out.map((f) => ({ ...f, timeMs: Number.isFinite(f.timeMs) ? f.timeMs : null }));
}

export const countsOf = (items) => ({
  all: items.length,
  contradiction: items.filter((f) => f.category === 'contradiction').length,
  corroboration: items.filter((f) => f.category === 'corroboration').length,
  gap: items.filter((f) => f.category === 'gap').length,
});

/** category: 'all' or a CATEGORIES value. status: 'all' or a review state. sort: 'time' | 'category' | 'priority'. */
export function selectFindings(items, { category = 'all', status = 'all', sort = 'category' } = {}) {
  const rank = (f) => CATEGORIES.indexOf(f.category);
  const list = items.filter((f) => (category === 'all' || f.category === category) && (status === 'all' || f.status === status));
  const time = (f) => (f.timeMs == null ? Infinity : f.timeMs);
  const sorters = {
    category: (a, b) => rank(a) - rank(b) || time(a) - time(b),
    time: (a, b) => time(a) - time(b) || rank(a) - rank(b),
    priority: (a, b) => String(b.priority ?? '').localeCompare(String(a.priority ?? '')) || rank(a) - rank(b),
  };
  return [...list].sort(sorters[sort] || sorters.category);
}

/** Sorting by priority is offered only when at least one record carries one. */
export const hasPriority = (items) => items.some((f) => f.priority != null);
