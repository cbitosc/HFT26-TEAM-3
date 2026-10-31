# PRODUCT_DEFINITION

Project: AI-Powered Timeline Reconstruction for Road Accident Forensics (working name **TraceLine**)
Document status: version 2, amended by the v3 master prompt (2026-10-30). **v3 overrides:** the generated MP4 reconstruction video is deferred to P2, and the interactive 2D trajectory view synchronized with the original footage is the primary reconstruction. A landing page, dashboard, incident summaries per event, and alternative scenarios are now in scope. Where this document conflicts with ARCHITECTURE.md §11, ARCHITECTURE.md wins.
Nothing described here is implemented. No accuracy or latency figure exists yet.

## 1. Problem

Road accident investigations combine evidence that is incomplete and partly inconsistent:

- dashcam footage with gaps, and CCTV from other viewpoints;
- witness statements that conflict with each other;
- partial vehicle movement information;
- missing, wrong, or unsynchronized timestamps;
- limited sensor data;
- uncertain vehicle identities;
- periods with no evidence at all.

Investigators compare these sources by hand to build a plausible chronology. The work is slow, hard to audit, and easy to get wrong when sources disagree.

## 2. Objective

An investigation-assistance platform that:

1. ingests independent evidence sources into a case;
2. extracts events from each source with exact references back to the source;
3. normalizes time and identity across sources without hiding uncertainty;
4. reconstructs a chronological timeline, keeping alternative orderings when evidence cannot decide;
5. identifies corroborations, contradictions, and evidence gaps;
6. reconstructs vehicle movements where the evidence supports it;
7. produces a versioned investigation summary built from validated records;
8. after the summary is finalized, renders a **deterministic reconstruction video** from the finalized records, clearly labelled as a generated reconstruction and not as evidence.

## 3. Users

| Group | Role |
|---|---|
| Traffic police, road accident investigation units, accident investigation teams | **Primary**: run cases, review findings, correct records, finalize summaries |
| Insurance investigators, forensic reconstruction professionals, legal and investigative professionals | **Secondary**: review findings, trace conclusions to evidence, export reports and videos |

## 4. What we are not building

Not a video summarizer, a generic chatbot, a plain object detector, or a generic accident detector. The product is an **evidence-correlated reconstruction system**.

## 5. Differentiating capabilities

1. Multisource evidence integration (video, CCTV, statements, sensors, documents).
2. Chronological reconstruction with interval time and alternative orderings.
3. Contradiction and corroboration detection by explicit rules.
4. Traceable references from every finding to frames, rows, or text spans.
5. Vehicle trajectory reconstruction with stated coordinate frame and uncertainty.
6. Explicit uncertainty, kept as separate assessments with no blended score.
7. An investigation summary generated from validated structured records.
8. A generated reconstruction video rendered only from the finalized findings.

## 6. Hard boundaries

The system must never:

- declare legal guilt or assign legal fault;
- present an inference as an observation;
- invent events, timestamps, entities, positions, or source references;
- present uncertain trajectories as exact, or convert pixels to metres without valid calibration;
- present a generated reconstruction as original evidence;
- use generative video models to depict accident movements;
- decide whether a witness is truthful;
- treat two sources as synchronized without a recorded synchronization basis;
- discard original evidence or original statement text.

## 7. Inputs

A case works with **any subset** of these. No evidence type is mandatory.

| Input | Examples |
|---|---|
| Dashcam video | MP4/MOV from a vehicle-mounted camera |
| CCTV video | Fixed-camera footage, possibly with an on-screen clock |
| Witness statements | Typed text, DOCX/PDF text, scanned documents (OCR) |
| Sensor files | CSV/JSON with GPS, speed, heading, accelerometer, gyroscope, orientation, collision flag |
| Dataset annotations | BDD100K, NGSIM, or CARLA ground-truth records (for evaluation) |
| Ground-truth records | Scenario truth files, kept apart from evidence |
| Scene geometry (optional) | Road layout, camera calibration points, map extracts |

## 8. Outputs

1. Evidence inventory with hashes, metadata, quality notes, and processing status.
2. Per-source extraction results: detections, tracks, claims, sensor events.
3. Canonical events with source references.
4. Synchronization records: clock offsets, bases, uncertainty, unsynchronized groups.
5. Timeline versions: ordered and unordered relations, and alternative orderings.
6. Correlation results: supporting, contradicting, partially supporting, unrelated, insufficient.
7. Gap and quality analysis with recommendations for further evidence.
8. Trajectories with coordinate frame, level, uncertainty, and sources.
9. Investigation summary in sixteen sections (see INVESTIGATION_SUMMARY.md), versioned.
10. Reconstruction video (MP4) with a manifest, a per-frame trace file, and a stale flag.
11. Audit history of every processing step and every investigator correction.

## 9. Two playback experiences

| | Original evidence playback | Generated reconstruction video |
|---|---|---|
| Content | The uploaded footage, unchanged | A deterministic 2D render of finalized findings |
| Overlays | Boxes, track IDs, event markers, source references, timeline sync | Vehicles, trajectories, event markers, uncertainty, observed/inferred labels, legend |
| Status | Evidence | **Not evidence**; a visual aid derived from findings |
| When available | As soon as evidence is ingested | Only after the summary is finalized |

The two players are visually and textually distinct everywhere they appear.

## 10. Known limitations

- Monocular video gives image-space motion only. Metric positions need calibration or a physical reference.
- Pretrained detectors and trackers miss objects and switch identities, especially at night, in rain, or under occlusion.
- Vision-language models misread scenes. They provide context only and are never the authority for time, speed, position, or identity.
- Statements are testimony. Vague claims are reported as untestable rather than forced into a comparison.
- Synthetic scenarios test the pipeline's logic, not real-world robustness.
- No model training or fine-tuning, so accuracy is bounded by available pretrained models.
- Integrity features are tamper-evident, not a certified legal chain of custody.
- Hardware has no GPU (see HARDWARE_AND_COMPUTE_PLAN.md), so processing runs at reduced frame rates and model sizes.

## 11. Smallest meaningful end-to-end demonstration

One controlled intersection-collision case, processed by the backend with no UI:

1. Ingest one dashcam clip, one sensor file on a documented shared clock, and two statements labelled synthetic.
2. Detect and track vehicles; extract candidate events with frame references.
3. Extract witness claims with exact text spans.
4. Synchronize sources from the recorded clock basis.
5. Build the timeline; flag at least one corroboration and one contradiction with explanations.
6. Reconstruct trajectories at the level the evidence supports.
7. Generate and finalize the summary.
8. Render the reconstruction video with a manifest and trace file.
9. Score every stage against the scenario's ground truth.

## 12. Success definition

The product succeeds if a reviewer can take any sentence in the summary, or any marker in the reconstruction video, and reach the exact source frame, row, or text span. No sentence may contain a fault judgment or an inference presented as fact. Results must be measured, with failures listed.

## 13. Terms

| Term | Meaning |
|---|---|
| Observation | A reading produced from evidence by a measurement or extraction method (track geometry, sensor value, OCR text) |
| Reported observation | What a witness states they saw; recorded verbatim, not verified |
| Inference | A conclusion derived from other records by a registered rule; never stated as established |
| Finding | A correlation, gap, or inference record shown in the summary |
| Finalized summary | A summary version an investigator has explicitly approved; the only valid input to video generation |
| Stale artifact | An artifact whose inputs have changed since it was generated |
