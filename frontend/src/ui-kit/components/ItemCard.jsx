import { Link } from '../utils/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '../utils/cn';
import SpotlightCard from '../effects/SpotlightCard';
import FileGlyph from './FileGlyph';

/**
 * A rich, generic "thing" card: glyph, badge, title, dotted meta line, stats and an Open arrow.
 * meta: string[] · stats: [{ icon, label }] · highlight adds an accent ring.
 */
export default function ItemCard({ to, glyph, ext, badge, title, meta = [], stats = [], footer, action = 'Open', highlight, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 8) * 0.04, ease: [0.2, 0, 0, 1] }}
      className="h-full"
    >
      <Link to={to} className="group block h-full rounded-[var(--radius-card)]">
        <SpotlightCard
          className={cn(
            'flex h-full flex-col p-4 transition-[transform,border-color,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-fg-3/50 group-hover:shadow-md',
            highlight && 'border-accent/40 ring-1 ring-accent/10',
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <FileGlyph icon={glyph} ext={ext} className="h-10 w-10" />
            {badge}
          </div>
          <h3 className="t-h3 line-clamp-2 leading-snug">{title}</h3>
          <p className="t-caption mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-fg-3">
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                <span className={cn('truncate', i === 0 && 'font-medium text-fg-2')}>{m}</span>
              </span>
            ))}
          </p>
          <div className="mt-auto pt-4">
            {stats.length > 0 && (
              <div className="t-caption flex items-center gap-3 text-fg-3">
                {stats.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-1 tabular-nums">
                    {s.icon && <s.icon className="h-3.5 w-3.5" aria-hidden />}
                    {s.label}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="t-caption truncate text-fg-3">{footer}</span>
              <span className="t-caption inline-flex items-center gap-0.5 font-medium text-fg">
                {action}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </div>
          </div>
        </SpotlightCard>
      </Link>
    </motion.div>
  );
}
