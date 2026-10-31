import { describe, expect, it } from 'vitest';
import { describeMotion, nearbyEvidence, pickMoment, windowSpeed } from './moment';

const E = (id, type, ms, extra = {}) => ({ id, event_type: type, category: 'machine_detection', start_ms: ms, end_ms: ms, uncertainty_ms: 100, source_type: 'video_cctv', source_id: 'ev1', title: `${type} ${id}`, observations: {}, ...extra });
const pt = (t, x, w = 20) => ({ time_ms: t, anchor: [x, 100], bbox: [x - w, 80, x + w, 100] });

describe('possible accident moment', () => {
  it('prefers a camera+sensor agreement and names the basis', () => {
    const cam = E('c1', 'possible_collision', 4600, { observations: { track_ids: [3, 4], source_time_ms: [4600, 4600] } });
    const flag = E('s1', 'collision_flag', 4850, { source_type: 'sensor', source_id: 'imu' });
    const m = pickMoment([cam, flag], [{ rule_id: 'COR-COLL-01', events: ['c1', 's1'] }]);
    expect(m).toMatchObject({ ms: 4600, basis: 'camera and sensor agree', trackIds: [3, 4], mediaMs: 4600 });
    expect(m.trackKeys).toEqual(['ev1:3', 'ev1:4']);
  });
  it('falls back to a sensor flag, then to the camera candidate with the biggest speed drop', () => {
    expect(pickMoment([E('s1', 'collision_flag', 900, { source_type: 'sensor', source_id: 'imu' })], []).basis).toBe('vehicle sensor flag only');
    const weak = E('a', 'possible_collision', 1000, { observations: { abrupt_speed_changes: [{ relative_speed_before: 1, relative_speed_after: 0.8 }] } });
    const strong = E('b', 'possible_collision', 5000, { observations: { abrupt_speed_changes: [{ relative_speed_before: 1.5, relative_speed_after: 0.1 }], track_ids: [7] } });
    const m = pickMoment([weak, strong], []);
    expect(m.eventId).toBe('b');
    expect(m.candidates).toBe(2);
    expect(m.basis).toBe('camera analysis only');
  });
  it('returns null when nothing points to a moment, and ignores unplaced events', () => {
    expect(pickMoment([E('x', 'vehicle_slowing', 1000)], [])).toBeNull();
    expect(pickMoment([E('u', 'possible_collision', null)], [])).toBeNull();
  });
});

describe('image-space motion description', () => {
  const track = (speeds) => { let x = 0; let t = 0; const pts = [pt(0, 0)]; speeds.forEach(([dur, v]) => { for (let i = 0; i < dur * 5; i++) { t += 200; x += v * 40 * 0.2; pts.push(pt(t, x)); } }); return { class: 'car', track_id: 3, points: pts }; };
  it('reports speed relative to the vehicle size, not pixels', () => {
    const slow = track([[6, 0.5]]);
    expect(windowSpeed(slow.points, 0, 6000)).toBeCloseTo(0.5 * 40 / Math.hypot(40, 20), 1);
  });
  it('says a vehicle moved faster only when the stored positions show it, and never says it caused anything', () => {
    const d = describeMotion(track([[3, 0.5], [3, 1.6]]), 3600);
    expect(d.kind).toBe('sped_up');
    expect(d.text).toMatch(/moved faster just before this moment/);
    expect(d.text).not.toMatch(/caus|fault|blame|responsib/i);
  });
  it('describes slowing and a near stop afterwards', () => {
    const d = describeMotion(track([[3, 1.0], [3, 0.05]]), 3000);
    expect(d.kind).toBe('slowed');
    expect(d.text).toMatch(/Afterwards it nearly stopped/);
  });
  it('says there are too few positions instead of guessing', () => {
    expect(describeMotion({ class: 'car', track_id: 9, points: [pt(0, 0)] }, 3000).kind).toBe('unknown');
  });
  it('lists nearby stored events and leaves noise out', () => {
    const m = { ms: 5000, eventId: 'm' };
    const ev = [E('m', 'possible_collision', 5000), E('a', 'vehicle_slowing', 3200), E('b', 'hard_braking', 4800, { source_type: 'sensor' }), E('n', 'potential_interaction', 5000), E('e', 'vehicle_enters_scene', 4900)];
    const r = nearbyEvidence(ev, m);
    expect(r.around.map((e) => e.id)).toEqual(['b']);
    expect(r.before.map((e) => e.id)).toEqual(['a']);
  });
});
