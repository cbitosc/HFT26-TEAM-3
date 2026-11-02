import { Children, cloneElement, forwardRef, isValidElement, useId } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Label + control + hint/error wrapper.
 *   <Field label="Email" error={err}><Input /></Field>      a single element child is wired up automatically (id, aria-describedby, aria-invalid)
 *   <Field label="Tags">{(p) => <TagInput {...p} />}</Field> render-prop children receive { id, 'aria-describedby', 'aria-invalid' }
 * Several children, or a child that is not a form control, need the render-prop form so the label points at the right element.
 */
export function Field({ label, hint, error, optional, className, children }) {
  const generated = useId();
  const only = typeof children !== 'function' && Children.count(children) === 1 && isValidElement(children) ? children : null;
  const id = only?.props.id || generated;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const aria = { id, 'aria-describedby': describedBy, 'aria-invalid': !!error || undefined };
  const injected = Object.fromEntries(Object.entries(aria).filter(([, v]) => v !== undefined));       // never overwrite a child's own value with undefined
  const control = typeof children === 'function' ? children(aria) : only ? cloneElement(only, injected) : children;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label htmlFor={id} className="t-label flex items-center justify-between text-fg-2">
          {label}
          {optional && <span className="font-normal text-fg-3">Optional</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={`${id}-err`} className="t-caption text-danger">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="t-caption text-fg-3">{hint}</p>
      )}
    </div>
  );
}

/** `invalid` sets aria-invalid (red border + ring). `icon` adds a leading lucide icon. Takes every native input prop. */
export const Input = forwardRef(function Input({ className, icon: Icon, invalid, ...props }, ref) {
  const aria = invalid ? { 'aria-invalid': true } : null;
  if (!Icon) return <input ref={ref} className={cn('control h-10', className)} {...aria} {...props} />;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
      <input ref={ref} className={cn('control h-10 pl-9', className)} {...aria} {...props} />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, invalid, ...props }, ref) {
  return <textarea ref={ref} className={cn('control min-h-[120px] resize-y py-2.5 leading-relaxed', className)} {...(invalid ? { 'aria-invalid': true } : null)} {...props} />;
});

/** `options`: strings or { value, label }, or pass <option> children. `invalid` sets aria-invalid. */
export const Select = forwardRef(function Select({ className, options = [], invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn('control h-10 cursor-pointer appearance-none pr-9', className)} {...(invalid ? { 'aria-invalid': true } : null)} {...props}>
        {children ||
          options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;      // options: strings or { value, label }
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
    </div>
  );
});

export const SearchInput = forwardRef(function SearchInput({ value, onChange, onClear, className, placeholder = 'Search…', ...props }, ref) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={props['aria-label'] || placeholder}
        className="control h-10 rounded-full pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-fg-3 transition hover:text-fg"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});

/** Controlled checkbox: onChange receives the change event (use e.target.checked). */
export function Checkbox({ label, description, checked, onChange, disabled, className, ...props }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-50', className)}>
      <span className="relative mt-0.5 flex h-4 w-4 shrink-0">
        <input id={id} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} {...props} className="peer absolute inset-0 h-full w-full cursor-[inherit] opacity-0" />
        <span className="flex h-4 w-4 items-center justify-center rounded-[5px] border border-fg-3/60 bg-surface transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
          <Check className="h-3 w-3 text-accent-fg transition-opacity" strokeWidth={3} aria-hidden />
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="t-small font-medium text-fg">{label}</span>
        {description && <span className="t-caption text-fg-3">{description}</span>}
      </span>
    </label>
  );
}

/** Switch. Controlled: onChange receives the next boolean (not an event). */
export function Toggle({ label, description, checked, onChange, disabled, className }) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-6', className)}>
      <label htmlFor={id} className={cn('flex flex-col gap-0.5', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
        <span className="t-small font-medium text-fg">{label}</span>
        {description && <span className="t-caption text-fg-3">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-accent bg-accent' : 'border-line bg-surface-2',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-fast',
            checked ? 'translate-x-4 bg-accent-fg' : 'translate-x-0 bg-fg-3',
          )}
        />
      </button>
    </div>
  );
}
