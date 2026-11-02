import { useEffect, useRef } from 'react';
import { cn } from '../utils/cn';

/**
 * Canvas background that reacts to the pointer, drawn in the current theme's colours (it re-reads them when the theme or accent changes).
 *   variant="dots"     a dot grid that swells, brightens and bends away from the cursor
 *   variant="network"  drifting particles that connect to each other and to the cursor
 * Place it inside a `relative` parent (it fills it) or give it `fixed inset-0`. It ignores pointer events, pauses when off screen or when the
 * tab is hidden, and under prefers-reduced-motion it draws one still frame.
 */
export default function InteractiveBackground({ variant = 'dots', spacing = 30, intensity = 1, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mouse = { x: -9999, y: -9999 };
    let w = 0, h = 0, raf = 0, onScreen = true, particles = [], colors;

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const rgb = (n, fallback) => (cs.getPropertyValue(n).trim() || fallback).replace(/\s+/g, ',');
      colors = { accent: rgb('--accent', '34 211 238'), muted: rgb('--fg-3', '120 128 138') };
    };
    const rgba = (c, a) => `rgba(${c},${Math.max(0, Math.min(1, a * intensity))})`;

    const seed = () => {
      const n = Math.round((w * h) / 16000);
      particles = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 }));
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(performance.now());
    };

    const drawDots = (t) => {
      const R = 150;
      for (let gx = spacing / 2; gx < w; gx += spacing) {
        for (let gy = spacing / 2; gy < h; gy += spacing) {
          const dx = gx - mouse.x, dy = gy - mouse.y;
          const d = Math.hypot(dx, dy);
          const k = Math.max(0, 1 - d / R);
          const wave = reduce ? 0 : Math.sin(t / 1400 + gx * 0.012 + gy * 0.012) * 0.5;
          const push = k * k * 14;
          const x = gx + (d ? (dx / d) * push : 0);
          const y = gy + (d ? (dy / d) * push : 0);
          ctx.fillStyle = k > 0.02 ? rgba(colors.accent, 0.35 + k * 0.65) : rgba(colors.muted, 0.28 + wave * 0.08);
          ctx.beginPath();
          ctx.arc(x, y, 1.1 + wave * 0.25 + k * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawNetwork = () => {
      for (const p of particles) {
        if (!reduce) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
      }
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) { ctx.strokeStyle = rgba(colors.muted, (1 - d / 120) * 0.35); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 170) { ctx.strokeStyle = rgba(colors.accent, (1 - dm / 170) * 0.8); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        ctx.fillStyle = dm < 170 ? rgba(colors.accent, 0.9) : rgba(colors.muted, 0.5);
        ctx.beginPath(); ctx.arc(a.x, a.y, dm < 170 ? 2.2 : 1.5, 0, Math.PI * 2); ctx.fill();
      }
    };

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      if (variant === 'network') drawNetwork(); else drawDots(t);
    }
    const loop = (t) => {
      if (onScreen && !document.hidden) draw(t);
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      if (reduce) draw(performance.now());
    };
    const onLeave = () => { mouse.x = mouse.y = -9999; if (reduce) draw(performance.now()); };

    readColors();
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; });
    io.observe(canvas);
    const mo = new MutationObserver(() => { readColors(); if (reduce) draw(performance.now()); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    if (!reduce) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [variant, spacing, intensity]);

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />;
}
