import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Eye, EyeOff, Maximize2, Pause, Play, RotateCcw, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { Button } from '../ui-kit';
import { DEMO_VIDEO } from './config';
import { fmtTime } from './data';
import { Label, Reveal } from './primitives';
import { useDemoVideo } from './VideoContext';

const PATH = [[0, 8, 62], [0.32, 30, 55], [0.52, 46, 48], [0.73, 56, 42], [0.9, 70, 40], [1, 78, 36]];
const BOX_W = 14;
const at = (p) => {
  const q = Math.min(1, Math.max(0, p));
  for (let i = 1; i < PATH.length; i++) {
    if (q <= PATH[i][0]) {
      const [p0, x0, y0] = PATH[i - 1]; const [p1, x1, y1] = PATH[i]; const k = (q - p0) / (p1 - p0);
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
  }
  return [PATH[PATH.length - 1][1], PATH[PATH.length - 1][2]];
};

function Overlay({ videoRef, show }) {
  const x = useMotionValue('0%'); const y = useMotionValue('0%');
  const stamp = useRef(null);
  useEffect(() => {
    let raf; 
    const tick = () => {
      const v = videoRef.current;
      if (v && v.duration) {
        const [l, t] = at(v.currentTime / v.duration);
        x.set(`${(l / BOX_W) * 100}%`); y.set(`${(t / 14) * 100}%`);
        if (stamp.current) stamp.current.textContent = fmtTime(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, x, y]);
  if (!show) return null;
  return (
    <div className="tl-ov" aria-hidden>
      <motion.div className="tl-ov-box" style={{ x, y }}>
        <b /><b /><b /><b />
        <span ref={stamp} className="tl-mono" />
      </motion.div>
      <span className="tl-ov-tag"><TriangleAlert size={11} /> Illustrative demo overlay · not model output</span>
    </div>
  );
}

export default function DemoVideoSection() {
  const reduce = useReducedMotion();
  const sectionRef = useRef(null);
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const v = useDemoVideo();
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [muted, setMuted] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const { register, setDuration, setTime, setPlaying } = v;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['60% end', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.35]);

  useEffect(() => { register('main', ref.current); return () => register('main', null); }, [register]);

  const toggle = useCallback(() => {
    const el = ref.current; if (!el) return;
    if (el.paused) el.play().catch(() => setStatus('error')); else el.pause();
  }, []);

  const onMeta = (e) => { setDuration(e.currentTarget.duration); setStatus('ready'); };
  const onTime = (e) => { if (!scrubbing) setTime(e.currentTarget.currentTime); };
  const retry = () => { setStatus('loading'); ref.current?.load(); };
  const full = () => (wrapRef.current?.requestFullscreen || wrapRef.current?.webkitRequestFullscreen)?.call(wrapRef.current);
  const dur = v.duration;

  return (
    <section id="product" ref={sectionRef} className="tl-section tl-demo" aria-labelledby="tl-demo-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>THE RECORDING</Label>
          <h2 id="tl-demo-h">Start from the footage.<br /><span>Not from a conclusion.</span></h2>
          <p>Every reconstruction begins with a source recording. Play it, mark a moment, and TraceLine ties each finding back to the frame it came from.</p>
        </Reveal>

        <motion.div ref={wrapRef} className="tl-player" style={{ scale, opacity }}>
          <div className="tl-player-frame">
            <video ref={ref} className="tl-video" src={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster} muted={muted} playsInline preload="metadata" aria-label={`Demo recording, ${DEMO_VIDEO.camera}`}
              onLoadedMetadata={onMeta} onTimeUpdate={onTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
              onError={() => setStatus('error')} onWaiting={() => status === 'ready' && setStatus('loading')} onCanPlay={() => setStatus('ready')} />
            <div className="tl-vignette" aria-hidden />
            <div className="tl-cam"><i aria-hidden className={v.playing ? 'rec' : ''} />{DEMO_VIDEO.camera}</div>
            <Overlay videoRef={ref} show={overlay && status !== 'error' && DEMO_VIDEO.detections == null} />
            {status === 'loading' && <div className="tl-vstate" role="status"><span className="tl-spin" />Loading recording…</div>}
            {status === 'error' && (
              <div className="tl-vstate tl-vstate-err" role="alert">
                <TriangleAlert size={20} />
                <strong>The demo recording could not be loaded.</strong>
                <span>The reconstruction below still works from the stored event data.</span>
                <Button variant="outline" size="sm" icon={RotateCcw} onClick={retry} className="!text-white">Retry</Button>
              </div>
            )}
            {status !== 'error' && !v.playing && (
              <button type="button" className="tl-bigplay" onClick={toggle} aria-label="Play demo recording"><Play size={26} fill="currentColor" /></button>
            )}
          </div>
          <div className="tl-controls">
            <button type="button" className="tl-ic" onClick={toggle} aria-label={v.playing ? 'Pause' : 'Play'} disabled={status === 'error'}>{v.playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <span className="tl-mono tl-time">{fmtTime(v.time)}</span>
            <input className="tl-range" type="range" min={0} max={dur || 0} step={0.05} value={Math.min(v.time, dur || 0)} disabled={!dur}
              aria-label="Seek" aria-valuetext={`${fmtTime(v.time)} of ${fmtTime(dur)}`}
              style={{ '--p': dur ? `${(v.time / dur) * 100}%` : '0%' }}
              onPointerDown={() => setScrubbing(true)} onPointerUp={() => setScrubbing(false)}
              onChange={(e) => v.seek(Number(e.target.value))} />
            <span className="tl-mono tl-time tl-dim">{fmtTime(dur)}</span>
            <button type="button" className="tl-ic" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={!muted}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
            <button type="button" className="tl-ic" onClick={() => setOverlay((o) => !o)} aria-label={overlay ? 'Hide illustrative overlay' : 'Show illustrative overlay'} aria-pressed={overlay}>{overlay ? <Eye size={17} /> : <EyeOff size={17} />}</button>
            <button type="button" className="tl-ic tl-hide-sm" onClick={full} aria-label="Fullscreen"><Maximize2 size={16} /></button>
          </div>
        </motion.div>

        <p className="tl-credit">
          Demo clip: <a href={DEMO_VIDEO.attributionUrl} target="_blank" rel="noreferrer noopener">{DEMO_VIDEO.attribution}</a>. Muted by default.
          {DEMO_VIDEO.detections == null && ' The moving marker is an illustrative demo overlay; no detection data is attached to this clip.'}
        </p>
      </div>
    </section>
  );
}
