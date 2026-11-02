import { Link } from '../utils/link';
import { cn } from '../utils/cn';

/** Default logo mark: three rising bars. Pass your own element to <Brand mark={...}> to replace it. */
export function BrandMark({ className }) {
  return (
    <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-fg', className)}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <rect x="4" y="13" width="4" height="7" rx="1" opacity="0.6" />
        <rect x="10" y="9" width="4" height="11" rx="1" opacity="0.85" />
        <rect x="16" y="4" width="4" height="16" rx="1" />
      </svg>
    </span>
  );
}

/** Logo + product name as a link home. */
export default function Brand({ name = 'App', to = '/', mark, className }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5 rounded-md hover:no-underline', className)} aria-label={`${name} home`}>
      {mark ?? <BrandMark />}
      <span className="text-[0.9375rem] font-semibold tracking-tight text-fg">{name}</span>
    </Link>
  );
}
