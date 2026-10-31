import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from '../utils/link';
import { cn } from '../utils/cn';

/**
 * Menu popover. `trigger` is a render function receiving trigger props.
 * items: [{ label, icon, onClick, to, danger, active }, { heading }, { separator: true }]  (add `id` if two labels repeat)
 * `children` can replace the item list with custom content (used for notifications).
 */
export default function Dropdown({ trigger, items = [], align = 'right', width = 'w-56', label = 'Menu', children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !rootRef.current?.contains(e.target) && close();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        rootRef.current?.querySelector('[aria-haspopup]')?.focus();
      } else if (e.key === 'Tab' && !children) close();                 // a menu is one tab stop: tabbing away dismisses it
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    (menuRef.current?.querySelector('[role="menuitem"]') || menuRef.current?.querySelector('input,button,a[href],[tabindex]'))?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, children]);

  const onMenuKey = (e) => {
    const nodes = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const i = nodes.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') nodes[(i + 1) % nodes.length]?.focus();
    else if (e.key === 'ArrowUp') nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
    else if (e.key === 'Home') nodes[0]?.focus();
    else if (e.key === 'End') nodes.at(-1)?.focus();
    else return;
    e.preventDefault();
  };

  return (
    <div ref={rootRef} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id, open })}
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            ref={menuRef}
            role={children ? 'dialog' : 'menu'}
            aria-label={label}
            onKeyDown={children ? undefined : onMenuKey}
            className={cn(
              'absolute top-full z-overlay mt-2 origin-top overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              width,
            )}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
          >
            {children ? children({ close }) : items.map((item, i) => {
              if (item.separator) return <div key={i} role="separator" className="my-1 h-px bg-line" />;
              if (item.heading) return <div key={i} className="t-caption px-2.5 py-1.5 text-fg-3">{item.heading}</div>;
              const Tag = item.to ? Link : 'button';
              return (
                <Tag
                  key={item.id ?? `${item.label}-${i}`}
                  role="menuitem"
                  aria-current={item.active ? 'true' : undefined}
                  to={item.to}
                  type={item.to ? undefined : 'button'}
                  onClick={() => {
                    item.onClick?.();
                    close();
                  }}
                  className={cn(
                    'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left [@media(pointer:coarse)]:min-h-11 text-[0.8125rem] transition-colors focus:bg-surface-2 focus:outline-none hover:bg-surface-2',
                    item.danger ? 'text-danger' : 'text-fg-2 hover:text-fg focus:text-fg',
                  )}
                >
                  {item.icon && <item.icon className="h-4 w-4" aria-hidden />}
                  {item.label}
                  {item.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
                </Tag>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
