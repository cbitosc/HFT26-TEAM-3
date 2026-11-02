import { useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useOverlay } from '../hooks/useOverlay';
import { cn } from '../utils/cn';
import IconButton from './IconButton';
import { Scrim } from './Modal';

function DrawerPanel({ onClose, title, description, side, width, children }) {
  const ref = useOverlay(true, onClose);
  const titleId = useId();
  const descId = useId();
  const x = side === 'right' ? 40 : -40;
  return (
    <div className="fixed inset-0 z-modal">
      <Scrim onClick={onClose} />
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full flex-col border-line bg-surface shadow-pop outline-none',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          width,
        )}
        initial={{ opacity: 0, x }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x }}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id={titleId} className="t-h2">{title}</h2>
            {description && <p id={descId} className="t-small mt-1 text-fg-2">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} tooltip={false} />
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-6">{children}</div>
      </motion.aside>
    </div>
  );
}

/** side: left | right. `width` is a max-w class (default sm:max-w-lg); full width on phones. */
export default function Drawer({ open, onClose, title, description, side = 'right', width = 'sm:max-w-lg', children }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <DrawerPanel onClose={onClose} title={title} description={description} side={side} width={width}>
          {children}
        </DrawerPanel>
      )}
    </AnimatePresence>,
    document.body,
  );
}
