import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ToastProvider } from '../ui-kit';
import SensorMapping, { buildSpec, parseHeader, specErrors } from './SensorMapping';

vi.mock('../api', () => ({ api: { sensorPreview: vi.fn(), registerSensor: vi.fn() } }));
import { api } from '../api';

const ev = { id: 'ev_s', kind: 'sensor_csv', status: 'valid', links: { original: '/api/v1/evidence/ev_s/original' } };
const csvResponse = (text) => ({ ok: true, status: 200, body: null, text: async () => text });
const wrap = (props = {}) => render(<ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><SensorMapping evidence={ev} caseId="case_1" {...props} /></ToastProvider></ThemeProvider>);

beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn().mockResolvedValue(csvResponse('timestamp;speed_kmh;ax\n0;10;0.1\n')); });

describe('parseHeader', () => {
  it('uses the most frequent delimiter and ignores a BOM and quotes', () => {
    expect(parseHeader('\uFEFFtimestamp;"speed_kmh";ax\n1;2;3')).toEqual(['timestamp', 'speed_kmh', 'ax']);
    expect(parseHeader('t,speed,ax\n')).toEqual(['t', 'speed', 'ax']);
    expect(parseHeader('a\tb\tc')).toEqual(['a', 'b', 'c']);
    expect(parseHeader('')).toEqual([]);
  });
});

describe('mapping rules', () => {
  const form = (cols = {}, units = {}, clock = 'relative', timezone = '') => ({ cols, units, clock, timezone });
  it('requires a time column and a stated unit for every mapped quantity', () => {
    expect(specErrors(form())).toMatchObject({ t: expect.any(String) });
    expect(specErrors(form({ t: 'ts', speed: 'v' }, { t: 's' }))).toMatchObject({ speed: expect.stringMatching(/unit/) });
    expect(specErrors(form({ t: 'ts', speed: 'v' }, { t: 's', speed: 'km/h' }))).toEqual({});
  });
  it('rejects one column mapped twice and a local clock without a timezone', () => {
    expect(specErrors(form({ t: 'ts', speed: 'ts' }, { t: 's', speed: 'm/s' })).dup).toBeTruthy();
    expect(specErrors(form({ t: 'ts' }, { t: 's' }, 'local')).timezone).toBeTruthy();
  });
  it('builds the backend body without units for flag and position fields and with a timezone only for local clocks', () => {
    expect(buildSpec(form({ t: 'ts', lat: 'la', collision: 'hit' }, { t: 'ms' }, 'utc', 'ignored'))).toEqual({ mapping: { t: 'ts', lat: 'la', collision: 'hit' }, units: { t: 'ms' }, clock: 'utc' });
    expect(buildSpec(form({ t: 'ts' }, { t: 'iso' }, 'local', 'Asia/Kolkata')).timezone).toBe('Asia/Kolkata');
  });
});

describe('SensorMapping', () => {
  it('lists the columns of the file, selects no unit by default, and keeps Register disabled until the mapping is complete', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Map columns' }));
    const form = await screen.findByRole('form', { name: 'Sensor column mapping' });
    expect(within(form).getByLabelText(/^Time/)).toHaveValue('');
    expect(within(form).getByRole('button', { name: 'Register mapping' })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/^Time/), { target: { value: 'timestamp' } });
    expect(within(form).getByLabelText('Time unit')).toHaveValue('');
    expect(within(form).getByRole('button', { name: 'Register mapping' })).toBeDisabled();
    expect(within(form).getByText('State the unit. It is not guessed.')).toBeInTheDocument();
    expect(within(form).getAllByRole('option', { name: 'speed_kmh' }).length).toBeGreaterThan(0);
  });
  it('previews without storing, then registers the mapping the investigator stated', async () => {
    api.sensorPreview.mockResolvedValue({ rows: 120, valid_rows: 118, sampling: { rate_hz: 10 }, issue_counts: { out_of_range: 2 }, gps_consistency: null, events: [{ event_type: 'hard_braking' }], first_rows: [{ row_no: 1, t_raw: '0', time_ms: 0, si: { speed: 2.78 }, issues: [] }] });
    api.registerSensor.mockResolvedValue({ sensor_source_id: 'sns_1' });
    const onDone = vi.fn();
    wrap({ onDone });
    fireEvent.click(await screen.findByRole('button', { name: 'Map columns' }));
    const form = await screen.findByRole('form', { name: 'Sensor column mapping' });
    fireEvent.change(within(form).getByLabelText(/^Time/), { target: { value: 'timestamp' } });
    fireEvent.change(within(form).getByLabelText('Time unit'), { target: { value: 's' } });
    fireEvent.change(within(form).getByLabelText(/^Speed/), { target: { value: 'speed_kmh' } });
    fireEvent.change(within(form).getByLabelText('Speed unit'), { target: { value: 'km/h' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Preview' }));
    const prev = await screen.findByLabelText('Mapping preview');
    expect(prev).toHaveTextContent('118 of 120 rows are valid');
    expect(prev).toHaveTextContent('hard braking');
    expect(api.sensorPreview).toHaveBeenCalledWith('ev_s', { mapping: { t: 'timestamp', speed: 'speed_kmh' }, units: { t: 's', speed: 'km/h' }, clock: 'relative' });
    expect(api.registerSensor).not.toHaveBeenCalled();
    fireEvent.click(within(form).getByRole('button', { name: 'Register mapping' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.registerSensor).toHaveBeenCalledWith('case_1', { evidence_id: 'ev_s', mapping: { t: 'timestamp', speed: 'speed_kmh' }, units: { t: 's', speed: 'km/h' }, clock: 'relative' });
  });
  it('shows the backend refusal and does not claim the mapping was stored', async () => {
    api.sensorPreview.mockRejectedValue(new Error('speed: unit km/h is not valid for column ax'));
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Map columns' }));
    const form = await screen.findByRole('form', { name: 'Sensor column mapping' });
    fireEvent.change(within(form).getByLabelText(/^Time/), { target: { value: 'timestamp' } });
    fireEvent.change(within(form).getByLabelText('Time unit'), { target: { value: 's' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('The backend rejected this mapping')).toBeInTheDocument();
    expect(screen.getByText(/not valid for column ax/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Mapping preview')).toBeNull();
  });
  it('shows an already registered mapping read-only', async () => {
    wrap({ registered: { evidence_id: 'ev_s', clock: 'relative', sample_rate_hz: 10, mapping: { t: 'timestamp', speed: 'speed_kmh' }, units: { t: 's', speed: 'km/h' } } });
    expect(screen.getByText('Mapping registered')).toBeInTheDocument();
    expect(screen.getByLabelText('Registered columns')).toHaveTextContent('speed_kmh (km/h)');
    expect(screen.queryByRole('button', { name: 'Map columns' })).toBeNull();
  });
  it('says so when the file cannot be read', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    wrap();
    expect(await screen.findByText('Could not read the file')).toBeInTheDocument();
  });
  it('does not offer mapping for a file that failed validation', () => {
    render(<ThemeProvider defaultTheme="dark" storageKey="t"><SensorMapping evidence={{ ...ev, status: 'invalid' }} caseId="case_1" /></ThemeProvider>);
    expect(screen.getByText(/has not passed validation/)).toBeInTheDocument();
  });
});
