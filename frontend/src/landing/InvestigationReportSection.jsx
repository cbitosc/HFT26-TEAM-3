import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '../ui-kit';
import { EVENTS, FINDINGS, REPORT } from './data';
import { Label, Reveal, VerdictBadge } from './primitives';

const INDEX = ['Incident overview', 'Timeline', 'Key findings', 'Evidence references', 'Contradictions', 'Unresolved questions', 'Report preview'];

export default function InvestigationReportSection() {
  return (
    <section className="tl-section tl-report" aria-labelledby="tl-rep-h">
      <div className="tl-wrap tl-report-grid">
        <Reveal className="tl-sec-head tl-report-head">
          <Label>INVESTIGATION REPORT</Label>
          <h2 id="tl-rep-h">A report that shows its work.</h2>
          <p>Reports are generated from stored evidence and findings a reviewer has accepted. Every statement links back to its source, and open questions are listed rather than hidden.</p>
          <ol className="tl-index">{INDEX.map((s, i) => <li key={s}><span className="tl-mono">{String(i + 1).padStart(2, '0')}</span>{s}</li>)}</ol>
          <p className="tl-note">The report supports an investigation. It does not assign fault or legal responsibility.</p>
        </Reveal>

        <Reveal className="tl-paper" delay={0.1}>
          <div className="tl-paper-bar tl-mono"><span>REPORT PREVIEW · ILLUSTRATIVE</span><span>DRAFT · reviewer sign-off pending</span></div>
          <article>
            <h3>1 · Incident overview</h3>
            <p>{REPORT.overview} 1 recording, 1 witness statement, 0 sensor files.</p>
            <h3>2 · Timeline</h3>
            <table className="tl-table"><tbody>
              {EVENTS.map((e) => <tr key={e.id}><td className="tl-mono">{e.ts}</td><td>{e.title}</td><td className="tl-mono tl-dim">{e.evidence}</td></tr>)}
            </tbody></table>
            <h3>3 · Key findings</h3>
            <ul className="tl-paper-find">
              {FINDINGS.slice(0, 3).map((f) => <li key={f.id}><VerdictBadge result={f.result} /><span>{f.outcome}</span></li>)}
            </ul>
            <h3>4–5 · Evidence references and contradictions</h3>
            <p className="tl-dim">VID-001, WIT-002 stmt 1. One potential inconsistency awaits investigator review.</p>
            <h3>6 · Unresolved questions</h3>
            <ul className="tl-open">{REPORT.unresolved.map((u) => <li key={u}>{u}</li>)}</ul>
          </article>
          <div className="tl-paper-foot"><Button as={Link} to="/reports" variant="outline" size="sm" icon={Download}>Open reports</Button></div>
        </Reveal>
      </div>
    </section>
  );
}
