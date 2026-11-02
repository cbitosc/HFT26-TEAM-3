import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

const variants = {
  primary: 'bg-accent text-accent-fg shadow-sm hover:bg-accent/90 active:bg-accent/80',
  secondary: 'border border-line bg-surface text-fg shadow-sm hover:bg-surface-2',
  outline: 'border border-fg/25 text-fg hover:border-fg/50 hover:bg-surface-2',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:bg-danger/90 active:bg-danger/80',
};
// On touch screens every size grows to a 44px hit area (WCAG 2.5.5); desktop keeps the compact heights.
const sizes = {
  sm: 'h-9 gap-1.5 px-3.5 text-[0.8125rem] [@media(pointer:coarse)]:h-10',
  md: 'h-10 gap-2 px-5 text-[0.875rem] [@media(pointer:coarse)]:h-11',
  lg: 'h-12 gap-2 px-6 text-[0.9375rem]',
};

export const buttonStyles = ({ variant = 'secondary', size = 'md', block, className } = {}) =>
  cn(
    variant === 'ghost' ? 'btn btn-ghost' : 'btn',
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium',
    'transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant] || variants.secondary,
    sizes[size] || sizes.md,
    block && 'w-full',
    className,
  );

/**
 * variant: primary | secondary | outline | ghost | danger     size: sm | md | lg
 * loading   disables the button, shows a spinner and sets aria-busy      block   full width
 * `as` lets a Button render as a router <Link> or <a> while keeping the same styles; a disabled link is made inert (aria-disabled, no navigation).
 */
const Button = forwardRef(function Button(
  { as: Tag = 'button', variant, size, block, loading, leftIcon, icon, rightIcon: Right, className, children, disabled, onClick, ...props },
  ref,
) {
  const Left = leftIcon || icon;
  const isButton = Tag === 'button';
  const inert = disabled || loading;
  return (
    <Tag
      ref={ref}
      className={buttonStyles({ variant, size, block, className })}
      onClick={inert && !isButton ? (e) => e.preventDefault() : onClick}
      {...(isButton ? { type: props.type || 'button', disabled: inert } : { 'aria-disabled': inert || undefined, tabIndex: inert ? -1 : props.tabIndex })}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : Left && <Left className="h-4 w-4" aria-hidden />}
      {children}
      {!loading && Right && <Right className="h-4 w-4" aria-hidden />}
    </Tag>
  );
});

export default Button;
