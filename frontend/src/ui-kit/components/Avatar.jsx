import { cn } from '../utils/cn';

const sizes = { sm: 'h-6 w-6 text-[0.625rem]', md: 'h-8 w-8 text-[0.6875rem]', lg: 'h-10 w-10 text-[0.8125rem]' };

export default function Avatar({ name = '', src, size = 'md', className }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 font-medium text-fg-2', sizes[size], className)} aria-hidden={!name}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials}
    </span>
  );
}
