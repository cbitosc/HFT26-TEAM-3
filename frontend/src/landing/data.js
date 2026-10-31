import { ILLUSTRATIVE_SPAN_S } from './config';

/** Single source of truth for the illustrative timeline. Not a real accident. */
export const EVENTS = [
  { id: 'e1', t: 0, ts: '00:00.000', title: 'Recording begins', category: 'Recording', camera: 'S040 North', tracks: [], evidence: 'VID-N16 · frame 0', status: 'Machine-extracted', detail: 'The recording starts. Clock alignment and frame rate are read from the file, not assumed.' },
  { id: 'e2', t: 5.2, ts: '00:05.200', title: 'Vehicle enters observation area', category: 'Movement', camera: 'S040 North', tracks: ['TRK-A'], evidence: 'VID-N16 · track TRK-A', status: 'Machine-extracted', detail: 'A tracked object crosses the boundary of the observed region. Identity is a track label only.' },
  { id: 'e3', t: 8.4, ts: '00:08.400', title: 'Tracked vehicle changes direction', category: 'Movement', camera: 'S040 North', tracks: ['TRK-A'], evidence: 'VID-N16 · track TRK-A', status: 'Machine-extracted', detail: 'The track heading changes across consecutive frames. Cause and intent are not inferred.' },
  { id: 'e4', t: 11.8, ts: '00:11.800', title: 'Potential interaction identified', category: 'Interaction', camera: 'S040 North', tracks: ['TRK-A', 'TRK-B'], evidence: 'VID-N16 · tracks A, B', status: 'Awaiting review', detail: 'Two tracks come within a proximity threshold. This is a candidate for review, not a conclusion.' },
  { id: 'e5', t: 13.8, ts: '00:13.800', title: 'Possible contact moment flagged for review', category: 'Flag', camera: 'S040 North', tracks: ['TRK-A', 'TRK-B'], evidence: 'VID-N16 · frames near the flagged moment', status: 'Awaiting review', detail: 'Flagged for an investigator to inspect. The exact contact time may not be recoverable from this footage.' },
  { id: 'e6', t: 16.2, ts: '00:16.200', title: 'Vehicle movement continues', category: 'Movement', camera: 'S040 North', tracks: ['TRK-A'], evidence: 'VID-N16 · track TRK-A', status: 'Machine-extracted', detail: 'The tracked vehicle remains in view and continues along its path.' },
];

/** Map an illustrative event time onto the actual clip, clamped to its real duration. */
export const mapToClip = (t, duration) => {
  if (!duration || !Number.isFinite(duration)) return null;
  return Math.min(Math.max(0, (t / ILLUSTRATIVE_SPAN_S) * duration), Math.max(0, duration - 0.05));
};

export const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

export const VERDICTS = {
  supported: { label: 'Supported', tone: 'ok', note: 'Independent sources agree.' },
  partial: { label: 'Partially supported', tone: 'warn', note: 'Part of the account is corroborated.' },
  contradicted: { label: 'Contradicted', tone: 'bad', note: 'A reviewed source conflicts with the account.' },
  unverified: { label: 'Not independently verified', tone: 'mute', note: 'No second source covers this.' },
  insufficient: { label: 'Insufficient evidence', tone: 'gap', note: 'The available material cannot settle this.' },
};

export const CORRELATIONS = [
  { id: 'video', kind: 'Video', ref: 'VID-N16', from: 5.2, to: 11.8, result: 'supported', text: 'Observed movement through the interval; vehicle tracked entering the area.' },
  { id: 'witness', kind: 'Witness', ref: 'WIT-002 · statement 1', from: 5.2, to: 13.8, result: 'unverified', text: '“The vehicle stopped before entering the intersection.”' },
  { id: 'sensor', kind: 'Sensor', ref: 'SEN-003 · speed channel', from: 8.4, to: 13.8, result: 'insufficient', text: 'No sensor file registered for this interval.' },
];

export const FINDINGS = [
  { id: 'f1', result: 'contradicted', claim: 'Witness: “The vehicle stopped before entering the intersection.”', evidence: 'Video: “The available recording shows movement through the observed interval.”', refs: ['WIT-002 · stmt 1', 'VID-N16 · 00:05.200–00:11.800'], outcome: 'Potential inconsistency — requires investigator review.', caveat: 'A camera not showing something is never proof that a witness is wrong. Field of view, occlusion and clock offset can all explain a difference.' },
  { id: 'f2', result: 'insufficient', claim: 'Exact moment of contact', evidence: 'Frames around 00:13.800 are partly occluded.', refs: ['VID-N16 · frames near the flagged moment'], outcome: 'Exact impact time cannot be established from the available footage.', caveat: 'The flag stays open until a reviewer inspects the frames.' },
  { id: 'f3', result: 'supported', claim: 'A vehicle entered the observed area', evidence: 'Track TRK-A crosses the region boundary.', refs: ['VID-N16 · TRK-A'], outcome: 'Supported by the recording.', caveat: 'Track identity is a label, not a confirmed vehicle.' },
  { id: 'f4', result: 'partial', claim: 'Vehicle direction changed before the interaction', evidence: 'Heading change on TRK-A; witness does not mention it.', refs: ['VID-N16 · TRK-A', 'WIT-002'], outcome: 'Partly supported: direction change observed, cause unknown.', caveat: 'Motive and cause are not inferred.' },
  { id: 'f5', result: 'unverified', claim: 'Vehicle speed before the event', evidence: 'No calibrated sensor or scale reference.', refs: ['—'], outcome: 'Not independently verified.', caveat: 'Pixel motion is not converted to speed without calibration.' },
];

export const REPORT = {
  overview: 'Illustrative multi-source review of a single junction recording (not a real incident).',
  unresolved: ['Exact contact time', 'Whether the witness view covered the interval', 'Sensor clock offset to the video'],
};

/** Typical sources and the clock each one is on. Illustrative of a usual case, not of one incident. */
export const SOURCE_LEDGER = [
  { kind: 'Dashcam', clock: 'Clip starts at 00:00. Wall-clock time often missing or wrong.', icon: 'Video' },
  { kind: 'CCTV', clock: 'Own recorder clock, drifting by seconds or minutes.', icon: 'Cctv' },
  { kind: 'Phone footage', clock: 'Device time zone and trimming unknown.', icon: 'Smartphone' },
  { kind: 'Witness statement', clock: '“Around four o’clock”, “a few seconds before”.', icon: 'MessageSquareQuote' },
  { kind: 'Sensor log', clock: 'Device boot time or a relative t = 0.', icon: 'Gauge' },
];

export const STEPS = [
  { n: '01', title: 'Upload multi-source evidence', text: 'Dashcam, CCTV and phone video, witness statements and sensor logs go into one investigation. Originals are kept intact and hashed.' },
  { n: '02', title: 'Align every source on one clock', text: 'Each source gets an offset to a reference clock and an uncertainty. Offsets come from recorded timestamps or are declared by the investigator. Sources are never aligned by how they look.' },
  { n: '03', title: 'Extract tracks, events and claims', text: 'Tracks and candidate events are extracted from video. Claims are pulled from statements. All of it stays a candidate until reviewed.' },
  { n: '04', title: 'One timeline, with the evidence behind it', text: 'Events appear in order with supporting and contradicting evidence, gaps are flagged, and a report is generated from reviewed findings.' },
];
