import { cn } from '../utils/cn';

/** Infinite horizontal ticker with faded edges. Pauses on hover; static with reduced motion. */
export default function Marquee({ children, className }) {
  return (
    <div
      className={cn('group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]', className)}
    >
      <div className="flex w-max animate-marquee gap-16 pr-16 group-hover:[animation-play-state:paused]">
        <div className="flex shrink-0 items-center gap-16">{children}</div>
        <div className="flex shrink-0 items-center gap-16" aria-hidden>{children}</div>
      </div>
    </div>
  );
}
