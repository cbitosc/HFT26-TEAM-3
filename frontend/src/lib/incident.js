/** The backend requires an offset on incident_at. The form does not ask for one: it sends this browser's offset for the entered time, so the stored value matches what was typed. */
const pad = (n) => String(Math.abs(n)).padStart(2, '0');

/** Offsets offered in the form (UTC-12:00 to UTC+14:00 in 15-minute steps that occur in practice). */
export const OFFSETS = (() => {
  const list = [];
  for (let m = -12 * 60; m <= 14 * 60; m += 15) {
    if (m % 60 !== 0 && ![30, 45].includes(Math.abs(m) % 60)) continue;
    list.push(`${m < 0 ? '-' : '+'}${pad(Math.trunc(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`);
  }
  return list;
})();

/** The offset of the investigator's own browser for a given local date-time, as "+05:30". Used only as the form's starting choice, shown to them. */
export function browserOffset(localValue) {
  const d = localValue ? new Date(localValue) : new Date();
  const m = -d.getTimezoneOffset();
  return `${m < 0 ? '-' : '+'}${pad(Math.trunc(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
}

/** "2026-10-30T10:32" + "+05:30" -> "2026-10-30T10:32:00+05:30" (what the API requires). Empty input -> null (the field is cleared/omitted). */
export function toIncidentAt(local, offset) {
  if (!local) return null;
  if (!/^[+-]\d{2}:\d{2}$/.test(offset || '')) throw new Error('Choose the time zone offset the time was recorded in.');
  return `${local.length === 16 ? `${local}:00` : local}${offset}`;
}

/** Split a stored value back into the form's two inputs without converting zones. */
export function splitIncidentAt(iso) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(iso || '');
  return m ? { local: m[1], offset: m[2] === 'Z' ? '+00:00' : m[2] } : { local: '', offset: '' };
}

/** "2026-10-30 10:32" or null: the time as entered, without the offset (the backend stores one; the UI does not ask for or show it). */
export function formatIncidentAt(iso) {
  const p = splitIncidentAt(iso);
  return p.local ? p.local.replace('T', ' ') : null;
}
