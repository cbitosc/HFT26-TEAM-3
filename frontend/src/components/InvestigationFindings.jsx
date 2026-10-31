import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FileSearch, GitCompare, Layers, ShieldCheck, Users } from 'lucide-react';
import { Badge, Button, SectionHeader, Segmented } from '../ui-kit';
import { labelled } from '../lib/time';
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_PLURAL, REVIEW_LABEL, buildFindings, countsOf, hasPriority, selectFindings } from '../lib/findings';

const TONE = {
  contradiction: { icon: GitCompare, bar: 'border-l-danger', text: 'text-danger', badge: 'danger' },
  corroboration: { icon: ShieldCheck, bar: 'border-l-success', text: 'text-success', badge: 'success' },
  gap: { icon: AlertTriangle, bar: 'border-l-warning', text: 'text-warning', badge: 'warning' },
};
const STATUS_BADGE = { unreviewed: 'neutral', reviewed: 'success', disputed: 'warning' };

const EMPTY = {
  contradiction: { icon: GitCompare, title: 'No contradictions identified', text: 'Available sources do not currently contain conflicting claims about the same event. This does not establish that every account is complete or correct.' },
  corroboration: { icon: ShieldCheck, title: 'No independent corroborations yet', text: 'Corroboration will appear when independent evidence sources support the same observation. Two files with identical bytes are not independent sources.' },
  gap: { icon: FileSearch, title: 'No evidence gaps recorded', text: 'No missing evidence is stored for this scenario. This does not mean the evidence is complete.' },
  all: { icon: Layers, title: 'No findings stored for this scenario', text: 'No contradiction, corroboration or evidence gap is stored. Nothing is assumed from the absence of findings.' },
};

function EmptyState({ kind, filtered, onReset }) {
  const e = filtered ? { icon: Layers, title: 'No findings match these filters', text: 'Change the category or the review filter to see other findings.' } : EMPTY[kind];
  const Icon = e.icon;
  return (
    <div role="status" className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-2 text-fg-3"><Icon size={20} aria-hidden /></span>
      <h3 className="text-[0.9375rem] font-semibold text-fg">{e.title}</h3>
      <p className="t-small mt-1 max-w-prose text-fg-3">{e.text}</p>
      {filtered && <Button size="sm" variant="outline" className="mt-3" onClick={onReset}>Show all findings</Button>}
    </div>
  );
}

const Time = ({ ms, basis, unc }) => (ms == null
  ? <span className="t-caption text-fg-3">time not placed</span>
  : <span className="mono t-caption text-fg-2"><Clock size={11} className="mr-1 inline align-[-1px]" aria-hidden />{labelled(ms, basis)}{unc ? ` ±${(unc / 1000).toFixed(2)} s` : ''}</span>);

function Claim({ s, label, caseId, onSeek, onPickEvent }) {
  if (!s) return <div className="rounded-lg border border-dashed border-line p-3"><p className="t-caption text-fg-3">{label}: the event record is not available.</p></div>;
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface p-3">
      <p className="t-eyebrow mb-1 text-fg-3">{label}</p>
      <p className="t-small font-medium text-fg">{s.title}</p>
      <p className="t-caption mt-1 text-fg-3">{s.kind === 'witness_claim' ? 'Reported by witness' : s.kind === 'inference' ? 'Inferred from evidence' : s.kind === 'machine_detection' ? 'Detected in video · review required' : 'Recorded observation'}</p>
      {s.text && <p className="t-caption mt-1 text-fg-2">{s.text}</p>}
      <p className="t-caption mt-2 flex flex-wrap items-center gap-1.5">{s.source ? <Badge variant="neutral">{s.source}</Badge> : <span className="text-fg-3">source not recorded</span>}<Time ms={s.timeMs} basis="case" unc={s.uncertaintyMs} /></p>
      <div className="mt-2 flex flex-wrap gap-2">{s.sourceId && caseId && <Link className="t-caption text-accent-text" to={`/evidence/${caseId}?source=${s.sourceId}${s.kind === 'witness_claim' ? '#witnesses' : ''}`}>View source →</Link>}{s.timeMs != null && onSeek && <Button size="sm" variant="ghost" onClick={() => { onPickEvent?.(s.id); onSeek(s.timeMs); }}>Go to moment</Button>}</div>
    </div>
  );
}

function Body({ f, ...context }) {
  if (f.category === 'contradiction') return (
    <>
      <div className="grid gap-2 md:grid-cols-2"><Claim s={f.sides[0]} label="First source" {...context} /><Claim s={f.sides[1]} label="Second source" {...context} /></div>
      <p className="t-small mt-3 text-fg-2"><span className="font-medium text-fg">Why they conflict. </span>{f.explanation}</p>
      <p className="t-caption mt-1 text-fg-3">A contradiction says two sources differ. It does not say which one is wrong.</p>
    </>
  );
  if (f.category === 'corroboration') return (
    <>
      <p className="t-small text-fg-2">{f.explanation}</p>
      <p className="t-caption mt-2 flex flex-wrap items-center gap-1.5 text-fg-3"><Users size={12} aria-hidden />
        {f.independent ? `${f.independentCount} independent sources` : `Not established as independent (${f.independentCount} distinct source${f.independentCount === 1 ? '' : 's'})`}
      </p>
      <ul className="mt-2 grid gap-2 md:grid-cols-2">{f.sources.map((s) => <li key={s.id}><Claim s={s} label="Supporting source" {...context} /></li>)}</ul>
    </>
  );
  return (
    <>
      <p className="t-caption flex flex-wrap items-center gap-1.5 text-fg-3"><Badge variant="neutral">{f.scope ? f.scope.name : 'Case-wide'}</Badge>
        {f.fromMs != null && <span className="mono">media {labelled(f.fromMs, '').trim()} to {labelled(f.toMs, '').trim()}</span>}</p>
      {f.label && <p className="t-small mt-2 text-fg-2"><span className="font-medium text-fg">Affects. </span>{f.label}</p>}
      {f.effect && <p className="t-small mt-1 text-fg-2"><span className="font-medium text-fg">What cannot be established. </span>{f.effect}.</p>}
      {f.recommendation && <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3"><p className="t-eyebrow text-fg-3">Recommended next action</p><p className="t-small mt-0.5 text-fg">{f.recommendation}</p></div>}
    </>
  );
}

function Details({ f }) {
  const rows = f.category === 'contradiction'
    ? [['Rule', f.rule], ['Strength', f.strength], ['Event records', f.eventIds.join(', ')]]
    : f.category === 'corroboration'
      ? [['Rule', f.rule], ['Independence', f.independenceReason], ['Timing relation', f.relation], ['Event records', f.eventIds.join(', ')]]
      : [['Gap type', f.type], ['Evidence references', (f.refs || []).join(', ')]];
  const shown = rows.filter(([, v]) => v);
  return (
    <div className="mt-3 border-t border-line pt-3">
      {shown.length > 0 && <dl className="t-caption grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">{shown.map(([k, v]) => <div key={k} className="contents"><dt className="text-fg-3">{k}</dt><dd className="mono min-w-0 break-words text-fg-2">{v}</dd></div>)}</dl>}
      {f.category === 'contradiction' && f.questions.length > 0 && (
        <div className="mt-2"><p className="t-caption font-medium text-fg">Unresolved questions</p><ul className="t-caption mt-0.5 list-disc space-y-0.5 pl-4 text-fg-2">{f.questions.map((q, i) => <li key={i}>{typeof q === 'string' ? q : q.text || JSON.stringify(q)}</li>)}</ul></div>
      )}
      <p className="t-caption mt-3 text-fg-3">Reviewed means you inspected this finding. Disputed means you do not accept it. Neither resolves it, and no resolution note is stored by the backend yet.</p>
    </div>
  );
}

function FindingCard({ f, caseId, onReview, onSeek, onSeekMedia, onPickEvent, reduce }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tone = TONE[f.category];
  const Icon = tone.icon;
  const panelId = `finding-${f.key.replace(/[^a-z0-9]/gi, '-')}`;
  const canJump = f.category === 'gap' ? !!(f.scope && f.fromMs != null && onSeekMedia) : f.timeMs != null && !!onSeek;
  const jump = () => (f.category === 'gap' ? onSeekMedia(f.scope.evidenceId, f.fromMs) : (onPickEvent?.(f.eventIds[0]), onSeek(f.timeMs)));
  const set = async (status) => { setBusy(true); try { await onReview(f.findingId, status); } finally { setBusy(false); } };

  return (
    <motion.li layout={false} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}
               aria-label={`${CATEGORY_LABEL[f.category]}: ${f.title}`}
               className={`flex min-w-0 flex-col rounded-xl border border-line border-l-4 ${tone.bar} bg-surface p-4 shadow-sm ${f.category === 'contradiction' ? 'md:col-span-2' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide ${tone.text}`}><Icon size={13} aria-hidden />{CATEGORY_LABEL[f.category]}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {f.priority != null && <Badge variant="warning">Priority: {String(f.priority)}</Badge>}
          <Badge variant={STATUS_BADGE[f.status] || 'neutral'}>{REVIEW_LABEL[f.status] || f.status}</Badge>
        </span>
      </div>
      <h3 className="mb-2 text-[0.9375rem] font-semibold leading-snug text-fg">{f.title}</h3>
      <Body f={f} caseId={caseId} onSeek={onSeek} onPickEvent={onPickEvent} />
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId} key="d" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }} className="overflow-hidden">
            <Details f={f} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Inspect details'}<ChevronDown size={14} aria-hidden className={`ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
        {canJump && <Button size="sm" variant="outline" onClick={jump}>Go to this moment</Button>}
        {f.category === 'gap' && f.scope && <Link to={`/evidence/${caseId}`} className="t-small text-accent underline-offset-2 hover:underline">Open evidence</Link>}
        <span className="ml-auto flex gap-2">
          {f.findingId ? (
            <>
              {f.status !== 'reviewed' && <Button size="sm" variant="outline" disabled={busy} onClick={() => set('reviewed')}><CheckCircle2 size={14} aria-hidden className="mr-1" />Mark reviewed</Button>}
              {f.status !== 'disputed' && <Button size="sm" variant="outline" disabled={busy} onClick={() => set('disputed')}>Dispute</Button>}
              {f.status !== 'unreviewed' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => set('unreviewed')}>Reset</Button>}
            </>
          ) : <span className="t-caption text-fg-3">Review is not available for this record.</span>}
        </span>
      </div>
    </motion.li>
  );
}

/** Full-width findings workspace: one category at a time (or all), filterable by review state. Counts come from the loaded records. */
export default function InvestigationFindings({ caseId, cons = [], crbs = [], gaps = [], finds = [], events = [], nameOf = (x) => x, onReview, onSeek, onSeekMedia, onPickEvent }) {
  const reduce = useReducedMotion();
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('category');
  const items = useMemo(() => buildFindings({ cons, crbs, gaps, finds, events, nameOf }), [cons, crbs, gaps, finds, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = countsOf(items);
  const priority = hasPriority(items);
  const shown = useMemo(() => selectFindings(items, { category, status, sort: sort === 'priority' && !priority ? 'category' : sort }), [items, category, status, sort, priority]);
  const filtered = status !== 'all' && counts[category] > 0;

  const tabs = [{ id: 'all', label: `All findings (${counts.all})` }, ...CATEGORIES.map((c) => ({ id: c, label: `${CATEGORY_PLURAL[c]} (${counts[c]})` }))];
  const sorts = [{ id: 'category', label: 'Category' }, { id: 'time', label: 'Time' }, ...(priority ? [{ id: 'priority', label: 'Priority' }] : [])];

  return (
    <section aria-label="Investigation findings" className="mt-6">
      <SectionHeader title="Investigation findings" description="Review conflicting accounts, independently supported observations and evidence that is still missing." className="!mb-3" />
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        {CATEGORIES.map((c) => {
          const T = TONE[c]; const Icon = T.icon;
          return (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? 'all' : c)}
                    className={`min-w-0 rounded-xl border border-line border-l-4 ${T.bar} bg-surface px-3 py-2.5 text-left transition hover:bg-surface-2 aria-pressed:bg-surface-2 aria-pressed:ring-1 aria-pressed:ring-accent`}>
              <span className="flex items-center gap-1.5 text-fg-3"><Icon size={13} aria-hidden className={`${T.text} hidden shrink-0 sm:block`} /><span className="text-[0.6875rem] leading-tight sm:text-xs">{CATEGORY_PLURAL[c]}</span></span>
              <span className="mt-0.5 block text-xl font-semibold leading-none text-fg">{counts[c]}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Finding category" value={category} onChange={setCategory} items={tabs} size="sm" />
        <Segmented label="Review status" value={status} onChange={setStatus} size="sm" items={[{ id: 'all', label: 'Any status' }, ...Object.entries(REVIEW_LABEL).map(([id, label]) => ({ id, label }))]} />
        <Segmented label="Sort findings" value={sort} onChange={setSort} size="sm" items={sorts} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${category}:${status}:${sort}`} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.14 }}>
          {shown.length === 0
            ? <EmptyState kind={category} filtered={filtered} onReset={() => setStatus('all')} />
            : <ul className="grid gap-3 md:grid-cols-2">{shown.map((f) => <FindingCard key={f.key} f={f} caseId={caseId} reduce={reduce} onReview={onReview} onSeek={onSeek} onSeekMedia={onSeekMedia} onPickEvent={onPickEvent} />)}</ul>}
        </motion.div>
      </AnimatePresence>
      <p className="sr-only" role="status" aria-live="polite">{shown.length} findings shown</p>
    </section>
  );
}
