import { create } from 'zustand';

const KEY = 'traceline.decisions';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } };

/** Investigator decisions on events (reviewed / relevant / not relevant / inconclusive). They are the investigator's labels, never model output, and are
 *  separate from playback alert state (dismissing an alert records nothing). Stored in this browser only: the backend has no event-review endpoint yet,
 *  so they are NOT in the audit history (see FRONTEND_V2_BACKEND_NEEDS.md). */
export const useDecisions = create((set, get) => ({
  all: read(),
  decide: (caseId, eventId, status) => { const all = { ...get().all, [caseId]: { ...(get().all[caseId] || {}), [eventId]: { status, at: new Date().toISOString() } } }; write(all); set({ all }); },
  clear: (caseId, eventId) => { const c = { ...(get().all[caseId] || {}) }; delete c[eventId]; const all = { ...get().all, [caseId]: c }; write(all); set({ all }); },
}));
