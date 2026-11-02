import { useMemo, useState } from 'react';
import { Segmented } from '../ui-kit';
import { ACTOR_COLORS } from '../fmt';
import { useThrottledTime } from '../hooks';

/** Paths of tracked vehicles. Image frame = pixels of a fixed camera (not to scale). Ground frame = calibrated plane with per-point uncertainty.
 *  Solid = sampled positions, dashed = a gap between samples (not observed), ring = uncertainty. Dashcam paths are not drawn: their image motion includes the camera's own. */
export default function Trajectory({ trajs, actors, selected, onSelect }) {
  const currentMs = useThrottledTime(8);
  const hasGround = trajs.some((t) => t.frame === 'ground_plane');
  const [frame, setFrame] = useState(hasGround ? 'ground_plane' : 'image');
  const list = trajs.filter((t) => t.frame === frame && !t.track_ref.moving_camera);
  const skipped = trajs.filter((t) => t.track_ref.moving_camera).length;
  const all = list.flatMap((t) => t.points);
  const b = useMemo(() => {
    if (!all.length) return null;
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const m = Math.max(x1 - x0, y1 - y0, 1) * 0.08;
    return { x0: x0 - m, y0: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }, [list.length, frame]);
  const unit = frame === 'ground_plane' ? 'm' : 'px';
  const idx = (id) => Math.max(actors.findIndex((a) => a.id === id), 0);
  if (!b) return <p className="t-small text-fg-3">No trajectory for this camera yet.</p>;
  const stroke = Math.max(b.w, b.h) / 300;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {hasGround && <Segmented value={frame} onChange={setFrame} options={[{ id: 'ground_plane', label: 'Ground plane (m)' }, { id: 'image', label: 'Image (px)' }]} label="Frame" size="sm" />}
        <span className="t-caption rounded border border-line px-2 py-0.5 text-fg-3">{frame === 'ground_plane' ? 'Calibrated flat plane; valid near the reference points' : 'Image space: not to scale, no distances'}</span>
      </div>
      <svg viewBox={`${b.x0} ${b.y0} ${b.w} ${b.h}`} className="w-full rounded-lg border border-line bg-surface-2" style={{ aspectRatio: `${b.w} / ${b.h}`, maxHeight: 340 }} role="img" aria-label="Vehicle trajectories">
        {list.map((t) => {
          const color = ACTOR_COLORS[idx(t.actor_id) % ACTOR_COLORS.length];
          const pts = t.points;
          const segs = [];
          for (let i = 1; i < pts.length; i++) {
            const gap = pts[i].case_ms != null && pts[i - 1].case_ms != null && pts[i].case_ms - pts[i - 1].case_ms > 600;
            segs.push(<line key={i} x1={pts[i - 1].x} y1={pts[i - 1].y} x2={pts[i].x} y2={pts[i].y} stroke={color} strokeWidth={stroke * 2} strokeDasharray={gap ? `${stroke * 4} ${stroke * 4}` : undefined} opacity={selected && selected !== t.actor_id ? 0.25 : 0.9} />);
          }
          let cur = null;
          for (const p of pts) if (p.case_ms != null && p.case_ms <= currentMs) cur = p;
          return (
            <g key={t.id} onClick={() => onSelect(t.actor_id)} style={{ cursor: 'pointer' }}>
              {segs}
              {cur && <>
                {cur.uncertainty != null && <circle cx={cur.x} cy={cur.y} r={cur.uncertainty} fill={color} opacity="0.15" />}
                <circle cx={cur.x} cy={cur.y} r={stroke * 5} fill={color} stroke="white" strokeWidth={stroke} />
              </>}
              <text x={pts[0].x} y={pts[0].y - stroke * 8} fontSize={stroke * 11} fill={color} textAnchor={pts[0].x > b.x0 + b.w * 0.6 ? 'end' : 'start'}>{actors.find((a) => a.id === t.actor_id)?.label || `track ${t.track_ref.track_id}`}</text>
            </g>
          );
        })}
      </svg>
      <p className="t-caption mt-2 text-fg-3">Units: {unit}. {skipped > 0 && `${skipped} dashcam path(s) hidden (moving camera). `}Dashed = no sampled position (gap), not interpolated motion.</p>
    </div>
  );
}
