// Integration audit of the frontend's assumptions against the live backend. Read-only except for POST /cases/{id}/reports.
//   node audit/api-audit.mjs [--api http://localhost:8000/api/v1] [caseId ...]
// Prints one line per check and exits 1 if any check fails.
const args = process.argv.slice(2);
const apiIdx = args.indexOf('--api');
const B = apiIdx >= 0 ? args.splice(apiIdx, 2)[1] : 'http://localhost:8000/api/v1';
const get = async (p) => { const r = await fetch(B + p); const j = await r.json().catch(() => null); if (!r.ok) throw Object.assign(new Error(`${p} -> ${r.status} ${JSON.stringify(j)?.slice(0, 120)}`), { status: r.status, body: j }); return j; };
const post = async (p, b) => { const r = await fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }); return { status: r.status, body: await r.json() }; };
let failed = 0;
const rows = [];
const check = (caseCode, name, ok, detail = '') => { rows.push({ caseCode, name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${caseCode}  ${name}${detail ? `  [${detail}]` : ''}`); };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

const cases = (await get('/cases')).items;
const dash = await get('/dashboard');
check('-', 'dashboard case total equals /cases length', dash.cases.total === cases.length, `${dash.cases.total} vs ${cases.length}`);
check('-', 'dashboard evidence total equals the sum of per-case counts', dash.evidence.total === cases.reduce((n, c) => n + c.counts.evidence_total, 0));
check('-', 'dashboard unreviewed findings equals the sum of per-case counts', dash.findings_needing_review === cases.reduce((n, c) => n + c.counts.findings_unreviewed, 0), `${dash.findings_needing_review}`);

for (const c of cases.filter((x) => !args.length || args.includes(x.id))) {
  const tag = c.code;
  const ev = (await get(`/cases/${c.id}/evidence`)).items;
  const evIds = new Set(ev.map((e) => e.id));
  // ---- synthetic separation
  const synth = ev.filter((e) => e.synthetic);
  check(tag, 'designation agrees with the evidence synthetic flags', c.designation === 'synthetic' ? synth.length === ev.length : c.designation === 'real' || c.designation === 'staged' ? synth.length === 0 : true, `${c.designation}: ${synth.length}/${ev.length} synthetic`);
  const videos = ev.filter((e) => (e.kind === 'cctv' || e.kind === 'dashcam') && e.video?.playback_ready);
  for (const v of videos) {
    const r = await fetch(`${B}/evidence/${v.id}/stream`, { headers: { Range: 'bytes=0-1' } });
    check(tag, `stream of ${v.original_filename} is range-capable video`, r.status === 206 && /video/.test(r.headers.get('content-type') || ''), `${r.status} ${r.headers.get('content-type')}`);
  }
  let sc;
  try { sc = (await get(`/cases/${c.id}/reconstruction/scenarios`)).items; } catch (e) { sc = []; }
  if (!sc.length) { check(tag, 'case with no reconstruction answers NO_RECONSTRUCTION honestly', await get(`/cases/${c.id}/timeline`).then(() => false, (e) => e.body?.error?.code === 'NO_RECONSTRUCTION')); continue; }
  const scn = sc.find((s) => s.is_baseline) || sc[0];
  const tl = await get(`/cases/${c.id}/timeline`);
  const events = Object.values(tl.lanes).flat();
  const all = [...events, ...tl.unplaced];
  const byId = new Map(all.map((e) => [e.id, e]));
  const seek0 = await get(`/cases/${c.id}/seek?case_ms=0`);
  const shift = Object.fromEntries(seek0.targets.map((t) => [t.evidence_id, t.media_ms]));
  // ---- 5 timeline markers come from backend events
  check(tag, 'event ids are unique', byId.size === all.length);
  check(tag, 'every event source_id is evidence of this case (or null for engine)', all.every((e) => e.source_id == null ? e.source_type === 'engine' : evIds.has(e.source_id)));
  check(tag, 'placed events are inside span_ms and unplaced have no time', events.every((e) => e.start_ms >= tl.span_ms[0] && e.start_ms <= tl.span_ms[1]) && tl.unplaced.every((e) => e.start_ms == null));
  // ---- 6 seek correctness: case time of a video event maps back to its own media time
  const vidEvents = events.filter((e) => e.source_type.startsWith('video') && e.observations?.source_time_ms);
  let bad = 0;
  for (const e of vidEvents.slice(0, 400)) { if (shift[e.source_id] == null || !near(e.start_ms + shift[e.source_id], e.observations.source_time_ms[0], 1.5)) bad++; }
  check(tag, 'video event: case start_ms + per-source shift equals the event source media time', bad === 0, `${vidEvents.length} checked, ${bad} off`);
  const sensorEvents = events.filter((e) => e.source_type === 'sensor' && e.observations?.source_time_ms);
  bad = sensorEvents.filter((e) => shift[e.source_id] == null || !near(e.start_ms + shift[e.source_id], e.observations.source_time_ms[0], 1.5)).length;
  check(tag, 'sensor event: case start_ms + shift equals the sensor time', bad === 0, `${sensorEvents.length} checked`);
  if (events[0]) { const s = await get(`/cases/${c.id}/seek?case_ms=${events[0].start_ms}`); const t = s.targets.find((x) => x.evidence_id === events[0].source_id); check(tag, '/seek returns the source time of the first event', !t || near(t.media_ms, events[0].observations?.source_time_ms?.[0] ?? t.media_ms, 1.5)); }
  // ---- 3/4 detections & tracks
  for (const v of videos) {
    const tracks = (await get(`/evidence/${v.id}/tracks`)).items;
    const trackIds = new Set(tracks.map((t) => t.track_id));
    const detail = await Promise.all(tracks.slice(0, 6).map((t) => get(`/tracks/${t.id}`)));
    const pts = detail.flatMap((d) => d.points.map((p) => ({ ...p, track_id: d.track_id })));
    const ov = await get(`/evidence/${v.id}/overlays?from_ms=0&to_ms=${Math.min(v.video.duration_ms, 20000)}&min_conf=0.25`);
    const boxes = ov.items.flatMap((i) => i.boxes.map((b) => ({ ...b, time_ms: i.time_ms })));
    check(tag, `overlay boxes of ${v.original_filename} only reference stored track ids`, boxes.every((b) => b.track_id == null || trackIds.has(b.track_id)), `${boxes.length} boxes, ${tracks.length} tracks`);
    const det = await get(`/evidence/${v.id}/detections?min_conf=0.25&to_ms=${Math.min(v.video.duration_ms, 20000)}`);
    const detById = new Map(det.items.flatMap((i) => i.detections.map((d) => [d.id, { ...d, time_ms: i.time_ms }])));
    check(tag, 'every overlay box is a stored detection at the same time with the same bbox', boxes.every((b) => { const d = detById.get(b.detection_id); return d && d.time_ms === b.time_ms && d.bbox.every((x, i) => x === b.bbox[i]); }), `${boxes.length} boxes`);
    const mismatch = pts.filter((p) => { const d = detById.get(p.detection_id); return d && !p.bbox.every((x, i) => near(x, d.bbox[i], 0.01)); }).length;
    check(tag, 'track points reference stored detections with identical boxes', mismatch === 0, `${pts.length} points`);
    check(tag, 'sampled frame times are within the video duration', det.items.every((i) => i.time_ms >= 0 && i.time_ms <= v.video.duration_ms + 100));
    const runs = (await get(`/evidence/${v.id}/model-runs`)).items;
    check(tag, 'model runs state their model ids (real vs imported is identifiable)', runs.filter((r) => r.stage === 'detect').every((r) => !!r.model_id), runs.filter((r) => r.stage === 'detect').map((r) => r.model_id).join(','));
  }
  // ---- 9 findings link to evidence
  const cons = (await get(`/cases/${c.id}/contradictions`)).items;
  const crbs = (await get(`/cases/${c.id}/corroborations`)).items;
  const gaps = (await get(`/cases/${c.id}/gaps`)).items;
  const finds = (await get(`/cases/${c.id}/findings`)).items;
  check(tag, 'contradictions reference two existing events', cons.every((k) => byId.has(k.event_a) && byId.has(k.event_b)), `${cons.length}`);
  check(tag, 'corroborations reference existing events from at least two evidence items', crbs.every((k) => k.events.every((i) => byId.has(i)) && new Set(k.events.map((i) => byId.get(i).source_id)).size >= 2), `${crbs.length}`);
  check(tag, 'gap refs are existing evidence or events', gaps.every((g) => g.refs.every((r) => evIds.has(r) || byId.has(r) || r.startsWith('sed_') || r.startsWith('clk:'))), `${gaps.length}`);
  check(tag, 'findings reference existing contradictions/corroborations/gaps/events', finds.every((f) => f.ref_ids.every((r) => cons.some((k) => k.id === r) || crbs.some((k) => k.id === r) || gaps.some((g) => g.id === r) || byId.has(r))), `${finds.length}`);
  check(tag, 'dashboard unreviewed count for the case equals unreviewed findings', c.counts.findings_unreviewed === finds.filter((f) => f.review_status === 'unreviewed').length || sc.length > 1, `${c.counts.findings_unreviewed}`);
  // ---- 8 summary endpoints return the event asked for
  let wrong = 0;
  for (const e of events.slice(0, 25)) { const s = await get(`/events/${e.id}/summary`); if (s.event_id !== e.id) wrong++; }
  check(tag, 'event summaries match the requested event', wrong === 0);
  // ---- 12 report uses the case's own data
  const rep = await post(`/cases/${c.id}/reports`, { scenario_id: scn.id });
  const sec = rep.body.content?.sections || [];
  check(tag, 'report is for this case and scenario', rep.status === 201 && sec[0]?.facts?.case_code === c.code && sec[0]?.facts?.scenario_id === scn.id);
  check(tag, 'report evidence inventory equals the case evidence', JSON.stringify((sec[2]?.items || []).map((e) => e.evidence_id).sort()) === JSON.stringify([...evIds].sort()));
  check(tag, 'report timeline entries are events of this reconstruction', (sec[6]?.entries || []).every((e) => byId.has(e.event_id)), `${sec[6]?.entries?.length ?? 0} entries`);
  check(tag, 'report counts match the API (contradictions, corroborations, gaps)', (sec[11]?.items?.length ?? -1) === cons.length && (sec[10]?.items?.length ?? -1) === crbs.length && (sec[12]?.items?.length ?? -1) === gaps.length, `${sec[11]?.items?.length}/${cons.length} ${sec[10]?.items?.length}/${crbs.length} ${sec[12]?.items?.length}/${gaps.length}`);
  check(tag, 'report labels synthetic data exactly when evidence is synthetic', (/SYNTHETIC/.test(sec[0]?.facts?.data_designation || '')) === (synth.length > 0), sec[0]?.facts?.data_designation);
  check(tag, 'report passed its own validation', rep.body.validation?.passed === true, (rep.body.validation?.checks || []).filter((k) => !k.passed).map((k) => k.check).join('; '));
}
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
