import { describe, expect, it } from 'vitest';
import { buildFindings, countsOf, hasPriority, selectFindings } from './findings';

const events = [
  { id: 'e1', title: 'Car turned left', source_id: 'ev1', start_ms: 4000, category: 'direct_observation' },
  { id: 'e2', title: 'Witness: car went straight', source_id: 'st1', start_ms: 4500, category: 'witness_claim' },
  { id: 'e3', title: 'Sensor braking', source_id: 'sn1', start_ms: 9000 },
  { id: 'e4', title: 'Brake seen on video', source_id: 'ev1', start_ms: 9100 },
];
const nameOf = (id) => `name-${id}`;
const cons = [{ id: 'con1', rule_id: 'r', event_a: 'e1', event_b: 'e2', strength: 'clear', explanation: 'They differ', review_status: 'unreviewed' }];
const crbs = [
  { id: 'crb1', events: ['e3', 'e4'], independent: true, explanation: 'Agree', independence_reason: 'different devices' },
  { id: 'crb2', events: ['e1', 'e4'], independent: true, explanation: 'Same camera' },
];
const gaps = [{ id: 'gap1', gap_type: 'no_camera_calibration', scope: { evidence_id: 'ev1' }, details: { label: 'CCTV a', effect: 'trajectories stay in pixels' }, recommendation: 'Measure points' }];
const finds = [{ id: 'fnd1', ref_ids: ['gap1'], review_status: 'reviewed' }];

describe('buildFindings', () => {
  const items = buildFindings({ cons, crbs, gaps, finds, events, nameOf });
  it('counts come from the records', () => expect(countsOf(items)).toEqual({ all: 4, contradiction: 1, corroboration: 2, gap: 1 }));
  it('resolves both sides of a contradiction to their sources', () => {
    const c = items.find((i) => i.category === 'contradiction');
    expect(c.sides.map((s) => s.source)).toEqual(['name-ev1', 'name-st1']);
  });
  it('counts independent sources by distinct source, not by the backend flag', () => {
    expect(items.find((i) => i.id === 'crb1').independentCount).toBe(2);
    const same = items.find((i) => i.id === 'crb2');
    expect(same.independentCount).toBe(1);
    expect(same.independent).toBe(false);
  });
  it('takes review state from the finding that cites the record', () => {
    expect(items.find((i) => i.id === 'gap1')).toMatchObject({ status: 'reviewed', findingId: 'fnd1' });
    expect(items.find((i) => i.id === 'con1')).toMatchObject({ status: 'unreviewed', findingId: null });
  });
  it('invents no priority and no time for a gap without an interval', () => {
    const g = items.find((i) => i.id === 'gap1');
    expect(g.priority).toBeNull();
    expect(g.timeMs).toBeNull();
    expect(hasPriority(items)).toBe(false);
  });
  it('survives a missing event record', () => {
    const [c] = buildFindings({ cons, events: [], nameOf });
    expect(c.sides).toEqual([null, null]);
  });
});

describe('selectFindings', () => {
  const items = buildFindings({ cons, crbs, gaps, finds, events, nameOf });
  it('filters by category and status', () => {
    expect(selectFindings(items, { category: 'corroboration' })).toHaveLength(2);
    expect(selectFindings(items, { status: 'reviewed' }).map((i) => i.id)).toEqual(['gap1']);
  });
  it('sorts by time with unplaced last', () => {
    expect(selectFindings(items, { sort: 'time' }).map((i) => i.id)).toEqual(['con1', 'crb2', 'crb1', 'gap1']);
  });
});
