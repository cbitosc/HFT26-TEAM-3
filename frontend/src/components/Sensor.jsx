import { useEffect, useState } from 'react';
import { api } from '../api';
import { useThrottledTime } from '../hooks';
import { formatTime } from '../lib/time';

/** Speed from a vehicle sensor log on the case clock. Breaks in the line are missing samples, not interpolated. */
export default function Sensor({ evidence, shift, label, events, onSelect }) {
  const [rows, setRows] = useState(null);
  const currentMs = useThrottledTime(8);
  useEffect(() => { api.sensorRecords(evidence.id, undefined, undefined).then((r) => setRows(r.items)).catch(() => setRows([])); }, [evidence.id]);
  if (!rows) return <p className="t-small text-fg-3">Loading sensor data…</p>;
  if (shift == null) return <p className="t-small text-fg-2">This sensor log is not synchronized with the other sources, so it is not drawn against their clock.</p>;
  const pts = rows.filter((r) => r.valid && r.si.speed != null).map((r) => ({ t: r.time_ms - shift, v: r.si.speed }));
  if (!pts.length) return <p className="t-small text-fg-3">No usable speed samples.</p>;
  const step = [...pts.slice(1).map((p, i) => p.t - pts[i].t)].sort((a, b) => a - b)[Math.floor(pts.length / 2)] || 50;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, vmax = Math.max(...pts.map((p) => p.v), 1) * 1.1;
  const W = 600, H = 150, L = 34, B = 18;
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - 8), y = (v) => H - B - (v / vmax) * (H - B - 8);
  let d = '';
  pts.forEach((p, i) => { d += `${i === 0 || p.t - pts[i - 1].t > step * 3 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`; });
  return (
    <div>
      <p className="t-caption mb-1 text-fg-3">{label} · speed (m/s) on the case clock · {pts.length} samples · {formatTime(t0)}–{formatTime(t1)}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sensor speed">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - 8} y1={y(vmax * f / 1.1)} y2={y(vmax * f / 1.1)} stroke="rgb(var(--line))" /><text x={L - 4} y={y(vmax * f / 1.1) + 3} textAnchor="end" className="mono fill-fg-3 text-[9px]">{(vmax * f / 1.1).toFixed(0)}</text></g>)}
        <path d={d} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8" />
        {events.map((e) => <g key={e.id} onClick={() => onSelect(e)} style={{ cursor: 'pointer' }}><line x1={x(e.start_ms)} x2={x(e.start_ms)} y1={8} y2={H - B} stroke="rgb(var(--warning))" strokeDasharray="3 3" /><title>{e.title}</title><circle cx={x(e.start_ms)} cy={10} r={4} fill="rgb(var(--warning))" /></g>)}
        <line x1={x(Math.min(Math.max(currentMs, t0), t1))} x2={x(Math.min(Math.max(currentMs, t0), t1))} y1={6} y2={H - B} stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
