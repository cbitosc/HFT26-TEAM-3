import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Brand, Button, ThemeSwitcher } from '../ui-kit';
import { NAV_ITEMS, START_ROUTE } from './config';

const SECTION_TO_NAV = { top: null, problem: 'problem', 'how-it-works': 'how-it-works', evidence: 'evidence', timeline: 'timeline', correlation: 'contradictions', contradictions: 'contradictions', report: 'report', cta: null, about: null };

export function scrollToId(id, reduce) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

export default function LandingNavbar() {
  const reduce = useReducedMotion();
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const ids = Object.keys(SECTION_TO_NAV).filter((id) => id !== 'top');
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null; let bestRatio = 0;
      seen.forEach((r, id) => { if (r > bestRatio) { best = id; bestRatio = r; } });
      setActive(best ? SECTION_TO_NAV[best] : null);
    }, { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.1, 0.5, 1] });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id) => (e) => { e.preventDefault(); setOpen(false); scrollToId(id, reduce); };

  return (
    <motion.header className={`tl-nav ${compact ? 'is-compact' : ''}`} initial={reduce ? false : { y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      <div className="tl-nav-bar">
        <Brand name="TraceLine" to="/" />
        <nav className="tl-nav-links" aria-label="Landing sections">
          {NAV_ITEMS.map((it) => (
            <a key={it.id} href={`#${it.id}`} onClick={go(it.id)} aria-current={active === it.id ? 'true' : undefined} className={active === it.id ? 'is-active' : ''}>
              {it.label}
              {active === it.id && <motion.span layoutId="tl-nav-ind" className="tl-nav-ind" transition={{ duration: reduce ? 0 : 0.35 }} />}
            </a>
          ))}
        </nav>
        <div className="tl-nav-actions">
          <ThemeSwitcher align="right" />
          <Button as={Link} to={START_ROUTE} variant="primary" size="sm" rightIcon={ArrowUpRight} className="tl-nav-cta">Start investigation</Button>
          <button type="button" className="tl-nav-toggle" aria-expanded={open} aria-controls="tl-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div id="tl-mobile-menu" className="tl-mobile-menu" initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {NAV_ITEMS.map((it) => <a key={it.id} href={`#${it.id}`} onClick={go(it.id)} className={active === it.id ? 'is-active' : ''}>{it.label}</a>)}
            <Button as={Link} to={START_ROUTE} variant="primary" rightIcon={ArrowUpRight} onClick={() => setOpen(false)}>Start investigation</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
