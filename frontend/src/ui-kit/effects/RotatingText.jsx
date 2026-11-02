import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '../utils/cn';

/**
 * Cycles through strings; each one slides up into place (CSS keyframe `rotate-in`).
 * Stays on the first string with reduced motion.
 */
export default function RotatingText({ items, interval = 2800, className }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || items.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [items.length, interval, reduce]);

  return (
    <span className={cn('inline-block overflow-hidden align-bottom', className)}>
      <span key={i} className="inline-block animate-rotate-in whitespace-nowrap">{items[i]}</span>
    </span>
  );
}
