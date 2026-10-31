import { useEffect, useRef } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

/** Splits a display string like "$1,284.5k" into prefix / number / suffix so it can count up. */
const PARSE = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/;

/** Counts up once when scrolled into view. Strings that contain no number render as-is. */
export default function AnimatedValue({ value, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);

  const match = String(value).match(PARSE);
  const [, prefix = '', num = '0', suffix = ''] = match || [];
  const target = parseFloat(num.replace(/,/g, ''));
  const decimals = (num.split('.')[1] || '').length;
  const grouped = num.includes(',');

  const text = useTransform(mv, (v) => {
    const n = v.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    return `${prefix}${n}${suffix}`;
  });

  useEffect(() => {
    if (!match) return undefined;
    if (!inView || reduce) {
      if (reduce) mv.set(target);
      return undefined;
    }
    const controls = animate(mv, target, { duration: 0.9, ease: [0.2, 0, 0, 1] });
    return () => controls.stop();
  }, [inView, reduce, target, mv, match]);

  if (!match) return <span className={className}>{value}</span>;
  return <motion.span ref={ref} className={className}>{text}</motion.span>;
}
