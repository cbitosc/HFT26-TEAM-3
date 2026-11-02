/**
 * Small ready-made pieces built from the kit's primitives: chips, tag input, banner, confirm dialog, notifications helper,
 * titled section, skeleton rows, priority bars and a level badge. They are separate from the primitives so you can ignore
 * them without losing anything.
 */
import { useCallback, useId, useState } from 'react';
import { X } from 'lucide-react';
import { LEVEL_STYLE } from '../config/levels';
import { cn } from '../utils/cn';
import Alert from './Alert';
import ConfirmationDialog from './ConfirmationDialog';
import { Skeleton } from './Feedback';
import { useToast } from './Toast';

export const cx = cn;

/** Four ascending bars; the number filled encodes the level, so it reads without colour. */
export function PriorityBars({ level, styles = LEVEL_STYLE, className, size = 'md' }) {
  const s = styles[level] || Object.values(styles).at(-1);
  const heights = size === 'sm' ? [5, 8, 11, 14] : [6, 10, 14, 18];
  return (
    <span className={cx('inline-flex items-end gap-[2px]', className)} role="img" aria-label={`${level} priority`}>
      {heights.map((px, i) => <span key={i} style={{ height: px }} className={cx('w-[4px] rounded-full', i < s.bars ? s.bg : 'bg-fg/15')} />)}
    </span>
  );
}

/** Pill with bars, the level name and an optional score. `note` adds a small caption such as "provisional". */
export function LevelBadge({ level, score, note, styles = LEVEL_STYLE }) {
  const s = styles[level] || Object.values(styles).at(-1);
  return (
    <span className={cx('inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[0.8125rem]', s.ring, s.wash)}>
      <PriorityBars level={level} styles={styles} size="sm" />
      <span className={cx('font-medium', s.text)}>{level}</span>
      {score !== undefined && <span className="t-mono border-l border-fg/20 pl-2 text-fg-2">{score}</span>}
      {note && <span className="t-caption text-fg-2">{note}</span>}
    </span>
  );
}

/** Small removable label. tone: default | pattern (purple) | tag (accent). */
export function Chip({ children, tone = 'default', onRemove }) {
  const tones = {
    default: 'bg-surface-2 text-fg-2 border-line',
    pattern: 'bg-sem-purple/10 text-sem-purple border-sem-purple/25',
    tag: 'bg-accent/10 text-accent-text border-accent/25',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.75rem]', tones[tone])}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${children}`} className="-mr-0.5 opacity-70 hover:opacity-100">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** Type-and-press-Enter tag input with suggestions (arrow keys + Enter/Tab/comma to add, Backspace to remove). value: string[] */
export function TagInput({ value, onChange, suggestions = [], placeholder, tone = 'pattern', id }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);                       // -1: nothing highlighted, so Enter adds exactly what was typed
  const lower = value.map((v) => v.toLowerCase());
  const matches = suggestions.filter((s) => !lower.includes(s.toLowerCase()) && s.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 8);
  const add = (name) => {
    const n = name.trim().replace(/\s+/g, ' ');
    const canonical = suggestions.find((x) => x.toLowerCase() === n.toLowerCase()) || n;       // reuse an existing name's casing
    if (n && !lower.includes(canonical.toLowerCase())) onChange([...value, canonical]);
    setText('');
    setHi(-1);
  };
  return (
    <div className="relative">
      <div className="ctl flex min-h-[38px] flex-wrap items-center gap-1.5 py-1.5">
        {value.map((v) => <Chip key={v} tone={tone} onRemove={() => onChange(value.filter((x) => x !== v))}>{v}</Chip>)}
        <input id={id} value={text} placeholder={value.length ? '' : placeholder}
          className="min-w-[120px] flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-fg-3"
          onChange={(e) => { setText(e.target.value); setOpen(true); setHi(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              const pick = open && hi >= 0 && matches[hi] ? matches[hi] : text;
              if (pick.trim()) { e.preventDefault(); add(pick); }
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
            else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
            else if (e.key === 'Escape') setOpen(false);
          }} />
      </div>
      {open && matches.length > 0 && (
        <ul className="scrollbar-thin absolute z-overlay mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface p-1 shadow-pop" role="listbox">
          {matches.map((m, i) => (
            <li key={m} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); add(m); }}
              className={cx('cursor-pointer rounded-sm px-2.5 py-1.5 text-[0.8125rem]', i === hi ? 'bg-accent/10 text-fg' : 'text-fg-2 hover:bg-surface-2')}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Stack of loading placeholders. */
export function SkeletonRows({ rows = 5, className }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className={cx('h-14 w-full', className)} />)}
    </div>
  );
}

/** Inline notice. tone: info | warn | error | ok. */
export function Banner({ tone = 'info', children, action, onClose }) {
  const variant = { info: 'info', warn: 'warning', error: 'danger', ok: 'success' }[tone] || 'info';
  return (
    <Alert variant={variant} action={action || (onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="text-fg-3 hover:text-fg"><X className="h-4 w-4" /></button>)}>
      <span className="text-fg">{children}</span>
    </Alert>
  );
}

/** Confirmation dialog with the common prop names: open, title, children, confirmLabel, danger, onConfirm, onCancel, loading. */
export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, onConfirm, onCancel, loading }) {
  return <ConfirmationDialog open={open} onClose={onCancel} onConfirm={onConfirm} title={title} description={children} confirmLabel={confirmLabel} danger={danger} loading={loading} />;
}

/** `const notify = useNotify(); notify('Saved'); notify('Could not save', 'error')`. Needs <ToastProvider> above it. */
export function useNotify() {
  const toast = useToast();
  if (!toast) throw new Error('useNotify() must be used inside <ToastProvider>.');
  return useCallback((message, tone = 'ok') => toast({ title: message, type: tone === 'error' ? 'error' : 'success' }), [toast]);
}

/** Titled bordered block with an optional right-aligned aside. */
export function Section({ title, aside, children, className }) {
  const id = useId();
  return (
    <section className={cx('card', className)} aria-labelledby={title ? id : undefined}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="t-h3">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
