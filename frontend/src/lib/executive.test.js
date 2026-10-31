import { describe, expect, it } from 'vitest';
import { buildModel } from './overview';
import { pickMoment } from './moment';
import { buildExecutive } from './executive';

const E = (id, type, ms, extra = {}) => ({ id, event_type: type, category: 'machine_detection', start_ms: ms, end_ms: ms, uncertainty_ms: 100, uncertainty_basis: 'x', source_type: 'video_cctv', source_id: 'ev1', title: `${type} ${id}`, observations: {}, provenance: {}, ...extra });
const actors = [];
const evidence = [{ id: 'ev1', kind: 'cctv' }, { id: 'imu', kind: 'sensor_csv' }, { id: 'st1', kind: 'witness_text' }];
const run = (model_id) => ({ id: 'r', stage: 'detect', model_id, status: 'completed', started_at: '2026-01-01', metrics: {} });
const build = (events, extra = {}) => {
  const model = buildModel({ events, unplaced: [], cons: [], crbs: extra.crbs || [], gaps: extra.gaps || [], finds: [], trajs: [], actors, evidence, modelRuns: { ev1: [run('yolo26s')] }, jobs: [] });
  const moment = pickMoment(events, extra.crbs || []);
  return { model, moment, x: buildExecutive({ model, moment, motions: extra.motions || [], events, evidence, actors, trajs: [], gaps: extra.gaps || [], nameOf: () => 'North camera' }) };
};

describe('executive summary', () => {
  const coll = E('c1', 'possible_collision', 4600, { observations: { track_ids: [3, 4], source_time_ms: [4600, 4600] } });
  const flag = E('s1', 'collision_flag', 4850, { source_type: 'sensor', source_id: 'imu' });
  const brake = E('b1', 'hard_braking', 4000, { source_type: 'sensor', source_id: 'imu' });
  const crb = [{ id: 'k1', rule_id: 'COR-COLL-01', events: ['c1', 's1'], independent: true, independence_reason: 'x', explanation: 'raw' }];

  it('answers what happened in five plain sentences built from the records', () => {
    const { x } = build([coll, flag, brake], { crbs: crb });
    expect(x.sentences).toHaveLength(5);
    expect(x.sentences[0]).toBe('A possible collision is indicated at about 4.6 s, supported by both a camera and a vehicle sensor.');
    expect(x.sentences[1]).toMatch(/Possibly involved: road user #3, road user #4 \(identities not confirmed\)/);
    expect(x.sentences[2]).toMatch(/1 recording, 1 sensor log and 1 witness statement/);
    expect(x.sentences[4]).toMatch(/^Not established:/);
  });
  it('lists factors with their evidence, and never states a cause', () => {
    const motions = [{ kind: 'sped_up', text: 'car #3 moved faster just before this moment (0.5 to 1.6 vehicle-lengths per second).' }];
    const { x } = build([coll, flag, brake], { crbs: crb, motions });
    const ids = x.factors.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['fast', 'sensor']));
    expect(x.factors.find((f) => f.id === 'sensor').supporting.map((r) => r.eventId)).toContain('b1');
    expect(x.factors.every((f) => f.supporting.length > 0 || f.classification === 'unknown')).toBe(true);
    const text = JSON.stringify([x.sentences, x.factors.map((f) => [f.title, f.summary])]);
    expect(text).toMatch(/not established causes/);
    expect(text).not.toMatch(/caused|because of|fault|responsible|blame/i);
  });
  it('says so when there is no moment instead of inventing an explanation', () => {
    const { x, moment } = build([E('e1', 'vehicle_slowing', 1000)]);
    expect(moment).toBeNull();
    expect(x.sentences[0]).toBe('The available evidence does not show a collision or a near miss.');
    expect(x.sentences[1]).toBe('No road user can be tied to this moment from the stored records.');
    expect(x.factors).toEqual([]);
  });
  it('treats many camera-only candidates as a lead, not a finding', () => {
    const many = Array.from({ length: 6 }, (_, i) => E(`m${i}`, 'possible_collision', 1000 + i * 300, { observations: { track_ids: [i] } }));
    const { x } = build(many);
    expect(x.sentences[0]).toMatch(/flagged 6 possible contact moments/);
    expect(x.sentences[0]).toMatch(/a lead, not a finding/);
  });
  it('a missing-footage gap at the moment becomes an unknown factor', () => {
    const gaps = [{ id: 'g1', gap_type: 'video_missing_interval', scope: { case_from_ms: 4000, case_to_ms: 5200 }, details: { duration_ms: 1200, label: 'CCTV' }, recommendation: 'Get the full file.', refs: ['ev1'] }];
    const { x } = build([coll], { gaps });
    const g = x.factors.find((f) => f.classification === 'unknown');
    expect(g.title).toBe('Footage is missing around the possible contact');
    expect(g.status).toBe('not established');
    expect(x.actions.map((a) => a.text)).toContain('Get the full file.');
  });
});
