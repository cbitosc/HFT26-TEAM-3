import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  error: <AlertCircle className="h-4 w-4 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 text-accent-text" aria-hidden />,
};

let seq = 0;                                   // crypto.randomUUID is unavailable on plain-http origins (e.g. a LAN demo), so use a counter

/**
 * Wrap the app once, then call `const toast = useToast(); toast({ title, description, type, duration })`.
 * type: success | error | info. Errors are announced assertively; `duration: 0` keeps a toast until dismissed.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const toast = useCallback(
    ({ title, description, type = 'success', duration = 4000 }) => {
      const id = `toast-${++seq}`;
      setToasts((t) => [...t.slice(-4), { id, title, description, type }]);       // keep at most 5 on screen
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss],
  );
  useEffect(() => { const map = timers.current; return () => map.forEach(clearTimeout); }, []);
  const value = toast;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-toast flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6 lg:bottom-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              role={t.type === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-pop"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              <span className="mt-0.5">{icons[t.type] || icons.info}</span>
              <div className="min-w-0 flex-1">
                <p className="t-small font-medium">{t.title}</p>
                {t.description && <p className="t-caption mt-0.5 text-fg-2">{t.description}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="-m-1 rounded-sm p-1.5 text-fg-3 transition hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
