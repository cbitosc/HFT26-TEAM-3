/** The single timestamp formatter. Format: MM:SS.mmm (H:MM:SS.mmm from one hour). Which clock a number belongs to is part of the label,
 *  never inferred from the number:
 *    media  = media-relative ms of one video (what video.currentTime * 1000 gives)
 *    case   = case-clock ms of one reconstruction scenario (only for sources joined by a recorded clock relation)
 *    sensor = ms from a sensor file's first valid sample
 *  Container PTS and wall-clock time are not formatted here: the backend returns no trusted wall-clock. */
export const BASES = { media: 'media', case: 'case', sensor: 'sensor' };

export function formatTime(ms) {
  if (ms == null || Number.isNaN(ms) || !Number.isFinite(ms)) return '--:--.---';
  const neg = ms < 0;
  const total = Math.round(Math.abs(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const milli = total % 1000;
  const core = `${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${core}` : `${String(m).padStart(2, '0')}:${core}`;
  return neg ? `−${body}` : body;
}

/** "±0.100 s" */
export function formatUncertainty(ms) {
  if (ms == null) return '';
  return `±${(ms / 1000).toFixed(3)} s`;
}

/** formatTime plus the basis, e.g. "case 00:04.600". */
export function labelled(ms, basis) {
  return `${basis} ${formatTime(ms)}`;
}

/** Duration like "1.250 s". */
export function formatDuration(ms) {
  return ms == null ? '—' : `${(ms / 1000).toFixed(3)} s`;
}

/** Ruler ticks for a visible window: returns { step, ticks } with a step chosen so there are at most `max` ticks. */
export function rulerTicks(startMs, widthMs, max = 12) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 120_000, 300_000];
  const step = steps.find((s) => widthMs / s <= max) ?? steps[steps.length - 1];
  const ticks = [];
  for (let t = Math.ceil(startMs / step) * step; t <= startMs + widthMs; t += step) ticks.push(t);
  return { step, ticks };
}

/** Tick label: only as precise as the step needs. */
export function tickLabel(ms, step) {
  if (step >= 1000) return formatTime(ms).replace(/\.000$/, '');
  return formatTime(ms);
}
