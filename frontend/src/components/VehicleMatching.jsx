import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Field, Input, Select } from '../ui-kit';
import { api } from '../api';

function TrackPreview({ reference, evidence }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stop = false; setPreview(null); setError('');
    if (!reference || reference.type !== 'track') return undefined;
    (async () => {
      try {
        const track = await api.track(reference.id);
        const point = track.points?.find(p => p.bbox && p.time_ms != null);
        if (!point) throw new Error('No stored position is available for this track.');
        const frames = await api.frames(reference.evidenceId, Math.max(0, point.time_ms - 1), point.time_ms + 1);
        const frame = frames.items.find(f => f.frame_no === point.frame_no) || frames.items[0];
        if (!frame) throw new Error('No extracted frame is available at this track position.');
        if (!stop) setPreview({ point, frame });
      } catch (e) { if (!stop) setError(e.message); }
    })(); return () => { stop = true; };
  }, [reference]);
  if (!reference || reference.type !== 'track') return null;
  const ev = evidence.find(e => e.id === reference.evidenceId);
  const [x1,y1,x2,y2] = preview?.point.bbox || [];
  return <div className="max-w-lg">{preview ? <><svg viewBox={`0 0 ${ev?.video?.width || 1920} ${ev?.video?.height || 1080}`} className="w-full rounded-lg bg-black" aria-label={`Track preview: ${reference.label}`} role="img"><image href={api.fullFrameUrl(preview.frame.id)} width="100%" height="100%" /><rect x={x1} y={y1} width={x2-x1} height={y2-y1} fill="none" stroke="#ff692c" strokeWidth="5" /></svg><p className="t-caption mt-1 text-fg-3">Highlighted track at {(preview.point.time_ms / 1000).toFixed(2)} s. Confirm identity only after reviewing the footage.</p></> : <p className="t-caption text-fg-3">{error || 'Loading track preview…'}</p>}</div>;
}

export default function VehicleMatching({ caseId, evidence, revision, onChanged }) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(''); const [actor, setActor] = useState(''); const [kind, setKind] = useState('track'); const [ref, setRef] = useState(''); const [basis, setBasis] = useState('');
  const load = async () => {
    try {
      const [actors, claims, sensors] = await Promise.all([api.actors(caseId), api.caseClaims(caseId), api.sensors(caseId)]);
      const video = evidence.filter(e => ['cctv','dashcam'].includes(e.kind));
      const results = await Promise.all(video.map(async e => { try { const r = await api.tracks(e.id); return { e, items: r.items }; } catch (x) { if (x.code === 'TRACKS_NOT_READY') return { e, items: [] }; throw x; } }));
      const refs = results.flatMap(({e,items}) => items.map(t => ({ id:t.id, type:'track', evidenceId:e.id, label:`${e.source?.display_name || e.original_filename} · track ${t.track_id} (${t.class}) · ${((t.first_ms || 0)/1000).toFixed(1)}–${((t.last_ms || 0)/1000).toFixed(1)} s` })))
        .concat(claims.items.filter(c => c.review_status !== 'excluded').map(c => ({id:c.id,type:'claim',label:`${c.witness?.label || 'Witness'}: “${c.explicit_statement.text}”`})))
        .concat(sensors.items.map(s => ({id:s.id,type:'sensor_source',label:`Sensor · ${evidence.find(e => e.id === s.evidence_id)?.original_filename || s.id}`})));
      setData({actors:actors.items,refs}); setError('');
    } catch (x) { setError(x.message); }
  };
  useEffect(() => { load(); }, [caseId, evidence, revision]);
  const create = async e => { e.preventDefault(); setBusy(true); try { const a = await api.createActor(caseId,{ label:label.trim(),kind:'vehicle' }); setLabel(''); setActor(a.id); await load(); onChanged?.(); } catch(x) {setError(x.message);} finally {setBusy(false);} };
  const confirm = async e => {e.preventDefault();setBusy(true);try {await api.linkActor(actor,{ ref_type:kind,ref_id:ref,status:'confirmed',basis:{method:'investigator source review',note:basis.trim()} });setRef('');setBasis('');await load();onChanged?.();} catch(x) {setError(x.message);} finally {setBusy(false);} };
  const remove = async id => {setBusy(true);try {await api.decideLink(id,'reject');await load();onChanged?.();}catch(x){setError(x.message);}finally{setBusy(false);} };
  const links = data?.actors.flatMap(a => (a.links || []).filter(l => l.status === 'confirmed').map(l => ({...l,actor:a.label}))) || [];
  const choices = data?.refs.filter(r => r.type === kind && !links.some(l => l.ref_type === kind && l.ref_id === r.id)) || [];
  return <details id="matching" className="mt-6 rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer"><span className="t-small font-medium">Match vehicles across evidence</span><span className="t-caption ml-2 text-fg-3">{links.length} confirmed links</span></summary>
    <div className="mt-4 space-y-4"><p className="t-small text-fg-2">Create a vehicle, then link its video track, witness claims and sensor log. Similar names or colours do not establish identity automatically.</p>
      {error && <Alert title="Could not save vehicle matching" variant="danger">{error}<Button size="sm" onClick={load}>Retry</Button></Alert>}
      <form onSubmit={create} className="flex flex-wrap items-end gap-3"><Field label="New vehicle label"><Input required value={label} maxLength={120} placeholder="e.g. Vehicle A · blue car" onChange={e=>setLabel(e.target.value)} /></Field><Button size="sm" type="submit" variant="outline" disabled={!label.trim()} loading={busy}>Add vehicle</Button></form>
      {data?.actors.length > 0 && <form onSubmit={confirm} className="space-y-3 border-t border-line pt-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Which vehicle?"><Select required value={actor} onChange={e=>setActor(e.target.value)}><option value="">Choose vehicle</option>{data.actors.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field><Field label="Evidence type"><Select value={kind} onChange={e=>{setKind(e.target.value);setRef('');}} options={[{value:'track',label:'Video track'},{value:'claim',label:'Witness claim'},{value:'sensor_source',label:'Sensor log'}]} /></Field></div>
        <Field label="Evidence reference"><Select required value={ref} onChange={e=>setRef(e.target.value)}><option value="">{choices.length ? 'Choose reference' : 'No unmatched references — finish processing or add claims'}</option>{choices.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <TrackPreview reference={data.refs.find(r=>r.id===ref)} evidence={evidence} />
        <Field label="Why is this the same vehicle?"><Input required minLength={3} maxLength={500} value={basis} onChange={e=>setBasis(e.target.value)} placeholder="Describe the visual or source details you reviewed" /></Field>
        <Button type="submit" size="sm" variant="primary" disabled={!actor || !ref || basis.trim().length<3} loading={busy}>Confirm match</Button>
      </form>}
      {!!links.length && <ul className="space-y-2">{links.map(l=><li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3"><Badge variant="success">{l.actor}</Badge><span className="t-caption min-w-0 flex-1 break-words">{data.refs.find(r=>r.id===l.ref_id)?.label || `${l.ref_type} · previous processing run`}</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>remove(l.id)}>Remove match</Button></li>)}</ul>}
    </div>
  </details>;
}
