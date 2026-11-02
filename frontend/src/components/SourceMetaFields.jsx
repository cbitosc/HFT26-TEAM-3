import { Field, Input, Select } from '../ui-kit';
import { CAMERA_KINDS, browserTimezone, timezoneList, toClockBody } from '../lib/sourceMeta';

/** Controlled fields for one video source. `errors` comes from validateMeta. `idPrefix` keeps labels unique when several sources are on screen. */
export default function SourceMetaFields({ value, onChange, errors = {}, disabled, idPrefix = 'src', filename }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const preview = toClockBody(value);
  const listId = `${idPrefix}-tz`;
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={`Source details${filename ? ` for ${filename}` : ''}`}>
      <Field label="Camera name"><Input id={`${idPrefix}-name`} value={value.camera_name} onChange={set('camera_name')} disabled={disabled} placeholder="e.g. North approach camera" /></Field>
      <Field label="Camera type">
        <Select id={`${idPrefix}-kind`} value={value.camera_kind} onChange={set('camera_kind')} disabled={disabled}>
          {CAMERA_KINDS.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </Select>
      </Field>
      {value.camera_kind === 'other' && <p className="t-caption text-fg-3 sm:col-span-2">An "Other" video is stored with its hash and shown in the case, but is not sent to vehicle detection or tracking.</p>}
      <Field label="Location (text)" className="sm:col-span-2" hint="Free text as you know it. It is not geocoded and no map is drawn."><Input id={`${idPrefix}-loc`} value={value.location_text} onChange={set('location_text')} disabled={disabled} placeholder="e.g. Corner of Main St and 4th Ave, facing east" /></Field>
      <Field label="Recording start" error={errors.recording_start}><Input id={`${idPrefix}-start`} type="datetime-local" step="1" value={value.recording_start} onChange={set('recording_start')} disabled={disabled} /></Field>
      <Field label="Recording end" error={errors.recording_end}><Input id={`${idPrefix}-end`} type="datetime-local" step="1" value={value.recording_end} onChange={set('recording_end')} disabled={disabled} /></Field>
      <Field label="Timezone" error={errors.timezone} hint={browserTimezone() ? `This browser is in ${browserTimezone()}.` : undefined}>
        {(p) => (
          <>
            <Input {...p} list={listId} value={value.timezone} onChange={set('timezone')} disabled={disabled} placeholder="e.g. Asia/Kolkata or UTC" />
            <datalist id={listId}>{timezoneList().map((z) => <option key={z} value={z} />)}</datalist>
          </>
        )}
      </Field>
      <Field label="Clock offset (seconds)" error={errors.clock_offset_s} hint="Positive if the camera clock runs ahead of true time. Leave empty if unknown.">
        <Input id={`${idPrefix}-offset`} type="number" step="any" value={value.clock_offset_s} onChange={set('clock_offset_s')} disabled={disabled} />
      </Field>
      <Field label="Start certainty ± seconds" error={errors.clock_bound_s} hint="Required when a start time is given. Zero means you state it is exact.">
        <Input id={`${idPrefix}-bound`} type="number" min="0" step="any" value={value.clock_bound_s} onChange={set('clock_bound_s')} disabled={disabled} />
      </Field>
      {preview && <p className="t-caption text-fg-3 sm:col-span-2" data-testid="clock-preview">Will be declared as true UTC start {preview.utc_zero} (± {preview.bound_ms / 1000} s). Sources with a declared start are placed on one clock when the reconstruction is rebuilt.</p>}
    </div>
  );
}
