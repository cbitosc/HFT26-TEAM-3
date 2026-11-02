import { useCallback, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '../ui-kit';
import { RECORDINGS } from './config';
import { fmtTime } from './data';
import { Label, Reveal } from './primitives';

/** One recording with its own play control and its own clock. It does not read or write any shared clock. */
function Recording({ clip, videoRef, status, setStatus }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const toggle = () => { const el = videoRef.current; if (!el) return; if (el.paused) { if (el.ended) el.currentTime = 0; el.play().catch(() => {}); } else el.pause(); };
  return (
    <figure className="tl-tile">
      <div className="tl-tile-frame">
        <video ref={videoRef} src={clip.src} poster={clip.poster} muted playsInline preload="metadata" loop={false} aria-label={`${clip.name}, ${clip.scene}`}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => setStatus(clip.id, 'error')} onCanPlay={() => setStatus(clip.id, 'ready')} onWaiting={() => setStatus(clip.id, 'loading')} />
        <div className="tl-vignette" aria-hidden />
        <figcaption className="tl-tile-cap"><strong>{clip.name}</strong><span>{clip.scene}</span></figcaption>
        {status === 'loading' && <span className="tl-spin tl-tile-spin" role="status" aria-label="Loading" />}
        {status === 'error' && <div className="tl-vstate tl-vstate-err" role="alert"><TriangleAlert size={16} />Source unavailable</div>}
        <button type="button" className="tl-ic tl-rec-play" onClick={toggle} aria-label={`${playing ? 'Pause' : 'Play'} ${clip.name}`} disabled={status === 'error'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <div className="tl-tile-clock tl-mono" aria-label="Own clock">Own clock · t = {fmtTime(t)}</div>
      </div>
      <ul className="tl-tile-chips"><li>Own clock</li><li className="is-warn">Offset not established</li><li className="is-warn">Not on a shared axis</li></ul>
    </figure>
  );
}

export default function DemoVideoSection() {
  const reduce = useReducedMotion();
  const sectionRef = useRef(null);
  const refs = useRef(RECORDINGS.clips.map(() => ({ current: null })));
  const [status, setStatusMap] = useState({});
  const setStatus = useCallback((id, s) => setStatusMap((m) => (m[id] === s ? m : { ...m, [id]: s })), []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['60% end', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.94]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.4]);

  const els = () => refs.current.map((r) => r.current).filter(Boolean);
  const allFailed = RECORDINGS.clips.every((c) => status[c.id] === 'error');
  const anyPlaying = () => els().some((el) => !el.paused && !el.ended);
  const [all, setAll] = useState(false);
  const toggleAll = () => { if (anyPlaying()) { els().forEach((el) => el.pause()); setAll(false); } else { els().forEach((el) => { if (el.ended) el.currentTime = 0; el.play().catch(() => {}); }); setAll(true); } };
  const retry = () => { setStatusMap({}); els().forEach((el) => el.load()); };

  return (
    <section id="evidence" ref={sectionRef} className="tl-section tl-demo" aria-labelledby="tl-demo-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>MULTI-SOURCE EVIDENCE</Label>
          <h2 id="tl-demo-h">Five recordings.<br /><span>Five separate clocks.</span></h2>
          <p>These five recordings are different scenes from different places and times. None has a known relation to another, so TraceLine keeps each on its own clock and will not place any of them on a shared axis by guesswork. To combine two, an investigator states an offset and how certain it is.</p>
        </Reveal>

        <motion.div className="tl-stage" style={{ scale, opacity }}>
          <div className="tl-stage-note" role="note"><TriangleAlert size={14} aria-hidden />Real accident-benchmark footage. The crash is not located in these 12-second windows, and the timeline events further down are illustrative.</div>
          <div className="tl-rec-grid">
            {RECORDINGS.clips.map((c, i) => <Recording key={c.id} clip={c} videoRef={refs.current[i]} status={status[c.id]} setStatus={setStatus} />)}
          </div>

          {allFailed && (
            <div className="tl-vstate tl-vstate-err tl-stage-err" role="alert">
              <TriangleAlert size={20} /><strong>The demo recordings could not be loaded.</strong>
              <span>The sections below still work from the stored event data.</span>
              <Button variant="outline" size="sm" icon={RotateCcw} onClick={retry} className="!text-white">Retry</Button>
            </div>
          )}

          <div className="tl-controls">
            <button type="button" className="tl-ic" onClick={toggleAll} aria-label={all ? 'Pause all recordings' : 'Play all recordings'} disabled={allFailed}>{all ? <Pause size={18} /> : <Play size={18} />}</button>
            <span className="tl-dim t-small">Play all five together to compare them. Each keeps its own time.</span>
          </div>
        </motion.div>

        <p className="tl-credit">
          Footage: <a href={RECORDINGS.attributionUrl} target="_blank" rel="noreferrer noopener">{RECORDINGS.attribution}</a>, first 12 s of five clips, re-encoded to 640 px, no audio. Category names are the benchmark's own. All muted. No detection overlay is drawn on these clips.
        </p>
      </div>
    </section>
  );
}
