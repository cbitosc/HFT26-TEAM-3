import { ChevronRight } from 'lucide-react';
import { Link } from '../utils/link';
import { cn } from '../utils/cn';

/** items: [{ label, to? }] — the last item is the current page. */
export default function Breadcrumb({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.to && !last ? (
                <Link to={item.to} className="t-small text-fg-3 transition hover:text-fg">{item.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn('t-small', last ? 'font-medium text-fg' : 'text-fg-3')}>{item.label}</span>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 text-fg-3/60" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
