import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../utils/cn';

const variants = {
  info: { icon: Info, box: 'border-accent/25 bg-accent/5', tone: 'text-accent-text' },
  success: { icon: CheckCircle2, box: 'border-success/25 bg-success/5', tone: 'text-success' },
  warning: { icon: AlertTriangle, box: 'border-warning/25 bg-warning/5', tone: 'text-warning' },
  danger: { icon: XCircle, box: 'border-danger/25 bg-danger/5', tone: 'text-danger' },
};

export default function Alert({ variant = 'info', title, children, action, className }) {
  const { icon: Icon, box, tone } = variants[variant] || variants.info;
  return (
    <div role={variant === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-xl border p-4', box, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="t-small font-medium">{title}</p>}
        {children && <div className={cn("t-small text-fg-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
