import { Button, Badge } from '../ui-kit';
import { Film, FileText, Table2 } from 'lucide-react';
import { CLASS_HELP, CLASS_LABEL } from '../lib/overview';
import { formatTime, formatUncertainty } from '../lib/time';

const VARIANT = { observed: 'info', reported: 'neutral', inferred: 'accent', unknown: 'warning' };

/** observed | reported | inferred | unknown, with the meaning on hover. */
export function ClassBadge({ value }) {
  return <span title={CLASS_HELP[value]}><Badge variant={VARIANT[value] || 'neutral'}>{CLASS_LABEL[value] || value}</Badge></span>;
}

export const intervalText = (iv) => (iv ? (iv.end - iv.start > 600 ? `${formatTime(iv.start)} – ${formatTime(iv.end)} (case clock)` : `${formatTime(iv.at)} (case clock)`) : 'no time on the shared clock');

/** Compact row used in lists: classification, title, one sentence, time. */
export function FindingRow({ f, selected, onSelect }) {
  const tone = f.kind === 'contradiction' ? 'border-l-danger' : f.classification === 'unknown' ? 'border-l-warning' : 'border-l-accent';
  return (
    <button type="button" aria-pressed={selected} onClick={() => onSelect(f)}
            className={`w-full rounded-lg border border-line border-l-2 ${tone} px-3 py-2.5 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10`}>
      <span className="flex items-center gap-2"><ClassBadge value={f.classification} /><span className="mono t-caption ml-auto text-fg-3">{f.interval ? formatTime(f.interval.at) : '—'}</span></span>
      <span className="t-small mt-1.5 block font-medium text-fg">{f.title}</span>
      <span className="t-caption mt-0.5 line-clamp-2 block text-fg-2">{f.summary}</span>
    </button>
  );
}

const ICON = { frame: Film, statement: FileText, sensor: Table2 };
const TRAIL = (r) => (r.source === 'Witness' ? 'statement' : r.source === 'Sensor' ? 'sensor' : r.source === 'CCTV' || r.source === 'Dashcam' ? 'frame' : null);

/** One supporting / contradicting evidence line with a jump to the event and its source. */
export function EvidenceLine({ r, events, onPick, onOpenTrail }) {
  const e = events[r.eventId];
  const kind = TRAIL(r);
  const Icon = kind && ICON[kind];
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line px-2.5 py-2">
      <span className="min-w-0 flex-1">
        <span className="t-caption flex flex-wrap items-center gap-1.5 text-fg-3"><b className="font-medium text-fg-2">{r.source}</b><ClassBadge value={r.classification} /><span className="mono">{r.time != null ? formatTime(r.time) : 'no time'}</span></span>
        <button type="button" className="t-small mt-1 block text-left text-fg-2 hover:text-fg" onClick={() => e && onPick(e)}>{r.label}</button>
      </span>
      {Icon && e && <Button size="sm" variant="ghost" icon={Icon} onClick={() => onOpenTrail(kind, e)} aria-label={`Open source: ${r.label}`}>Source</Button>}
    </li>
  );
}

/** The eight-part finding structure, then technical detail on request. */
export function FindingDetail({ f, events, onPick, onOpenTrail, onReview, onBack }) {
  const rv = f.review;
  return (
    <article aria-label="Finding" className="space-y-4">
      {onBack && <Button size="sm" variant="ghost" onClick={onBack}>← All findings</Button>}
      <header>
        <div className="flex flex-wrap items-center gap-2"><ClassBadge value={f.classification} />{f.kind === 'contradiction' && <Badge variant="danger">Sources disagree</Badge>}{rv && <Badge variant={rv.review_status === 'reviewed' ? 'success' : rv.review_status === 'disputed' ? 'warning' : 'neutral'}>{rv.review_status}</Badge>}</div>
        <h3 className="t-h2 mt-2">{f.title}</h3>
        <p className="t-body mt-1 text-fg-2">{f.summary}</p>
        <p className="mono t-caption mt-2 text-fg-3">{intervalText(f.interval)}</p>
      </header>
      {f.supporting.length > 0 && <section><h4 className="t-eyebrow mb-1.5 text-fg-3">Supporting evidence</h4><ul className="space-y-1.5">{f.supporting.map((r) => <EvidenceLine key={r.eventId + r.role} r={r} events={events} onPick={onPick} onOpenTrail={onOpenTrail} />)}</ul></section>}
      {f.contradicting.length > 0 && <section><h4 className="t-eyebrow mb-1.5 text-fg-3">Contradicting evidence</h4><ul className="space-y-1.5">{f.contradicting.map((r) => <EvidenceLine key={r.eventId + r.role} r={r} events={events} onPick={onPick} onOpenTrail={onOpenTrail} />)}</ul></section>}
      {f.supporting.length === 0 && f.contradicting.length === 0 && <section><h4 className="t-eyebrow mb-1.5 text-fg-3">Evidence</h4><p className="t-small text-fg-3">{f.classification === 'unknown' ? 'There is no evidence for this: that is the finding.' : 'No linked events.'}</p></section>}
      {f.uncertainty && <section className="rounded-lg border border-warning/30 bg-warning/5 p-3"><h4 className="t-eyebrow mb-1 text-warning">Uncertainty and limits</h4><p className="t-small text-fg-2">{f.uncertainty}</p></section>}
      {f.action && (
        <section><h4 className="t-eyebrow mb-1.5 text-fg-3">For the investigator</h4><p className="t-small text-fg">{f.action}</p>
          {rv && onReview && <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => onReview(rv.id, 'reviewed')}>Mark reviewed</Button><Button size="sm" variant="outline" onClick={() => onReview(rv.id, 'disputed')}>Dispute</Button></div>}
        </section>
      )}
      <details className="rounded-lg border border-line px-3 py-2">
        <summary className="t-small cursor-pointer text-fg-2">Technical details</summary>
        <dl className="t-caption mt-2 space-y-1.5 text-fg-3">
          <div><dt className="inline font-medium text-fg-2">Rule: </dt><dd className="mono inline">{f.ruleId || 'n/a'}</dd></div>
          {f.technical?.strength && <div><dt className="inline font-medium text-fg-2">Strength: </dt><dd className="inline">{f.technical.strength}</dd></div>}
          {f.technical?.independence && <div><dt className="inline font-medium text-fg-2">Independence: </dt><dd className="inline">{f.technical.independence}</dd></div>}
          <div><dt className="font-medium text-fg-2">Rule output (unedited)</dt><dd className="mt-0.5 whitespace-pre-wrap">{f.technical?.text}</dd></div>
          <div><dt className="inline font-medium text-fg-2">Records: </dt><dd className="mono inline break-all">{(f.technical?.refs || []).join(', ') || 'none'}</dd></div>
        </dl>
      </details>
    </article>
  );
}
