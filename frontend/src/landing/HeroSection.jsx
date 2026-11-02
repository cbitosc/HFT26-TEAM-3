import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Button } from '../ui-kit';
import { START_ROUTE } from './config';
import { scrollToId } from './LandingNavbar';

const PATHS = [
  { d: 'M-20 420 C 180 380, 300 300, 520 280 S 860 180, 1220 120', delay: 0.9 },
  { d: 'M-20 520 C 220 500, 420 470, 640 380 S 980 300, 1220 330', delay: 1.3 },
  { d: 'M300 640 C 380 520, 560 430, 700 300 S 900 120, 960 -20', delay: 1.7 },
];
const STAMPS = [
  { t: '00:05.200', x: '52%', y: '72%' },
  { t: '00:11.800', x: '55%', y: '44%' },
  { t: '00:16.200', x: '72%', y: '24%' },
];

function Clock() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setS(((performance.now() - t0) / 1000) % 60), 100);
    return () => clearInterval(id);
  }, []);
  return <span className="tl-mono">00:{s.toFixed(3).padStart(6, '0')}</span>;
}

export default function HeroSection() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yGrid = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90]);
  const yCopy = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -40]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0.2]);
  const item = (i) => ({ initial: reduce ? false : { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] } });

  return (
    <section id="top" ref={ref} className="tl-hero" aria-labelledby="tl-hero-h">
      <motion.div className="tl-hero-field" style={{ y: yGrid }} aria-hidden>
        <div className="tl-grid" />
        <div className="tl-road" />
        <svg className="tl-tracks" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice">
          {PATHS.map((p, i) => (
            <motion.path key={i} d={p.d} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray={i === 2 ? '3 6' : undefined}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: i === 0 ? 0.7 : 0.35 }} transition={{ duration: 2.4, delay: p.delay, ease: 'easeInOut' }} />
          ))}
        </svg>
        {STAMPS.map((s, i) => (
          <motion.span key={s.t} className="tl-stamp" style={{ left: s.x, top: s.y }} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 + i * 0.4, duration: 0.6 }}>
            <i />{s.t}
          </motion.span>
        ))}
        {!reduce && <div className="tl-scan" />}
      </motion.div>

      <motion.div className="tl-hero-copy tl-wrap" style={{ y: yCopy, opacity: fade }}>
        <motion.p className="tl-label" {...item(0)}><i aria-hidden />AI-POWERED ACCIDENT INVESTIGATION</motion.p>
        <motion.h1 id="tl-hero-h" {...item(1)}>Reconstruct{' '}<br />What Really{' '}<br /><em>Happened.</em></motion.h1>
        <motion.p className="tl-what" {...item(2)}>TraceLine combines footage from multiple cameras and sources into one synchronized accident timeline.</motion.p>
        <motion.p className="tl-lede" {...item(2)}>Turn fragmented accident evidence into a chronological, traceable reconstruction.</motion.p>
        <motion.ul className="tl-srcs" aria-label="Evidence sources" {...item(3)}><li>Dashcam</li><li>CCTV</li><li>Phone</li><li>Witness</li><li>Sensor</li><li className="tl-srcs-to" aria-hidden>→ one clock → one timeline</li></motion.ul>
        <motion.div className="tl-cta-row" {...item(3)}>
          <Button as="a" href="#evidence" variant="primary" size="lg" rightIcon={ArrowDown} onClick={(e) => { e.preventDefault(); scrollToId('evidence', reduce); }}>Explore the reconstruction</Button>
          <Button as={Link} to={START_ROUTE} variant="outline" size="lg" rightIcon={ArrowUpRight}>Start an investigation</Button>
        </motion.div>
        <motion.div className="tl-hero-meta" {...item(4)} aria-hidden>
          <span>5 SOURCES</span><span>T+ <Clock /></span><span>1 CLOCK</span><span>ILLUSTRATIVE</span>
        </motion.div>
      </motion.div>
    </section>
  );
}
