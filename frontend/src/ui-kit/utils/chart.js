/** Trailing moving average over `window` points. */
export const movingAverage = (values, window) => values.map((_, i) => {
  const slice = values.slice(Math.max(0, i - window + 1), i + 1);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
});

/** Smooth SVG path through [x, y] points (Catmull-Rom converted to cubic Beziers). */
export const smoothPath = (pts) => pts.map(([x, y], i) => {
  if (i === 0) return `M${x},${y}`;
  const [x0, y0] = pts[i - 2] || pts[i - 1];
  const [x1, y1] = pts[i - 1];
  const [x3, y3] = pts[i + 1] || [x, y];
  return `C${x1 + (x - x0) / 6},${y1 + (y - y0) / 6} ${x - (x3 - x1) / 6},${y - (y3 - y1) / 6} ${x},${y}`;
}).join(' ');

/** Straight polyline path. */
export const linePath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
