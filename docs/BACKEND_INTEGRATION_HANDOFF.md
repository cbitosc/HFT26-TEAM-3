# Backend integration handoff

The response contract is [INTEGRATION_CONTRACT.md](INTEGRATION_CONTRACT.md). Bind to those field names. `docs/API_DESIGN.md` is not the list of fields the server returns. This branch does not edit `frontend/`.

The real clip's measured counts are in [REAL_VIDEO_PIPELINE_TEST.md](REAL_VIDEO_PIPELINE_TEST.md). Do not hard-code those counts into the UI. Read them from the API.

## Persisted case

Development database, not the test database (pytest truncates that one):

| | |
|---|---|
| Case | `TL-C30DD7` / `case_d255f851d423`, title `ACCIDENT preview tbone (4)`, designation `real` |
| Evidence | `ev_289b77d5484e`, `selected_accident.mp4`, `synthetic: false`, sha256 `29567448e55c8810cc434349cf78c9202033622e038d8d9c03b426cd1d067b6b` |
| Baseline scenario | `scn_b498fa275dd1`, name `single camera, own reference clock` |
| Jobs | validate, preprocess, detect, track: all `completed`, `progress` 1.0 |

An older scenario `scn_e252db6b59ac` was built before a lone source was its own clock. It is no longer the baseline. The default timeline is the new scenario.

## What this camera returns

- Picture timing is media-relative `time_ms` on frames, detections, tracks, and overlays. `video.pts_start_ms` is 0. `creation_time_claimed` is null. `rotation` is null. There is no wall-clock recording time.
- This upload is the only source, so it is its own reference clock (offset 0, one sync group). `GET /cases/{id}/timeline` has 1093 events in `lanes`, `unplaced` empty, `span_ms: [0, 15000]`. Each machine-detection `start_ms` equals `observations.source_time_ms[0]`. `synchronized` is true.
- `GET /cases/{id}/seek?case_ms=0` returns one target for this evidence, `media_ms` 0, `bound_ms` 0, and `unsynchronized: []`.
- Trajectories are `frame: "image"` only. Every point has `case_ms` equal to `source_ms`. `calibration_note` says the coordinates are pixels. There is no ground-plane row.
- Detector boxes at storage confidence 0.15: 1093 (car 683, pedestrian 330, truck 57, bus 22, traffic light 1) on 76 of 76 sampled frames. Accident cue: 18 boxes. Tracks: 21 (ByteTrack). Source events: 1093, including `possible_collision` 49 and `potential_interaction` 943. Findings: 3 gaps (no calibration, 19 unconfirmed tracks, 8 unmerged continuation candidates). Inferences, contradictions, and corroborations: 0.
- `possible_collision` is a machine-detection candidate. `observations.note` says image overlap is not physical contact or distance. Do not render it as an impact, and do not drop the word "possible". `potential_interaction` is the overlap-only type. It is not a count of contacts. There is no event type `collision`.
- Job `progress` is a fraction of the current stage's frames, capped at 0.99 while the stage is running, then `1.0` when `status` is `completed` or `partially_completed`. A failed job keeps the last fraction. Do not animate it with a timer. Poll `stage`, `status`, and `progress`. The contract §4 lists the unit for each stage. No new field was added.
- Detection `bbox` is in the OpenCV frame, 2392×1352 (`video.width` / `video.height`, and `frame_size` on `GET /evidence/{id}/detections`). The `/stream` playback copy of this file is H.264 **1910×1080** (the builder caps height at 1080). Overlay responses do not repeat `frame_size`.

## What the frontend has to change

1. **Scale boxes from the decoded frame into the playback element.** `Player.jsx` maps `bbox` with `containTransform(el.videoWidth, el.videoHeight, …)`. For this file `videoWidth` is 1910 and the boxes are in 2392×1352 space, so the rectangles land about 25% too large. Scale each box by `el.videoWidth / v.video.width` and `el.videoHeight / v.video.height` before `mapBox`. Use `v.video` from the evidence object. Do not assume the stream size is the detection size.

2. **Show `job.progress` as the stage fraction.** The upload queue can display the number the API returns. `1.0` means that stage finished. Values while `status` is `processing` stay at or below 0.99. Do not add a timer or a fake percent.

3. **Keep candidate wording.** Titles and `observations.note` already say these are not physical contact. Do not restyle `possible_collision` or `potential_interaction` as a confirmed impact. Do not hide the large `potential_interaction` count by treating it as noise; it is what the rule emitted on a busy intersection at 5 fps.

4. **This clip's events are in `timeline.lanes`.** `Workspace.jsx` already lists lanes and seeks `start_ms`. That matches this case, because `start_ms` is the case clock and equals media time. `Timeline.jsx` already lists `unplaced`. Keep that list for a later case with two sources and no sync edge: those events have `start_ms: null`. Do not sort null as 0, and do not seek the case clock from it.

5. **Trajectory marker.** On this clip `case_ms` is set, so the existing marker moves with the case clock. If a later source stays unsynchronized, `case_ms` is null and the marker stays put. Compare `source_ms` with that video's own media time in that case.

6. **Do not invent the endpoints still missing.** These were requested and are not implemented: `GET /activity`, a cross-case `GET /jobs` or `GET /findings`, `GET /evidence/{id}/jobs`, `source_ref.rows` on sensor events, and a nearest-frame lookup. The dashboard can keep fanning out. Do not fill those screens with made-up rows.

No API field was renamed.
