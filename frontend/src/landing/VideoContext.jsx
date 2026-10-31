import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { mapToClip } from './data';

const Ctx = createContext(null);
export const useDemoVideo = () => useContext(Ctx);

/** Shares one clock between the main player and the timeline preview so selecting an event seeks the video. */
export function DemoVideoProvider({ children }) {
  const videos = useRef(new Map());
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeEvent, setActiveEvent] = useState('e1');

  const register = useCallback((key, el) => {
    if (el) videos.current.set(key, el); else videos.current.delete(key);
  }, []);

  const seek = useCallback((t) => {
    videos.current.forEach((v, key) => {
      const target = key.startsWith('free') && Number.isFinite(v.duration) ? Math.min(t, Math.max(0, v.duration - 0.05)) : t;
      try { v.currentTime = target; } catch { /* metadata not ready */ }
    });
    setTime(t);
  }, []);

  const seekToEvent = useCallback((ev, dur = duration) => {
    setActiveEvent(ev.id);
    const t = mapToClip(ev.t, dur);
    if (t != null) seek(t);
  }, [duration, seek]);

  const value = useMemo(() => ({ register, seek, seekToEvent, duration, setDuration, time, setTime, playing, setPlaying, activeEvent, setActiveEvent, videos }),
    [register, seek, seekToEvent, duration, time, playing, activeEvent]);
  useEffect(() => () => videos.current.clear(), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
