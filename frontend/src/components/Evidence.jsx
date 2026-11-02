import { useEffect, useState } from 'react';
import WitnessReview from './WitnessReview';
import { Badge, Button, Card } from '../ui-kit';
import { api } from '../api';

export function Statement({ st, label, evidence = [], onChanged, revision }) {
  const [claims, setClaims] = useState([]);
  const [extraction, setExtraction] = useState(null);
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const reload = async () => { try { const r = await api.claims(st.id); setClaims(r.items); setExtraction(r.extraction); setError(''); } catch (e) { setError(e.message); } };
  useEffect(() => { reload(); }, [st.id, revision]);
  const changed = async () => { await reload(); onChanged?.(); };
  const spans = claims.map((c) => [c.explicit_statement.char_start, c.explicit_statement.char_end, c]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let at = 0;
  spans.forEach(([a, b, c], i) => {
    if (a < at) return;
    out.push(st.text_original.slice(at, a));
    out.push(<mark key={i} className="rounded bg-warning/25 px-0.5 text-fg" title={`${c.extraction_status} · ${c.normalized_interpretation.event_type_hint || 'claim'}`}>{st.text_original.slice(a, b)}</mark>);
    at = b;
  });
  out.push(st.text_original.slice(at));
  return (
    <Card padded={false} className="p-4">
      <div className="mb-1 flex items-center gap-2"><span className="t-small font-medium">{label}</span>{st.synthetic && <Badge variant="warning">synthetic</Badge>}</div>
      <p className="t-small line-clamp-3 whitespace-pre-wrap text-fg-2">{out}</p>
      <div className="mt-3 flex items-center justify-between gap-3"><Badge variant={claims.length ? 'info' : 'warning'}>{claims.length ? `${claims.length} claims · review required` : 'Claims need extraction'}</Badge><Button size="sm" variant="outline" onClick={() => setReview(true)}>Review claims</Button></div>
      {error && <p role="alert" className="t-caption mt-2 text-danger">{error}</p>}
      {review && <WitnessReview st={st} label={label} claims={claims} extraction={extraction} evidence={evidence} onChanged={changed} onClose={() => setReview(false)} />}
      <p className="t-caption mt-2 text-fg-3">Highlighted spans are extracted claims ({claims.length}). The original text is stored unchanged.</p>
    </Card>
  );
}

export default function Evidence({ caseId, evidence }) {
  const [wit, setWit] = useState([]);
  useEffect(() => {
    api.witnesses(caseId).then(async (r) => {
      const all = await Promise.all(r.items.map(async (w) => (await api.statements(w.id)).items.map((s) => ({ s, label: w.label }))));
      setWit(all.flat());
    }).catch(() => {});
  }, [caseId]);
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {evidence.map((e) => (
          <Card as="li" key={e.id} padded={false} className="flex flex-wrap items-center gap-2 p-3">
            <Badge variant="neutral">{e.kind}</Badge>
            <span className="t-small">{e.original_filename}</span>
            {e.synthetic && <Badge variant="warning">synthetic</Badge>}
            <span className="mono t-caption ml-auto text-fg-3" title={e.sha256}>sha256 {e.sha256 ? `${e.sha256.slice(0, 12)}…` : 'not available'}</span>
          </Card>
        ))}
      </ul>
      {wit.map(({ s, label }) => <Statement key={s.id} st={s} label={label} evidence={evidence} />)}
    </div>
  );
}
