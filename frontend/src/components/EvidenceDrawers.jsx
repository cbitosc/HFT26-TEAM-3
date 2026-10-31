import { useEffect, useState } from 'react';
import { Alert, Badge, Button, DataTable, Drawer, LoadingState } from '../ui-kit';
import { api } from '../api';
import { useWorkspace } from '../store';
import { containTransform, latestSample, mapBox } from '../lib/overlay';
import { formatTime } from '../lib/time';

/** Event → exact video frame. Uses the stored frame index and stored detections only. `media_ms` is the source video's own time. */
export function FrameDrawer({ open, onClose, evidence, event }) {
  const [state, setState] = useState({ status: 'idle' });
  const mediaMs = event?.observations?.source_time_ms?.[0];
  useEffect(() => {
    if (!open) { setState({ status: 'idle' }); return undefined; }
    if (!evidence || mediaMs == null) return undefined;
    let live = true;
    setState({ status: 'loading' });
    Promise.all([api.frames(evidence.id, mediaMs - 150, mediaMs + 150), api.overlays(evidence.id, Math.max(0, mediaMs - 400), mediaMs + 400).catch(() => ({ items: [] }))])
      .then(([f, o]) => {
        if (!live) return;
        const frame = f.items.reduce((b, x) => (b == null || Math.abs(x.time_ms - mediaMs) < Math.abs(b.time_ms - mediaMs) ? x : b), null);
        if (!frame) return setState({ status: 'empty' });
        setState({ status: 'ready', frame, sample: latestSample(o.items, frame.time_ms, 450) });
      }).catch((e) => live && setState({ status: 'error', message: e.message }));
    return () => { live = false; };
  }, [open, evidence?.id, mediaMs]);
  const [nat, setNat] = useState(null);
  const seek = () => { if (event?.start_ms == null) return; useWorkspace.getState().setPlaying(false); useWorkspace.getState().requestSeek(event.start_ms); onClose(); };
  return (
    <Drawer open={open} onClose={onClose} title="Exact video frame" description={event ? event.title : ''} width="sm:max-w-2xl">
      {state.status === 'loading' && <LoadingState rows={3} label="Loading frame" />}
      {state.status === 'error' && <Alert variant="danger" title="Could not load the frame">{state.message}</Alert>}
      {state.status === 'empty' && <Alert variant="warning" title="No frame at this time">The frame index has no entry within 150 ms of this event. This can happen inside a missing-footage interval.</Alert>}
      {state.status === 'ready' && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border border-line bg-black">
            <img src={api.fullFrameUrl(state.frame.id)} alt={`Frame ${state.frame.frame_no}`} className="block w-full" onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight, cw: e.target.clientWidth, ch: e.target.clientHeight })} />
            {nat && state.sample && state.sample.boxes.map((b) => { const r = mapBox(b.bbox, containTransform(nat.w, nat.h, nat.cw, nat.ch)); return <span key={b.detection_id} className="pointer-events-none absolute border-2 border-accent" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} title={`${b.class} #${b.track_id ?? '?'} ${Math.round(b.confidence * 100)}%`} />; })}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="t-caption text-fg-3">Frame</dt><dd className="mono">#{state.frame.frame_no}</dd></div>
            <div><dt className="t-caption text-fg-3">Media time</dt><dd className="mono">{formatTime(state.frame.time_ms)}</dd></div>
            <div><dt className="t-caption text-fg-3">Event (case clock)</dt><dd className="mono">{formatTime(event?.start_ms)}</dd></div>
            <div><dt className="t-caption text-fg-3">Boxes shown</dt><dd>{state.sample ? `${state.sample.boxes.length} from the stored detections` : 'none stored near this frame'}</dd></div>
          </dl>
          <Button variant="primary" onClick={seek} disabled={event?.start_ms == null}>Seek the player to this moment</Button>
        </div>
      )}
    </Drawer>
  );
}

/** Witness claim → the original statement span. The statement text is shown unchanged with the claim highlighted. */
export function StatementDrawer({ open, onClose, event }) {
  const [state, setState] = useState({ status: 'idle' });
  const sid = event?.observations?.statement_id;
  const cid = event?.observations?.claim_id;
  useEffect(() => {
    if (!open || !sid) return;
    let live = true;
    setState({ status: 'loading' });
    Promise.all([api.statement(sid), api.claims(sid)]).then(([st, cl]) => live && setState({ status: 'ready', st, claims: cl.items })).catch((e) => live && setState({ status: 'error', message: e.message }));
    return () => { live = false; };
  }, [open, sid]);
  const text = state.st?.text_original || '';
  const spans = (state.claims || []).map((c) => ({ a: c.explicit_statement.char_start, b: c.explicit_statement.char_end, id: c.id })).sort((x, y) => x.a - y.a);
  const parts = [];
  let at = 0;
  spans.forEach((s) => { if (s.a < at) return; parts.push(<span key={`t${at}`}>{text.slice(at, s.a)}</span>); parts.push(<mark key={s.id} className={s.id === cid ? 'rounded bg-accent/25 px-0.5 font-semibold text-fg underline decoration-accent decoration-2' : 'rounded bg-surface-2 px-0.5 text-fg-2'}>{text.slice(s.a, s.b)}</mark>); at = s.b; });
  parts.push(<span key="end">{text.slice(at)}</span>);
  const mine = (state.claims || []).find((c) => c.id === cid);
  return (
    <Drawer open={open} onClose={onClose} title="Original statement" description="Stored text, unchanged. The selected claim is highlighted.">
      {state.status === 'loading' && <LoadingState rows={3} label="Loading statement" />}
      {state.status === 'error' && <Alert variant="danger" title="Could not load the statement">{state.message}</Alert>}
      {state.status === 'ready' && (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-7 text-fg-2">{parts}</p>
          {mine && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="t-caption text-fg-3">Characters</dt><dd className="mono">{mine.explicit_statement.char_start}–{mine.explicit_statement.char_end}</dd></div>
              <div><dt className="t-caption text-fg-3">Extraction</dt><dd><Badge variant="neutral">{mine.extraction_status}</Badge></dd></div>
              <div><dt className="t-caption text-fg-3">Certainty</dt><dd>{mine.normalized_interpretation.certainty || '—'}</dd></div>
              <div><dt className="t-caption text-fg-3">Time as stated</dt><dd>{mine.normalized_interpretation.time_description || 'none'}</dd></div>
            </dl>
          )}
          <p className="t-caption text-fg-3">A claim is testimony: it is recorded here, not verified.</p>
        </div>
      )}
    </Drawer>
  );
}

/** Sensor event → the original sensor rows. Times are the sensor's own clock (ms from its first valid sample). */
export function SensorDrawer({ open, onClose, evidence, event }) {
  const [state, setState] = useState({ status: 'idle' });
  const [t0, t1] = event?.observations?.source_time_ms || [];
  useEffect(() => {
    if (!open || !evidence || t0 == null) return;
    let live = true;
    setState({ status: 'loading' });
    api.sensorRecords(evidence.id, Math.max(0, t0 - 300), (t1 ?? t0) + 300).then((r) => live && setState({ status: 'ready', rows: r.items })).catch((e) => live && setState({ status: 'error', message: e.message }));
    return () => { live = false; };
  }, [open, evidence?.id, t0, t1]);
  const inEvent = (r) => r.time_ms >= t0 && r.time_ms <= (t1 ?? t0);
  const cols = [
    { key: 'row_no', header: 'Row', render: (r) => <span className="mono">{r.row_no}{inEvent(r) && <Badge variant="accent" className="ml-2">event</Badge>}</span> },
    { key: 'time_ms', header: 'Sensor time', render: (r) => <span className="mono">{formatTime(r.time_ms)}</span> },
    { key: 'speed', header: 'Speed m/s', align: 'right', render: (r) => <span className="mono">{r.si.speed?.toFixed(2) ?? '—'}</span> },
    { key: 'accel_long', header: 'Accel m/s²', align: 'right', render: (r) => <span className="mono">{r.si.accel_long?.toFixed(2) ?? '—'}</span> },
    { key: 'valid', header: 'Valid', render: (r) => (r.valid ? <Badge variant="success">ok</Badge> : <Badge variant="danger">{(r.issues || ['invalid']).join(', ')}</Badge>) },
  ];
  return (
    <Drawer open={open} onClose={onClose} title="Original sensor rows" description={event ? `${event.title} · sensor clock ${formatTime(t0)}–${formatTime(t1 ?? t0)}` : ''} width="sm:max-w-2xl">
      {state.status === 'error' && <Alert variant="danger" title="Could not load the rows">{state.message}</Alert>}
      {(state.status === 'loading' || state.status === 'ready') && (
        <DataTable caption="Sensor rows around the event" loading={state.status === 'loading'} rows={state.rows || []} columns={cols} rowKey="row_no" empty={<p className="t-small p-4 text-fg-3">No rows in this window.</p>} />
      )}
      <p className="t-caption mt-3 text-fg-3">Rows are shown in SI units after the investigator's declared mapping. Sensor time is not video time.</p>
    </Drawer>
  );
}
