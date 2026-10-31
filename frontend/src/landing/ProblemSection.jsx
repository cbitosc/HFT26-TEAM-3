import { Cctv, Gauge, MessageSquareQuote, Smartphone, Video } from 'lucide-react';
import { SOURCE_LEDGER } from './data';
import { Label, Reveal } from './primitives';

const ICONS = { Video, Cctv, Smartphone, MessageSquareQuote, Gauge };

export default function ProblemSection() {
  return (
    <section id="problem" className="tl-section tl-problem" aria-labelledby="tl-prob-h">
      <div className="tl-wrap tl-problem-grid">
        <Reveal className="tl-sec-head">
          <Label>THE PROBLEM</Label>
          <h2 id="tl-prob-h">Accident evidence is never in one place.<br /><span>And never on one clock.</span></h2>
          <p>After a crash, the footage and accounts come from many sources: dashcams, CCTV, phones, witnesses and vehicle sensors. Each one records time in its own way, so none of them lines up with another.</p>
          <p>Today investigators piece them together by hand: scrubbing videos side by side, guessing offsets, and keeping notes in spreadsheets. It is slow, hard to check, and easy to get wrong.</p>
        </Reveal>
        <Reveal className="tl-ledger" delay={0.1}>
          <div className="tl-ledger-bar tl-mono"><span>SOURCE</span><span>HOW IT TELLS TIME</span></div>
          <ul>
            {SOURCE_LEDGER.map((s, i) => {
              const Icon = ICONS[s.icon];
              return (
                <Reveal as="li" key={s.kind} delay={0.15 + i * 0.08} y={14}>
                  <span className="tl-ledger-kind"><Icon size={16} aria-hidden />{s.kind}</span>
                  <span className="tl-ledger-clock">{s.clock}</span>
                </Reveal>
              );
            })}
          </ul>
          <p className="tl-note tl-ledger-note">Typical situation, shown for illustration.</p>
        </Reveal>
      </div>
    </section>
  );
}
