import { create } from 'zustand';

const KEY = 'traceline.selectedCase';

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && v.id ? v : null;
  } catch { return null; }
};
const write = (v) => {
  try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
};

/** The case every case-scoped page (Evidence, Reconstruction, Reports) acts on. Only identifying fields are kept; all other values are read from the API. */
export const useCaseContext = create((set, get) => ({
  selected: read(),
  select: (c) => {
    if (!c?.id) return;
    const next = { id: c.id, code: c.code ?? null, title: c.title ?? null, designation: c.designation ?? null };
    const cur = get().selected;
    if (cur && cur.id === next.id && cur.code === next.code && cur.title === next.title && cur.designation === next.designation) return;
    write(next);
    set({ selected: next });
  },
  clear: () => { write(null); set({ selected: null }); },
}));
