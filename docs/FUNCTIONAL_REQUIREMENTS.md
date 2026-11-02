# FUNCTIONAL_REQUIREMENTS

Version 2 (replaces REQUIREMENTS.md v1). Priorities: **P0** is required for the minimum end-to-end demonstration, **P1** for a credible submission, **P2** if time allows. IDs are stable, and tests and evaluation reference them.

## Layer 1: Case and evidence management

| ID | Requirement | Pri |
|---|---|---|
| CASE-01 | Create, list, view, and archive cases | P0 |
| CASE-02 | Upload multiple evidence files per case; a case is valid with any subset of evidence types | P0 |
| CASE-03 | Each evidence item stores: evidence ID, case ID, file reference, original filename, file type, source type, upload time, recording time and timezone if known, clock offset if known, SHA-256, metadata, processing status, source provenance | P0 |
| CASE-04 | Raw evidence is immutable, and processed data is stored separately with its input hash and parameters | P0 |
| CASE-05 | Content-based type detection (not the extension alone) | P1 |
| CASE-06 | Processing status per evidence item and per stage (queued, running, succeeded, failed, skipped, stale) | P0 |
| CASE-07 | Full audit history of uploads, processing runs, corrections, finalizations, and exports | P0 |
| CASE-08 | Register cameras (dashcam/CCTV, position if known, calibration if known) and link videos to them | P1 |
| CASE-09 | Register witnesses and link statements to them | P0 |
| CASE-10 | Ground-truth records are stored but never readable by processing stages | P0 |

## Layer 2A: Video processing

| ID | Requirement | Pri |
|---|---|---|
| VID-01 | Extract container and stream metadata, PTS, frame rate, duration, and embedded creation time | P0 |
| VID-02 | Extract or sample frames with exact source timestamps | P0 |
| VID-03 | Detect cars, trucks, buses, motorcycles, bicycles, and pedestrians with a pretrained detector | P0 |
| VID-04 | Store each detection with frame ID, video ID, video timestamp, box, class, confidence, and model or checkpoint ID | P0 |
| VID-05 | Track objects; store track ID, detection references, first and last frame, box sequence, gaps, and reliability metadata | P0 |
| VID-06 | Post-process tracks: keep incomplete tracks, mark occlusion and missed detections, and never fill gaps silently | P0 |
| VID-07 | Compute movement features: position change, direction change, stops, sustained low movement, region entry and exit, object interactions | P0 |
| VID-08 | Generate candidate events (entering intersection, direction change, slowing, stopping, leaving, potential interaction, potential collision interval), each with supporting frame references | P0 |
| VID-09 | Box overlap never becomes a physical collision without corroboration; it is labelled "potential interaction" or "potential collision interval" | P0 |
| VID-10 | Per-frame quality measures (blur, brightness, dropped or duplicated frames) | P1 |
| VID-11 | Optional on-screen clock reading for CCTV (OCR on a configured region) as a clock source | P2 |

## Layer 2B: Witness processing

| ID | Requirement | Pri |
|---|---|---|
| WIT-01 | Accept text, DOCX/PDF text, and scanned images (OCR when no text layer exists) | P0 (text), P1 (OCR) |
| WIT-02 | Keep the original statement verbatim, with sentence and character offsets | P0 |
| WIT-03 | Extract claims: witness ID, claim ID, event, vehicle or object, action, location, time or time range, exact vs approximate, and the source span | P0 |
| WIT-04 | Extract time expressions and resolve them to intervals relative to stated anchors | P0 |
| WIT-05 | Keep explicit statement text, the LLM-normalized interpretation, corroboration status, and contradiction status as separate fields | P0 |
| WIT-06 | Every extracted span must be found verbatim in the source text, or the claim is rejected | P0 |
| WIT-07 | No component rates witness truthfulness | P0 |

## Layer 2C: Sensor processing

| ID | Requirement | Pri |
|---|---|---|
| SEN-01 | Parse GPS, speed, heading, accelerometer XYZ, gyroscope XYZ, orientation, and collision flags through per-source adapters | P0 |
| SEN-02 | Validate units, block on undeclared units, and record the sampling frequency | P0 |
| SEN-03 | Detect missing samples and gaps | P0 |
| SEN-04 | Normalize timestamps while keeping the raw values | P0 |
| SEN-05 | Convert coordinates (WGS84 to a local metric frame) where required | P1 |
| SEN-06 | Compute derived quantities only under stated validity conditions | P0 |
| SEN-07 | Generate sensor events (hard braking, stop, speed change, heading change, collision flag, gap) | P0 |
| SEN-08 | Keep CARLA simulation timestamps and frame IDs | P0 |

## Layer 2D: Optional vision-language interpretation

| ID | Requirement | Pri |
|---|---|---|
| VLM-01 | Interpret selected frames for scene context, with exact frame references | P1 |
| VLM-02 | VLM outputs are never the authority for timestamps, speed, coordinates, track identity, or legal conclusions | P0 |
| VLM-03 | Confirm a model's image-input support before use; never assume raw video input | P0 |

## Layer 3: Normalization

| ID | Requirement | Pri |
|---|---|---|
| NORM-01 | All pipelines emit canonical events (EVENT_SCHEMA.md) and keep the original source data | P0 |
| NORM-02 | Events support intervals, uncertain boundaries, and open-ended ends | P0 |
| NORM-03 | Store source timestamps separately from normalized timestamps | P0 |
| NORM-04 | Support camera and sensor clock offsets, timezones, missing timestamps, relative video time, approximate witness time, and uncertain synchronization | P0 |
| ENT-01 | Entity resolution keeps candidate matches with their reasons, and uncertain identities are not merged automatically | P0 |
| ENT-02 | Investigators can confirm or reject entity matches; each change is audited | P1 |

## Layer 4: Incident reconstruction engine

| ID | Requirement | Pri |
|---|---|---|
| SYNC-01 | Align sources by recording timestamps, frame timestamps, sensor timestamps, known offsets, known frame correspondence, and manually verified synchronization points | P0 |
| SYNC-02 | Automatic anchor matches are proposals only and apply after investigator confirmation (or in scenarios with a documented shared clock) | P0 |
| SYNC-03 | Unsynchronized source groups stay separate, and cross-group ordering is "unknown" | P0 |
| TL-01 | Order events using intervals, keeping before, after, overlapping, and undetermined relations | P0 |
| TL-02 | Keep alternative orderings where evidence cannot decide | P0 |
| TL-03 | Investigator corrections create new timeline versions and never overwrite raw evidence or prior versions | P0 |
| COR-01 | Classify comparisons as supporting, contradicting, partially supporting, unrelated, or insufficient | P0 |
| COR-02 | Corroboration counts only independent sources; duplicate or derived evidence does not count | P0 |
| CON-01 | Candidate contradictions come from deterministic rules covering action, time, direction, identity, ordering, and location | P0 |
| CON-02 | Rules account for timestamp uncertainty and entity-match status, so not every difference is a contradiction | P0 |
| CON-03 | An LLM may write a short explanation using only the compared records; it never decides which source is right | P1 |
| GAP-01 | Detect missing video intervals, low frame rate, blur, occlusion, poor lighting, missing sensor samples, clock inconsistencies, track fragmentation, uncertain identity, missing calibration, and unsupported claims | P0 |
| GAP-02 | Produce recommendations for additional evidence | P1 |
| TRJ-01 | Image-space trajectories from tracks | P0 |
| TRJ-02 | Calibrated ground-plane trajectories, only with valid calibration or homography | P1 |
| TRJ-03 | GPS-based and sensor-supported trajectories | P1 |
| TRJ-04 | Candidate collision region where the evidence supports it | P1 |
| TRJ-05 | Each trajectory point keeps time, position, identity, coordinate frame, uncertainty, and source references | P0 |
| INF-01 | Inferences need a registered rule, premises, a support level, and alternatives | P1 |

## Layer 5: Investigation summary

| ID | Requirement | Pri |
|---|---|---|
| SUM-01 | Generate the sixteen sections in INVESTIGATION_SUMMARY.md from validated records | P0 |
| SUM-02 | No LLM writes the narrative on its own; prose fills template slots and is validated | P0 |
| SUM-03 | Summaries are versioned; investigator edits create a new version and keep the old one | P0 |
| SUM-04 | Explicit finalization, recorded with actor and time | P0 |
| SUM-05 | A validator rejects uncited sentences and fault or guilt language | P0 |
| ASK-01 | An optional assistant answers questions from the current case's records only, with citations | P2 |

## Layer 6: Reconstruction video

| ID | Requirement | Pri |
|---|---|---|
| RV-01 | Generate an MP4 only from a finalized summary and its timeline and trajectory versions | P0 |
| RV-02 | Deterministic 2D top-down rendering; no generative video | P0 |
| RV-03 | Content: title with case ID, scene, road layout, vehicle identities, movements, clock, event markers, candidate collision point if supported, witness and sensor markers, uncertainty, observed vs inferred labels, closing limitations | P0 |
| RV-04 | Styles: solid for observed or strongly supported, dashed for inferred or partial, shading for uncertainty, a marker for unknown segments; a legend on screen | P0 |
| RV-05 | Without physical geometry, label the output as schematic or image-space and make no metric claim | P0 |
| RV-06 | A manifest for every video (IDs, versions, configuration, timestamp, source events, evidence references, limitations, output hash) | P0 |
| RV-07 | A per-frame trace file mapping rendered elements to record IDs | P1 |
| RV-08 | Changes after generation mark the video stale, list what changed, and require regeneration | P0 |
| RV-09 | Playable in the application and downloadable | P0 (API), P1 (UI) |

## Original evidence playback (backend support)

| ID | Requirement | Pri |
|---|---|---|
| PB-01 | Stream original video with HTTP range requests | P0 |
| PB-02 | Provide overlays (boxes, track IDs, event markers) for a time window | P1 |
| PB-03 | Map timeline time to video time and back, using the synchronization record | P0 |
| PB-04 | Selecting an event returns its seek time and supporting frame | P0 |

## Evaluation

| ID | Requirement | Pri |
|---|---|---|
| EVAL-01 | Each scenario has a manifest, evidence, expected events, ground truth where available, expected contradictions, expected findings, and limitations | P0 |
| EVAL-02 | The harness computes metrics, keeping model evaluation separate from engine evaluation | P1 |
| EVAL-03 | Check reconstruction video consistency with the finalized timeline automatically | P1 |
| EVAL-04 | Results include sample sizes and failure lists; no numbers are hand-written | P0 |

## Non-functional requirements

| ID | Requirement | Pri |
|---|---|---|
| NFR-01 | Reproducibility: same inputs, parameters, and model versions give the same stored outputs; model responses are cached by hash | P0 |
| NFR-02 | Traceability: any summary sentence or video marker resolves to source evidence | P0 |
| NFR-03 | Secrets live only in backend environment variables (`FEATHERLESS_API_KEY`, `FEATHERLESS_TEXT_MODEL`, `FEATHERLESS_VISION_MODEL`) | P0 |
| NFR-04 | Resilience: a failed stage records its failure, and later stages run on partial results where that is meaningful | P0 |
| NFR-05 | Long work (video processing, rendering) runs asynchronously | P0 |
| NFR-06 | Runs on a no-GPU machine (CPU or Apple Silicon) | P0 |
| NFR-07 | Per-case control over sending data to external inference | P0 |
| NFR-08 | Models and providers can be replaced through interfaces | P0 |
| NFR-09 | No training, fine-tuning, or custom networks | P0 |
