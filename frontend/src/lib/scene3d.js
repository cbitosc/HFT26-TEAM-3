/** Geometry for the schematic 3D incident view. Pure functions; nothing here touches WebGL.
 *
 *  Honesty rules (the view is a visual aid, not a measurement):
 *   - Only stored trajectories are drawn. No object, position or time is invented.
 *   - A camera with a calibrated ground plane gives metric positions. Otherwise positions are ESTIMATED from image pixels with a
 *     stated pinhole model (assumed height, tilt and field of view); distances and speeds are then not measurements.
 *   - Between stored samples an object is moved in a straight line for smoothness, but only across a short gap; across a longer gap
 *     it is hidden, never carried through.
 *   - Vehicle size comes from the detected class (a generic car, bus, ...), not from the actual vehicle. */

export const CLASS_DIMS = {
  car: { l: 4.5, w: 1.8, h: 1.5 }, truck: { l: 8, w: 2.5, h: 3.2 }, bus: { l: 11, w: 2.5, h: 3.2 },
  motorcycle: { l: 2.1, w: 0.8, h: 1.4 }, bicycle: { l: 1.8, w: 0.6, h: 1.4 }, pedestrian: { l: 0.5, w: 0.5, h: 1.7 },
};
export const dimsOf = (cls) => CLASS_DIMS[cls] || CLASS_DIMS.car;

/** Assumed camera used only when the camera has no calibration. Stated in the UI. */
export const ASSUMED_CAMERA = {
  cctv: { heightM: 6, tiltDeg: 20, hfovDeg: 70 },
  dashcam: { heightM: 1.3, tiltDeg: 3, hfovDeg: 70 },
};
export const MAX_RANGE_M = 120;

/** Pixel (u, v) -> ground point { x: right, z: ahead } in metres relative to the camera, from a pinhole model over a flat ground plane.
 *  Pixels at or above the horizon are clamped to MAX_RANGE_M ahead and reported as `clamped`. */
export function makeGroundMapper({ width, height, heightM, tiltDeg, hfovDeg }) {
  const f = (width / 2) / Math.tan((hfovDeg * Math.PI) / 360);
  const th = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(th); const sin = Math.sin(th);
  return (u, v) => {
    const dx = (u - width / 2) / f; const dy = (v - height / 2) / f; // camera coords, y down, z forward
    const wy = dy * cos + sin; const wz = -dy * sin + cos; // tilt the camera down by `tilt`
    if (wy <= 1e-3) return { x: dx * MAX_RANGE_M, z: MAX_RANGE_M, clamped: true };
    const t = heightM / wy;
    if (t * wz > MAX_RANGE_M) return { x: (dx * MAX_RANGE_M) / wz, z: MAX_RANGE_M, clamped: true };
    return { x: dx * t, z: wz * t, clamped: false };
  };
}

const keyOf = (ref) => `${ref.evidence_id}:${ref.track_id}`;

/** 3-point mean to calm single-frame jitter in tracked positions. */
function smooth(samples) {
  return samples.map((s, i) => {
    const a = samples[Math.max(0, i - 1)]; const b = samples[Math.min(samples.length - 1, i + 1)];
    return { ...s, x: (a.x + s.x + b.x) / 3, z: (a.z + s.z + b.z) / 3 };
  });
}

/** One entry per stored trajectory of the chosen camera: { key, trackId, cls, samples:[{t,x,z}], calibrated, estimated }.
 *  `video` = { width, height, kind } of that camera. Trajectory points need image x/y (pixels) or ground-plane x/y (metres) and a time. */
export function buildActors(trajs = [], { evidenceId, video, assumed } = {}) {
  const cam = { ...(ASSUMED_CAMERA[video?.kind] || ASSUMED_CAMERA.cctv), ...(assumed || {}) };
  const map = video?.width && video?.height ? makeGroundMapper({ width: video.width, height: video.height, ...cam }) : null;
  const actors = [];
  trajs.forEach((tr) => {
    const ref = tr.track_ref;
    if (!ref || (evidenceId && ref.evidence_id !== evidenceId)) return;
    const calibrated = tr.frame === 'ground_plane';
    if (!calibrated && !map) return;
    const raw = (tr.points || [])
      .map((p) => ({ t: p.case_ms ?? p.source_ms ?? p.time_ms, ...(calibrated ? { x: p.x, z: p.y } : map(p.x, p.y)) }))
      .filter((s) => s.t != null && Number.isFinite(s.x) && Number.isFinite(s.z))
      .sort((a, b) => a.t - b.t);
    if (raw.length < 2) return;
    actors.push({ key: keyOf(ref), trackId: ref.track_id, cls: ref.class || 'car', movingCamera: !!ref.moving_camera, calibrated, estimated: !calibrated,
                  clamped: !calibrated && raw.some((s) => s.clamped), samples: calibrated ? raw : smooth(raw) });
  });
  return actors;
}

/** Position and heading of an actor at time t, or null if it was not tracked then. `maxGapMs` is the longest stored gap bridged. */
export function positionAt(actor, t, maxGapMs = 600) {
  const s = actor.samples;
  if (!s.length || t < s[0].t || t > s[s.length - 1].t) return null;
  let i = 0;
  while (i < s.length - 1 && s[i + 1].t < t) i += 1;
  const a = s[i]; const b = s[Math.min(i + 1, s.length - 1)];
  if (b.t - a.t > maxGapMs && t !== a.t && t !== b.t) return null;
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const x = a.x + (b.x - a.x) * k; const z = a.z + (b.z - a.z) * k;
  // heading from the surrounding motion, so a parked object keeps its last facing instead of spinning
  let h = actor.lastHeading ?? 0;
  const dx = b.x - a.x; const dz = b.z - a.z;
  if (Math.hypot(dx, dz) > 0.05) h = Math.atan2(dx, dz);
  return { x, z, heading: h };
}

/** Headings are computed once so that stopped objects keep the direction they last travelled. */
export function withHeadings(actors) {
  return actors.map((a) => {
    let h = 0; const out = [];
    for (let i = 0; i < a.samples.length; i += 1) {
      const p = a.samples[i]; const n = a.samples[Math.min(i + 1, a.samples.length - 1)]; const q = a.samples[Math.max(i - 1, 0)];
      const dx = n.x - q.x; const dz = n.z - q.z;
      if (Math.hypot(dx, dz) > 0.3) h = Math.atan2(dx, dz);
      out.push({ ...p, heading: h });
    }
    return { ...a, samples: out };
  });
}

/** Position with the heading stored on the nearest sample. */
export function pose(actor, t, maxGapMs = 600) {
  const p = positionAt(actor, t, maxGapMs);
  if (!p) return null;
  const s = actor.samples;
  let best = s[0];
  for (const q of s) if (Math.abs(q.t - t) < Math.abs(best.t - t)) best = q;
  return { ...p, heading: best.heading ?? p.heading };
}

/** Keys of the actors involved in the possible-accident moment, and where it happened, if both are known. */
export function involvedAt(moment, actors, t = moment?.ms) {
  if (!moment) return { keys: new Set(), at: null };
  const keys = new Set((moment.trackKeys || []).filter((k) => actors.some((a) => a.key === k)));
  const pts = [...keys].map((k) => pose(actors.find((a) => a.key === k), t)).filter(Boolean);
  const at = pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length } : null;
  return { keys, at };
}

/** Bounds used to frame the camera: the 5th to 95th percentile of where objects were, so a few far-away tracks do not shrink the scene. */
export function sceneBounds(actors) {
  const xs = []; const zs = [];
  actors.forEach((a) => a.samples.forEach((s) => { xs.push(s.x); zs.push(s.z); }));
  if (!xs.length) return { minX: -10, maxX: 10, minZ: 0, maxZ: 30 };
  const q = (arr, p) => { const v = [...arr].sort((m, n) => m - n); return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; };
  return { minX: q(xs, 0.05), maxX: q(xs, 0.95), minZ: Math.min(0, q(zs, 0.05)), maxZ: q(zs, 0.95) };
}

/** The statement shown with the view, depending on how positions were obtained. */
export function basisNote(actors, video) {
  if (!actors.length) return 'No tracked road user is stored for this camera, so there is nothing to draw.';
  const cal = actors.filter((a) => a.calibrated).length;
  if (cal === actors.length) return 'Positions are calibrated ground-plane coordinates with their stated uncertainty. Vehicle shapes are generic for their class.';
  const cam = ASSUMED_CAMERA[video?.kind] || ASSUMED_CAMERA.cctv;
  return `Schematic only. This camera has no calibration, so positions are estimated from pixels assuming a camera ${cam.heightM} m high, tilted ${cam.tiltDeg}° down, with a ${cam.hfovDeg}° field of view over flat ground. Distances and speeds are not measurements.`;
}
