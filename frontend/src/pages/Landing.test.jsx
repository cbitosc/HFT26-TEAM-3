import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LinkProvider, ThemeProvider } from '../ui-kit';
import { Link } from 'react-router-dom';
import Landing from './Landing';
import { EVENTS, mapToClip } from '../landing/data';
import { DEMO_VIDEO, START_ROUTE } from '../landing/config';

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
    expect(nav.getAllByRole('link').map((l) => l.textContent)).toEqual(['Product', 'How it works', 'Capabilities', 'About']);
    expect(screen.getAllByText(DEMO_VIDEO.attribution).length).toBeGreaterThan(0);
    expect(screen.getByText(/Illustrative demo overlay/)).toBeInTheDocument();
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
