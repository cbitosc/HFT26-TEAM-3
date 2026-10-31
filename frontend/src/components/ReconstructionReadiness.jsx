import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button } from '../ui-kit';
import { api } from '../api';

/** One quiet status row. The checklist stays folded until requested. */
export default function ReconstructionReadiness({ caseId, revision, onBuilt, compact = false }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await api.readiness(caseId)); setError(''); } catch (e) { setError(e.message); }
  }, [caseId]);
  useEffect(() => { load(); }, [load, revision]);
  useEffect(() => { const id = setInterval(load, 6000); return () => clearInterval(id); }, [load]);
  const build = async () => {
    setBusy(true); setError('');
    try {
      const s = await api.buildScenario(caseId, { name: 'Updated reconstruction', baseline: true });
      await load(); onBuilt?.(s);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const retry = async (id) => { try { await api.retryJob(id); await load(); } catch (e) { setError(e.message); } };
  if (!data) return error ? <Alert title="Could not check reconstruction readiness" variant="warning">{error}<Button size="sm" onClick={load}>Retry</Button></Alert> : null;
  const pending = data.checks.filter(c => !c.ready).length;
  return <section aria-label="Reconstruction readiness" className="mb-5 rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="t-small font-medium">{data.needs_update ? (data.snapshot_known === false ? 'Refresh reconstruction with current evidence' : 'Evidence changed — update reconstruction') : !data.scenario_id ? 'Prepare your reconstruction' : 'Reconstruction is up to date'}</p>
        <p className="t-caption mt-1 text-fg-3">{pending ? `${pending} setup items need review. Incomplete sources stay separate.` : 'Evidence setup checks passed. Findings still require review.'}</p></div>
      <div className="flex gap-2">{compact && <Button as={Link} to={`/evidence/${caseId}`} variant="ghost" size="sm">Manage evidence</Button>}
        <Button size="sm" variant="primary" disabled={!data.can_build} loading={busy} onClick={build}>{data.scenario_id ? 'Update reconstruction' : 'Build reconstruction'}</Button></div>
    </div>
    <details className="mt-3"><summary className="t-caption cursor-pointer text-accent-text">Review setup</summary>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.checks.map(c => <li key={c.label} className="rounded-lg bg-surface-2 p-3"><div className="flex items-center gap-2"><Badge variant={c.ready ? 'success' : 'warning'}>{c.ready ? 'Ready' : 'Review'}</Badge><span className="t-small">{c.label}</span></div><p className="t-caption mt-1 text-fg-3">{c.detail}</p>{!c.ready && <Link className="t-caption text-accent-text" to={`/evidence/${caseId}#${c.section}`}>Open setup →</Link>}</li>)}</ul>
      {!data.can_build && <p className="t-small mt-3 text-fg-2">Finish processing and extract usable events or witness claims before building.</p>}
      {data.failed_jobs.map(j => <div key={j.id} className="t-small mt-3 flex items-center gap-3"><span>{j.stage.replaceAll('_', ' ')} failed</span><Button size="sm" variant="outline" onClick={() => retry(j.id)}>Retry stage</Button></div>)}
    </details>
    {error && <Alert className="mt-3" title="Could not update reconstruction" variant="danger">{error}</Alert>}
  </section>;
}
