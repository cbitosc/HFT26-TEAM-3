import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, History as HistoryIcon, Search, Trash2 } from 'lucide-react';
import { cn } from '../utils/cn';
import Button from './Button';
import ConfirmationDialog from './ConfirmationDialog';
import { EmptyState } from './Feedback';
import IconButton from './IconButton';
import { groupByDay } from '../utils/dates';
import { Highlight } from './Search';

const ICONS = { search: Search, visit: Eye, action: CheckCircle2 };
const clock = (iso) => new Date(iso).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });

/**
 * Activity history grouped by day. items: [{ id, type: 'search' | 'visit' | 'action', title, subtitle?, at: ISO string, icon? }]
 *   query     highlights matches in titles and subtitles      onOpen(item)   "Open" / row click (omit to hide)
 *   onRemove(item)  adds a delete button per row              onClear()      adds "Clear all" with a confirmation dialog
 */
export default function HistoryList({ items, query, onOpen, onRemove, onClear, empty, className }) {
  const groups = useMemo(() => groupByDay(items), [items]);
  const [confirm, setConfirm] = useState(false);

  if (!items.length) return empty ?? <EmptyState icon={HistoryIcon} title="Nothing here yet" description="Things you search for and open will show up here." />;
  return (
    <div className={className}>
      {onClear && <div className="mb-2 flex justify-end"><Button size="sm" variant="ghost" leftIcon={Trash2} onClick={() => setConfirm(true)}>Clear all</Button></div>}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="t-eyebrow sticky top-[4.5rem] z-10 mb-2 inline-block rounded-full bg-surface-2 px-3 py-1.5 text-fg-2">{g.label}</h3>
            <ul className="relative space-y-1 before:absolute before:bottom-3 before:left-[1.375rem] before:top-3 before:w-px before:bg-line">
              {g.items.map((it) => {
                const Icon = it.icon || ICONS[it.type] || HistoryIcon;
                return (
                  <li key={it.id} className="group relative flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-2">
                    <span className={cn('relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface', it.type === 'search' ? 'text-accent-text' : 'text-fg-2')}><Icon className="h-4 w-4" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="t-small truncate font-medium"><Highlight text={it.title} query={query} /></p>
                      {it.subtitle && <p className="t-caption truncate text-fg-3"><Highlight text={it.subtitle} query={query} /></p>}
                    </div>
                    <time dateTime={it.at} className="t-mono shrink-0 text-fg-3">{clock(it.at)}</time>
                    <span className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      {onOpen && <Button size="sm" variant="outline" onClick={() => onOpen(it)}>{it.type === 'search' ? 'Search again' : 'Open'}</Button>}
                      {onRemove && <IconButton icon={Trash2} label={`Remove “${it.title}” from history`} size="sm" onClick={() => onRemove(it)} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {onClear && <ConfirmationDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onClear(); }} title="Clear all history?" description="This removes every entry on this page. It cannot be undone." confirmLabel="Clear all" danger />}
    </div>
  );
}
