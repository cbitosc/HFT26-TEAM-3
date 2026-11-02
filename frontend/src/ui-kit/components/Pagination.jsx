import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';
import IconButton from './IconButton';

/** 1 … 4 5 [6] 7 8 … 20: always first, last and a window around the current page. */
function pageWindow(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((n) => set.add(n));
  const sorted = [...set].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i && n - sorted[i - 1] > 1 ? ['…', n] : [n]));
}

/** page is 1-based. total / pageSize are optional and only drive the "Showing a–b of n" text. */
export default function Pagination({ page, pageCount, onChange, total, pageSize }) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total || 0);
  const pages = pageWindow(page, pageCount);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <p className="t-small text-fg-3">
        {total !== undefined && (<>Showing <span className="t-mono text-fg-2">{from}–{to}</span> of <span className="t-mono text-fg-2">{total}</span></>)}
      </p>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" size="sm" variant="outline" tooltip={false} disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((p, i) => p === '…' ? <span key={`gap-${i}`} className="px-1 text-fg-3" aria-hidden>…</span> : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn('t-mono h-8 min-w-8 rounded-md px-2 transition', p === page ? 'bg-surface-2 text-fg ring-1 ring-line' : 'text-fg-3 hover:bg-surface-2 hover:text-fg')}
              aria-label={`Page ${p}`}
            >
              {p}
            </button>
          ))}
        </div>
        <IconButton icon={ChevronRight} label="Next page" size="sm" variant="outline" tooltip={false} disabled={page >= pageCount} onClick={() => onChange(page + 1)} />
      </div>
    </nav>
  );
}
