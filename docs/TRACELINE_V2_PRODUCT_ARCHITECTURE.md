# TraceLine V2 product architecture

Date: 2026-10-30. Branch `feat/traceline-investigation-flow-v2` at the merge of `cursor/real-video-pipeline-c915` (`3bbca88`) and `origin/claude/final-audit`. This is a classification of the code on that branch. It does not add behavior.

The full V2 master prompt, including the named list of 24 scenarios and 15 multi-camera scenarios, is not in this repository and was not in the agent store. Classifications below follow the phase summary that was given with this branch. A capability that is only named in a prompt that is not in the tree is marked **not implemented** here rather than described as if it had been built.

## How a row is classified

| Label | Meaning on this branch |
|---|---|
| Implemented and verified | The code path exists, and a recorded test or a recorded run on real footage already checked it. This document did not re-run those checks. |
| Implemented, not verified on real footage | The code path exists. Coverage is a fixture, a unit test, or a stand-in client. No real uploaded file exercised it in the recorded audits. |
| Partial | Some of the requested behavior exists. The rest is absent or only a display of another field. |
| Hardcoded | A fixed string, label, or rule phrase stands in for a measurement or a model answer. |
| Not implemented | No code path produces it. |

Backend files were not changed by the merge. On 2026-10-30, from `backend/`, `./.venv/bin/python -m pytest -q --tb=line` reported **194 passed, 17 skipped, 0 failed** (68.89s). The 17 skips are the 12 reconstruction tests and 4 report tests that need `scripts/build_scenarios.py` packages, plus the accident-cue validation image split. Frontend `npm test` on this merge: **55 passed, 0 failed**. Firefox and Safari were not installed and were not run. Chrome measurements in `docs/FINAL_FRONTEND_AUDIT.md` are earlier passes, not a re-check of this merge.

## Local database, not in git

Case `TL-C30DD7` / `case_d255f851d423` / evidence `ev_289b77d5484e` was rebuilt in the local development database after `3bbca88`. Source events for that evidence are the current generator output: **139** rows (91 `potential_interaction`, 11 `vehicle_enters_scene`, 9 `vehicle_slowing`, 6 `vehicle_leaves_scene`, 6 `possible_near_miss`, 5 `vehicle_stopped`, 4 `possible_collision`, 4 `vehicle_direction_change`, 3 `vehicle_maneuver_observed`). The new baseline scenario is `scn_e4f120bf44cc`. `GET /cases/case_d255f851d423/incident-events` returned `contact_status` `possible_collision`, 139 items, 0 unplaced. `GET /incident-narrative` returned the deterministic headline and `ai_narrative: null` with reason `policy_blocked` (`allow_external_inference` is false on that case; Featherless is also unconfigured). The two older scenarios still hold 1,093 canonical events each because events are append-only. They are not the baseline. No video, database, or code commit was made for that rebuild. `docs/REMAINING_ISSUES.md` still describes the pre-rebuild 1,093-row timeline.

## Phase 1 — this document

| Capability | Class |
|---|---|
| Written capability audit | Implemented. This file. Not a product feature. |

## Phase 2 — five-page shell

Routes today (`frontend/src/App.jsx`): `/` landing, `/dashboard`, `/new`, `/cases/:caseId` workspace, `/cases/:caseId/report`. The sidebar is Dashboard and New investigation.

| Capability | Class |
|---|---|
| Dashboard page reading API totals, cases, jobs, recent evidence | Implemented and verified by frontend unit tests and the earlier Chrome audit. Not re-shot after this merge. |
| Cases as its own page | Not implemented. Cases appear on the dashboard table and in the command palette. |
| Evidence as its own page | Not implemented. Evidence is a tab and a list inside the workspace. |
| Reconstruction as its own page | Not implemented. The workspace is the reconstruction view. |
| Reports as its own page | Partial. One report route per case. No reports index. |
| Shared case context across those five pages | Not implemented. Workspace and report share the case id in the URL. Dashboard is global. |
| Real backend values only on the screens that exist | Implemented and verified for the dashboard and workspace unit tests (mocked API). The live selected-case workspace was checked in Chrome before this merge, against the old timeline. |

## Phase 3 — guided flow

| Capability | Class |
|---|---|
| Landing | Implemented. Copy is product text, not case data. Not re-checked in a browser on this branch. |
| Create investigation | Implemented and verified by `NewCase` tests and `POST /cases`. |
| Upload | Implemented and verified. Same-bytes upload in one case returns the existing evidence (`duplicate: true`) because of `uq_evidence_case_sha`. |
| Synthetic file refused on a real case | Implemented and verified by `test_synthetic_separation.py`. The upload fails with 422 before staging. |
| Processing UI uses real job stages | Implemented. Stages the runner actually has: `validate`, `preprocess`, `extract_interval`, `detect`, `track`, `extract_claims`. Dashboard and New Case label those strings. Progress is the work-unit fraction from the job, capped at 0.99 until the stage finishes. Unit tests cover a failed `detect` stage and an in-progress job. A full guided click-through was not repeated on this merge. |
| Invented pipeline stages | Not implemented. The UI does not add a stage the API did not return. |

## Phase 4 — evidence and sensor ingestion

| Capability | Class |
|---|---|
| More than one video on a case | Implemented and verified. Two real files with no sync edge stay unplaced (`docs/FINAL_BACKEND_AUDIT.md`). |
| Source id | Implemented. `evidence_files.id` (`ev_…`). |
| Kind CCTV, dashcam, or other | Upload `kind` may be `cctv`, `dashcam`, or `other`. `other` is stored and validated and is not sent to detect or track. `camera_role` on the source annotation is editable and does not re-run tracking. The stored file kind stays immutable. |
| Original filename | Implemented. Display only. Immutable with the evidence row. |
| Original bytes preserved | Implemented and verified. `GET /evidence/{id}/original?verify=true` matched the selected file hash. Playback is a separate derived file. |
| Duration, fps, coded size, rotation, container PTS | Implemented and verified on the real clips (`video_metadata`). |
| Timezone on a source | Editable through `PATCH /evidence/{id}/source`. It is not inferred from the file. `creation_time_claimed` is still unverified container text. |
| Clock offset, editable later | `PATCH /evidence/{id}/source` stores `clock_offset_ms` with a reference evidence id. The next scenario build applies edge `ann:{evidence_id}`. `PUT /evidence/{id}/clock` is unchanged. The workspace editor is frontend work. |
| Location text for a camera | `source.location_text` on the source annotation. It is investigator text, not a looked-up camera. |
| Start and end as investigator-entered recording bounds | `source.recording_start` and `source.recording_end`. File duration is separate. A window is compared with a trusted wall clock only. |
| Display name separate from the filename | `source.display_name` is editable. `original_filename` stays the immutable upload name. |
| Witness statements and text spans | Implemented, not verified on real footage. Claims store `statement_id`, `char_start`, `char_end`, and `source_text`. A live Featherless call was not made. |
| Sensor CSV, column mapping, unit normalization, raw `t_raw` kept | Implemented, not verified on real footage. Fixture tests cover parsing. No sensor file was uploaded with the real clips. |
| GPS | Partial. Sensor analysis can compare haversine speed between lat/lon columns and a speed column (`gps_consistency`). There is no GPS track page and no real GPS file was ingested. |
| `docs/SENSOR_DATA_FORMAT.md` | Written for the current parser. `docs/SENSOR_PROCESSING_ARCHITECTURE.md` remains the older design note. |

## Phase 5 — per-source detection, tracking, events

| Capability | Class |
|---|---|
| Detections stored per evidence id | Implemented and verified on the real clips (YOLO26s, storage confidence 0.15, display default 0.25). |
| Tracker ids scoped to one video and one run | Implemented. `tracking.py` states they never claim identity across cameras. ByteTrack for `cctv`, BoT-SORT for `dashcam`. Continuations are candidates and are not merged. |
| Matching tracker ids across cameras | Refused. `propose_cross_camera_matches` returns an empty list. Equal integers are not a match. |
| Video events carry the evidence id | Implemented and verified. Types are the machine-detection set in `video_events.py` (`VIDEO_EVENTS_VERSION` 2). There is no event type `collision`. |
| Speeds | Hardcoded unit choice: box diagonals per second, not metres per second. The number is measured. The unit is not a world speed. |
| Accident cue | Implemented and verified as a separate model. It does not decide an event. |
| Contact | `possible_collision` requires image overlap and an abrupt box-speed drop. Overlap alone is `potential_interaction`. `visually_supported_contact` is a display class and is not emitted by the current rules. |

## Phase 6 — reconstruction

Clocks that exist:

| Clock | Class |
|---|---|
| Media-relative milliseconds (`time_ms`, player `currentTime`) | Implemented and verified. |
| Container PTS (`video_metadata.pts_start_ms`) | Implemented and verified. Frame times are relative to the first frame. PTS is kept beside that. |
| Case-relative time (`start_ms` / `start_case_ms`) | Implemented and verified. A lone source is its own reference at offset 0. Two sources with no edge stay unsynchronized and unplaced. |
| Estimated synchronized time | Implemented on timeline events as `clocks.synchronized_ms`. It equals case time only when the sync group has at least two members and is consistent. A lone source keeps `case_ms` and `synchronized_ms` null. |
| Wall clock of the recording | Implemented as `clocks.wall_clock` only from a trusted clock record (`declared_by_investigator` or `simulation_clock`) plus media time. Embedded `creation_time_claimed` is not used. |

| Capability | Class |
|---|---|
| Manual offsets | Partial. API `PUT /evidence/{id}/clock` and sync edges. No workspace control for typing an offset. |
| Overlap, gap, and clock-inconsistency records | Implemented. Gap types include `video_missing_interval`, `sensor_missing_interval`, `unsynchronized_source`, `clock_inconsistency`, `no_camera_calibration`, `unconfirmed_vehicle_identity`, `tracking_fragmentation`, `low_visual_quality`, `untestable_claim`, `no_visual_coverage_at_candidate_collision`. Real-clip runs produced missing-interval, brightness, calibration, and identity gaps. A clock-inconsistency gap was not produced by those files. |
| Cross-camera vehicle association as its own uncertain record | Implemented. A row is created from confirmed actor links that span two evidence ids, or by `POST /cases/{id}/associations`. Status is `uncertain`. Equal tracker ids do not create a row. |
| Duplicate upload counted as corroboration | Rejected. The same bytes return the existing evidence id (`duplicate: true`). Corroboration still requires two evidence ids. |
| Incomplete evidence | Implemented as `GET /cases/{id}/reconstruction/completeness` and `docs/INCOMPLETE_EVIDENCE_RECONSTRUCTION.md`. `defensible` requires a placed event with a complete trace and a placeable evidence class. |
| Competing hypotheses | Implemented on the timeline as `hypotheses` when an inference has a complete evidence trace and stored alternatives. `probability` is null. Incomplete premises are `unsupported_hypotheses`, not narrated. |
| Invented probabilities | Not implemented. |
| Contradiction versus missing evidence | Implemented as separate stores. Completeness lists gaps under `missing_evidence` and keeps `contradiction_count` apart. Synthetic fixtures cover a witness/camera conflict. The packaged reconstruction scenarios are still skipped. |
| `docs/RECONSTRUCTION_DATA_MODEL.md` | Written. It matches the additive fields in `docs/INTEGRATION_CONTRACT.md` §14. |
| Requested evidence-type names | Read-model `evidence_class`: `direct_observation`, `witness_reported`, `sensor_observed`, `derived_observation`, `system_inference`, `hypothesis`, `unknown`. Stored `category` is unchanged. |

## Phase 7 — Featherless

| Capability | Class |
|---|---|
| Witness claim extraction with statement id and text span | Implemented, not verified on a live model. The job calls Featherless or refuses. Span equality is enforced. Tests use a stand-in client. |
| Incident narrative from stored scenario records only | Implemented. `incident.narrate` runs once at scenario build. Playback reads the stored document and does not call the model. |
| Reject a sentence with no valid evidence id, banned wording, an unsupported contact claim, or a hypothesis citation whose evidence ids do not match | Implemented and verified by `test_incident_analysis.py` with a stand-in client. |
| Failure leaves the deterministic summary and `ai_narrative` null | Implemented and verified with stand-in `NotConfigured` and `PolicyBlocked` clients, and on the rebuilt case (`policy_blocked`). The user-facing line is "AI narrative is unavailable." `hypothesis_explanation.items` stays the stored list, which is empty when no complete inference exists. |
| Key only from the environment | Implemented. `FEATHERLESS_API_KEY` is read from settings. `allow_external_inference` is checked before the key. |
| Vision model on frames | Not implemented for the narrative. The configured vision model name is unused by that step. |
| `docs/FEATHERLESS_INTEGRATION.md` | Written from `backend/app/llm/featherless.py`, `backend/app/services/witness.py`, `backend/app/services/jobs.py`, and `backend/app/services/incident.py`. Live Featherless calls are not part of the test suite. |

## Phase 8 — investigator workspace

The merged workspace is one route. There is no second multi-angle page and no evidence-detail workflow page.

| Capability | Class |
|---|---|
| Video player and existing clock | Implemented. Short-viewport cap and non-square `maxWidth` are both in `Player.jsx`. Not re-measured in Chrome after this merge. |
| Incident summary from the narrative endpoint | Implemented and verified by the workspace unit test. |
| Vehicles as class plus track id, plate only from a confirmed actor attribute | Implemented. |
| Keyframe gallery from stored extracted frames | Implemented. Empty state has no placeholder image. The live gallery was captured before the rebuild and before this merge. |
| Chronological incident cards under the video that seek the player | Implemented and verified by the unit test (one `requestSeek`, clock 1.583 s). |
| Timeline | Implemented. Key events / all events, plus the short-viewport chip row. |
| Evidence correlation | Implemented. Lists stored corroborations and contradictions. |
| Sensor panel | Partial. Closed inside Technical detail. Renders only when a `sensor_csv` evidence row exists. |
| Camera filter | Partial. The nav rail can set the primary video. It is not a reconstruction filter that drops other sources' events. |
| Trajectories off the default view | Implemented. Closed `<details>` labeled Technical detail. Unit test checks it is closed and that no `aria-label="Trajectories"` panel is on the page. |
| Before / during / after | Backend read `GET /cases/{id}/storyboard` cites stored frames around each video event. It does not generate an image. The page that shows those stills is frontend work. |
| Storyboard | Same read. One strip per camera, in that file's media order. Cameras are not interleaved. |
| Reconstruction scenario switcher | Partial. A scenario `<select>` appears only when the case has more than one scenario. |
| Technical inspector | Implemented from the merged audit UI (overview, findings, evidence, technical). Findings text is built from stored records in `overview.js`. |

## Phase 9 — reports

| Capability | Class |
|---|---|
| Full 16-section dossier | Implemented and verified. Default `POST /cases/{id}/reports` with `format` omitted or `full`. PDF and markdown were generated for the selected case before the event rebuild (`docs/REPORT_FORMAT.md`). |
| Investigator report, including an executive-summary section | Implemented and verified by `test_investigator_report.py` and a size measurement on the old 1,093-event scenario. The workspace Generate button requests this format. Full export requests `full`. |
| Separate executive and technical report products beyond those two formats | Not implemented. |
| Report list and markdown preview | Implemented. `GET /cases/{id}/reports` and `GET /reports/{id}/markdown`. The report page was exercised in the earlier Chrome audit, not after this merge. |
| PDF | Implemented and verified for the full dossier on the selected case. `GET /reports/{id}/pdf`. |
| Embedding an unvalidated model narrative | Not implemented. The report validator rejects banned wording. A failed narrative is not stored as model text. |

## Phase 10 — verification

| Capability | Class |
|---|---|
| Backend pytest suite | Re-run from `backend/` after the case-field follow-up: 251 passed, 19 skipped, 0 failed. Skips are browser seeking, timeline-video sync, the scenario packages, and the accident-cue image split. `test_selected_accident_video_is_detected_tracked_and_reviewed` ran; the selected file was present. Synthetic scenario passes are not that result. |
| Frontend vitest, 55 tests | Implemented and verified on this merge before the merge commit. |
| The 24 V2 scenarios and 15 multi-camera scenarios | Backend fixtures are in `backend/tests/test_v2_scenarios.py`. They are synthetic. Real footage is only `test_real_video_pipeline.py`. Browser seeking and timeline-video sync are skipped for the frontend worker. |
| Screenshots at 1366×768, 1440×900, and 1920×1080 for five pages, the guided flow, and complete versus incomplete cases | Not implemented for V2. Older Chrome shots exist: pipeline timeline shots described in `docs/FINAL_FRONTEND_AUDIT.md` Record A, and `docs/frontend/screenshots/` from `claude/final-audit` (Record B). Neither set is a V2 five-page pass. |
| Safari and Firefox | Not run. |

## What later phases still have to build

The frontend shell and browser scenario checks are still open. The storyboard read returns stored frame references; the page that displays them is frontend work. Backend source metadata, clocks, uncertain associations, evidence-class names, Featherless citation checks, and the backend docs named above are in this branch. Named backend scenarios are synthetic fixtures in `backend/tests/test_v2_scenarios.py`. Unsupported items stay written here. They are not filled with placeholder findings, cameras, times, plates, or make and model.
