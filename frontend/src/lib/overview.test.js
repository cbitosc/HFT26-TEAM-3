import { describe, expect, it } from 'vitest';
import { buildModel } from './overview';

const E = (id, o = {}) => ({ id, category: 'machine_detection', event_type: 'vehicle_slowing', title: `t ${id}`, actor_id: null, start_ms: 1000, end_ms: 1000, uncertainty_ms: 100, uncertainty_basis: 'clock_bound+sampling', source_type: 'video_cctv', observations: {}, provenance: {}, ...o });
const actors = [{ id: 'A', label: 'Vehicle A (blue car)' }, { id: 'B', label: 'Vehicle B (white car)' }];
const vid = { id: 'v1', kind: 'cctv' };
const run = (model_id, extra = {}) => ({ id: model_id, stage: 'detect', model_id, status: 'completed', started_at: '2026-01-01T00:00:00', metrics: {}, ...extra });
const base = { evidence: [vid], actors, modelRuns: { v1: [run('yolo26s')] } };

describe('overview never says more than the records support', () => {
  it('empty case: zero counts, no findings, no movement claims', () => {
    const m = buildModel({ ...base, evidence: [vid] });
    expect(m.findings).toEqual([]);
    expect(m.overview.found).toEqual([]);
    expect(m.overview.stats).toMatchObject({ tracked: 0, significant: 0, contradictions: 0, gaps: 0 });
    expect(m.overview.headline).toMatch(/has not produced any tracked road users/);
    expect(m.overview.headline).not.toMatch(/possible collision|possible near miss/);
  });
  it('a collision candidate yields a hedged headline with its source and an unconfirmed-contact limit', () => {
    const coll = E('c1', { event_type: 'possible_collision', start_ms: 4600, observations: { actors: ['A', 'B'], abrupt_speed_changes: [{}] } });
    const m = buildModel({ ...base, events: [coll] });
    expect(m.overview.headline).toContain('A possible collision involving Vehicle A (blue car) and Vehicle B (white car) is indicated at about 4.6 s.');
    expect(m.overview.headline).toContain('Only the camera analysis points to this moment.');
    expect(m.overview.headline).toContain('Physical contact is not confirmed.');
    expect(m.overview.uncertain.map((f) => f.id)).toEqual(expect.arrayContaining(['limit:contact', 'limit:time']));
    const f = m.findings.find((x) => x.kind === 'event');
    expect(f.classification).toBe('observed');
    expect(f.summary).toContain('cannot confirm physical contact');
  });
  it('a sensor corroboration says both sources point to the moment and classifies as observed', () => {
    const coll = E('c1', { event_type: 'possible_collision', start_ms: 4600, observations: { actors: ['A', 'B'] } });
    const flag = E('s1', { event_type: 'collision_flag', source_type: 'sensor', start_ms: 4850 });
    const m = buildModel({ ...base, events: [coll, flag], crbs: [{ id: 'k1', rule_id: 'COR-COLL-01', events: ['c1', 's1'], independent: true, independence_reason: 'x', explanation: 'raw text' }] });
    expect(m.overview.headline).toContain('Both the camera and a vehicle sensor point to this moment.');
    const f = m.findings.find((x) => x.ruleId === 'COR-COLL-01');
    expect(f.classification).toBe('observed');
    expect(f.technical.text).toBe('raw text');
    expect(f.supporting).toHaveLength(2);
  });
  it('a witness contradiction is inferred by rule, names both sides and keeps the rule text under technical', () => {
    const claim = E('w1', { category: 'witness_claim', source_type: 'witness', actor_id: 'A', title: 'Witness 2: “turn left”', observations: { code_derived_maneuver: 'left' } });
    const track = E('m1', { event_type: 'vehicle_maneuver_observed', actor_id: 'A' });
    const con = { id: 'x1', rule_id: 'CON-ACTION-01', event_a: 'w1', event_b: 'm1', strength: 'clear', basis: { witness_maneuver: 'left', video_maneuver: 'straight', benign_explanations: ['Different moment.'] }, explanation: 'long rule text', unresolved_questions: [] };
    const m = buildModel({ ...base, events: [track], unplaced: [claim], cons: [con] });
    const f = m.findings[0];
    expect(f.classification).toBe('inferred');
    expect(f.summary).toBe('Witness 2 says Vehicle A (blue car) turned left, but the camera track of Vehicle A (blue car) shows it continuing straight.');
    expect(f.contradicting[0].classification).toBe('reported');
    expect(f.supporting[0].classification).toBe('observed');
    expect(f.uncertainty).toBe('Different moment.');
    expect(f.technical.text).toBe('long rule text');
    expect(m.overview.attention[0].text).toBe('Camera does not match a witness account');
  });
  it('gaps and open questions are classified unknown and never invent content', () => {
    const gap = { id: 'g1', gap_type: 'video_missing_interval', scope: { case_from_ms: 4200, case_to_ms: 5600 }, details: { duration_ms: 1400, label: 'CCTV' }, recommendation: 'Get the full file.', refs: ['ev'] };
    const m = buildModel({ ...base, gaps: [gap], finds: [{ id: 'f1', kind: 'open_question', ref_ids: ['e'], text: 'Could not compare.', review_status: 'unreviewed' }] });
    expect(m.findings.map((f) => f.classification)).toEqual(expect.arrayContaining(['unknown']));
    expect(m.findings.every((f) => f.classification === 'unknown')).toBe(true);
    const g = m.findings.find((f) => f.kind === 'gap');
    expect(g.summary).toContain('has no frames for 1.4 s between 4.2 s and 5.6 s');
    expect(g.action).toBe('Get the full file.');
  });
  it('detection provenance follows the run that feeds tracking and names other runs', () => {
    const runs = { v1: [run('yolo26s', { started_at: '2026-01-01T00:00:00', metrics: { boxes: 0 } }), run('oracle:synthetic-world', { started_at: '2026-01-01T00:01:00', metrics: { boxes: 100 } })] };
    const m = buildModel({ ...base, modelRuns: runs });
    expect(m.overview.analysis.detection).toBe('imported-synthetic');
    expect(m.overview.analysis.models).toEqual(['oracle:synthetic-world']);
    expect(m.overview.analysis.otherRuns).toEqual(['yolo26s (0 boxes)']);
    expect(buildModel({ ...base, modelRuns: { v1: [run('yolo26s')] } }).overview.analysis.detection).toBe('real-detector');
    expect(buildModel({ ...base, modelRuns: { v1: [] } }).overview.analysis.detection).toBe('none');
  });
  it('does not describe findings while processing is still running', () => {
    const m = buildModel({ ...base, jobs: [{ id: 'j', status: 'processing' }] });
    expect(m.overview.headline).toMatch(/still running/);
  });
  it('never produces a percentage or probability anywhere in the overview text', () => {
    const coll = E('c1', { event_type: 'possible_collision', start_ms: 4600, observations: { actors: ['A'] } });
    const m = buildModel({ ...base, events: [coll] });
    const text = JSON.stringify([m.overview.headline, m.findings.map((f) => [f.title, f.summary, f.uncertainty])]);
    expect(text).not.toMatch(/%|probab|likel|confidence score/i);
  });
  it('a busy real scene: many uncorroborated candidates become one finding, not dozens, and the headline does not pick one as the incident', () => {
    const cands = Array.from({ length: 12 }, (_, i) => E(`c${i}`, { event_type: 'possible_collision', start_ms: 4000 + i * 200, observations: { track_ids: [3, 4], abrupt_speed_changes: [{}] } }));
    const noise = Array.from({ length: 300 }, (_, i) => E(`p${i}`, { event_type: 'potential_interaction', start_ms: i * 40 }));
    const m = buildModel({ ...base, events: [...cands, ...noise] });
    const grouped = m.findings.filter((f) => f.kind === 'event');
    expect(grouped).toHaveLength(1);
    expect(grouped[0].title).toBe('12 possible vehicle contacts were flagged in the video');
    expect(grouped[0].supporting).toHaveLength(8);
    expect(grouped[0].technical.refs).toHaveLength(12);
    expect(m.overview.headline).toMatch(/flagged 12 possible-collision candidates/);
    expect(m.overview.headline).toMatch(/none is confirmed/);
    expect(m.overview.stats.significant).toBe(12); // potential_interaction is not a key event
  });
  it('few candidates keep their own findings and name tracks, not invented vehicles, when identity is unconfirmed', () => {
    const c = E('c1', { event_type: 'possible_collision', start_ms: 4800, observations: { track_ids: [3, 7] } });
    const m = buildModel({ ...base, events: [c] });
    expect(m.overview.headline).toContain('tracks #3 and #7 (identity not confirmed)');
    expect(m.findings).toHaveLength(1);
  });
});

import { effectiveDesignation } from './overview';
describe('real and synthetic never mix silently', () => {
  const ev = (name, synthetic) => ({ original_filename: name, synthetic });
  it('a real case containing a synthetic file is shown as mixed with the file named', () => {
    const r = effectiveDesignation('real', [ev('crash.mp4', false), ev('demo.mp4', true)]);
    expect(r.value).toBe('mixed');
    expect(r.warning).toMatch(/declared real, but 1 of its 2 evidence files is marked synthetic \(demo\.mp4\)/);
  });
  it('a synthetic case containing a non-synthetic file is also flagged', () => {
    expect(effectiveDesignation('synthetic', [ev('a', true), ev('b', false)]).value).toBe('mixed');
  });
  it('consistent cases are untouched', () => {
    expect(effectiveDesignation('real', [ev('a', false)])).toEqual({ value: 'real', warning: null });
    expect(effectiveDesignation('synthetic', [ev('a', true)])).toEqual({ value: 'synthetic', warning: null });
    expect(effectiveDesignation('staged', [])).toEqual({ value: 'staged', warning: null });
  });
});
