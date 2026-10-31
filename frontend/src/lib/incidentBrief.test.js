import { describe, expect, it } from 'vitest';
import { buildReportBrief, groupIncidents } from './incidentBrief';

const ev = (id, type, ms, extra = {}) => ({ id, event_type: type, start_ms: ms, end_ms: ms, evidence_id: 'ev1', track_ids: [1], track_classes: ['car'], observations: {}, ...extra });
const scene = ev('s', 'possible_collision', 14800, { track_ids: [], track_classes: [], observations: { scene_cue: { frames: 10, peak_confidence: 0.94, strength: 'strong' } } });
const motion = ev('m', 'possible_collision', 14400, { track_ids: [35, 54], track_classes: ['car', 'motorcycle'], observations: { collision_signals: ['approach', 'arrest', 'shape'], relative_to_moving_camera: true } });
const slow = ev('l', 'vehicle_slowing', 14000);
const nameOf = () => 'cctv 1.mp4';

describe('groupIncidents', () => {
  it('merges nearby flags on the same recording and splits distant ones', () => {
    const far = ev('f', 'possible_collision', 30000);
    expect(groupIncidents([scene, motion, far])).toHaveLength(2);
  });
  it('ignores events that are not possible accidents or have no time', () => {
    expect(groupIncidents([slow, ev('x', 'possible_collision', null)])).toEqual([]);
  });
});

describe('buildReportBrief', () => {
  const b = buildReportBrief({ events: [slow, motion, scene], cons: [{ explanation: 'The witness says it did not stop; the video shows it stopping.' }], crbs: [], gaps: [{ gap_type: 'no_camera_calibration', recommendation: 'Measure points' }], evidence: [{ kind: 'cctv' }], nameOf });
  it('has one block per incident with plain sections', () => {
    expect(b.incidents).toHaveLength(1);
    const i = b.incidents[0];
    expect(i.title).toBe('Incident 1');
    expect(i.summary).toBe('A possible accident was flagged at 00:14.400 on cctv 1.mp4, involving a car and a motorcycle.');
    expect(i.strength).toBe('strong');
    expect(i.why).toEqual(expect.arrayContaining([expect.stringMatching(/peak 94%/), 'Two road users closed on each other and their movement stopped.']));
    expect(i.happened[0]).toMatch(/A car appears to slow down at 00:14.000/);
    expect(i.uncertain).toEqual(expect.arrayContaining(['Contact is not confirmed.', expect.stringMatching(/camera was moving/)]));
  });
  it('never says contact is confirmed and states no cause or fault', () => {
    const text = JSON.stringify(b);
    expect(text).not.toMatch(/\b(caused|at fault|guilty|liable|collided)\b/i);
    expect(b.glance.headline).toMatch(/None is confirmed/);
  });
  it('summarises the case at a glance and lists next steps', () => {
    expect(b.glance.stats.map((s) => s.value)).toEqual([1, 1, 1, 1]);
    expect(b.next.join(' ')).toMatch(/conflicting account.*ground reference points.*does not determine fault/);
    expect(b.missing.items[0].title).toBe('No camera calibration');
  });
  it('does not claim there was no accident when none is found', () => {
    const none = buildReportBrief({ events: [slow], nameOf });
    expect(none.glance.headline).toBe('No accident was detected in the analysed footage.');
    expect(none.glance.caveat).toMatch(/does not show that no accident happened/);
    expect(none.incidents).toEqual([]);
  });
  it('calls an overlap-only flag a weak cue', () => {
    const weak = buildReportBrief({ events: [ev('w', 'possible_collision', 5000)], nameOf }).incidents[0];
    expect(weak.strength).toBe('weak');
    expect(weak.why[0]).toMatch(/weak cue/);
  });
});
