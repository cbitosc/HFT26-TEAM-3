import { useState } from 'react';
import { cn } from '../utils/cn';

/** Vertical bars built with flexbox (no SVG text scaling issues). data: [{ label, value }] */
export default function BarChart({ data, height = 200, valueFormat = (v) => v }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div role="img" aria-label="Bar chart" className="w-full">
      <div className="flex items-end gap-3 border-b border-dashed border-fg-3/60" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="group relative flex h-full flex-1 items-end justify-center"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            {hover === i && (
              <span className="t-mono pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-fg shadow-md">
                {valueFormat(d.value)}
              </span>
            )}
            <div
              className={cn('w-full max-w-[44px] rounded-full transition-colors duration-fast', hover === i || (hover === null && d.value === max) ? 'bg-accent' : 'bg-hatch')}
              style={{ height: `${Math.max((d.value / max) * 100, 8)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className="t-eyebrow flex-1 truncate text-center text-fg-3">{d.label}</span>
        ))}
      </div>
    </div>
  );
}
