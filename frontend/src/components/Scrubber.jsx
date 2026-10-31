import { useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '../store';
import { CATEGORY_STYLE } from '../fmt';

/** Seek bar over the case clock with an event tick for every placed event. The playhead is moved by subscribing to the store and writing a
 *  CSS transform: React does not re-render this component while the video plays. */
export default function Scrubber({ range, events, onSeek, onSelect }) {
  const wrap = useRef(null);
  const incident = useWorkspace((s) => s.incident);
  const head = useRef(null);
  const [lo, hi] = range;
  const span = Math.max(hi - lo, 1);
  const pct = (ms) => Math.min(Math.max(((ms - lo) / span) * 100, 0), 100);
  // events within the same 1% of the bar share one tick (title says how many); every event stays reachable from the timeline and the event list
  const ticks = useMemo(() => {
    const by = new Map();
    events.forEach((e) => { const k = Math.round(pct(e.start_ms)); by.set(k, [...(by.get(k) || []), e]); });
    return [...by.values()].map((g) => ({ g, first: g[0], n: g.length }));
  }, [events, lo, hi]);

  useEffect(() => {
    const move = (ms) => { if (head.current) head.current.style.left = `${pct(ms)}%`; };
    move(useWorkspace.getState().currentMs);
    return useWorkspace.subscribe((s, prev) => { if (s.currentMs !== prev.currentMs) move(s.currentMs); });
  }, [lo, hi]);

  const at = (clientX) => {
    const r = wrap.current.getBoundingClientRect();
    return lo + Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * span;
  };
  const onDown = (e) => {
    if (e.target.dataset.tick) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(at(e.clientX));
  };
  const onMove = (e) => { if (e.buttons === 1) onSeek(at(e.clientX)); };

  return (
    <div ref={wrap} role="slider" tabIndex={0} aria-label="Seek on the case clock" aria-valuemin={Math.round(lo)} aria-valuemax={Math.round(hi)}
         aria-valuenow={Math.round(useWorkspace.getState().currentMs)}
         onPointerDown={onDown} onPointerMove={onMove}
         onKeyDown={(e) => { if (e.key === 'Home') onSeek(lo); if (e.key === 'End') onSeek(hi); }}
         className="relative h-7 cursor-pointer touch-none select-none rounded-full border border-line bg-surface-2">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" aria-hidden />
      {ticks.map(({ first, n, g }) => (
        <button key={first.id} type="button" data-tick="1" title={n > 1 ? `${n} events here, first: ${first.title}` : first.title} aria-label={n > 1 ? `${n} events, first: ${first.title}` : first.title}
                onClick={() => onSelect(first)} style={{ left: `${pct(first.start_ms)}%`, background: CATEGORY_STYLE[first.category]?.color, height: `${Math.min(12 + n * 2, 22)}px` }}
                className="absolute top-1/2 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm opacity-80 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
      ))}
      {incident && <div className="pointer-events-none absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-sm bg-danger" style={{ left: `${pct(incident.ms)}%` }} title="Possible accident moment" aria-hidden />}
      <div ref={head} className="pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2 bg-accent shadow-[0_0_0_3px_rgb(var(--accent)/0.2)]" aria-hidden />
    </div>
  );
}
