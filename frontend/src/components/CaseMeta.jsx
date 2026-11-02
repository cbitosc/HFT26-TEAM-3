import { formatIncidentAt } from '../lib/incident';

/** Incident time and location exactly as the backend stores them. Nothing is filled in, converted or drawn on a map. */
export default function CaseMeta({ c }) {
  const when = formatIncidentAt(c.incident_at);
  if (!when && !c.location_text) return null;
  return (
    <p className="t-caption text-fg-3" data-testid="case-meta" title={c.incident_at_note || undefined}>
      {when && <>Incident: {when} </>}
      {c.location_text && <>{when ? '· ' : ''}Location: {c.location_text} </>}
      <span>(stated by the investigator)</span>
    </p>
  );
}
