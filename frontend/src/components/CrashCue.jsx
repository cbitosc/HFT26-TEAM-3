import { useEffect, useState } from 'react';
import { Badge, Button } from '../ui-kit';
import { api } from '../api';
import { summarizeCues } from '../lib/cues';
import { formatTime } from '../lib/time';
import Panel from './Panel';

/** One summary per video, from the stored overlay samples. undefined = loading, null = could not be read. */
export function useCueSummaries(videos, runs) {
  const [state, setState] = useState({});
  const key = videos.map((v) => v.id).join(',');
  useEffect(() => {
    let off = false;
    setState({});
    videos.forEach((v) => {
      const ran = (runs?.[v.id] || []).some((r) => r.stage === 'accident_cue' && r.status === 'completed');
      if (!ran) { setState((s) => ({ ...s, [v.id]: { ran: false } })); return; }
      api.overlays(v.id, 0, Math.ceil((v.video?.duration_ms || 0) + 1000))
        .then((r) => { if (!off) setState((s) => ({ ...s, [v.id]: { ran: true, ...summarizeCues(r.items) } })); })
        .catch(() => { if (!off) setState((s) => ({ ...s, [v.id]: null })); });
    });
    return () => { off = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

const name = (v) => v.source?.display_name || v.original_filename;

/** The crash-cue model's output for every video, stated as a weak cue. It is not a collision finding and never pauses playback. */
export default function CrashCuePanel({ videos, cues, onSeek }) {
  if (!videos.length) return null;
  return (
    <Panel as="section" aria-label="Crash-cue model" className="mb-3 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[0.8125rem] font-semibold text-fg">Crash-cue model</h3>
        <Badge variant="warning">weak cue</Badge>
      </div>
      <p className="t-caption mb-2 text-fg-3">A small image model flags frames that look like an accident. On its own validation set it was right about 59% of the time and found about 52% of accidents. It never confirms a collision and does not pause playback. Several frames in a row are shown as a cue moment; a single frame is treated as likely noise.</p>
      <ul className="space-y-2">
        {videos.map((v) => {
          const c = cues[v.id];
          return (
            <li key={v.id} aria-label={`Crash cue for ${name(v)}`} className="rounded-lg border border-line bg-surface px-3 py-2">
              <p className="t-small font-medium text-fg">{name(v)}</p>
              {c === undefined ? <p className="t-caption text-fg-3">Reading stored cue results…</p>
                : c === null ? <p className="t-caption text-warning">The stored cue results could not be read.</p>
                  : !c.ran ? <p className="t-caption text-fg-3">Crash-cue model did not run on this video. Unavailable.</p>
                    : c.moments.length === 0 ? (
                      <p className="t-caption text-fg-3">No persistent crash cue observed{c.isolated ? `; ${c.isolated} isolated single-frame cue${c.isolated === 1 ? '' : 's'} not treated as a moment` : ''}. This does not show that no collision occurred.</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {c.moments.map((m) => (
                          <Button key={m.startMs} size="sm" variant="outline" onClick={() => onSeek(v.id, m.startMs)}>
                            Cue at {formatTime(m.startMs)} · {m.frames} frames · peak {Math.round(m.peak * 100)}%
                          </Button>
                        ))}
                        {c.isolated > 0 && <span className="t-caption text-fg-3">+ {c.isolated} isolated single-frame cue{c.isolated === 1 ? '' : 's'}</span>}
                      </div>
                    )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
