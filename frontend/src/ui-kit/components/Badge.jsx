import { cn } from '../utils/cn';

const variants = {
  neutral: 'border-line bg-surface-2 text-fg-2',
  accent: 'border-accent/30 bg-accent/10 text-accent-text',
  info: 'border-sem-blue/30 bg-sem-blue/10 text-sem-blue',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
};

/** variant: neutral | accent | info | success | warning | danger. Always pair color with text (or an icon), never color alone. */
export function Badge({ variant = 'neutral', icon: Icon, className, children }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[0.6875rem] font-medium', variants[variant] || variants.neutral, className)}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

const statuses = {
  completed: { label: 'Completed', variant: 'success' },
  active: { label: 'Active', variant: 'success' },
  processing: { label: 'Processing', variant: 'accent', pulse: true },
  queued: { label: 'Queued', variant: 'neutral' },
  review: { label: 'Needs review', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
};

/** Status badge with a leading dot. Add new statuses to the map above, or pass `label` to override the text. */
export function StatusBadge({ status, label }) {
  const s = statuses[status] || statuses.queued;
  return (
    <Badge variant={s.variant}>
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', s.pulse && 'animate-pulse motion-reduce:animate-none')} aria-hidden />
      {label || s.label}
    </Badge>
  );
}
