import { useEffect, useState } from 'react';
import { Alert, Badge, Button, LoadingState } from '../ui-kit';
import { Film, FileText, Table2 } from 'lucide-react';
import { api } from '../api';
import { formatTime, formatUncertainty } from '../lib/time';

const STATUS = {
  requires_review: ['Requires review', 'warning'], potential_contradiction: ['Potential contradiction', 'danger'], conflicting_accounts: ['Conflicting accounts', 'danger'],
  independently_supported: ['Independently supported', 'success'], insufficient_evidence_for_some_comparisons: ['Some comparisons not possible', 'neutral'],
};

function Layer({ title, items, render, onRef }) {
  if (!items?.length) return null;
  return (
    <section className="mt-4">
      <h4 className="t-eyebrow text-fg-3">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="t-small text-fg-2">
            {onRef && it?.refs?.length ? <button type="button" className="text-left hover:text-fg" onClick={() => onRef(it.refs[0])}>{render(it)}</button> : render(it)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Stored summary of the active event (five separate layers) plus the source trail: event → frame, claim → statement span, sensor event → rows.
 *  Nothing here calls a model; text is the backend's template summary. */
export default function SummaryPanel({ eventId, onSelectEvent, onOpenTrail }) {
  const [s, setS] = useState(null);
  const [ev, setEv] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!eventId) return undefined;
    let live = true;
    setErr(null);
    setS(null);
    Promise.all([api.summary(eventId), api.event(eventId)]).then(([a, b]) => { if (live) { setS(a); setEv(b); } }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [eventId]);

  if (!eventId) return <p className="t-small text-fg-3">Select an event on the timeline or the scrubber. While the video plays, the summary follows the playhead.</p>;
  if (err) return <Alert variant="danger" title="Could not load this summary">{err}</Alert>;
  if (!s || s.event_id !== eventId) return <LoadingState rows={4} label="Loading summary" />;

  const obs = ev?.observations || {};
  const trail = [];
  if (ev?.source_type?.startsWith('video') && obs.source_time_ms) trail.push({ kind: 'frame', icon: Film, label: 'Open exact video frame' });
  if (ev?.source_type === 'witness' && obs.statement_id) trail.push({ kind: 'statement', icon: FileText, label: 'Open original statement' });
  if (ev?.source_type === 'sensor' && obs.source_time_ms) trail.push({ kind: 'sensor', icon: Table2, label: 'Open original sensor rows' });

  return (
    <article aria-live="polite" aria-label="Incident summary">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="info">{s.category.replace(/_/g, ' ')}</Badge>
        {s.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>}
        {s.status.map((k) => <Badge key={k} variant={STATUS[k]?.[1] || 'neutral'}>{STATUS[k]?.[0] || k}</Badge>)}
      </div>
      <h3 className="t-h2 mt-2">{s.title}</h3>
      <p className="mono t-caption text-fg-3">
        {s.time.case_ms != null ? `case ${formatTime(s.time.case_ms)} ${formatUncertainty(s.time.uncertainty_ms)}` : 'no time on the case clock'}
        {obs.source_time_ms && ` · source ${ev.source_type === 'sensor' ? 'sensor' : 'media'} ${formatTime(obs.source_time_ms[0])}`}
      </p>
      {trail.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Source evidence">
          {trail.map((t) => <Button key={t.kind} size="sm" variant="outline" icon={t.icon} onClick={() => onOpenTrail(t.kind, ev)}>{t.label}</Button>)}
        </div>
      )}
      <Layer title="Observations" items={s.observations} render={(x) => <>{x.text}{x.time_ms != null && <span className="mono text-fg-3"> · {formatTime(x.time_ms)}</span>}</>} onRef={onSelectEvent} />
      <Layer title="Machine detections" items={s.detections} render={(x) => <>{x.text}{x.model && <span className="text-fg-3"> · {x.model}</span>}</>} onRef={onSelectEvent} />
      <Layer title="Witness claims" items={s.witness_claims} render={(x) => <>{x.witness}: “{x.quote}”</>} onRef={onSelectEvent} />
      <Layer title="Sensor readings" items={s.sensor_observations} render={(x) => x.text} onRef={onSelectEvent} />
      <Layer title="Inferences (possibilities, not facts)" items={s.inferences} render={(x) => <>{x.text}{x.alternatives && <span className="block text-fg-3">Alternatives: {x.alternatives.join('; ')}</span>}</>} onRef={onSelectEvent} />
      <Layer title="Contradictions" items={s.contradictions} render={(x) => <><b className="text-danger">{x.rule_id}</b> ({x.strength}) {x.explanation}</>} />
      <Layer title="Corroborations" items={s.corroborations} render={(x) => <><b className="text-success">{x.rule_id}</b> {x.explanation}</>} />
      <Layer title="Uncertainty" items={s.uncertainty} render={(x) => x} />
      <Layer title="Open questions" items={s.open_questions} render={(x) => x} />
      <p className="t-caption mt-4 text-fg-3">{s.generated_by}</p>
    </article>
  );
}
