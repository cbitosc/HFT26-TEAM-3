import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CrashCuePanel from './CrashCue';

const v = (id, name) => ({ id, original_filename: name, video: { duration_ms: 1000 } });
const moment = { startMs: 4400, endMs: 5000, frames: 3, peak: 0.69, times: [4400] };

describe('CrashCuePanel', () => {
  it('states the cue is weak and never a collision finding', () => {
    render(<CrashCuePanel videos={[v('a', 'a.mp4')]} cues={{ a: { ran: true, moments: [], isolated: 0 } }} onSeek={() => {}} />);
    expect(screen.getByText(/never confirms a collision/)).toBeInTheDocument();
    expect(screen.getByText(/does not show that no collision occurred/)).toBeInTheDocument();
  });
  it('covers every video: moments, not run, unreadable, loading', () => {
    const onSeek = vi.fn();
    render(<CrashCuePanel videos={[v('a', 'a.mp4'), v('b', 'b.mp4'), v('c', 'c.mp4'), v('d', 'd.mp4')]} onSeek={onSeek}
      cues={{ a: { ran: true, moments: [moment], isolated: 2 }, b: { ran: false }, c: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /Cue at 00:04.400 · 3 frames · peak 69%/ }));
    expect(onSeek).toHaveBeenCalledWith('a', 4400);
    expect(screen.getByText(/did not run on this video/)).toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.getByText(/Reading stored cue results/)).toBeInTheDocument();
    expect(screen.getByText(/\+ 2 isolated single-frame cues/)).toBeInTheDocument();
  });
});
