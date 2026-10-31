import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkProvider, ThemeProvider, ToastProvider } from './ui-kit';
import App from './App';
import CaseBanner from './components/CaseBanner';
import { useCaseContext } from './caseContext';

vi.mock('./api', () => ({
  api: {
    cases: vi.fn(), case: vi.fn(), dashboard: vi.fn(), jobs: vi.fn(), findings: vi.fn(), evidence: vi.fn(), sync: vi.fn(), witnesses: vi.fn(), statements: vi.fn(),
    frames: vi.fn(), patchCase: vi.fn(), reports: vi.fn(), reportById: vi.fn(), reportMd: vi.fn(), report: vi.fn(), scenarios: vi.fn(), actors: vi.fn(),
    streamUrl: (id) => `/api/v1/evidence/${id}/stream`, pdfUrl: (id) => `/api/v1/reports/${id}/pdf`, setClock: vi.fn(), patchSource: vi.fn(), sensors: vi.fn().mockResolvedValue({ items: [] }), sensorPreview: vi.fn(), registerSensor: vi.fn(),
  },
  ApiError: class extends Error {},
}));
import { api } from './api';

const real = { id: 'case_r', code: 'TL-R', title: 'Real junction', designation: 'real', status: 'open', description: 'north approach', created_at: '2026-10-30T10:00:00Z', counts: { evidence_total: 1, findings_unreviewed: 2 } };
const syn = { id: 'case_s', code: 'TL-S', title: 'Synthetic demo', designation: 'synthetic', status: 'open', description: null, created_at: '2026-10-29T10:00:00Z', counts: { evidence_total: 0, findings_unreviewed: 0 } };
const video = { id: 'ev_1', case_id: 'case_r', kind: 'cctv', original_filename: 'north.mp4', size_bytes: 4_000_000, sha256: 'a'.repeat(64), uploaded_at: '2026-10-30T10:01:00Z', synthetic: false, provenance: null, licence: null, status: 'valid', links: { original: '/o', stream: '/s' }, video: { duration_ms: 30000, fps_measured: 29.2, fps_nominal: 30, width: 1280, height: 720, rotation: null, pts_start_ms: 0, playback_ready: true, creation_time_claimed: null } };

const app = (path) => render(
  <ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter initialEntries={[path]}><LinkProvider component={Link} prop="to"><App /></LinkProvider></MemoryRouter></ToastProvider></ThemeProvider>,
);

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); useCaseContext.setState({ selected: null });
  api.cases.mockResolvedValue({ items: [real, syn] });
  api.dashboard.mockResolvedValue({ cases: { total: 2 }, evidence: { total: 1, invalid: 0 }, jobs: { by_status: {}, in_progress: 0 }, findings_needing_review: 0, recent_evidence: [] });
  api.jobs.mockResolvedValue({ items: [] }); api.findings.mockResolvedValue({ items: [] });
  api.case.mockImplementation(async (id) => [real, syn].find((c) => c.id === id));
  api.evidence.mockResolvedValue({ items: [video] });
  api.sync.mockResolvedValue({ groups: [{ id: 'sg_1', reference: 'ev_1', consistent: true, members: [{ evidence_id: 'ev_1', offset_to_reference_ms: 0, bound_ms: 0 }] }], unsynchronized: [], clock_records: [] });
  api.witnesses.mockResolvedValue({ items: [] });
  api.frames.mockResolvedValue({ items: [{ thumbnail_url: '/api/v1/frames/1/image' }] });
  api.reports.mockResolvedValue({ items: [] });
  api.scenarios.mockResolvedValue({ items: [{ id: 'scn_1' }] });
});

const primary = () => within(screen.getAllByRole('navigation', { name: 'Primary' })[0]);

describe('shared shell', () => {
  it('has exactly five sections in the main navigation', async () => {
    app('/dashboard');
    const links = primary().getAllByRole('link');
    expect(links.map((l) => l.textContent.trim())).toEqual(['Dashboard', 'Cases', 'Evidence', 'Reconstruction', 'Reports']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/dashboard', '/cases', '/evidence', '/reconstruction', '/reports']);
    await waitFor(() => expect(api.dashboard).toHaveBeenCalled());
  });
  it('marks the current section and keeps the selected case when moving between case sections', async () => {
    useCaseContext.getState().select(real);
    app('/evidence');
    expect(await screen.findByRole('heading', { name: 'north.mp4' })).toBeInTheDocument();
    expect(primary().getByRole('link', { name: 'Evidence' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByTestId('case-context')[0]).toHaveTextContent('Real junction');
    fireEvent.click(primary().getByRole('link', { name: 'Reports' }));
    expect(await screen.findByText('No executive report yet')).toBeInTheDocument();
    expect(api.reports).toHaveBeenCalledWith('case_r');
    expect(screen.getAllByTestId('case-context')[0]).toHaveTextContent('Real junction');
  });
  it('asks which case to use when none is selected, instead of showing anything', async () => {
    app('/reports');
    expect(await screen.findByText(/works on one case at a time/)).toBeInTheDocument();
    fireEvent.click(await screen.findAllByRole('link', { name: 'Open' }).then((l) => l[1]));
    await waitFor(() => expect(useCaseContext.getState().selected?.id).toBe('case_s'));
  });
  it('sends the old workspace and report links to the new sections', async () => {
    app('/cases/case_r/report');
    expect(await screen.findByText('No executive report yet')).toBeInTheDocument();
  });
  it('forgets a selected case the backend no longer has', async () => {
    useCaseContext.getState().select({ id: 'gone', title: 'Gone', designation: 'real' });
    app('/dashboard');
    await waitFor(() => expect(useCaseContext.getState().selected).toBeNull());
  });
});

describe('cases page', () => {
  it('searches, filters by data type and sorts without changing values', async () => {
    app('/cases');
    expect(await screen.findAllByText('Real junction')).not.toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 cases');
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: 'synthetic' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 cases');
    expect(screen.queryByText('Real junction')).toBeNull();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: 'all' } });
    fireEvent.change(screen.getByPlaceholderText('Title, code or description'), { target: { value: 'north approach' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 cases');
  });
  it('shows an empty state with a way forward when nothing matches', async () => {
    app('/cases');
    await screen.findAllByText('Real junction');
    fireEvent.change(screen.getByPlaceholderText('Title, code or description'), { target: { value: 'zzz' } });
    expect(screen.getByText('No case matches these filters')).toBeInTheDocument();
  });
  it('edits title and status through the backend and does not offer to change the designation', async () => {
    api.patchCase.mockResolvedValue({ ...real, title: 'Renamed' });
    app('/cases');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit Real junction' }))[0]);
    expect(screen.getByText(/cannot be changed after creation/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.patchCase).toHaveBeenCalledWith('case_r', { title: 'Renamed', status: 'open' }));
  });
  it('lists no case and offers to start one when the backend has none', async () => {
    api.cases.mockResolvedValue({ items: [] });
    app('/cases');
    expect(await screen.findByText('No investigations yet')).toBeInTheDocument();
  });
});

describe('evidence page', () => {
  it('shows metadata, status, provenance and sync status from stored values, and marks missing ones as not established', async () => {
    app('/evidence/case_r');
    const meta = await screen.findByRole('group', { name: /Source details/ }).catch(() => null);
    expect(meta).not.toBeNull();
    const dl = screen.getByLabelText('Metadata');
    expect(dl).toHaveTextContent('30.00 s');
    expect(dl).toHaveTextContent('1280×720');
    expect(dl).toHaveTextContent('a'.repeat(64));
    expect(within(dl).getAllByText('Not established').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Own reference clock').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REAL').length).toBeGreaterThan(0);
    expect(screen.queryByText(/synthetic/i)).toBeNull();
  });
  it('flags sources with no clock relation as not synchronized', async () => {
    api.evidence.mockResolvedValue({ items: [video, { ...video, id: 'ev_2', original_filename: 'south.mp4', sha256: 'b'.repeat(64) }] });
    api.sync.mockResolvedValue({ groups: [], unsynchronized: ['ev_1', 'ev_2'], clock_records: [] });
    app('/evidence/case_r');
    expect(await screen.findByText('Some sources are not on one clock')).toBeInTheDocument();
    expect(screen.getAllByText('Not synchronized').length).toBeGreaterThanOrEqual(2);
  });
  it('shows an empty state for a case with no evidence', async () => {
    api.evidence.mockResolvedValue({ items: [] });
    app('/evidence/case_r');
    expect(await screen.findByText('No evidence in this case')).toBeInTheDocument();
    expect(screen.getByText('No witness statement has been added to this case.')).toBeInTheDocument();
    expect(screen.getByText('No sensor file has been uploaded to this case.')).toBeInTheDocument();
  });
  it('saving a start time stores the source details and declares the clock', async () => {
    api.setClock.mockResolvedValue({});
    api.patchSource.mockResolvedValue({});
    app('/evidence/case_r');
    const form = await screen.findByRole('form', { name: 'Edit source details' });
    fireEvent.change(within(form).getByLabelText('Camera name'), { target: { value: 'North cam' } });
    fireEvent.change(within(form).getByLabelText('Recording start'), { target: { value: '2026-10-30T10:00' } });
    fireEvent.change(within(form).getByLabelText('Timezone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.change(within(form).getByLabelText('Start certainty ± seconds'), { target: { value: '5' } });
    expect(within(form).getByTestId('clock-preview')).toHaveTextContent('2026-10-30T04:30:00.000Z');
    fireEvent.click(within(form).getByRole('button', { name: 'Save source details' }));
    await waitFor(() => expect(api.setClock).toHaveBeenCalledWith('ev_1', expect.objectContaining({ utc_zero: '2026-10-30T04:30:00.000Z', bound_ms: 5000, timezone: 'Asia/Kolkata', basis: 'declared_by_investigator' })));
    expect(api.patchSource).toHaveBeenCalledWith('ev_1', expect.objectContaining({ display_name: 'North cam', recording_start: '2026-10-30T04:30:00.000Z', timezone: 'Asia/Kolkata' }));
  });
});

describe('evidence page: stored source details', () => {
  const stored = { ...video, source: { source_id: 'ev_1', display_name: 'North cam', camera_role: 'cctv', location_text: 'Main St', recording_start: '2026-10-30T04:30:00Z', recording_end: null, timezone: 'Asia/Kolkata', clock_offset_ms: null, clock_offset_reference_id: null } };
  it('shows the stored camera name, type, location and window, and fills the form with them in the stated timezone', async () => {
    api.evidence.mockResolvedValue({ items: [stored] });
    app('/evidence/case_r');
    const form = await screen.findByRole('form', { name: 'Edit source details' });
    expect(screen.getByLabelText('Metadata')).toHaveTextContent('Main St');
    expect(within(form).getByLabelText('Camera name')).toHaveValue('North cam');
    expect(within(form).getByLabelText('Recording start').value).toMatch(/^2026-10-30T10:00/);
    expect(within(form).getByLabelText('Timezone')).toHaveValue('Asia/Kolkata');
  });
  it('saving a changed name does not re-declare the clock', async () => {
    api.evidence.mockResolvedValue({ items: [stored] });
    api.patchSource.mockResolvedValue({});
    app('/evidence/case_r');
    const form = await screen.findByRole('form', { name: 'Edit source details' });
    fireEvent.change(within(form).getByLabelText('Camera name'), { target: { value: 'North cam 2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save source details' }));
    await waitFor(() => expect(api.patchSource).toHaveBeenCalled());
    expect(api.patchSource.mock.calls[0][1]).toMatchObject({ display_name: 'North cam 2', recording_start: '2026-10-30T04:30:00.000Z' });
    expect(api.setClock).not.toHaveBeenCalled();
  });
  it('offers an offset against another source and sends it in milliseconds', async () => {
    api.evidence.mockResolvedValue({ items: [stored, { ...video, id: 'ev_2', original_filename: 'south.mp4', sha256: 'b'.repeat(64) }] });
    api.patchSource.mockResolvedValue({});
    app('/evidence/case_r');
    const form = await screen.findByRole('form', { name: 'Edit source details' });
    fireEvent.change(within(form).getByLabelText('Measured against'), { target: { value: 'ev_2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save source details' }));
    expect(await within(form).findByText(/Enter the offset in seconds/)).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Offset \(seconds\)/), { target: { value: '-1.5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save source details' }));
    await waitFor(() => expect(api.patchSource).toHaveBeenCalledWith('ev_1', expect.objectContaining({ clock_offset_reference_id: 'ev_2', clock_offset_ms: -1500 })));
  });
});

describe('evidence page: sensor files', () => {
  const sensorEv = { ...video, id: 'ev_sn', kind: 'sensor_csv', original_filename: 'drive.csv', video: null, sha256: 'c'.repeat(64), links: { original: '/api/v1/evidence/ev_sn/original' } };
  it('offers column mapping for an unmapped sensor file and states that no reading is used yet', async () => {
    api.evidence.mockResolvedValue({ items: [sensorEv] });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null, text: async () => 'timestamp,speed\n0,1\n' });
    app('/evidence/case_r');
    expect(await screen.findByText(/no column mapping, so no sensor reading is used yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sensor data')).toHaveTextContent('0 of 1 sensor file(s) have a column mapping');
  });
  it('shows a registered mapping instead of the form', async () => {
    api.evidence.mockResolvedValue({ items: [sensorEv] });
    api.sensors.mockResolvedValue({ items: [{ evidence_id: 'ev_sn', clock: 'relative', sample_rate_hz: 10, mapping: { t: 'timestamp' }, units: { t: 's' } }] });
    app('/evidence/case_r');
    expect(await screen.findByText('Mapping registered')).toBeInTheDocument();
    api.sensors.mockResolvedValue({ items: [] });
  });
});

describe('real and synthetic banners', () => {
  it('shows nothing synthetic for a real case', () => {
    const { container } = render(<CaseBanner designation="real" />);
    expect(container).toBeEmptyDOMElement();
  });
  it('labels a synthetic case', () => {
    render(<CaseBanner designation="synthetic" />);
    expect(screen.getByText('Synthetic demonstration data')).toBeInTheDocument();
  });
  it('warns loudly when a real case contains synthetic evidence', () => {
    render(<CaseBanner designation="real" warning="This case is declared real, but one file is marked synthetic (x.mp4)." />);
    expect(screen.getByText('Real and synthetic evidence are mixed in this case')).toBeInTheDocument();
  });
  it('a synthetic case page carries the banner and a real case page does not', async () => {
    api.evidence.mockResolvedValue({ items: [] });
    app('/evidence/case_s');
    expect(await screen.findByText('Synthetic demonstration data')).toBeInTheDocument();
  });
});

describe('reports page', () => {
  const rep = (over) => ({ id: 'rpt_1', case_id: 'case_r', version: 1, created_at: '2026-10-30T11:00:00Z', has_pdf: true, validation: { passed: true, checks: [{ check: 'no language assigning fault', passed: true }] }, ...over });
  it('previews an executive and a technical report from their stored format and offers a PDF only where one exists', async () => {
    api.reports.mockResolvedValue({ items: [rep({ id: 'rpt_2', version: 2, format: 'full', has_pdf: false, validation: { passed: false, checks: [{ check: 'sixteen sections in order', passed: false }] } }), rep({ format: 'executive' })] });
    api.reportById.mockClear();
    api.reportMd.mockImplementation(async (id) => `# markdown for ${id}`);
    app('/reports/case_r');
    expect(await screen.findByText('# markdown for rpt_1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Technical' }));
    expect(await screen.findByText('# markdown for rpt_2')).toBeInTheDocument();
    expect(screen.getByText('PDF unavailable')).toBeInTheDocument();
    expect(screen.getByText('Failed validation')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    expect(api.reportById).not.toHaveBeenCalled(); // the list's `format` is enough
  });
  it('generates the investigator format for executive and the full export for technical', async () => {
    api.report.mockResolvedValue({ id: 'rpt_9' });
    app('/reports/case_r');
    fireEvent.click(await screen.findByRole('button', { name: /Generate executive report/ }));
    await waitFor(() => expect(api.report).toHaveBeenCalledWith('case_r', null, 'investigator'));
    fireEvent.click(screen.getByRole('radio', { name: 'Technical' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate technical report/ }));
    await waitFor(() => expect(api.report).toHaveBeenCalledWith('case_r', null, 'full'));
  });
  it('cannot generate without a reconstruction and says why', async () => {
    api.scenarios.mockResolvedValue({ items: [] });
    app('/reports/case_r');
    expect(await screen.findByText('No reconstruction yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate executive report/ })).toBeDisabled();
  });
});
