import { ArrowRight } from 'lucide-react';
import { FINDINGS, VERDICTS } from './data';
import { Label, Reveal, VerdictBadge } from './primitives';

export default function ContradictionsSection() {
  const [lead, ...rest] = FINDINGS;
  return (
    <section className="tl-section tl-contra" aria-labelledby="tl-con-h">
      <div className="tl-wrap">
        <Reveal className="tl-sec-head">
          <Label>CONTRADICTIONS AND GAPS</Label>
          <h2 id="tl-con-h">Where accounts disagree.<br /><span>And where nothing can be said.</span></h2>
          <p>Findings are labelled by how well the evidence supports them. They are prompts for an investigator, never verdicts. Illustrative example.</p>
        </Reveal>

        <Reveal className="tl-legend" as="ul" aria-label="Finding states">
          {Object.entries(VERDICTS).map(([k, v]) => <li key={k}><VerdictBadge result={k} /><span>{v.note}</span></li>)}
        </Reveal>

        <Reveal className="tl-lead">
          <div className="tl-lead-col">
            <span className="tl-lead-src tl-mono">WITNESS · {lead.refs[0]}</span>
            <blockquote>The vehicle stopped before entering the intersection.</blockquote>
          </div>
          <div className="tl-lead-mid" aria-hidden><span /><ArrowRight size={16} /><span /></div>
          <div className="tl-lead-col">
            <span className="tl-lead-src tl-mono">VIDEO · {lead.refs[1]}</span>
            <blockquote>The available recording shows movement through the observed interval.</blockquote>
          </div>
          <div className="tl-lead-out">
            <VerdictBadge result="contradicted" />
            <strong>{lead.outcome}</strong>
            <p>{lead.caveat}</p>
          </div>
        </Reveal>

        <ul className="tl-find">
          {rest.map((f, i) => (
            <Reveal as="li" key={f.id} delay={i * 0.06}>
              <VerdictBadge result={f.result} />
              <div>
                <h3>{f.claim}</h3>
                <p>{f.evidence}</p>
                <strong>{f.outcome}</strong>
                <span className="tl-ref tl-mono">{f.refs.join('  ·  ')}</span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
