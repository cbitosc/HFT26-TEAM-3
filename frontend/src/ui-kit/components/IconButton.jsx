import { forwardRef } from 'react';
import { cn } from '../utils/cn';
import Tooltip from './Tooltip';

const variants = {
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  outline: 'border border-line text-fg-2 hover:border-fg-3/50 hover:bg-surface-2 hover:text-fg',
};
const sizes = {
  sm: 'h-9 w-9 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
  md: 'h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
};

/** Icon-only button. `label` is required: it powers aria-label and the tooltip. variant: ghost | outline, size: sm | md. */
const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', tooltip = true, className, children, ...props },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant] || variants.ghost,
        sizes[size] || sizes.md,
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
  return tooltip ? <Tooltip label={label}>{button}</Tooltip> : button;
});

export default IconButton;
