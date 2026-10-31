/** Investigator overview synthesised ONLY from stored API records (see docs/INVESTIGATOR_UX_AUDIT.md §6).
 *  A sentence is built from fields that exist; if a field is missing its clause is omitted, never guessed. No model is called.
 *  Classification: observed (machine detection / sensor reading) · reported (witness) · inferred (rule-derived) · unknown (gap, open question, limit). */
import { formatTime } from './time';

export const SIGNIFICANT = new Set([
  'possible_collision', 'possible_near_miss', 'collision_flag', 'acceleration_spike', 'hard_braking', 'vehicle_slowing', 'vehicle_stopped',
  'vehicle_direction_change', 'vehicle_maneuver_observed', 'possible_braking_before_impact', 'vehicle_braked',
  'vehicle_turned', 'vehicle_went_straight', 'collision_claim', 'vehicle_speed_claim', 'vehicle_stopped_claim', 'sensor_gap',
]);
export const isSignificant = (e) => SIGNIFICANT.has(e.event_type);

const SOURCE = { video_cctv: 'CCTV', video_dashcam: 'Dashcam', sensor: 'Sensor', witness: 'Witness', engine: 'Rule' };
export const sourceName = (e) => SOURCE[e.source_type] || e.source_type;
export const classOfEvent = (e) => (e.category === 'witness_claim' ? 'reported' : e.category === 'inference' ? 'inferred' : 'observed');

const secs = (ms) => (ms == null ? null : `${(ms / 1000).toFixed(1)} s`);
export const about = (ms) => (ms == null ? 'at an unknown time' : `at about ${secs(ms)}`);
const pm = (ms) => (ms == null ? '' : `±${(ms / 1000).toFixed(2)} s`);
const MOVE = { left: 'turned left', right: 'turned right', straight: 'went straight' };
const SEE = { left: 'turning left', right: 'turning right', straight: 'continuing straight' };
const GAP_TITLE = {
  video_missing_interval: 'Footage is missing for part of the recording',
  sensor_missing_interval: 'Sensor data is missing for part of the recording',
  unsynchronized_source: 'A source cannot be compared in time',
  clock_inconsistency: 'Two clock relations disagree',
  no_camera_calibration: 'No real-world measurements for a camera',
  unconfirmed_vehicle_identity: 'Vehicle identities are not confirmed',
  tracking_fragmentation: 'Some tracks may be fragments of one vehicle',
  low_visual_quality: 'Footage quality is low',
  untestable_claim: 'A statement could not be checked',
  no_visual_coverage_at_candidate_collision: 'No video covers the possible contact',
};

function interval(events) {
  const t = events.filter((e) => e && e.start_ms != null);
  if (!t.length) return null;
  return { start: Math.min(...t.map((e) => e.start_ms - (e.uncertainty_ms || 0))), end: Math.max(...t.map((e) => (e.end_ms ?? e.start_ms) + (e.uncertainty_ms || 0))), at: Math.min(...t.map((e) => e.start_ms)) };
}

/** Build everything the Overview, Findings and Technical tabs need. Pure; inputs are API payloads. */
export function buildModel({ events = [], unplaced = [], cons = [], crbs = [], gaps = [], finds = [], trajs = [], actors = [], evidence = [], modelRuns = {}, jobs = [], shifts = {} }) {
  const all = [...events, ...unplaced];
  const ev = Object.fromEntries(all.map((e) => [e.id, e]));
  const actor = Object.fromEntries(actors.map((a) => [a.id, a.label]));
  const who = (e) => (e?.actor_id && actor[e.actor_id]) || 'a tracked road user';
  const names = (e) => {
    const ids = [...new Set([...(e?.observations?.actors || []), e?.actor_id].filter(Boolean))];
    if (ids.length) return ids.map((i) => actor[i] || 'a road user').join(' and ');
    const tr = e?.observations?.track_ids;
    return tr?.length ? `tracks ${tr.map((t) => `#${t}`).join(' and ')} (identity not confirmed)` : 'tracked road users';
  };
  const reviewOf = (refId) => finds.find((f) => f.ref_ids?.includes(refId));
  const ref = (e, role) => ({ eventId: e.id, label: e.title, source: sourceName(e), classification: classOfEvent(e), time: e.start_ms, role });
  const findings = [];
  const add = (f) => findings.push({ supporting: [], contradicting: [], actorIds: [], interval: null, action: null, uncertainty: null, ...f });
  const claimWitness = (e) => (e?.title || '').split(':')[0] || 'A witness';

  // ---- contradictions (event_a = the claim, event_b = the observation, by rule design)
  cons.forEach((c) => {
    const a = ev[c.event_a];
    const b = ev[c.event_b];
    const w = claimWitness(a);
    const base = { id: `con:${c.id}`, kind: 'contradiction', ruleId: c.rule_id, classification: 'inferred', priority: c.strength === 'clear' ? 100 : 85, review: reviewOf(c.id),
      supporting: b ? [ref(b, 'observation')] : [], contradicting: a ? [ref(a, 'account')] : [], interval: interval([a, b]), actorIds: [a?.actor_id].filter(Boolean),
      uncertainty: [...(c.basis?.benign_explanations || [])].slice(0, 2).join(' '), technical: { text: c.explanation, ruleId: c.rule_id, refs: [c.event_a, c.event_b], strength: c.strength } };
    if (c.rule_id === 'CON-ACTION-01') {
      add({ ...base, title: 'Camera does not match a witness account', summary: `${w} says ${who(a)} ${MOVE[c.basis.witness_maneuver] || 'moved differently'}, but the camera track of ${who(a)} shows it ${SEE[c.basis.video_maneuver] || 'moving differently'}.`,
        action: 'Check which moment the witness describes and that the track is really this vehicle.' });
    } else if (c.rule_id === 'CON-QTY-01') {
      add({ ...base, title: 'Witness speed estimate differs from the sensor', summary: `${w} estimated ${c.basis.claimed_mps?.toFixed?.(0)} m/s; the sensor on ${who(a)} recorded ${c.basis.sensor_min_mps?.toFixed?.(0)}–${c.basis.sensor_max_mps?.toFixed?.(0)} m/s.`, action: 'Ask which vehicle and moment the estimate refers to.' });
    } else if (c.rule_id === 'CON-COLL-CLAIM-01') {
      add({ ...base, title: 'Claimed contact is not shown by camera or sensor', summary: `${w} says contact occurred, but the camera shows the boxes never overlapping and the vehicle sensor logged no impact. This is weak evidence.`, action: 'Look for footage from another angle at the closest approach.' });
    } else {
      add({ ...base, title: 'Two sources disagree', summary: c.explanation, action: 'Review both sources.' });
    }
  });

  // ---- corroborations
  crbs.forEach((c) => {
    const es = c.events.map((i) => ev[i]).filter(Boolean);
    const sens = es.find((e) => e.source_type === 'sensor');
    const vid = es.find((e) => e.source_type.startsWith('video'));
    const cl = es.find((e) => e.category === 'witness_claim');
    const cls = sens && vid ? 'observed' : es.some((e) => e.category === 'witness_claim') ? 'reported' : 'observed';
    const opposing = cons.filter((k) => c.events.includes(k.event_a) || c.events.includes(k.event_b)).flatMap((k) => [ev[k.event_a], ev[k.event_b]]).filter((e) => e && !c.events.includes(e.id));
    const base = { id: `crb:${c.id}`, kind: 'corroboration', ruleId: c.rule_id, classification: cls, priority: c.rule_id === 'COR-COLL-01' ? 90 : 60, review: reviewOf(c.id),
      supporting: es.map((e) => ref(e, 'support')), contradicting: opposing.map((e) => ref(e, 'conflict')), interval: interval(es), actorIds: [...new Set(es.map((e) => e.actor_id).filter(Boolean))],
      uncertainty: `Independent sources agreeing raises plausibility; it is not proof. Time is known to about ${pm(Math.max(0, ...es.map((e) => e.uncertainty_ms || 0)))}.`,
      technical: { text: c.explanation, ruleId: c.rule_id, refs: c.events, independence: c.independence_reason } };
    if (c.rule_id === 'COR-COLL-01') {
      const what = sens?.event_type === 'collision_flag' ? 'a collision flag' : 'a sharp acceleration change';
      add({ ...base, title: 'Possible contact indicated by camera and sensor', summary: `The camera shows tracked paths overlapping ${about(vid?.start_ms)} and a vehicle sensor logged ${what} at about the same time. This is consistent with an impact, but contact is not directly shown.`, action: 'Review the video frames around the possible contact.' });
    } else if (c.rule_id === 'COR-BRAKE-01') {
      add({ ...base, title: 'Braking seen by sensor and camera', summary: `${who(sens)} shows hard braking in the sensor log ${about(sens?.start_ms)} and slows in the camera view at about the same time${cl ? ', as a witness also describes' : ''}.` });
    } else if (c.rule_id === 'COR-MANEUVER-01') {
      const m = cl?.observations?.code_derived_maneuver;
      add({ ...base, title: 'Witness and camera agree on the movement', summary: `${claimWitness(cl)} says ${who(cl)} ${MOVE[m] || 'moved a certain way'}; the camera track agrees.` });
    } else add({ ...base, title: 'Sources agree', summary: c.explanation });
  });

  // ---- inferences and uncovered collision candidates
  const covered = new Set(crbs.filter((c) => c.rule_id === 'COR-COLL-01').flatMap((c) => c.events));
  all.filter((e) => e.category === 'inference').forEach((e) => add({
    id: `inf:${e.id}`, kind: 'inference', ruleId: e.inference?.rule_id, classification: 'inferred', priority: 80, title: 'Braking may have started before the possible impact', summary: e.inference?.statement || e.title,
    supporting: (e.inference?.premises || []).map((i) => ev[i]).filter(Boolean).map((p) => ref(p, 'premise')), interval: interval([e]), actorIds: [e.actor_id].filter(Boolean),
    uncertainty: `Alternatives: ${(e.inference?.alternatives || []).join('; ')}.`, action: 'Treat as a possibility, not a fact.', review: reviewOf(e.id), technical: { text: e.inference?.statement, ruleId: e.inference?.rule_id, refs: e.inference?.premises || [] } }));
  const GROUP_AT = 4; // more candidates than this of one type are summarised as one finding; every event stays in the Technical list
  ['possible_collision', 'possible_near_miss'].forEach((type) => {
    const list = all.filter((e) => e.event_type === type && !covered.has(e.id)).sort((a, b) => (a.start_ms ?? 1e12) - (b.start_ms ?? 1e12));
    const coll = type === 'possible_collision';
    if (list.length === 0) return;
    const one = (e) => {
      const abrupt = e.observations?.abrupt_speed_changes?.length;
      add({ id: `evt:${e.id}`, kind: 'event', ruleId: e.provenance?.rule_id, classification: 'observed', priority: coll ? 70 : 55, title: coll ? 'Possible vehicle contact in the video' : 'Possible near miss in the video',
        summary: coll ? `The paths of ${names(e)} overlap in the image${abrupt ? ' and movement changes suddenly' : ''} ${about(e.start_ms)}. The image alone cannot confirm physical contact.`
          : `${names(e)} come close in the image ${about(e.start_ms)} without a clear overlap.`,
        supporting: [ref(e, 'support')], interval: interval([e]), actorIds: [e.actor_id].filter(Boolean), uncertainty: 'Detected by rule from image-space boxes; not confirmed by a second independent source.',
        action: 'Review the video frames around this moment.', technical: { text: e.title, ruleId: e.provenance?.rule_id, refs: [e.id] } });
    };
    if (list.length < GROUP_AT) { list.forEach(one); return; }
    const placed = list.filter((e) => e.start_ms != null);
    add({ id: `evtgrp:${type}`, kind: 'event', ruleId: list[0].provenance?.rule_id, classification: 'observed', priority: coll ? 70 : 55,
      title: coll ? `${list.length} possible vehicle contacts were flagged in the video` : `${list.length} possible near misses were flagged in the video`,
      summary: `${coll ? 'Overlapping boxes with a sudden movement change' : 'Boxes that come close'} were flagged ${list.length} times${placed.length ? `, first ${about(placed[0].start_ms)} and last ${about(placed[placed.length - 1].start_ms)}` : ''}. In a busy scene many of these are the same pair seen over several frames or boxes that overlap without contact, so none is treated as established.`,
      supporting: list.slice(0, 8).map((e) => ref(e, 'support')), interval: interval(placed), actorIds: [],
      uncertainty: `Showing the first 8 of ${list.length}; all are listed under Technical. Detected by rule from image-space boxes, with no independent second source.`,
      action: 'Review the footage around the earliest candidates and decide which, if any, show real contact.', technical: { text: `${list.length} events of type ${type}`, ruleId: list[0].provenance?.rule_id, refs: list.map((e) => e.id) } });
  });

  // ---- gaps and open questions (unknown)
  gaps.forEach((g) => {
    const d = g.details || {};
    const dur = d.duration_ms != null ? `${(d.duration_ms / 1000).toFixed(1)} s` : null;
    const where = g.scope?.case_from_ms != null ? ` between ${secs(g.scope.case_from_ms)} and ${secs(g.scope.case_to_ms)}` : '';
    const summary = {
      video_missing_interval: `${d.label || 'A video'} has no frames${dur ? ` for ${dur}` : ''}${where}. What happened in that interval is unknown.`,
      sensor_missing_interval: `${d.label || 'A sensor log'} has no readings${dur ? ` for ${dur}` : ''}${where}.`,
      unsynchronized_source: `${d.label || 'A source'} has no recorded clock relation to the others, so its events are not placed on the shared timeline.`,
      no_camera_calibration: `${d.label || 'A camera'} is not calibrated, so paths are in image pixels and no distances or speeds can be stated.`,
      unconfirmed_vehicle_identity: `${d.count ?? 'Some'} tracked road users are not confirmed as any known vehicle, so witness statements cannot be compared with them.`,
      untestable_claim: `A statement (“${(d.quote || '').slice(0, 80)}”) could not be checked: ${(d.reasons || []).join('; ') || 'no comparable evidence'}.`,
      low_visual_quality: `${d.label || 'A video'} is dark or blurred, so detections are less reliable.`,
    }[g.gap_type] || `${(GAP_TITLE[g.gap_type] || g.gap_type)}.`;
    add({ id: `gap:${g.id}`, kind: 'gap', ruleId: g.gap_type, classification: 'unknown', priority: g.gap_type === 'video_missing_interval' || g.gap_type === 'no_visual_coverage_at_candidate_collision' ? 75 : 40, title: GAP_TITLE[g.gap_type] || g.gap_type.replace(/_/g, ' '),
      summary, interval: g.scope?.case_from_ms != null ? { start: g.scope.case_from_ms, end: g.scope.case_to_ms, at: g.scope.case_from_ms } : null,
      uncertainty: 'The missing evidence cannot be reconstructed from this footage.', action: g.recommendation, review: reviewOf(g.id), technical: { text: JSON.stringify({ scope: g.scope, details: g.details }), ruleId: g.gap_type, refs: g.refs } });
  });
  finds.filter((f) => f.kind === 'open_question').forEach((f) => add({ id: `q:${f.id}`, kind: 'question', ruleId: 'open_question', classification: 'unknown', priority: 45, title: 'A comparison could not be made', summary: f.text, interval: interval((f.ref_ids || []).map((i) => ev[i])),
    actorIds: [], uncertainty: 'Insufficient evidence for this comparison.', action: 'Obtain the missing identity or time information.', review: f, technical: { text: f.text, ruleId: 'open_question', refs: f.ref_ids } }));

  // ---- analysis provenance (what actually produced the boxes)
  const videoEv = evidence.filter((e) => e.kind === 'cctv' || e.kind === 'dashcam');
  const runsOf = (v) => (modelRuns[v.id] || []).filter((r) => r.stage === 'detect' && ['completed', 'partially_completed'].includes(r.status)).sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  const dets = videoEv.flatMap(runsOf);
  const feeding = videoEv.map((v) => runsOf(v).slice(-1)[0]).filter(Boolean); // tracking runs on the latest detection run of each video
  const kindOf = (r) => (String(r.model_id).startsWith('oracle:') ? 'imported-synthetic' : String(r.model_id).startsWith('external:') ? 'imported-external' : 'real-detector');
  const kinds = [...new Set(feeding.map(kindOf))];
  const detection = !videoEv.length ? 'no-video' : feeding.length === 0 ? 'none' : kinds.length > 1 ? 'mixed' : kinds[0];
  const otherRuns = dets.filter((r) => !feeding.includes(r)).map((r) => `${r.model_id}${r.metrics?.boxes != null ? ` (${r.metrics.boxes} boxes)` : ''}`);
  const active = jobs.filter((j) => ['pending', 'validating', 'processing'].includes(j.status));
  const tracked = new Set(trajs.map((t) => t.track_ref?.track_pk).filter(Boolean)).size;
  const analysis = { detection, models: [...new Set(feeding.map((r) => `${r.model_id}`))], otherRuns: [...new Set(otherRuns)], tracks: tracked, running: active.length, failed: jobs.filter((j) => j.status === 'failed').length };

  // ---- headline
  const cands = all.filter((e) => ['possible_collision', 'collision_flag'].includes(e.event_type) && e.start_ms != null && e.category !== 'inference').sort((a, b) => a.start_ms - b.start_ms);
  const near = all.filter((e) => e.event_type === 'possible_near_miss' && e.start_ms != null).sort((a, b) => a.start_ms - b.start_ms);
  const lead = cands.find((e) => e.event_type === 'possible_collision') || cands[0];
  const nCon = cons.length;
  let headline;
  if (analysis.running) headline = 'Analysis is still running. This overview will update when processing finishes.';
  else if (lead) {
    const both = crbs.some((c) => c.rule_id === 'COR-COLL-01' && c.events.includes(lead.id));
    const src = both ? 'Both the camera and a vehicle sensor point to this moment.' : lead.source_type === 'sensor' ? 'Only a vehicle sensor points to this moment.' : 'Only the camera analysis points to this moment.';
    const nColl = cands.filter((e) => e.event_type === 'possible_collision').length;
    headline = nColl > 3 && !both ? `The video analysis flagged ${nColl} possible-collision candidates, the first ${about(lead.start_ms)}. They come from overlapping boxes only, so on a busy scene most may be false alarms; none is confirmed.${nCon ? ` ${nCon} source conflict${nCon > 1 ? 's' : ''} need${nCon > 1 ? '' : 's'} review.` : ''}`
      : `A possible collision involving ${names(lead)} is indicated ${about(lead.start_ms)}. ${src}${nCon ? ` ${nCon} source conflict${nCon > 1 ? 's' : ''} need${nCon > 1 ? '' : 's'} review.` : ''} Physical contact is not confirmed.`;
  } else if (near.length) headline = `A possible near miss involving ${names(near[0])} is indicated ${about(near[0].start_ms)}. No contact was identified.${nCon ? ` ${nCon} source conflict${nCon > 1 ? 's' : ''} need${nCon > 1 ? '' : 's'} review.` : ''}`;
  else if (!tracked && !all.some((e) => e.source_type === 'sensor')) headline = analysis.detection === 'none' ? 'No detections are stored for the video yet, so nothing can be said about movement or contact.' : 'Video analysis has not produced any tracked road users for this case, so nothing can be said about movement or contact.';
  else headline = 'No collision or near miss was identified in the analysed evidence.';

  const stats = { sources: evidence.length, tracked, significant: all.filter(isSignificant).length, contradictions: nCon, gaps: gaps.length };
  const found = findings.filter((f) => ['contradiction', 'corroboration', 'inference', 'event'].includes(f.kind)).sort((a, b) => b.priority - a.priority).slice(0, 5);
  const uncertain = findings.filter((f) => f.kind === 'gap' || f.kind === 'question').sort((a, b) => b.priority - a.priority);
  const limits = [];
  if (lead) {
    limits.push({ id: 'limit:contact', kind: 'limit', classification: 'unknown', title: 'Physical contact cannot be confirmed from the image alone', summary: 'The analysis sees where tracked boxes overlap, not whether vehicles touch.', interval: interval([lead]), actorIds: [], supporting: [], contradicting: [], priority: 74, uncertainty: null, action: null, technical: { text: 'Image-space box overlap is not physical contact.', ruleId: 'limit', refs: [lead.id] } });
    limits.push({ id: 'limit:time', kind: 'limit', classification: 'unknown', title: 'The exact impact time is uncertain', summary: `The possible contact time is known only to about ${pm(lead.uncertainty_ms)} (frame rate and clock limits).`, interval: interval([lead]), actorIds: [], supporting: [], contradicting: [], priority: 73, uncertainty: null, action: null, technical: { text: `uncertainty_ms=${lead.uncertainty_ms}; basis=${lead.uncertainty_basis}`, ruleId: 'limit', refs: [lead.id] } });
  }
  const attention = [];
  const pushA = (text, action, findingId, priority) => attention.push({ text, action, findingId, priority });
  findings.filter((f) => f.kind === 'contradiction').forEach((f) => pushA(f.title, f.action, f.id, 100));
  if (lead) pushA('Review the video frames around the possible contact', 'Open the frame', findings.find((f) => f.supporting.some((s) => s.eventId === lead.id))?.id, 90);
  findings.filter((f) => f.kind === 'gap' && ['unconfirmed_vehicle_identity', 'unsynchronized_source', 'clock_inconsistency', 'video_missing_interval', 'no_visual_coverage_at_candidate_collision'].includes(f.ruleId)).forEach((f) => pushA(f.title, f.action, f.id, 80));
  const unrev = finds.filter((f) => f.review_status === 'unreviewed').length;
  const attentionList = attention.sort((a, b) => b.priority - a.priority).slice(0, 5);
  const byId = Object.fromEntries([...findings, ...limits].map((f) => [f.id, f]));
  return { findings: [...findings].sort((a, b) => b.priority - a.priority), overview: { headline, stats, analysis, found, uncertain: [...limits, ...uncertain], attention: attentionList, unreviewed: unrev, lead: lead || null }, byId, events: ev };
}

export const CLASS_LABEL = { observed: 'Observed', reported: 'Reported', inferred: 'Inferred by rule', unknown: 'Unknown' };
export const CLASS_HELP = {
  observed: 'Measured by a machine from the evidence (detector, tracker or sensor).',
  reported: 'Stated by a person (witness testimony); not verified.',
  inferred: 'Derived by a rule from other records; a possibility, not a fact.',
  unknown: 'Missing or unavailable evidence; the system cannot say.',
};
export const ANALYSIS_LABEL = {
  'real-detector': 'Boxes from a real detector run on the uploaded video',
  'imported-synthetic': 'Boxes imported from a synthetic world model (not a detector)',
  'imported-external': 'Boxes imported from another detector',
  mixed: 'Boxes from different sources in different videos',
  none: 'No detections stored for the video',
  'no-video': 'No video in this case',
};
export { formatTime };

/** The case's declared designation can disagree with its evidence (the backend accepts synthetic files in a real case and keeps `designation`).
 *  Returns the designation to display and, when they disagree, a plain explanation. Synthetic data must never pass as real. */
export function effectiveDesignation(designation, evidence = []) {
  const flagged = evidence.filter((e) => e.synthetic);
  const real = evidence.filter((e) => !e.synthetic);
  if (designation !== 'synthetic' && designation !== 'mixed' && flagged.length > 0) return { value: 'mixed', warning: `This case is declared ${designation}, but ${evidence.length === 1 ? 'its evidence file is' : `${flagged.length} of its ${evidence.length} evidence files ${flagged.length > 1 ? 'are' : 'is'}`} marked synthetic (${flagged.map((e) => e.original_filename).join(', ')}). Treat its findings as not purely real.` };
  if (designation === 'synthetic' && real.length > 0) return { value: 'mixed', warning: `This case is declared synthetic, but ${real.length} evidence file${real.length > 1 ? 's' : ''} ${real.length > 1 ? 'are' : 'is'} not marked synthetic (${real.map((e) => e.original_filename).join(', ')}).` };
  return { value: designation, warning: null };
}
