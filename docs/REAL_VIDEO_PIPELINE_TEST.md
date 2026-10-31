# Real video pipeline test

The clip is `selected_accident.mp4` (same bytes as `candidate-04.mp4`). The test is `backend/tests/test_real_video_pipeline.py`. It uploads the file through the API, lets the existing job runner validate, index frames, detect, track, and extract events, then builds one reconstruction scenario. Nothing in the test writes boxes or events by hand.

A direct YOLO26s predict on decoded frame 124, before the suite, returned 13 kept boxes (8 car, 4 person, 1 truck) at confidence 0.15. The pipeline was not given a lower threshold. Storage confidence stays 0.15. The display default stays 0.25.

## Weights

`scripts/fetch_models.py --include-accident` downloaded missing files only, then `verified_path` checked the pinned SHA-256 and the pickle allowlist. All three passed. They live under gitignored `data/models/` and are not in the commit.

| Name | File | Bytes | Pinned SHA-256 | Check |
|---|---|---:|---|---|
| yolo26s | yolo26s.pt | 20,422,725 | `646f8bc3fe0a656803d95c294f7852321748cb29d13466a1af8862e2db384a1b` | hash and pickle scan passed |
| yolo26n | yolo26n.pt | 5,544,453 | `9b09cc8bf347f0fc8a5f7657480587f25db09b34bf33b0652110fb03a8ad4fef` | hash and pickle scan passed |
| accident_yolov8s | accident_yolov8s_best.pt | 22,508,024 | `2c75218e3acc597b93310a13af94b3472eb43e8bee852d81f3eefcbc9612f456` | hash and pickle scan passed |

The detector run's `model_version` starts with `sha256:646f8bc3fe0a`. Tracker package `trackers` 2.6.1, Ultralytics 8.4.193, torch 2.15.0+cpu. The CCTV path uses ByteTrack. BoT-SORT was not used, because this file is ingested as `cctv`.

## Measured result

One pytest run of the real-video test. Counts are from the API after the jobs finished. Ids from that run are not stable across later tests, because the test database is truncated between tests. Counts below are what that run returned.

| Item | Value |
|---|---|
| Duration | 15133 ms (container) |
| Nominal fps | 60 |
| Measured fps | 22.608 |
| Container PTS start | 0.0 ms |
| Creation time claimed | null |
| Rotation | null |
| Frames indexed | 342 |
| Frames sampled | 76 (sample rate 5 per second) |
| Preprocess | completed, no warnings |
| Detector boxes | 1093 |
| Detector by class | car 683, pedestrian 330, truck 57, bus 22, traffic light 1 |
| Detector time | 38.02 ms per sampled frame |
| Frames with at least one box | 76 of 76 |
| Accident-cue boxes | 18, class `accident_cue`, 39.51 ms per frame |
| Detect job | completed |
| Tracker | bytetrack |
| Tracks | 21 (stable 16, fragmented 3, short 2) |
| Detections considered / tracked / untracked | 1092 / 832 / 260 |
| First observations backfilled | 17 |
| Source events | 1093 |
| Trajectories | 19 image-frame rows, 828 points, every `case_ms` equal to `source_ms` |
| Findings | 3 gaps |
| Inferences, contradictions, corroborations | 0 |
| Sync groups | 1 (this file is its own reference clock, offset 0) |
| Timeline span | case ms `[0, 15000]` |
| Placed timeline events | 1093 |
| Unplaced timeline events | 0 |
| Seek at case ms 0 | one target, `media_ms` 0, `bound_ms` 0, `unsynchronized` empty |
| Failed jobs | 0 |

The one-frame check inside the test compared stored boxes at confidence ≥ 0.25 with a fresh YOLO26s predict on the same decoded frame. Class lists matched, and each corner was within 3 pixels.

## Source-event types

These come from `video_events.py` unchanged. They are `machine_detection` records. Their `t_start_ms` is media time. Because this upload is the only source, reconstruction places them on the case clock at the same numbers (`start_ms` equals `source_time_ms`). That offset is 0. It is not a measurement against another camera.

| event_type | Count |
|---|---:|
| potential_interaction | 943 |
| possible_near_miss | 63 |
| possible_collision | 49 |
| vehicle_enters_scene | 11 |
| vehicle_slowing | 9 |
| vehicle_leaves_scene | 6 |
| vehicle_stopped | 5 |
| vehicle_direction_change | 4 |
| vehicle_maneuver_observed | 3 |

`possible_collision` is not a physical collision. Each of those rows carries `observations.note`: "image-space proximity or box overlap is not physical contact or distance". Overlap without an abrupt speed change stays `potential_interaction`. There is no event type `collision`. Some of the 49 candidates have `accident_cue_nearby: true`. The cue does not decide the event. The accident model contributed 18 boxes and zero inferences.

## Gaps the builder actually wrote

| gap_type | What it asks for |
|---|---|
| `no_camera_calibration` | No metric trajectory. Points stay in image pixels. |
| `unconfirmed_vehicle_identity` | 19 tracks are not confirmed as known vehicles. |
| `tracking_fragmentation` | 8 continuation candidates. They are not merged. |

There is no `unsynchronized_source` gap. A lone source is its own reference clock, so this file is not listed as unsynchronized.

## Clocks on this clip

- Frame `time_ms`, detection `time_ms`, track times, and source-event `t_start_ms` are media-relative milliseconds. Frame 0 is 0.
- `video.pts_start_ms` is 0.0, so container PTS and media time start together on this file. That is a measurement, not a rule for other files.
- `creation_time_claimed` is null. Wall-clock recording time is not known.
- Timeline `start_ms` / `end_ms` are case-clock milliseconds and, on this clip, equal the media times. `synchronized` is true. `span_ms` is `[0, 15000]`. Seek at case time 0 returns this evidence at media time 0. `unsynchronized` is empty.
- The playback copy used by `/stream` is 1910×1080. Detection boxes stay in the decoded frame, 2392×1352. `video.rotation` is null.

## Progress

`progress` on a running job is grabbed frames, inferred frames, or frames handed to the tracker, divided by the planned units for that stage. It is stored at most at 0.99 until the runner finishes the stage, then 1.0. The four jobs above finished at `progress` 1.0. `tests/test_job_progress.py` checks that preprocess advances by one container frame per step.
