import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../utils/cn';

/** Period-over-period comparison. rows: [{ label, current, previous, unit? }] */
export default function ComparisonView({ rows, currentLabel = 'This period', previousLabel = 'Previous' }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <span className="t-caption flex items-center gap-1.5 text-fg-3"><span className="h-2 w-2 rounded-full bg-accent" />{currentLabel}</span>
        <span className="t-caption flex items-center gap-1.5 text-fg-3"><span className="h-2 w-2 rounded-full bg-fg-3/50" />{previousLabel}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const max = Math.max(r.current, r.previous);
          const change = Math.round(((r.current - r.previous) / r.previous) * 100);
          const good = r.lowerIsBetter ? change <= 0 : change >= 0;
          return (
            <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3">
              <span className="t-small text-fg-2">{r.label}</span>
              <span className={cn('t-mono flex items-center', good ? 'text-success' : 'text-danger')}>
                {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
                {Math.abs(change)}%
              </span>
              <div className="col-span-2 space-y-1">
                <div className="h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.current / max) * 100}%` }} /></div>
                <div className="h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-fg-3/50" style={{ width: `${(r.previous / max) * 100}%` }} /></div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
