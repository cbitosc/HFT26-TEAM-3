/** The quick brief: what happened at each incident, in plain words and separate blocks. Built only from stored records.
 *  No cause or fault is stated. Every incident is "possible" and "not confirmed"; positions are image positions. */
import { formatTime } from './time';
import { gapTitle } from './findings';

const WORD = { car: 'car', truck: 'truck', bus: 'bus', motorcycle: 'motorcycle', bicycle: 'bicycle', pedestrian: 'person' };
const MERGE_MS = 2500;
const NEAR_MS = 3000;

function who(classes) {
  const counts = {};
  classes.forEach((c) => { const w = WORD[c] || 'road user'; counts[w] = (counts[w] || 0) + 1; });
  const parts = Object.keys(counts).slice(0, 3).map((w) => `a ${w}`);
  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const SEE = {
  vehicle_slowing: (w) => `${w} appears to slow down`,
  vehicle_stopped: (w) => `${w} appears to stop`,
  vehicle_direction_change: (w) => `${w} changes direction`,
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Possible-accident events grouped into incidents (same recording, within 2.5 s of each other). */
export function groupIncidents(events = []) {
  const acc = events.filter((e) => e.event_type === 'possible_collision' && e.start_ms != null).sort((a, b) => a.start_ms - b.start_ms);
  const groups = [];
  acc.forEach((e) => {
    const g = groups[groups.length - 1];
    if (g && g.evidenceId === e.evidence_id && e.start_ms - g.endMs <= MERGE_MS) { g.members.push(e); g.endMs = Math.max(g.endMs, e.end_ms ?? e.start_ms); }
    else groups.push({ evidenceId: e.evidence_id, startMs: e.start_ms, endMs: e.end_ms ?? e.start_ms, members: [e] });
  });
  return groups;
}

function describe(g, events, nameOf, n) {
  const scene = g.members.map((e) => e.observations?.scene_cue).find(Boolean) || null;
  const motion = g.members.find((e) => (e.observations?.collision_signals || []).length) || null;
  const abrupt = g.members.some((e) => (e.observations?.abrupt_speed_changes || []).length);
  const classes = [...new Set(g.members.flatMap((e) => (e.track_classes || []).map((c, i) => `${c}:${(e.track_ids || [])[i]}`)))].map((x) => x.split(':')[0]);
  const involved = who(classes);
  const strength = scene?.strength === 'strong' || (motion && motion.observations.collision_signals.length >= 3) ? 'strong' : scene || motion || abrupt ? 'possible' : 'weak';
  const around = events.filter((e) => SEE[e.event_type] && e.evidence_id === g.evidenceId && e.start_ms >= g.startMs - NEAR_MS && e.start_ms <= g.endMs + NEAR_MS)
    .slice(0, 3).map((e) => `${cap(SEE[e.event_type](who(e.track_classes || []) || 'A road user'))} at ${formatTime(e.start_ms)}.`);

  const why = [];
  if (scene) why.push(`The accident-scene model reported an accident over ${scene.frames} frames in a row (peak ${Math.round(100 * scene.peak_confidence)}%).`);
  if (motion) {
    const s = motion.observations.collision_signals;
    why.push(s.includes('approach') && s.includes('arrest') ? 'Two road users closed on each other and their movement stopped.' : 'Vehicle movement here is consistent with an impact.');
  }
  if (!scene && !motion) why.push(abrupt ? 'Two road users overlapped in the image and one slowed sharply. Overlap is common in busy scenes, so this is a lead, not proof.' : 'Two boxes overlapped in the image and one slowed. This is a weak cue.');

  const uncertain = ['Contact is not confirmed.'];
  if (scene && !motion) uncertain.push('The model does not show which vehicles touched or the exact moment.');
  uncertain.push('Positions are from the image, not measured distances.');
  const cam = g.members.some((e) => e.observations?.relative_to_moving_camera);
  if (cam) uncertain.push('The camera was moving, so image motion includes its own.');

  return {
    id: `incident-${n}`, n, startMs: g.startMs, endMs: g.endMs, evidenceId: g.evidenceId, camera: g.evidenceId ? nameOf(g.evidenceId) : null,
    strength, involved, title: `Incident ${n}`,
    summary: `A possible accident was flagged at ${formatTime(g.startMs)}${g.evidenceId ? ` on ${nameOf(g.evidenceId)}` : ''}${involved ? `, involving ${involved}` : ''}.`,
    happened: around, why, uncertain, eventIds: g.members.map((e) => e.id),
  };
}

export function buildReportBrief({ events = [], cons = [], crbs = [], gaps = [], evidence = [], nameOf = (x) => x } = {}) {
  const incidents = groupIncidents(events).map((g, i) => describe(g, events, nameOf, i + 1));
  const videos = evidence.filter((e) => e.kind === 'cctv' || e.kind === 'dashcam').length;
  const cams = [...new Set(incidents.map((i) => i.camera).filter(Boolean))];
  const headline = incidents.length === 0
    ? 'No accident was detected in the analysed footage.'
    : `${incidents.length === 1 ? 'One possible accident was' : `${incidents.length} possible accidents were`} flagged${cams.length ? ` on ${cams.join(', ')}` : ''}. None is confirmed.`;
  const next = [];
  if (incidents.length) next.push(`Watch the footage from 1.5 s before ${incidents[0].title.toLowerCase()} (${formatTime(incidents[0].startMs)}) and confirm or reject it.`);
  if (cons.length) next.push(`Review the ${cons.length} conflicting account${cons.length === 1 ? '' : 's'} against the video.`);
  if (gaps.some((g) => g.gap_type === 'no_camera_calibration')) next.push('Record ground reference points in the camera view to allow real measurements.');
  next.push('A person must confirm every possible accident. This brief does not determine fault.');
  return {
    glance: { headline, caveat: incidents.length === 0 ? 'This does not show that no accident happened.' : 'Flagged by software. A person must confirm each one.',
              stats: [{ label: videos === 1 ? 'recording' : 'recordings', value: videos }, { label: incidents.length === 1 ? 'possible accident' : 'possible accidents', value: incidents.length },
                      { label: cons.length === 1 ? 'conflict' : 'conflicts', value: cons.length }, { label: gaps.length === 1 ? 'gap' : 'gaps', value: gaps.length }] },
    incidents,
    witnesses: { conflicts: cons.map((c) => c.explanation).filter(Boolean).slice(0, 4), agreements: crbs.map((c) => c.explanation).filter(Boolean).slice(0, 3) },
    missing: { items: gaps.slice(0, 4).map((g) => ({ title: gapTitle(g.gap_type), action: g.recommendation || null })), more: Math.max(0, gaps.length - 4) },
    next,
  };
}
