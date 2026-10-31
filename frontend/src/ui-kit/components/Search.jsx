import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock, CornerDownLeft, Search as SearchIcon, X } from 'lucide-react';
import { cn } from '../utils/cn';
import { Link } from '../utils/link';
import { highlightParts } from '../utils/text';

/** Wraps the words of `query` found in `text` in <mark>, styled in the accent colour (bold + tint + underline, so it survives colour-blindness). */
export function Highlight({ text, query, className }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) => p.match
        ? <mark key={i} className={cn('rounded-[3px] bg-accent/10 font-semibold text-accent-text underline decoration-accent/50 decoration-2 underline-offset-2', className)}>{p.text}</mark>
        : <span key={i}>{p.text}</span>)}
    </>
  );
}

const asItem = (s) => (typeof s === 'string' ? { label: s } : s);

/**
 * Search field with a suggestion / recent-searches popup (ARIA combobox). Arrow keys move, Enter picks or submits, Esc closes then clears,
 * and "/" focuses it from anywhere.
 *   value, onChange(text)        controlled text            onSubmit(text)            Enter on free text or the Search button
 *   suggestions: string | { label, hint?, icon? }[]         shown while typing, with matches highlighted
 *   recent: string[]             shown when the field is empty (with onRemoveRecent / onClearRecent)
 *   onSelect(item)               a suggestion or recent entry was chosen (defaults to onSubmit(label))
 */
export function SearchBox({ value, onChange, onSubmit, suggestions = [], recent = [], onSelect, onRemoveRecent, onClearRecent, placeholder = 'Search…', size = 'lg', shortcut = '/', autoFocus, className }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const listId = useId();
  const typing = value.trim().length > 0;
  const rows = useMemo(() => (typing ? suggestions.map(asItem).map((s) => ({ ...s, kind: 'suggestion' })) : recent.map((r) => ({ label: r, kind: 'recent' }))), [typing, suggestions, recent]);
  const showList = open && rows.length > 0;

  useEffect(() => setActive(-1), [value, open]);
  useEffect(() => {
    if (!shortcut) return undefined;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === shortcut && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.activeElement?.isContentEditable) { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcut]);
  useEffect(() => {
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (row) => { setOpen(false); (onSelect || ((r) => onSubmit?.(r.label)))(row); };
  const submit = () => { setOpen(false); if (value.trim()) onSubmit?.(value.trim()); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter') { e.preventDefault(); active >= 0 && rows[active] ? choose(rows[active]) : submit(); }
    else if (e.key === 'Escape') { if (showList) setOpen(false); else if (value) onChange(''); }
  };

  const big = size === 'lg';
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className={cn('flex items-center gap-3 rounded-full border border-line bg-surface shadow-sm transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15', big ? 'h-14 pl-5 pr-2' : 'h-11 pl-4 pr-1.5')}>
        <SearchIcon className={cn('shrink-0 text-fg-3', big ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden />
        <input ref={inputRef} role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={placeholder} autoFocus={autoFocus} value={value} placeholder={placeholder} autoComplete="off" spellCheck={false}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          className={cn('min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3', big ? 'text-[1.0625rem]' : 'text-[0.9375rem]')} />
        {value && <button type="button" aria-label="Clear search" onClick={() => { onChange(''); inputRef.current?.focus(); }} className="grid h-8 w-8 place-items-center rounded-full text-fg-3 transition hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" aria-hidden /></button>}
        {!value && shortcut && <kbd className="kbd hidden sm:inline">{shortcut}</kbd>}
        <button type="button" onClick={submit} disabled={!typing} className={cn('inline-flex items-center gap-1.5 rounded-full bg-accent font-medium text-accent-fg transition hover:bg-accent/90 disabled:opacity-40', big ? 'h-10 px-5' : 'h-8 px-4 text-[0.8125rem]')}>
          Search <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label={typing ? 'Suggestions' : 'Recent searches'} className="scrollbar-thin absolute inset-x-0 top-full z-overlay mt-2 max-h-80 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <li role="presentation" className="t-eyebrow flex items-center justify-between px-3 pb-1.5 pt-2 text-fg-3">
            {typing ? 'Suggestions' : 'Recent searches'}
            {!typing && onClearRecent && <button type="button" onClick={onClearRecent} className="rounded-sm normal-case tracking-normal underline-offset-2 hover:text-fg hover:underline">Clear</button>}
          </li>
          {rows.map((r, i) => {
            const Icon = r.icon || (r.kind === 'recent' ? Clock : SearchIcon);
            return (
              <li key={`${r.kind}-${r.label}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}
                className={cn('group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem]', i === active ? 'bg-accent/10 text-fg' : 'text-fg-2')}>
                <Icon className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate"><Highlight text={r.label} query={typing ? value : ''} /></span>
                {r.hint && <span className="t-caption text-fg-3">{r.hint}</span>}
                {r.kind === 'recent' && onRemoveRecent && <button type="button" aria-label={`Remove ${r.label} from recent searches`} onClick={(e) => { e.stopPropagation(); onRemoveRecent(r.label); }} className="grid h-6 w-6 place-items-center rounded-full text-fg-3 opacity-0 transition hover:bg-surface group-hover:opacity-100 focus:opacity-100"><X className="h-3.5 w-3.5" aria-hidden /></button>}
                {i === active && <ArrowUpRight className="h-3.5 w-3.5 text-fg-3" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One search result: icon tile, title and snippet with the query highlighted, a trail of meta text, a type badge.
 * Pass `to` (or `href`) to make the whole card a link.
 */
export function ResultCard({ icon: Icon, title, snippet, meta = [], badge, query, to, href, onClick, className }) {
  const body = (
    <>
      {Icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent-text transition group-hover:bg-accent group-hover:text-accent-fg"><Icon className="h-5 w-5" aria-hidden /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-h2 min-w-0 truncate"><Highlight text={title} query={query} /></h3>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        {snippet && <p className="t-small mt-1 line-clamp-2 text-fg-2"><Highlight text={snippet} query={query} /></p>}
        {meta.length > 0 && <p className="t-caption mt-2 flex flex-wrap items-center gap-x-2 text-fg-3">{meta.map((m, i) => <span key={i} className="inline-flex items-center gap-2">{i > 0 && <span aria-hidden>·</span>}<Highlight text={m} query={query} /></span>)}</p>}
      </div>
      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100" aria-hidden />
    </>
  );
  const cls = cn('card group flex w-full items-start gap-4 p-4 text-left text-fg transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:-translate-y-0.5', className);
  if (to || href) return <Link to={to ?? href} className={cn(cls, 'no-underline hover:no-underline')} onClick={onClick}>{body}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

/** Pill filters with counts. items: [{ id, label, count? }]. Single choice, `value` is the active id. */
export function FilterChips({ items, value, onChange, label = 'Filter results', className }) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" aria-pressed={on} onClick={() => onChange(it.id)}
            className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[0.8125rem] font-medium transition [@media(pointer:coarse)]:h-11',
              on ? 'border-accent bg-accent text-accent-fg shadow-sm' : 'border-line bg-surface text-fg-2 hover:border-fg-3/50 hover:text-fg')}>
            {it.label}
            {it.count !== undefined && <span className={cn('t-mono rounded-full px-1.5 text-[0.6875rem]', on ? 'bg-surface text-accent-text' : 'bg-surface-2 text-fg-3')}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
