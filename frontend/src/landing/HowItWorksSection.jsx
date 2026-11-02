import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { MULTI_SOURCE } from './config';
import { STEPS } from './data';
import { Label, Reveal } from './primitives';

const fmtOff = (ms) => (ms === 0 ? '0 ms' : `${ms > 0 ? '+' : '−'}${Math.abs(ms).toFixed(1)} ms`);

export default function HowItWorksSection() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 60%'] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0, 1]);
  return (
    <section id="how-it-works" className="tl-section tl-how" aria-labelledby="tl-how-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>WHAT TRACELINE DOES</Label>
          <h2 id="tl-how-h">Many sources in.<br /><span>One reviewed timeline out.</span></h2>
          <p>TraceLine is a website for investigators. It brings video from multiple sources, witness statements and sensor logs into one case, puts them on a shared time axis, and reconstructs what happened in order. It flags contradictions and evidence gaps for a person to review.</p>
        </Reveal>
        <div className="tl-steps" ref={ref}>
          <span className="tl-steps-rail" aria-hidden />
          <motion.span className="tl-steps-rail tl-steps-fill" style={{ scaleX }} aria-hidden />
          <ol>
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 0.1}>
                <span className="tl-step-n tl-mono">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {i === 1 && (
                  <table className="tl-offsets tl-mono">
                    <caption>Example offsets to the reference clock</caption>
                    <thead><tr><th scope="col">Source</th><th scope="col">Offset</th><th scope="col">Bound</th></tr></thead>
                    <tbody>
                      {MULTI_SOURCE.cameras.map((c) => (
                        <tr key={c.id}><td>{c.name}</td><td>{c.reference ? 'reference' : fmtOff(c.offsetMs)}</td><td>±{MULTI_SOURCE.boundMs} ms</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Reveal>
            ))}
          </ol>
        </div>
        <p className="tl-principle tl-how-note"><strong>TraceLine supports an investigation. It never decides fault.</strong> Every finding links to its source and waits for investigator review.</p>
      </div>
    </section>
  );
}
