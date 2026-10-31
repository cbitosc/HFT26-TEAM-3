import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ToastProvider } from '../ui-kit';
import Dashboard from './Dashboard';

vi.mock('../api', () => ({ api: { dashboard: vi.fn(), cases: vi.fn(), jobs: vi.fn(), findings: vi.fn() }, ApiError: class extends Error {} }));
import { api } from '../api';

const wrap = () => render(<ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter><Dashboard /></MemoryRouter></ToastProvider></ThemeProvider>);
const dash = { cases: { total: 0, by_status: {} }, evidence: { total: 0, invalid: 0 }, jobs: { by_status: {}, in_progress: 0 }, findings_needing_review: 0, recent_evidence: [] };
beforeEach(() => vi.clearAllMocks());

describe('dashboard states', () => {
  it('shows an empty state with a way forward when there are no cases', async () => {
    api.dashboard.mockResolvedValue(dash); api.cases.mockResolvedValue({ items: [] });
    wrap();
    expect(await screen.findByText('No investigations yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing waiting for review')).toBeInTheDocument();
  });
  it('shows an error state with the cause when the API is down', async () => {
    api.dashboard.mockRejectedValue(new Error('Failed to fetch')); api.cases.mockRejectedValue(new Error('Failed to fetch'));
    wrap();
    expect(await screen.findByText('The API did not answer')).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument();
  });
  it('labels real and synthetic cases and queues only active jobs', async () => {
    api.dashboard.mockResolvedValue({ ...dash, cases: { total: 2, by_status: { open: 2 } }, evidence: { total: 3, invalid: 0 } });
    api.cases.mockResolvedValue({ items: [
      { id: 'c1', code: 'TL-1', title: 'Junction crash', designation: 'real', status: 'open', created_at: new Date().toISOString(), counts: { evidence_total: 2, findings_unreviewed: 0 } },
      { id: 'c2', code: 'TL-2', title: 'Demo run', designation: 'synthetic', status: 'open', created_at: new Date().toISOString(), counts: { evidence_total: 1, findings_unreviewed: 0 } }] });
    api.jobs.mockImplementation(async (id) => ({ items: id === 'c1' ? [{ id: 'j1', stage: 'detect', status: 'processing', progress: 0.4, finished_at: null }, { id: 'j2', stage: 'validate', status: 'completed', progress: 1, finished_at: new Date().toISOString() }] : [] }));
    api.findings.mockResolvedValue({ items: [] });
    wrap();
    expect(await screen.findAllByText('Junction crash')).not.toHaveLength(0);
    expect(screen.getAllByText('REAL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SYNTHETIC').length).toBeGreaterThan(0);
    expect(await screen.findByText('Detect objects')).toBeInTheDocument();
    expect(screen.queryByText('The queue is empty. Uploaded video is processed automatically.')).toBeNull();
  });
});
