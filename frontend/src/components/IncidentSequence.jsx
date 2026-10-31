import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Badge, Button, Segmented } from '../ui-kit';
import { useDecisions } from '../decisions';
import { DECISIONS, RANK, TIER_LABEL, explainEvent, tierOf } from '../lib/alerts';
import { classOfEvent, sourceName } from '../lib/overview';
import { formatTime, formatUncertainty } from '../lib/time';
import { CLASS_LABEL } from '../lib/overview';
import { KeyframeStrip, keyframesOf } from './AccidentAlert';

const TIER_TONE = { accident: 'border-l-danger', attention: 'border-l-warning', info: 'border-l-line' };
const LIMIT = 40;
const NONE = {};

/** The incident as a sequence of cards, not a list of database rows: time, plain explanation, tier, camera, keyframe, evidence status and review status.
 *  Selecting a card seeks the video (via onSelect); the active card follows the playhead. Events without a usable time are listed apart and never placed. */
export default function IncidentSequence({ events, unplaced = [], board, activeId, nameOf, caseId, onSelect, onSeekFrame, onOpenFrame }) {
  const reduce = useReducedMotion();
  const [minTier, setMinTier] = useState('attention');
  const [more, setMore] = useState(false);
  const stored = useDecisions((s) => s.all[caseId]);
  const decisions = stored || NONE;
  const refs = useRef({});
  const cards = useMemo(() => Object.fromEntries((board?.strips || []).flatMap((s) => s.items).map((i) => [i.event_id, i])), [board]);
  const shown = useMemo(() => events.filter((e) => RANK[tierOf(e)] >= RANK[minTier]).sort((a, b) => a.start_ms - b.start_ms), [events, minTier]);
  const list = more ? shown : shown.slice(0, LIMIT);
  useEffect(() => { const el = refs.current[activeId]; if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }, [activeId, reduce]);
  const fade = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.15 } };
  return (
    <section aria-label="Incident sequence">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Event importance" value={minTier} onChange={setMinTier} options={[{ id: 'accident', label: 'Possible accident' }, { id: 'attention', label: 'Attention and above' }, { id: 'info', label: 'Everything' }]} />
        <span className="t-caption text-fg-3">{shown.length} event{shown.length === 1 ? '' : 's'} · case clock</span>
      </div>
      {shown.length === 0 && <p className="t-small text-fg-3">No event at this importance in the stored data.</p>}
      <ol className="space-y-2" aria-label="Events in time order">
        {list.map((e) => {
          const active = activeId === e.id;
          const tier = tierOf(e);
          const card = cards[e.id];
          const mediaMs = e.observations?.source_time_ms?.[0];
          const thumb = card?.during?.[0] || card?.before || null;
          const dec = decisions[e.id];
          return (
            <motion.li key={e.id} ref={(el) => { refs.current[e.id] = el; }} layout={!reduce} {...fade}>
              <button type="button" aria-pressed={active} aria-label={`${formatTime(e.start_ms)} ${e.title}`} onClick={() => onSelect(e)}
                      className={`flex w-full gap-3 rounded-lg border border-line border-l-4 ${TIER_TONE[tier]} p-2.5 text-left transition-colors hover:bg-surface-2 aria-pressed:bg-accent/10 aria-pressed:border-accent`}>
                {thumb && (thumb.thumbnail_url || thumb.full_url) ? <img src={thumb.thumbnail_url || thumb.full_url} alt="" loading="lazy" className="h-14 w-24 shrink-0 rounded object-cover" /> : <span className="t-caption grid h-14 w-24 shrink-0 place-items-center rounded border border-dashed border-line text-fg-3">no frame</span>}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="mono t-small text-accent-text">{formatTime(e.start_ms)}</span><span className="t-small font-medium text-fg">{e.title}</span></span>
                  <span className="t-caption mt-0.5 block text-fg-2">{explainEvent(e)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={tier === 'accident' ? 'danger' : tier === 'attention' ? 'warning' : 'neutral'}>{TIER_LABEL[tier]}</Badge>
                    <Badge variant="neutral">{sourceName(e)}{e.source_id ? ` · ${nameOf(e.source_id)}` : ''}</Badge>
                    <Badge variant="neutral">{CLASS_LABEL[classOfEvent(e)]}</Badge>
                    {e.observations?.track_ids?.length > 0 && <Badge variant="neutral">tracks {e.observations.track_ids.map((t) => `#${t}`).join(', ')}</Badge>}
                    <span className="t-caption text-fg-3">{formatUncertainty(e.uncertainty_ms)}</span>
                    <span className="t-caption text-fg-3">{dec ? DECISIONS[dec.status] : e.review_status === 'unreviewed' ? 'not reviewed' : e.review_status}</span>
                  </span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.div key="open" initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={reduce ? {} : { opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                    <div className="space-y-2 rounded-b-lg border border-t-0 border-line px-3 py-3" aria-label="Event details">
                      <p className="t-small text-fg-2">{explainEvent(e)}</p>
                      <p className="t-caption text-fg-3">Case {formatTime(e.start_ms)} {formatUncertainty(e.uncertainty_ms)}{mediaMs != null ? ` · video time ${formatTime(mediaMs)}` : ''} · {e.synchronized ? 'on the case clock' : 'not on the case clock'}</p>
                      <KeyframeStrip frames={keyframesOf(card, mediaMs)} eventMediaMs={mediaMs} onSeekFrame={onSeekFrame} />
                      {e.source_type?.startsWith('video') && mediaMs != null && <Button size="sm" variant="outline" onClick={() => onOpenFrame(e)}>Open exact frame</Button>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ol>
      {shown.length > LIMIT && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show all ${shown.length}`}</Button>}
      {unplaced.length > 0 && (
        <details className="mt-3 rounded-lg border border-line px-3 py-2">
          <summary className="t-small cursor-pointer text-fg-2">{unplaced.length} event{unplaced.length === 1 ? '' : 's'} with no usable time (not placed in the sequence)</summary>
          <ul className="mt-2 space-y-1">{unplaced.map((e) => <li key={e.id} className="t-caption text-fg-3"><Badge variant="neutral">no time</Badge> {e.title}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
