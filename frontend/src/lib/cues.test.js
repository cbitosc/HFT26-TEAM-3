import { describe, expect, it } from 'vitest';
import { summarizeCues } from './cues';

const f = (t, ...confs) => ({ time_ms: t, boxes: [{ is_accident_cue: false, confidence: 0.9 }, ...confs.map((c) => ({ is_accident_cue: true, confidence: c }))] });

describe('summarizeCues', () => {
  it('reports nothing when no box is a cue', () => {
    expect(summarizeCues([{ time_ms: 0, boxes: [{ is_accident_cue: false, confidence: 0.9 }] }])).toMatchObject({ moments: [], isolated: 0, total: 0 });
  });
  it('groups nearby cue frames into one persistent moment with its peak', () => {
    const s = summarizeCues([f(1000, 0.4), f(1400, 0.7), f(1800, 0.5), f(9000, 0.45)]);
    expect(s.moments).toHaveLength(1);
    expect(s.moments[0]).toMatchObject({ startMs: 1000, endMs: 1800, frames: 3, peak: 0.7 });
    expect(s.isolated).toBe(1);
    expect(s.persistentTimes.has(1400)).toBe(true);
    expect(s.persistentTimes.has(9000)).toBe(false);
  });
  it('splits clusters that are further apart than the gap', () => {
    const s = summarizeCues([f(0, 0.5), f(500, 0.5), f(5000, 0.5), f(5500, 0.5)]);
    expect(s.moments.map((m) => m.startMs)).toEqual([0, 5000]);
  });
  it('is order independent and tolerates missing boxes', () => {
    expect(summarizeCues([f(500, 0.5), { time_ms: 0 }, f(0, 0.5)]).moments).toHaveLength(1);
  });
});
