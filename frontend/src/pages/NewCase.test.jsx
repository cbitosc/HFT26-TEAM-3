import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ToastProvider } from '../ui-kit';
import NewCase from './NewCase';
import { useCaseContext } from '../caseContext';

vi.mock('../api', () => ({
  api: {
    cases: vi.fn().mockResolvedValue({ items: [] }), createCase: vi.fn(), case: vi.fn(), upload: vi.fn(), setClock: vi.fn(), patchSource: vi.fn().mockResolvedValue({}), jobs: vi.fn(), evidence: vi.fn(),
    buildScenario: vi.fn(), addWitness: vi.fn(), addStatement: vi.fn(), retryJob: vi.fn(),
  },
  ApiError: class extends Error {},
}));
import { api } from '../api';

const wrap = (url = '/new') => render(<ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter initialEntries={[url]}><NewCase /></MemoryRouter></ToastProvider></ThemeProvider>);
const pick = (name = 'clip.mp4') => { const input = document.querySelector('input[type=file][accept="video/*"]'); fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'video/mp4' })] } }); };
const create = async (designation = 'real') => {
  api.createCase.mockResolvedValue({ id: 'c1', code: 'TL-1', title: 'Junction', designation, counts: {} });
  fireEvent.click(screen.getByRole('button', { name: /Create investigation/ }));
  await screen.findByLabelText('Upload evidence');
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Upload and analyse/ }));

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); useCaseContext.setState({ selected: null }); api.cases.mockResolvedValue({ items: [] }); });

describe('guided flow: create investigation', () => {
  it('sends only the fields that have a backend home and remembers the new case as the selected one', async () => {
    wrap('/new?title=Junction&designation=real');
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'North approach' } });
    fireEvent.change(screen.getByLabelText(/^Reference/), { target: { value: 'REF-2026-14' } });
    await create();
    expect(api.createCase).toHaveBeenCalledWith({ title: 'Junction', designation: 'real', description: 'North approach', code: 'REF-2026-14' });
    expect(useCaseContext.getState().selected).toMatchObject({ id: 'c1', designation: 'real' });
  });
  it('sends incident time (with the browser offset, not asked for) and the location to the backend, and no longer says they are browser-only', async () => {
    wrap('/new?title=Junction&designation=real');
    fireEvent.change(screen.getByLabelText(/^Incident date and time/), { target: { value: '2026-10-30T10:32' } });
    expect(screen.queryByLabelText(/Time zone offset/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Location/), { target: { value: 'Main St' } });
    expect(screen.queryByText(/Kept in this browser only/)).toBeNull();
    await create();
    expect(api.createCase).toHaveBeenCalledWith({ title: 'Junction', designation: 'real', incident_at: expect.stringMatching(/^2026-10-30T10:32:00[+-]\d{2}:\d{2}$/), location_text: 'Main St' });
    expect(localStorage.getItem('traceline.caseMeta.c1')).toBeNull();
  });
  it('omits incident time and location when they are left empty', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    const body = api.createCase.mock.calls[0][0];
    expect(body).not.toHaveProperty('incident_at');
    expect(body).not.toHaveProperty('location_text');
  });
  it('refuses a reference the backend would reject', () => {
    wrap('/new?title=Junction&designation=real');
    fireEvent.change(screen.getByLabelText(/^Reference/), { target: { value: 'a b' } });
    expect(screen.getByText(/3 to 40 letters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create investigation/ })).toBeDisabled();
  });
});

describe('guided flow: upload with source metadata', () => {
  it('shows every source field for each chosen video, including Other, which is stored but not analysed', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    pick('north.mp4');
    const group = screen.getByRole('group', { name: /Source details for north.mp4/ });
    for (const label of ['Camera name', 'Camera type', 'Location (text)', 'Recording start', 'Recording end', 'Timezone', 'Clock offset (seconds)', 'Start certainty ± seconds']) {
      expect(within(group).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(group).getByRole('option', { name: /Other/ })).not.toBeDisabled();
  });
  it('declares the clock from start, timezone, offset and stated uncertainty, and sends the chosen camera kind', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    api.upload.mockResolvedValue({ duplicate: false, evidence: { id: 'ev_1' } });
    api.setClock.mockResolvedValue({});
    api.jobs.mockResolvedValue({ items: [] }); api.evidence.mockResolvedValue({ items: [] });
    pick('north.mp4');
    fireEvent.change(screen.getByLabelText('Camera type'), { target: { value: 'dashcam' } });
    fireEvent.change(screen.getByLabelText('Recording start'), { target: { value: '2026-10-30T10:00' } });
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } });
    fireEvent.change(screen.getByLabelText('Clock offset (seconds)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Start certainty ± seconds'), { target: { value: '2' } });
    submit();
    await waitFor(() => expect(api.setClock).toHaveBeenCalled());
    expect(api.upload.mock.calls[0][2]).toBe('dashcam');
    expect(api.patchSource).toHaveBeenCalledWith('ev_1', { display_name: null, camera_role: 'dashcam', location_text: null, recording_start: '2026-10-30T10:00:00.000Z', recording_end: null, timezone: 'UTC' });
    expect(api.setClock).toHaveBeenCalledWith('ev_1', { utc_zero: '2026-10-30T09:59:30.000Z', bound_ms: 2000, basis: 'declared_by_investigator', timezone: 'UTC', note: 'stated clock offset 30 s' });
  });
  it('stores camera name, type, location and window on the backend source and uploads Other as kind other', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    api.upload.mockResolvedValue({ duplicate: false, evidence: { id: 'ev_9' } });
    api.jobs.mockResolvedValue({ items: [] }); api.evidence.mockResolvedValue({ items: [] });
    pick('phone.mp4');
    fireEvent.change(screen.getByLabelText('Camera name'), { target: { value: 'Shop camera' } });
    fireEvent.change(screen.getByLabelText('Camera type'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('Location (text)'), { target: { value: 'Outside the pharmacy' } });
    expect(screen.getByText(/not sent to vehicle detection or tracking/)).toBeInTheDocument();
    submit();
    await waitFor(() => expect(api.patchSource).toHaveBeenCalled());
    expect(api.upload.mock.calls[0][2]).toBe('other');
    expect(api.patchSource).toHaveBeenCalledWith('ev_9', expect.objectContaining({ display_name: 'Shop camera', camera_role: 'other', location_text: 'Outside the pharmacy', recording_start: null }));
    expect(api.setClock).not.toHaveBeenCalled();
  });
  it('does not overwrite the stored details of a duplicate upload', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    api.upload.mockResolvedValue({ duplicate: true, evidence: { id: 'ev_1', original_filename: 'same.mp4' } });
    api.jobs.mockResolvedValue({ items: [] }); api.evidence.mockResolvedValue({ items: [] });
    pick('same.mp4');
    fireEvent.change(screen.getByLabelText('Camera name'), { target: { value: 'Changed' } });
    submit();
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    await screen.findByText(/Already in this case/);
    expect(api.patchSource).not.toHaveBeenCalled();
  });
  it('does not invent an uncertainty: a start time without one blocks the upload', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    pick('north.mp4');
    fireEvent.change(screen.getByLabelText('Recording start'), { target: { value: '2026-10-30T10:00' } });
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } });
    submit();
    expect(await screen.findByText(/State how certain the start time is/)).toBeInTheDocument();
    expect(api.upload).not.toHaveBeenCalled();
  });
  it('rejects an end before the start', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    pick('north.mp4');
    fireEvent.change(screen.getByLabelText('Recording start'), { target: { value: '2026-10-30T10:00' } });
    fireEvent.change(screen.getByLabelText('Recording end'), { target: { value: '2026-10-30T09:00' } });
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } });
    fireEvent.change(screen.getByLabelText('Start certainty ± seconds'), { target: { value: '1' } });
    submit();
    expect(await screen.findByText(/end must be after the start/)).toBeInTheDocument();
    expect(api.upload).not.toHaveBeenCalled();
  });
  it('a rejected upload shows the backend message and does not build a reconstruction', async () => {
    wrap('/new?title=Broken&designation=real');
    await create();
    api.upload.mockRejectedValue(Object.assign(new Error('content looks like text (text/plain), which is not valid for kind cctv'), { code: 'UNSUPPORTED_CONTENT' }));
    pick('garbage.mp4');
    submit();
    expect(await screen.findByText(/content looks like text/)).toBeInTheDocument();
    expect(api.buildScenario).not.toHaveBeenCalled();
  });
  it('declares footage real exactly as chosen: a real case never uploads with synthetic=true and shows no synthetic text', async () => {
    wrap('/new?title=Junction&designation=real');
    await create('real');
    api.upload.mockRejectedValue(new Error('stop'));
    pick();
    submit();
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(api.upload.mock.calls[0][3]).toBe(false);
    expect(screen.queryByText(/synthetic/i)).toBeNull();
  });
  it('a synthetic case uploads with synthetic=true and carries the synthetic banner', async () => {
    wrap('/new?title=Demo&designation=synthetic');
    await create('synthetic');
    api.upload.mockRejectedValue(new Error('stop'));
    pick();
    submit();
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(api.upload.mock.calls[0][3]).toBe(true);
    expect(screen.getByText('Synthetic demonstration data')).toBeInTheDocument();
  });
  it('reports a duplicate upload as already present instead of a second source', async () => {
    wrap('/new?title=Junction&designation=real');
    await create();
    api.upload.mockResolvedValue({ duplicate: true, evidence: { id: 'ev_1', original_filename: 'same.mp4' } });
    api.jobs.mockResolvedValue({ items: [] }); api.evidence.mockResolvedValue({ items: [] });
    pick('same.mp4');
    submit();
    expect(await screen.findByText(/already in this case/)).toBeInTheDocument();
  });
});

describe('guided flow: processing shows real job stages only', () => {
  const resume = () => { api.case.mockResolvedValue({ id: 'c1', code: 'TL-1', title: 'Junction', designation: 'real', counts: { evidence_total: 1 } }); wrap('/new?case=c1'); };
  it('lists only the stages the backend has queued, each with its stored status', async () => {
    resume();
    await screen.findByLabelText('Upload evidence');
    api.evidence.mockResolvedValue({ items: [{ id: 'ev_1', kind: 'cctv', original_filename: 'north.mp4' }] });
    api.jobs.mockResolvedValue({ items: [
      { id: 'j1', evidence_id: 'ev_1', stage: 'validate', status: 'completed', progress: 1 },
      { id: 'j2', evidence_id: 'ev_1', stage: 'preprocess', status: 'processing', progress: 0.4 },
    ] });
    fireEvent.click(screen.getByRole('button', { name: /Continue to processing/ }));
    const list = await screen.findByRole('list', { name: 'Processing stages' });
    expect(within(list).getByText('Check the file')).toBeInTheDocument();
    expect(within(list).getByText('Index frames')).toBeInTheDocument();
    expect(within(list).queryByText(/Detect vehicles/)).toBeNull();
    expect(within(list).queryByText(/Track and find events/)).toBeNull();
    expect(within(list).getByRole('progressbar', { name: 'Index frames progress' })).toHaveAttribute('aria-valuenow', '40');
  });
  it('a failed stage is reported with its name and error, and the reconstruction is not built', async () => {
    resume();
    await screen.findByLabelText('Upload evidence');
    api.evidence.mockResolvedValue({ items: [{ id: 'ev_1', kind: 'cctv', original_filename: 'north.mp4' }] });
    api.jobs.mockResolvedValue({ items: [{ id: 'j', evidence_id: 'ev_1', stage: 'detect', status: 'failed', error: { type: 'FileNotFoundError', message: 'weights missing' } }] });
    fireEvent.click(screen.getByRole('button', { name: /Continue to processing/ }));
    expect(await screen.findByText(/Detect vehicles and people failed: weights missing/)).toBeInTheDocument();
    expect(api.buildScenario).not.toHaveBeenCalled();
  });
});
