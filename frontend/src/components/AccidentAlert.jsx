import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Eye, FileSearch, Play, X } from 'lucide-react';
import { Badge, Button } from '../ui-kit';
import { useDecisions } from '../decisions';
import { DECISIONS, alertText, supportingObservations } from '../lib/alerts';
import { formatTime, formatUncertainty } from '../lib/time';
import { nearbyEvidence } from '../lib/moment';

const REF_LABEL = { before: 'Before', event: 'Event', after: 'After' };

/** Keyframes of one event from the storyboard. The event frame is the nearest stored sample inside the event; its offset is labelled when not exact. */
export function keyframesOf(card, eventMediaMs) {
  if (!card) return [];
  const mid = card.during?.length ? card.during.reduce((b, f) => (b == null || Math.abs(f.time_ms - eventMediaMs) < Math.abs(b.time_ms - eventMediaMs) ? f : b), null) : null;
  return [card.before && { kind: 'before', ref: card.before }, mid && { kind: 'event', ref: mid }, card.after && { kind: 'after', ref: card.after }].filter(Boolean);
}

export function KeyframeStrip({ frames, eventMediaMs, onSeekFrame }) {
  if (!frames.length) return <p className="t-caption text-fg-3">No stored keyframe for this event. Nothing is generated in its place.</p>;
  return (
    <ul className="flex gap-2 overflow-x-auto" aria-label="Keyframes before, at and after the event">
      {frames.map(({ kind, ref }) => {
        const off = eventMediaMs != null ? Math.round(ref.time_ms - eventMediaMs) : null;
        return (
          <li key={ref.frame_id} className="shrink-0">
            <button type="button" onClick={() => onSeekFrame(ref)} aria-label={`${REF_LABEL[kind]} frame at ${formatTime(ref.time_ms)}: seek the video here`} className="block rounded border border-line p-0.5 transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              {ref.thumbnail_url || ref.full_url ? <img src={ref.thumbnail_url || ref.full_url} alt="" className="h-16 w-auto rounded-sm" loading="lazy" /> : <span className="t-caption block h-16 w-24 p-1 text-fg-3">No thumbnail stored</span>}
            </button>
            <span className="t-caption block text-fg-2">{REF_LABEL[kind]}</span>
            <span className="mono t-caption block text-fg-3">{formatTime(ref.time_ms)}{kind === 'event' && off ? ` (${off > 0 ? '+' : ''}${off} ms from the event)` : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Shown above the video, never over it. Raised by the playback trigger; dismissing it records no review decision. */
export default function AccidentAlert({ alert, event, events, cameraName, card, caseId, onOpenFrame, onDetails, onEvidence, onResume, onDismiss, onSeekFrame }) {
  const reduce = useReducedMotion();
  const decision = useDecisions((s) => (event ? s.all[caseId]?.[event.id] : null));
  const decide = useDecisions((s) => s.decide);
  const mediaMs = event?.observations?.source_time_ms?.[0];
  const near = event ? nearbyEvidence(events, { ms: event.start_ms, eventId: event.id }).around.slice(0, 3) : [];
  const anim = reduce ? {} : { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.18 } };
  return (
    <AnimatePresence>
      {alert && event && (
        <motion.section key={alert.eventId} role="alert" aria-label="Possible accident alert" className="mb-3 rounded-xl border-2 border-danger/80 bg-danger/10 p-3" {...anim}>
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
            <h2 className="text-base font-semibold text-fg">Possible accident detected</h2>
            <Badge variant="warning">not a confirmed collision</Badge>
            <Badge variant="neutral">{alert.paused ? 'playback paused' : 'auto-pause is off: playback continues'}</Badge>
            <button type="button" onClick={onDismiss} aria-label="Dismiss alert" className="ml-auto rounded p-1 text-fg-3 hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" aria-hidden /></button>
          </div>
          <p className="t-small mt-1 text-fg-2">{alertText(event)}</p>
          <dl className="t-caption mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
            <div><dt className="text-fg-3">Camera</dt><dd className="text-fg">{cameraName || 'Unknown'}</dd></div>
            <div><dt className="text-fg-3">Timestamp</dt><dd className="mono text-fg">case {formatTime(event.start_ms)}{mediaMs != null ? ` · media ${formatTime(mediaMs)}` : ''}</dd></div>
            <div><dt className="text-fg-3">Event type</dt><dd className="text-fg">{event.event_type.replace(/_/g, ' ')}</dd></div>
            <div><dt className="text-fg-3">Uncertainty</dt><dd className="mono text-fg">{formatUncertainty(event.uncertainty_ms)}</dd></div>
            <div className="col-span-2 sm:col-span-4"><dt className="text-fg-3">Related tracks</dt><dd className="text-fg">{event.observations?.track_ids?.length ? event.observations.track_ids.map((t) => `#${t}`).join(', ') + ' (identity not confirmed)' : 'None recorded'}</dd></div>
          </dl>
          {(supportingObservations(event, near).length > 0) && <ul className="t-caption mt-2 list-disc pl-5 text-fg-2" aria-label="Supporting observations">{supportingObservations(event, near).map((l, i) => <li key={i}>{l}</li>)}</ul>}
          <div className="mt-2"><KeyframeStrip frames={keyframesOf(card, mediaMs)} eventMediaMs={mediaMs} onSeekFrame={onSeekFrame} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={Play} onClick={onResume}>Resume playback</Button>
            <Button size="sm" variant="outline" icon={Eye} onClick={() => onOpenFrame(event)}>Open exact frame</Button>
            <Button size="sm" variant="outline" onClick={() => onDetails(event)}>View event details</Button>
            <Button size="sm" variant="outline" icon={FileSearch} onClick={() => onEvidence(event)}>Review evidence</Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Investigator decision">
            <span className="t-caption text-fg-3">Your decision:</span>
            {Object.entries(DECISIONS).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={decision?.status === k} onClick={() => decide(caseId, event.id, k)}
                      className="rounded-full border border-line px-3 py-1 text-[0.75rem] text-fg-2 transition hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-fg">{label}</button>
            ))}
            <span className="t-caption text-fg-3">{decision ? `Saved in this browser: ${DECISIONS[decision.status]}.` : 'Dismissing does not mark the event reviewed.'} Not in the audit history yet.</span>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
