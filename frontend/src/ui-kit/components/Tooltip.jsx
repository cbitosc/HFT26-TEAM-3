import { cn } from '../utils/cn';

/** CSS-only tooltip: shows on hover and keyboard focus. Keep labels short. */
export default function Tooltip({ label, children, side = 'bottom', className }) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-tooltip -translate-x-1/2 whitespace-nowrap rounded-sm',
          'border border-line bg-surface-2 px-2 py-1 text-[0.6875rem] font-medium text-fg shadow-md',
          'opacity-0 transition-opacity delay-0 duration-fast',
          'group-hover/tip:opacity-100 group-hover/tip:delay-500 group-focus-within/tip:opacity-100',
          side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        )}
      >
        {label}
      </span>
    </span>
  );
}
