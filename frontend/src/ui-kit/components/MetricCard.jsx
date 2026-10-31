import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import GapChart from '../charts/GapChart';
import { cn } from '../utils/cn';

const Caption = ({ children, className }) => <p className={cn('t-eyebrow text-fg-3', className)}>{children}</p>;
const Term = ({ children }) => <dt className="t-eyebrow text-fg-3">{children}</dt>;

/**
 * A headline metric with its comparison and a 30-day gap chart.
 *   label     "Orders MTD (€)"               value   "518M" (put the unit in the label so the number stays clean)
 *   compare   { label: 'MTD LY', value: '483M' }
 *   gap       { label: 'Gap', value: '35.4M', pct: 7.3 }   (sign of `pct` picks the colour and arrow)
 *   series    number[] daily gap values       seriesLabel  "Last 30 days"       today  "2.9M" (latest point callout)
 */
export default function MetricCard({ label, value, compare, gap, series, seriesLabel = 'Last 30 days', today, className }) {
  const positive = (gap?.pct ?? 0) >= 0;
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  const tone = positive ? 'text-accent-text' : 'text-danger';
  return (
    <section className={cn('card p-6', className)} aria-label={label}>
      <div className="grid grid-cols-[1fr_auto] items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-[1.0625rem] font-medium text-fg-2">{label}</p>
          <p className="mt-3 text-[3.25rem] font-semibold leading-none tracking-tight text-fg tabular-nums">{value}</p>
        </div>
        <dl className="space-y-3 text-right sm:text-left">
          {compare && <div><Term>{compare.label}</Term><dd className="mt-1 text-[1.125rem] font-medium text-fg-2 tabular-nums">{compare.value}</dd></div>}
          {gap && (
            <div>
              <Term>{gap.label || 'Gap'}</Term>
              <dd className={cn('mt-1 inline-flex items-center gap-1 text-[1.125rem] font-medium tabular-nums', tone)}>
                <Arrow className="h-4 w-4" aria-hidden />{gap.value}{gap.pct !== undefined && <span> ({Math.abs(gap.pct)}%)</span>}
              </dd>
            </div>
          )}
        </dl>
      </div>
      {series && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Caption>{seriesLabel}</Caption>
            <div className="flex items-center gap-4 text-fg-3">
              <span className="t-eyebrow inline-flex items-center gap-1.5"><span className="h-px w-5 bg-accent" aria-hidden />Daily gap</span>
              <span className="t-eyebrow inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-fg" aria-hidden />5D avg</span>
            </div>
          </div>
          <div className="relative">
            <GapChart data={series} baselineLabel={compare?.label} />
            {today && <p className={cn('absolute right-0 top-0 text-right', tone)}><span className="t-eyebrow block text-fg-3">Today</span><span className="text-[1.0625rem] font-medium tabular-nums">{today}</span></p>}
          </div>
        </div>
      )}
    </section>
  );
}
