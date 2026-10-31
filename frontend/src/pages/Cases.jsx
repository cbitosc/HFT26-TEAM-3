import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Segmented, Select, Textarea, useToast } from '../ui-kit';
import { FilePlus2, FolderOpen, Pencil } from 'lucide-react';
import Shell from '../layout';
import DesignationBadge from '../components/DesignationBadge';
import { api } from '../api';
import { useCaseContext } from '../caseContext';
import { SORTS, filterCases } from '../lib/cases';
import { browserOffset, splitIncidentAt, toIncidentAt } from '../lib/incident';

const STATUS = ['open', 'processing', 'review', 'closed'];
const DESIGNATION = ['real', 'staged', 'synthetic', 'mixed'];
const VIEW_KEY = 'traceline.casesView';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'table'; } catch { return 'table'; } };

function EditCase({ c, onClose, onSaved }) {
  const toast = useToast();
  const inc = splitIncidentAt(c.incident_at);
  const [f, setF] = useState({ title: c.title, description: c.description || '', status: c.status, incident_at: inc.local, location: c.location_text || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { title: f.title, status: f.status };
      if (f.description !== (c.description || '')) body.description = f.description;
      if (f.incident_at !== inc.local) body.incident_at = toIncidentAt(f.incident_at, browserOffset(f.incident_at));  // unchanged time keeps its stored offset
      if (f.location.trim() !== (c.location_text || '')) body.location_text = f.location.trim() || null;
      const next = await api.patchCase(c.id, body);
      toast({ title: 'Case updated', type: 'success' });
      onSaved(next);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Edit case details" description="Designation (real or synthetic) cannot be changed after creation."
           footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="edit-case" loading={busy} disabled={!f.title.trim()}>Save</Button></>}>
      <form id="edit-case" onSubmit={save} className="space-y-4">
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <Field label="Description" optional><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={STATUS.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Incident date and time" optional hint="Cleared by emptying the field."><Input type="datetime-local" value={f.incident_at} onChange={(e) => setF({ ...f, incident_at: e.target.value })} /></Field>
        <Field label="Location" optional><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <p className="t-caption text-fg-3">The reference (case code) is set when the case is created and cannot be edited here.</p>
        {err && <Alert variant="danger" title="Could not save">{err}</Alert>}
      </form>
    </Modal>
  );
}

function CaseActions({ c, onEdit }) {
  const select = useCaseContext((s) => s.select);
  return (
    <span className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button as={Link} to={`/reconstruction/${c.id}`} size="sm" variant="primary" onClick={() => select(c)}>Open</Button>
      <Button as={Link} to={`/evidence/${c.id}`} size="sm" variant="outline" onClick={() => select(c)}>Evidence</Button>
      <Button as={Link} to={`/reports/${c.id}`} size="sm" variant="outline" onClick={() => select(c)}>Reports</Button>
      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(c)} aria-label={`Edit ${c.title}`}>Edit</Button>
    </span>
  );
}

export default function Cases() {
  const nav = useNavigate();
  const select = useCaseContext((s) => s.select);
  const selected = useCaseContext((s) => s.selected);
  const [cases, setCases] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [designation, setDesignation] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState(readView);
  const [editing, setEditing] = useState(null);

  const load = () => api.cases().then((r) => { setCases(r.items); setErr(null); }).catch((e) => setErr(e));
  useEffect(() => { load(); }, []);
  const setViewKeep = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ } };
  const rows = useMemo(() => (cases ? filterCases(cases, { q, designation, status, sort }) : []), [cases, q, designation, status, sort]);
  const open = (c) => { select(c); nav(`/reconstruction/${c.id}`); };

  if (err) return <Shell crumbs={[{ label: 'Cases' }]}><ErrorState title="The API did not answer" description={err.message} onRetry={load} /></Shell>;

  const columns = [
    { key: 'title', header: 'Case', sortValue: (c) => c.title, render: (c) => <span className="font-medium text-fg">{c.title}<span className="mono t-caption ml-2 text-fg-3">{c.code}</span>{selected?.id === c.id && <Badge variant="info" className="ml-2">selected</Badge>}</span> },
    { key: 'designation', header: 'Data', render: (c) => <DesignationBadge designation={c.designation} /> },
    { key: 'status', header: 'Status', render: (c) => <Badge variant="neutral">{c.status}</Badge> },
    { key: 'evidence', header: 'Evidence', align: 'right', sortValue: (c) => c.counts?.evidence_total ?? 0, render: (c) => c.counts?.evidence_total ?? 0 },
    { key: 'review', header: 'To review', align: 'right', sortValue: (c) => c.counts?.findings_unreviewed ?? 0, render: (c) => (c.counts?.findings_unreviewed ? <Badge variant="warning">{c.counts.findings_unreviewed}</Badge> : <span className="text-fg-3">0</span>) },
    { key: 'created_at', header: 'Created', sortValue: (c) => c.created_at, render: (c) => <span className="text-fg-3">{new Date(c.created_at).toLocaleString()}</span> },
    { key: 'actions', header: '', render: (c) => <CaseActions c={c} onEdit={setEditing} /> },
  ];

  return (
    <Shell crumbs={[{ label: 'Cases' }]}>
      <PageHeader title={['Investigation', 'cases']} accentIndex={1} description="Every case, with its real or synthetic designation. Search, filter and sort change only what is listed."
                  actions={<Button as={Link} to="/new" variant="primary" icon={FilePlus2}>New investigation</Button>} />
      <Card className="mb-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
          <Field label="Search"><Input type="search" placeholder="Title, code or description" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Data"><Select value={designation} onChange={(e) => setDesignation(e.target.value)} options={[{ value: 'all', label: 'All data' }, ...DESIGNATION.map((d) => ({ value: d, label: d }))]} /></Field>
          <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'all', label: 'Any status' }, ...STATUS.map((d) => ({ value: d, label: d }))]} /></Field>
          <Field label="Sort"><Select value={sort} onChange={(e) => setSort(e.target.value)} options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} /></Field>
          <Field label="View">
            <Segmented label="Case view" value={view} onChange={setViewKeep} options={[{ id: 'table', label: 'Table' }, { id: 'grid', label: 'Grid' }]} />
          </Field>
        </div>
        <p className="t-caption text-fg-3" role="status">{cases ? `${rows.length} of ${cases.length} cases` : 'Loading…'}</p>
      </Card>

      {cases === null ? <LoadingState rows={4} label="Loading cases" /> : rows.length === 0 ? (
        <EmptyState icon={FolderOpen} title={cases.length ? 'No case matches these filters' : 'No investigations yet'}
                    description={cases.length ? 'Clear the search or filters to see every case.' : 'Create an investigation and upload evidence to start.'}
                    action={cases.length ? <Button variant="outline" onClick={() => { setQ(''); setDesignation('all'); setStatus('all'); }}>Clear filters</Button> : <Button as={Link} to="/new" variant="primary">Start investigation</Button>} />
      ) : view === 'table' ? (
        <Card padded={false} className="overflow-x-auto">
          <DataTable caption="Cases" rows={rows} columns={columns} onRowClick={open} initialSort={null}
                     renderMobileRow={(c) => (<div className="space-y-2 p-4"><div className="flex items-center justify-between gap-3"><span className="t-small truncate font-medium text-fg">{c.title}</span><DesignationBadge designation={c.designation} /></div><CaseActions c={c} onEdit={setEditing} /></div>)} />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Cases">
          {rows.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium text-fg">{c.title}</p><p className="mono t-caption text-fg-3">{c.code}</p></div><DesignationBadge designation={c.designation} /></div>
                {c.description ? <p className="t-small line-clamp-3 text-fg-2">{c.description}</p> : <p className="t-small text-fg-3">No description.</p>}
                <dl className="t-caption grid grid-cols-3 gap-2 text-fg-3">
                  <div><dt>Status</dt><dd className="text-fg-2">{c.status}</dd></div>
                  <div><dt>Evidence</dt><dd className="text-fg-2">{c.counts?.evidence_total ?? 0}</dd></div>
                  <div><dt>To review</dt><dd className="text-fg-2">{c.counts?.findings_unreviewed ?? 0}</dd></div>
                </dl>
                <div className="mt-auto"><CaseActions c={c} onEdit={setEditing} /></div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <EditCase c={editing} onClose={() => setEditing(null)} onSaved={(next) => { setEditing(null); setCases((l) => l.map((x) => (x.id === next.id ? next : x))); if (selected?.id === next.id) select(next); }} />}
    </Shell>
  );
}
