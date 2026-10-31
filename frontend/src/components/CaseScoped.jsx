import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, LoadingState } from '../ui-kit';
import { FilePlus2, FolderOpen } from 'lucide-react';
import Shell from '../layout';
import { api } from '../api';
import { useCaseContext } from '../caseContext';
import DesignationBadge from './DesignationBadge';

const TITLES = { evidence: 'Evidence', reconstruction: 'Reconstruction', reports: 'Reports' };

function PickCase({ section }) {
  const [cases, setCases] = useState(null);
  const select = useCaseContext((s) => s.select);
  useEffect(() => { api.cases().then((r) => setCases(r.items)).catch(() => setCases([])); }, []);
  return (
    <Shell crumbs={[{ label: TITLES[section] }]}>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-semibold">{TITLES[section]}</h1>
        <p className="t-small mb-6 text-fg-2">This section works on one case at a time. Choose the case to continue; the choice is remembered while you move between sections.</p>
        {cases === null ? <LoadingState rows={3} label="Loading cases" /> : cases.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No investigations yet" description="Create an investigation and upload evidence to start." action={<Button as={Link} to="/new" variant="primary" icon={FilePlus2}>Start investigation</Button>} />
        ) : (
          <ul className="space-y-2">
            {cases.map((c) => (
              <li key={c.id}>
                <Card padded={false} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1"><span className="t-small block truncate font-medium text-fg">{c.title}</span><span className="mono t-caption text-fg-3">{c.code}</span></span>
                  <DesignationBadge designation={c.designation} />
                  <Badge variant="neutral">{c.counts?.evidence_total ?? 0} evidence</Badge>
                  <Button as={Link} to={`/${section}/${c.id}`} size="sm" variant="outline" onClick={() => select(c)}>Open</Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

/** Bare section routes (`/evidence`) go to the selected case. With no selection they ask which case to use. */
export default function CaseScoped({ section, children }) {
  const { caseId } = useParams();
  const selected = useCaseContext((s) => s.selected);
  if (caseId) return children;
  if (selected) return <Navigate replace to={`/${section}/${selected.id}`} />;
  return <PickCase section={section} />;
}
