import { useState } from 'react';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from '../ui-kit';
import { api } from '../api';

function TimeRange({ claim, evidence, onSaved }) {
  const n = claim.normalized_interpretation;
  const old = n.time_anchor;
  const [f, setF] = useState({ evidence_id: old?.evidence_id || '', start: old ? old.start_ms / 1000 : '', end: old ? old.end_ms / 1000 : '', uncertainty: old ? old.uncertainty_ms / 1000 : '', basis: old?.basis || '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.anchorClaim(claim.id, { evidence_id: f.evidence_id, start_ms: Number(f.start) * 1000, end_ms: Number(f.end) * 1000, uncertainty_ms: Number(f.uncertainty) * 1000, basis: f.basis }); onSaved(); }
    catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return <details className="mt-3"><summary className="t-caption cursor-pointer text-accent-text">{old ? 'Edit time range' : 'Place on a source clock'}</summary><form onSubmit={save} className="mt-3 space-y-3">
    <p className="t-caption text-fg-3">Use seconds from the start of a recording. State the range and uncertainty you can justify; the witness’s original wording stays unchanged.</p>
    <Field label="Reference source"><Select required value={f.evidence_id} onChange={e => setF({ ...f, evidence_id: e.target.value })}><option value="">Choose video or sensor</option>{evidence.filter(e => ['cctv', 'dashcam', 'sensor_csv'].includes(e.kind)).map(e => <option key={e.id} value={e.id}>{e.original_filename}</option>)}</Select></Field>
    <div className="grid gap-3 sm:grid-cols-3">{[['start', 'From (seconds)'], ['end', 'To (seconds)'], ['uncertainty', 'Uncertainty ± seconds']].map(([key, label]) => <Field key={key} label={label}><Input type="number" required min={key === 'end' ? Number(f.start) : 0} step="any" value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} /></Field>)}</div>
    <Field label="Why this range?"><Input required minLength={3} maxLength={500} value={f.basis} onChange={e => setF({ ...f, basis: e.target.value })} placeholder="e.g. witness refers to braking visible between 8 and 11 seconds" /></Field>
    <Button type="submit" size="sm" variant="outline" loading={busy}>Save time range</Button>{error && <p role="alert" className="t-small text-danger">{error}</p>}
  </form></details>;
}

export default function WitnessReview({ st, label, claims, extraction, evidence = [], onChanged, onClose }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [reviewNotes, setReviewNotes] = useState({});
  const reviewClaim = async (claim, status) => { setBusy(true); setError(''); try { await api.reviewClaim(claim.id, { status, note: reviewNotes[claim.id] }); await onChanged(); } catch (x) { setError(x.message); } finally { setBusy(false); } };
  const [manual, setManual] = useState(false);
  const [span, setSpan] = useState(null);
  const [f, setF] = useState({ subject: '', action: '', direction: '', time_description: '', certainty: 'reported_as_direct_observation' });
  const run = async hosted => {
    setBusy(true); setError(''); setNotice('');
    try { const r = await (hosted ? api.extractClaims(st.id) : api.extractLocal(st.id)); await onChanged(); setNotice(hosted ? 'Extraction queued. Claims appear after processing completes.' : `${r.claims_added} new claims extracted. Review the quotes below.`); }
    catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  const save = async e => {
    e.preventDefault(); if (!span || span.end <= span.start) return;
    setBusy(true); setError('');
    try { await api.addClaim(st.id, { char_start: span.start, char_end: span.end, ...Object.fromEntries(Object.entries(f).map(([k,v]) => [k, v || null])) }); await onChanged(); setManual(false); setSpan(null); }
    catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} title={`${label} · review claims`} size="xl" description="Claims record testimony. Extraction does not verify what happened.">
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" loading={busy} onClick={() => run(false)}>Extract locally</Button>{extraction?.hosted_available && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(true)}>Use hosted extraction</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => setManual(v => !v)}>Select a quote manually</Button></div>
      <p className="t-caption text-fg-3">Local extraction recognizes common English incident descriptions. It can miss complex wording. All proposed claims need review.</p>
      {error && <Alert variant="danger" title="Could not process claims">{error}</Alert>}{notice && <p role="status" className="t-small text-fg-2">{notice}</p>}
      {manual && <form onSubmit={save} className="space-y-3 rounded-xl border border-line p-4">
        <Field label="Select the exact words in this original statement" hint="Highlight a sentence or phrase. The saved quote comes directly from the original."><Textarea readOnly rows={5} value={st.text_original} onSelect={e => { const el = e.target; setSpan({ start: Array.from(el.value.slice(0, el.selectionStart)).length, end: Array.from(el.value.slice(0, el.selectionEnd)).length, quote: el.value.slice(el.selectionStart, el.selectionEnd) }); }} /></Field>
        <p className="t-small text-fg-2">{span?.quote ? `Selected: “${span.quote}”` : 'No quote selected.'}</p>
        <div className="grid gap-3 sm:grid-cols-2">{[['subject','Vehicle or person described'], ['action','Action reported'], ['direction','Direction, if stated'], ['time_description','Time wording, if stated']].map(([k,label]) => <Field key={k} label={label} optional><Input maxLength={k === 'action' ? 120 : k === 'direction' ? 60 : 200} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
        <Field label="How was this reported?"><Select value={f.certainty} onChange={e => setF({ ...f, certainty: e.target.value })} options={[{ value: 'reported_as_direct_observation', label: 'Witness says they saw it' }, { value: 'hedged', label: 'Uncertain wording' }, { value: 'hearsay', label: 'Heard from someone else' }, { value: 'assumption', label: 'Witness assumption' }]} /></Field>
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!span?.quote}>Save selected claim</Button>
      </form>}
      <details><summary className="t-small cursor-pointer text-fg-2">Read original statement</summary><p className="t-small mt-3 whitespace-pre-wrap text-fg-2">{st.text_original}</p></details>
      {!claims.length && <p className="t-small text-fg-3">No structured claims yet. Extract locally or select a quote manually.</p>}
      <ul className="space-y-3">{claims.map(c => <li key={c.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap gap-2"><Badge variant="info">Reported by witness</Badge><Badge variant="neutral">{c.normalized_interpretation.interpreted_by?.startsWith('local') ? 'Local extraction · review' : c.extraction_status}</Badge></div><blockquote className="t-small my-3 text-fg">“{c.explicit_statement.text}”</blockquote><p className="t-caption text-fg-3">{c.normalized_interpretation.subject || 'Vehicle not specified'} · {c.normalized_interpretation.event_type_hint?.replaceAll('_',' ') || 'Unclassified claim'}</p>
        <p className="t-caption mt-2 text-fg-2">{c.contradiction_status === 'potential_conflict' ? 'Potential conflict — inspect reconstruction findings.' : c.corroboration_status === 'supported' ? 'Supporting evidence identified in the latest reconstruction.' : c.scenario_id ? 'No supporting or conflicting finding identified. This claim is not verified.' : 'Not assessed — build or update reconstruction.'}</p>
        {c.time_placement && <p className="t-caption mt-1 text-fg-3">{c.time_placement}</p>}
        <details className="mt-3"><summary className="t-caption cursor-pointer text-accent-text">{c.review_status === 'excluded' ? 'Excluded from reconstruction · restore' : 'Review inclusion'}</summary><div className="mt-3 space-y-2"><Field label="Review note"><Input value={reviewNotes[c.id] || ''} onChange={e => setReviewNotes({ ...reviewNotes, [c.id]: e.target.value })} placeholder="Why keep or exclude this extracted claim?" maxLength={500} /></Field><div className="flex gap-2"><Button size="sm" disabled={busy || (reviewNotes[c.id] || '').trim().length < 3} onClick={() => reviewClaim(c, 'included')}>Keep claim</Button><Button size="sm" variant="outline" disabled={busy || (reviewNotes[c.id] || '').trim().length < 3} onClick={() => reviewClaim(c, 'excluded')}>Exclude claim</Button></div></div></details>
        {c.review_status !== 'excluded' && <TimeRange key={`${c.id}-${JSON.stringify(c.normalized_interpretation.time_anchor)}`} claim={c} evidence={evidence} onSaved={onChanged} />}
      </li>)}</ul>
    </div>
  </Modal>;
}
