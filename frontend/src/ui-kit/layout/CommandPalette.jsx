import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { useHotkey } from '../hooks/useHotkey';
import { useOverlay } from '../hooks/useOverlay';
import { cn } from '../utils/cn';
import { Scrim } from '../components/Modal';
import { Highlight } from '../components/Search';

const PaletteContext = createContext(null);
/** `const palette = useCommandPalette(); palette.open()` */
export const useCommandPalette = () => useContext(PaletteContext);

/**
 * Cmd/Ctrl+K palette. You supply the commands, so it works with any router or app:
 *
 *   commands: [{ id, group, label, icon?, keywords?, run() }]
 *   onQuery?: (text) => command | command[] | null   // optional extra result for the typed text, e.g. "Search for ..."
 */
export function CommandPaletteProvider({ commands = [], onQuery, placeholder = 'Type a command or search…', hotkey = 'mod+k', children }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  useHotkey(hotkey, toggle);
  const value = useMemo(() => ({ open: () => setOpen(true), close, toggle }), [close, toggle]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      {createPortal(<AnimatePresence>{open && <Palette commands={commands} onQuery={onQuery} placeholder={placeholder} onClose={close} />}</AnimatePresence>, document.body)}
    </PaletteContext.Provider>
  );
}

function Palette({ commands, onQuery, placeholder, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const panelRef = useOverlay(true, onClose);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? commands.filter((c) => `${c.label} ${c.keywords || ''}`.toLowerCase().includes(q)) : commands;
    const extra = q && onQuery ? [].concat(onQuery(query.trim()) || []) : [];
    return [...extra, ...hits];
  }, [commands, query, onQuery]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);

  const run = (cmd) => { onClose(); cmd?.run(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % Math.max(results.length, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[index]); }
  };

  let lastGroup = null;
  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[12vh]">
      <Scrim onClick={onClose} />
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1} onKeyDown={onKeyDown}
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop outline-none"
        initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-fg-3" aria-hidden />
          <input data-autofocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label="Search commands" role="combobox" aria-expanded="true"
            aria-controls="palette-list" aria-activedescendant={results[index] ? `cmd-${results[index].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-fg-3" />
          <kbd className="t-mono rounded-sm border border-line px-1.5 py-0.5 text-fg-3">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[340px] overflow-y-auto p-2">
          {results.length === 0 && <li className="t-small px-3 py-8 text-center text-fg-3">No results for “{query}”</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup && <li role="presentation" className="t-eyebrow px-3 pb-1.5 pt-3 text-fg-3 first:pt-1">{c.group}</li>;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <Fragment key={c.id}>
                {header}
                <li role="presentation">
                  <div id={`cmd-${c.id}`} role="option" aria-selected={i === index} onMouseMove={() => setIndex(i)} onClick={() => run(c)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[0.875rem]', i === index ? 'bg-surface-2 text-fg' : 'text-fg-2')}>
                    {Icon ? <Icon className="h-4 w-4 text-fg-3" aria-hidden /> : <span className="h-4 w-4" />}
                    <span className="flex-1"><Highlight text={c.label} query={query} /></span>
                    {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-fg-3" aria-hidden />}
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
