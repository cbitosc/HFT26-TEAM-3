import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LinkProvider, ThemeProvider } from '../ui-kit';
import { Link } from 'react-router-dom';
import Landing from './Landing';
import { EVENTS, mapToClip } from '../landing/data';
import { MULTI_SOURCE, RECORDINGS, START_ROUTE } from '../landing/config';

const renderLanding = () => render(<ThemeProvider defaultTheme="ember" storageKey="t"><MemoryRouter><LinkProvider component={Link} prop="to"><Landing /></LinkProvider></MemoryRouter></ThemeProvider>);

describe('landing page', () => {
  it('states the product promise and points both investigation CTAs at the real creation route', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reconstruct What Really Happened.');
    expect(screen.getByText('AI-POWERED ACCIDENT INVESTIGATION')).toBeInTheDocument();
    expect(START_ROUTE).toBe('/new');
    const starts = screen.getAllByRole('link', { name: /start (an )?investigation/i });
    expect(starts.length).toBeGreaterThanOrEqual(2);
    starts.forEach((a) => expect(a).toHaveAttribute('href', '/new'));
  });
  it('has the four navigation items and credits the demo clip, labelling the overlay as illustrative', () => {
    renderLanding();
    const nav = within(screen.getByRole('navigation', { name: 'Landing sections' }));
    expect(nav.getAllByRole('link').map((l) => l.textContent)).toEqual(['Problem', 'How it works', 'Evidence', 'Timeline', 'Contradictions', 'Report']);
    expect(screen.getAllByText(new RegExp(MULTI_SOURCE.attribution)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp('ACCIDENT benchmark')).length).toBeGreaterThan(0);
    expect(screen.getByText(/crash is not located in these 12-second windows/i)).toBeInTheDocument();
    expect(screen.getAllByRole('figure')).toHaveLength(5);
  });
});

describe('five recordings', () => {
  it('shows five different recordings, none claimed to share a clock', () => {
    renderLanding();
    expect(new Set(RECORDINGS.clips.map((c) => c.src)).size).toBe(5);
    expect(new Set(RECORDINGS.clips.map((c) => c.scene)).size).toBe(5);
    expect(screen.getByRole('heading', { name: /Five recordings\.\s*Five separate clocks\./ })).toBeInTheDocument();
    expect(screen.getAllByText('Not on a shared axis')).toHaveLength(5);
    expect(screen.queryByLabelText('Shared scrubber')).toBeNull();
    RECORDINGS.clips.forEach((c) => expect(screen.getByRole('button', { name: `Play ${c.name}` })).toBeInTheDocument());
  });
});

describe('product explanation', () => {
  it('states what is being built and the problem it addresses', () => {
    renderLanding();
    expect(screen.getByText(/combines footage from multiple cameras and sources into one synchronized accident timeline/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /never in one place/ })).toBeInTheDocument();
    expect(screen.getByText('Align every source on one clock')).toBeInTheDocument();
    expect(screen.getAllByText(/never decides fault/).length).toBeGreaterThan(0);
  });
});

describe('timeline mapping', () => {
  it('keeps illustrative events in order and clamps seeks to the real clip duration', () => {
    const ts = EVENTS.map((e) => e.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(mapToClip(16.2, 15.1)).toBeLessThanOrEqual(15.1);
    expect(mapToClip(999, 15.1)).toBeLessThan(15.1);
    expect(mapToClip(0, 15.1)).toBe(0);
    expect(mapToClip(5, 0)).toBeNull();
  });
});
