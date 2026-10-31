import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ListChecks, MessageSquareWarning, Printer, SearchX } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '../ui-kit';
import { api } from '../api';
import { sourceName } from './Reconstruction';
import { buildReportBrief } from '../lib/incidentBrief';
import { formatTime } from '../lib/time';

const STRENGTH = { strong: { label: 'Strong cue', variant: 'danger' }, possible: { label: 'Possible', variant: 'warning' }, weak: { label: 'Weak cue', variant: 'neutral' } };

const Block = ({ icon: Icon, title, children, tone = '' }) => (
  <Card as="section" className={`space-y-3 ${tone}`} aria-label={title}>
    <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-fg">{Icon && <Icon size={16} aria-hidden className="text-accent-text" />}{title}</h3>
    {children}
  </Card>
);
const Bullets = ({ items }) => <ul className="space-y-1">{items.map((t, i) => <li key={i} className="t-small text-fg-2">{t}</li>)}</ul>;
const Label = ({ children }) => <p className="t-eyebrow mb-1 text-fg-3">{children}</p>;

function IncidentCard({ i, caseId }) {
  const s = STRENGTH[i.strength];
  return (
    <Card as="article" className="space-y-4 border-l-4 border-l-danger" aria-label={`${i.title}: ${i.summary}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[1.0625rem] font-semibold text-fg">{i.title}</h3>
        <span className="mono t-caption text-fg-3">{formatTime(i.startMs)}</span>
        <Badge variant={s.variant}>{s.label}</Badge>
        <Badge variant="neutral">Not confirmed</Badge>
      </header>
      <p className="text-[0.9375rem] leading-6 text-fg">{i.summary}</p>
      {i.happened.length > 0 && <div><Label>Around that moment</Label><Bullets items={i.happened} /></div>}
      <div><Label>Why it was flagged</Label><Bullets items={i.why} /></div>
      <div><Label>What is uncertain</Label><Bullets items={i.uncertain} /></div>
      <div className="print:hidden"><Button as={Link} to={`/reconstruction/${caseId}`} size="sm" variant="outline">Open in the workspace (video and 3D)</Button></div>
    </Card>
  );
}

/** Loads the stored records of the baseline reconstruction and shows them as a short brief in separate blocks. */
export default function ReportBrief({ c, ev, scenarios }) {
  const [state, setState] = useState({ status: 'loading' });
  const sid = (scenarios.find((s) => s.is_baseline) || scenarios[0])?.id;
  const load = () => {
    if (!sid) return undefined;
    let off = false;
    setState({ status: 'loading' });
    Promise.all([api.incidentEvents(c.id, sid), api.contradictions(c.id, sid), api.corroborations(c.id, sid), api.gaps(c.id, sid)])
      .then(([inc, cons, crbs, gaps]) => { if (!off) setState({ status: 'ready', events: [...(inc.items || []), ...(inc.unplaced || [])], cons: cons.items, crbs: crbs.items, gaps: gaps.items }); })
      .catch((e) => { if (!off) setState({ status: 'error', e }); });
    return () => { off = true; };
  };
  useEffect(load, [c.id, sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const brief = useMemo(() => (state.status === 'ready' ? buildReportBrief({ events: state.events, cons: state.cons, crbs: state.crbs, gaps: state.gaps, evidence: ev, nameOf: (id) => sourceName(ev.find((e) => e.id === id)) }) : null), [state, ev]);

  if (!sid) return <EmptyState icon={SearchX} title="No reconstruction yet" description="The brief is built from a reconstruction. Build one from the workspace or finish processing first." />;
  if (state.status === 'loading') return <LoadingState rows={4} label="Building the brief" />;
  if (state.status === 'error') return <ErrorState title="Could not build the brief" description={state.e.message} onRetry={load} />;

  const { glance, incidents, witnesses, missing, next } = brief;
  return (
    <div className="space-y-4" aria-label="Quick brief">
      <Card as="section" className="space-y-3" aria-label="At a glance">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="t-eyebrow text-accent-text">AT A GLANCE</p>
            <p className="mt-1 text-xl font-semibold leading-snug text-fg">{glance.headline}</p>
            <p className="t-small mt-1 text-fg-3">{glance.caveat}</p>
          </div>
          <Button className="print:hidden" size="sm" variant="outline" icon={Printer} onClick={() => window.print()}>Print this brief</Button>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {glance.stats.map((s) => <div key={s.label} className="rounded-lg border border-line px-3 py-2"><dd className="font-display text-2xl leading-none tabular-nums text-fg">{s.value}</dd><dt className="t-caption mt-1 text-fg-3">{s.label}</dt></div>)}
        </dl>
      </Card>

      {incidents.length === 0 ? (
        <Block icon={CheckCircle2} title="Incidents"><p className="t-small text-fg-2">No possible accident was flagged. Vehicle tracks and events are still available in the workspace.</p></Block>
      ) : (
        <div className={`grid gap-4 ${incidents.length > 1 ? 'lg:grid-cols-2' : ''}`}>{incidents.map((i) => <IncidentCard key={i.id} i={i} caseId={c.id} />)}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Block icon={MessageSquareWarning} title="Witness accounts and the video">
          {witnesses.conflicts.length === 0 && witnesses.agreements.length === 0
            ? <p className="t-small text-fg-3">No witness statement was compared with the video.</p>
            : (
              <>
                {witnesses.conflicts.length > 0 && <div><Label>Where they differ</Label><Bullets items={witnesses.conflicts} /></div>}
                {witnesses.agreements.length > 0 && <div><Label>Where they agree</Label><Bullets items={witnesses.agreements} /></div>}
                <p className="t-caption text-fg-3">A difference does not say which source is wrong.</p>
              </>
            )}
        </Block>
        <Block icon={AlertTriangle} title="What is missing">
          {missing.items.length === 0 ? <p className="t-small text-fg-3">No missing evidence was recorded.</p> : (
            <>
              <ul className="space-y-2">{missing.items.map((m, k) => <li key={k}><p className="t-small font-medium text-fg">{m.title}</p>{m.action && <p className="t-caption text-fg-3">{m.action}</p>}</li>)}</ul>
              {missing.more > 0 && <p className="t-caption text-fg-3">+ {missing.more} more in the workspace findings.</p>}
            </>
          )}
        </Block>
      </div>

      <Block icon={ListChecks} title="Next steps"><ol className="list-decimal space-y-1 pl-5">{next.map((t, k) => <li key={k} className="t-small text-fg-2">{t}</li>)}</ol></Block>
      <Alert variant="info" title="About this brief" className="print:hidden">It is written from the stored reconstruction and states no cause or fault. The validated, citable report is under "Full report".</Alert>
    </div>
  );
}
