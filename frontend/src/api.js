// Thin fetch wrapper. All data comes from the TraceLine API; nothing is invented client-side.
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status >= 500 ? 'The server could not complete this request. Check the backend and PostgreSQL setup.' : `HTTP ${status}`));
    this.status = status;
    this.code = body?.error?.code;
  }
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json', 'X-Actor': 'investigator' }, ...opts });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

const q = (o = {}) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  dashboard: () => req('/dashboard'),
  cases: () => req('/cases'),
  case: (id) => req(`/cases/${id}`),
  evidence: (id) => req(`/cases/${id}/evidence`),
  readiness: (id) => req(`/cases/${id}/reconstruction/readiness`),
  createActor: (id, body) => req(`/cases/${id}/actors`, { method: 'POST', body: JSON.stringify(body) }),
  linkActor: (id, body) => req(`/actors/${id}/links`, { method: 'POST', body: JSON.stringify(body) }),
  decideLink: (id, decision) => req(`/actor-links/${id}/${decision}`, { method: 'POST' }),
  caseClaims: (id) => req(`/cases/${id}/claims`),
  extractLocal: (id) => req(`/statements/${id}/extract-local`, { method: 'POST' }),
  extractClaims: (id) => req(`/statements/${id}/extract`, { method: 'POST' }),
  addClaim: (id, body) => req(`/statements/${id}/claims`, { method: 'POST', body: JSON.stringify(body) }),
  reviewClaim: (id, body) => req(`/claims/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
  anchorClaim: (id, body) => req(`/claims/${id}/time-anchor`, { method: 'PUT', body: JSON.stringify(body) }),
  uploadStatement: async (wid, file, synthetic) => {
    const fd = new FormData(); fd.append('file', file); fd.append('synthetic', String(synthetic));
    const res = await fetch(`${BASE}/witnesses/${wid}/statements/upload`, { method: 'POST', body: fd, headers: { 'X-Actor': 'investigator' } });
    const body = await res.json(); if (!res.ok) throw new ApiError(res.status, body); return body;
  },
  actors: (id) => req(`/cases/${id}/actors`),
  suggestActorLabels: (id, body = {}) => req(`/cases/${id}/actors/suggest-labels`, { method: 'POST', body: JSON.stringify(body) }),
  scenarios: (id) => req(`/cases/${id}/reconstruction/scenarios`),
  buildScenario: (id, body) => req(`/cases/${id}/reconstruction/scenarios`, { method: 'POST', body: JSON.stringify(body) }),
  timeline: (id, scenario) => req(`/cases/${id}/timeline${q({ scenario_id: scenario })}`),
  incidentEvents: (id, scenario) => req(`/cases/${id}/incident-events${q({ scenario_id: scenario })}`),
  incidentNarrative: (id, scenario) => req(`/cases/${id}/incident-narrative${q({ scenario_id: scenario })}`),
  storyboard: (id, scenario) => req(`/cases/${id}/storyboard${q({ scenario_id: scenario })}`),
  incidentFrames: (id, scenario, eventId) => req(`/cases/${id}/incident-frames${q({ scenario_id: scenario, event_id: eventId })}`),
  associations: (id, scenario) => req(`/cases/${id}/associations${q({ scenario_id: scenario })}`),
  addAssociation: (id, body) => req(`/cases/${id}/associations`, { method: 'POST', body: JSON.stringify(body) }),
  completeness: (id, scenario) => req(`/cases/${id}/reconstruction/completeness${q({ scenario_id: scenario })}`),
  summary: (eventId) => req(`/events/${eventId}/summary`),
  contradictions: (id, s) => req(`/cases/${id}/contradictions${q({ scenario_id: s })}`),
  corroborations: (id, s) => req(`/cases/${id}/corroborations${q({ scenario_id: s })}`),
  gaps: (id, s) => req(`/cases/${id}/gaps${q({ scenario_id: s })}`),
  findings: (id, s) => req(`/cases/${id}/findings${q({ scenario_id: s })}`),
  review: (fid, status) => req(`/findings/${fid}`, { method: 'PATCH', body: JSON.stringify({ review_status: status }) }),
  trajectories: (id, s, frame) => req(`/cases/${id}/trajectories${q({ scenario_id: s, frame })}`),
  seek: (id, ms, s) => req(`/cases/${id}/seek${q({ case_ms: ms, scenario_id: s })}`),
  overlays: (evId, from, to) => req(`/evidence/${evId}/overlays${q({ from_ms: from, to_ms: to })}`),
  sensorRecords: (evId, from, to) => req(`/evidence/${evId}/sensor-records${q({ limit: 5000, from_ms: from, to_ms: to, fields: 'speed,accel_long,heading' })}`),
  event: (id) => req(`/events/${id}`),
  frames: (evId, from, to) => req(`/evidence/${evId}/frames${q({ from_ms: from, to_ms: to, sampled: false, limit: 30 })}`),
  statement: (id) => req(`/statements/${id}`),
  statements: (witnessId) => req(`/witnesses/${witnessId}/statements`),
  report: (id, scenario, format) => req(`/cases/${id}/reports`, { method: 'POST', body: JSON.stringify({ scenario_id: scenario || null, ...(format ? { format } : {}) }) }),
  reportById: (rid) => req(`/reports/${rid}`),
  witnesses: (id) => req(`/cases/${id}/witnesses`),
  claims: (stId) => req(`/statements/${stId}/claims`),
  reports: (id) => req(`/cases/${id}/reports`),
  reportMd: (rid) => req(`/reports/${rid}/markdown`),
  createCase: (body) => req('/cases', { method: 'POST', body: JSON.stringify(body) }),
  patchCase: (id, body) => req(`/cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  decideSync: (id, decision) => req(`/sync-edges/${id}/${decision}`, { method: 'POST' }),
  addSyncPoint: (id, body) => req(`/cases/${id}/sync-points`, { method: 'POST', body: JSON.stringify(body) }),
  sync: (id) => req(`/cases/${id}/sync`),
  patchSource: (evId, body) => req(`/evidence/${evId}/source`, { method: 'PATCH', body: JSON.stringify(body) }),
  setClock: (evId, body) => req(`/evidence/${evId}/clock`, { method: 'PUT', body: JSON.stringify(body) }),
  upload: async (caseId, file, kind, synthetic) => {
    const fd = new FormData();
    fd.append('file', file); fd.append('kind', kind); fd.append('synthetic', String(synthetic));
    const res = await fetch(`${BASE}/cases/${caseId}/evidence`, { method: 'POST', body: fd, headers: { 'X-Actor': 'investigator' } });
    const body = await res.json();
    if (!res.ok) throw new ApiError(res.status, body);
    return body;
  },
  jobs: (id) => req(`/cases/${id}/jobs`),
  sensors: (id) => req(`/cases/${id}/sensors`),
  sensorPreview: (evId, body) => req(`/evidence/${evId}/sensor-preview`, { method: 'POST', body: JSON.stringify(body) }),
  registerSensor: (id, body) => req(`/cases/${id}/sensors`, { method: 'POST', body: JSON.stringify(body) }),
  retryJob: (jobId) => req(`/jobs/${jobId}/retry`, { method: 'POST' }),
  addWitness: (id, label) => req(`/cases/${id}/witnesses`, { method: 'POST', body: JSON.stringify({ label }) }),
  addStatement: (wid, text, synthetic) => req(`/witnesses/${wid}/statements`, { method: 'POST', body: JSON.stringify({ text, synthetic }) }),
  fullFrameUrl: (frameId) => `${BASE}/frames/${frameId}/image?full=true`,
  modelRuns: (evId) => req(`/evidence/${evId}/model-runs`),
  tracks: (evId) => req(`/evidence/${evId}/tracks`),
  track: (pk) => req(`/tracks/${pk}`),
  streamUrl: (evId) => `${BASE}/evidence/${evId}/stream`,
  pdfUrl: (rid) => `${BASE}/reports/${rid}/pdf`,
};
