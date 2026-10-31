export const sec = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
export const clock = (ms) => {
  if (ms == null) return '--:--.--';
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};
export const LANES = [['cctv', 'CCTV'], ['dashcam', 'Dashcam'], ['sensor', 'Sensor'], ['witness', 'Witness'], ['inference', 'Inference']];
export const CATEGORY_STYLE = {
  direct_observation: { label: 'Observation', color: 'rgb(var(--success))' },
  machine_detection: { label: 'Machine detection', color: 'rgb(var(--accent))' },
  witness_claim: { label: 'Witness claim', color: 'rgb(var(--warning))' },
  inference: { label: 'Inference', color: 'rgb(167 139 250)' },
};
export const ACTOR_COLORS = ['#22d3ee', '#fbbf24', '#a3e635', '#f472b6', '#a78bfa', '#fb923c'];
