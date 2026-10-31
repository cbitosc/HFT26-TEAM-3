import { useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../utils/cn';

/**
 * Controlled tabs with a sliding underline.
 * items: [{ id, label, count? }]. Pair with <TabPanel> for animated content.
 */
export function Tabs({ items, value, onChange, className, label = 'Sections', idPrefix }) {
  const auto = useId();
  const group = idPrefix || auto;

  const onKeyDown = (e) => {
    const i = items.findIndex((t) => t.id === value);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = items[(next + items.length) % items.length];
    onChange(target.id);
    document.getElementById(`${group}-${target.id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex gap-1 overflow-x-auto border-b border-line scrollbar-none', className)}>
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            id={`${group}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${group}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative -mb-px flex h-10 shrink-0 [@media(pointer:coarse)]:h-11 items-center gap-2 px-3 text-[0.875rem] font-medium transition-colors',
              active ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="t-mono text-fg-3">{t.count}</span>}
            {active && (
              <motion.span layoutId={`${group}-underline`} className="absolute inset-x-2 bottom-0 h-px bg-fg" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Fades content when `id` changes. Pass the same `idPrefix` you gave <Tabs> so the panel is linked to its tab for screen readers. */
export function TabPanel({ id, children, className, idPrefix }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        id={idPrefix ? `${idPrefix}-panel-${id}` : undefined}
        aria-labelledby={idPrefix ? `${idPrefix}-${id}` : undefined}
        role="tabpanel"
        className={className}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Compact pill selector for filters (not for page sections).
 * Pass `items` ([{ id, label }]) or `options` (strings, or [{ value, label, toggle? }]). With `toggle`, clicking the active option clears it (onChange(null)).
 */
export function Segmented({ items, options, value, onChange, label, size = 'md', className }) {
  const list = (items ?? options ?? []).map((o) => (typeof o === 'string' ? { id: o, label: o } : { id: o.id ?? o.value, label: o.label, toggle: o.toggle }));
  const tabStop = list.some((t) => t.id === value) ? value : list[0]?.id;           // roving tabindex: one stop for the whole group

  const onKeyDown = (e) => {
    const i = list.findIndex((t) => t.id === document.activeElement?.dataset.segId);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : step && i >= 0 ? (i + step + list.length) % list.length : null;
    if (next === null) return;
    e.preventDefault();
    onChange(list[next].id);
    e.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn('inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-surface-2/60 p-1', className)}>
      {list.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            data-seg-id={t.id}
            role="radio"
            type="button"
            aria-checked={active}
            tabIndex={t.id === tabStop ? 0 : -1}
            onClick={() => onChange(active && t.toggle ? null : t.id)}
            className={cn(
              'rounded-md font-medium transition',
              size === 'sm' ? 'h-6 px-2.5 text-[0.75rem] [@media(pointer:coarse)]:h-9' : 'h-8 px-3.5 text-[0.8125rem] [@media(pointer:coarse)]:h-10',
              active ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
