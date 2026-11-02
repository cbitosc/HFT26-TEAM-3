import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

export function ProgressBar({ value, label, ariaLabel, showValue, tone = 'accent', size = 'md', className }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tones = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', muted: 'bg-fg-3' };
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-2 flex items-center justify-between">
          <span className="t-small text-fg-2">{label}</span>
          {showValue && <span className="t-mono text-fg">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel || label || 'Progress'}
        className={cn('overflow-hidden rounded-full bg-surface-2', size === 'sm' ? 'h-1' : 'h-1.5')}
      >
        <motion.div
          className={cn('h-full rounded-full', tones[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        />
      </div>
    </div>
  );
}

export function ProgressCircle({ value, size = 72, stroke = 6, tone = 'accent', children, label = 'Progress' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tones = { accent: 'stroke-accent', success: 'stroke-success', warning: 'stroke-warning', danger: 'stroke-danger' };
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={tones[tone]}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
