/** Map a box to canvas pixels for a <video> using object-fit: contain.
 *  videoW/H = the size the browser displays (videoWidth/videoHeight, which applies the stream's pixel aspect ratio).
 *  codedW/H = the pixel grid the boxes were computed in (the API's video.width/height). They differ for non-square-pixel streams
 *  (e.g. 1280x720 coded displayed as 1280x723); without this the boxes drift vertically by up to a few pixels. */
export function containTransform(videoW, videoH, boxW, boxH, codedW = videoW, codedH = videoH) {
  const scale = Math.min(boxW / videoW, boxH / videoH);
  return { scale, ox: (boxW - videoW * scale) / 2, oy: (boxH - videoH * scale) / 2, sx: (videoW * scale) / codedW, sy: (videoH * scale) / codedH };
}

export function mapBox(bbox, tf) {
  const [x1, y1, x2, y2] = bbox;
  const sx = tf.sx ?? tf.scale;
  const sy = tf.sy ?? tf.scale;
  return { x: tf.ox + x1 * sx, y: tf.oy + y1 * sy, w: (x2 - x1) * sx, h: (y2 - y1) * sy };
}

/** Overlay items are sampled frames with `time_ms` in media ms. Return the latest sample at or before `mediaMs`, only if it is
 *  recent enough; between samples nothing was observed, so nothing is drawn (never interpolated). */
export function latestSample(items, mediaMs, maxAgeMs = 350) {
  let best = null;
  for (const it of items) if (it.time_ms <= mediaMs + 20 && (!best || it.time_ms > best.time_ms)) best = it;
  return best && mediaMs - best.time_ms < maxAgeMs ? best : null;
}
