import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Maximize2, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '../ui-kit';
import { DEMO_VIDEO, MULTI_SOURCE } from './config';
import { fmtTime } from './data';
import { Label, Reveal } from './primitives';
import { useDemoVideo } from './VideoContext';

const utc = (epoch) => {
  const d = new Date(epoch * 1000);
  return `${d.toISOString().slice(11, 19)}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
};
const fmtOff = (ms) => (ms === 0 ? 'reference' : `${ms > 0 ? '+' : '−'}${Math.abs(ms).toFixed(1)} ms`);

function Tile({ id, name, type, src, poster, clock, chips, free, onMeta, onTime, onEnded, onPlayState, tileRef, status, setStatus }) {
  const v = useDemoVideo();
  const ref = useRef(null);
  useEffect(() => {
    v.register(id, ref.current);
    if (tileRef) tileRef.current = ref.current;
    return () => v.register(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <figure className={`tl-tile ${free ? 'is-free' : ''}`}>
      <div className="tl-tile-frame">
        <video ref={ref} src={src} poster={poster} muted playsInline preload="metadata" aria-label={`${name}, ${type}`}
          onLoadedMetadata={(e) => { onMeta?.(e.currentTarget); setStatus(id, 'ready'); }}
          onTimeUpdate={(e) => onTime?.(e.currentTarget)} onEnded={onEnded} onPlay={() => onPlayState?.(true)} onPause={() => onPlayState?.(false)}
          onError={() => setStatus(id, 'error')} onCanPlay={() => setStatus(id, 'ready')} onWaiting={() => setStatus(id, 'loading')} />
        <div className="tl-vignette" aria-hidden />
        <figcaption className="tl-tile-cap">
          <strong>{name}</strong>
          <span>{type}</span>
        </figcaption>
        {status === 'loading' && <span className="tl-spin tl-tile-spin" role="status" aria-label="Loading" />}
        {status === 'error' && <div className="tl-vstate tl-vstate-err" role="alert"><TriangleAlert size={16} />Source unavailable</div>}
        <div className="tl-tile-clock tl-mono" aria-label="Source clock">{clock}</div>
      </div>
      <ul className="tl-tile-chips">{chips.map((c) => <li key={c.t} className={c.warn ? 'is-warn' : ''}>{c.t}</li>)}</ul>
    </figure>
  );
}

export default function DemoVideoSection() {
  const reduce = useReducedMotion();
  const sectionRef = useRef(null);
  const wrapRef = useRef(null);
  const masterRef = useRef(null);
  const v = useDemoVideo();
  const [status, setStatusMap] = useState({});
  const [scrubbing, setScrubbing] = useState(false);
  const { setDuration, setTime, setPlaying, videos } = v;
  const setStatus = useCallback((id, s) => setStatusMap((m) => (m[id] === s ? m : { ...m, [id]: s })), []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['60% end', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.94]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.4]);

  const synced = () => [...videos.current.entries()].filter(([k]) => k.startsWith('ms:')).map(([, el]) => el);
  const playable = () => [...videos.current.entries()].filter(([k]) => k.startsWith('ms:') || k.startsWith('free')).map(([, el]) => el);
  const allFailed = MULTI_SOURCE.cameras.every((c) => status[`ms:${c.id}`] === 'error');

  const toggle = useCallback(() => {
    const m = masterRef.current; if (!m) return;
    if (m.paused) {
      if (m.ended || m.currentTime >= m.duration - 0.05) v.seek(0);
      playable().forEach((el) => el.play().catch(() => {}));
    } else playable().forEach((el) => el.pause());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.seek]);

  // Keep the synchronised cameras on the master's clock while playing.
  useEffect(() => {
    if (!v.playing) return undefined;
    let raf;
    const tick = () => {
      const m = masterRef.current;
      if (m) synced().forEach((el) => { if (el !== m && Math.abs(el.currentTime - m.currentTime) > 0.15) el.currentTime = m.currentTime; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.playing]);

  const retry = () => { setStatusMap({}); playable().forEach((el) => el.load()); };
  const full = () => (wrapRef.current?.requestFullscreen || wrapRef.current?.webkitRequestFullscreen)?.call(wrapRef.current);
  const dur = v.duration;
  const t = v.time;
  const free = DEMO_VIDEO;

  return (
    <section id="evidence" ref={sectionRef} className="tl-section tl-demo" aria-labelledby="tl-demo-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>MULTI-SOURCE EVIDENCE</Label>
          <h2 id="tl-demo-h">Five recordings.<br /><span>One shared time axis.</span></h2>
          <p>Four cameras are played here on one clock with a single scrubber. A fifth recording is shown beside them as what an unaligned source looks like: it has no known relation to the others, so TraceLine will not place it on the axis by guesswork.</p>
        </Reveal>

        <motion.div ref={wrapRef} className="tl-stage" style={{ scale, opacity }}>
          <div className="tl-stage-note" role="note"><TriangleAlert size={14} aria-hidden />Real footage, but no crash is located in this window. The timeline events below are illustrative.</div>
          <div className="tl-stage-body">
            <div className="tl-tiles">
              {MULTI_SOURCE.cameras.map((c, i) => (
                <Tile key={c.id} id={`ms:${c.id}`} name={c.name} type={c.type} src={c.src} poster={c.poster} tileRef={i === 0 ? masterRef : undefined}
                  status={status[`ms:${c.id}`]} setStatus={setStatus}
                  clock={`${utc(c.startEpoch + (dur ? Math.min(t, dur) : 0))} UTC`}
                  chips={[{ t: `Offset ${fmtOff(c.offsetMs)}` }, { t: `±${MULTI_SOURCE.boundMs} ms` }, { t: MULTI_SOURCE.clockLabel }]}
                  onMeta={i === 0 ? (el) => setDuration(el.duration) : undefined}
                  onTime={i === 0 ? (el) => { if (!scrubbing) setTime(el.currentTime); } : undefined}
                  onEnded={i === 0 ? () => { playable().forEach((el) => el.pause()); setPlaying(false); } : undefined}
                  onPlayState={i === 0 ? setPlaying : undefined} />
              ))}
            </div>
            <aside className="tl-unaligned">
              <Tile id="free:intersection" name={free.camera} type={free.type} src={free.src} poster={free.poster} status={status['free:intersection']} setStatus={setStatus}
                free clock="Own clock · t = 00:00" chips={[{ t: 'Offset not established', warn: true }, { t: 'Not on the shared axis', warn: true }]} />
              <div className="tl-align-note">
                <strong>Why the fifth is different</strong>
                <p>The four gantry cameras are time-synchronised by their operator, and each frame carries a timestamp, so their offsets are measured and bounded. This recording has no such record. TraceLine would ask an investigator to declare an offset and its uncertainty.</p>
              </div>
            </aside>
          </div>

          {allFailed && (
            <div className="tl-vstate tl-vstate-err tl-stage-err" role="alert">
              <TriangleAlert size={20} /><strong>The demo recordings could not be loaded.</strong>
              <span>The sections below still work from the stored event data.</span>
              <Button variant="outline" size="sm" icon={RotateCcw} onClick={retry} className="!text-white">Retry</Button>
            </div>
          )}

          <div className="tl-controls">
            <button type="button" className="tl-ic" onClick={toggle} aria-label={v.playing ? 'Pause all sources' : 'Play all sources'} disabled={allFailed}>{v.playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <span className="tl-mono tl-time">{fmtTime(t)}</span>
            <input className="tl-range" type="range" min={0} max={dur || 0} step={0.04} value={Math.min(t, dur || 0)} disabled={!dur}
              aria-label="Shared scrubber" aria-valuetext={`${fmtTime(t)} of ${fmtTime(dur)}`}
              style={{ '--p': dur ? `${(t / dur) * 100}%` : '0%' }}
              onPointerDown={() => setScrubbing(true)} onPointerUp={() => setScrubbing(false)}
              onChange={(e) => v.seek(Number(e.target.value))} />
            <span className="tl-mono tl-time tl-dim">{fmtTime(dur)}</span>
            <button type="button" className="tl-ic tl-hide-sm" onClick={full} aria-label="Fullscreen"><Maximize2 size={16} /></button>
          </div>
        </motion.div>

        <p className="tl-credit">
          Cameras: <a href={MULTI_SOURCE.attributionUrl} target="_blank" rel="noreferrer noopener">{MULTI_SOURCE.attribution}</a>. {MULTI_SOURCE.attributionLong}
          {' '}Fifth clip: <a href={DEMO_VIDEO.attributionUrl} target="_blank" rel="noreferrer noopener">{DEMO_VIDEO.attribution}</a>. All muted. Offsets are measured from the dataset's per-frame timestamps, not inferred from the pictures. No detection overlay is drawn: the tracks available for this window are in road coordinates and are not projected onto the image here.
        </p>
      </div>
    </section>
  );
}
