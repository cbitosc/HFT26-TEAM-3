import { useId } from 'react';
import { cn } from '../utils/cn';

const TONES = { accent: 'stroke-accent', 'accent-2': 'stroke-accent-2', success: 'stroke-success', warning: 'stroke-warning', danger: 'stroke-danger', muted: 'stroke-fg-3' };

/**
 * Semicircle gauge. segments: [{ label, value, tone?, hatched? }]; the first segments fill the arc, `hatched` ones draw as diagonal stripes
 * (use it for "pending"). The centre shows `value` (default: share of the non-hatched segments) with `caption` below.
 */
export default function GaugeChart({ segments, value, caption, size = 260, thickness = 26, className }) {
  const id = useId().replace(/:/g, '');
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const len = Math.PI * r;
  const gap = 4;
  const done = segments.filter((s) => !s.hatched).reduce((s, x) => s + x.value, 0);
  const shown = value ?? `${Math.round((done / total) * 100)}%`;
  let offset = 0;
  const arc = `M ${thickness / 2},${size / 2} A ${r},${r} 0 0 1 ${size - thickness / 2},${size / 2}`;
  return (
    <figure className={cn('inline-flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size / 2 + thickness / 2 }}>
        <svg width={size} height={size / 2 + thickness / 2} role="img" aria-label={`${shown}. ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <defs>
            <pattern id={`${id}-h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" strokeWidth="2" className="stroke-fg-3" opacity="0.6" /></pattern>
          </defs>
          <path d={arc} fill="none" strokeWidth={thickness} className="stroke-surface-2" />
          {segments.map((s, i) => {
            const l = (s.value / total) * len;
            const node = (
              <path key={s.label} d={arc} fill="none" strokeWidth={thickness} strokeDasharray={`${Math.max(l - gap, 0)} ${len}`} strokeDashoffset={-offset}
                className={s.hatched ? undefined : TONES[s.tone || (i === 0 ? 'accent' : 'accent-2')]} stroke={s.hatched ? `url(#${id}-h)` : undefined}
                opacity={!s.hatched && i > 0 ? 0.55 + (0.3 / segments.length) : 1} />
            );
            offset += l;
            return node;
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums">{shown}</p>
          {caption && <p className="t-eyebrow mt-1.5 text-fg-3">{caption}</p>}
        </div>
      </div>
      <figcaption className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1">
        {segments.map((s, i) => (
          <span key={s.label} className="t-eyebrow inline-flex items-center gap-2 text-fg-3">
            <span className={cn('h-2.5 w-2.5 rounded-full', s.hatched ? 'border border-fg-3 bg-hatch' : i === 0 ? 'bg-accent' : 'bg-accent-2')} aria-hidden />{s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
