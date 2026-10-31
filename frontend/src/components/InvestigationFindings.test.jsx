import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import InvestigationFindings from './InvestigationFindings';

const events = [
  { id: 'e1', title: 'Car turned left', source_id: 'ev1', start_ms: 4000 },
  { id: 'e2', title: 'Witness: went straight', source_id: 'st1', start_ms: 4500 },
];
const gap = (i, extra = {}) => ({ id: `gap${i}`, gap_type: 'no_camera_calibration', scope: { evidence_id: 'ev1', from_ms: 1000, to_ms: 2000 }, details: { label: `CCTV ${i}`, effect: 'trajectories stay in pixels' }, recommendation: 'Measure points', ...extra });
const show = (props = {}) => render(<MemoryRouter><InvestigationFindings caseId="c1" nameOf={(x) => `n-${x}`} {...props} /></MemoryRouter>);
const count = (label) => screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') });

describe('InvestigationFindings', () => {
  it('shows real counts and a polished empty state per category', async () => {
    show({ gaps: [gap(1), gap(2)] });
    expect(count('evidence gaps')).toHaveTextContent('2');
    expect(count('contradictions')).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: /contradictions/i }));
    expect(await screen.findByText('No contradictions identified')).toBeInTheDocument();
    expect(screen.queryByText('None stored')).toBeNull();
  });

  it('shows the all-empty state', () => {
    show();
    expect(screen.getByText('No findings stored for this scenario')).toBeInTheDocument();
  });

  it('presents a contradiction as two sources side by side without declaring either wrong', () => {
    show({ events, cons: [{ id: 'con1', event_a: 'e1', event_b: 'e2', explanation: 'They differ', review_status: 'unreviewed' }] });
    const card = screen.getByRole('listitem', { name: /Contradiction/ });
    expect(within(card).getByText('First source')).toBeInTheDocument();
    expect(within(card).getByText('Second source')).toBeInTheDocument();
    expect(within(card).getByText(/does not say which one is wrong/)).toBeInTheDocument();
  });

  it('labels same-source corroboration as not independent', () => {
    show({ events: [{ ...events[0] }, { id: 'e3', title: 'Again', source_id: 'ev1', start_ms: 5000 }], crbs: [{ id: 'crb1', events: ['e1', 'e3'], independent: true, explanation: 'Agree' }] });
    expect(screen.getByText(/Not established as independent/)).toBeInTheDocument();
  });

  it('expands details with aria-expanded and records a review on the finding', async () => {
    const onReview = vi.fn().mockResolvedValue();
    show({ gaps: [gap(1)], finds: [{ id: 'fnd1', ref_ids: ['gap1'], review_status: 'unreviewed' }], onReview });
    const toggle = screen.getByRole('button', { name: /Inspect details/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Hide details/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Mark reviewed/ }));
    expect(onReview).toHaveBeenCalledWith('fnd1', 'reviewed');
  });

  it('filters by review status and offers no priority sort when the backend sends none', async () => {
    show({ gaps: [gap(1), gap(2)], finds: [{ id: 'f1', ref_ids: ['gap1'], review_status: 'reviewed' }] });
    expect(screen.queryByRole('radio', { name: 'Priority' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Reviewed' }));
    await waitFor(() => expect(screen.getAllByRole('listitem', { name: /Evidence gap/ })).toHaveLength(1));
  });

  it('jumps to a gap interval on its camera and to an event time', () => {
    const onSeekMedia = vi.fn(); const onSeek = vi.fn();
    show({ gaps: [gap(1)], events, cons: [{ id: 'con1', event_a: 'e1', event_b: 'e2', explanation: 'x' }], onSeekMedia, onSeek });
    const [con, g] = screen.getAllByRole('button', { name: /Go to this moment/ });
    fireEvent.click(con); expect(onSeek).toHaveBeenCalledWith(4000);
    fireEvent.click(g); expect(onSeekMedia).toHaveBeenCalledWith('ev1', 1000);
  });

  it('handles many findings and long text without hiding them', () => {
    const many = Array.from({ length: 60 }, (_, i) => gap(i, { recommendation: 'x '.repeat(400) }));
    show({ gaps: many });
    expect(screen.getAllByRole('listitem', { name: /Evidence gap/ })).toHaveLength(60);
  });
});
