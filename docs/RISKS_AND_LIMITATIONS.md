# RISKS_AND_LIMITATIONS

Version 2. Likelihood (L) and impact (I) are judgments: H/M/L.

## 1. Risk register

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-01 | **No GPU: CARLA cannot run on the dev Mac** (NVIDIA + Windows/Ubuntu required per its docs) | H | H | v3: staged recording path recommended (DATA_SOURCES §5); CARLA only on a borrowed NVIDIA PC; generator for engine-only tests (see R-26) |
| R-02 | CPU-only inference is slow for long videos | H | M | Analysis frame rate and resolution policy; keyframe-only interpretation; measure in Phase 2; demo cases pre-processed |
| R-03 | Pretrained detector and tracker errors (night, rain, occlusion, moving camera) | H | M | Separate reliability assessments; quality warnings; BoT-SORT comparison; no fabricated continuity |
| R-04 | Monocular geometry: no metric positions without calibration | H | M | Trajectory levels; schematic and image-space modes; calibration workflow |
| R-05 | VLM misreads frames | H | M | Context only; never authority for time, speed, coordinates, identity; measured |
| R-06 | LLM claim extraction errors or paraphrase drift | M | M | Verbatim-span checks, schema validation, null-if-absent rule, measured precision and recall |
| R-07 | False contradictions from time or identity errors | M | H | Preconditions (same sync group, confirmed identity, comparable frame); `insufficient` outcome; marginal vs clear |
| R-08 | Synthetic data inflates results | H | H | Label synthetic everywhere; real-data validation for models; oracle vs model evaluation split |
| R-09 | Synthetic witness statements are circular | M | M | Human-written or different-model authoring; hedged and vague styles; reported as synthetic results |
| R-10 | Reconstruction video misread as evidence | M | H | Persistent banner, manifest, separate player, styles legend, limitations card |
| R-11 | Reconstruction video drifts from findings after edits | M | H | Version dependencies; stale flags with diffs; automated video checks |
| R-12 | Featherless limits (concurrency units, 429s), unconfirmed structured-output support, ~25 USD budget | M | M | Limiter, caching, fixtures, validate-and-repair design, small models |
| R-13 | Sending real evidence to a third-party API | M | H | Per-case policy (default off for real cases), minimization, ledger |
| R-14 | Model licences: Ultralytics YOLO26 and its trackers are AGPL-3.0 (verified Phase 2) | M | L | Permissive stack available and recommended: RF-DETR N/S/M/L (Apache-2.0) + `roboflow/trackers` (Apache-2.0); avoid `rfdetr[plus]` (PML 1.0) |
| R-22 | Featherless structured outputs and live behaviour untested (no API key in the research environment) | M | M | Validate-and-repair design; run live checks (MODEL_COMPATIBILITY §6) before Phase 5 |
| R-23 | Spec's Qwen2.5-VL URL (`QwenLM-corp`) is an unofficial fork | L | L | Use official `QwenLM/Qwen3-VL` documentation; models consumed via Featherless only |
| R-15 | Dataset access and licences (BDD100K research-only; AI City institutional email + approval; NGSIM CC BY-SA) | M | M | Subsets, notices, no redistribution; AI City optional |
| R-16 | Dataset correspondence unproven (BDD100K video ↔ GPS/IMU; NGSIM frame ↔ trajectory row) | M | M | Six-check rule; unproven pairs stay separate evidence |
| R-17 | Scope too large for the hackathon duration (unknown) | H | H | P0 vertical slice first; P1/P2 cut line |
| R-18 | Environment gaps (Python 3.9.6, no FFmpeg) | H | L | Phase 0 setup |
| R-19 | Browser playback of generated MP4 | M | M | H.264 via FFmpeg; tested in Phase 8 |
| R-20 | Over-claiming in demo or pitch | M | H | Validator, banned-language list, honest limitations section, review of the demo script |

## 2. Decisions needed at the Phase 1 review

1. **CARLA option:** A (borrowed NVIDIA PC), B (rented GPU), or C (local deterministic generator).
2. **Three-valued `observation_or_inference`** (`observation`, `reported_observation`, `inference`) instead of two values: approve or change (EVENT_SCHEMA §3).
3. **Job system:** a DB-backed queue for v1, with Redis/Celery only if measured need arises.
4. **Default external-inference policy:** off for real cases, on for synthetic.
5. **Anchor proposals require investigator confirmation** (never auto-applied): approve.
6. **No multi-source trajectory fusion in v1:** approve.
7. **Hackathon duration and deadline**, to set P0/P1 time boxes.
8. **Featherless plan type** and unit allowance.
9. **Fork ownership** for the starter repository and submission PR.

## 3. Product limitations (stated in every summary)
- Investigation assistance only; no fault, guilt, or liability determination.
- Accuracy is bounded by pretrained models; nothing is trained or fine-tuned.
- Image-space results are not physical measurements.
- Witness claims are compared, never judged for truthfulness.
- Contradictions mean "sources disagree", not "a source is wrong".
- The reconstruction video is a visual aid derived from findings, not evidence.
- Results on synthetic scenarios do not demonstrate real-world performance.
- Integrity controls are tamper-evident, not a certified chain of custody.

## 4. Status of earlier research (carried over from the v1 draft)
Verified and unverified dataset facts are in DATA_SOURCES.md and `archive/DATASET_RESEARCH.md` (research date 2026-10-30).

## 5. v3 additions (master prompt, 2026-10-30)

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-24 | Accident-Detection-Model repository has **no licence**; images web-sourced with unclear rights | H | M | Don't redistribute weights; download at setup with attribution; ask the author; the accident cue can be disabled |
| R-25 | Accident model is weak (valid P 0.586 / R 0.524) and its test split may leak | H | M | Use only as a supporting cue; `possible_collision` needs independent support |
| R-26 | No GPU for CARLA; MetaDrive offscreen camera failed on this Mac | H | H | Staged two-phone + IMU recording path (DATA_SOURCES §5); CARLA only if an NVIDIA PC is borrowed |
| R-27 | COCO detector may not detect toy cars or figures in staged takes | M | H | Test on the first take; larger RC cars or bicycles/pedestrians in a safe closed area for near-miss only |
| R-28 | UI kit has no licence and its upgrade branch is unmerged | M | L | Add a licence (team-owned), merge `ui-upgrade`, pin a commit |
| R-29 | Timeline/video desynchronization under rapid interaction | M | H | Single store, video-as-clock, latest-wins seek protocol, tests (UI_IMPLEMENTATION_PLAN §4, §8) |
| R-30 | UI scope (landing + 7 routes + workstation) competes with backend time | H | H | Contracts frozen early; UI built on seeded labelled responses in parallel | Model facts from v1 (Featherless image input, vision catalog, concurrency units; Ultralytics AGPL-3.0; ByteTrack MIT) will be re-verified in Phase 2.

| R-31 | The Featherless API key was pasted into the chat transcript | M | M | Stored only in git-ignored `.env` (mode 600); never printed; **rotate it when convenient** (anything in a transcript should be treated as exposed) |
| R-32 | Real model output quality: Qwen3 hybrid models need thinking disabled; field-level normalization is imperfect; ~5% of first attempts still return bad JSON | H | M | Thinking switch, single repair attempt, verbatim verification, manual path, code-derived maneuver; re-measure on realistic statements |
| R-33 | Simulated (test) and real model answers must never share a database: the ledger cache would serve a simulated answer as if live (seen once in testing) | L | M | Tests use `traceline_test` only; the development database is never touched by pytest; live checks against test data must clear the ledger first |
| R-34 | All end-to-end results are on synthetic scenarios with oracle boxes; the real detector found 0 objects in the stylized renders | H | H | Say so everywhere; label oracle runs; measure on real footage (BDD100K or staged takes) before any accuracy claim |
| R-35 | Rule thresholds (30° turn, 50% slowing drop, 1.5-2 s tolerances, gap scaling by larger box) are heuristics | H | M | Defaults are documented and overridable; no accuracy claimed; investigator reviews every finding |
| R-36 | Identity links in the demo are confirmed by matching the generator's own boxes, which no real user can do | M | M | Real cases need investigator confirmation (the UI/API supports it); the demo labels the basis in the link |
| R-37 | Image-space maneuvers rely on a fixed, non-mirrored camera; dashcam motion includes ego motion | M | M | Dashcam maneuvers are not compared with witness claims; dashcam paths are hidden in the trajectory view |
| R-38 | Ground-plane trajectories assume a flat plane and exact reference points | M | M | Quality gating, per-point uncertainty, out-of-region flag; synthetic calibration is a best case |
| R-39 | Frontend has no automated tests; checked manually in one browser | M | M | Add Playwright smoke tests; production build compiles |
| R-40 | Absence of an impact signal is weak evidence (CON-COLL-CLAIM-01) | M | M | Rule strength is always 'marginal'; explanation states it does not establish that no contact occurred |
