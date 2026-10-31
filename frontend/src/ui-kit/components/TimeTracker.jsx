import { useEffect, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { cn } from '../utils/cn';

const pad = (n) => String(n).padStart(2, '0');
export const formatClock = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

/**
 * Stopwatch card. Starts paused unless `autoStart`. onStop(seconds) fires when the stop button is pressed (then the clock resets).
 * `running` / `onRunningChange` make it controlled, e.g. so a "Start meeting" button elsewhere can start it.
 */
export default function TimeTracker({ label = 'Time tracker', initial = 0, autoStart = false, running: controlled, onRunningChange, onStop, className }) {
  const [seconds, setSeconds] = useState(initial);
  const [own, setOwn] = useState(autoStart);
  const running = controlled ?? own;
  const setRunning = (v) => { setOwn(v); onRunningChange?.(v); };

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  return (
    <section aria-label={label} className={cn('card relative overflow-hidden p-6 text-accent-fg', className)}
      style={{ background: 'linear-gradient(160deg, rgb(var(--accent)), rgb(var(--accent-deep)))', borderColor: 'transparent' }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-accent-fg/15" aria-hidden />
      <div className="pointer-events-none absolute -right-2 -top-2 h-28 w-28 rounded-full border border-accent-fg/15" aria-hidden />
      <p className="text-[0.9375rem] font-medium opacity-90">{label}</p>
      <p role="timer" aria-label={`${label}: ${formatClock(seconds)}`} className="mt-6 text-center text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums">{formatClock(seconds)}</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={() => setRunning(!running)} aria-label={running ? 'Pause timer' : 'Start timer'}
          className="grid h-12 w-12 place-items-center rounded-full bg-accent-fg text-accent transition hover:scale-105 active:scale-95">
          {running ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
        </button>
        <button type="button" onClick={() => { onStop?.(seconds); setSeconds(0); setRunning(false); }} aria-label="Stop and reset timer"
          className="grid h-12 w-12 place-items-center rounded-full bg-danger text-danger-fg transition hover:scale-105 active:scale-95">
          <Square className="h-4 w-4 fill-current" aria-hidden />
        </button>
      </div>
    </section>
  );
}
