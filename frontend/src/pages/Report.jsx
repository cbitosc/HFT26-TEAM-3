import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SectionHeader, Segmented } from '../ui-kit';
import { Check, FileText, X } from 'lucide-react';
import Shell from '../layout';
import CaseBanner from '../components/CaseBanner';
import DesignationBadge from '../components/DesignationBadge';
import { api } from '../api';
import { useCaseContext } from '../caseContext';
import { effectiveDesignation } from '../lib/overview';

/** The backend has two report formats. "Executive" is its `investigator` format (four sections). "Technical" is its `full` export (sixteen sections). */
export const KINDS = {
  executive: { format: 'investigator', label: 'Executive', detail: 'Investigator format: executive summary, key timeline, findings and evidence appendix.' },
  technical: { format: 'full', label: 'Technical', detail: 'Full export: sixteen sections including every stored event, methods and models.' },
};
/** The list endpoint carries `format` (`executive` | `full`). No report detail is read to find it. */
export const kindOf = (row) => (row?.format === 'executive' ? 'executive' : 'technical');

export default function ReportPage() {
  const { caseId } = useParams();
  const select = useCaseContext((s) => s.select);
  const [state, setState] = useState({ status: 'loading' });
  const [kind, setKind] = useState('executive');
  const [openId, setOpenId] = useState(null);
  const [md, setMd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, list, ev, sc] = await Promise.all([api.case(caseId), api.reports(caseId), api.evidence(caseId), api.scenarios(caseId).catch(() => ({ items: [] }))]);
      select(c);
      const rows = list.items.map((r) => ({ ...r, kind: kindOf(r), known: r.format === 'executive' || r.format === 'full' }));
      setState({ status: 'ready', c, ev: ev.items, rows, scenarios: sc.items });
    } catch (e) { setState({ status: 'error', e }); }
  }, [caseId, select]);
  useEffect(() => { load(); }, [load]);

  const rows = state.rows || [];
  const latest = useMemo(() => rows.find((r) => r.kind === kind && r.known), [rows, kind]);
  const shown = rows.find((r) => r.id === openId) || latest || null;

  useEffect(() => {
    if (!shown) { setMd(''); return undefined; }
    let off = false;
    api.reportMd(shown.id).then((t) => { if (!off) setMd(t); }).catch((e) => { if (!off) setMd(''); setErr(e.message); });
    return () => { off = true; };
  }, [shown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const make = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.report(caseId, null, KINDS[kind].format); setOpenId(r.id); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (state.status === 'error') return <Shell crumbs={[{ label: 'Reports' }]}><ErrorState title={state.e.code === 'CASE_NOT_FOUND' ? 'This case does not exist' : 'Could not load reports'} description={state.e.message} onRetry={load} /></Shell>;
  if (state.status === 'loading') return <Shell crumbs={[{ label: 'Reports' }]}><LoadingState rows={4} label="Loading reports" /></Shell>;

  const { c, ev, scenarios } = state;
  const eff = effectiveDesignation(c.designation, ev);
  const noRecon = scenarios.length === 0;
  const shownLabel = shown ? (shown.known ? KINDS[shown.kind].label : 'Report') : KINDS[kind].label;

  return (
    <Shell crumbs={[{ label: c.title, to: `/reconstruction/${c.id}` }, { label: 'Reports' }]}>
      <PageHeader title={['Investigation', 'reports']} accentIndex={1} description="Reports are built from the stored reconstruction and checked before they are offered as final. They do not determine fault."
                  actions={<DesignationBadge designation={eff.value} />} />
      <p className="t-small mb-3 text-fg-2"><span className="font-medium text-fg">{c.title}</span> <span className="mono text-fg-3">{c.code}</span></p>
      <CaseBanner designation={c.designation} warning={eff.warning} />

      <Card className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Report type" value={kind} onChange={(k) => { setKind(k); setOpenId(null); }} options={Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label }))} />
          <Button className="ml-auto" variant="primary" icon={FileText} loading={busy} disabled={noRecon} onClick={make}>{busy ? 'Building…' : `Generate ${KINDS[kind].label.toLowerCase()} report`}</Button>
        </div>
        <p className="t-caption text-fg-3">{KINDS[kind].detail} The AI narrative from the workspace is not copied into reports.</p>
        {noRecon && <Alert variant="warning" title="No reconstruction yet">A report is built from a reconstruction scenario. Build one from the workspace or finish processing first.</Alert>}
        {err && <Alert variant="danger" title="Could not build the report">{err}</Alert>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Report preview" className="min-w-0">
          <SectionHeader title={`${shownLabel} preview`} />
          {!shown ? (
            <EmptyState icon={FileText} title={`No ${KINDS[kind].label.toLowerCase()} report yet`} description={noRecon ? 'Build a reconstruction first.' : 'Generate one to preview it here.'} />
          ) : (
            <>
              <Card as="section" padded={false} className="mb-4 p-4" aria-label="Validation">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={shown.validation.passed ? 'success' : 'danger'}>{shown.validation.passed ? 'Passed validation' : 'Failed validation'}</Badge>
                  <Badge variant="neutral">{shownLabel}</Badge>
                  <span className="t-caption text-fg-3">version {shown.version}</span>
                  <span className="ml-auto flex gap-2">
                    {shown.has_pdf ? <Button as="a" size="sm" variant="outline" href={api.pdfUrl(shown.id)}>Download PDF</Button> : <span className="t-caption text-fg-3" title="The backend produces a PDF only for reports that pass validation">PDF unavailable</span>}
                    <Button as="a" size="sm" variant="outline" href={`/api/v1/reports/${shown.id}/markdown`}>Markdown</Button>
                  </span>
                </div>
                <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                  {shown.validation.checks.map((k) => (
                    <li key={k.check} className="t-small flex items-start gap-2 text-fg-2">
                      {k.passed ? <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden /> : <X className="mt-0.5 h-4 w-4 text-danger" aria-hidden />}{k.check}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card as="pre" className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-[0.8125rem] leading-6 text-fg-2" style={{ fontFamily: 'inherit' }}>{md || 'Loading the report text…'}</Card>
            </>
          )}
        </section>
        <aside aria-label="Report history" className="min-w-0">
          <SectionHeader title="History" description="Newest first. Reports are never edited; a new one is a new version." />
          {rows.length === 0 ? <p className="t-small text-fg-3">No report has been generated for this case.</p> : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { setOpenId(r.id); setKind(r.kind); }} aria-pressed={shown?.id === r.id}
                          className={`w-full rounded-lg border p-3 text-left transition hover:bg-surface-2 ${shown?.id === r.id ? 'border-accent bg-accent/5' : 'border-line'}`}>
                    <span className="flex items-center gap-2"><span className="t-small font-medium">Version {r.version}</span>{r.known ? <Badge variant="neutral">{KINDS[r.kind].label}</Badge> : <Badge variant="neutral">type not stated</Badge>}</span>
                    <span className="t-caption mt-1 block text-fg-3">{new Date(r.created_at).toLocaleString()}</span>
                    <span className="t-caption mt-1 flex gap-2"><span className={r.validation.passed ? 'text-success' : 'text-danger'}>{r.validation.passed ? 'valid' : 'failed'}</span><span className="text-fg-3">{r.has_pdf ? 'PDF available' : 'no PDF'}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="t-caption mt-3 text-fg-3"><Link to={`/reconstruction/${c.id}`}>Back to the workspace</Link></p>
        </aside>
      </div>
    </Shell>
  );
}
