import FilePicker from './FilePicker';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '../ui-kit';
import { api } from '../api';
import SourceMetaFields from './SourceMetaFields';
import { EMPTY_META, toClockBody, toSourceBody, validateMeta } from '../lib/sourceMeta';

const guessKind = (name) => (/dash/i.test(name) ? 'dashcam' : 'cctv');

/** Multi-file video upload with per-source metadata, plus an optional sensor CSV and witness statement.
 *  Every file is declared real or synthetic from the case designation, never defaulted. A real or staged case never sends synthetic=true. */
export default function EvidenceUploader({ caseId, designation, onDone, submitLabel = 'Upload evidence' }) {
  const synthetic = designation === 'synthetic';
  const mixed = designation === 'mixed';
  const [files, setFiles] = useState([]);
  const [sensorOrigin, setSensorOrigin] = useState('');
  const declared = origin => mixed ? origin === 'synthetic' : synthetic;
  const originField = (value, onChange, label) => <Field label={label}><Select required disabled={busy} value={value || ''} onChange={e => onChange(e.target.value)} options={[{ value: '', label: 'Choose data origin' }, { value: 'real', label: 'Recorded / supplied account' }, { value: 'synthetic', label: 'Simulated / generated' }]} /></Field>;
  const [sensor, setSensor] = useState(null);
  const [accounts, setAccounts] = useState([{ key: 1, label: '', text: '', file: null }]);
  const updateAccount = (key, patch) => setAccounts(old => old.map(a => a.key === key ? { ...a, ...patch } : a));
  const [errors, setErrors] = useState({});
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const choose = (list) => {
    const picked = [...list];
    const seen = new Set();
    const next = picked.filter((f) => { const k = `${f.name}:${f.size}`; if (seen.has(k)) return false; seen.add(k); return true; });
    setFiles((old) => next.map((file) => old.find((o) => o.key === `${file.name}:${file.size}`) || { key: `${file.name}:${file.size}`, file, meta: { ...EMPTY_META, camera_kind: guessKind(file.name) } }));
    setErrors({});
  };
  const setMeta = (key) => (meta) => setFiles((l) => l.map((f) => (f.key === key ? { ...f, meta } : f)));
  const say = (m) => setLog((l) => [...l, m]);

  const submit = async (e) => {
    e.preventDefault();
    const all = {};
    files.forEach((f) => { const x = validateMeta(f.meta); if (Object.keys(x).length) all[f.key] = x; });
    if (mixed && (files.some(f => !f.origin) || (sensor && !sensorOrigin) || accounts.some(a => (a.text.trim() || a.file) && !a.origin))) { setErr('Declare the origin of every selected source.'); return; }
    setErrors(all);
    if (Object.keys(all).length) return;
    setBusy(true); setErr(null); setLog([]);
    const uploaded = [];
    try {
      for (const f of files) {
        say(`Uploading ${f.file.name}…`);
        const r = await api.upload(caseId, f.file, f.meta.camera_kind, declared(f.origin));
        const ev = r.evidence;
        uploaded.push({ evidence: ev, duplicate: !!r.duplicate });
        if (r.duplicate) { say(`${f.file.name} is already in this case. It was not added again and its stored details were left as they are.`); continue; }
        await api.patchSource(ev.id, toSourceBody(f.meta));
        const body = toClockBody(f.meta);
        if (body) { await api.setClock(ev.id, body); say(`Source details and clock saved for ${f.file.name}`); }
      }
      if (sensor) { say('Uploading sensor file…'); const r = await api.upload(caseId, sensor, 'sensor_csv', declared(sensorOrigin)); uploaded.push({ evidence: r.evidence, duplicate: !!r.duplicate }); }
      const existing = accounts.some(a => a.text.trim() || a.file) ? await api.witnesses(caseId) : { items: [] };
      for (const [i, account] of accounts.entries()) {
        if (!account.text.trim() && !account.file) continue;
        const label = account.label.trim() || `Witness ${existing.items.length + i + 1}`;
        const w = await api.addWitness(caseId, label);
        const result = account.file ? await api.uploadStatement(w.id, account.file, declared(account.origin)) : await api.addStatement(w.id, account.text, declared(account.origin));
        const st = result.statement || result;
        if (!result.extraction_job) await api.extractLocal(st.id);
        say(`${label}: statement stored and claim extraction requested`);
      }
      onDone?.({ uploaded });
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };



  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Upload evidence">
      {mixed && <p className="t-small text-fg-2">Demo with recorded and simulated sources: declare each source’s origin. Findings remain a mixed-data demonstration.</p>}
      <Field label="Videos" hint="Several files can be added. Dashcam = moving camera, CCTV = fixed camera. Each file keeps its own clock until you state how they relate.">
        <FilePicker accept="video/*" multiple disabled={busy} label="Choose video files" hint="MP4, MOV or similar" files={files.map((f) => f.file)} onChange={choose} />
      </Field>
      {files.map((f, i) => (
        <Card key={f.key} padded={false} className="space-y-3 p-4" aria-label={`Source ${f.file.name}`}>
          <div className="flex items-center gap-2"><span className="t-small min-w-0 flex-1 truncate font-medium">{f.file.name}</span><Badge variant="neutral">{(f.file.size / 1e6).toFixed(1)} MB</Badge></div>
          {mixed && originField(f.origin, origin => setFiles(old => old.map(x => x.key === f.key ? { ...x, origin } : x)), `Data origin · ${f.file.name}`)}
          <SourceMetaFields value={f.meta} onChange={setMeta(f.key)} errors={errors[f.key]} disabled={busy} idPrefix={`up-${i}`} filename={f.file.name} />
        </Card>
      ))}
      <Field label="Sensor CSV" optional hint="After upload, map its columns and units on the Evidence page. Until then no sensor reading is used."><FilePicker accept=".csv" disabled={busy} label="Choose CSV file" hint="Optional" files={sensor ? [sensor] : []} onChange={(fs) => setSensor(fs[0] || null)} /></Field>
      {mixed && sensor && originField(sensorOrigin, setSensorOrigin, "Sensor data origin")}
      <details className="rounded-xl border border-line p-4" open={accounts.some(a => a.text || a.file)}>
        <summary className="t-small cursor-pointer font-medium">Witness accounts <span className="font-normal text-fg-3">· optional</span></summary>
        <div className="mt-4 space-y-4">
          <p className="t-caption text-fg-3">Keep each witness separate. Claims are extracted from their words and remain unverified testimony.</p>
          {accounts.map((a, i) => <div key={a.key} className="space-y-3 border-t border-line pt-3">
            <Field label={`Witness ${i + 1} name or label`}><Input value={a.label} maxLength={120} disabled={busy} onChange={e => updateAccount(a.key, { label: e.target.value })} placeholder={`Witness ${i + 1}`} /></Field>
            <Field label="Witness statement" optional><Textarea rows={3} value={a.text} onChange={e => updateAccount(a.key, { text: e.target.value })} disabled={busy || !!a.file} /></Field>
            {mixed && (a.text || a.file) && originField(a.origin, origin => updateAccount(a.key, { origin }), `Witness ${i + 1} account origin`)}
            <FilePicker accept=".txt,text/plain" disabled={busy || !!a.text} label="Or choose a statement .txt" files={a.file ? [a.file] : []} onChange={fs => updateAccount(a.key, { file: fs[0] || null })} />
            {accounts.length > 1 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAccounts(old => old.filter(x => x.key !== a.key))}>Remove witness</Button>}
          </div>)}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAccounts(old => [...old, { key: Date.now(), label: '', text: '', file: null }])}>Add another witness</Button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={busy} disabled={!files.length && !sensor && !accounts.some(a => a.text.trim() || a.file)}>{busy ? 'Uploading…' : submitLabel}</Button>
        {synthetic && <Badge variant="warning">will be labelled synthetic</Badge>}
      </div>
      {log.length > 0 && <ul className="t-caption space-y-0.5 text-fg-3" role="status">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {err && <Alert variant="danger" title="Upload stopped">{err}</Alert>}
    </form>
  );
}
