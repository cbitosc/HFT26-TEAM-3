import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from '../utils/cn';

/** Toggle button with a small particle burst when switched on. Defaults to a star "Save". */
export default function BurstToggle({ pressed, onToggle, icon: Icon = Star, label, activeLabel, className }) {
  const [burst, setBurst] = useState(0);
  const text = pressed ? activeLabel || label : label;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => {
        if (!pressed) setBurst((b) => b + 1);
        onToggle();
      }}
      className={cn(
        'relative inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[0.8125rem] font-medium transition active:scale-[0.98]',
        pressed ? 'border-warning/40 bg-warning/10 text-warning' : 'border-line bg-surface-2 text-fg hover:border-fg-3/50',
        className,
      )}
    >
      <span className="relative grid place-items-center">
        <motion.span key={pressed ? 'on' : 'off'} initial={{ scale: pressed ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
          <Icon className={cn('h-4 w-4', pressed && 'fill-current')} aria-hidden />
        </motion.span>
        <AnimatePresence>
          {burst > 0 && pressed && (
            <motion.span key={burst} aria-hidden className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
              {Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2;
                return (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-warning"
                    initial={{ x: '-50%', y: '-50%', scale: 1 }}
                    animate={{ x: `calc(-50% + ${Math.cos(a) * 14}px)`, y: `calc(-50% + ${Math.sin(a) * 14}px)`, scale: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                );
              })}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {text}
    </button>
  );
}
