import { Suspense, useEffect, useRef, useState } from 'react';

/** Mounts a lazy section only when it is near the viewport. The wrapper keeps the anchor id and reserved height. */
export default function Defer({ id, minHeight = 640, children }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return (
    <div id={id} ref={ref} className="tl-defer" style={{ minHeight }}>
      {near && <Suspense fallback={<div style={{ minHeight }} aria-busy="true" />}>{children}</Suspense>}
    </div>
  );
}
