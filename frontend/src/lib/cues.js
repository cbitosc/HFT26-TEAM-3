/** Crash-cue model output, read from stored overlay samples (boxes flagged is_accident_cue by the backend).
 *  The cue model is weak (its own validation: precision 0.59, recall 0.52) and never establishes a collision.
 *  To keep single-frame noise from looking like a finding, cue frames are grouped in time: a cluster seen in at least
 *  `minFrames` sampled frames is a persistent cue moment, anything less is reported as isolated. This only changes how the cue is
 *  presented. It is not a measured accuracy gain, and cues never trigger the automatic pause. */

export const CUE_GAP_MS = 1200;
export const CUE_MIN_FRAMES = 2;

/** @param items overlay samples [{ time_ms, boxes: [{ is_accident_cue, confidence }] }] in media ms */
export function summarizeCues(items = [], { gapMs = CUE_GAP_MS, minFrames = CUE_MIN_FRAMES } = {}) {
  const frames = items
    .map((it) => ({ t: it.time_ms, conf: Math.max(0, ...(it.boxes || []).filter((b) => b.is_accident_cue).map((b) => b.confidence || 0)), has: (it.boxes || []).some((b) => b.is_accident_cue) }))
    .filter((f) => f.has)
    .sort((a, b) => a.t - b.t);
  const clusters = [];
  frames.forEach((f) => {
    const last = clusters[clusters.length - 1];
    if (last && f.t - last.endMs <= gapMs) { last.endMs = f.t; last.times.push(f.t); last.peak = Math.max(last.peak, f.conf); } else clusters.push({ startMs: f.t, endMs: f.t, times: [f.t], peak: f.conf });
  });
  const moments = clusters.filter((c) => c.times.length >= minFrames).map((c) => ({ ...c, frames: c.times.length }));
  const isolated = clusters.filter((c) => c.times.length < minFrames);
  return {
    moments, isolated: isolated.length, total: frames.length,
    persistentTimes: new Set(moments.flatMap((m) => m.times)),
  };
}
