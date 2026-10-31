/** Source metadata an investigator states about one video: camera name and kind, location text, recording start and end, timezone and clock offset.
 *  Description fields go to PATCH /evidence/{id}/source (stored beside the immutable file). The clock part (start, timezone, stated offset,
 *  uncertainty) also goes to PUT /evidence/{id}/clock, which is the only record that can place a source on a shared clock. */

export const CAMERA_KINDS = [
  { value: 'cctv', label: 'CCTV (fixed)' },
  { value: 'dashcam', label: 'Dashcam (moving)' },
  { value: 'other', label: 'Other (stored, not analysed)' },
];

export const EMPTY_META = { camera_name: '', camera_kind: 'cctv', location_text: '', recording_start: '', recording_end: '', timezone: '', clock_offset_s: '', clock_bound_s: '' };

export const isTimezone = (tz) => {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};
export const browserTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
export const timezoneList = () => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC']; } };

/** "2026-10-30T10:32" read as wall time in `tz` -> UTC Date. Two passes settle the offset across a DST change. */
export function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local || '');
  if (!m || !isTimezone(tz)) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || '0'].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const offsetAt = (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Errors keyed by field. Nothing is defaulted: a start time without a stated uncertainty is refused, because the backend would treat 0 as exact. */
export function validateMeta(m, { durationMs, clockTouched = true } = {}) {
  const e = {};
  if (m.recording_start && !m.timezone) e.timezone = 'Choose the timezone the camera clock was set to.';
  if (m.timezone && !isTimezone(m.timezone)) e.timezone = 'Not a valid IANA timezone, for example Asia/Kolkata or UTC.';
  if (m.recording_start && !zonedToUtc(m.recording_start, m.timezone)) e.recording_start = e.recording_start || 'Enter a valid start date and time.';
  if (m.recording_end) {
    const a = zonedToUtc(m.recording_start, m.timezone);
    const b = zonedToUtc(m.recording_end, m.timezone);
    if (!b) e.recording_end = 'Enter a valid end date and time.';
    else if (!m.recording_start) e.recording_end = 'Enter the start before the end.';
    else if (a && b <= a) e.recording_end = 'The end must be after the start.';
    else if (a && durationMs != null && Math.abs((b - a) - durationMs) > Math.max(2000, durationMs * 0.05)) {
      e.recording_end = `The file is ${(durationMs / 1000).toFixed(1)} s long, but start to end is ${((b - a) / 1000).toFixed(1)} s. Check both times.`;
    }
  }
  if (m.clock_offset_s !== '' && !Number.isFinite(num(m.clock_offset_s))) e.clock_offset_s = 'Enter a number of seconds.';
  if (m.clock_bound_s !== '' && !(Number.isFinite(num(m.clock_bound_s)) && num(m.clock_bound_s) >= 0)) e.clock_bound_s = 'Enter zero or more seconds.';
  if (clockTouched && m.recording_start && m.clock_bound_s === '') e.clock_bound_s = 'State how certain the start time is (± seconds). It is not assumed.';
  return e;
}

/** Body for PUT /evidence/{id}/clock, or null when no start time was entered. `clock_offset_s` > 0 means the camera clock runs ahead of true time. */
export function toClockBody(m) {
  if (!m.recording_start) return null;
  const start = zonedToUtc(m.recording_start, m.timezone);
  if (!start) return null;
  const offsetMs = (num(m.clock_offset_s) || 0) * 1000;
  const utcZero = new Date(start.getTime() - offsetMs);
  const parts = [m.camera_name && `camera ${m.camera_name}`, m.clock_offset_s !== '' && `stated clock offset ${num(m.clock_offset_s)} s`].filter(Boolean);
  return { utc_zero: utcZero.toISOString(), bound_ms: (num(m.clock_bound_s) || 0) * 1000, basis: 'declared_by_investigator', timezone: m.timezone, note: parts.join('; ') || null };
}

/** Body for PATCH /evidence/{id}/source. Empty fields are sent as null so an edit can clear them. Instants are UTC; the timezone is kept as stated. */
export function toSourceBody(m) {
  const at = (v) => { const d = zonedToUtc(v, m.timezone); return d ? d.toISOString() : null; };
  return {
    display_name: m.camera_name.trim() || null,
    camera_role: m.camera_kind || null,
    location_text: m.location_text.trim() || null,
    recording_start: m.recording_start ? at(m.recording_start) : null,
    recording_end: m.recording_end ? at(m.recording_end) : null,
    timezone: m.timezone || null,
  };
}

/** UTC instant -> "YYYY-MM-DDTHH:mm:ss" wall time in `tz`, the inverse of zonedToUtc. */
export function utcToZonedLocal(iso, tz) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime()) || !isTimezone(tz)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Form values from a stored `evidence.source`. A stored start without a timezone is shown in UTC, which is what the instant is. */
export function fromSource(ev) {
  const s = ev.source || {};
  const tz = s.timezone || (s.recording_start || s.recording_end ? 'UTC' : '');
  return {
    ...EMPTY_META,
    camera_name: s.display_name || '',
    camera_kind: s.camera_role || (ev.kind === 'dashcam' || ev.kind === 'cctv' ? ev.kind : 'cctv'),
    location_text: s.location_text || '',
    recording_start: s.recording_start ? utcToZonedLocal(s.recording_start, tz) : '',
    recording_end: s.recording_end ? utcToZonedLocal(s.recording_end, tz) : '',
    timezone: tz,
  };
}

const CLOCK_KEYS = ['recording_start', 'timezone', 'clock_offset_s', 'clock_bound_s'];
export const clockTouched = (initial, m) => CLOCK_KEYS.some((k) => (initial[k] ?? '') !== (m[k] ?? ''));
