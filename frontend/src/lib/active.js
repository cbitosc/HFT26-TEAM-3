/** Active-event selection from the playhead. Events are case-clock events with `start_ms`; unplaced events never become active by time. */
export const ACTIVE_TAIL_MS = 400;

const end = (e) => e.end_ms ?? e.start_ms;

/** True if `ms` lies inside the event's interval widened by its uncertainty (and a short tail for instants). */
export function covers(e, ms) {
  const unc = e.uncertainty_ms || 0;
  return e.start_ms - unc <= ms && ms <= end(e) + Math.max(unc, ACTIVE_TAIL_MS);
}

/** Events must be sorted by start_ms. Returns the latest-started event covering `ms`, else null. */
export function findActiveEvent(sorted, ms) {
  let lo = 0;
  let hi = sorted.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].start_ms - (sorted[mid].uncertainty_ms || 0) <= ms) { last = mid; lo = mid + 1; } else hi = mid - 1;
  }
  for (let i = last; i >= 0 && i >= last - 40; i--) if (covers(sorted[i], ms)) return sorted[i];
  return null;
}

/** An explicit selection stays active until the playhead moves more than `tolMs` from the time it was selected at. */
export function resolveActive({ computed, pinnedId, pinnedAt, currentMs, tolMs = 60 }) {
  if (pinnedId && pinnedAt != null && Math.abs(currentMs - pinnedAt) <= tolMs) return pinnedId;
  return computed ? computed.id : null;
}

export const byStart = (a, b) => a.start_ms - b.start_ms || (a.id < b.id ? -1 : 1);
