import { cn } from '../utils/cn';

const palette = [
  { stroke: 'stroke-accent', dot: 'bg-accent' },
  { stroke: 'stroke-accent-2', dot: 'bg-accent-2' },
  { stroke: 'stroke-warning', dot: 'bg-warning' },
  { stroke: 'stroke-fg-3', dot: 'bg-fg-3' },
];

/** data: [{ label, value }] — centre shows `centerLabel` + total. */
export default function DonutChart({ data, size = 160, stroke = 10, centerLabel = 'Total', className }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = 3;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Breakdown of ${total}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
          {data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                className={palette[i % palette.length].stroke}
                strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[1.375rem] font-semibold leading-none tabular-nums">{total}</span>
          <span className="t-eyebrow mt-1.5 text-fg-3">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-[140px] flex-1 space-y-2.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-4">
            <span className="t-eyebrow flex items-center gap-2 text-fg-2">
              <span className={cn('h-2 w-2 rounded-full', palette[i % palette.length].dot)} aria-hidden />
              {d.label}
            </span>
            <span className="t-mono text-fg">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
