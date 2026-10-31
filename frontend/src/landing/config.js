/*
 * Demo video for the public landing page. Replace the files in /public/demo and edit this single constant to swap it.
 *
 * Source: ACCIDENT benchmark, CC BY-NC-SA 4.0, accidentbench.github.io
 * (720p H.264, faststart, trimmed to ~15 s). Non-commercial, share-alike: keep this attribution wherever the clip is shown.
 */
export const DEMO_VIDEO = {
  src: '/demo/intersection-demo.mp4',
  poster: '/demo/poster.jpg',
  camera: 'Intersection, fixed view',
  type: 'Separate recording',
  attribution: 'ACCIDENT benchmark, CC BY-NC-SA 4.0, accidentbench.github.io',
  attributionUrl: 'https://accidentbench.github.io',
  // Real detection/track data for this clip, if any. Null means overlays are illustrative only.
  detections: null,
};

/*
 * Multi-camera demo: four hardware-synchronised roadside cameras from the TUM Traffic Accid3nD dataset (r09_s01, t = 48-58 s,
 * 2021-04-08 09:31:49-09:31:59 UTC). CC BY-NC-SA 4.0, attribution 'TUM Accid3nD' (Zimmer et al., arXiv:2503.12095).
 * Re-encoded to 640 px wide H.264, no audio. Offsets are measured from the dataset's per-frame file timestamps against the
 * reference camera; the bound is half a frame at 25 fps. This window has NO located crash.
 */
export const MULTI_SOURCE = {
  attribution: 'TUM Accid3nD',
  attributionLong: 'TUM Traffic Accid3nD dataset (Zimmer et al., arXiv:2503.12095), CC BY-NC-SA 4.0. Re-encoded to 640 px.',
  attributionUrl: 'https://accident-dataset.github.io/',
  clockLabel: '2021-04-08 UTC',
  boundMs: 20,
  cameras: [
    { id: 'n16', name: 'S040 North · 16 mm', type: 'Roadside CCTV', src: '/demo/multi/accid3nd-north-16mm.mp4', poster: '/demo/multi/accid3nd-north-16mm.jpg', startEpoch: 1617874309.022, offsetMs: 0, reference: true },
    { id: 'n50', name: 'S040 North · 50 mm', type: 'Roadside CCTV', src: '/demo/multi/accid3nd-north-50mm.mp4', poster: '/demo/multi/accid3nd-north-50mm.jpg', startEpoch: 1617874309.003, offsetMs: -16.9 },
    { id: 's16', name: 'S050 South · 16 mm', type: 'Roadside CCTV', src: '/demo/multi/accid3nd-south-16mm.mp4', poster: '/demo/multi/accid3nd-south-16mm.jpg', startEpoch: 1617874309.026, offsetMs: 5.7 },
    { id: 's50', name: 'S050 South · 50 mm', type: 'Roadside CCTV', src: '/demo/multi/accid3nd-south-50mm.mp4', poster: '/demo/multi/accid3nd-south-50mm.jpg', startEpoch: 1617874309.02, offsetMs: -1.6 },
  ],
};

/** Existing route that creates an investigation (see App.jsx: <Route path="/new" element={<NewCase />} />). */
export const START_ROUTE = '/new';

/** Length of the illustrative timeline below. Event times are mapped (and clamped) onto the real clip length. */
export const ILLUSTRATIVE_SPAN_S = 16.2;

export const NAV_ITEMS = [
  { id: 'problem', label: 'Problem' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'contradictions', label: 'Contradictions' },
  { id: 'report', label: 'Report' },
];
