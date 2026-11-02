import { useEffect, useRef, useState } from 'react';

/** Tracks an element's width so SVG charts can render crisp, un-stretched text.
 * Starts at 0: render nothing until measured so a fixed default can never force overflow. */
export function useElementWidth(initial = 0) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
