import { Card } from '../ui-kit';
import { cn } from '../ui-kit';

/** Workstation surface: the kit Card with the decorative radius and shadow removed (one 1px border, layered charcoal). */
export default function Panel({ className, children, ...props }) {
  return <Card padded={false} className={cn('rounded-xl !shadow-none', className)} {...props}>{children}</Card>;
}
