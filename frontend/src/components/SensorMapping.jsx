import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Field, Input, Select } from '../ui-kit';
import { api } from '../api';

/** Canonical sensor fields and the units the backend accepts (docs/SENSOR_DATA_FORMAT.md). A unit is never preselected: an undeclared unit is rejected, not guessed. */
export const FIELDS = [
  { key: 't', label: 'Time', required: true, units: ['s', 'ms', 'iso', 'epoch_s', 'epoch_ms'] },
  { key: 'speed', label: 'Speed', units: ['m/s', 'km/h', 'mph', 'kn'] },
  { key: 'accel_long', label: 'Longitudinal acceleration', units: ['m/s2', 'g'] },
  { key: 'accel_lat', label: 'Lateral acceleration', units: ['m/s2', 'g'] },
  { key: 'accel_vert', label: 'Vertical acceleration', units: ['m/s2', 'g'] },
  { key: 'gyro_z', label: 'Yaw rate', units: ['rad/s', 'deg/s'] },
  { key: 'heading', label: 'Heading', units: ['deg', 'rad'] },
  { key: 'lat', label: 'Latitude' },
  { key: 'lon', label: 'Longitude' },
  { key: 'collision', label: 'Collision flag' },
];
const CLOCKS = [
  { value: 'relative', label: 'Relative (seconds or ms from the start)' },
  { value: 'utc', label: 'UTC timestamps' },
  { value: 'local', label: 'Local time (needs a timezone)' },
  { value: 'simulation', label: 'Simulation clock' },
];

/** Header cells of a delimited text file: the delimiter is whichever of comma, semicolon or tab is most frequent on the first line. */
export function parseHeader(text) {
  const line = (text || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, line.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0];
  if (!line || !delim[1]) return line ? [line.trim()] : [];
  return line.split(delim[0]).map((c) => c.trim().replace(/^"|"$/g, ''));
}

async function firstLine(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The original file could not be read (HTTP ${res.status}).`);
  const reader = res.body?.getReader?.();
  if (!reader) return res.text();
  const dec = new TextDecoder();
  let text = '';
  for (let i = 0; i < 64 && !/\n/.test(text); i++) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); }
  reader.cancel().catch(() => {});
  return text;
}

export function buildSpec(form) {
  const mapping = {};
  const units = {};
  FIELDS.forEach((f) => { if (form.cols[f.key]) { mapping[f.key] = form.cols[f.key]; if (f.units) units[f.key] = form.units[f.key]; } });
  return { mapping, units, clock: form.clock, ...(form.clock === 'local' ? { timezone: form.timezone } : {}) };
}

export function specErrors(form) {
  const e = {};
  if (!form.cols.t) e.t = 'Choose the time column.';
  FIELDS.forEach((f) => { if (form.cols[f.key] && f.units && !form.units[f.key]) e[f.key] = 'State the unit. It is not guessed.'; });
  const used = Object.values(form.cols).filter(Boolean);
  if (new Set(used).size !== used.length) e.dup = 'A column can be mapped to one field only.';
  if (form.clock === 'local' && !form.timezone.trim()) e.timezone = 'A local clock needs an IANA timezone, for example Asia/Kolkata.';
  return e;
}

function Summary({ r }) {
  return (
    <div className="space-y-2" aria-label="Mapping preview">
      <p className="t-small text-fg">{r.valid_rows} of {r.rows} rows are valid{r.sampling?.rate_hz ? ` · about ${Number(r.sampling.rate_hz).toFixed(1)} Hz` : ''}.</p>
      {Object.keys(r.issue_counts || {}).length > 0 && <p className="t-caption text-fg-2">Rows kept with issues: {Object.entries(r.issue_counts).map(([k, v]) => `${k.split('_').join(' ')} ${v}`).join(', ')}</p>}
      {r.gps_consistency && <p className="t-caption text-fg-2">GPS against mapped speed: {r.gps_consistency.consistent ? 'consistent' : 'not consistent'}.</p>}
      <p className="t-caption text-fg-2">Events these rules would write: {r.events?.length ? r.events.map((x) => x.event_type.split('_').join(' ')).join(', ') : 'none'}.</p>
      {r.first_rows?.length > 0 && (
        <div className="overflow-x-auto"><table className="t-caption w-full"><caption className="sr-only">First rows after conversion</caption>
          <thead><tr className="text-left text-fg-3"><th className="pr-3">Row</th><th className="pr-3">Raw time</th><th className="pr-3">Time (ms)</th><th>Converted values</th></tr></thead>
          <tbody>{r.first_rows.map((x) => <tr key={x.row_no}><td className="pr-3">{x.row_no}</td><td className="mono pr-3">{x.t_raw}</td><td className="mono pr-3">{x.time_ms ?? 'Not established'}</td><td className="mono text-fg-2">{JSON.stringify(x.si)}{x.issues?.length ? ` · ${x.issues.join(', ')}` : ''}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

/** Column mapping for one sensor CSV. Preview writes nothing; Register stores the mapping and runs the sensor rules. */
export default function SensorMapping({ evidence, caseId, registered, onDone }) {
  const [header, setHeader] = useState({ status: 'loading' });
  const [form, setForm] = useState({ cols: {}, units: {}, clock: 'relative', timezone: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (registered || !evidence.links?.original) { setHeader({ status: 'skip' }); return undefined; }
    let off = false;
    firstLine(evidence.links.original).then((t) => { if (!off) setHeader({ status: 'ready', cols: parseHeader(t) }); }).catch((e) => { if (!off) setHeader({ status: 'error', message: e.message }); });
    return () => { off = true; };
  }, [evidence.id, registered, evidence.links?.original]);

  if (registered) {
    return (
      <section aria-label="Sensor mapping" className="space-y-2">
        <p className="flex items-center gap-2 t-small text-fg"><Badge variant="success">Mapping registered</Badge><span className="t-caption text-fg-3">clock {registered.clock}{registered.sample_rate_hz ? ` · about ${Number(registered.sample_rate_hz).toFixed(1)} Hz` : ''}</span></p>
        <dl className="t-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" aria-label="Registered columns">
          {Object.entries(registered.mapping || {}).map(([k, col]) => <div key={k} className="contents"><dt className="text-fg-3">{k}</dt><dd className="mono text-fg-2">{col}{registered.units?.[k] ? ` (${registered.units[k]})` : ''}</dd></div>)}
        </dl>
        <p className="t-caption text-fg-3">A registered mapping is not edited. Sensor time is the sensor's own clock until a clock relation is recorded and the reconstruction is rebuilt.</p>
      </section>
    );
  }
  if (evidence.status !== 'valid') return <p className="t-small text-fg-3">This sensor file has not passed validation, so it cannot be mapped.</p>;
  if (header.status === 'loading') return <p className="t-small text-fg-3">Reading the column names…</p>;
  if (header.status === 'error') return <Alert variant="danger" title="Could not read the file">{header.message}</Alert>;
  if (header.status === 'skip') return null;

  const errors = specErrors(form);
  const ok = Object.keys(errors).length === 0;
  const setCol = (k, v) => { setPreview(null); setForm((f) => ({ ...f, cols: { ...f.cols, [k]: v }, units: v ? f.units : { ...f.units, [k]: '' } })); };
  const setUnit = (k, v) => { setPreview(null); setForm((f) => ({ ...f, units: { ...f.units, [k]: v } })); };
  const run = async (kind) => {
    setBusy(kind); setErr(null);
    try {
      const spec = buildSpec(form);
      if (kind === 'preview') setPreview(await api.sensorPreview(evidence.id, spec));
      else { await api.registerSensor(caseId, { evidence_id: evidence.id, ...spec }); onDone?.(); }
    } catch (x) { setErr(x.message); } finally { setBusy(null); }
  };
  if (!shown) return <div><p className="t-small text-fg-3">This sensor file has no column mapping, so no sensor reading is used yet.</p><Button size="sm" variant="outline" className="mt-2" onClick={() => setShown(true)}>Map columns</Button></div>;

  return (
    <form aria-label="Sensor column mapping" className="space-y-3" onSubmit={(e) => { e.preventDefault(); run('register'); }}>
      <p className="t-caption text-fg-3">Choose which column holds each quantity and state its unit. Nothing is guessed. Preview parses the file and stores nothing.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-[1fr_auto] gap-2">
            <Field label={f.label} optional={!f.required} error={errors[f.key]}>
              {(p) => (
                <Select {...p} value={form.cols[f.key] || ''} onChange={(e) => setCol(f.key, e.target.value)}>
                  <option value="">{f.required ? 'Choose a column' : 'Not mapped'}</option>
                  {header.cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
            </Field>
            {f.units && form.cols[f.key] && (
              <Field label={`${f.label} unit`}>
                {(p) => (
                  <Select {...p} value={form.units[f.key] || ''} onChange={(e) => setUnit(f.key, e.target.value)}>
                    <option value="">Unit</option>
                    {f.units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                )}
              </Field>
            )}
          </div>
        ))}
      </div>
      {errors.dup && <p className="t-caption text-danger" role="alert">{errors.dup}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Clock">
          <Select value={form.clock} onChange={(e) => { setPreview(null); setForm({ ...form, clock: e.target.value }); }} options={CLOCKS} />
        </Field>
        {form.clock === 'local' && <Field label="Timezone" error={errors.timezone}><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="e.g. Asia/Kolkata" /></Field>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" loading={busy === 'preview'} disabled={!ok || !!busy} onClick={() => run('preview')}>Preview</Button>
        <Button type="submit" variant="primary" loading={busy === 'register'} disabled={!ok || !!busy}>Register mapping</Button>
      </div>
      {err && <Alert variant="danger" title="The backend rejected this mapping">{err}</Alert>}
      {preview && <Summary r={preview} />}
    </form>
  );
}
