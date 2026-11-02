import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, LoadingState, Modal, PageHeader, SectionHeader, Segmented, Select, useToast } from '../ui-kit';
import { FileText, FileVideo, Gauge, Layers, Play } from 'lucide-react';
import Shell from '../layout';
import ReconstructionReadiness from '../components/ReconstructionReadiness';
import VehicleMatching from '../components/VehicleMatching';
import SourceAlignment from '../components/SourceAlignment';
import CaseBanner from '../components/CaseBanner';
import DesignationBadge from '../components/DesignationBadge';
import JobStages from '../components/JobStages';
import SourceMetaFields from '../components/SourceMetaFields';
import SensorMapping from '../components/SensorMapping';
import EvidenceUploader from '../components/EvidenceUploader';
import { Statement } from '../components/Evidence';
import { api } from '../api';
import { ACTIVE } from '../lib/jobs';
import { useCaseContext } from '../caseContext';
import { effectiveDesignation } from '../lib/overview';
import { clockTouched, fromSource, toClockBody, toSourceBody, validateMeta } from '../lib/sourceMeta';

const VIEW_KEY = 'traceline.evidenceView';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'; } catch { return 'grid'; } };
const isVideo = (e) => e.kind === 'cctv' || e.kind === 'dashcam' || e.kind === 'other';
const KIND_ICON = { cctv: FileVideo, dashcam: FileVideo, sensor_csv: Gauge };
const bytes = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);
const NA = <span className="text-fg-3">Not established</span>;

/** How this source relates to the case clock, from GET /cases/{id}/sync. Wording follows the stored groups only. */
export function syncState(sync, evidenceId, videoCount) {
  if (!sync) return { label: 'Unavailable', variant: 'neutral', note: 'The synchronization state could not be read.' };
  if ((sync.unsynchronized || []).includes(evidenceId)) return { label: 'Not synchronized', variant: 'warning', note: 'No recorded clock relation to any other source. Its events keep their own time and are not ordered against other sources.' };
  const g = (sync.groups || []).find((x) => x.members.some((m) => m.evidence_id === evidenceId));
  if (!g) return { label: 'Not placed', variant: 'neutral', note: 'No reconstruction clock includes this source yet.' };
  const m = g.members.find((x) => x.evidence_id === evidenceId);
  if (g.members.length === 1 && videoCount <= 1) return { label: 'Own reference clock', variant: 'info', note: 'A single source is its own reference. It is not related to wall-clock time.' };
  return { label: g.reference === evidenceId ? 'Reference clock' : 'On shared clock', variant: g.consistent ? 'success' : 'danger', note: `Offset to reference ${m.offset_to_reference_ms} ms (± ${m.bound_ms} ms).${g.consistent ? '' : ' The recorded relations disagree.'}` };
}

function Thumb({ e }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let off = false;
    if (isVideo(e) && e.video?.playback_ready) api.frames(e.id, 0, 1).then((r) => { if (!off) setSrc(r.items?.[0]?.thumbnail_url || null); }).catch(() => {});
    return () => { off = true; };
  }, [e]);
  const Icon = KIND_ICON[e.kind] || FileText;
  return src ? <img src={src} alt={`First extracted frame of ${e.original_filename}`} className="aspect-video w-full rounded-md bg-black object-contain" />
    : <div className="flex aspect-video w-full items-center justify-center rounded-md border border-line bg-surface-2 text-fg-3" aria-label="No preview available"><Icon className="h-6 w-6" aria-hidden /><span className="t-caption ml-2">No preview</span></div>;
}

function Detail({ e, jobs, sync, videoCount, others, sensor, caseId, onPreview, onSaved }) {
  const toast = useToast();
  const initial = useMemo(() => fromSource(e), [e]);
  const [meta, setMeta] = useState(initial);
  const [rel, setRel] = useState({ ref: e.source?.clock_offset_reference_id || '', seconds: e.source?.clock_offset_ms != null ? String(e.source.clock_offset_ms / 1000) : '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const st = syncState(sync, e.id, videoCount);
  const clock = (sync?.clock_records || []).find((c) => c.evidence_id === e.id);
  const v = e.video;
  const save = async (ev) => {
    ev.preventDefault();
    const touched = clockTouched(initial, meta);
    const errs = validateMeta(meta, { durationMs: v?.duration_ms, clockTouched: touched });
    const secs = rel.seconds.trim();
    if (rel.ref && secs === '') errs.offset = 'Enter the offset in seconds, or clear the reference.';
    if (!rel.ref && secs !== '') errs.offset = 'Choose which source the offset is measured against.';
    if (secs !== '' && !Number.isFinite(Number(secs))) errs.offset = 'Enter a number of seconds.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = touched ? toClockBody(meta) : null;
      await api.patchSource(e.id, { ...toSourceBody(meta), clock_offset_reference_id: rel.ref || null, clock_offset_ms: rel.ref ? Math.round(Number(secs) * 1000) : null });
      if (body) await api.setClock(e.id, body);
      toast({ title: body ? 'Source details saved. Clock declared.' : 'Source details saved.', type: 'success' });
      onSaved();
    } catch (x) { toast({ title: 'Could not save the source details', description: x.message, type: 'error' }); } finally { setBusy(false); }
  };
  return (
    <Card as="section" aria-label={`Source ${e.original_filename}`} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="t-h2 min-w-0 flex-1 truncate">{e.original_filename}</h2>
        <Badge variant="neutral">{e.kind}</Badge>
        {e.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>}
        <Badge variant={e.status === 'valid' ? 'success' : e.status === 'invalid' ? 'danger' : 'neutral'}>{e.status}</Badge>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Thumb e={e} />
          {isVideo(e) && e.video?.playback_ready && <Button size="sm" variant="outline" icon={Play} onClick={() => onPreview(e)}>Play preview</Button>}
          <p className="t-caption text-fg-3">Preview plays the stored playback copy. It does not move the workspace clock.</p>
        </div>
        <details className="rounded-lg border border-line p-3"><summary className="t-small cursor-pointer font-medium">Original file & metadata</summary><dl className="t-small mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" aria-label="Metadata">
          <dt className="text-fg-3">Source id</dt><dd className="mono break-all text-fg-2">{e.id}</dd>
          <dt className="text-fg-3">Camera name</dt><dd className="text-fg-2">{e.source?.display_name || NA}</dd>
          <dt className="text-fg-3">Camera type</dt><dd className="text-fg-2">{e.source?.camera_role || NA}</dd>
          <dt className="text-fg-3">Location (as stated)</dt><dd className="text-fg-2">{e.source?.location_text || NA}</dd>
          <dt className="text-fg-3">Recording window (as stated)</dt><dd className="text-fg-2">{e.source?.recording_start ? `${e.source.recording_start}${e.source.recording_end ? ` → ${e.source.recording_end}` : ''}${e.source.timezone ? ` · ${e.source.timezone}` : ''}` : NA}</dd>
          <dt className="text-fg-3">Original file</dt><dd className="break-all text-fg-2">{e.original_filename}</dd>
          <dt className="text-fg-3">Size</dt><dd className="text-fg-2">{bytes(e.size_bytes)}</dd>
          <dt className="text-fg-3">SHA-256</dt><dd className="mono break-all text-fg-2" title={e.sha256}>{e.sha256}</dd>
          <dt className="text-fg-3">Uploaded</dt><dd className="text-fg-2">{new Date(e.uploaded_at).toLocaleString()} <span className="text-fg-3">(system time)</span></dd>
          {v && <>
            <dt className="text-fg-3">Duration</dt><dd className="text-fg-2">{v.duration_ms != null ? `${(v.duration_ms / 1000).toFixed(2)} s` : NA}</dd>
            <dt className="text-fg-3">Frame rate</dt><dd className="text-fg-2">{v.fps_measured != null ? `${v.fps_measured} measured` : NA}{v.fps_nominal != null && <span className="text-fg-3"> · {v.fps_nominal} nominal</span>}</dd>
            <dt className="text-fg-3">Coded size</dt><dd className="text-fg-2">{v.width}×{v.height}{v.rotation ? ` · rotation ${v.rotation}°` : ''}</dd>
            <dt className="text-fg-3">Container PTS start</dt><dd className="mono text-fg-2">{v.pts_start_ms != null ? `${v.pts_start_ms} ms` : NA}</dd>
            <dt className="text-fg-3">Recording time in file</dt><dd className="text-fg-2">{v.creation_time_claimed ? <>{v.creation_time_claimed} <Badge variant="warning">unverified claim</Badge></> : NA}</dd>
          </>}
          <dt className="text-fg-3">Provenance</dt><dd className="text-fg-2">{e.provenance ? (typeof e.provenance === 'string' ? e.provenance : JSON.stringify(e.provenance)) : NA}</dd>
          <dt className="text-fg-3">Licence</dt><dd className="text-fg-2">{e.licence || NA}</dd>
          <dt className="text-fg-3">Original</dt><dd className="text-fg-2"><a href={e.links?.original} download>Download unchanged original</a></dd>
          {(e.validation?.errors?.length > 0 || e.validation?.warnings?.length > 0) && <>
            <dt className="text-fg-3">Validation</dt>
            <dd className="text-fg-2">{[...(e.validation.errors || []).map((x) => `Error: ${x}`), ...(e.validation.warnings || []).map((x) => `Warning: ${x}`)].map((x, i) => <span key={i} className="block">{x}</span>)}</dd>
          </>}
        </dl></details>
      </div>

      <details><summary className="t-small cursor-pointer font-medium">Processing & clock status</summary><div className="mt-4 grid gap-5 lg:grid-cols-2">
        <section aria-label="Processing">
          <SectionHeader title="Processing" />
          <JobStages jobs={jobs} evidenceId={e.id} />
        </section>
        {isVideo(e) && (
          <section aria-label="Synchronization">
            <SectionHeader title="Synchronization" />
            <p className="mb-2 flex items-center gap-2"><Badge variant={st.variant}>{st.label}</Badge></p>
            <p className="t-small text-fg-2">{st.note}</p>
            {clock && <p className="t-caption mt-2 text-fg-3">Declared clock: start {clock.utc_zero || 'not given'} · ± {clock.bound_ms} ms · {clock.basis}{clock.timezone ? ` · ${clock.timezone}` : ''}{clock.used_for_sync ? '' : ' · not used for synchronization'}</p>}
          </section>
        )}
      </div></details>

      {e.kind === 'sensor_csv' && (
        <section aria-label="Sensor columns">
          <SectionHeader title="Sensor columns" description="Which column is which, and in what unit. The original file is never changed." />
          <SensorMapping evidence={e} caseId={caseId} registered={sensor} onDone={onSaved} />
        </section>
      )}

      {isVideo(e) && (
        <details><summary className="t-small cursor-pointer font-medium">Edit source details & recording clock</summary><form onSubmit={save} aria-label="Edit source details" className="mt-4 space-y-3">
          <SectionHeader title="Source details" description="Edit at any time. Original bytes are never changed." />
          <Alert variant="info" title="What is stored where">
            Name, camera type, location text and the recording window are stored beside the file. The file, its name and its hash do not change. A start time, timezone, clock offset and uncertainty are also declared as a clock, and a declared clock is trusted when sources are placed on one timeline. Changes reach the reconstruction when it is next rebuilt.
          </Alert>
          <SourceMetaFields value={meta} onChange={setMeta} errors={errors} idPrefix={`src-${e.id}`} filename={e.original_filename} />
          {others.length > 0 && (
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="t-small mb-1 font-medium text-fg">Offset to another source</legend>
              <Field label="Measured against" hint="Optional.">
                <Select id={`rel-${e.id}`} value={rel.ref} onChange={(x) => setRel({ ...rel, ref: x.target.value })}>
                  <option value="">None</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.source?.display_name || o.original_filename}</option>)}
                </Select>
              </Field>
              <Field label="Offset (seconds)" error={errors.offset} hint="Time in this source = time in the other source + offset. Applied as a declared relation when the reconstruction is rebuilt.">
                <Input id={`rel-s-${e.id}`} type="number" step="any" value={rel.seconds} onChange={(x) => setRel({ ...rel, seconds: x.target.value })} />
              </Field>
            </fieldset>
          )}
          <Button type="submit" variant="primary" loading={busy}>Save source details</Button>
        </form></details>
      )}
    </Card>
  );
}

export default function EvidencePage() {
  const { caseId } = useParams();
  const [params] = useSearchParams();
  const select = useCaseContext((s) => s.select);
  const [state, setState] = useState({ status: 'loading' });
  const [view, setView] = useState(readView);
  const [pick, setPick] = useState(null);
  const [preview, setPreview] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, ev, jobs, sync, wit, sens] = await Promise.all([api.case(caseId), api.evidence(caseId), api.jobs(caseId).catch(() => ({ items: [] })), api.sync(caseId).catch(() => null), api.witnesses(caseId).catch(() => ({ items: [] })), api.sensors(caseId).catch(() => ({ items: [] }))]);
      const statements = (await Promise.all(wit.items.map(async (w) => (await api.statements(w.id)).items.map((s) => ({ s, label: w.label }))))).flat();
      select(c);
      setState({ status: 'ready', c, ev: ev.items, jobs: jobs.items, sync, statements, sensors: sens.items });
    } catch (e) { setState({ status: 'error', e }); }
  }, [caseId, select]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPick(null); }, [caseId]);
  const processing = state.status === 'ready' && state.jobs.some(j => ACTIVE.includes(j.status));
  useEffect(() => {
    if (!processing) return undefined;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [processing, load]);
  const setViewKeep = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ } };

  const { c, ev = [], jobs = [], sync, statements = [], sensors = [] } = state;
  const eff = c ? effectiveDesignation(c.designation, ev) : null;
  const selected = ev.find((e) => e.id === (pick || params.get('source'))) || ev[0] || null;
  const videoCount = ev.filter(isVideo).length;
  const sources = useMemo(() => ev.map((e) => ({ e, st: isVideo(e) ? syncState(sync, e.id, videoCount) : null })), [ev, sync, videoCount]);

  if (state.status === 'error') return <Shell crumbs={[{ label: 'Evidence' }]}><ErrorState title={state.e.code === 'CASE_NOT_FOUND' ? 'This case does not exist' : 'Could not load the evidence'} description={state.e.message} onRetry={load} /></Shell>;
  if (state.status === 'loading') return <Shell crumbs={[{ label: 'Evidence' }]}><LoadingState rows={4} label="Loading evidence" /></Shell>;

  const cols = [
    { key: 'original_filename', header: 'Source', render: (r) => <span className="inline-flex items-center gap-2"><FileVideo className="h-4 w-4 text-fg-3" aria-hidden /><span className="truncate">{r.e.original_filename}</span></span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge variant="neutral">{r.e.kind}</Badge> },
    { key: 'synthetic', header: 'Data', render: (r) => (r.e.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={r.e.status === 'valid' ? 'success' : r.e.status === 'invalid' ? 'danger' : 'neutral'}>{r.e.status}</Badge> },
    { key: 'sync', header: 'Clock', render: (r) => (r.st ? <Badge variant={r.st.variant}>{r.st.label}</Badge> : <span className="text-fg-3">n/a</span>) },
  ];

  return (
    <Shell crumbs={[{ label: c.title, to: `/reconstruction/${c.id}` }, { label: 'Evidence' }]}>
      <PageHeader title={['Case', 'evidence']} accentIndex={1} description="Every uploaded source with its original hash, validation status, provenance and clock relation."
                  actions={<><DesignationBadge designation={eff.value} /><Button variant="primary" onClick={() => setAdding(true)}>Add evidence</Button></>} />
      <p className="t-small mb-3 text-fg-2"><span className="font-medium text-fg">{c.title}</span> <span className="mono text-fg-3">{c.code}</span></p>
      <CaseBanner designation={c.designation} warning={eff.warning} />

      <ReconstructionReadiness caseId={caseId} revision={state} onBuilt={load} />
      <div id="sources" />
      {ev.length === 0 ? (
        <EmptyState icon={Layers} title="No evidence in this case" description="Upload dashcam or CCTV video, a sensor CSV or a witness statement to begin." action={<Button variant="primary" onClick={() => setAdding(true)}>Add evidence</Button>} />
      ) : (
        <>
          {videoCount > 1 && (sync?.unsynchronized || []).length > 0 && (
            <Alert variant="warning" className="mb-4" title="Some sources are not on one clock">
              Without a recorded clock relation their events are not ordered against each other. Declare a start time under Source details, or record a sync relation, then rebuild the reconstruction.
            </Alert>
          )}
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="t-caption text-fg-3" role="status">{ev.length} source{ev.length === 1 ? '' : 's'} · {videoCount} video</p>
            <Segmented label="Evidence view" value={view} onChange={setViewKeep} options={[{ id: 'grid', label: 'Grid' }, { id: 'table', label: 'Table' }]} />
          </div>
          {view === 'grid' ? (
            <ul className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Sources">
              {sources.map(({ e, st }) => (
                <li key={e.id}>
                  <Card padded={false} className={`h-full p-3 ${selected?.id === e.id ? 'border-accent' : ''}`}>
                    <button type="button" onClick={() => setPick(e.id)} aria-pressed={selected?.id === e.id} className="block w-full space-y-2 text-left">
                      <Thumb e={e} />
                      <span className="t-small block truncate font-medium text-fg">{e.original_filename}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="neutral">{e.kind}</Badge>
                        {e.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>}
                        <Badge variant={e.status === 'valid' ? 'success' : e.status === 'invalid' ? 'danger' : 'neutral'}>{e.status}</Badge>
                        {st && <Badge variant={st.variant}>{st.label}</Badge>}
                      </span>
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card padded={false} className="mb-6 overflow-x-auto"><DataTable caption="Sources" rows={sources} columns={cols} onRowClick={(r) => setPick(r.e.id)} initialSort={null} renderMobileRow={(r) => <button type="button" className="w-full p-4 text-left" onClick={() => setPick(r.e.id)}>{r.e.original_filename}</button>} /></Card>
          )}
          {selected && <Detail key={selected.id} caseId={c.id} sensor={sensors.find((x) => x.evidence_id === selected.id)} e={selected} others={ev.filter((o) => o.id !== selected.id && isVideo(o))} jobs={jobs} sync={sync} videoCount={videoCount} onPreview={setPreview} onSaved={load} />}
        </>
      )}

      <SourceAlignment caseId={caseId} evidence={ev} sync={sync} onChanged={load} />
      <section id="witnesses" aria-label="Witness statements" className="mt-6">
        <SectionHeader title="Witness statements" description="Stored text with extracted claims highlighted. Claims are testimony, not findings." />
        {statements.length === 0 ? <p className="t-small text-fg-3">No witness statement has been added to this case.</p> : <div className="space-y-3">{statements.map(({ s, label }) => <Statement key={s.id} st={s} label={label} evidence={ev} revision={state.jobs} onChanged={load} />)}</div>}
      </section>
      <VehicleMatching caseId={caseId} evidence={ev} revision={state} onChanged={load} />
      <section aria-label="Sensor data" className="mt-6">
        <SectionHeader title="Sensor data" />
        {ev.some((e) => e.kind === 'sensor_csv') ? <p className="t-small text-fg-2">{sensors.length} of {ev.filter((e) => e.kind === 'sensor_csv').length} sensor file(s) have a column mapping. Select a sensor file above to map its columns.</p> : <p className="t-small text-fg-3">No sensor file has been uploaded to this case.</p>}
      </section>
      <p className="t-caption mt-6 text-fg-3">Identical files uploaded twice to one case are stored once and are not counted as separate corroboration. <Link to={`/reconstruction/${c.id}`}>Open the reconstruction</Link></p>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.original_filename || 'Preview'} size="xl">
        {preview && <video key={preview.id} src={api.streamUrl(preview.id)} controls preload="metadata" className="max-h-[60vh] w-full rounded-md bg-black" aria-label={`Preview of ${preview.original_filename}`} />}
      </Modal>
      <Modal open={adding} onClose={() => { setAdding(false); load(); }} title="Add evidence" size="xl" description={`Files are added to ${c.title}.`}>
        <EvidenceUploader caseId={c.id} designation={c.designation} onDone={() => { setAdding(false); load(); }} />
      </Modal>
    </Shell>
  );
}
