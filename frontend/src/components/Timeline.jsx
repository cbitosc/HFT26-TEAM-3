import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { Badge, Button, FilterChips, IconButton, Segmented, useElementWidth } from '../ui-kit';
import { useWorkspace } from '../store';
import { CATEGORY_STYLE, LANES } from '../fmt';
import { formatTime, formatUncertainty, rulerTicks, tickLabel } from '../lib/time';
import { isSignificant } from '../lib/overview';

const ROW = 30;
const LEFT = 84;
const RULER = 26;
const FILTERS = [{ id: 'all', label: 'All' }, ...Object.entries(CATEGORY_STYLE).map(([id, c]) => ({ id, label: c.label }))];
const MIN_WIDTH_MS = 200;

/** Source lanes on one case clock. Pixel-accurate layout (text is never scaled). Event times are case-clock ms from the API;
 *  unplaced events (no usable time) are listed below and never drawn. The playhead is moved from a store subscription, not by React. */
export default function Timeline({ tl, gaps = [], overlaps = [], onSelect, onSeek, compact = false }) {
  const [ref, width] = useElementWidth();
  const activeId = useWorkspace((s) => s.activeEventId);
  const [filter, setFilter] = useState('all');
  const [scope, setScope] = useState('key');
  const highlight = useWorkspace((s) => s.highlightIds);
  const focus = useWorkspace((s) => s.focusRange);
  const incident = useWorkspace((s) => s.incident);
  const [view, setView] = useState(null);
  const head = useRef(null);
  const headLabel = useRef(null);
  const viewRef = useRef({ start: 0, width: 1 });

  const [lo0, hi0] = tl.span_ms?.[0] != null ? tl.span_ms : [0, 1000];
  const pad = Math.max((hi0 - lo0) * 0.05, 150);
  const full = useMemo(() => [lo0 - pad, hi0 + pad], [lo0, hi0, pad]);
  const v = view || { start: full[0], width: full[1] - full[0] };
  viewRef.current = v;
  const plotW = Math.max(width - LEFT - 8, 10);
  const x = (ms) => LEFT + ((ms - v.start) / v.width) * plotW;
  const bands = gaps.filter((g) => g.scope.case_from_ms != null && g.scope.case_to_ms != null);
  const visible = (e) => (scope === 'all' || isSignificant(e)) && (filter === 'all' || e.category === filter);
  const lanes = LANES.filter(([k]) => tl.lanes[k]?.some(visible));
  const rowsN = lanes.length + (bands.length ? 1 : 0);
  const gapRow = lanes.length;
  const h = RULER + rowsN * ROW + 6;
  const { step, ticks } = rulerTicks(v.start, v.width, Math.max(Math.floor(plotW / 70), 3));

  const setWindow = (start, w) => {
    const width2 = Math.min(Math.max(w, MIN_WIDTH_MS), full[1] - full[0]);
    setView({ start: Math.min(Math.max(start, full[0]), full[1] - width2), width: width2 });
  };
  const zoom = (factor, anchor = useWorkspace.getState().currentMs) => {
    const w = v.width * factor;
    const rel = (anchor - v.start) / v.width;
    setWindow(anchor - rel * w, w);
  };

  // playhead: DOM only; follow the playhead when zoomed in and it leaves the window
  useEffect(() => {
    const place = (ms) => {
      const cur = viewRef.current;
      if (head.current) {
        const px = LEFT + ((ms - cur.start) / cur.width) * plotW;
        head.current.setAttribute('transform', `translate(${px.toFixed(1)},0)`);
        head.current.style.display = px < LEFT - 1 || px > LEFT + plotW + 1 ? 'none' : '';
      }
      if (headLabel.current) headLabel.current.textContent = formatTime(ms);
    };
    place(useWorkspace.getState().currentMs);
    return useWorkspace.subscribe((s, p) => {
      if (s.currentMs === p.currentMs) return;
      place(s.currentMs);
      const cur = viewRef.current;
      if (s.playing && cur.width < full[1] - full[0] - 1 && (s.currentMs > cur.start + cur.width * 0.92 || s.currentMs < cur.start)) setWindow(s.currentMs - cur.width * 0.1, cur.width);
    });
  }, [plotW, v.start, v.width]);

  const seekAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ms = v.start + ((e.clientX - r.left - LEFT) / plotW) * v.width;
    if (ms >= full[0] && ms <= full[1]) onSeek(ms);
  };
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); zoom(e.deltaY < 0 ? 0.8 : 1.25, v.start + ((e.clientX - r.left - LEFT) / plotW) * v.width); }
    else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) setWindow(v.start + (e.deltaX / plotW) * v.width, v.width);
  };

  const counts = useMemo(() => { const base = Object.values(tl.lanes).flat().filter((e) => scope === 'all' || isSignificant(e)); return Object.fromEntries(FILTERS.map((f) => [f.id, f.id === 'all' ? base.length : base.filter((e) => e.category === f.id).length])); }, [tl, scope]);

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex items-center gap-2">
          <Segmented size="sm" label="Event scope" value={scope} onChange={setScope} options={[{ id: 'key', label: 'Key events' }, { id: 'all', label: 'All events' }]} />
          <FilterChips label="Event category" value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ ...f, count: counts[f.id] }))} className="min-w-0 flex-1 [@media(max-height:1100px)]:!flex-nowrap [@media(max-height:1100px)]:overflow-x-auto [&_button]:h-8 [&_button]:shrink-0 [&_button]:px-3" />
          <div className="ml-auto flex items-center gap-1.5">
            <IconButton icon={Minus} label="Zoom out" variant="outline" size="sm" onClick={() => zoom(1.5)} />
            <IconButton icon={Plus} label="Zoom in" variant="outline" size="sm" onClick={() => zoom(1 / 1.5)} />
            <Button size="sm" variant="outline" icon={Scan} onClick={() => setView(null)}>Fit</Button>
          </div>
        </div>
      )}
      <div ref={ref} className="w-full overflow-hidden rounded-lg border border-line bg-surface-2/40" onWheel={onWheel}>
        {width > 0 && (
          <svg width={width} height={h} role="group" aria-label="Investigation timeline" className="block select-none">
            <defs>
              <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgb(var(--danger))" strokeWidth="2" opacity="0.55" /></pattern>
              <clipPath id="plot"><rect x={LEFT} y="0" width={plotW} height={h} /></clipPath>
            </defs>
            {/* ruler */}
            <rect x={LEFT} y={0} width={plotW} height={RULER} fill="rgb(var(--surface-2))" />
            <g clipPath="url(#plot)">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={RULER - 6} y2={h} stroke="rgb(var(--line))" strokeDasharray={t % (step * 5) === 0 ? undefined : '2 4'} />
                  <text x={x(t) + 3} y={RULER - 9} className="mono fill-fg-3" fontSize="10">{tickLabel(t, step)}</text>
                </g>
              ))}
            </g>
            {incident && x(incident.ms) > LEFT && x(incident.ms) < LEFT + plotW && <g pointerEvents="none"><rect x={Math.min(x(incident.ms) - 4, LEFT + plotW - 150)} y={2} width={150} height={13} rx={3} fill="rgb(var(--danger))" /><text x={Math.min(x(incident.ms) - 4, LEFT + plotW - 150) + 5} y={11.5} fontSize="9.5" fill="rgb(var(--danger-fg))" fontWeight="600">POSSIBLE ACCIDENT {formatTime(incident.ms)}</text></g>}
            {/* lane labels + click-to-seek surface */}
            <rect x={LEFT} y={RULER} width={plotW} height={h - RULER} fill="transparent" onPointerDown={seekAt} style={{ cursor: 'crosshair' }} />
            <g clipPath="url(#plot)" aria-label="Recording overlap" pointerEvents="none">
              {overlaps.filter((o) => o.start_ms != null && o.end_ms != null).map((o) => (
                <rect key={`${o.evidence_ids.join('+')}:${o.start_ms}`} data-testid="overlap-band" x={x(o.start_ms)} y={RULER} width={Math.max(x(o.end_ms) - x(o.start_ms), 3)} height={Math.max(h - RULER - (bands.length ? ROW : 0), 4)} fill="rgb(var(--accent))" opacity="0.10">
                  <title>{`Two sources overlap from ${formatTime(o.start_ms)} to ${formatTime(o.end_ms)} (case clock). Overlap is not contact and is not corroboration.`}</title>
                </rect>
              ))}
            </g>
            {lanes.map(([k, label], i) => (
              <g key={k}>
                <line x1={LEFT} x2={LEFT + plotW} y1={RULER + i * ROW + ROW} y2={RULER + i * ROW + ROW} stroke="rgb(var(--line))" />
                <text x={10} y={RULER + i * ROW + ROW / 2 + 4} className="fill-fg-2" fontSize="11" fontWeight="500">{label}</text>
              </g>
            ))}
            {bands.length > 0 && <g><line x1={LEFT} x2={LEFT + plotW} y1={RULER + gapRow * ROW + ROW} y2={RULER + gapRow * ROW + ROW} stroke="rgb(var(--line))" /><text x={10} y={RULER + gapRow * ROW + ROW / 2 + 4} className="fill-warning" fontSize="11" fontWeight="500">Gaps</text></g>}
            <g clipPath="url(#plot)">
              {incident && <g pointerEvents="none"><rect x={x(incident.ms - 300)} y={RULER} width={Math.max(x(incident.ms + 300) - x(incident.ms - 300), 6)} height={h - RULER} fill="rgb(var(--danger))" opacity="0.22" /><line x1={x(incident.ms)} x2={x(incident.ms)} y1={RULER} y2={h} stroke="rgb(var(--danger))" strokeWidth="2" strokeDasharray="4 3" /><title>{`Possible accident moment, case ${formatTime(incident.ms)}`}</title></g>}
              {focus && <rect x={x(focus.start)} y={RULER} width={Math.max(x(focus.end) - x(focus.start), 4)} height={h - RULER} fill="rgb(var(--accent))" opacity="0.13" pointerEvents="none"><title>Selected finding interval</title></rect>}
              {bands.map((g) => (
                <rect key={g.id} x={x(g.scope.case_from_ms)} y={RULER + gapRow * ROW + 4} width={Math.max(x(g.scope.case_to_ms) - x(g.scope.case_from_ms), 3)} height={ROW - 8} rx={3} fill="url(#hatch)" stroke="rgb(var(--warning))" strokeOpacity="0.6" pointerEvents="none">
                  <title>{`${g.gap_type.replace(/_/g, ' ')} · ${formatTime(g.scope.case_from_ms)} to ${formatTime(g.scope.case_to_ms)} (case clock): no data`}</title>
                </rect>
              ))}
              {lanes.flatMap(([k], i) => tl.lanes[k].filter(visible).map((e) => {
                const cy = RULER + i * ROW + ROW / 2;
                const m = tl.marks[e.id] || {};
                const color = CATEGORY_STYLE[e.category]?.color || 'gray';
                const x0 = x(e.start_ms);
                const w = x(e.end_ms ?? e.start_ms) - x0;
                const sel = activeId === e.id;
                const dim = highlight.length > 0 && !highlight.includes(e.id);
                const lit = highlight.includes(e.id);
                const ring = m.contradicted_by?.length ? 'rgb(var(--danger))' : m.corroborated_by?.length ? 'rgb(var(--success))' : null;
                const stroke = ring || (sel ? 'rgb(var(--fg))' : 'none');
                return (
                  <g key={e.id} role="button" tabIndex={0} aria-label={`${e.title}, case ${formatTime(e.start_ms)}`} aria-pressed={sel}
                     onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onSelect(e)} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onSelect(e))} style={{ cursor: 'pointer' }}>
                    <title>{`${e.title}\ncase ${formatTime(e.start_ms)} ${formatUncertainty(e.uncertainty_ms)}${m.contradicted_by?.length ? '\ncontradicted' : ''}${m.corroborated_by?.length ? '\ncorroborated' : ''}`}</title>
                    {e.uncertainty_ms > 0 && <rect x={x(e.start_ms - e.uncertainty_ms)} y={cy - 2} width={Math.max(x(e.start_ms + e.uncertainty_ms) - x(e.start_ms - e.uncertainty_ms), 2)} height={4} rx={2} fill={color} opacity="0.28" />}
                    {w > 9
                      ? <rect x={x0} y={cy - 7} width={w} height={14} rx={3} fill={color} opacity={dim ? 0.25 : sel || lit ? 1 : 0.72} stroke={lit && !ring ? 'rgb(var(--accent))' : stroke} strokeWidth={ring || sel || lit ? 2 : 0} />
                      : <rect x={x0 - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${x0} ${cy})`} fill={color} opacity={dim ? 0.25 : sel || lit ? 1 : 0.9} stroke={lit && !ring ? 'rgb(var(--accent))' : stroke} strokeWidth={ring || sel || lit ? 2 : 0} />}
                  </g>
                );
              }))}
            </g>
            {/* playhead (DOM-updated) */}
            <g ref={head} pointerEvents="none">
              <line x1={0} x2={0} y1={0} y2={h} stroke="rgb(var(--accent))" strokeWidth="2" />
              <rect x={-30} y={0} width={60} height={14} rx={3} fill="rgb(var(--accent))" />
              <text ref={headLabel} x={0} y={10.5} textAnchor="middle" fontSize="9.5" className="mono" fill="rgb(var(--accent-fg))" />
            </g>
          </svg>
        )}
      </div>
      {lanes.length === 0 && <p className="t-small mt-2 text-fg-3" role="status">{Object.values(tl.lanes).flat().length ? 'No events match the current filter. Switch to All events.' : 'No events were produced for this case, so there is nothing to place on the timeline.'}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="t-caption text-fg-3">Case clock (reference source = 0). Ruler step {step >= 1000 ? `${step / 1000} s` : `${step} ms`}. Click an empty area to seek; Ctrl/⌘ + wheel zooms.</span>
        <span className="t-caption inline-flex items-center gap-1 text-fg-3"><i className="inline-block h-2 w-3 rounded-sm bg-danger/60" />contradicted</span>
        <span className="t-caption inline-flex items-center gap-1 text-fg-3"><i className="inline-block h-2 w-3 rounded-sm bg-success/60" />corroborated</span>
        <span className="t-caption inline-flex items-center gap-1 text-fg-3"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg, rgb(var(--danger)/.55) 0 2px, transparent 2px 5px)' }} />missing data (Gaps lane)</span>
      </div>
      {tl.unplaced?.length > 0 && !compact && (
        <details className="mt-3">
          <summary className="t-small cursor-pointer text-fg-2">{tl.unplaced.length} items have no usable time and are not placed on the timeline</summary>
          <p className="t-caption mt-1 text-fg-3">{tl.unplaced_note}</p>
          <ul className="mt-2 space-y-1">
            {tl.unplaced.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <Badge variant="neutral">{e.source_type.replace('video_', '')}</Badge>
                <button type="button" className="t-small text-left text-fg-2 hover:text-fg" onClick={() => onSelect(e)}>{e.title}</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
