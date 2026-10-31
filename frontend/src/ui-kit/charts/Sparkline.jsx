import { cn } from '../utils/cn';

/** Tiny trend line with a hollow marker on the latest point. Inherits colour from `text-*` on className. */
export default function Sparkline({ data, className }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const y = (v) => 28 - ((v - min) / span) * 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${y(v)}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn('overflow-visible', className)} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
