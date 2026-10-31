import { FileText } from 'lucide-react';
import { cn } from '../utils/cn';

/** Document tile with a tiny extension tag (PDF, CSV…). Pass any lucide icon via `icon`. */
export default function FileGlyph({ icon: Icon = FileText, ext = 'pdf', className }) {
  return (
    <div className={cn('relative grid shrink-0 place-items-center rounded-md border border-line bg-surface-2', className)}>
      <Icon className="h-[45%] w-[45%] text-fg-2" strokeWidth={1.6} aria-hidden />
      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-[4px] border border-line bg-surface px-1 font-mono text-[9px] font-semibold uppercase leading-[14px] tracking-wide text-fg-3">
        {ext.slice(0, 4)}
      </span>
    </div>
  );
}
