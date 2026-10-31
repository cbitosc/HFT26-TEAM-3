import { ProgressBar } from '../components/Progress';

/** Labeled bars. items: [{ label, value (0-1), tone? }] */
export default function ProgressChart({ items }) {
  return (
    <ul className="space-y-4">
      {items.map((it) => (
        <li key={it.label}>
          <ProgressBar label={it.label} value={it.value} tone={it.tone} showValue />
        </li>
      ))}
    </ul>
  );
}
