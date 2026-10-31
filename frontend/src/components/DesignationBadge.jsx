import { Badge } from '../ui-kit';

const MAP = {
  real: { label: 'REAL', variant: 'info', title: 'Real incident footage' },
  staged: { label: 'STAGED', variant: 'neutral', title: 'Staged or recreated footage' },
  synthetic: { label: 'SYNTHETIC', variant: 'warning', title: 'Generated demonstration data' },
  mixed: { label: 'MIXED', variant: 'danger', title: 'Contains both real and synthetic evidence' },
};

/** Real and synthetic cases are always distinguishable, in text as well as colour. */
export default function DesignationBadge({ designation, className }) {
  const m = MAP[designation] || { label: String(designation || 'UNKNOWN').toUpperCase(), variant: 'neutral', title: '' };
  return <span title={m.title}><Badge variant={m.variant} className={className}>{m.label}</Badge></span>;
}
