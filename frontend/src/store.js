import { create } from 'zustand';
import { DEFAULT_POLICY } from './lib/alerts';
import { acknowledge, createSeekState, isSettled, request } from './lib/seek';

/** One clock for the workspace. While playing, the master <video> writes `currentMs` (case ms) from a single rAF loop.
 *  Components must subscribe with selectors; display-only consumers (playhead, scrubber) use `useWorkspace.subscribe` and touch the DOM directly. */
const POLICY_KEY = 'traceline.alertPolicy';
function readPolicy() { try { return { ...DEFAULT_POLICY, ...(JSON.parse(localStorage.getItem(POLICY_KEY)) || {}) }; } catch { return { ...DEFAULT_POLICY }; } }

export const useWorkspace = create((set) => ({
  caseId: null,
  scenarioId: null,
  currentMs: 0,
  playing: false,
  rate: 1,
  activeEventId: null,
  pinnedId: null,
  pinnedAt: null,
  selectedActorId: null,
  selectedFindingId: null,
  incident: null,
  alert: null,
  policy: readPolicy(),
  highlightIds: [],
  focusRange: null,
  primaryVideoId: null,
  seek: createSeekState(),
  seekSettled: true,
  overlays: { boxes: true, ids: true },
  reset: (caseId, scenarioId) => set({ caseId, scenarioId, currentMs: 0, playing: false, activeEventId: null, pinnedId: null, pinnedAt: null, selectedActorId: null, selectedFindingId: null, incident: null, alert: null, highlightIds: [], focusRange: null, seek: createSeekState(), seekSettled: true }),
  setTime: (currentMs) => set({ currentMs }),
  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  setActive: (activeEventId) => set((s) => (s.activeEventId === activeEventId ? s : { activeEventId })),
  /** Explicit selection: pins the event at the time it seeks to. */
  selectEvent: (id, ms) => set({ activeEventId: id, pinnedId: id, pinnedAt: ms ?? null }),
  selectActor: (selectedActorId) => set({ selectedActorId }),
  /** The possible accident moment { ms, trackKeys:["evidence:track"] } for highlighting on the timeline, scrubber and video. */
  setIncident: (incident) => set({ incident }),
  /** The active possible-accident alert { eventId, atMs, paused }. Separate from review decisions. */
  setAlert: (alert) => set({ alert }),
  setPolicy: (patch) => set((s) => { const policy = { ...s.policy, ...patch }; try { localStorage.setItem(POLICY_KEY, JSON.stringify(policy)); } catch { /* storage unavailable */ } return { policy }; }),
  /** A selected finding highlights its events and interval on the timeline; cleared with `null`. */
  setFinding: (selectedFindingId, highlightIds = [], focusRange = null) => set({ selectedFindingId, highlightIds, focusRange }),
  setPrimaryVideo: (primaryVideoId) => set({ primaryVideoId }),
  /** Latest-wins: returns the request id the player must echo back through `ackSeek`. */
  requestSeek: (ms) => {
    let id = 0;
    set((s) => { const next = request(s.seek, ms); id = next.latest; return { seek: next, seekSettled: false, currentMs: ms }; });
    return id;
  },
  ackSeek: (id) => set((s) => { const next = acknowledge(s.seek, id); return next === s.seek ? s : { seek: next, seekSettled: isSettled(next) }; }),
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
}));
