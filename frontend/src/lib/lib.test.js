import { describe, expect, it } from 'vitest';
import { formatTime, formatUncertainty, rulerTicks, tickLabel, labelled } from './time';
import { byStart, covers, findActiveEvent, resolveActive } from './active';
import { containTransform, latestSample, mapBox } from './overlay';
import { acknowledge, createSeekState, isSettled, request } from './seek';
import { useWorkspace } from '../store';

describe('timestamp formatting', () => {
  it('formats MM:SS.mmm with zero padding', () => {
    expect(formatTime(0)).toBe('00:00.000');
    expect(formatTime(4600)).toBe('00:04.600');
    expect(formatTime(61_234)).toBe('01:01.234');
    expect(formatTime(59_999.6)).toBe('01:00.000');
  });
  it('adds hours only from one hour', () => {
    expect(formatTime(3_599_999)).toBe('59:59.999');
    expect(formatTime(3_600_000)).toBe('1:00:00.000');
  });
  it('never invents a time for missing values', () => {
    expect(formatTime(null)).toBe('--:--.---');
    expect(formatTime(undefined)).toBe('--:--.---');
    expect(formatTime(NaN)).toBe('--:--.---');
  });
  it('marks negative media offsets and labels the basis', () => {
    expect(formatTime(-250)).toBe('−00:00.250');
    expect(labelled(1500, 'case')).toBe('case 00:01.500');
    expect(formatUncertainty(100)).toBe('±0.100 s');
    expect(formatUncertainty(null)).toBe('');
  });
  it('ruler steps adapt to zoom and labels stay precise', () => {
    const wide = rulerTicks(0, 10_000);
    expect(wide.step).toBe(1000);
    expect(tickLabel(2000, wide.step)).toBe('00:02');
    const tight = rulerTicks(4000, 600);
    expect(tight.step).toBe(50);
    expect(tickLabel(4050, tight.step)).toBe('00:04.050');
    expect(tight.ticks.every((t) => t >= 4000 && t <= 4600)).toBe(true);
  });
});

const ev = (id, start, end, unc = 100) => ({ id, start_ms: start, end_ms: end, uncertainty_ms: unc });
describe('active event selection', () => {
  const events = [ev('a', 1000, 1000), ev('b', 2000, 5000), ev('c', 4600, 4600), ev('d', 9000, 9000)].sort(byStart);
  it('picks the latest started event that covers the time', () => {
    expect(findActiveEvent(events, 4650).id).toBe('c');
    expect(findActiveEvent(events, 3000).id).toBe('b');
    expect(findActiveEvent(events, 1050).id).toBe('a');
  });
  it('returns null in a gap and before the first event', () => {
    expect(findActiveEvent(events, 100)).toBeNull();
    expect(findActiveEvent(events, 7000)).toBeNull();
  });
  it('widens instants by uncertainty and a short tail, not more', () => {
    expect(covers(ev('x', 1000, 1000, 100), 1399)).toBe(true);
    expect(covers(ev('x', 1000, 1000, 100), 1401)).toBe(false);
  });
  it('an explicit selection holds until the playhead moves away', () => {
    const computed = events[1];
    expect(resolveActive({ computed, pinnedId: 'c', pinnedAt: 4600, currentMs: 4620 })).toBe('c');
    expect(resolveActive({ computed, pinnedId: 'c', pinnedAt: 4600, currentMs: 4900 })).toBe('b');
    expect(resolveActive({ computed: null, pinnedId: null, pinnedAt: null, currentMs: 0 })).toBeNull();
  });
});

describe('overlay coordinate mapping', () => {
  it('letterboxes a 640x360 video in a square box', () => {
    const tf = containTransform(640, 360, 800, 800);
    expect(tf.scale).toBeCloseTo(1.25);
    expect(tf.ox).toBe(0);
    expect(tf.oy).toBeCloseTo(175);
    const r = mapBox([64, 36, 128, 72], tf);
    expect(r.x).toBeCloseTo(80);
    expect(r.y).toBeCloseTo(175 + 45);
    expect(r.w).toBeCloseTo(80);
    expect(r.h).toBeCloseTo(45);
  });
  it('pillarboxes a tall video in a wide box', () => {
    const tf = containTransform(360, 640, 1000, 640);
    expect(tf.scale).toBe(1);
    expect(tf.ox).toBe(320);
    expect(tf.oy).toBe(0);
  });
  it('non-square pixels: boxes in the coded 1280x720 grid land on the 1280x723 displayed picture', () => {
    const tf = containTransform(1280, 723, 1280, 723, 1280, 720);
    const r = mapBox([100, 360, 200, 720], tf);
    expect(r.y).toBeCloseTo(360 * (723 / 720), 5);
    expect(r.y + r.h).toBeCloseTo(723, 5); // the bottom edge of the frame is the bottom of the picture
    expect(r.x).toBeCloseTo(100, 5);
  });
  it('draws only a recent sample and never interpolates', () => {
    const items = [{ time_ms: 0 }, { time_ms: 200 }, { time_ms: 400 }];
    expect(latestSample(items, 250).time_ms).toBe(200);
    expect(latestSample(items, 370).time_ms).toBe(200);
    expect(latestSample(items, 390).time_ms).toBe(400); // 20 ms tolerance for video clock jitter
    expect(latestSample(items, 900)).toBeNull();
    expect(latestSample([], 100)).toBeNull();
  });
});

describe('latest-wins seeking', () => {
  it('only the newest acknowledgement settles the seek', () => {
    let s = createSeekState();
    s = request(s, 1000); const id1 = s.latest;
    s = request(s, 2000); const id2 = s.latest;
    s = request(s, 3000); const id3 = s.latest;
    expect([id1, id2, id3]).toEqual([1, 2, 3]);
    s = acknowledge(s, id1);
    expect(isSettled(s)).toBe(false);
    s = acknowledge(s, id2);
    expect(isSettled(s)).toBe(false);
    s = acknowledge(s, id3);
    expect(isSettled(s)).toBe(true);
    expect(s.ms).toBe(3000);
  });
  it('a late stale ack after the newest one changes nothing', () => {
    let s = request(request(createSeekState(), 1), 2);
    s = acknowledge(s, 2);
    const after = acknowledge(s, 1);
    expect(after).toBe(s);
  });
  it('the store issues increasing ids, moves the clock to the newest target and ignores stale acks', () => {
    const st = useWorkspace.getState();
    st.reset('c', 's');
    const a = useWorkspace.getState().requestSeek(1000);
    const b = useWorkspace.getState().requestSeek(2500);
    expect(b).toBe(a + 1);
    expect(useWorkspace.getState().currentMs).toBe(2500);
    useWorkspace.getState().ackSeek(a);
    expect(useWorkspace.getState().seekSettled).toBe(false);
    useWorkspace.getState().ackSeek(b);
    expect(useWorkspace.getState().seekSettled).toBe(true);
  });
  it('selecting an event pins it at the seek time', () => {
    useWorkspace.getState().reset('c', 's');
    useWorkspace.getState().selectEvent('evt1', 4600);
    expect(useWorkspace.getState()).toMatchObject({ activeEventId: 'evt1', pinnedId: 'evt1', pinnedAt: 4600 });
  });
});

import { formatIncidentAt, splitIncidentAt, toIncidentAt } from './incident';
describe('incident time keeps the stated offset', () => {
  it('builds the API value only with an offset and never assumes one', () => {
    expect(toIncidentAt('2026-10-30T10:32', '+05:30')).toBe('2026-10-30T10:32:00+05:30');
    expect(toIncidentAt('', '+05:30')).toBeNull();
    expect(() => toIncidentAt('2026-10-30T10:32', '')).toThrow(/time zone offset/);
  });
  it('shows a stored value as entered, without converting zones', () => {
    expect(splitIncidentAt('2026-10-30T10:32:00+05:30')).toEqual({ local: '2026-10-30T10:32', offset: '+05:30' });
    expect(formatIncidentAt('2026-10-30T10:32:00+05:30')).toBe('2026-10-30 10:32');
    expect(formatIncidentAt(null)).toBeNull();
    expect(formatIncidentAt('garbage')).toBeNull();
  });
});
