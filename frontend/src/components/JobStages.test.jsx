import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import JobStages from './JobStages';
import { jobErrorMessage } from '../lib/jobs';

describe('processing failure rendering', () => {
  it('renders the API structured error without crashing after an upload', () => {
    render(<JobStages jobs={[{id:'j1',stage:'detect',status:'failed',error:{type:'ModuleNotFoundError',message:"No module named 'ultralytics'"}}, {id:'j2',stage:'preprocess',status:'completed',result:{warnings:[]}}]} />);
    expect(screen.getByText("No module named 'ultralytics'")).toBeInTheDocument();
    expect(screen.getByText('Index frames')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
  it('supports legacy strings and incomplete structured failures', () => {
    expect(jobErrorMessage('Decode failed')).toBe('Decode failed');
    expect(jobErrorMessage({type:'TimeoutError'})).toBe('TimeoutError');
    expect(jobErrorMessage({message:{nested:'failure'}})).toContain('no message');
    expect(jobErrorMessage(null)).toContain('no message');
  });
});
