import { useEffect, useRef } from 'react';
import { useWorkspace } from '../store';
import { formatTime } from '../lib/time';

/** A time readout that follows the clock without re-rendering: `map` converts case ms to the displayed clock (e.g. media = case + shift). */
export default function TimeReadout({ label, map = (ms) => ms, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const write = (ms) => { if (ref.current) ref.current.textContent = formatTime(map(ms)); };
    write(useWorkspace.getState().currentMs);
    return useWorkspace.subscribe((s, p) => { if (s.currentMs !== p.currentMs) write(s.currentMs); });
  }, [map]);
  return <span className={`mono t-small ${className}`}><span className="t-caption mr-1 text-fg-3">{label}</span><span ref={ref} /></span>;
}
