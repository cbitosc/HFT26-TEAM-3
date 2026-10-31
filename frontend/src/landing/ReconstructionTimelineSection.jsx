import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { Camera, FileText, Route as RouteIcon, ScanSearch } from 'lucide-react';
import { DEMO_VIDEO } from './config';
import { EVENTS, fmtTime, mapToClip } from './data';
import { Label, Reveal } from './primitives';
import { useDemoVideo } from './VideoContext';

function Preview({ active }) {
  const ref = useRef(null);
  const v = useDemoVideo();
  const [failed, setFailed] = useState(false);
  const { register } = v;
  useEffect(() => { register('preview', ref.current); return () => register('preview', null); }, [register]);
  const mapped = mapToClip(active.t, v.duration);
  return (
    <div className="tl-preview">
      <div className="tl-preview-frame">
        {failed ? <div className="tl-vstate tl-vstate-err"><span>Preview unavailable</span></div> : (
          <video ref={ref} src={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster} muted playsInline preload="metadata" aria-label="Contextual preview of the demo recording"
            onLoadedMetadata={(e) => v.setDuration(e.currentTarget.duration)} onError={() => setFailed(true)} />
        )}
        <div className="tl-vignette" aria-hidden />
        <span className="tl-cam">{DEMO_VIDEO.camera}</span>
      </div>
      <dl className="tl-preview-meta tl-mono">
        <div><dt>Event time (illustrative)</dt><dd>{active.ts}</dd></div>
        <div><dt>Clip position</dt><dd>{mapped == null ? 'n/a' : fmtTime(mapped)} / {fmtTime(v.duration)}</dd></div>
      </dl>
      <p className="tl-note">The example events span 16.2 s and the demo clip is {v.duration ? `${v.duration.toFixed(1)} s` : 'shorter'}, so selecting an event seeks to a proportionally mapped, clamped position. It does not show the described event.</p>
    </div>
  );
}

function EventItem({ ev, index, active, onFocus, onSelect }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' });
  const focusRef = useRef(onFocus);
  focusRef.current = onFocus;
  useEffect(() => { if (inView) focusRef.current(ev); }, [inView, ev]);
  const review = ev.status === 'Awaiting review';
  return (
    <motion.li ref={ref} className={`tl-ev ${active ? 'is-active' : ''}`} initial={reduce ? false : { opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.6, delay: 0.05 }}>
      <span className="tl-ev-node" aria-hidden />
      <button type="button" className="tl-ev-btn" onClick={() => onSelect(ev)} aria-pressed={active} aria-label={`${ev.ts} ${ev.title}. Seek the video`}>
        <span className="tl-mono tl-ev-ts">{ev.ts}</span>
        <span className="tl-ev-title">{ev.title}</span>
        <span className="tl-ev-idx tl-mono">{String(index + 1).padStart(2, '0')}</span>
      </button>
      <motion.div className="tl-ev-detail" animate={{ opacity: active || reduce ? 1 : 0.45, y: active || reduce ? 0 : 8 }} transition={{ duration: 0.45 }}>
        <p>{ev.detail}</p>
        <ul className="tl-chips">
          <li><ScanSearch size={12} aria-hidden />{ev.category}</li>
          <li><Camera size={12} aria-hidden />{ev.camera}</li>
          <li><RouteIcon size={12} aria-hidden />{ev.tracks.length ? ev.tracks.join(' · ') : 'No tracks'}</li>
          <li><FileText size={12} aria-hidden />{ev.evidence}</li>
          <li className={review ? 'is-review' : ''}>{ev.status}</li>
        </ul>
      </motion.div>
    </motion.li>
  );
}

export default function ReconstructionTimelineSection() {
  const reduce = useReducedMotion();
  const listRef = useRef(null);
  const v = useDemoVideo();
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 65%', 'end 55%'] });
  const draw = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const scaleY = useTransform(reduce ? scrollYProgress : draw, [0, 1], [0, 1]);
  const { seekToEvent, setActiveEvent, duration } = v;
  const active = EVENTS.find((e) => e.id === v.activeEvent) || EVENTS[0];

  const onFocus = (ev) => {
    setActiveEvent(ev.id);
    const t = mapToClip(ev.t, duration);
    const pv = v.videos.current.get('preview');
    if (pv && t != null) { try { pv.currentTime = t; } catch { /* metadata not ready */ } }
  };
  const onSelect = (ev) => { seekToEvent(ev, duration); setActiveEvent(ev.id); };

  return (
    <section className="tl-section tl-tl" aria-labelledby="tl-tl-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>RECONSTRUCTION</Label>
          <h2 id="tl-tl-h">One clock.<br /><span>Every moment in order.</span></h2>
          <p>Scroll to follow the sequence. Each event keeps its source, its tracks and its review status. Select one to jump the recording to that point.</p>
          <p className="tl-illus">Illustrative example, not a real accident.</p>
        </Reveal>
        <div className="tl-tl-grid">
          <div className="tl-tl-side"><Preview active={active} /></div>
          <div className="tl-tl-list" ref={listRef}>
            <span className="tl-rail" aria-hidden />
            <motion.span className="tl-rail tl-rail-fill" style={{ scaleY }} aria-hidden />
            <ol>
              {EVENTS.map((ev, i) => <EventItem key={ev.id} ev={ev} index={i} active={ev.id === active.id} onFocus={onFocus} onSelect={onSelect} />)}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
