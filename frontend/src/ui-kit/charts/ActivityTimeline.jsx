import { cn } from '../utils/cn';
import { timeAgo } from '../utils/format';

/** items: [{ id, icon, title, detail?, time (ISO) }] */
export default function ActivityTimeline({ items }) {
  return (
    <ol className="relative">
      {items.map((it, i) => (
        <li key={it.id} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-line" aria-hidden />}
          <span className={cn('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface')}>
            <it.icon className="h-3.5 w-3.5 text-fg-2" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="t-small text-fg">{it.title}</p>
            {it.detail && <p className="t-caption mt-0.5 truncate text-fg-3">{it.detail}</p>}
          </div>
          <time dateTime={it.time} className="t-caption shrink-0 pt-1 text-fg-3">{timeAgo(it.time)}</time>
        </li>
      ))}
    </ol>
  );
}
