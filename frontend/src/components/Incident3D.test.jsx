import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Incident3D from './Incident3D';

const trajs = [{ frame: 'image', track_ref: { evidence_id: 'ev1', track_id: 7, class: 'car' }, points: [{ x: 600, y: 600, case_ms: 0 }, { x: 620, y: 520, case_ms: 400 }] }];

describe('Incident3D', () => {
  it('always says what the view is and is not, even without WebGL (jsdom has none)', () => {
    render(<Incident3D trajs={trajs} evidenceId="ev1" video={{ width: 1280, height: 720, kind: 'cctv' }} moment={null} />);
    expect(screen.getByText('This is a schematic, not a measurement')).toBeInTheDocument();
    expect(screen.getByText(/Distances and speeds are not measurements/)).toBeInTheDocument();
    expect(screen.getByText(/needs WebGL/)).toBeInTheDocument();
  });
  it('says there is nothing to draw when no track is stored', () => {
    render(<Incident3D trajs={[]} evidenceId="ev1" video={{ width: 1280, height: 720, kind: 'cctv' }} moment={null} />);
    expect(screen.getByText(/nothing to draw/)).toBeInTheDocument();
  });
});
