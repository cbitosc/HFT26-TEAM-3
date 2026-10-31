import { cn } from '../utils/cn';

const COLOR = { red: 'var(--sem-red)', purple: 'var(--sem-purple)', teal: 'var(--sem-teal)', blue: 'var(--sem-blue)', orange: 'var(--sem-orange)', green: 'var(--success)', accent: 'var(--accent-text)' };
const rgb = (tone) => `rgb(${COLOR[tone] || COLOR.accent})`;
const rgba = (tone, a) => `rgb(${COLOR[tone] || COLOR.accent} / ${a})`;

/** A row of rounded blocks, `filled` of `total` lit (e.g. 3 overdue of 12 due). */
export function Segments({ filled = 0, total = 0, tone = 'red' }) {
  const n = Math.min(Math.max(total, filled), 12);
  if (!n) return null;
  const lit = Math.min(filled, n);
  return (
    <div className="flex gap-1" role="img" aria-label={`${filled} of ${total}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-3.5 min-w-0 flex-1 rounded-[4px]" style={{ maxWidth: 18, background: i < lit ? rgb(tone) : 'rgb(var(--fg) / 0.1)' }} />
      ))}
    </div>
  );
}

/** A row of dots, `active` of `total` lit. */
export function Dots({ active = 0, total = 0, tone = 'purple' }) {
  const n = Math.min(Math.max(total, active), 12);
  if (!n) return null;
  return (
    <div className="flex gap-2" role="img" aria-label={`${active} of ${total}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i < active ? rgb(tone) : 'rgb(var(--fg) / 0.14)' }} />
      ))}
    </div>
  );
}

/** A small line chart, optionally with dots on the points. Needs at least two values. */
export function Spark({ data = [], tone = 'teal', dots = false }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, 30 - ((v - min) / span) * 26]);
  return (
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-5 w-full overflow-visible" role="img" aria-label="trend">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={rgb(tone)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {dots && pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={rgb(tone)} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/** Mini bar chart. */
export function Bars({ data = [], tone = 'blue' }) {
  const max = Math.max(1, ...data);
  if (!data.length) return null;
  return (
    <div className="flex h-5 items-end gap-1" role="img" aria-label="bar chart">
      {data.map((v, i) => <span key={i} className="min-w-0 flex-1 rounded-[5px]" style={{ height: `${Math.max(12, (v / max) * 100)}%`, maxWidth: 16, background: rgba(tone, 0.85) }} />)}
    </div>
  );
}

/** One stacked bar split into parts, with the numbers underneath. */
export function Split({ parts = [] }) {
  const total = parts.reduce((n, p) => n + (p.value || 0), 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-1.5 gap-1 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className="h-full rounded-full" style={{ flex: p.value, background: rgb(p.tone) }} />)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0 text-[10.5px] text-fg-3">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: rgb(p.tone) }} />{p.label} <span className="font-mono text-fg-2">{p.value}</span></span>)}
      </div>
    </div>
  );
}

const TYPES = { segments: Segments, dots: Dots, spark: Spark, bars: Bars, split: Split };

export default function Viz({ type, className, ...props }) {
  const C = TYPES[type];
  return C ? <div className={cn(className)}><C {...props} /></div> : null;
}
