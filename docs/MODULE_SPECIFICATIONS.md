# MODULE_SPECIFICATIONS

Version 2, amended by v3: Layer 6 (`recon.*`, reconstruction video) is deferred to P2 (design in `archive/RECONSTRUCTION_VIDEO_ARCHITECTURE.md`); per-event incident summaries (`summaries`) and alternative scenarios are added (ARCHITECTURE.md §7, §9). Modules are subpackages of `traceline`. Each entry lists responsibility, inputs, outputs, dependencies, failure modes, and the detailed design document. Priorities follow FUNCTIONAL_REQUIREMENTS.md.

## Layer 1: Case and evidence management

| Module | Responsibility | Inputs → Outputs | Failure modes |
|---|---|---|---|
| `cases` | Case lifecycle, case policy (`allow_external_inference`, data designation real/synthetic) | API requests → case rows | Archived case modified (rejected) |
| `evidence` | Upload, content-type detection, SHA-256, immutable storage, metadata extraction dispatch, provenance | Files → evidence items, custody/audit entries | Duplicate content (linked, not copied), truncated upload, wrong declared type |
| `registry` | Cameras, witnesses, sensor streams, and their links to evidence | Investigator input, manifests → registry rows | Missing camera info (allowed; recorded as unknown) |
| `audit` | Append-only, hash-chained history of every action | Events from all modules → audit log | Chain verification failure (raised as an integrity alert) |

## Layer 2: Evidence pipelines (see the pipeline architecture docs)

| Module | Responsibility | Inputs → Outputs | Failure modes |
|---|---|---|---|
| `video.metadata` | ffprobe metadata, PTS table, embedded times | Video → metadata, frame-time index | VFR, missing PTS, rotation flags |
| `video.frames` | Frame extraction or sampling at configured rates | Video + policy → frame refs | Corrupt ranges (skipped and recorded) |
| `video.quality` | Blur, brightness, dropped and duplicate frames | Frames → quality records | — |
| `video.detect` | Calls `ObjectDetector` | Frames → detections | Low recall in poor conditions |
| `video.track` | Calls `ObjectTracker`, post-processes tracks | Detections → tracks, gaps, reliability | ID switches, fragmentation |
| `video.motion` | Movement features from tracks (image space, or ground plane when calibrated) | Tracks (+ calibration) → features | Ego motion confounds dashcam features |
| `video.events` | Candidate events with frame references | Features, zones → canonical events | False candidates (thresholds recorded) |
| `vision.interpret` | Optional `FrameInterpreter` on selected frames | Frames + questions → scene observations | Misreadings; disabled by case policy |
| `witness.text` | Text extraction (native text, DOCX/PDF), OCR fallback | Documents → statement text with offsets | Scans with low OCR confidence (flagged) |
| `witness.claims` | Calls `WitnessExtractor`, span verification, time expressions | Statement → claims | Invalid spans (rejected), vague times |
| `sensors.adapters` | Map source columns to the canonical sensor schema | CSV/JSON + adapter → records | Undeclared units (blocked) |
| `sensors.process` | Gaps, frequency, coordinate conversion, derived quantities | Records → normalized records | Noisy derivatives (method recorded) |
| `sensors.events` | Sensor events | Normalized records → canonical events | Threshold sensitivity |

## Layer 3: Normalization

| Module | Responsibility | Inputs → Outputs | Failure modes |
|---|---|---|---|
| `events` | Canonical event model, write-time validation, versioned storage | Pipeline outputs → events | Schema violations (rejected) |
| `timesync.clocks` | Per-source clock records (offset, timezone, basis, uncertainty) | Metadata, manifests, investigator input → clock records | Conflicting clock information (both kept, flagged) |
| `entities` | Entity candidates, match proposals with reasons, confirmed links | Tracks, sensor streams, claims → entities, candidate links | Ambiguous matches (kept as candidates) |

## Layer 4: Reconstruction engine (deterministic)

| Module | Responsibility | Detailed in |
|---|---|---|
| `engine.sync` | Synchronization groups, offset composition, anchor proposals | SYNCHRONIZATION_ARCHITECTURE.md |
| `engine.timeline` | Interval ordering, alternative orderings, timeline versions, corrections | INCIDENT_RECONSTRUCTION_ENGINE.md |
| `engine.correlate` | Pairwise comparison and classification | INCIDENT_RECONSTRUCTION_ENGINE.md |
| `engine.contradict` | Rule catalogue for contradictions | CONTRADICTION_DETECTION.md |
| `engine.corroborate` | Independence-aware corroboration | INCIDENT_RECONSTRUCTION_ENGINE.md |
| `engine.gaps` | Gap and quality analysis, recommendations | INCIDENT_RECONSTRUCTION_ENGINE.md |
| `engine.trajectory` | Image-space, ground-plane, GPS, and sensor trajectories; collision region | TRAJECTORY_RECONSTRUCTION.md |
| `engine.inference` | Registered inference rules with premises and alternatives | INCIDENT_RECONSTRUCTION_ENGINE.md |
| `engine.explain` | Optional LLM explanation of a stored comparison (text only, validated) | CONTRADICTION_DETECTION.md |

## Layer 5: Investigation summary

| Module | Responsibility | Detailed in |
|---|---|---|
| `summary.build` | Assemble sixteen sections from records | INVESTIGATION_SUMMARY.md |
| `summary.validate` | Citation, span, and language checks | INVESTIGATION_SUMMARY.md |
| `summary.versions` | Versions, edits, finalization | INVESTIGATION_SUMMARY.md |
| `assistant` (optional) | Case-grounded Q&A with citations | INVESTIGATION_SUMMARY.md |

## Layer 6: Reconstruction video

| Module | Responsibility | Detailed in |
|---|---|---|
| `recon.scene` | Build the scene model from the finalized summary, timeline, trajectories, and geometry | RECONSTRUCTION_VIDEO_ARCHITECTURE.md |
| `recon.render` | Deterministic frame rendering with styles, legend, labels | same |
| `recon.encode` | MP4 encoding (H.264 via FFmpeg) | same |
| `recon.manifest` | Manifest, per-frame trace, output hash | same |
| `recon.stale` | Staleness detection and change diffs | same |

## Cross-cutting

| Module | Responsibility |
|---|---|
| `llm` | Featherless client: policy check, cache, limiter, retries, ledger, schema validation |
| `jobs` | Job queue, workers, stage DAG, idempotency |
| `playback` | Range streaming, overlay windows, time mapping between timeline and video |
| `api` | REST endpoints (API_DESIGN.md) |
| `eval` | Metrics, ground-truth access, reports (EVALUATION_PLAN.md) |
| `config` | Settings from the environment; no secrets in code |

## Implementation dependency order

`cases/evidence/audit` → `jobs` → `video.metadata/frames` → `video.detect/track` → `events` → `video.motion/events` → `sensors.*` → `timesync` → `witness.*` (+`llm`) → `entities` → `engine.sync` → `engine.timeline` → `engine.correlate/contradict/corroborate/gaps` → `engine.trajectory` → `engine.inference` → `summary.*` → `recon.*` → `playback` → `eval` (skeleton from the start) → frontend.
