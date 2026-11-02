import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { cn } from '../utils/cn';

/**
 * Card with a soft cursor-following highlight (the "spotlight card" pattern).
 * `plain` drops the border/background so it can sit inside an existing grid.
 */
export default function SpotlightCard({ children, className, plain = false, ...props }) {
  const x = useMotionValue(-300);
  const y = useMotionValue(-300);
  const background = useMotionTemplate`radial-gradient(280px circle at ${x}px ${y}px, rgb(var(--accent) / 0.13), transparent 70%)`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };
  const onLeave = () => {
    x.set(-300);
    y.set(-300);
  };

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn('group relative overflow-hidden', !plain && 'card', className)}
      {...props}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background }} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}
