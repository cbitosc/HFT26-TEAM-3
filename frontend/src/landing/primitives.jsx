import { motion, useReducedMotion } from 'framer-motion';
import { VERDICTS } from './data';
import { CircleCheck, CircleDashed, CircleHelp, CircleMinus, TriangleAlert } from 'lucide-react';

export const Label = ({ children, className = '' }) => (
  <span className={`tl-label ${className}`}><i aria-hidden />{children}</span>
);

export const Reveal = ({ children, delay = 0, y = 24, className = '', as = 'div', ...rest }) => {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }} {...rest}>
      {children}
    </M>
  );
};

const ICONS = { ok: CircleCheck, warn: CircleMinus, bad: TriangleAlert, mute: CircleHelp, gap: CircleDashed };

export function VerdictBadge({ result }) {
  const v = VERDICTS[result];
  const Icon = ICONS[v.tone];
  return <span className={`tl-verdict tl-verdict-${v.tone}`}><Icon size={13} aria-hidden />{v.label}</span>;
}
