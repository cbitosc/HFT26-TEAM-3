import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Film, Gauge, MessageSquareQuote } from 'lucide-react';
import { ILLUSTRATIVE_SPAN_S } from './config';
import { CORRELATIONS, EVENTS } from './data';
import { Label, Reveal, VerdictBadge } from './primitives';

const ICON = { Video: Film, Witness: MessageSquareQuote, Sensor: Gauge };
const pct = (t) => `${(t / ILLUSTRATIVE_SPAN_S) * 100}%`;
const INTERVAL = [5.2, 11.8];

export default function EvidenceCorrelationSection() {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState('video');
  return (
    <section className="tl-section tl-ev-sec" aria-labelledby="tl-evc-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>EVIDENCE CORRELATION</Label>
          <h2 id="tl-evc-h">Three kinds of evidence.<br /><span>One interval.</span></h2>
          <p>Video, witness statements and sensor files are each placed on the same timeline. For any interval, TraceLine shows what each source covers and whether it supports, conflicts with, or cannot verify the others.</p>
        </Reveal>

        <Reveal className="tl-lanes" aria-label="Evidence coverage on the timeline, illustrative">
          <div className="tl-lanes-axis tl-mono" aria-hidden>
            {EVENTS.map((e) => <span key={e.id} style={{ left: pct(e.t) }}>{e.ts.slice(0, 5)}</span>)}
          </div>
          <div className="tl-lanes-body">
            <motion.div className="tl-band" style={{ left: pct(INTERVAL[0]), width: `calc(${pct(INTERVAL[1])} - ${pct(INTERVAL[0])})`, originY: 0 }}
              initial={reduce ? false : { scaleY: 0, opacity: 0 }} whileInView={{ scaleY: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }}>
              <span className="tl-mono">Interval under review · 00:05.2–00:11.8</span>
            </motion.div>
            {CORRELATIONS.map((c, i) => {
              const Icon = ICON[c.kind];
              return (
                <button key={c.id} type="button" className={`tl-lane ${sel === c.id ? 'is-sel' : ''}`} onClick={() => setSel(c.id)} aria-pressed={sel === c.id}>
                  <span className="tl-lane-name"><Icon size={14} aria-hidden />{c.kind}</span>
                  <span className="tl-lane-track">
                    <motion.span className={`tl-lane-bar tl-bar-${c.result}`} style={{ left: pct(c.from), width: `calc(${pct(c.to)} - ${pct(c.from)})`, originX: 0 }}
                      initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.4 + i * 0.25, ease: [0.22, 1, 0.36, 1] }} />
                  </span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <ul className="tl-corr">
          {CORRELATIONS.map((c, i) => (
            <Reveal as="li" key={c.id} delay={i * 0.08} className={sel === c.id ? 'is-sel' : ''}>
              <div className="tl-corr-top"><span className="tl-corr-kind">{c.kind}</span><VerdictBadge result={c.result} /></div>
              <p>{c.text}</p>
              <span className="tl-ref tl-mono">{c.ref}</span>
            </Reveal>
          ))}
        </ul>
        <Reveal className="tl-principle"><strong>A missing observation is not a refutation.</strong> If a camera did not capture something, that does not make a witness wrong. The statement stays “not independently verified” until a source can actually check it.</Reveal>
      </div>
    </section>
  );
}
