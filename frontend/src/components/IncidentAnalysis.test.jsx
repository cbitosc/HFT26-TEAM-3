import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkProvider, ThemeProvider, ToastProvider } from '../ui-kit';
import { useWorkspace } from '../store';
import { IncidentCards, IncidentGallery, IncidentOverview } from './IncidentAnalysis';
import Workspace from '../pages/Workspace';

vi.mock('../api', () => ({
  api: {
    cases: vi.fn(), case: vi.fn(), evidence: vi.fn(), actors: vi.fn(), scenarios: vi.fn(), timeline: vi.fn(),
    contradictions: vi.fn(), corroborations: vi.fn(), gaps: vi.fn(), findings: vi.fn(), trajectories: vi.fn(),
    seek: vi.fn(), incidentEvents: vi.fn(), incidentNarrative: vi.fn(), incidentFrames: vi.fn(), storyboard: vi.fn().mockResolvedValue({ scenario_id: 's', ordering: 'x', note: '', strips: [], omitted: [] }), summary: vi.fn(),
    jobs: vi.fn(), modelRuns: vi.fn(), review: vi.fn(), associations: vi.fn(), completeness: vi.fn(), frames: vi.fn(),
    overlays: vi.fn(), streamUrl: (id) => `/api/v1/evidence/${id}/stream`,
  },
}));
import { api } from '../api';

const collision = {
  id: 'evt_1', event_type: 'possible_collision', display: 'amber', title: 'Possible collision between tracked vehicles',
  start_ms: 1583, end_ms: 1583, evidence_id: 'ev_1', track_ids: [4], track_classes: ['car'],
};
const near = {
  id: 'evt_2', event_type: 'possible_near_miss', display: 'neutral', title: 'Possible near miss between tracked road users',
  start_ms: 4000, end_ms: 4200, evidence_id: 'ev_1', track_ids: [4, 9], track_classes: ['car', 'car'],
};

function PlayerMock() {
  const ms = useWorkspace((s) => s.currentMs);
  const latest = useWorkspace((s) => s.seek.latest);
  const element = useRef({ currentTime: 0 });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    element.current.currentTime = ms / 1000;
    setShown(element.current.currentTime);
  }, [latest, ms]);
  return <div data-testid="player-clock">{shown}</div>;
}

describe('timeline cards seek the existing player', () => {
  it('calls requestSeek once and moves the player clock', async () => {
    useWorkspace.getState().reset('case_1', 'scn_1');
    render(
      <>
        <IncidentCards items={[collision]} unplaced={[]} onSelect={(event) => {
          const state = useWorkspace.getState();
          state.setPlaying(false);
          state.requestSeek(event.start_ms);
        }} />
        <PlayerMock />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Possible collision/ }));
    expect(useWorkspace.getState().currentMs).toBe(1583);
    expect(useWorkspace.getState().seek.latest).toBe(1);
    expect(screen.getByTestId('player-clock')).toHaveTextContent('1.583');
    expect(screen.getByText('00:01.583')).toBeInTheDocument();
  });
});

describe('incident card treatment and gallery', () => {
  it('uses amber only for display amber and keeps a possible collision off the critical style', () => {
    render(<IncidentCards items={[collision, near]} unplaced={[]} onSelect={() => {}} />);
    const amber = screen.getByRole('button', { name: /Possible collision/ });
    const neutral = screen.getByRole('button', { name: /Possible near miss/ });
    expect(amber).toHaveAttribute('data-display', 'amber');
    expect(amber.className).toContain('border-amber-500/70');
    expect(amber.className).not.toContain('bg-red-600');
    expect(neutral).toHaveAttribute('data-display', 'neutral');
    expect(neutral.className).not.toContain('border-amber-500/70');
    expect(neutral.className).not.toContain('bg-red-600');
  });

  it('renders only incident-frame URLs and an empty state without an image', () => {
    const { rerender } = render(<IncidentGallery items={[]} />);
    expect(screen.getByText('No extracted frame for this event.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<IncidentGallery items={[{ frame_id: 1, frame_no: 71, time_ms: 1583, thumbnail_url: '/api/v1/frames/1/image', full_url: '/api/v1/frames/1/image?full=true' }]} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/v1/frames/1/image');
  });

  it('shows the deterministic headline and the unavailable line, not a substitute paragraph', () => {
    render(<IncidentOverview provenance="real-detector" narrative={{
      contact_status: 'insufficient_evidence',
      deterministic: { headline: 'No collision or near miss was identified in the analysed evidence.', sentences: [] },
      ai_narrative_status: 'unavailable',
      ai_narrative_reason: 'not_configured',
      ai_narrative: null,
      fallback_prose: 'The vehicles collided at noon.',
    }} />);
    expect(screen.getByText('No collision or near miss was identified in the analysed evidence.')).toBeInTheDocument();
    expect(screen.getByText('AI narrative is unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('The vehicles collided at noon.')).toBeNull();
  });
});

function page() {
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="t">
      <ToastProvider>
        <MemoryRouter initialEntries={['/cases/case_1']}>
          <LinkProvider component={Link} prop="to">
            <Routes><Route path="/cases/:caseId" element={<Workspace />} /></Routes>
          </LinkProvider>
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('primary workspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps trajectories behind a closed technical disclosure', async () => {
    api.cases.mockResolvedValue({ items: [] });
    api.case.mockResolvedValue({ id: 'case_1', title: 'Junction', code: 'TL-1', designation: 'real' });
    api.evidence.mockResolvedValue({ items: [] });
    api.actors.mockResolvedValue({ items: [] });
    api.scenarios.mockResolvedValue({ items: [{ id: 'scn_1', name: 'baseline', is_baseline: true }] });
    api.timeline.mockResolvedValue({ lanes: {}, unplaced: [], span_ms: [0, 1000] });
    api.contradictions.mockResolvedValue({ items: [] });
    api.corroborations.mockResolvedValue({ items: [{ id: 'crb_1', rule_id: 'COR-COLL-01', events: ['evt_1'], explanation: 'consistent with an impact, not proof', independent: false }] });
    api.gaps.mockResolvedValue({ items: [] });
    api.findings.mockResolvedValue({ items: [] });
    api.trajectories.mockResolvedValue({ items: [] });
    api.seek.mockResolvedValue({ targets: [], unsynchronized: [] });
    api.jobs.mockResolvedValue({ items: [] });
    api.modelRuns.mockResolvedValue({ items: [] });
    api.incidentEvents.mockResolvedValue({ scenario_id: 'scn_1', contact_status: 'insufficient_evidence', provenance: 'none', items: [], unplaced: [] });
    api.incidentNarrative.mockResolvedValue({
      contact_status: 'insufficient_evidence',
      deterministic: { headline: 'No collision or near miss was identified in the analysed evidence.', sentences: [] },
      ai_narrative_status: 'unavailable', ai_narrative: null,
    });
    api.incidentFrames.mockResolvedValue({ items: [] });
    api.associations.mockRejectedValue(new Error('404'));
    api.completeness.mockRejectedValue(new Error('404'));
    page();
    expect(await screen.findByLabelText('Incident summary')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name:'Advanced details'}));
    expect(await screen.findByRole('dialog', {name:'Advanced investigation'})).toBeInTheDocument();
    fireEvent.click(screen.getByText('Model & scene details'));
    expect(screen.getByText('AI narrative is unavailable.')).toBeInTheDocument();
    expect(document.querySelector('[aria-label="Trajectories"]')).toBeNull();
    const details = screen.getByText('Technical details').closest('details');
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('No trajectory for this camera yet.');
    expect(screen.getByLabelText('Investigation findings')).toHaveTextContent('consistent with an impact, not proof');
  });
});
