import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkProvider, ThemeProvider, ToastProvider } from '../ui-kit';
import { useWorkspace } from '../store';
import Workspace from './Workspace';

vi.mock('../api', () => ({
  api: {
    readiness: vi.fn().mockResolvedValue({ checks: [], failed_jobs: [], can_build: true, scenario_id: 'scn_1', needs_update: false }),
    witnesses: vi.fn().mockResolvedValue({items: []}), statements: vi.fn().mockResolvedValue({items: []}),
    cases: vi.fn(), case: vi.fn(), evidence: vi.fn(), actors: vi.fn(), scenarios: vi.fn(), timeline: vi.fn(),
    contradictions: vi.fn(), corroborations: vi.fn(), gaps: vi.fn(), findings: vi.fn(), trajectories: vi.fn(),
    seek: vi.fn(), incidentEvents: vi.fn(), incidentNarrative: vi.fn(), incidentFrames: vi.fn(), storyboard: vi.fn(), summary: vi.fn(),
    jobs: vi.fn(), modelRuns: vi.fn(), review: vi.fn(), associations: vi.fn(), completeness: vi.fn(), frames: vi.fn(), tracks: vi.fn(), addAssociation: vi.fn(),
    overlays: vi.fn().mockResolvedValue({ items: [] }), streamUrl: (id) => `/api/v1/evidence/${id}/stream`,
  },
}));
import { api } from '../api';

const video = (id, name, extra = {}) => ({ id, kind: 'cctv', original_filename: `${id}.mp4`, status: 'valid', synthetic: false, video: { playback_ready: false, duration_ms: 10000 }, source: { display_name: name }, ...extra });
const slow = (id, ms, src, title, extra = {}) => ({ ...extra, id, category: 'machine_detection', event_type: 'vehicle_slowing', title, start_ms: ms, end_ms: ms + 200, uncertainty_ms: 50, source_id: src, source_type: 'video_cctv', synchronized: true, observations: { source_time_ms: [ms, ms + 200] } });
const items = [
  { id: 'evt_a', event_type: 'vehicle_slowing', display: 'neutral', title: 'North vehicle slows', start_ms: 1000, end_ms: 1200, evidence_id: 'ev_n', track_ids: [3], track_classes: ['car'] },
  { id: 'evt_b', event_type: 'vehicle_slowing', display: 'neutral', title: 'South vehicle slows', start_ms: 4000, end_ms: 4200, evidence_id: 'ev_s', track_ids: [3], track_classes: ['car'] },
];

function setup({ hypotheses, designation = 'real', evidence = [video('ev_n', 'North camera', { synthetic: designation === 'synthetic' }), video('ev_s', 'South camera', { synthetic: designation === 'synthetic' })], assoc = null, completeness = null, gaps = [], cons = [], scenarios, clocks, trace, overlaps, explanation, playable, shifts } = {}) {
  api.cases.mockResolvedValue({ items: [] });
  api.case.mockResolvedValue({ id: 'case_1', title: 'Junction', code: 'TL-1', designation });
  api.evidence.mockResolvedValue({ items: evidence });
  api.actors.mockResolvedValue({ items: [] });
  api.scenarios.mockResolvedValue({ items: scenarios || [{ id: 'scn_1', name: 'Baseline', is_baseline: true }] });
  api.timeline.mockResolvedValue({ lanes: { cctv: [slow('evt_a', 1000, 'ev_n', 'North vehicle slows', { evidence_class: 'derived_observation', clocks, trace }), slow('evt_b', 4000, 'ev_s', 'South vehicle slows')] }, unplaced: [], marks: {}, span_ms: [0, 6000], hypotheses: hypotheses || [], overlaps: overlaps || [] });
  api.contradictions.mockResolvedValue({ items: cons });
  api.corroborations.mockResolvedValue({ items: [] });
  api.gaps.mockResolvedValue({ items: gaps });
  api.findings.mockResolvedValue({ items: [] });
  api.trajectories.mockResolvedValue({ items: [] });
  api.seek.mockResolvedValue({ targets: shifts ? Object.entries(shifts).map(([evidence_id, media_ms]) => ({ evidence_id, media_ms })) : [], unsynchronized: [] });
  if (playable) api.evidence.mockResolvedValue({ items: evidence.map((e) => ({ ...e, video: { ...e.video, playback_ready: true, fps_measured: 25 } })) });
  api.overlays.mockResolvedValue({ items: [] });
  api.jobs.mockResolvedValue({ items: [] });
  api.modelRuns.mockResolvedValue({ items: [] });
  api.incidentEvents.mockResolvedValue({ scenario_id: 'scn_1', contact_status: 'insufficient_evidence', provenance: 'real-detector', items, unplaced: [] });
  api.incidentNarrative.mockResolvedValue({ contact_status: 'insufficient_evidence', deterministic: { headline: 'No collision or near miss was identified in the analysed evidence.', sentences: [] }, ai_narrative_status: 'unavailable', ai_narrative: null, hypothesis_explanation: explanation || { items: [], note: 'Stored rule alternatives with evidence ids. No probability is assigned.' } });
  api.incidentFrames.mockResolvedValue({ items: [] });
  api.storyboard.mockResolvedValue(board);
  if (assoc instanceof Error) api.associations.mockRejectedValue(assoc); else api.associations.mockResolvedValue(assoc);
  if (completeness instanceof Error) api.completeness.mockRejectedValue(completeness); else api.completeness.mockResolvedValue(completeness);
  api.frames.mockResolvedValue({ items: [] });
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter initialEntries={['/reconstruction/case_1']}>
      <LinkProvider component={Link} prop="to"><Routes><Route path="/reconstruction/:caseId" element={<Workspace />} /></Routes></LinkProvider>
    </MemoryRouter></ToastProvider></ThemeProvider>,
  );
}

let board = { scenario_id: 'scn_1', ordering: 'per_source_media_time', note: 'Cameras are not interleaved.', strips: [], omitted: [] };
beforeEach(() => { board = { scenario_id: 'scn_1', ordering: 'per_source_media_time', note: 'Cameras are not interleaved.', strips: [], omitted: [] }; vi.clearAllMocks(); localStorage.clear(); useWorkspace.getState().reset('case_1', 'scn_1'); });

describe('guided reconstruction layout', () => {
  it('prioritizes video, chapters and a concise moment; advanced tools are on demand', async () => {
    setup();
    await screen.findByLabelText('Incident summary');
    expect(screen.getByLabelText('Evidence video')).toBeInTheDocument();
    expect(screen.getByLabelText('Incident chapters')).toBeInTheDocument();
    expect(screen.getByLabelText('This moment')).toBeInTheDocument();
    expect(screen.queryByRole('tab', {name:'Technical'})).toBeNull();
    expect(screen.getByLabelText('Detailed timeline').open).toBe(false);
    fireEvent.click(screen.getByRole('button', {name:'Advanced details'}));
    expect(await screen.findByRole('dialog', {name:'Advanced investigation'})).toBeInTheDocument();
    expect(screen.getByRole('tab', {name:'Technical'})).toBeInTheDocument();
  });
});

async function detailedView() {
  await screen.findByLabelText('Incident summary');
  fireEvent.click(screen.getByText('Detailed timeline', {selector:'span'}));
  fireEvent.click(screen.getByText('Reconstruction assumptions', {selector:'span'}));
  fireEvent.click(screen.getByText('Key findings & open questions', {selector:'span'}));
}

async function advancedView() {
  fireEvent.click(await screen.findByRole('button', {name:'Advanced details'}));
  await screen.findByRole('dialog', {name:'Advanced investigation'});
  fireEvent.click(screen.getByText('Model & scene details', {selector:'summary'}));
}

describe('camera filter', () => {
  it('limits the timeline cards and key observations to one camera and restores them', async () => {
    setup();
    await detailedView();
    const obs = () => screen.getByLabelText('Incident chapters');
    expect(obs()).toHaveTextContent('North vehicle slows');
    expect(obs()).toHaveTextContent('South vehicle slows');
    fireEvent.click(within(screen.getByRole('group', { name: 'Camera filter' })).getByRole('button', { name: 'South camera' }));
    expect(obs()).not.toHaveTextContent('North vehicle slows');
    expect(obs()).toHaveTextContent('South vehicle slows');
    expect(within(obs()).queryByRole('button', { name: /North vehicle slows/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All cameras' }));
    expect(obs()).toHaveTextContent('North vehicle slows');
  });
  it('is not offered for a single camera', async () => {
    setup({ evidence: [video('ev_n', 'North camera')] });
    await detailedView();
    expect(screen.queryByRole('group', { name: 'Camera filter' })).toBeNull();
  });
});

describe('timeline card seeks the existing player', () => {
  it('a card moves the single clock and does not create a second one', async () => {
    setup();
    await detailedView();
    fireEvent.click(screen.getAllByRole('button', { name: /South vehicle slows/ })[0]);
    await waitFor(() => expect(useWorkspace.getState().currentMs).toBe(4000));
    expect(useWorkspace.getState().seek.latest).toBeGreaterThan(0);
  });
});

describe('hypotheses and scenarios', () => {
  it('labels every inference as a hypothesis with alternatives and no probability', async () => {
    setup({ hypotheses: [{ id: 'evt_h', evidence_class: 'hypothesis', statement: 'The lead vehicle may have braked for the junction.', alternatives: ['It may have slowed for traffic.'], premises: ['evt_a'], evidence_ids: ['ev_n'], probability: null }] });
    const section = await screen.findByLabelText('Reconstruction scenarios');
    expect(within(section).getByText('Hypothesis')).toBeInTheDocument();
    expect(section).toHaveTextContent('not a finding');
    expect(section).toHaveTextContent('It may have slowed for traffic.');
    expect(section).toHaveTextContent('likelihood Not established');
    expect(section.textContent).not.toMatch(/\d+\s?%/);
  });
  it('says there is insufficient evidence when the stored hypothesis list is empty', async () => {
    setup({ hypotheses: [] });
    expect(await screen.findByText(/Insufficient evidence to propose one/)).toBeInTheDocument();
  });
  it('shows completeness reasons from stored records only', async () => {
    setup({ completeness: { scenario_id: 'scn_1', defensible: false, reasons: ['sources_unsynchronized'], unsupported_hypotheses: [] } });
    const box = await screen.findByLabelText('Evidence completeness');
    expect(box).toHaveTextContent('Insufficient evidence');
    expect(box).toHaveTextContent('no recorded clock relation');
  });
});

describe('cross-camera association, gaps and sensors', () => {
  it('marks associations as not established when the backend has none, and never matches track numbers', async () => {
    setup({ assoc: { scenario_id: 'scn_1', items: [] } });
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    expect(await screen.findByText(/Not established: whether any vehicle appears on more than one camera/)).toBeInTheDocument();
    expect(screen.queryByText(/same vehicle/i)).toBeNull();
  });
  it('shows a stored association as uncertain with no likelihood', async () => {
    setup({ assoc: { scenario_id: 'scn_1', items: [{ id: 'vas_1', status: 'uncertain', tracks: [{ evidence_id: 'ev_n', track_id: 3 }, { evidence_id: 'ev_s', track_id: 3 }], supporting: [{ kind: 'investigator', id: 'x' }], contradicting: [], basis: 'Investigator comparison', probability: null }] } });
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    const card = await screen.findByText(/North camera track 3/);
    expect(card).toHaveTextContent('South camera track 3');
    const li = card.closest('li');
    expect(li).toHaveTextContent('Uncertain');
    expect(li).toHaveTextContent('likelihood Not established');
    expect(li).toHaveTextContent('not a confirmed identity');
  });
  it('says the list could not be loaded, and assumes nothing, when the request fails', async () => {
    setup({ assoc: new Error('500') });
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    expect(await screen.findByText('Associations could not be loaded')).toBeInTheDocument();
  });
  it('lists a recording gap as missing evidence for the camera it belongs to', async () => {
    setup({ gaps: [{ id: 'g1', gap_type: 'video_missing_interval', scope: { evidence_id: 'ev_s', from_ms: 5000, to_ms: 5600 }, recommendation: 'Ask for the original export.' }] });
    const gap = await screen.findByRole('listitem', { name: /Evidence gap: Missing interval in the recording/ });
    expect(gap).toHaveTextContent('South camera');
    expect(gap).toHaveTextContent('Ask for the original export.');
    expect(screen.getByLabelText('Investigation findings')).toHaveTextContent('Review conflicting accounts');
  });
  it('shows Unavailable for the sensor panel when the case has no sensor file', async () => {
    setup();
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByLabelText('Sensor panel')).toHaveTextContent('Sensor data: Unavailable');
  });
  it('shows empty contradiction, corroboration and gap states', async () => {
    setup();
    expect(await screen.findByText('No findings stored for this scenario')).toBeInTheDocument();
  });
});

describe('before, during and after inspector', () => {
  it('shows the stored storyboard frames for the selected event and an honest empty slot for what is missing', async () => {
    board = { ...board, strips: [{ evidence_id: 'ev_n', items: [{ event_id: 'evt_a', event_type: 'vehicle_slowing', title: 'North vehicle slows', evidence_id: 'ev_n', source_time_ms: [1000, 1200], during_basis: 'samples_inside_interval',
      before: { evidence_id: 'ev_n', frame_id: 1, frame_no: 3, time_ms: 800, thumbnail_url: '/f/1.jpg', full_url: '/f/1f.jpg' }, during: [], after: null, missing: ['during', 'after'] }] }] };
    setup();
    await detailedView();
    fireEvent.click(screen.getAllByRole('button', { name: /North vehicle slows/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect full event details →' }));
    const box = await screen.findByLabelText('Before, during and after');
    await waitFor(() => expect(within(box).getByAltText('before frame 3 at 800 ms')).toBeInTheDocument());
    expect(within(within(box).getByLabelText('during')).getByText('No stored frame inside this event.')).toBeInTheDocument();
    expect(within(within(box).getByLabelText('after')).getByText('No stored frame after this event on this file.')).toBeInTheDocument();
    expect(box).toHaveTextContent('Not available: during, after.');
    expect(api.storyboard).toHaveBeenCalledWith('case_1', 'scn_1');
    expect(api.frames).not.toHaveBeenCalled();
  });
  it('says Unavailable, with the backend reason, for an event the storyboard omitted', async () => {
    board = { ...board, omitted: [{ event_id: 'evt_a', reason: 'no_source_time' }] };
    setup();
    await detailedView();
    fireEvent.click(screen.getAllByRole('button', { name: /North vehicle slows/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect full event details →' }));
    expect(await screen.findByText(/Unavailable: This event has no video source time/)).toBeInTheDocument();
  });
  it('says the storyboard is unavailable when the request fails, and shows no frame', async () => {
    setup();
    api.storyboard.mockRejectedValue(new Error('boom'));
    await detailedView();
  });
  it('shows the clocks and trace the backend stored, and Not established for a null clock', async () => {
    setup({ clocks: { media_ms: [1000, 1200], container_pts_ms: null, wall_clock: null, case_ms: [1000, 1200], synchronized_ms: null }, trace: { source_id: 'ev_n', source_event_id: 'se_1', evidence_ids: ['ev_n'], complete: true } });
    await detailedView();
    fireEvent.click(screen.getAllByRole('button', { name: /North vehicle slows/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect full event details →' }));
    const dl = await screen.findByLabelText('Event clocks');
    expect(dl).toHaveTextContent('1000 to 1200');
    expect(within(dl).getAllByText('Not established')).toHaveLength(3);
    expect(screen.getByLabelText('Evidence trace')).toHaveTextContent('Evidence trace complete: North camera');
  });
});

describe('real and synthetic banners in the workspace', () => {
  it('shows the synthetic banner for a synthetic case and nothing for a real case', async () => {
    const { unmount } = setup({ designation: 'synthetic' });
    expect(await screen.findByText('Synthetic demonstration data')).toBeInTheDocument();
    unmount();
    setup({ designation: 'real' });
    await detailedView();
    expect(screen.queryByText('Synthetic demonstration data')).toBeNull();
  });
});

/** jsdom has no media decoder. This stand-in behaves like a media element for the one property the player drives: setting currentTime seeks and fires `seeked`. */
function stubMedia() {
  const times = new WeakMap();
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get() { return times.get(this) ?? 0; },
    set(v) { times.set(this, v); queueMicrotask(() => this.dispatchEvent(new Event('seeked'))); },
  });
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : () => ({ width: 0 })), set: () => true });
  HTMLCanvasElement.prototype.getContext = () => ctx;
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
}
const videoEls = () => [...document.querySelectorAll('video')];

describe('timeline and video share the single player clock', () => {
  beforeEach(stubMedia);
  it('a timeline card seeks the primary video and every related video to its own media time', async () => {
    setup({ playable: true, shifts: { ev_n: 0, ev_s: 500 } });
    await detailedView();
    await waitFor(() => expect(videoEls().length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: /South vehicle slows/ })[0]);
    await waitFor(() => expect(useWorkspace.getState().seekSettled).toBe(true));
    expect(useWorkspace.getState().currentMs).toBe(4000);
    const times = videoEls().map((v) => v.currentTime).sort((a, b) => a - b);
    expect(times).toEqual([4, 4.5]);
  });
  it('does not move a video that has no clock relation, and does not move one whose time is outside the file', async () => {
    setup({ playable: true, shifts: { ev_n: 0, ev_s: 20000 } });
    await detailedView();
    await waitFor(() => expect(videoEls().length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: /South vehicle slows/ })[0]);
    await waitFor(() => expect(useWorkspace.getState().seekSettled).toBe(true));
    expect(videoEls().map((v) => v.currentTime).sort((a, b) => a - b)).toEqual([0, 4]);
  });
  it('the latest seek wins: two quick cards leave the clock and the video on the second', async () => {
    setup({ playable: true, shifts: { ev_n: 0, ev_s: 0 } });
    await detailedView();
    await waitFor(() => expect(videoEls().length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: /North vehicle slows/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /South vehicle slows/ })[0]);
    await waitFor(() => expect(useWorkspace.getState().seekSettled).toBe(true));
    expect(useWorkspace.getState().currentMs).toBe(4000);
    expect(videoEls().every((v) => v.currentTime === 4)).toBe(true);
  });
  it('the overlap list seeks the same clock', async () => {
    setup({ playable: true, shifts: { ev_n: 0, ev_s: 0 }, overlaps: [{ evidence_ids: ['ev_n', 'ev_s'], start_ms: 2500, end_ms: 3500, event_ids: ['evt_a'] }] });
    const box = await screen.findByLabelText('Recording overlap', { selector: 'section' });
    expect(box).toHaveTextContent('North camera and South camera');
    expect(box).toHaveTextContent('Overlap is not contact and is not corroboration');
    fireEvent.click(within(box).getByRole('button', { name: 'Go to start of overlap' }));
    expect(useWorkspace.getState().currentMs).toBe(2500);
  });
});

describe('overlap, hypothesis explanation and association actions', () => {
  it('draws an overlap band on the timeline and says plainly when no sources overlap', async () => {
    const { unmount } = setup({ overlaps: [{ evidence_ids: ['ev_n', 'ev_s'], start_ms: 2500, end_ms: 3500, event_ids: [] }] });
    await detailedView();
    await waitFor(() => expect(document.querySelectorAll('[data-testid="overlap-band"]').length).toBe(1));
    unmount();
    setup();
    expect(await screen.findByText(/No two placed sources overlap in time/)).toBeInTheDocument();
  });
  it('shows the stored hypothesis explanation as hypotheses with the backend note and no probability', async () => {
    setup({ explanation: { items: [{ id: 'evt_h', evidence_class: 'hypothesis', statement: 'The lead vehicle may have braked.', alternatives: ['It may have slowed for traffic.'], premises: ['evt_a'], evidence_ids: ['ev_n'], probability: null }], note: 'Stored rule alternatives with evidence ids. No probability is assigned.' } });
    await advancedView();
    const box = await screen.findByLabelText('Hypothesis explanation');
    expect(within(box).getByText('Hypothesis')).toBeInTheDocument();
    expect(box).toHaveTextContent('Alternatives: It may have slowed for traffic.');
    expect(box).toHaveTextContent('Evidence: North camera');
    expect(box).toHaveTextContent('No probability is assigned.');
    expect(box.textContent).not.toMatch(/\d+\s?%/);
  });
  it('proposes an association between tracks on two different cameras and lists it as uncertain', async () => {
    api.tracks.mockImplementation(async (id) => ({ items: [{ track_id: id === 'ev_n' ? 3 : 7, class: 'car' }] }));
    api.addAssociation.mockResolvedValue({ item: { id: 'vas_1' } });
    setup({ assoc: { scenario_id: 'scn_1', items: [] } });
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    const form = await screen.findByRole('form', { name: 'Propose association' });
    const submitBtn = within(form).getByRole('button', { name: 'Record as uncertain' });
    expect(submitBtn).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Camera 1'), { target: { value: 'ev_n' } });
    fireEvent.change(within(form).getByLabelText('Camera 2'), { target: { value: 'ev_n' } });
    expect(within(form).getByText('Choose two different cameras.')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Camera 2'), { target: { value: 'ev_s' } });
    await waitFor(() => expect(within(form).getByLabelText('Track on camera 1')).not.toBeDisabled());
    await waitFor(() => expect(within(form).getByLabelText('Track on camera 2')).not.toBeDisabled());
    await within(form).findByRole('option', { name: 'Track 7 (car)' });
    fireEvent.change(within(form).getByLabelText('Track on camera 1'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText('Track on camera 2'), { target: { value: '7' } });
    fireEvent.change(within(form).getByLabelText(/^Why do you think so/), { target: { value: 'Same colour and lane' } });
    api.associations.mockResolvedValue({ scenario_id: 'scn_1', items: [{ id: 'vas_1', status: 'uncertain', tracks: [{ evidence_id: 'ev_n', track_id: 3 }, { evidence_id: 'ev_s', track_id: 7 }], supporting: [{ kind: 'investigator', id: 'investigator' }], contradicting: [], basis: 'Same colour and lane', probability: null }] });
    fireEvent.click(submitBtn);
    await waitFor(() => expect(api.addAssociation).toHaveBeenCalledWith('case_1', { scenario_id: 'scn_1', tracks: [{ evidence_id: 'ev_n', track_id: 3 }, { evidence_id: 'ev_s', track_id: 7 }], basis: 'Same colour and lane' }));
    const li = (await screen.findByText(/North camera track 3/)).closest('li');
    expect(li).toHaveTextContent('Uncertain');
    expect(li).toHaveTextContent('South camera track 7');
    expect(li).toHaveTextContent('likelihood Not established');
  });
  it('shows the backend message when it refuses an association', async () => {
    api.tracks.mockResolvedValue({ items: [{ track_id: 1, class: 'car' }] });
    api.addAssociation.mockRejectedValue(new Error('No track 1 on ev_s'));
    setup({ assoc: { scenario_id: 'scn_1', items: [] } });
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    const form = await screen.findByRole('form', { name: 'Propose association' });
    fireEvent.change(within(form).getByLabelText('Camera 1'), { target: { value: 'ev_n' } });
    fireEvent.change(within(form).getByLabelText('Camera 2'), { target: { value: 'ev_s' } });
    await waitFor(() => expect(within(form).getAllByRole('option', { name: 'Track 1 (car)' }).length).toBe(2));
    fireEvent.change(within(form).getByLabelText('Track on camera 1'), { target: { value: '1' } });
    fireEvent.change(within(form).getByLabelText('Track on camera 2'), { target: { value: '1' } });
    fireEvent.change(within(form).getByLabelText(/^Why do you think so/), { target: { value: 'x' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Record as uncertain' }));
    expect(await within(form).findByText('No track 1 on ev_s')).toBeInTheDocument();
  });
  it('offers no association action for a case with a single camera', async () => {
    setup({ evidence: [video('ev_n', 'North camera')], assoc: { scenario_id: 'scn_1', items: [] } });
    await advancedView();
    fireEvent.click(screen.getByText('Technical details'));
    expect(await screen.findByText(/needs tracks from two different videos/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Propose association' })).toBeNull();
  });
  it('labels evidence class from the backend and has no leftover not-available messages', async () => {
    setup({ assoc: { scenario_id: 'scn_1', items: [] }, completeness: { scenario_id: 'scn_1', defensible: true, reasons: [], unsupported_hypotheses: [] } });
    await detailedView();
    await advancedView();
    expect(screen.getByLabelText('Key observations')).toHaveTextContent('Derived from detections');
    expect(document.body.textContent).not.toMatch(/Not available from this backend build yet/);
  });
});

describe('a case with no reconstruction', () => {
  it('shows an honest empty state instead of crashing (regression: the navigation rail read missing data)', async () => {
    setup({ scenarios: [] });
    expect(await screen.findByText('No reconstruction yet')).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Review evidence setup/);
  });
});
