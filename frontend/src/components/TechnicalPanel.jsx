import { Fragment, useEffect, useMemo, useState } from 'react';
import { Badge, DataTable, Segmented } from '../ui-kit';
import { api } from '../api';
import { formatTime, formatUncertainty } from '../lib/time';
import { classOfEvent, isSignificant, sourceName } from '../lib/overview';
import { ClassBadge } from './FindingParts';
import SummaryPanel from './SummaryPanel';

const Sec = ({ title, count, children, open }) => (
  <details className="rounded-lg border border-line" open={open}>
    <summary className="t-small flex cursor-pointer items-center gap-2 px-3 py-2 text-fg-2">{title}{count != null && <Badge variant="neutral">{count}</Badge>}</summary>
    <div className="overflow-x-auto border-t border-line p-3">{children}</div>
  </details>
);
const KV = ({ o }) => <dl className="t-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{Object.entries(o || {}).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => <Fragment key={k}><dt className="text-fg-3">{k.replace(/_/g, ' ')}</dt><dd className="mono break-all text-fg-2">{String(v)}</dd></Fragment>)}</dl>;

/** Level 2: everything the overview leaves out. Read-only; every value is as the API returned it. */
export default function TechnicalPanel({ model, events, videos, modelRuns, shifts, unsynchronized, gaps, activeId, onPick, onSelectEvent, onOpenTrail }) {
  const [scope, setScope] = useState('key');
  const [tracks, setTracks] = useState({});
  useEffect(() => { videos.forEach((v) => api.tracks(v.id).then((t) => setTracks((s) => ({ ...s, [v.id]: t }))).catch(() => setTracks((s) => ({ ...s, [v.id]: null })))); }, [videos.map((v) => v.id).join()]);
  const all = useMemo(() => [...events, ...Object.values(model.events).filter((e) => e.start_ms == null)], [events, model]);
  const rows = (scope === 'key' ? all.filter(isSignificant) : all);
  const active = activeId && model.events[activeId];
  const cols = [
    { key: 't', header: 'Case time', sortValue: (e) => e.start_ms ?? 1e12, render: (e) => <span className="mono">{formatTime(e.start_ms)}</span> },
    { key: 'src', header: 'Source', render: sourceName },
    { key: 'c', header: 'Class', render: (e) => <ClassBadge value={classOfEvent(e)} /> },
    { key: 'title', header: 'Event', render: (e) => <span className="t-caption">{e.title}</span> },
  ];
  return (
    <div className="space-y-3">
      <Sec title="Chronological events" count={rows.length} open>
        <Segmented size="sm" label="Event scope" value={scope} onChange={setScope} options={[{ id: 'key', label: 'Key events' }, { id: 'all', label: 'All events' }]} className="mb-2" />
        <DataTable caption="Events" rows={rows} columns={cols} rowKey="id" onRowClick={onPick} initialSort={{ key: 't', dir: 'asc' }} />
      </Sec>
      <Sec title="Selected event: evidence layers"><SummaryPanel eventId={activeId} onSelectEvent={onSelectEvent} onOpenTrail={onOpenTrail} /></Sec>
      <Sec title="Confidence components and provenance">
        {!active ? <p className="t-caption text-fg-3">Select an event.</p> : (
          <div className="space-y-3">
            <p className="t-caption text-fg-3">Confidence is shown as separate components. There is no overall score and no event probability.</p>
            <div><h5 className="t-eyebrow mb-1 text-fg-3">Confidence components</h5><KV o={active.confidence} /></div>
            <div><h5 className="t-eyebrow mb-1 text-fg-3">Time</h5><KV o={{ case_ms: active.start_ms, uncertainty: formatUncertainty(active.uncertainty_ms), basis: active.uncertainty_basis, synchronized: active.synchronized }} /></div>
            <div><h5 className="t-eyebrow mb-1 text-fg-3">Provenance</h5><KV o={active.provenance} /></div>
            <div><h5 className="t-eyebrow mb-1 text-fg-3">Source record</h5><KV o={{ event_type: active.event_type, category: active.category, source_type: active.source_type, source_id: active.source_id, synthetic: active.synthetic }} /></div>
          </div>
        )}
      </Sec>
      <Sec title="Detection and tracking runs">
        {videos.length === 0 ? <p className="t-caption text-fg-3">No video.</p> : videos.map((v) => (
          <div key={v.id} className="mb-3 last:mb-0">
            <p className="t-small text-fg">{v.original_filename} <Badge variant="neutral">{v.kind}</Badge></p>
            <ul className="mt-1 space-y-1">{(modelRuns[v.id] || []).map((r) => (
              <li key={r.id} className="t-caption text-fg-3"><span className="mono text-fg-2">{r.stage}</span> · {r.model_id} {r.model_version} · {r.status}{r.metrics?.tracks != null ? ` · ${r.metrics.tracks} tracks` : ''}{r.metrics?.boxes != null ? ` · ${r.metrics.boxes} boxes` : ''}</li>
            ))}</ul>
            {tracks[v.id] && <p className="t-caption mt-1 text-fg-3">{tracks[v.id].items.length} tracks: {Object.entries(tracks[v.id].items.reduce((m, t) => ({ ...m, [t.class]: (m[t.class] || 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}</p>}
            {tracks[v.id] === null && <p className="t-caption mt-1 text-fg-3">No tracking run stored.</p>}
          </div>
        ))}
        <p className="t-caption text-fg-3">Detector scores describe how sure the detector is about one box, not how likely an event is.</p>
      </Sec>
      <Sec title="Source synchronization">
        <ul className="space-y-1">{videos.map((v) => <li key={v.id} className="t-caption text-fg-3"><span className="text-fg-2">{v.original_filename}</span>: {shifts[v.id] != null ? `on the case clock (media = case ${shifts[v.id] >= 0 ? '+' : '−'} ${Math.abs(shifts[v.id])} ms)` : 'not synchronized'}</li>)}
          {unsynchronized.length > 0 && <li className="t-caption text-warning">{unsynchronized.length} source(s) not related to the case clock.</li>}</ul>
      </Sec>
      <Sec title="Recording gaps" count={gaps.length}>
        {gaps.length === 0 ? <p className="t-caption text-fg-3">None recorded.</p> : <ul className="space-y-2">{gaps.map((g) => <li key={g.id} className="t-caption text-fg-3"><b className="text-fg-2">{g.gap_type.replace(/_/g, ' ')}</b> · <span className="mono">{JSON.stringify(g.scope)}</span><br />{g.recommendation}</li>)}</ul>}
      </Sec>
    </div>
  );
}
