import { useId } from 'react';
import { cn } from '../utils/cn';
import { linePath, movingAverage, smoothPath } from '../utils/chart';

const W = 600;
const H = 150;
const PAD = 10;

/**
 * Diverging line chart: values above the baseline are drawn in the accent colour, below it in the danger colour, so the sign is
 * readable at a glance (the dashed baseline and an `aria-label` carry the same information without colour).
 * data: number[] (e.g. daily gap vs last year).  average: moving-average window for the dark trend line (0 turns it off).
 */
export default function GapChart({ data, average = 5, baselineLabel, label = 'Daily gap chart', className }) {
  const id = useId().replace(/:/g, '');
  if (!data?.length) return null;
  const max = Math.max(...data.map(Math.abs), 1);
  const x = (i) => PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
  const y = (v) => H / 2 - (v / max) * (H / 2 - PAD);
  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = linePath(pts);
  const area = `${line} L${pts.at(-1)[0]},${H / 2} L${pts[0][0]},${H / 2} Z`;
  const trend = average > 1 ? smoothPath(movingAverage(data, average).map((v, i) => [x(i), y(v)])) : null;
  const up = data.filter((v) => v >= 0).length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${up} days above the baseline, ${data.length - up} below`} className={cn('block h-auto w-full', className)}>
      <defs>
        <clipPath id={`${id}-up`}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
        <clipPath id={`${id}-down`}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
      </defs>
      <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} className="stroke-fg-3" strokeWidth="1" strokeDasharray="3 3" />
      {baselineLabel && <text x={PAD} y={H / 2 + 14} className="fill-fg-3" fontSize="11">{baselineLabel}</text>}
      {[['up', 'accent'], ['down', 'danger']].map(([part, tone]) => (
        <g key={part} clipPath={`url(#${id}-${part})`}>
          <path d={area} fill={`rgb(var(--${tone}) / 0.14)`} />
          <path d={line} fill="none" stroke={`rgb(var(--${tone}) / 0.7)`} strokeWidth="1.25" />
          {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="2.5" fill="rgb(var(--surface))" stroke={`rgb(var(--${tone}))`} strokeWidth="1.25" />)}
        </g>
      ))}
      {trend && <path d={trend} fill="none" className="stroke-fg" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}
