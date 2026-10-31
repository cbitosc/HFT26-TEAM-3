const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Group entries by calendar day, newest first: [{ key, label: 'Today' | 'Yesterday' | 'Mon, Nov 3', items }]. Pure. */
export function groupByDay(items, now = new Date()) {
  const today = startOfDay(now);
  const groups = new Map();
  [...items].sort((a, b) => new Date(b.at) - new Date(a.at)).forEach((it) => {
    const day = startOfDay(new Date(it.at));
    if (!groups.has(day)) {
      const diff = Math.round((today - day) / 864e5);
      const label = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : new Date(day).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      groups.set(day, { key: day, label, items: [] });
    }
    groups.get(day).items.push(it);
  });
  return [...groups.values()];
}

