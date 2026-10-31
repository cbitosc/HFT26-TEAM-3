/*
 * Demo video for the public landing page. Replace the files in /public/demo and edit this single constant to swap it.
 *
 * Source: ACCIDENT benchmark, CC BY-NC-SA 4.0, accidentbench.github.io
 * (720p H.264, faststart, trimmed to ~15 s). Non-commercial, share-alike: keep this attribution wherever the clip is shown.
 */
export const DEMO_VIDEO = {
  src: '/demo/intersection-demo.mp4',
  poster: '/demo/poster.jpg',
  camera: 'CAM 01 · Intersection, fixed view',
  attribution: 'ACCIDENT benchmark, CC BY-NC-SA 4.0, accidentbench.github.io',
  attributionUrl: 'https://accidentbench.github.io',
  // Real detection/track data for this clip, if any. Null means overlays are illustrative only.
  detections: null,
};

/** Existing route that creates an investigation (see App.jsx: <Route path="/new" element={<NewCase />} />). */
export const START_ROUTE = '/new';

/** Length of the illustrative timeline below. Event times are mapped (and clamped) onto the real clip length. */
export const ILLUSTRATIVE_SPAN_S = 16.2;

export const NAV_ITEMS = [
  { id: 'product', label: 'Product' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'about', label: 'About' },
];
