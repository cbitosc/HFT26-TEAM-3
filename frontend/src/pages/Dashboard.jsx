import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActivityTimeline, Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, PageHeader, ProgressBar, Select, SectionHeader, Skeleton, StatCard, StatGroup, StatusBadge, timeAgo } from '../ui-kit';
import { Activity, AlertTriangle, CheckCircle2, FileVideo, FilePlus2, FolderOpen, Layers, ListChecks, Upload } from 'lucide-react';
import Shell from '../layout';
import DesignationBadge from '../components/DesignationBadge';
import { api } from '../api';

const STAGE = { validate: 'Validate file', preprocess: 'Index frames', detect: 'Detect objects', track: 'Track and find events', extract_claims: 'Read statements', extract_interval: 'Re-process interval' };
const ACTIVE = ['pending', 'validating', 'processing'];
const JOB_BADGE = { pending: 'queued', validating: 'processing', processing: 'processing', completed: 'completed', failed: 'failed', partially_completed: 'processing' };

/** Dashboard. Everything shown comes from the API; the activity feed is derived from real job and evidence timestamps
 *  (there is no audit endpoint yet; see FRONTEND_INTEGRATION_HANDOFF.md). */
export default function Dashboard() {
  const nav = useNavigate();
  const [state, setState] = useState({ status: 'loading' });
  const [quick, setQuick] = useState({ title: '', designation: 'real' });

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([api.dashboard(), api.cases()]);
        const cases = c.items;
        const [jobsR, findR] = await Promise.all([
          Promise.allSettled(cases.slice(0, 12).map((x) => api.jobs(x.id).then((r) => r.items.map((j) => ({ ...j, case: x }))))),
          Promise.allSettled(cases.filter((x) => x.counts?.findings_unreviewed > 0).slice(0, 4).map((x) => api.findings(x.id).then((r) => r.items.filter((f) => f.review_status === 'unreviewed').slice(0, 3).map((f) => ({ ...f, case: x }))))),
        ]);
        const jobs = jobsR.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
        const findings = findR.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
        setState({ status: 'ready', d, cases, jobs, findings });
      } catch (e) { setState({ status: 'error', message: e.message }); }
    })();
  }, []);

  const view = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { cases, jobs, d } = state;
    const active = jobs.filter((j) => ACTIVE.includes(j.status));
    const activity = [
      ...jobs.filter((j) => j.finished_at).map((j) => ({ id: `j-${j.id}`, icon: j.status === 'failed' ? AlertTriangle : CheckCircle2, title: `${STAGE[j.stage] || j.stage} ${j.status.replace('_', ' ')}`, detail: j.case.title, time: j.finished_at })),
      ...d.recent_evidence.map((e) => ({ id: `e-${e.id}`, icon: Upload, title: `${e.kind} uploaded`, detail: `${e.original_filename}${e.synthetic ? ' · synthetic' : ''}`, time: e.uploaded_at })),
    ].sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 8);
    const investigating = cases.filter((c) => c.status !== 'closed').length;
    return { active, activity, investigating };
  }, [state]);

  if (state.status === 'error') return <Shell crumbs={[{ label: 'Dashboard' }]}><ErrorState title="The API did not answer" description={`${state.message}. Start it with ./run.sh or: uvicorn app.main:app --port 8000`} onRetry={() => location.reload()} /></Shell>;
  const loading = state.status === 'loading';
  const { d, cases = [], findings = [] } = state;
  const caseCols = [
    { key: 'title', header: 'Investigation', render: (c) => <span className="font-medium text-fg">{c.title}<span className="mono t-caption ml-2 text-fg-3">{c.code}</span></span> },
    { key: 'designation', header: 'Data', render: (c) => <DesignationBadge designation={c.designation} /> },
    { key: 'evidence', header: 'Evidence', align: 'right', sortValue: (c) => c.counts?.evidence_total ?? 0, render: (c) => c.counts?.evidence_total ?? 0 },
    { key: 'review', header: 'To review', align: 'right', sortValue: (c) => c.counts?.findings_unreviewed ?? 0, render: (c) => (c.counts?.findings_unreviewed ? <Badge variant="warning">{c.counts.findings_unreviewed}</Badge> : <span className="text-fg-3">0</span>) },
    { key: 'created_at', header: 'Created', render: (c) => <span className="text-fg-3">{timeAgo(c.created_at)}</span> },
  ];
  const evCols = [
    { key: 'original_filename', header: 'File', render: (e) => <span className="inline-flex items-center gap-2"><FileVideo className="h-4 w-4 text-fg-3" aria-hidden /><span className="truncate">{e.original_filename}</span></span> },
    { key: 'kind', header: 'Kind', render: (e) => <Badge variant="neutral">{e.kind}</Badge> },
    { key: 'synthetic', header: 'Data', render: (e) => (e.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>) },
    { key: 'status', header: 'Status', render: (e) => <Badge variant={e.status === 'valid' ? 'success' : e.status === 'invalid' ? 'danger' : 'neutral'}>{e.status}</Badge> },
  ];

  return (
    <Shell crumbs={[{ label: 'Dashboard' }]}>
      <PageHeader title="Investigation overview" accentIndex={1} description="Cases, evidence processing and findings that need an investigator's decision."
                  actions={<Button as={Link} to="/new" variant="primary" icon={FilePlus2}>New investigation</Button>} />
      <Alert variant="info" className="mb-6" title="Investigation support only">TraceLine organises evidence and shows where sources agree or conflict. It does not determine fault or legal responsibility.</Alert>

      <StatGroup className="mb-10 lg:grid-cols-5">
        {loading ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-36 w-full" />) : <>
          <StatCard label="Total cases" value={d.cases.total} icon={FolderOpen} hint={`${cases.filter((c) => c.designation === 'real').length} real · ${cases.filter((c) => c.designation === 'synthetic').length} synthetic`} />
          <StatCard label="Active investigations" value={view.investigating} icon={Activity} hint="not closed" />
          <StatCard label="Evidence assets" value={d.evidence.total} icon={Layers} hint={d.evidence.invalid ? `${d.evidence.invalid} failed validation` : 'all validated'} />
          <StatCard label="Processing jobs" value={d.jobs.in_progress} icon={ListChecks} hint={`${d.jobs.by_status.completed ?? 0} completed · ${d.jobs.by_status.failed ?? 0} failed`} />
          <StatCard label="Findings to review" value={d.findings_needing_review} icon={AlertTriangle} hint="unreviewed" tone={d.findings_needing_review ? 'warning' : undefined} />
        </>}
      </StatGroup>

      <div className="tl-dashboard-grid">
        <div className="min-w-0 space-y-6">
          <section aria-label="Recent investigations">
            <SectionHeader title="Recent investigations" description="Real and synthetic cases are kept separate and always labelled." />
            <Card padded={false}>
              <DataTable caption="Investigations" loading={loading} rows={cases} columns={caseCols} onRowClick={(c) => nav(`/reconstruction/${c.id}`)} initialSort={null}
                         renderMobileRow={(c) => (
                           <Link to={`/reconstruction/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:no-underline">
                             <span className="min-w-0"><span className="block truncate text-fg">{c.title}</span><span className="t-caption text-fg-3">{c.code} · {c.counts?.evidence_total ?? 0} evidence</span></span>
                             <DesignationBadge designation={c.designation} />
                           </Link>)}
                         empty={<EmptyState icon={FolderOpen} title="No investigations yet" description="Upload dashcam or CCTV video to start one." action={<Button as={Link} to="/new" variant="primary">New investigation</Button>} />} />
            </Card>
          </section>
          <section aria-label="Findings needing review">
            <SectionHeader title="Findings needing review" description="Prompts for judgment. Nothing here is a conclusion." />
            <Card padded={false}>
              {loading ? <div className="p-4"><Skeleton className="h-16 w-full" /></div> : findings.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing waiting for review" description="New contradictions, gaps and open questions appear here." />
              ) : (
                <ul className="divide-y divide-line">
                  {findings.map((f) => (
                    <li key={f.id}>
                      <Link to={`/reconstruction/${f.case.id}`} className="flex items-start gap-3 p-4 hover:bg-surface-2 hover:no-underline">
                        <Badge variant={f.kind === 'contradiction' ? 'danger' : f.kind === 'gap' ? 'warning' : 'info'}>{f.kind.replace('_', ' ')}</Badge>
                        <span className="min-w-0 flex-1"><span className="t-small line-clamp-2 text-fg">{f.text}</span><span className="t-caption mt-0.5 block text-fg-3">{f.case.title}</span></span>
                        <DesignationBadge designation={f.case.designation} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <section aria-label="Recent evidence">
            <SectionHeader title="Recent evidence" />
            <Card padded={false} className="overflow-x-auto">
              <DataTable caption="Recent evidence" loading={loading} rows={d?.recent_evidence ?? []} columns={evCols} renderMobileRow={(e) => (<div className="flex items-center justify-between gap-3 p-4"><span className="min-w-0"><span className="block truncate text-fg">{e.original_filename}</span><span className="t-caption text-fg-3">{e.kind} · {e.status}</span></span>{e.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>}</div>)} empty={<EmptyState icon={FileVideo} title="No evidence uploaded" description="Uploaded files appear here with their validation status." />} />
            </Card>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section aria-label="Processing queue">
            <SectionHeader title="Processing queue" />
            <Card>
              {loading ? <Skeleton className="h-16 w-full" /> : view.active.length === 0 ? (
                <p className="t-small text-fg-3">The queue is empty. Uploaded video is processed automatically.</p>
              ) : (
                <ul className="space-y-4">
                  {view.active.map((j) => (
                    <li key={j.id}>
                      <div className="mb-1 flex items-center justify-between gap-2"><span className="t-small text-fg">{STAGE[j.stage] || j.stage}</span><StatusBadge status={JOB_BADGE[j.status]} /></div>
                      <ProgressBar value={j.progress ?? 0} ariaLabel={`${STAGE[j.stage] || j.stage} progress`} showValue size="sm" />
                      <p className="t-caption mt-1 text-fg-3">{j.case.title}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <section aria-label="Latest activity">
            <SectionHeader title="Latest activity" description="From job and upload timestamps." />
            <Card>{loading ? <Skeleton className="h-24 w-full" /> : view.activity.length ? <ActivityTimeline items={view.activity} /> : <p className="t-small text-fg-3">No activity yet.</p>}</Card>
          </section>
          <section aria-label="Quick create">
            <SectionHeader title="Quick create" />
            <Card as="form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); nav(`/new?title=${encodeURIComponent(quick.title)}&designation=${quick.designation}`); }}>
              <Field label="Case title"><Input value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} placeholder="e.g. Junction 14 collision" /></Field>
              <Field label="Footage"><Select value={quick.designation} onChange={(e) => setQuick({ ...quick, designation: e.target.value })} options={[{ value: 'real', label: 'Real incident footage' }, { value: 'staged', label: 'Staged / recreated' }, { value: 'synthetic', label: 'Synthetic / generated' }]} /></Field>
              <Button type="submit" variant="primary" block icon={FilePlus2}>Continue to upload</Button>
            </Card>
          </section>
        </div>
      </div>
    </Shell>
  );
}
