import { useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useOverlay } from '../hooks/useOverlay';
import { cn } from '../utils/cn';
import IconButton from './IconButton';

const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export function Scrim({ onClick }) {
  return (
    <motion.div
      className="absolute inset-0 bg-[rgb(var(--scrim))] backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      aria-hidden
    />
  );
}

function ModalPanel({ onClose, title, description, size, width, footer, children }) {
  const ref = useOverlay(true, onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center p-0 sm:items-center sm:p-6">
      <Scrim onClick={onClose} />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn('relative w-full rounded-t-xl border border-line bg-surface shadow-pop outline-none sm:rounded-xl', width || widths[size] || widths.md)}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h2 id={titleId} className="t-h2">{title}</h2>
            {description && <p id={descId} className="t-small mt-1 text-fg-2">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} tooltip={false} className="-mr-2 -mt-1" />
        </div>
        <div className="max-h-[70vh] overflow-auto p-6 scrollbar-thin">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </motion.div>
    </div>
  );
}

/** size: sm | md | lg | xl (or `width`, a max-w class). Esc / scrim click / close button call onClose. Focus is trapped and restored. */
export default function Modal({ open, onClose, title, description, size = 'md', width, footer, children }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalPanel onClose={onClose} title={title} description={description} size={size} width={width} footer={footer}>
          {children}
        </ModalPanel>
      )}
    </AnimatePresence>,
    document.body,
  );
}
