/** Executive summary of a case, built ONLY from stored records and the motion read from stored track positions.
 *  Deterministic templates (no model). Observations are never presented as causes; a factor is something to examine, with its evidence. */
import { formatTime } from './time';
import { about, classOfEvent, sourceName } from './overview';

const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const SENSOR_FACTORS = { hard_braking: 'hard braking', acceleration_spike: 'a sharp acceleration change', collision_flag: 'a collision flag' };
const evRef = (e, role) => ({ eventId: e.id, label: e.title, source: sourceName(e), classification: classOfEvent(e), time: e.start_ms, role });

/** motions: [{ kind, text, label }] from describeMotion; model: buildModel output; moment: pickMoment output or null. */
export function buildExecutive({ model, moment, motions = [], events = [], evidence = [], actors = [], trajs = [], gaps = [], nameOf = (x) => x }) {
  const byId = model.events;
  const placed = events.filter((e) => e.start_ms != null);
  const videos = evidence.filter((e) => e.kind === 'cctv' || e.kind === 'dashcam');
  const sensors = evidence.filter((e) => e.kind === 'sensor_csv');
  const statements = evidence.filter((e) => e.kind === 'witness_text' || e.kind === 'witness_pdf');
  const claims = Object.values(byId).filter((e) => e.category === 'witness_claim');
  const cons = model.findings.filter((f) => f.kind === 'contradiction');
  const crbs = model.findings.filter((f) => f.kind === 'corroboration');

  // ---- involved entities (identity never assumed)
  const confirmed = actors.filter((a) => (a.links || []).some((l) => l.status === 'confirmed'));
  const cameraName = moment?.evidenceId ? nameOf(moment.evidenceId) : null;
  const tracks = (moment?.trackIds || []).filter((id) => !trajs.some((x) => x.actor_id && x.track_ref?.evidence_id === moment.evidenceId && x.track_ref?.track_id === id)).map((id) => {
    const t = trajs.find((x) => x.track_ref?.evidence_id === moment.evidenceId && x.track_ref?.track_id === id);
    return { key: `${moment.evidenceId}:${id}`, label: `${t?.track_ref?.class || 'road user'} #${id}`, detail: `seen on ${cameraName || 'one camera'}`, status: 'identity not confirmed' };
  });
  const entities = [...confirmed.map((a) => ({ key: a.id, label: a.label, detail: 'linked to evidence by the investigator', status: 'confirmed by investigator' })), ...tracks];

  // ---- factors (each carries its evidence; none is stated as a cause)
  const factors = [];
  const fast = motions.filter((m) => m.kind === 'sped_up');
  const slow = motions.filter((m) => m.kind === 'slowed');
  if (moment && fast.length) factors.push({ id: 'fast', title: `${fast.length > 1 ? 'Vehicles moved' : 'A vehicle moved'} faster just before the possible contact`, summary: fast.map((m) => m.text).join(' '), classification: 'observed',
    supporting: [{ eventId: moment.eventId, label: 'Stored positions of the tracked vehicle (image space, relative to its size; not a real speed)', source: cameraName || 'Camera', classification: 'observed', time: moment.ms, role: 'motion' }], contradicting: [], status: 'single source: one camera' });
  if (moment && slow.length) factors.push({ id: 'slow', title: `${slow.length > 1 ? 'Vehicles were' : 'A vehicle was'} already slowing at the possible contact`, summary: slow.map((m) => m.text).join(' '), classification: 'observed',
    supporting: [{ eventId: moment.eventId, label: 'Stored positions of the tracked vehicle (image space)', source: cameraName || 'Camera', classification: 'observed', time: moment.ms, role: 'motion' }], contradicting: [], status: 'single source: one camera' });
  if (moment) {
    const s = placed.filter((e) => e.source_type === 'sensor' && SENSOR_FACTORS[e.event_type] && e.start_ms >= moment.ms - 3000 && e.start_ms <= moment.ms + 1500);
    if (s.length) factors.push({ id: 'sensor', title: 'A vehicle sensor recorded a related signal', summary: `The sensor log shows ${list([...new Set(s.map((e) => SENSOR_FACTORS[e.event_type]))])} ${about(s[0].start_ms)}.`, classification: 'observed',
      supporting: s.map((e) => evRef(e, 'support')), contradicting: [], status: moment.basis === 'camera and sensor agree' ? 'supported by camera and sensor' : 'single source: sensor' });
  }
  cons.forEach((f) => factors.push({ id: f.id, title: f.title, summary: f.summary, classification: f.classification, supporting: f.supporting, contradicting: f.contradicting, status: 'sources disagree' }));
  crbs.filter((f) => f.ruleId !== 'COR-COLL-01').forEach((f) => factors.push({ id: f.id, title: f.title, summary: f.summary, classification: f.classification, supporting: f.supporting, contradicting: f.contradicting, status: 'supported by independent sources' }));
  const gapHere = moment ? gaps.filter((g) => g.scope?.case_from_ms != null && g.scope.case_from_ms - 1000 <= moment.ms && moment.ms <= g.scope.case_to_ms + 1000) : [];
  gapHere.forEach((g) => factors.push({ id: g.id, title: 'Footage is missing around the possible contact', summary: 'A recording has no frames at this time, so what happened in that interval is unknown.', classification: 'unknown', supporting: [], contradicting: [], status: 'not established' }));

  // ---- what happened (five plain sentences, each from records)
  const s = [];
  if (moment) {
    const both = moment.basis === 'camera and sensor agree';
    s.push(both ? `A possible collision is indicated ${about(moment.ms)}, supported by both a camera and a vehicle sensor.`
      : moment.basis === 'vehicle sensor flag only' ? `A vehicle sensor flagged a possible impact ${about(moment.ms)}; no camera analysis confirms it.`
        : moment.candidates > 3 ? `The video analysis flagged ${moment.candidates} possible contact moments, the strongest ${about(moment.ms)}. Overlapping vehicles are common in busy scenes, so this is a lead, not a finding.`
          : `The video analysis indicates a possible collision ${about(moment.ms)}, from the camera only.`);
  } else s.push('The available evidence does not show a collision or a near miss.');
  s.push(entities.length ? `Possibly involved: ${entities.slice(0, 4).map((e) => e.label).join(', ')}${entities.some((e) => e.status !== 'confirmed by investigator') ? ' (identities not confirmed)' : ''}.` : 'No road user can be tied to this moment from the stored records.');
  s.push(`It rests on ${videos.length} recording${videos.length === 1 ? '' : 's'}${sensors.length ? `, ${sensors.length} sensor log${sensors.length > 1 ? 's' : ''}` : ''}${statements.length ? ` and ${statements.length} witness statement${statements.length > 1 ? 's' : ''}` : ''}${!sensors.length && !statements.length ? ' only' : ''}${cons.length ? `; ${cons.length} account${cons.length > 1 ? 's differ' : ' differs'} from the footage` : crbs.length ? '; independent sources agree on parts of the sequence' : ''}.`);
  const named = factors.filter((f) => ['fast', 'slow', 'sensor'].includes(f.id));
  s.push(named.length ? `Factors the evidence points to: ${named.map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1)).join('; ')}. These are observations to examine, not established causes.` : 'The records do not show a specific factor that preceded this moment.');
  const unk = model.overview.uncertain.filter((f) => f.kind === 'limit').map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1));
  s.push(`Not established: ${[...unk, ...(gaps.length ? [`${gaps.length} evidence gap${gaps.length > 1 ? 's' : ''}`] : [])].join('; ') || 'nothing further recorded'}.`);

  // ---- questions and actions
  const questions = model.overview.uncertain.map((f) => ({ id: f.id, title: f.title, text: f.summary }));
  const actions = [...model.overview.attention.map((a) => ({ text: a.text, findingId: a.findingId })), ...model.findings.filter((f) => f.kind === 'gap' && f.action).map((f) => ({ text: f.action, findingId: f.id }))]
    .filter((a, i, all) => all.findIndex((b) => b.text === a.text) === i).slice(0, 6);

  return { sentences: s, factors, entities, questions, actions, counts: { videos: videos.length, sensors: sensors.length, statements: statements.length, claims: claims.length }, witnessUnverified: claims.filter((c) => !cons.some((f) => [...f.supporting, ...f.contradicting].some((r) => r.eventId === c.id))).length };
}
