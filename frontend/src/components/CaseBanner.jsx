import { Alert } from '../ui-kit';

/** Banner for the data designation of the selected case. Real cases show nothing here; the badge in the header says REAL.
 *  Synthetic text is only ever rendered for a case whose designation (or evidence) is synthetic or mixed. */
export default function CaseBanner({ designation, warning }) {
  if (warning) return <Alert variant="danger" className="mb-3" title="Real and synthetic evidence are mixed in this case">{warning}</Alert>;
  if (designation === 'synthetic') {
    return <Alert variant="warning" className="mb-3" title="Synthetic demonstration data">Every source in this case was generated. Findings describe the system's logic on a synthetic world, not a real incident.</Alert>;
  }
  if (designation === 'staged') {
    return <Alert variant="info" className="mb-3" title="Staged or recreated footage">This case was declared staged. It is not a record of a real incident.</Alert>;
  }
  if (designation === 'mixed') {
    return <Alert variant="danger" className="mb-3" title="Mixed real and synthetic data">This case is declared mixed. Do not read its findings as describing a real incident.</Alert>;
  }
  return null;
}
