import { describe, expect, it } from 'vitest';
import { ASSUMED_CAMERA, MAX_RANGE_M, accidentMarks, basisNote, markerPct, buildActors, involvedAt, makeGroundMapper, pose, positionAt, sceneBounds, withHeadings } from './scene3d';

const cam = { width: 1280, height: 720, ...ASSUMED_CAMERA.cctv };
const traj = (id, pts, extra = {}) => ({ frame: 'image', track_ref: { evidence_id: 'ev1', track_id: id, class: 'car' }, points: pts, ...extra });

describe('makeGroundMapper', () => {
  const map = makeGroundMapper(cam);
  it('puts the image centre straight ahead and lower pixels closer to the camera', () => {
    const near = map(640, 700); const far = map(640, 450);
    expect(Math.abs(near.x)).toBeLessThan(1e-6);
    expect(near.z).toBeGreaterThan(0);
    expect(far.z).toBeGreaterThan(near.z);
  });
  it('puts pixels to the right of centre on the right', () => {
    expect(map(900, 600).x).toBeGreaterThan(0);
    expect(map(300, 600).x).toBeLessThan(0);
  });
  it('clamps pixels at or above the horizon instead of returning nonsense', () => {
    const p = map(640, 10);
    expect(p.clamped).toBe(true);
    expect(p.z).toBeLessThanOrEqual(MAX_RANGE_M);
  });
});

describe('buildActors', () => {
  const t = traj(1, [{ x: 600, y: 600, case_ms: 0 }, { x: 610, y: 560, case_ms: 200 }, { x: 620, y: 520, case_ms: 400 }]);
  it('draws only the chosen camera and only real stored points', () => {
    const other = { ...traj(2, [{ x: 1, y: 1, case_ms: 0 }, { x: 2, y: 2, case_ms: 1 }]), track_ref: { evidence_id: 'ev2', track_id: 2, class: 'car' } };
    const a = buildActors([t, other], { evidenceId: 'ev1', video: { width: 1280, height: 720, kind: 'cctv' } });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ trackId: 1, estimated: true, calibrated: false });
    expect(a[0].samples).toHaveLength(3);
  });
  it('uses calibrated ground-plane metres as they are and marks them calibrated', () => {
    const g = traj(3, [{ x: 5, y: 10, case_ms: 0 }, { x: 5, y: 14, case_ms: 1000 }], { frame: 'ground_plane' });
    const [a] = buildActors([g], { evidenceId: 'ev1' });
    expect(a).toMatchObject({ calibrated: true, estimated: false });
    expect(a.samples[1]).toMatchObject({ x: 5, z: 14 });
  });
  it('skips a track with fewer than two points', () => {
    expect(buildActors([traj(4, [{ x: 1, y: 1, case_ms: 0 }])], { video: { width: 1280, height: 720 } })).toEqual([]);
  });
});

describe('positionAt', () => {
  const actor = { samples: [{ t: 0, x: 0, z: 0 }, { t: 200, x: 2, z: 4 }, { t: 2000, x: 4, z: 8 }] };
  it('interpolates between close samples', () => expect(positionAt(actor, 100)).toMatchObject({ x: 1, z: 2 }));
  it('does not exist before the first or after the last sample', () => { expect(positionAt(actor, -1)).toBeNull(); expect(positionAt(actor, 2001)).toBeNull(); });
  it('hides the object across a long gap instead of carrying it through', () => expect(positionAt(actor, 1000)).toBeNull());
});

describe('headings, involvement and bounds', () => {
  const a = withHeadings([{ key: 'ev1:1', trackId: 1, cls: 'car', samples: [{ t: 0, x: 0, z: 0 }, { t: 200, x: 0, z: 2 }, { t: 400, x: 0, z: 2.01 }, { t: 600, x: 0, z: 2.02 }] }]);
  it('keeps the last travelled direction for a stopped object', () => expect(pose(a[0], 500).heading).toBeCloseTo(0));
  it('finds who was involved and where, only among drawn actors', () => {
    const r = involvedAt({ ms: 200, trackKeys: ['ev1:1', 'ev1:99'] }, a);
    expect([...r.keys]).toEqual(['ev1:1']);
    expect(r.at).toMatchObject({ x: 0 });
    expect(involvedAt(null, a).at).toBeNull();
  });
  it('frames the scene and handles an empty one', () => {
    expect(sceneBounds(a).maxZ).toBeGreaterThan(1.9); expect(sceneBounds(a).maxZ).toBeLessThanOrEqual(2.02);
    expect(sceneBounds([])).toMatchObject({ minX: -10 });
  });
});

describe('basisNote', () => {
  it('says plainly when positions are estimated', () => expect(basisNote([{ calibrated: false }], { kind: 'dashcam' })).toMatch(/Schematic only.*1.3 m high.*not measurements/));
  it('says when there is nothing to draw', () => expect(basisNote([], {})).toMatch(/nothing to draw/));
  it('does not call estimated positions calibrated', () => expect(basisNote([{ calibrated: true }], {})).toMatch(/calibrated ground-plane/));
});

describe('accident timestamps on the replay', () => {
  it('places a time along the slider and ignores times outside the replay', () => {
    expect(markerPct(500, [0, 1000])).toBe(50);
    expect(markerPct(2000, [0, 1000])).toBeNull();
    expect(markerPct(null, [0, 1000])).toBeNull();
    expect(markerPct(5, [10, 10])).toBeNull();
  });
  it('turns nearby possible-accident flags of one recording into one numbered incident', () => {
    const ev = (ms, src = 'ev1', type = 'possible_collision') => ({ event_type: type, start_ms: ms, source_id: src });
    expect(accidentMarks([ev(14800), ev(13200), ev(14000), ev(30000), ev(5000, 'ev2'), ev(1000, 'ev1', 'vehicle_slowing')], 'ev1'))
      .toEqual([{ ms: 13200, label: 'Incident 1' }, { ms: 30000, label: 'Incident 2' }]);
    expect(accidentMarks([], 'ev1')).toEqual([]);
  });
});
