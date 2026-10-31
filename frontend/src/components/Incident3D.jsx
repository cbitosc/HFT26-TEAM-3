import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Crosshair, Pause, Play } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Segmented } from '../ui-kit';
import { useThrottledTime } from '../hooks';
import { useWorkspace } from '../store';
import { formatTime } from '../lib/time';
import { basisNote, buildActors, dimsOf, involvedAt, markerPct, pose, sceneBounds, withHeadings } from '../lib/scene3d';

const COLORS = { car: 0x3b82f6, truck: 0x8b5cf6, bus: 0xf59e0b, motorcycle: 0x14b8a6, bicycle: 0x14b8a6, pedestrian: 0x94a3b8 };
const INVOLVED = 0xdc2626;
const VIEWS = [{ id: 'top', label: 'Top' }, { id: 'camera', label: 'Camera' }, { id: 'free', label: 'Free' }];

function disposeTree(obj) {
  obj.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => { x.map?.dispose?.(); x.dispose(); }); else { m?.map?.dispose?.(); m?.dispose?.(); } });
}

/** A small text label that always faces the viewer. Drawn on a canvas, so it needs no font files. */
function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 448; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(127, 29, 29, 0.92)'; g.beginPath(); g.roundRect?.(4, 4, 440, 88, 18); g.fill?.();
  g.fillStyle = '#fff'; g.font = '600 34px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 224, 50);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(10.5, 2.25, 1); sp.renderOrder = 10;
  return sp;
}

/** Schematic 3D replay of the stored tracks of one camera. It follows the workspace clock (play, pause and seek here move the video too).
 *  Positions are estimated unless the camera is calibrated; the banner says which. Nothing is drawn that was not tracked. */
export default function Incident3D({ trajs, evidenceId, video, moment, marks = [], nameOf = (x) => x }) {
  const mount = useRef(null);
  const api = useRef(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('free');
  const [trails, setTrails] = useState(true);
  const playing = useWorkspace((s) => s.playing);
  const t = useThrottledTime(10);

  const actors = useMemo(() => withHeadings(buildActors(trajs, { evidenceId, video })), [trajs, evidenceId, video]);
  const involved = useMemo(() => involvedAt(moment, actors), [moment, actors]);
  const bounds = useMemo(() => sceneBounds(actors), [actors]);
  const span = useMemo(() => (actors.length ? [Math.min(...actors.map((a) => a.samples[0].t)), Math.max(...actors.map((a) => a.samples[a.samples.length - 1].t))] : [0, 1000]), [actors]);

  // build the renderer once
  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2.02;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(30, 60, -20); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const grid = new THREE.GridHelper(400, 80, 0x64748b, 0x3b4450); grid.position.y = 0.02; scene.add(grid);
    // the camera that recorded the footage, at the origin looking along +z
    const cam = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), new THREE.MeshLambertMaterial({ color: 0xf97316 }));
    body.rotation.x = Math.PI / 2; body.position.y = 1; cam.add(body); scene.add(cam);
    const dynamic = new THREE.Group(); scene.add(dynamic);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 40), new THREE.MeshBasicMaterial({ color: INVOLVED, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false; scene.add(ring);

    let raf = 0;
    const render = () => { raf = 0; controls.update(); renderer.render(scene, camera); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
    controls.addEventListener('change', schedule);
    const resize = () => {
      const w = el.clientWidth || 640; const h = el.clientHeight || 360;
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix(); schedule();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    api.current = { THREE, scene, camera, controls, dynamic, ring, schedule, renderer };
    return () => {
      ro.disconnect(); controls.removeEventListener('change', schedule); controls.dispose();
      if (raf) cancelAnimationFrame(raf);
      disposeTree(scene); renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  // rebuild the actor meshes and trails when the data (or which ones are involved) changes
  useEffect(() => {
    const a = api.current; if (!a) return;
    [...a.dynamic.children].forEach((c) => { a.dynamic.remove(c); disposeTree(c); });
    actors.forEach((actor) => {
      const d = dimsOf(actor.cls); const hot = involved.keys.has(actor.key);
      const color = hot ? INVOLVED : (COLORS[actor.cls] || COLORS.car);
      const mesh = actor.cls === 'pedestrian'
        ? new THREE.Mesh(new THREE.CylinderGeometry(d.w / 2, d.w / 2, d.h, 12), new THREE.MeshLambertMaterial({ color }))
        : new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.l), new THREE.MeshLambertMaterial({ color }));
      mesh.userData = { key: actor.key, h: d.h }; mesh.visible = false; a.dynamic.add(mesh);
      if (trails) {
        const pts = actor.samples.map((s) => new THREE.Vector3(-s.x, 0.08, s.z));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: hot ? INVOLVED : 0x94a3b8, transparent: true, opacity: hot ? 0.9 : 0.35 }));
        line.userData = { trail: true }; a.dynamic.add(line);
      }
    });
    if (moment && involved.at) {
      const sp = labelSprite(`Accident ${formatTime(moment.ms)}`);
      sp.position.set(-involved.at.x, 6, involved.at.z); sp.userData = { trail: true }; a.dynamic.add(sp);
    }
    a.schedule();
  }, [actors, involved, trails, moment]);

  // pose every actor for the current clock time
  useEffect(() => {
    const a = api.current; if (!a) return;
    a.dynamic.children.forEach((m) => {
      if (m.userData.trail) return;
      const actor = actors.find((x) => x.key === m.userData.key); const p = actor && pose(actor, t);
      m.visible = !!p;
      if (p) { m.position.set(-p.x, m.userData.h / 2, p.z); m.rotation.y = -p.heading; }
    });
    const near = moment && involved.at && Math.abs(t - moment.ms) <= 700;
    a.ring.visible = !!near;
    if (near) a.ring.position.set(-involved.at.x, 0.06, involved.at.z);
    a.schedule();
  }, [t, actors, involved, moment, trails]);

  // camera presets frame the stored tracks
  useEffect(() => {
    const a = api.current; if (!a) return;
    const cx = -(bounds.minX + bounds.maxX) / 2; const cz = (bounds.minZ + bounds.maxZ) / 2;
    const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 24) * 0.9;
    const { camera, controls } = a;
    controls.target.set(cx, 0, cz);
    if (view === 'top') { camera.up.set(0, 0, 1); camera.position.set(cx, size * 1.3, cz + 0.01); }
    else if (view === 'camera') { camera.up.set(0, 1, 0); camera.position.set(0, 4, -8); controls.target.set(0, 1, 30); }
    else { camera.up.set(0, 1, 0); camera.position.set(cx + size * 0.55, size * 0.7, cz - size * 0.9); }
    camera.lookAt(controls.target); controls.update(); a.schedule();
  }, [view, bounds, actors.length]);

  const toggle = () => useWorkspace.getState().setPlaying(!playing);
  const seek = (ms) => { const st = useWorkspace.getState(); st.setPlaying(false); st.requestSeek(ms); };
  const hot = actors.filter((x) => involved.keys.has(x.key));
  const allMarks = useMemo(() => { const m = [...marks]; if (moment && !m.some((x) => x.ms === moment.ms)) m.push({ ms: moment.ms, label: 'Strongest moment' }); return m.sort((a, b) => a.ms - b.ms); }, [marks, moment]);
  const atMoment = !!moment && Math.abs(t - moment.ms) <= 700;
  const calibrated = actors.length > 0 && actors.every((x) => x.calibrated);

  return (
    <section className="incident-3d" aria-label="3D incident view">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="t-eyebrow text-accent-text">3D RECONSTRUCTION</span>
        <Badge variant={calibrated ? 'success' : 'warning'}>{calibrated ? 'calibrated positions' : 'schematic, estimated'}</Badge>
      </div>
      <Alert variant="warning" title={calibrated ? 'Drawn from stored tracks' : 'This is a schematic, not a measurement'}>{basisNote(actors, video)}</Alert>
      {moment && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2" aria-label="Accident timestamp">
          <span className="mono text-[1.0625rem] font-semibold text-danger">{formatTime(moment.ms)}</span>
          <span className="t-small text-fg">Possible accident (not confirmed){video?.name ? ` on ${video.name}` : ''}</span>
          {atMoment && <Badge variant="danger">you are here</Badge>}
          {allMarks.length > 1 && <span className="ml-auto flex flex-wrap items-center gap-1.5">{allMarks.map((m) => <Button key={m.ms} size="sm" variant="outline" onClick={() => seek(m.ms)}>{m.label} · {formatTime(m.ms)}</Button>)}</span>}
        </p>
      )}
      {failed ? (
        <p className="t-small mt-3 rounded-lg border border-line p-4 text-fg-3" role="status">The 3D view needs WebGL, which this browser or device could not start. The video, timeline and findings still work.</p>
      ) : (
        <>
          <div ref={mount} className="mt-3 h-[min(56vh,460px)] min-h-[280px] w-full overflow-hidden rounded-xl border border-line bg-[#1b2027]" role="img" aria-label="3D replay of the tracked vehicles and people" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary" icon={playing ? Pause : Play} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</Button>
            <div className="relative min-w-[8rem] flex-1">
              <input type="range" aria-label="Replay position" className="w-full accent-orange-500" min={span[0]} max={span[1]} step={50} value={Math.min(Math.max(t, span[0]), span[1])} onChange={(e) => seek(Number(e.target.value))} />
              {allMarks.map((m) => { const pct = markerPct(m.ms, span); return pct == null ? null : <i key={m.ms} title={`${m.label} ${formatTime(m.ms)}`} aria-hidden className="pointer-events-none absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded bg-danger" style={{ left: `calc(${pct}% )` }} />; })}
            </div>
            <span className="mono t-caption text-fg-3" aria-live="off">{formatTime(t)}</span>
            {moment && <Button size="sm" variant="outline" icon={Crosshair} onClick={() => seek(moment.ms)}>Go to possible accident · {formatTime(moment.ms)}</Button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Segmented label="3D view" size="sm" value={view} onChange={setView} items={VIEWS} />
            <Checkbox label="Show paths" checked={trails} onChange={() => setTrails((v) => !v)} />
            <span className="t-caption text-fg-3">{actors.length} tracked object{actors.length === 1 ? '' : 's'} · drag to orbit, scroll to zoom</span>
          </div>
          {hot.length > 0 && <p className="t-small mt-2 text-fg-2"><span className="font-medium text-danger">Possible accident, not confirmed.</span> Red: {hot.map((x) => `${x.cls} #${x.trackId}`).join(', ')}{moment ? ` at ${formatTime(moment.ms)}` : ''}. {nameOf(evidenceId)}</p>}
          <p className="t-caption mt-1 text-fg-3">Shapes are generic for each class. An object is hidden when it was not tracked, never carried across a gap. This view does not determine fault.</p>
        </>
      )}
    </section>
  );
}
