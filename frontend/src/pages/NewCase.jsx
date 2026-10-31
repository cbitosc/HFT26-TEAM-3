import { jobErrorMessage } from '../lib/jobs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Shell from '../layout';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, LoadingState, Select, Textarea } from '../ui-kit';
import { Check } from 'lucide-react';
import { api } from '../api';
import { useCaseContext } from '../caseContext';
import CaseBanner from '../components/CaseBanner';
import EvidenceUploader from '../components/EvidenceUploader';
import JobStages from '../components/JobStages';
import { ACTIVE, STAGE_LABEL } from '../lib/jobs';
import { browserOffset, toIncidentAt } from '../lib/incident';

const STEPS = ['Investigation', 'Evidence', 'Processing'];
const REF = /^[A-Za-z0-9_-]{3,40}$/;

function Stepper({ step }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Guided flow">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[0.8125rem] ${i === step ? 'border-accent bg-accent/10 text-accent-text' : 'border-line text-fg-3'}`}>
          {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="mono">{i + 1}</span>}{s}
        </li>
      ))}
    </ol>
  );
}

/** Step 1. Creates the case. Incident time (with the time zone offset you choose) and location are stored by the backend. */
function Details({ initial, onCreated }) {
  const [f, setF] = useState({ title: initial.title, designation: initial.designation, incident_at: '', location: '', description: '', reference: '', allow_external_inference: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const refErr = f.reference && !REF.test(f.reference) ? 'Use 3 to 40 letters, digits, dash or underscore.' : undefined;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { title: f.title.trim(), designation: f.designation };
      if (f.allow_external_inference) body.allow_external_inference = true;
      if (f.description.trim()) body.description = f.description.trim();
      if (f.reference) body.code = f.reference;
      if (f.incident_at) body.incident_at = toIncidentAt(f.incident_at, browserOffset(f.incident_at));
      if (f.location.trim()) body.location_text = f.location.trim();
      const c = await api.createCase(body);
      onCreated(c);
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <Card as="form" onSubmit={submit} className="space-y-4" aria-label="Create investigation">
      <Field label="Case title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={busy} /></Field>
      <Field label="What is this footage?" hint="Use a mixed demo when combining recorded footage with simulated records.">
        <Select value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} disabled={busy}
                options={[{ value: 'real', label: 'Real incident footage' }, { value: 'staged', label: 'Staged / recreated' }, { value: 'synthetic', label: 'Synthetic / generated' }, { value: 'mixed', label: 'Mixed demo · recorded footage + simulated records' }]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Incident date and time" optional hint="The time you state. It is not read from any file and is not used to pick frames."><Input type="datetime-local" value={f.incident_at} onChange={(e) => setF({ ...f, incident_at: e.target.value })} disabled={busy} /></Field>
        <Field label="Location" optional hint="Free text. No map is drawn and no coordinates are looked up."><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} disabled={busy} /></Field>
      </div>
      <Field label="Description" optional><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={busy} /></Field>
      <Field label="Reference" optional error={refErr} hint="Used as the case code if given, for example your report number."><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} disabled={busy} /></Field>
      <Checkbox label="Allow selected accident frames and evidence text to be sent to Featherless AI" checked={f.allow_external_inference} onChange={(e) => setF({ ...f, allow_external_inference: e.target.checked })} disabled={busy} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={busy} disabled={!f.title.trim() || !!refErr}>Create investigation</Button>
        {f.designation === 'synthetic' && <Badge variant="warning">will be labelled synthetic</Badge>}
      </div>
      {err && <Alert variant="danger" title="Could not create the case">{err}</Alert>}
    </Card>
  );
}

/** Step 3. Polls the real job list. Stages appear only when the backend has queued them. */
function Processing({ c }) {
  const nav = useNavigate();
  const [jobs, setJobs] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [phase, setPhase] = useState('running');
  const [err, setErr] = useState(null);
  const built = useRef(false);

  useEffect(() => {
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const [j, ev] = await Promise.all([api.jobs(c.id), api.evidence(c.id)]);
        if (stop) return;
        setJobs(j.items); setEvidence(ev.items);
        const failed = j.items.find((x) => x.status === 'failed');
        const active = j.items.some((x) => ACTIVE.includes(x.status));
        const hasVideo = ev.items.some((e) => e.kind === 'cctv' || e.kind === 'dashcam');
        const tracked = j.items.some((x) => x.stage === 'track' && x.status === 'completed');
        if (failed) { setErr(`${STAGE_LABEL[failed.stage] || failed.stage} failed: ${jobErrorMessage(failed.error)}`); setPhase('failed'); return; }
        if (!active && j.items.length && (tracked || !hasVideo)) { setPhase('ready'); return; }
      } catch (x) { if (!stop) { setErr(x.message); setPhase('failed'); } return; }
      timer = setTimeout(tick, 1500);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [c.id]);

  const build = useCallback(async () => {
    if (built.current) return;
    built.current = true;
    setPhase('building');
    try {
      const ready = await api.readiness(c.id);
      if (!ready.can_build || ready.checks.some(check => !check.ready)) { nav(`/evidence/${c.id}`); return; }
      const scenario = await api.buildScenario(c.id, { name: 'Baseline' });
      nav(scenario.build?.events ? `/reconstruction/${c.id}` : `/evidence/${c.id}`);
    } catch (x) { built.current = false; setErr(x.message); setPhase('failed'); }
  }, [c.id, nav]);
  useEffect(() => { if (phase === 'ready') build(); }, [phase, build]);

  const retry = async (job) => { setErr(null); setPhase('running'); try { await api.retryJob(job.id); } catch (x) { setErr(x.message); setPhase('failed'); } };
  const failedJob = (jobs || []).find((j) => j.status === 'failed');

  if (!jobs) return <LoadingState rows={3} label="Reading processing jobs" />;
  return (
    <div className="space-y-4" aria-label="Processing">
      <p className="t-small text-fg-2" role="status">
        {phase === 'building' ? 'Building the reconstruction. The backend reports no progress for this one request.' : phase === 'failed' ? 'Processing stopped.' : 'Processing runs on this machine. Each stage appears when the backend queues it.'}
      </p>
      {evidence.length === 0 ? <p className="t-small text-fg-3">No evidence has been uploaded to this case.</p> : evidence.map((e) => (
        <Card key={e.id} className="space-y-3">
          <div className="flex items-center gap-2"><span className="t-small min-w-0 flex-1 truncate font-medium">{e.original_filename}</span><Badge variant="neutral">{e.kind}</Badge></div>
          <JobStages jobs={jobs} evidenceId={e.id} empty="No stage has been queued for this file yet." />
        </Card>
      ))}
      {jobs.some((j) => !j.evidence_id) && <Card><p className="t-eyebrow mb-2 text-fg-3">Case-level</p><JobStages jobs={jobs.filter((j) => !j.evidence_id)} /></Card>}
      {err && <Alert variant="danger" title="Something went wrong">{err}</Alert>}
      {phase === 'failed' && (
        <div className="flex gap-2">
          {failedJob && <Button variant="outline" onClick={() => retry(failedJob)}>Retry the failed stage</Button>}
          <Button as={Link} to={`/evidence/${c.id}`} variant="ghost">Open the evidence page</Button>
        </div>
      )}
    </div>
  );
}

/** Guided flow: create the investigation, add evidence with source details, watch real processing, open the reconstruction. `?case=` resumes a case. */
export default function NewCase() {
  const [params, setParams] = useSearchParams();
  const select = useCaseContext((s) => s.select);
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(!!params.get('case'));
  const [step, setStep] = useState(params.get('case') ? 1 : 0);
  const [err, setErr] = useState(null);
  const [dups, setDups] = useState([]);
  const initial = { title: params.get('title') || '', designation: ['real', 'staged', 'synthetic', 'mixed'].includes(params.get('designation')) ? params.get('designation') : 'real' };

  useEffect(() => {
    const id = params.get('case');
    if (!id) return;
    api.case(id).then((x) => { setC(x); select(x); setLoading(false); }).catch((x) => { setErr(x.message); setLoading(false); setStep(0); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const created = (x) => { setC(x); select(x); setStep(1); setParams({ case: x.id }, { replace: true }); };

  return (
    <Shell crumbs={[{ label: 'New investigation' }]}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-semibold">New investigation</h1>
        <p className="t-small mb-4 text-fg-2">Describe the case, add the evidence you have, then watch it being processed. Detection runs on your machine; nothing is sent elsewhere.</p>
        <Stepper step={step} />
        {c && <CaseBanner designation={c.designation} />}
        {err && <Alert variant="danger" className="mb-4" title="Could not resume this case">{err}</Alert>}
        {loading ? <LoadingState rows={3} label="Loading the case" /> : step === 0 ? <Details initial={initial} onCreated={created} /> : step === 1 ? (
          <div className="space-y-4">
            <Card><p className="t-small"><span className="font-medium">{c.title}</span> <span className="mono t-caption text-fg-3">{c.code}</span></p></Card>
            <Card><EvidenceUploader caseId={c.id} designation={c.designation} submitLabel="Upload and analyse" onDone={({ uploaded }) => { setDups(uploaded.filter((u) => u.duplicate).map((u) => u.evidence.original_filename || u.evidence.id)); setStep(2); }} /></Card>
            {(c.counts?.evidence_total ?? 0) > 0 && <Button variant="outline" onClick={() => setStep(2)}>Continue to processing</Button>}
          </div>
        ) : (<>{dups.length > 0 && <Alert variant="info" className="mb-4" title="Already in this case">{dups.join(', ')} {dups.length === 1 ? 'was' : 'were'} already in this case and was not added again. Identical files are not counted as separate corroboration.</Alert>}<Processing c={c} /></>)}
        <p className="t-caption mt-4 text-fg-3">A single video is its own clock. With several videos, state each start time and its uncertainty, or record how their clocks relate, before they are compared.</p>
      </div>
    </Shell>
  );
}
