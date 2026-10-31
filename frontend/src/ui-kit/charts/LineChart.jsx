import { useId, useState } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';
import { linePath, movingAverage, smoothPath } from '../utils/chart';

const PAD = { top: 14, right: 10, bottom: 26, left: 34 };

const niceStep = (raw) => {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

/** Axis domain with round tick values. `zeroBased=false` zooms to the data range; negative data always includes the sign. */
function niceDomain(values, zeroBased) {
  const hi0 = Math.max(...values, zeroBased ? 0 : -Infinity);
  const lo0 = zeroBased ? Math.min(0, ...values) : Math.min(...values);
  const step = niceStep(((hi0 - lo0) || 1) / 4);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.max(lo + 4 * step, Math.ceil(hi0 / step) * step);
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return { lo, hi, ticks };
}

/**
 * Line chart in the kit's "formatted with intent" style: a thin daily line with hollow markers, a heavier moving-average trend line,
 * a dashed baseline and quiet mono axis labels. data: [{ label, value }]
 *   average    moving-average window for the dark trend line (default 5, 0 turns it off)
 *   baseline   a number: values above it use the accent colour, values below use the danger colour (e.g. `baseline={0}` for gaps)
 *   dots       show hollow markers (default true)      area   soft fill between the line and the baseline (default true)
 */
export default function LineChart({ data, height = 220, zeroBased = true, average = 5, baseline, dots = true, area = true, valueFormat = (v) => v, ariaLabel = 'Line chart' }) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const id = useId().replace(/:/g, '');

  const { lo, hi, ticks } = niceDomain(data.map((d) => d.value), zeroBased);
  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
  const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const base = baseline !== undefined ? y(Math.min(Math.max(baseline, lo), hi)) : PAD.top + innerH;

  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const line = linePath(pts);
  const fill = `${line} L${x(data.length - 1)},${base} L${x(0)},${base} Z`;
  const trend = average > 1 && data.length > 2 ? smoothPath(movingAverage(data.map((d) => d.value), average).map((v, i) => [x(i), y(v)])) : null;
  const labelEvery = Math.ceil(data.length / Math.max(Math.floor(innerW / 64), 1));
  const groups = baseline !== undefined ? [['up', 'accent'], ['down', 'danger']] : [['all', 'accent']];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - PAD.left) / innerW;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="touch-pan-y">
          <defs>
            <clipPath id={`${id}-up`}><rect x="0" y="0" width={width} height={base} /></clipPath>
            <clipPath id={`${id}-down`}><rect x="0" y={base} width={width} height={height - base} /></clipPath>
          </defs>
          {ticks.map((t) => (
            <text key={t} x={PAD.left - 10} y={y(t) + 3.5} textAnchor="end" className="fill-fg-3 font-mono text-[10px] uppercase">{t}</text>
          ))}
          {data.map((d, i) => i % labelEvery === 0 && (
            <text key={`${d.label}-${i}`} x={x(i)} y={height - 7} textAnchor="middle" className="fill-fg-3 font-mono text-[10px] uppercase tracking-wider">{d.label}</text>
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} className="stroke-fg-3" strokeWidth="1" strokeDasharray={baseline !== undefined ? '3 3' : undefined} opacity={baseline !== undefined ? 1 : 0.35} />
          {groups.map(([part, tone]) => (
            <g key={part} clipPath={part === 'all' ? undefined : `url(#${id}-${part})`}>
              {area && <path d={fill} fill={`rgb(var(--${tone}) / 0.12)`} />}
              <path d={line} fill="none" stroke={`rgb(var(--${tone}) / 0.75)`} strokeWidth="1.25" strokeLinejoin="round" />
              {dots && pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="2.5" fill="rgb(var(--surface))" stroke={`rgb(var(--${tone}))`} strokeWidth="1.25" />)}
            </g>
          ))}
          {trend && <path d={trend} fill="none" className="stroke-fg" strokeWidth="2.5" strokeLinecap="round" />}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-fg-3" strokeDasharray="2 3" />
              <circle cx={x(hover)} cy={y(data[hover].value)} r="4.5" className="fill-accent stroke-surface" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-line bg-surface px-2.5 py-1.5 shadow-md" style={{ left: Math.min(Math.max(x(hover), 48), width - 48), top: 0 }}>
          <p className="t-eyebrow text-fg-3">{data[hover].label}</p>
          <p className="t-mono text-fg">{valueFormat(data[hover].value)}</p>
        </div>
      )}
    </div>
  );
}

/** Small legend row to put above a LineChart/GapChart: <ChartLegend items={[{ label: 'Daily', kind: 'dot' }, { label: '5D avg', kind: 'line' }]} /> */
export function ChartLegend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {items.map((it) => (
        <li key={it.label} className="t-eyebrow inline-flex items-center gap-2 text-fg-3">
          {it.kind === 'line'
            ? <span className="h-0.5 w-5 rounded-full bg-fg" aria-hidden />
            : <span className="inline-flex items-center" aria-hidden><i className="h-1.5 w-1.5 rounded-full border border-accent bg-surface" /><i className="h-px w-3.5 bg-accent" /><i className="h-1.5 w-1.5 rounded-full border border-accent bg-surface" /></span>}
          {it.label}
        </li>
      ))}
    </ul>
  );
}
