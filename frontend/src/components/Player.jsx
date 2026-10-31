import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FastForward, Maximize2, Pause, Play, Rewind, StepBack, StepForward } from 'lucide-react';
import { Badge, Button, Checkbox, IconButton, Segmented } from '../ui-kit';
import { api } from '../api';
import { useWorkspace } from '../store';
import { ACTOR_COLORS } from '../fmt';
import { containTransform, latestSample, mapBox } from '../lib/overlay';
import Scrubber from './Scrubber';
import TimeReadout from './TimeReadout';

const SEEK_TIMEOUT_MS = 1500;

/** Resolve when the element has finished seeking to `seconds` (or after a timeout, so a stuck decoder never blocks the UI). */
function seekElement(el, seconds) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; el.removeEventListener('seeked', finish); resolve(); } };
    el.addEventListener('seeked', finish);
    setTimeout(finish, SEEK_TIMEOUT_MS);
    el.currentTime = Math.max(0, seconds);
  });
}

/** The video element owns the clock while playing. One rAF loop in this component copies the master's time into the store (case ms);
 *  secondary sources follow through the recorded clock offsets: media time = case time + shift. A source with no clock relation
 *  (no entry in `shifts`) is never slaved.
 *  Seeking is latest-wins: each request has an id; only the newest request's completion is acknowledged as settled. */
export default function Player({ cues = {}, videos, shifts, trackActors, actorLabels, range, events, onSelectEvent }) {
  const refs = useRef({});
  const box = useRef(null);
  const raf = useRef(0);
  const playing = useWorkspace((s) => s.playing);
  const rate = useWorkspace((s) => s.rate);
  const seekId = useWorkspace((s) => s.seek.latest);
  const settled = useWorkspace((s) => s.seekSettled);
  const primaryId = useWorkspace((s) => s.primaryVideoId) || videos[0]?.id;
  const overlaysOn = useWorkspace((s) => s.overlays);
  const { setPlaying, setRate, setTime, requestSeek, ackSeek, setPrimaryVideo, toggleOverlay } = useWorkspace.getState();

  const primary = videos.find((v) => v.id === primaryId) || videos[0];
  const syncedMaster = shifts[primary?.id] != null ? primary : videos.find((v) => shifts[v.id] != null);
  const master = syncedMaster || primary;
  const shiftOf = useCallback((v) => (shifts[v.id] != null ? shifts[v.id] : v.id === master?.id ? 0 : null), [shifts, master?.id]);
  const mediaAt = (v, caseMs) => { const s = shiftOf(v); return s == null ? null : caseMs + s; };
  const inRange = (v, m) => m != null && m >= 0 && m <= (v.video.duration_ms ?? 0);
  const fps = primary?.video.fps_measured || primary?.video.fps_nominal || 25;

  // ---- latest-wins seek: runs when a new request id appears
  useEffect(() => {
    if (!seekId) return;
    const id = seekId;
    const ms = useWorkspace.getState().currentMs;
    Promise.all(videos.map((v) => {
      const el = refs.current[v.id];
      const m = mediaAt(v, ms);
      return el && inRange(v, m) ? seekElement(el, m / 1000) : Promise.resolve();
    })).then(() => ackSeek(id));
  }, [seekId]);

  // ---- play / pause / rate
  useEffect(() => {
    const ms = useWorkspace.getState().currentMs;
    videos.forEach((v) => {
      const el = refs.current[v.id];
      if (!el) return;
      el.playbackRate = rate;
      const m = mediaAt(v, ms);
      if (playing && inRange(v, m)) el.play().catch(() => {}); else el.pause();
    });
  }, [playing, rate]);

  // ---- the clock
  useEffect(() => {
    if (!playing || !master) return undefined;
    const tick = () => {
      const el = refs.current[master.id];
      if (el) {
        const caseMs = el.currentTime * 1000 - (shiftOf(master) ?? 0);
        setTime(caseMs);
        videos.forEach((v) => {
          const s = refs.current[v.id];
          const m = mediaAt(v, caseMs);
          if (!s || v.id === master.id || m == null) return;
          if (!inRange(v, m)) { if (!s.paused) s.pause(); return; }
          if (Math.abs(s.currentTime * 1000 - m) > 200) s.currentTime = m / 1000;
          if (s.paused) s.play().catch(() => {});
        });
        if (el.ended) { setPlaying(false); return; }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, master?.id]);

  const clamp = (ms) => Math.min(Math.max(ms, range[0]), range[1]);
  const jump = useCallback((deltaMs) => { setPlaying(false); requestSeek(clamp(useWorkspace.getState().currentMs + deltaMs)); }, [range]);
  const frameMs = 1000 / fps;
  const fullscreen = () => { const el = box.current?.querySelector('[data-primary]'); if (el?.requestFullscreen) el.requestFullscreen().catch(() => {}); };

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!useWorkspace.getState().playing); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); jump(e.shiftKey ? 1000 : frameMs); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); jump(e.shiftKey ? -1000 : -frameMs); }
      else if (e.key === 'ArrowUp') setRate(Math.min(useWorkspace.getState().rate * 2, 2));
      else if (e.key === 'ArrowDown') setRate(Math.max(useWorkspace.getState().rate / 2, 0.25));
      else if (e.key === 'f') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump, frameMs]);

  const others = videos.filter((v) => v.id !== primary?.id);
  const mediaMap = useMemo(() => (ms) => (primary && shiftOf(primary) != null ? ms + shiftOf(primary) : null), [primary?.id, shifts]);
  if (!primary) return <p className="t-small text-fg-3">No playable video in this case yet.</p>;

  return (
    <div ref={box}>
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_auto]">
        <Tile key={primary.id} cue={cues[primary.id]} v={primary} primary setRef={(el) => { refs.current[primary.id] = el; }} shift={shiftOf(primary)} trackActors={trackActors} actorLabels={actorLabels} isClock={master?.id === primary.id} />
        {others.length > 0 && (
          <div className="grid grid-cols-2 gap-3 2xl:w-56 2xl:grid-cols-1 2xl:content-start">
            {others.map((v) => (
              <Tile key={v.id} cue={cues[v.id]} v={v} setRef={(el) => { refs.current[v.id] = el; }} shift={shiftOf(v)} trackActors={trackActors} actorLabels={actorLabels} onMakePrimary={() => setPrimaryVideo(v.id)} isClock={master?.id === v.id} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <Scrubber range={range} events={events} onSeek={(ms) => { setPlaying(false); requestSeek(ms); }} onSelect={onSelectEvent} />
        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon={Rewind} label="Back 1 s" variant="outline" size="sm" onClick={() => jump(-1000)} />
          <IconButton icon={StepBack} label="Previous frame" variant="outline" size="sm" onClick={() => jump(-frameMs)} />
          <Button size="sm" variant="primary" icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</Button>
          <IconButton icon={StepForward} label="Next frame" variant="outline" size="sm" onClick={() => jump(frameMs)} />
          <IconButton icon={FastForward} label="Forward 1 s" variant="outline" size="sm" onClick={() => jump(1000)} />
          <div className="ml-1 flex items-center gap-3">
            <TimeReadout label="case" />
            <TimeReadout label="media" map={mediaMap} className="text-fg-3" />
            {!settled && <span className="t-caption text-fg-3" role="status">seeking…</span>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Checkbox label="Boxes" checked={overlaysOn.boxes} onChange={() => toggleOverlay('boxes')} />
            <Checkbox label="Labels" checked={overlaysOn.ids} onChange={() => toggleOverlay('ids')} />
          </div>
          <Segmented size="sm" label="Playback speed" value={rate} onChange={(v) => setRate(Number(v))} options={[0.25, 0.5, 1, 2].map((r) => ({ id: r, label: `${r}×` }))} />
          <IconButton icon={Maximize2} label="Fullscreen (f)" variant="outline" size="sm" onClick={fullscreen} />
        </div>
        <p className="t-caption text-fg-3" title="Frame step is the primary video's measured frame period">Space play/pause · ←/→ frame ({frameMs.toFixed(1)} ms), Shift 1 s · ↑/↓ speed · f fullscreen · [ ] key events</p>
      </div>
    </div>
  );
}

function Tile({ cue, v, setRef, shift, trackActors, actorLabels, primary, onMakePrimary, isClock }) {
  const canvas = useRef(null);
  const video = useRef(null);
  const cache = useRef({ win: -1, items: [] });
  const raf = useRef(0);
  const overlays = useWorkspace((s) => s.overlays);
  const selectedActor = useWorkspace((s) => s.selectedActorId);
  const incident = useWorkspace((s) => s.incident);
  const atMoment = useWorkspace((s) => !!s.incident && Math.abs(s.currentMs - s.incident.ms) <= 600);
  const [windowKey, setWindowKey] = useState(-1);

  // the media window we need overlays for follows the playhead in 10 s blocks (fetched from the API; never generated here)
  useEffect(() => {
    const check = (ms) => {
      if (shift == null) return;
      const m = ms + shift;
      if (m < 0 || m > v.video.duration_ms) return;
      const w = Math.floor(m / 10_000);
      if (w === cache.current.win) return;
      cache.current.win = w;
      const from = w * 10_000;
      api.overlays(v.id, from, from + 10_000).then((r) => {
        if (cache.current.win !== w) return;
        cache.current.items = [...cache.current.items.filter((i) => i.time_ms < from || i.time_ms >= from + 10_000), ...r.items];
        setWindowKey(w);
      }).catch(() => {});
    };
    check(useWorkspace.getState().currentMs);
    return useWorkspace.subscribe((s, p) => { if (s.currentMs !== p.currentMs) check(s.currentMs); });
  }, [shift, v.id]);

  const atMomentRef = useRef(false);
  atMomentRef.current = atMoment;
  const draw = useCallback(() => {
    const cv = canvas.current;
    const el = video.current;
    if (!cv || !el) return;
    const w = (cv.width = cv.clientWidth);
    const h = (cv.height = cv.clientHeight);
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!overlays.boxes || !el.videoWidth) return;
    const sample = latestSample(cache.current.items, el.currentTime * 1000);
    if (!sample) return;
    const tf = containTransform(el.videoWidth, el.videoHeight, w, h, v.video.width || el.videoWidth, v.video.height || el.videoHeight);
    sample.boxes.forEach((b) => {
      const r = mapBox(b.bbox, tf);
      if (b.is_accident_cue) {
        // weak crash-cue box: red when the cue persists over several frames, thin dashed amber when it is a single frame
        const persistent = !!cue?.persistentTimes?.has(sample.time_ms);
        ctx.strokeStyle = persistent ? '#ef4444' : '#f59e0b';
        ctx.lineWidth = persistent ? 3 : 1.5;
        ctx.setLineDash(persistent ? [] : [6, 4]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        if (overlays.ids) {
          ctx.setLineDash([]);
          ctx.fillStyle = persistent ? '#ef4444' : '#f59e0b';
          ctx.font = '11px ui-monospace, monospace';
          const txt = `${persistent ? 'crash cue' : 'isolated cue'} ${Math.round(b.confidence * 100)}% · weak`;
          ctx.fillText(txt, Math.min(r.x, w - ctx.measureText(txt).width - 2), Math.max(12, r.y - 4));
        }
        return;
      }
      const actor = trackActors[`${v.id}:${b.track_id}`];
      const color = actor ? ACTOR_COLORS[actor.index % ACTOR_COLORS.length] : '#94a3b8';
      const involved = !!incident && incident.trackKeys.includes(`${v.id}:${b.track_id}`) && Math.abs(el.currentTime * 1000 - (incident.ms + (shift ?? 0))) <= 2000;
      const dim = (selectedActor && (!actor || actor.id !== selectedActor)) || (!!incident && atMomentRef.current && !involved);
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.strokeStyle = involved ? '#ef4444' : color;
      ctx.lineWidth = involved ? 4 : selectedActor && actor?.id === selectedActor ? 3.5 : 2;
      ctx.setLineDash(b.backfilled ? [4, 3] : []);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      if (overlays.ids) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = '11px ui-monospace, monospace';
        const txt = `${actor ? actorLabels[actor.id] : `${b.class} #${b.track_id ?? '?'}`} ${Math.round(b.confidence * 100)}%`;
        ctx.fillText(txt, Math.min(r.x, w - ctx.measureText(txt).width - 2), Math.max(12, r.y - 4));
      }
      ctx.globalAlpha = 1;
    });
  }, [overlays, selectedActor, trackActors, actorLabels, v.id, incident, shift, cue]);

  // redraw on clock changes (coalesced to one frame), seeks, resizes; no free-running loop
  useEffect(() => {
    const schedule = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw); };
    const el = video.current;
    const unsub = useWorkspace.subscribe((s, p) => { if (s.currentMs !== p.currentMs) schedule(); });
    el?.addEventListener('seeked', schedule);
    el?.addEventListener('loadeddata', schedule);
    const ro = new ResizeObserver(schedule);
    if (canvas.current) ro.observe(canvas.current);
    schedule();
    return () => { unsub(); el?.removeEventListener('seeked', schedule); el?.removeEventListener('loadeddata', schedule); ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, [draw, windowKey]);

  const currentMs = useWorkspace((s) => Math.round(s.currentMs / 250));
  const inside = shift != null && (() => { const m = currentMs * 250 + shift; return m >= 0 && m <= v.video.duration_ms; })();
  return (
    <figure className="card overflow-hidden" data-primary={primary ? '1' : undefined}>
      <div className="relative mx-auto w-full bg-black [@media(max-height:1100px)]:max-h-[32vh] [@media(min-height:1101px)]:max-h-[min(52vh,560px)]" style={{ aspectRatio: `${v.video.width} / ${v.video.height}`, maxWidth: primary ? `min(100%, ${(40 * v.video.width / v.video.height).toFixed(1)}vh)` : '100%' }}>
        <video ref={(el) => { video.current = el; setRef(el); }} src={api.streamUrl(v.id)} muted playsInline preload="auto" className="absolute inset-0 h-full w-full object-contain" />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
        {atMoment && primary && <div className="pointer-events-none absolute inset-0 border-4 border-danger" aria-hidden><span className="absolute left-2 top-2 rounded bg-danger px-2 py-0.5 text-xs font-semibold text-white">POSSIBLE ACCIDENT · not confirmed</span></div>}
        {shift == null && <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-1.5 text-xs text-white">Not synchronized: no recorded clock relation. Not slaved to the case clock.</div>}
        {shift != null && !inside && <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-1.5 text-xs text-white">No footage at this case time.</div>}
      </div>
      <figcaption className="space-y-1.5 px-3 py-2 text-fg-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral">{v.kind === 'cctv' ? 'CCTV · fixed' : 'Dashcam · moving'}</Badge>
          {v.synthetic ? <Badge variant="warning">SYNTHETIC</Badge> : <Badge variant="info">REAL</Badge>}
          {isClock && <Badge variant="accent">clock</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="t-caption min-w-0 flex-1 truncate" title={v.original_filename}>{v.original_filename}</span>
          {onMakePrimary && <Button size="sm" variant="ghost" onClick={onMakePrimary}>Make main</Button>}
        </div>
      </figcaption>
    </figure>
  );
}
