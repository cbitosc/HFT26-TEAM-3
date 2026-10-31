# Final V2 audit (backend)

Branch `feat/traceline-investigation-flow-v2`. This note covers `backend/` and the backend docs. It does not cover the frontend worker, and it does not treat a synthetic fixture as a result on the selected accident clip.

Pytest, from `backend/`, after the case-field migration: **251 passed, 19 skipped, 0 failed** (about 74s).

The selected file `selected_accident.mp4` was on disk, so `tests/test_real_video_pipeline.py::test_selected_accident_video_is_detected_tracked_and_reviewed` ran and passed. That is the only real-footage test. It checks one camera: upload hash, YOLO26s boxes against a direct run, tracks, video events, a lone-source timeline (`synchronized_ms` null, `evidence_class` `derived_observation`, trace complete), seek at case time 0, image trajectories, an empty contradiction list, and a default full report whose designation line does not say synthetic.

Skipped, and not claimed:

| Count | Reason |
|---|---|
| 12 | `tests/test_reconstruction.py` needs packages from `scripts/build_scenarios.py` |
| 4 | `tests/test_report.py` needs the same packages |
| 1 | Accident-cue validation image split is not installed |
| 1 | Browser seeking, left to the frontend worker (`test_v2_scenarios.py`) |
| 1 | Browser timeline-video sync, left to the frontend worker |

`tests/test_v2_scenarios.py` is 37 passed and those 2 skips. Every passing test in that file is a synthetic fixture. `tests/test_case_followup.py` is synthetic as well.

## Implemented and verified

Verified here means an automated test exercised the behavior. The real-clip column is only the pipeline test above. Everything else in this section was verified on synthetic fixtures or generated lavfi clips.

| Capability | Where it was checked |
|---|---|
| Real clip upload, detect, track, events, lone-source clocks, seek, image trajectories, full report | Real selected clip |
| Synthetic bytes refused on a real case | Synthetic fixture |
| Editable source annotation beside an immutable file; kind `other` stored and not tracked | Synthetic fixture, including a generated video for `other` |
| Tracker ids not matched across cameras | Synthetic detections |
| Clocks, evidence class, trace, overlap, uncertain association, completeness | Synthetic values and one empty API scenario |
| Featherless narrative rejected without matching evidence ids; failure keeps the deterministic summary | Stand-in client, no network |
| Witness claim spans, one repair, policy and missing key | Stand-in client |
| Sensor mapping, units, raw cells, gaps, GPS consistency flag | Synthetic CSV |
| Rotated display matrix baked once | Synthetic lavfi clip |
| Investigator report caps a long event list and still stores every row | Synthetic rows |
| Case `incident_at` (offset required) and `location_text` on create, read, and PATCH | Synthetic case |
| Report list `format` is `executive` or `full` without returning the document | Synthetic case |
| Storyboard cites stored frames and leaves a missing still empty | Synthetic frames |

## Implemented, not verified on real footage

The code path exists and synthetic or stand-in tests cover it. The selected clip was not used for these.

| Capability | Limit |
|---|---|
| Witness extraction and incident narrative | No live Featherless call. Keys stay in the environment. A missing key or `allow_external_inference: false` stores no model text |
| Sensor CSV and GPS consistency | No sensor file was attached to the selected case in the pipeline test |
| Multi-camera sync, offsets, overlap, and API seek across two clocks | Generated clips and plain values, not two real cameras |
| Cross-camera association | Uncertain rows from confirmed links. The real clip has one camera, so no association was produced there |
| Storyboard and before/during/after | The read uses stored frames. The pipeline test does not call `GET /cases/{id}/storyboard` |
| Source location, recording window, timezone, display name | Not set on the selected upload |
| Case `incident_at` and `location_text` | Not set on the selected case. Existing databases keep null until someone sets them |

## Partial

| Capability | What is true |
|---|---|
| Wall clock | Only a trusted declared clock plus media time. Embedded `creation_time_claimed` is stored and unused for sync |
| Synchronized time | `clocks.synchronized_ms` is set only for a consistent group of two or more sources. A lone source, including the selected clip, keeps it null |
| Hypotheses | Stored alternatives with a complete evidence trace. `probability` is null. Incomplete premises are omitted from the narrative list |
| Camera-versus-camera disagreement | Two traced events plus a time overlap. The engine does not pick a winner |
| Completeness | `defensible` needs one placed event with a complete trace and a placeable class. It is not a legal conclusion |
| Report products | Two: `full` (16-section technical dossier, the POST default) and `investigator` (four sections). The list calls the second `executive`. There is no third product |
| Contact | `possible_collision` is image overlap plus an abrupt box-speed drop. The rules do not emit `visually_supported_contact` |

## Unsupported

| Item | Why |
|---|---|
| Inventing a still when the frame row is missing | The storyboard omits it and lists `during` in `missing`. It does not decode a new JPEG |
| Using `incident_at` to pick before/during/after | That would invent a media time. The storyboard ignores the field even when it is set |
| Interleaving unsynchronized cameras into one film strip | Strips stay per evidence id, in that file's media order |
| Matching tracker ids across cameras | `propose_cross_camera_matches` returns an empty list |
| A probability on a hypothesis or an association | The fields are JSON null |
| Duplicate bytes as a second source or as corroboration | The upload returns the existing evidence id |
| Plates, make, model, legal fault, or a discovered camera | Not produced |
| Browser seeking and timeline-video sync | Frontend worker. The backend seek route is separate and was checked on the real clip at case time 0 and on synthetic fixtures |
| Live Featherless success | Not run. Failure behavior is what the tests lock |
| Firefox and Safari | Not installed and not run |

## Future work

Frontend pages for the storyboard, source fields, and case incident fields. A live Featherless check with a key that is not committed. The packaged reconstruction scenarios behind `scripts/build_scenarios.py`. Any second real camera, sensor log, or witness statement on the selected case. Those are not filled in by this audit.
