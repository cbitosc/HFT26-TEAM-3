import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';
import Button from './Button';

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function Spinner({ className, label = 'Loading' }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-fg-3', className)} role="status" aria-label={label} />;
}

/** Centered illustration-free message block used for empty / error states. */
function StateBlock({ icon: Icon, tone = 'text-fg-3', title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <Icon className={cn('h-5 w-5', tone)} aria-hidden />
        </div>
      )}
      <h3 className="t-h3">{title}</h3>
      {description && <p className="t-small mt-1.5 max-w-sm text-fg-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** `icon` is optional: pass any lucide icon component. */
export function EmptyState({ icon, title, description, action, className }) {
  return <StateBlock icon={icon} title={title} description={description} action={action} className={className} />;
}

export function ErrorState({ title = 'Something went wrong', description = 'We could not load this. Check your connection and try again.', onRetry, className }) {
  return (
    <StateBlock
      icon={AlertTriangle}
      tone="text-danger"
      title={title}
      description={description}
      className={className}
      action={onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    />
  );
}

/** Skeleton rows for list/table loading; pass `rows` and `className` to match the target layout. */
export function LoadingState({ rows = 4, label, className }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label={label || 'Loading'}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
