import { formatTime } from '../lib/time';

/** Overview, vehicles, real keyframes, and timeline cards. The player remains the only clock. */
export function IncidentOverview({ narrative, provenance }) {
  if (!narrative?.deterministic) return null;
  const ai = narrative.ai_narrative;
  const status = String(narrative.contact_status || '').split('_').join(' ');
  return (
    <section aria-label="Overview" className="mb-3 space-y-1">
      <p className="t-small text-fg">{narrative.deterministic.headline}</p>
      <p className="t-caption text-fg-3">Provenance: {provenance || 'none'} · Contact status: {status}</p>
      {narrative.ai_narrative_status === 'unavailable' && <p className="t-caption text-fg-2">AI narrative is unavailable.</p>}
      {ai?.sentences?.map((sentence) => <p key={sentence.text} className="t-caption text-fg-2">{sentence.text}</p>)}
    </section>
  );
}

export function IncidentVehicles({ actors, items }) {
  const confirmed = (actors || []).filter((actor) => (actor.links || []).some((link) => link.status === 'confirmed'));
  const seen = new Set();
  const tracks = [];
  (items || []).forEach((item) => {
    (item.track_ids || []).forEach((id, index) => {
      const key = `${item.evidence_id || ''}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      tracks.push({ key, label: `${item.track_classes?.[index] || 'object'}, track ${id}` });
    });
  });
  return (
    <section aria-label="Vehicles" className="mb-3">
      <h2 className="t-eyebrow mb-1 text-fg-3">Vehicles</h2>
      {!confirmed.length && !tracks.length ? <p className="t-caption text-fg-3">No tracked vehicles in the incident list.</p> : (
        <ul className="flex max-h-16 flex-wrap gap-2 overflow-y-auto">
          {confirmed.map((actor) => {
            const plate = actor.attributes?.plate;
            return <li key={actor.id} className="t-caption rounded border border-line px-2 py-1">{actor.label}{plate ? ` · plate ${plate}` : ''}</li>;
          })}
          {tracks.map((track) => <li key={track.key} className="t-caption rounded border border-line px-2 py-1">{track.label}</li>)}
        </ul>
      )}
    </section>
  );
}

export function IncidentGallery({ items }) {
  if (!items?.length) return <p className="t-caption mb-3 text-fg-3">No extracted frame for this event.</p>;
  return (
    <ul className="mb-3 flex gap-2 overflow-x-auto" aria-label="Keyframes">
      {items.map((frame) => (
        <li key={frame.frame_id}>
          <img src={frame.thumbnail_url || frame.full_url} alt={`Frame ${frame.frame_no} at ${frame.time_ms} ms`} className="h-16 w-auto rounded border border-line" />
        </li>
      ))}
    </ul>
  );
}

const CARD = {
  amber: 'border-amber-500/70 bg-amber-500/10',
  critical: 'border-red-600 bg-red-600/15',
  neutral: 'border-line bg-surface',
};

export function IncidentCards({ items, unplaced, activeId, onSelect }) {
  return (
    <div className="mb-3 max-h-96 space-y-2 overflow-y-auto pr-1" aria-label="Incident events">
      {(items || []).map((item) => (
        <button key={item.id} type="button" data-display={item.display || 'neutral'} aria-pressed={activeId === item.id} onClick={() => onSelect(item)}
                className={`block w-full rounded-lg border px-3 py-2 text-left ${CARD[item.display] || CARD.neutral}`}>
          <span className="mono t-caption block text-fg-3">{formatTime(item.start_ms)}</span>
          <span className="t-small mt-0.5 block text-fg">{item.title}</span>
          {item.display === 'amber' && <span className="t-caption mt-1 block text-fg-2">Image-space boxes and a speed drop produced this candidate. Contact is not confirmed.</span>}
        </button>
      ))}
      {!!unplaced?.length && (
        <div>
          <h3 className="t-eyebrow mb-1 text-fg-3">Not placed on the case clock</h3>
          {unplaced.map((item) => (
            <button key={item.id} type="button" data-display={item.display || 'neutral'} onClick={() => onSelect(item)} className={`block w-full rounded-lg border px-3 py-2 text-left ${CARD[item.display] || CARD.neutral}`}>
              <span className="t-small text-fg">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
