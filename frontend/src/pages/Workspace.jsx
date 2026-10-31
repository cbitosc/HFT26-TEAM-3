import { ThisMoment, storyChapters } from '../components/ReconstructionStory';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Checkbox, Drawer, ErrorState, IconButton, LoadingState, ProgressBar, SectionHeader, Select, Tabs, useToast } from '../ui-kit';
import { FileText, Film, Gauge, PanelLeftClose, PanelLeftOpen, Sparkles, Users } from 'lucide-react';
import Shell from '../layout';
import { api } from '../api';
import { useWorkspace } from '../store';
import { useCaseContext } from '../caseContext';
import { byStart, findActiveEvent, resolveActive } from '../lib/active';
import { ACTOR_COLORS, CATEGORY_STYLE } from '../fmt';
import { formatTime } from '../lib/time';
import { ANALYSIS_LABEL, buildModel, effectiveDesignation, isSignificant } from '../lib/overview';
import DesignationBadge from '../components/DesignationBadge';
import Panel from '../components/Panel';
import Player from '../components/Player';
import Timeline from '../components/Timeline';
import Trajectory from '../components/Trajectory';
import Sensor from '../components/Sensor';
import Evidence from '../components/Evidence';
import Overview from '../components/Overview';
import TechnicalPanel from '../components/TechnicalPanel';
import { FindingDetail, FindingRow } from '../components/FindingParts';
import { FrameDrawer, SensorDrawer, StatementDrawer } from '../components/EvidenceDrawers';
import { IncidentCards, IncidentGallery, IncidentOverview, IncidentVehicles } from '../components/IncidentAnalysis';
import ReconstructionReadiness from '../components/ReconstructionReadiness';
import CaseBanner from '../components/CaseBanner';
import CaseMeta from '../components/CaseMeta';
import IncidentMoment, { MomentBar } from '../components/IncidentMoment';
import { pickMoment } from '../lib/moment';
import { buildExecutive } from '../lib/executive';
import { useAutoPause, useMotions } from '../hooks';
import AccidentAlert from '../components/AccidentAlert';
import IncidentSequence from '../components/IncidentSequence';
import CrashCuePanel, { useCueSummaries } from '../components/CrashCue';
import InvestigationFindings from '../components/InvestigationFindings';
import { Associations, CameraFilter, EventClocks, EventTrace, HypothesisExplanation, KeyObservations, Overlaps, PhaseInspector, Scenarios, SensorPanelNote, evidenceLabel, sourceName } from '../components/Reconstruction';
import { accidentMarks } from '../lib/scene3d';
const Incident3D = lazy(() => import('../components/Incident3D'));

const NAV_KEY = 'traceline.nav';
/** The navigation rail starts collapsed on screens narrower than 1600 px so the video stays the main element; the choice is remembered. */
const readNav = () => { try { const v = localStorage.getItem(NAV_KEY); if (v) return v === 'open'; } catch { /* storage unavailable */ } return window.innerWidth >= 1600; };

function EventTab({ event, nameOf, board }) {
  if (!event) return <p className="t-small text-fg-3">Select an event on the timeline to inspect it.</p>;
  return (
    <div className="space-y-3">
      <div>
        <p className="t-small font-medium text-fg">{event.title}</p>
        <p className="t-caption mt-1 flex flex-wrap items-center gap-2 text-fg-3"><Badge variant="neutral">{evidenceLabel(event)}</Badge>{event.start_ms != null ? `case time ${formatTime(event.start_ms)}` : 'Not placed on the case clock'}</p>
        <EventTrace event={event} nameOf={nameOf} />
      </div>
      <EventClocks event={event} />
      <PhaseInspector event={event} board={board} />
    </div>
  );
}

/** Alert policy: auto-pause can be turned off without turning detection off (the alert then appears as a notice and playback continues). */
function AutoPauseControls() {
  const policy = useWorkspace((s) => s.policy);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Accident alert settings">
      <Checkbox label="Pause automatically at a possible accident" checked={policy.autoPause} onChange={() => useWorkspace.getState().setPolicy({ autoPause: !policy.autoPause })} />
      <label className="t-caption flex items-center gap-2 text-fg-3">Alert on
        <Select className="h-8" value={policy.minTier} onChange={(e) => useWorkspace.getState().setPolicy({ minTier: e.target.value })} options={[{ value: 'accident', label: 'Possible accidents only' }, { value: 'attention', label: 'Attention events too' }]} />
      </label>
    </div>
  );
}

function aiNarrativeEvents(analysis) {
  if (!analysis?.narrative?.events) return [];
  return analysis.narrative.events.map((e) => ({
    id: e.id, source_id: analysis.evidence_id, evidence_id: analysis.evidence_id,
    start_ms: e.timestamp_ms, end_ms: e.end_ms, event_type: 'ai_visual_narrative',
    category: 'machine_detection', title: e.description, synchronized: true,
    uncertainty_ms: 600, uncertainty_basis: e.uncertainty,
    observations: { ai_title: e.title, motion: e.motion, contact: e.contact, track_ids: e.track_ids },
    confidence: { value: e.confidence, basis: 'Featherless narrative grounded to supplied YOLO tracks and sampled frames.' },
    provenance: { generated_by: 'featherless', model: analysis.model },
  })).sort(byStart);
}

function FeatherlessFindings({ items, onSeek }) {
  if (!items?.length) return <p className="t-small text-fg-3">Featherless found no supported correlations, contradictions, or gaps.</p>;
  const tone = { correlation: 'success', contradiction: 'danger', gap: 'warning' };
  return <ul className="space-y-2">{items.map((f) => <li key={f.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><Badge variant={tone[f.type] || 'neutral'}>{f.type}</Badge><h3 className="t-small mt-2 font-medium text-fg">{f.title}</h3></div>{f.timestamp_ms != null && <Button size="sm" variant="outline" onClick={() => onSeek(f.timestamp_ms)}>{formatTime(f.timestamp_ms)}</Button>}</div>
    <p className="t-small mt-2 text-fg-2">{f.explanation}</p>
    <p className="t-caption mt-2 text-fg-3">{Math.round(f.confidence * 100)}% model confidence · {f.uncertainty || 'Review against the original evidence.'}</p>
  </li>)}</ul>;
}

export default function Workspace() {
  const { caseId } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('overview');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const showInspector = (id) => { setTab(id); setAdvancedOpen(true); };
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState(null);
  const [trail, setTrail] = useState(null);
  const [incident, setIncident] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [frames, setFrames] = useState([]);
  const [board, setBoard] = useState(undefined);
  const [camera, setCamera] = useState('all');
  const [assoc, setAssoc] = useState(undefined);
  const [complete, setComplete] = useState(undefined);
  const [navOpen, setNavOpen] = useState(false);
  const selectedActor = useWorkspace((s) => s.selectedActorId);
  const activeId = useWorkspace((s) => s.activeEventId);
  const primaryId = useWorkspace((s) => s.primaryVideoId);
  const findingId = useWorkspace((s) => s.selectedFindingId);

  const load = useCallback(async (sid) => {
    try {
      setErr(null);
      const aiRequest = api.featherlessAnalysis ? api.featherlessAnalysis(caseId).catch(() => ({ status: 'not_generated', analysis: null })) : Promise.resolve({ status: 'not_generated', analysis: null });
      const [c, ev, actors, sc, jobs, ai] = await Promise.all([api.case(caseId), api.evidence(caseId), api.actors(caseId), api.scenarios(caseId), api.jobs(caseId).catch(() => ({ items: [] })), aiRequest]);
      setScenarios(sc.items);
      useCaseContext.getState().select(c);
      const videosEv = ev.items.filter((e) => e.kind === 'cctv' || e.kind === 'dashcam');
      const runs = Object.fromEntries(await Promise.all(videosEv.map(async (v) => [v.id, (await api.modelRuns(v.id).catch(() => ({ items: [] }))).items])));
      const chosen = sid || sc.items.find((s) => s.is_baseline)?.id || sc.items[0]?.id;
      if (!chosen) return setData({ c, ev: ev.items, actors: actors.items, jobs: jobs.items, runs, ai, none: true });
      const [tl, cons, crbs, gaps, finds, trajs, seek0, inc, nar] = await Promise.all([
        api.timeline(caseId, chosen), api.contradictions(caseId, chosen), api.corroborations(caseId, chosen), api.gaps(caseId, chosen),
        api.findings(caseId, chosen), api.trajectories(caseId, chosen), api.seek(caseId, 0, chosen),
        api.incidentEvents(caseId, chosen), api.incidentNarrative(caseId, chosen),
      ]);
      setScenarioId(chosen);
      setCamera('all');
      setAssoc(undefined);
      setComplete(undefined);
      api.associations(caseId, chosen).then(setAssoc).catch(() => setAssoc(null));
      api.completeness(caseId, chosen).then(setComplete).catch(() => setComplete(null));
      setIncident(inc);
      setNarrative(nar);
      useWorkspace.getState().reset(caseId, chosen);
      setTab('overview');
      setData({ c, ev: ev.items, actors: actors.items, jobs: jobs.items, runs, ai, tl, cons: cons.items, crbs: crbs.items, gaps: gaps.items, finds: finds.items, trajs: trajs.items, seek0 });
    } catch (e) { setErr(e); }
  }, [caseId]);
  useEffect(() => { load(); }, [load]);
  const serverGenerating = data?.ai?.status === 'generating';
  const aiRunning = aiBusy || serverGenerating;
  useEffect(() => {
    if (!aiRunning) return undefined;
    const started = Date.now();
    setAiElapsed(0);
    const timer = window.setInterval(() => setAiElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [aiRunning]);
  // an analysis started by the server (every new case that allows AI gets one): follow it until it is ready or has failed
  useEffect(() => {
    if (!serverGenerating || !api.featherlessAnalysis) return undefined;
    let off = false;
    const poll = window.setInterval(async () => {
      try {
        const next = await api.featherlessAnalysis(caseId);
        if (off || next.status === 'generating') return;
        setData((current) => ({ ...current, ai: next }));
        if (next.status === 'ready') toast({ title: 'AI analysis ready', description: 'Narration, simulated OBD, and evidence comparisons passed validation.', type: 'success' });
      } catch { /* keep waiting; the next poll tries again */ }
    }, 5000);
    return () => { off = true; window.clearInterval(poll); };
  }, [serverGenerating, caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseEvents = useMemo(() => (data?.tl ? Object.values(data.tl.lanes).flat().sort(byStart) : []), [data]);
  const aiAnalysis = data?.ai?.analysis;
  const aiEvents = useMemo(() => aiNarrativeEvents(aiAnalysis), [aiAnalysis]);
  const events = aiEvents.length ? aiEvents : baseEvents;
  const shifts = useMemo(() => Object.fromEntries((data?.seek0?.targets || []).map((t) => [t.evidence_id, t.media_ms])), [data]);
  const videos = useMemo(() => (data?.ev || []).filter((e) => (e.kind === 'cctv' || e.kind === 'dashcam') && e.video?.playback_ready), [data]);
  const sensorEv = (data?.ev || []).find((e) => e.kind === 'sensor_csv');
  const range = useMemo(() => (data?.tl?.span_ms?.[0] != null ? [Math.max(0, data.tl.span_ms[0] - 500), data.tl.span_ms[1] + 500] : [0, 1000]), [data]);
  const trackActors = useMemo(() => {
    const m = {};
    data?.trajs?.forEach((t) => { if (t.actor_id && t.track_ref) m[`${t.track_ref.evidence_id}:${t.track_ref.track_id}`] = { id: t.actor_id, index: data.actors.findIndex((a) => a.id === t.actor_id) }; });
    data?.actors?.forEach((a, index) => { const x = a.attributes || {}; if (x.label_origin === 'featherless' && x.evidence_id && x.track_id != null) m[`${x.evidence_id}:${x.track_id}`] = { id: a.id, index }; });
    return m;
  }, [data]);
  const actorLabels = useMemo(() => Object.fromEntries((data?.actors || []).map((a) => [a.id, a.attributes?.ai_suggested_label || a.label])), [data]);
  const model = useMemo(() => (data && !data.none ? buildModel({ events: baseEvents, unplaced: data.tl.unplaced, cons: data.cons, crbs: data.crbs, gaps: data.gaps, finds: data.finds, trajs: data.trajs, actors: data.actors, evidence: data.ev, modelRuns: data.runs, jobs: data.jobs, shifts }) : null), [data, baseEvents, shifts]);
  const cues = useCueSummaries(videos, data?.runs);
  const keyEvents = useMemo(() => events.filter(isSignificant), [events]);
  const moment = useMemo(() => (data && !data.none ? pickMoment(baseEvents, data.crbs) : null), [data, baseEvents]);
  const view3dVideo = videos.find((v) => v.id === primaryId) || videos[0] || null;
  const placedEvents = useMemo(() => baseEvents.filter((e) => e.start_ms != null), [baseEvents]);
  useAutoPause(placedEvents, `${scenarioId}:${primaryId}`);
  const alertState = useWorkspace((st) => st.alert);
  const alertEvent = alertState ? model?.events[alertState.eventId] : null;
  const alertCard = useMemo(() => (alertEvent && board ? board.strips.flatMap((st) => st.items).find((i) => i.event_id === alertEvent.id) : null), [alertEvent, board]);
  const motions = useMotions(moment, data?.trajs || []);
  const executive = useMemo(() => (model ? buildExecutive({ model, moment, motions: motions || [], events: baseEvents, evidence: data.ev, actors: data.actors, trajs: data.trajs, gaps: data.gaps, nameOf: (id) => sourceName((data.ev || []).find((e) => e.id === id)) }) : null), [model, moment, motions, baseEvents, data]);
  useEffect(() => { useWorkspace.getState().setIncident(moment ? { ms: moment.ms, trackKeys: moment.trackKeys } : null); }, [moment]);
  const allVideos = useMemo(() => (data?.ev || []).filter((e) => e.kind === 'cctv' || e.kind === 'dashcam' || e.kind === 'other'), [data]);
  const nameOf = useCallback((id) => sourceName((data?.ev || []).find((e) => e.id === id)), [data]);
  const shown = useMemo(() => {
    const allOverlaps = data?.tl?.overlaps || [];
    const displayTl = aiEvents.length ? { ...data?.tl, lanes: { featherless: aiEvents }, span_ms: [aiEvents[0]?.start_ms || 0, aiEvents.at(-1)?.end_ms || aiEvents.at(-1)?.start_ms || 0] } : data?.tl;
    if (camera === 'all' || !data?.tl) return { tl: displayTl, keyEvents, gaps: data?.gaps || [], overlaps: allOverlaps, items: incident?.items || [], unplaced: incident?.unplaced || [] };
    const only = (e) => e.source_id === camera;
    return {
      tl: { ...displayTl, lanes: Object.fromEntries(Object.entries(displayTl.lanes).map(([k, v]) => [k, v.filter(only)])) },
      keyEvents: keyEvents.filter(only),
      overlaps: allOverlaps.filter((o) => o.evidence_ids.includes(camera)),
      gaps: (data.gaps || []).filter((g) => g.scope?.evidence_id === camera),
      items: (incident?.items || []).filter((i) => i.evidence_id === camera),
      unplaced: (incident?.unplaced || []).filter((i) => i.evidence_id === camera),
    };
  }, [camera, data, keyEvents, incident, aiEvents]);

  useEffect(() => {
    if (!events.length) return undefined;
    return useWorkspace.subscribe((s, p) => {
      if (s.currentMs === p.currentMs) return;
      const id = resolveActive({ computed: findActiveEvent(events, s.currentMs), pinnedId: s.pinnedId, pinnedAt: s.pinnedAt, currentMs: s.currentMs });
      if (id !== s.activeEventId) s.setActive(id);
    });
  }, [events]);

  const pick = useCallback((e) => {
    const st = useWorkspace.getState();
    st.setPlaying(false);
    if (e.start_ms != null) { st.requestSeek(e.start_ms); st.selectEvent(e.id, e.start_ms); } else st.selectEvent(e.id, null);
    if (e.actor_id) st.selectActor(e.actor_id);
  }, []);
  const pickById = useCallback((id) => { const e = model?.events[id]; if (e) pick(e); else useWorkspace.getState().selectEvent(id, null); }, [model, pick]);

  /** Selecting a finding: seek to its interval, highlight its events and interval on the timeline, select its vehicle, show it in the inspector. */
  const selectFinding = useCallback((f) => {
    if (!f) return;
    const st = useWorkspace.getState();
    st.setPlaying(false);
    const ids = [...f.supporting, ...f.contradicting].map((r) => r.eventId);
    st.setFinding(f.id, ids, f.interval ? { start: f.interval.start, end: f.interval.end } : null);
    if (f.interval) { st.requestSeek(f.interval.at); const first = ids.find((i) => model.events[i]?.start_ms != null); if (first) st.selectEvent(first, f.interval.at); }
    if (f.actorIds?.[0]) st.selectActor(f.actorIds[0]);
    showInspector('findings');
  }, [model]);
  const clearFinding = () => useWorkspace.getState().setFinding(null, [], null);
  const review = async (id, status) => {
    try { await api.review(id, status); toast({ title: status === 'reviewed' ? 'Marked as reviewed' : status === 'disputed' ? 'Marked as disputed' : 'Review reset', type: 'success' }); const f = await api.findings(caseId, scenarioId); setData((d) => ({ ...d, finds: f.items })); }
    catch (e) { toast({ title: 'Could not save the review', description: e.message, type: 'error' }); }
  };
  const stepEvent = useCallback((dir) => {
    const i = keyEvents.findIndex((e) => e.id === useWorkspace.getState().activeEventId);
    const n = keyEvents[Math.min(Math.max((i < 0 ? (dir > 0 ? -1 : keyEvents.length) : i) + dir, 0), keyEvents.length - 1)];
    if (n) pick(n);
  }, [keyEvents, pick]);
  useEffect(() => {
    const k = (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === ']') stepEvent(1); if (e.key === '[') stepEvent(-1); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [stepEvent]);
  const addAssociation = useCallback(async (body) => {
    await api.addAssociation(caseId, { scenario_id: scenarioId, ...body });
    setAssoc(await api.associations(caseId, scenarioId));
    api.completeness(caseId, scenarioId).then(setComplete).catch(() => {});
  }, [caseId, scenarioId]);
  const seekToFrame = useCallback((ref) => {
    const st = useWorkspace.getState();
    st.setPlaying(false);
    const shift = shifts[ref.evidence_id];
    if (shift == null) { st.setPrimaryVideo(ref.evidence_id); st.requestSeek(ref.time_ms); } else st.requestSeek(ref.time_ms - shift);
  }, [shifts]);
  const seekTo = useCallback((ms) => { const st = useWorkspace.getState(); st.setPlaying(false); st.requestSeek(ms); }, []);
  useEffect(() => {
    setBoard(undefined);
    if (!scenarioId) return undefined;
    let off = false;
    api.storyboard(caseId, scenarioId).then((b) => { if (!off) setBoard(b); }).catch(() => { if (!off) setBoard(null); });
    return () => { off = true; };
  }, [caseId, scenarioId]);
  useEffect(() => {
    const chosen = incident?.items?.find((item) => item.id === activeId) || incident?.unplaced?.find((item) => item.id === activeId) || incident?.items?.[0];
    if (!scenarioId || !chosen) { setFrames([]); return undefined; }
    let cancel = false;
    api.incidentFrames(caseId, scenarioId, chosen.id).then((result) => { if (!cancel) setFrames(result.items || []); }).catch(() => { if (!cancel) setFrames([]); });
    return () => { cancel = true; };
  }, [activeId, incident, scenarioId, caseId]);
  const toggleNav = () => setNavOpen((o) => { try { localStorage.setItem(NAV_KEY, o ? 'closed' : 'open'); } catch { /* storage unavailable */ } return !o; });
  const openTrail = (kind, ev) => setTrail({ kind, ev });
  const suggestLabels = async () => {
    setLabelBusy(true);
    try {
      const result = await api.suggestActorLabels(caseId);
      const actors = await api.actors(caseId);
      setData((current) => ({ ...current, actors: actors.items }));
      toast({ title: `${result.items.length} Featherless label suggestion${result.items.length === 1 ? '' : 's'} added`, description: 'Review these suggestions before confirming identity.', type: 'success' });
    } catch (e) { toast({ title: 'Could not generate Featherless labels', description: e.message, type: 'error' }); }
    finally { setLabelBusy(false); }
  };
  const generateAiAnalysis = async () => {
    setAiBusy(true);
    try {
      const result = await api.generateFeatherlessAnalysis(caseId);
      setData((current) => ({ ...current, ai: result }));
      toast({ title: 'Featherless narrative updated', description: 'Narration, simulated OBD, and evidence comparisons passed validation.', type: 'success' });
    } catch (e) { toast({ title: 'Could not generate Featherless analysis', description: e.message, type: 'error' }); }
    finally { setAiBusy(false); }
  };

  const crumbs = [{ label: data?.c?.title || 'Workspace' }];
  if (err) return <Shell crumbs={crumbs}><ErrorState title={err.code === 'CASE_NOT_FOUND' ? 'This case does not exist' : 'Could not load the case'} description={err.message} onRetry={() => load()} /></Shell>;
  if (!data) return <Shell crumbs={crumbs} wide><LoadingState rows={6} label="Loading workspace" /></Shell>;
  const { c } = data;
  const eff = effectiveDesignation(c.designation, data.ev);
  const trailEvidence = trail && data.ev.find((e) => e.id === trail.ev.source_id);
  const selected = model && findingId ? model.byId[findingId] : null;
  const reviewed = (data.finds || []).filter((f) => f.review_status === 'reviewed').length;
  const analysis = model?.overview.analysis;

  const chapters = aiEvents.length
    ? aiEvents.slice(0, 6).map((event) => ({ label: event.observations.ai_title, event, active: event.id === activeId }))
    : storyChapters(shown.keyEvents, moment?.eventId);
  const momentEvent = events.find((e) => e.id === activeId) || (moment && model?.events[moment.eventId]) || chapters[0]?.event;
  const aiFindings = aiAnalysis?.findings || [];
  const findingMarkers = aiFindings.filter((f) => f.timestamp_ms != null).map((f) => ({ id: f.id, source_id: aiAnalysis.evidence_id, start_ms: f.timestamp_ms, end_ms: f.timestamp_ms, event_type: `ai_${f.type}`, category: 'inference', title: f.title }));
  const playerEvents = aiEvents.length ? [...baseEvents.filter(isSignificant), ...aiEvents, ...findingMarkers] : keyEvents;
  const reviewCount = aiAnalysis ? aiFindings.length : (data.finds?.length || 0);
  const aiProgress = aiElapsed < 10 ? 12 + aiElapsed : aiElapsed < 40 ? 22 + Math.round((aiElapsed - 10) * 1.2) : aiElapsed < 70 ? 58 + Math.round((aiElapsed - 40) * .8) : Math.min(94, 82 + Math.round((aiElapsed - 70) * .15));
  const aiStage = aiElapsed < 10 ? 'Preparing YOLO-grounded frames' : aiElapsed < 40 ? 'Generating the visual narrative' : aiElapsed < 70 ? 'Creating simulated OBD records' : 'Comparing evidence for agreements and contradictions';

  const NavRail = data.none ? null : (
    <Panel as="nav" className="h-fit p-3" aria-label="Case navigation">
      <div className="mb-2 flex items-center justify-between"><h2 className="t-eyebrow text-fg-3">Investigation</h2><IconButton icon={PanelLeftClose} label="Collapse navigation" size="sm" onClick={toggleNav} /></div>
      <dl className="t-caption space-y-1 rounded-lg bg-surface-2/50 p-2.5 text-fg-3">
        <div className="flex justify-between gap-2"><dt>Detections</dt><dd className="text-right text-fg-2">{analysis ? ANALYSIS_LABEL[analysis.detection].replace(' run on the uploaded video', '').replace('Boxes from ', '') : 'n/a'}</dd></div>
        <div className="flex justify-between gap-2"><dt>Processing</dt><dd className="text-fg-2">{analysis?.running ? 'running' : analysis?.failed ? `${analysis.failed} failed` : 'complete'}</dd></div>
        <div className="flex justify-between gap-2"><dt>Reviewed</dt><dd className="text-fg-2">{reviewed} / {data.finds.length}</dd></div>
        <div className="flex justify-between gap-2"><dt>Clock</dt><dd className="text-fg-2">{data.seek0.unsynchronized.length ? `${data.seek0.unsynchronized.length} source(s) unrelated` : 'all related'}</dd></div>
      </dl>
      <h2 className="t-eyebrow mb-1.5 mt-4 text-fg-3">Sources</h2>
      <ul className="space-y-1">
        {data.ev.filter((e) => ['cctv', 'dashcam', 'sensor_csv'].includes(e.kind)).map((e) => {
          const isVideo = e.kind !== 'sensor_csv';
          return (
            <li key={e.id}>
              <button type="button" disabled={!isVideo || !e.video?.playback_ready} aria-pressed={primaryId === e.id} onClick={() => useWorkspace.getState().setPrimaryVideo(e.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10 disabled:cursor-default disabled:hover:bg-transparent">
                {isVideo ? <Film className="h-4 w-4 shrink-0 text-fg-3" aria-hidden /> : <Gauge className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />}
                <span className="min-w-0 flex-1"><span className="t-small block truncate text-fg">{e.original_filename}</span><span className="t-caption text-fg-3">{e.kind}{shifts[e.id] != null ? '' : ' · not synchronized'}</span></span>
              </button>
            </li>
          );
        })}
        {aiAnalysis?.simulated_obd && <li><a href={api.featherlessObdUrl(caseId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"><Gauge className="h-4 w-4 shrink-0 text-fg-3" aria-hidden /><span className="min-w-0 flex-1"><span className="t-small block truncate text-fg">SIMULATED_Featherless_OBD.csv</span><span className="t-caption text-fg-3">sensor CSV · synthetic demo</span></span></a></li>}
      </ul>
      <div className="mb-1.5 mt-4 flex flex-wrap items-center justify-between gap-2"><h2 className="t-eyebrow flex items-center gap-1.5 text-fg-3"><Users className="h-3.5 w-3.5" aria-hidden />Vehicles and people</h2><Button size="sm" variant="outline" loading={labelBusy} onClick={suggestLabels}>Generate AI labels</Button></div>
      {data.actors.length === 0 ? <p className="t-caption text-fg-3">No identities confirmed.</p> : (
        <ul className="space-y-0.5">{data.actors.map((a, i) => (
          <li key={a.id}><button type="button" aria-pressed={selectedActor === a.id} onClick={() => useWorkspace.getState().selectActor(selectedActor === a.id ? null : a.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10">
            <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ACTOR_COLORS[i % ACTOR_COLORS.length] }} aria-hidden /><span className="t-small min-w-0 flex-1"><span className="block truncate">{a.attributes?.ai_suggested_label || a.label}</span>{a.attributes?.label_origin === 'featherless' && <span className="t-caption block text-accent-text">AI suggested · {Math.round((a.attributes.confidence || 0) * 100)}%</span>}</span></button></li>
        ))}</ul>
      )}
      <h2 className="t-eyebrow mb-1.5 mt-4 text-fg-3">Key events</h2>
      <ul className="max-h-60 space-y-0.5 overflow-auto pr-1" aria-label="Key events">
        {keyEvents.map((e) => (
          <li key={e.id}><button type="button" aria-pressed={activeId === e.id} onClick={() => { pick(e); setTab('overview'); }} className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10">
            <i className="mt-1.5 h-2 w-2 shrink-0 rounded-sm" style={{ background: CATEGORY_STYLE[e.category]?.color }} aria-hidden /><span className="min-w-0"><span className="mono t-caption block text-fg-3">{formatTime(e.start_ms)}</span><span className="t-caption block text-fg-2">{e.title}</span></span></button></li>
        ))}
        {keyEvents.length === 0 && <li className="t-caption text-fg-3">No key events.</li>}
      </ul>
    </Panel>
  );

  return (
    <Shell crumbs={crumbs} wide actions={<Button as={Link} to={`/reports/${caseId}`} size="sm" variant="outline" icon={FileText}>Report</Button>}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="t-eyebrow text-accent-text">RECONSTRUCTION</span>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <DesignationBadge designation={eff.value} />
        <span className="mono t-caption text-fg-3">{c.code}</span>
      </div>
      <div className="recon-page-actions" aria-label="Reconstruction controls">
        {scenarios.length > 1 && (
          <label className="recon-scenario t-caption text-fg-3"><span>Scenario</span>
            <Select className="h-9" value={scenarioId || ''} onChange={(e) => load(e.target.value)} options={scenarios.map((s) => ({ value: s.id, label: `${s.name}${s.is_baseline ? ' (baseline)' : ''}` }))} />
          </label>
        )}
        <Button size="sm" variant="outline" onClick={() => showInspector('technical')}>Advanced details</Button>
      </div>
      <CaseBanner designation={c.designation} warning={eff.warning} />
      <div className="mb-3"><CaseMeta c={c} /></div>
      <ReconstructionReadiness caseId={caseId} revision={scenarioId} compact onBuilt={s => load(s.id)} />

      {data.none ? (
        <ErrorState title="No reconstruction yet" description="Review evidence setup above, then build a reconstruction." />
      ) : (
        <>
          <section className="recon-summary" aria-label="Incident summary"><div className="flex flex-wrap items-center justify-between gap-2"><span className="t-eyebrow text-accent-text">INCIDENT SUMMARY</span><Button size="sm" variant="outline" icon={Sparkles} loading={aiRunning} onClick={generateAiAnalysis}>{aiAnalysis ? 'Refresh AI analysis' : 'Generate AI analysis'}</Button></div>{data?.ai?.status === 'failed' && !aiRunning && <p className="t-caption mt-2 text-danger" role="alert">The automatic AI analysis could not finish: {data.ai.error}. You can retry with the button.</p>}{aiRunning && <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4" role="status" aria-live="polite"><div className="mb-2 flex flex-wrap justify-between gap-2"><span className="t-small font-medium text-fg">{aiStage}</span><span className="mono t-caption text-fg-3">{aiElapsed}s elapsed</span></div><ProgressBar value={aiProgress} ariaLabel="Estimated Featherless analysis progress" size="sm" /><p className="t-caption mt-2 text-fg-3">Usually 30–90 seconds. The indicator may pause while Featherless responds.</p></div>}<p>{aiAnalysis?.narrative?.summary || executive?.sentences?.[0] || 'Review the recorded events and their evidence.'}</p><div className="flex flex-wrap gap-2">{aiAnalysis && <Badge variant="neutral">Featherless · YOLO grounded</Badge>}<Badge variant="neutral">{videos.length} recording{videos.length === 1 ? '' : 's'}</Badge><Badge variant="neutral">{reviewCount} items to review</Badge><Badge variant="neutral">{eff.value}</Badge></div></section>
          <div className="recon-focus-layout">
            <div className="recon-video-column">
              <Panel as="section" className="p-5" aria-label="Evidence video">
                <AccidentAlert alert={alertState} event={alertEvent} events={events} cameraName={alertEvent ? nameOf(alertEvent.source_id) : null} card={alertCard} caseId={caseId}
                               onOpenFrame={(e) => openTrail('frame', e)} onDetails={(e) => { pick(e); showInspector('event'); }} onEvidence={(e) => { pick(e); showInspector('evidence'); }}
                               onResume={() => { const st = useWorkspace.getState(); st.setAlert(null); st.setPlaying(true); }} onDismiss={() => useWorkspace.getState().setAlert(null)} onSeekFrame={seekToFrame} />
                <details className="recon-playback-options"><summary>Playback & alert settings</summary><div className="pt-3"><AutoPauseControls /><MomentBar moment={moment} /></div></details>
                <CameraFilter videos={allVideos} value={camera} onChange={(id) => { setCamera(id); const v = videos.find((x) => x.id === id); if (v) useWorkspace.getState().setPrimaryVideo(id); }} />
                <Player cues={cues} videos={videos} shifts={shifts} trackActors={trackActors} actorLabels={actorLabels} range={range} events={playerEvents} onSelectEvent={(e) => { pick(e); setTab('overview'); }} />
                <p className="t-caption mt-2 text-fg-3" title="Percentages on boxes are the detector's score for that box, not the chance of an event. Nothing is drawn between sampled frames.">Stored detections on sampled frames ({analysis ? ANALYSIS_LABEL[analysis.detection].toLowerCase() : ''}). Hover for what box labels mean.</p>
              </Panel>
              <Panel as="section" className="p-5" aria-label="Timeline">
                <SectionHeader title="Timeline" description={`${shown.items.length} incident events · ${shown.keyEvents.length} key events of ${events.length} placed · times on the case clock`} className="!mb-3" />
                <IncidentSequence events={shown.keyEvents} unplaced={data.tl.unplaced || []} board={board} activeId={activeId} nameOf={nameOf} caseId={caseId} onSelect={pick} onSeekFrame={seekToFrame} onOpenFrame={(e) => openTrail('frame', e)} />
                <Timeline tl={shown.tl} gaps={shown.gaps} overlaps={shown.overlaps} onSelect={pick} onSeek={seekTo} />
              </Panel>
            </div>

            <ThisMoment event={momentEvent} nameOf={nameOf} questions={executive?.questions} onPlay={pick} onDetails={(e) => { pick(e); showInspector('event'); }} onEvidence={(e) => { pick(e); showInspector('evidence'); }} />
          </div>

          {view3dVideo && (
            <Panel as="section" className="mt-4 p-5" aria-label="3D reconstruction">
              <Suspense fallback={<p className="t-small text-fg-3" role="status">Loading the 3D view…</p>}>
                <Incident3D trajs={data.trajs} evidenceId={view3dVideo.id} video={{ width: view3dVideo.video?.width, height: view3dVideo.video?.height, kind: view3dVideo.kind }} moment={moment} marks={accidentMarks(baseEvents, view3dVideo.id)} nameOf={nameOf} />
              </Suspense>
            </Panel>
          )}

          <div className="recon-review-sections">
          <details className="recon-disclosure"><summary><span>Key findings & open questions</span><small>{reviewCount} items · conflicts, support & missing evidence</small></summary><div className="recon-disclosure-body">{aiAnalysis ? <FeatherlessFindings items={aiFindings} onSeek={seekTo} /> : <InvestigationFindings caseId={caseId} cons={data.cons} crbs={data.crbs} gaps={shown.gaps} finds={data.finds} events={[...baseEvents, ...data.tl.unplaced]} nameOf={nameOf} onReview={review} onSeek={seekTo} onPickEvent={pickById}
                              onSeekMedia={(evId, ms) => { window.scrollTo({ top: 0, behavior: 'smooth' }); seekToFrame({ evidence_id: evId, time_ms: ms }); }} />}
</div></details>
          <details className="recon-disclosure" onToggle={(e) => setSourcesOpen(e.currentTarget.open)}><summary><span>Sources & vehicles</span><small>Recordings, identities & evidence details</small></summary><div className="recon-disclosure-body">{NavRail}{aiAnalysis?.simulated_obd && <Alert title="Simulated OBD evidence">{aiAnalysis.simulated_obd.records.length} Featherless-generated demo records. This is synthetic evidence, not a vehicle measurement.</Alert>} {sourcesOpen && <Evidence caseId={caseId} evidence={data.ev} />}</div></details>
          <details className="recon-disclosure"><summary><span>Reconstruction assumptions</span><small>Compare scenarios & clock relations</small></summary><div className="recon-disclosure-body">          <Overlaps overlaps={shown.overlaps} nameOf={nameOf} onSeek={seekTo} />
          <Scenarios scenarios={scenarios} scenarioId={scenarioId} onSelect={(id) => load(id)} hypotheses={data.tl.hypotheses || []} completeness={complete} onPickEvent={pickById} />
</div></details>
          </div>
          <Drawer open={advancedOpen} onClose={() => setAdvancedOpen(false)} title="Advanced investigation" description="Detailed events, findings, sources and technical records." width="sm:max-w-2xl">
            <Panel as="aside" className="p-4" aria-label="Inspector">
              <div className="-mx-1 overflow-x-auto px-1"><Tabs value={tab} onChange={setTab} label="Inspector" items={[{ id: 'overview', label: 'Overview' }, { id: 'event', label: 'Event' }, { id: 'findings', label: 'Findings', count: model.findings.length }, { id: 'evidence', label: 'Evidence' }, { id: 'technical', label: 'Technical' }]} /></div>
              <div className="mt-5">
                {tab === 'overview' && <Overview model={model} executive={executive} moment={moment} motions={motions} events={events} designation={eff.value} activeId={activeId} nameOf={nameOf} onSelectFinding={selectFinding} onSeeAll={() => showInspector('findings')} onPick={pick} onOpenTrail={openTrail} onTechnical={() => showInspector('technical')} />}
                {tab === 'event' && <EventTab event={model.events[activeId]} nameOf={nameOf} board={board} />}
                {tab === 'findings' && (selected
                  ? <FindingDetail f={selected} events={model.events} onPick={pick} onOpenTrail={openTrail} onReview={review} onBack={clearFinding} />
                  : model.findings.length === 0 ? <p className="t-small text-fg-3">No findings were produced for this reconstruction.</p>
                    : <ul className="space-y-2">{model.findings.map((f) => <li key={f.id}><FindingRow f={f} selected={false} onSelect={selectFinding} /></li>)}</ul>)}
                {tab === 'evidence' && (
                  <div className="space-y-4">
                    {selected && <section><h4 className="t-eyebrow mb-1.5 text-fg-3">For the selected finding</h4><FindingDetail f={{ ...selected, summary: selected.title, uncertainty: null, action: null }} events={model.events} onPick={pick} onOpenTrail={openTrail} /></section>}
                    <Evidence caseId={caseId} evidence={data.ev} />
                  </div>
                )}
                {tab === 'technical' && <TechnicalPanel model={model} events={events} videos={videos} modelRuns={data.runs} shifts={shifts} unsynchronized={data.seek0.unsynchronized} gaps={data.gaps} activeId={activeId} onPick={pick} onSelectEvent={pickById} onOpenTrail={openTrail} />}
              </div>
            </Panel>


          <details className="recon-disclosure"><summary>Model & scene details</summary><div className="recon-disclosure-body"><CrashCuePanel videos={videos} cues={cues} onSeek={(evId, ms) => seekToFrame({ evidence_id: evId, time_ms: ms })} /><IncidentOverview narrative={narrative} provenance={incident?.provenance} /><HypothesisExplanation data={narrative} nameOf={nameOf} /><IncidentVehicles actors={data.actors} items={[...shown.items, ...shown.unplaced]} /><KeyObservations events={shown.keyEvents} activeId={activeId} onSelect={pick} nameOf={nameOf} /><IncidentGallery items={frames} /></div></details>
          <details className="mt-4 rounded-lg border border-line p-3">
            <summary className="t-small cursor-pointer text-fg">Technical details</summary>
            <div className="mt-3 space-y-5">
              <section aria-label="Cross-camera association">
                <h3 className="t-eyebrow mb-2 text-fg-3">Cross-camera association</h3>
                <Associations state={assoc} nameOf={nameOf} videos={allVideos.filter((v) => v.kind !== 'other')} onAdd={addAssociation} />
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="t-eyebrow mb-2 text-fg-3">Trajectories</h3>
                  <Trajectory trajs={data.trajs} actors={data.actors} selected={selectedActor} onSelect={(id) => useWorkspace.getState().selectActor(id)} />
                </div>
                <div aria-label="Sensor panel">
                  <h3 className="t-eyebrow mb-2 text-fg-3">Sensor telemetry</h3>
                  {sensorEv ? <Sensor evidence={sensorEv} shift={shifts[sensorEv.id]} label={sensorEv.original_filename} events={(data.tl.lanes.sensor || []).filter((e) => ['hard_braking', 'collision_flag'].includes(e.event_type))} onSelect={pick} />
                    : <SensorPanelNote hasSensor={false} />}
                </div>
              </div>
            </div>
          </details>
          </Drawer>
        </>
      )}
      <p className="t-caption mt-6 text-fg-3">TraceLine supports an investigation. It does not determine fault or legal responsibility.</p>

      <FrameDrawer open={trail?.kind === 'frame'} onClose={() => setTrail(null)} evidence={trailEvidence} event={trail?.ev} />
      <StatementDrawer open={trail?.kind === 'statement'} onClose={() => setTrail(null)} event={trail?.ev} />
      <SensorDrawer open={trail?.kind === 'sensor'} onClose={() => setTrail(null)} evidence={trailEvidence} event={trail?.ev} />
    </Shell>
  );
}
