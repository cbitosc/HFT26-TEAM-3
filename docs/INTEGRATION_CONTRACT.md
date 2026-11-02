# INTEGRATION CONTRACT (frontend ↔ backend)

Status: **documents the API as it exists at commit 76cec77** (inspected from the code and from live responses of the seeded demo case). It is the baseline both agents work against.
Owners: backend shapes belong to Cursor, the frontend consumer belongs to Claude. **Nothing here changes a field.** A breaking change (rename, type change, removal, changed unit or time basis) must be proposed under "Change log" below and agreed by both before code is written.
Base path `/api/v1`. All bodies are JSON unless stated. Identifier fields are opaque strings with a prefix (`case_`, `ev_`, `scn_`, `evt_`, `act_`, `trk_`, `run_`, `fnd_`, `trj_`). Request header `X-Actor` (optional) names the person acting; there are no accounts.

## 0. Conventions

### 0.1 Timestamp bases (never interchangeable)
| Name | Meaning | Fields that use it |
|---|---|---|
| **media_ms** | Milliseconds of media time from the first frame of one video (container PTS minus `pts_start_ms`). The browser's `video.currentTime * 1000` equals it for the `/stream` playback copy. | `time_ms` in frames, detections, overlays, track `points[]`, `first_ms`/`last_ms`, image-trajectory `source_ms`, `source_time_ms` inside event `observations` |
| **container_pts_ms** | The container's own start offset. Kept only as metadata. | `video.pts_start_ms` |
| **sensor_ms** | Milliseconds from a sensor file's first valid sample. | `/sensor-records` `time_ms`; sensor event `source_time_ms` |
| **case_ms** | Milliseconds on the case clock of one reconstruction scenario: reference source time 0 = 0 ms. Exists only for sources joined by a recorded clock relation. `null` otherwise. | `start_ms`/`end_ms` in events, `case_ms` in trajectory points, `span_ms`, `/seek` input, gap `scope.case_from_ms/case_to_ms` |
| **wall_clock** | Real recording time (UTC). **Never inferred.** Only from an investigator-declared clock record. Not currently returned by any read endpoint except `video.creation_time_claimed` (unverified claim from file metadata) and `created_at`/`uploaded_at` (system times). | `*_at` fields, `creation_time_claimed` |

Conversion: `case_ms = source_ms + offset_to_reference`. `GET /cases/{id}/seek?case_ms=T` returns, per synchronized source, `media_ms = T − offset` (for a video this is media_ms; for a sensor, sensor_ms). The frontend derives a per-source **shift** from `seek?case_ms=0` (`media = case + shift`). Sources absent from `targets` are listed in `unsynchronized` and must not be slaved to the case clock.

### 0.2 Provenance legend (the "Basis" column)
**observed** = measured by a machine from the evidence (detections, tracks, sensor readings, frame times) · **reported** = said by a person (witness claims, investigator-entered values) · **inferred** = derived by a rule or the engine from other records (events from rules, contradictions, gaps, summaries, trajectories' ground positions) · **system** = bookkeeping (ids, timestamps of records, counts).

### 0.3 Error response (all endpoints)
```json
{"error": {"code": "CASE_NOT_FOUND", "message": "No case with id nope", "details": {}}}
```
| Field | Type | Null | Notes |
|---|---|---|---|
| error.code | string | no | stable upper-snake code; the frontend may branch on it |
| error.message | string | no | human-readable, safe to display |
| error.details | object | no | may be `{}`; may carry hints such as `{"build": "<url>"}` |
HTTP statuses used: 400, 403, 404, 409, 422, 500, 503. Codes the frontend relies on: `CASE_NOT_FOUND`, `NO_RECONSTRUCTION` (409; details.build), `DETECTIONS_NOT_READY` (409), `TRACKS_NOT_READY` (409), `NOT_PREPROCESSED` (409), `EVIDENCE_NOT_FOUND`, `EVENT_NOT_FOUND`, `SUMMARY_NOT_FOUND`, `REPORT_NOT_VALID`. Pydantic validation errors also use this envelope with code from the handler.

## 1. Case — `GET /cases`, `GET /cases/{id}`, `POST /cases`
`GET /cases` → `{"items": [Case]}`.
| Field | Type | Null | Unit / convention | Basis |
|---|---|---|---|---|
| id | string | no | | system |
| code | string | no | short human code | system |
| title | string | no | | reported |
| description | string | **yes** | | reported |
| status | string | no | `open`\|`processing`\|`review`\|`closed` | system |
| designation | string | no | `real`\|`staged`\|`synthetic`\|`mixed`. Real and synthetic cases are separate cases. | reported |
| allow_external_inference | bool | no | if false no content leaves the machine | reported |
| incident_at | string | **yes** | ISO-8601 with a timezone offset. Investigator-stated instant. Not read from a file and not used to choose frames. A value without an offset is 422 `INCIDENT_TIMEZONE_REQUIRED` | reported |
| incident_at_note | string | no | Fixed sentence: a timezone offset is required on write. The server does not assume one | system |
| location_text | string | **yes** | Investigator place text, at most 500 characters. Not a geocode and not a discovered camera | reported |
| created_at, updated_at | string | no | ISO-8601 UTC, system time (wall_clock of the *record*) | system |
| counts.evidence_total/valid/invalid/pending | int | no | files | system |
| counts.jobs_active, jobs_failed | int | no | | system |
| counts.findings_unreviewed | int | no | | system |
`POST /cases` body: `{title, designation, description?, allow_external_inference?, code?, incident_at?, location_text?}`. `PATCH /cases/{id}` accepts those two fields as well as the existing title, description, status, and allow_external_inference. An omitted field is left as stored. `null` clears `incident_at` or `location_text`. Existing cases read back with both values null until set. → 201 Case on create.

## 2. Evidence — `GET /cases/{id}/evidence` → `{"items":[Evidence]}`; `POST /cases/{id}/evidence` (multipart: `file`, `kind`, `synthetic` required) → 201 `{evidence, duplicate, ...}`
| Field | Type | Null | Notes | Basis |
|---|---|---|---|---|
| id, case_id | string | no | | system |
| kind | string | no | `dashcam`\|`cctv`\|`sensor_csv`\|`witness_text`\|`witness_pdf`\|… (see backend `filetypes`) | reported |
| original_filename | string | no | display only | reported |
| mime_type | string | yes | sniffed | observed |
| size_bytes | int | no | bytes | observed |
| sha256 | string | no | hex of the stored original | observed |
| uploaded_at | string | no | ISO UTC (system time) | system |
| synthetic | bool | no | **mandatory declaration**; the UI must show it | reported |
| provenance, licence | any/string | yes | free text/object | reported |
| status | string | no | `uploaded`\|`valid`\|`invalid` | observed |
| validation | object | yes | `{ok, checks{...}, errors[], warnings[], metadata{...}, validator_version}`; `metadata` mirrors Video metadata | observed |
| links.original | string | no | URL, Range-capable | system |
| links.stream, links.frames | string | yes | present only when a browser playback copy exists | system |
| video | object | **absent for non-video** | see §3 | observed |

## 3. Video metadata — `Evidence.video`
| Field | Type | Null | Unit / convention | Basis |
|---|---|---|---|---|
| duration_ms | int | yes | media_ms | observed |
| fps_nominal, fps_measured | float | yes | frames/s; measured from PTS | observed |
| width, height | int | yes | pixels of the container stream as ffprobe reports them. `rotation` is separate and is not applied to these numbers or to detection boxes | observed |
| codec | string | yes | | observed |
| rotation | int | yes | degrees (null = none) | observed |
| frame_count | int | yes | | observed |
| pts_start_ms | float | yes | **container_pts_ms** of the first frame; not wall-clock | observed |
| playback_ready | bool | no | `/stream` usable | system |
| creation_time_claimed | string | yes | **unverified** claim from file metadata; never used for synchronization | reported (by the file) |
| note | string | yes | | system |
Frames: `GET /evidence/{id}/frames?from_ms&to_ms&sampled=true&limit` → `{evidence_id, pts_start_ms, items:[{id, frame_no, time_ms(media_ms), sampled, blur, brightness, thumbnail_url, full_url}], time_basis}`. blur/brightness are observed, unitless image statistics.

## 4. Processing job — `GET /cases/{id}/jobs?status=` → `{"items":[Job]}`, `GET /jobs/{id}`, `POST /jobs/{id}/retry`, `POST /cases/{id}/process`
| Field | Type | Null | Notes | Basis |
|---|---|---|---|---|
| id, case_id | string | no | | system |
| evidence_id | string | yes | null for case-level jobs | system |
| stage | string | no | `validate`\|`preprocess`\|`extract_interval`\|`detect`\|`track`\|`extract_claims` | system |
| status | string | no | **exactly** `pending`\|`validating`\|`processing`\|`completed`\|`failed`\|`partially_completed`. Active = pending, validating, processing. | system |
| progress | float | no | 0..1 **within this stage**, from work already finished. See the paragraph under this table. The UI must not invent a timer. | system |
| attempts | int | no | | system |
| error | string | yes | set when failed | system |
| params, result | object | yes | stage-specific; `result.warnings[]` for partial results | system |
| created_at, started_at, finished_at | string | yes (started/finished) | ISO UTC | system |
`progress` is the fraction of that stage's planned work that has already finished. It is not elapsed time. While the stage is `validating` or `processing`, the stored value is capped at 0.99. The runner writes 1.0 only when `status` becomes `completed` or `partially_completed`. A `failed` job keeps the last published fraction, or 0 if the stage had not reported any unit yet.

| Stage | Unit |
|---|---|
| validate, extract_claims | no intermediate units; stays 0 until the runner writes 1.0 |
| preprocess | container frames grabbed / (container frame count + 1). The last unit is the playback copy |
| extract_interval | frames decoded in the requested interval / frames indexed in that interval |
| detect | `(pass_index + frames_inferred / frames_in_pass) / pass_count`. A pass whose result is reused counts as finished. A missing accident-weight file is not counted as a pass that ran |
| track | sampled frames handed to the tracker / sampled frames |

Pipeline: upload → validate → preprocess → detect → track run automatically (chained). `POST /cases/{id}/process` body `{stages:[preprocess|detect|track], sample_fps?, max_frames?, chain_detect?}` → 202 `{jobs:[Job], skipped_note}`.

## 5. Detection — `GET /evidence/{id}/detections?from_ms&to_ms&classes&min_conf&model_run_id&include_accident_cue&include_empty`
```
{evidence_id, frame_size{width,height}, min_confidence, frames_considered,
 model_runs:[ModelRun], items:[{frame_id, frame_no, time_ms, detections:[Detection]}], note}
```
| Field | Type | Null | Unit / convention | Basis |
|---|---|---|---|---|
| items[].time_ms | int | no | **media_ms** of a *sampled* frame (default 5 fps) | observed |
| detections[].id | int | no | | system |
| .class | string | no | `car`\|`truck`\|`bus`\|`motorcycle`\|`bicycle`\|`pedestrian`\|`traffic_light`\|`accident_cue` | observed |
| .confidence | float | no | 0..1, **not** a calibrated probability | observed |
| .bbox | [x1,y1,x2,y2] float | no | pixels of the upright decoded frame (`frame_size`), the same grid as `/stream`. A display rotation of 90° or 270° is applied once, so `frame_size` is swapped relative to coded `video.width` / `video.height`. 180° does not swap. The playback file is not scaled and does not keep a second display matrix | observed |
| .model_run_id | string | no | links to `model_runs` | system |
| .category | string | no | always `machine_detection` | observed |
| .is_accident_cue | bool | no | weak single-class model; never establishes a collision | observed |
ModelRun: `{id, stage, model_id, model_version, params, device, status, started_at, finished_at, metrics}`. `model_id` prefixed `oracle:` or `external:` = **imported boxes, not a detector** (synthetic scenarios); the UI must label them. `GET /evidence/{id}/model-runs` lists runs.
Detections only exist for sampled frames; between samples nothing was observed.

## 6. Tracking
`GET /evidence/{id}/tracks?class&min_observations` → `{evidence_id, model_run{id,model_id,params,metrics}, items:[TrackSummary], note}`; `GET /tracks/{track_pk}`; overlays `GET /evidence/{id}/overlays?from_ms&to_ms(≤60 s window)&min_conf` → `{evidence_id, from_ms, to_ms, tracking_run, items:[{frame_no, time_ms, boxes:[{detection_id, track_id(null if untracked), class, confidence, bbox, backfilled, is_accident_cue}]}], note}`.
| Field | Type | Null | Unit / convention | Basis |
|---|---|---|---|---|
| id | string | no | track primary key (`trk_…`), used in identity links | system |
| track_id | int | no | **unique per video and per run only**; never across cameras | observed |
| class | string | no | majority class | observed |
| first_frame, last_frame | int | no | frame numbers | observed |
| first_ms, last_ms, duration_ms | int | no | **media_ms** | observed |
| observations | int | no | sampled frames with a box | observed |
| mean_confidence | float | no | | observed |
| reliability | string | no | `stable`\|`short`\|`fragmented`\|`id_switch_suspected`… | inferred |
| gaps | int | no | count; gaps are never filled | observed |
| flags | string[] | no | | inferred |
| ends_at_frame_border | bool | no | | observed |
| continuation_candidates | object[] | no | possible same-object continuations; **never merged automatically** | inferred |
| model_run_id | string | no | | system |
Detail adds `evidence_id`, `continuity{…}`, `coordinate_frame` (`image pixels of this camera; not metres`), and `points:[{frame_no, time_ms(media_ms), bbox[4], anchor[2] (bottom-centre pixel), confidence, detection_id, backfilled}]`. `backfilled=true` marks a first observation restored after the tracker withheld it (drawn dashed).

## 7. Timeline — `GET /cases/{id}/timeline?scenario_id&category&event_type&actor_id`
```
{scenario: Scenario, time_unit, span_ms:[lo,hi]|[null,null], lanes:{cctv|dashcam|sensor|witness|inference:[Event]},
 unplaced:[Event], marks:{event_id:{contradicted_by:[id], corroborated_by:[id]}}, unplaced_note, note}
```
Reconstruction must exist (else 409 `NO_RECONSTRUCTION`). `scenario_id` omitted = latest baseline. Scenario: `{id, case_id, name, is_baseline, created_by, created_at, assumptions{edge_offsets, exclude_edges, reference, unconfirm_links}, build{events, contradictions, corroborations, gaps, trajectories, findings, inferences, open_questions, sync_groups, sync_inconsistencies, unsynchronized_sources[]}, unsynchronized_sources}`; created by `POST /cases/{id}/reconstruction/scenarios` (body `{name, edge_offsets?, exclude_edges?, reference?, unconfirm_links?, baseline?}`), listed by `GET …/scenarios`, compared by `GET …/reconstruction/diff?a&b`.
| Field | Type | Null | Unit / convention |
|---|---|---|---|
| span_ms | int[2] | elements null if no placed events | **case_ms** |
| lanes | object | no | keys present only if non-empty; events here have non-null `start_ms` |
| unplaced | Event[] | no | **no usable time**; never ordered against placed events |
A lone video or sensor is its own reference clock: offset 0, one sync group, `unsynchronized_sources` empty, and its events are placed with `start_ms` equal to that file's own time. Two or more sources with no recorded edge stay in `unsynchronized` and their events stay in `unplaced`. That rule is in `sync.solve`. It is not a measured alignment between cameras.

Related: `GET /cases/{id}/seek?case_ms&scenario_id` → `{case_ms, targets:[{evidence_id, media_ms, bound_ms, group}], unsynchronized:[evidence_id]}`; `GET /cases/{id}/sync` (groups, offsets, edges); `GET /cases/{id}/playback-map?evidence_id&video_time_ms`. `links.stream` is a playback copy that starts at media time 0 (`setpts=PTS-STARTPTS` when the original is transcoded; a remux only when the file is already H.264 yuv420p MP4, upright, and already starts at 0). Height is not capped. A 90/180/270 display matrix is baked into that file once. Any other angle is rejected at validation (`Display rotation N° cannot be applied`).

## 7a. Incident analysis — added reads; existing timeline and event fields are unchanged

`GET /cases/{id}/incident-events?scenario_id` returns 409 `NO_RECONSTRUCTION` when no scenario exists. Body: `{scenario_id, contact_status, provenance, items[], unplaced[]}`. `contact_status` is `possible_collision`, `visually_supported_contact`, or `insufficient_evidence`. An empty candidate list is `insufficient_evidence`. `none` is not returned for that list. `display` on an item is `amber` only for `possible_collision`, `critical` only for `visually_supported_contact`, otherwise `neutral`. Current video rules do not emit `visually_supported_contact`. `merged_from` lists the source-event ids that were folded into the row. The payload has no plate, make, or model keys. `track_classes` are detector classes. Overlap without a speed drop stays `potential_interaction` with `display: neutral`.

`GET /cases/{id}/incident-narrative?scenario_id` is read-only. The document is written when the scenario is built and is not requested from the player. `{scenario_id, contact_status, deterministic{headline, sentences[{text, classification, event_ids, evidence_ids}]}, hypothesis_explanation, ai_narrative_status, ai_narrative_reason, ai_narrative}`. `deterministic` is always present. `hypothesis_explanation` is `{items, note}`. `items` are stored inference alternatives that already have a complete evidence trace (`id`, `evidence_class` `hypothesis`, `statement`, `alternatives`, `premises`, `evidence_ids`, `probability`). `probability` is always null. The note is fixed text, not model output. `ai_narrative` is null unless `ai_narrative_status` is `ready`, in which case it is `{model, model_run_id, sentences[]}`. A model sentence may cite a hypothesis id only when `evidence_ids` equal the evidence ids of every cited row. A sentence with no ids, an unknown id, or a different id set is rejected and the model text is not stored. Reason codes when unavailable: `not_configured`, `policy_blocked`, `request_failed`, `validation_failed`. A failed model call does not replace the deterministic headline and does not store model sentences. `hypothesis_explanation` is still returned; it is built from stored events. Details are in `docs/FEATHERLESS_INTEGRATION.md`.

`GET /cases/{id}/incident-frames?scenario_id&event_id` returns `{event_id, items:[{evidence_id, frame_id, frame_no, time_ms, thumbnail_url, full_url}]}`. Items are extracted frames whose `frame_no` is an endpoint on the event. A missing index row is omitted. The route does not create a JPEG.

## 8. Event — items of `lanes`/`unplaced`; `GET /events/{id}` adds `nearby[]` and `note`; `GET /events/{id}/summary`
| Field | Type | Null | Unit / convention | Basis |
|---|---|---|---|---|
| id | string | no | per scenario; the same source fact has a different id in another scenario | system |
| category | string | no | `direct_observation`\|`machine_detection`\|`witness_claim`\|`inference` | by category |
| event_type | string | no | **documented vocabulary below** | see below |
| title | string | no | template text, safe to display | inferred |
| actor_id | string | yes | only a **confirmed** identity; candidates in `actor_candidates` | reported (investigator) |
| actor_candidates | string[] | yes | unconfirmed; do not present as identity | inferred |
| start_ms, end_ms | int | yes | **case_ms**; null ⇔ `synchronized=false`. `end_ms` null for instants (it may equal start) | inferred from source time + offset |
| uncertainty_ms | int | no | ± on both ends: clock bound + sampling (or witness-phrase width) | inferred |
| uncertainty_basis | string | no | `clock_bound+sampling`\|`witness_phrase`\|`unsynchronized`\|`derived_from_premises` | system |
| synchronized | bool | no | false ⇒ place under "unplaced" | system |
| source_type | string | no | `video_cctv`\|`video_dashcam`\|`sensor`\|`witness`\|`engine` | system |
| source_id | string | yes | evidence id; null for `engine` | system |
| observations | object | yes | type-specific; always includes `source_time_ms:[start,end]` in the **source's own** basis for video/sensor events; `coordinate_frame:"image_pixels"` for video | observed / reported |
| inference | object | yes | non-null ⇔ category `inference`: `{premises[], alternatives[], rule_id, statement}`; alternatives are never empty | inferred |
| confidence | object | no | **separate dimensions, no overall score** (e.g. `source_quality`, `timestamp`, `certainty`, `extraction`) | mixed |
| provenance | object | no | `{rule_id, engine_version, rules_version, scenario_id, source_event_id, model_run_id, sync_group, built_by}` | system |
| synthetic | bool | no | | system |
| review_status | string | no | `unreviewed`\|`reviewed`\|`disputed` | reported |
### Event type vocabulary (frozen unless changed here)
- machine_detection / video (observations in image pixels): `vehicle_enters_scene`, `vehicle_leaves_scene`, `vehicle_slowing`, `vehicle_stopped`, `vehicle_direction_change`, `vehicle_maneuver_observed` (fixed camera only; `maneuver` = left|right|straight), `potential_interaction`, `possible_collision`, `possible_near_miss`.
- sensor (observed readings): `hard_braking`, `acceleration_spike`, `collision_flag`, `stop`, `heading_change`, `sensor_gap`.
- witness_claim (reported): `vehicle_turned`, `vehicle_went_straight`, `vehicle_braked`, `vehicle_stopped_claim`, `vehicle_speed_claim`, `collision_claim`, `signal_state_claim`, `pedestrian_claim`, `witness_statement`.
- inference (engine): `possible_braking_before_impact`.
The frontend must treat an unknown `event_type` as displayable via `title`, not crash.
### Summary — `GET /events/{id}/summary`
`{event_id, title, category, time{case_ms, end_ms, uncertainty_ms, sync_group}, involved_actors[], observations[], detections[], witness_claims[], sensor_observations[], inferences[], contradictions[], corroborations[], status[], uncertainty[], open_questions[], synthetic, generated_by, note}`. List items carry `{event_id, text, time_ms(case_ms), source, refs[]}` plus type-specific extras. `status[]` ∈ `requires_review`, `potential_contradiction`, `conflicting_accounts`, `independently_supported`, `insufficient_evidence_for_some_comparisons`. Text is template-generated from stored records; no model-written text.

## 9. Trajectory — `GET /cases/{id}/trajectories?scenario_id&frame=image|ground_plane&actor_id`
`{scenario_id, items:[Trajectory], note}`.
| Field | Type | Null | Unit / convention | Basis |
|---|---|---|---|---|
| id | string | no | | system |
| actor_id | string | yes | confirmed identity only | reported |
| frame | string | no | `image` = pixels of that camera (not to scale); `ground_plane` = calibrated plane in the units stated in `calibration_note` | – |
| camera_id | string | yes | | system |
| track_ref | object | no | `{evidence_id, track_pk, track_id, class, reliability, moving_camera, missing_segments[]}`; `moving_camera=true` ⇒ image motion includes the camera's own motion; not comparable | observed |
| points[] (image) | object | no | `{frame_no, source_ms (media_ms), case_ms (null if unsynchronized), x, y (px, bottom-centre anchor), backfilled}` | observed |
| points[] (ground_plane) | object | no | `{frame_no, case_ms, x, y (plane units), uncertainty (same units, 1σ-style radius), inside_calibrated_region}` | **inferred** (homography) |
| calibration_note | string | yes | assumptions and limits | system |
Gaps between samples are **not** interpolated by the backend.

## 10. Finding — `GET /cases/{id}/findings?scenario_id&kind`, `PATCH /findings/{id}` body `{review_status}`
| Field | Type | Null | Notes | Basis |
|---|---|---|---|---|
| id, scenario_id | string | no | | system |
| kind | string | no | `contradiction`\|`corroboration`\|`gap`\|`observation`\|`inference`\|`open_question`\|`timeline` | inferred |
| ref_ids | string[] | no | ≥1; ids of a contradiction/corroboration/gap/event | system |
| text | string | yes | template text | inferred |
| review_status | string | no | `unreviewed`\|`reviewed`\|`disputed` | reported |
| reviewer | string | yes | actor name | reported |
| reviewed_at | string | yes | ISO UTC | system |
Details by `ref_ids[0]`: `GET /cases/{id}/contradictions` → `{items:[{id, rule_id, event_a, event_b, strength(clear|marginal), basis{…, benign_explanations[]}, explanation, unresolved_questions[], review_status}]}`; `/corroborations` → `{items:[{id, rule_id, events[], independent, independence_reason, temporal_relation, explanation, review_status}]}`; `/gaps` → `{items:[{id, gap_type, scope{evidence_id?, case_from_ms?, case_to_ms?, …}, details, recommendation, refs[]}]}` (`scope.case_*_ms` are **case_ms**).

## 11. Other endpoints the frontend uses (shapes unchanged)
Actors `GET /cases/{id}/actors` → `{items:[{id, case_id, label, kind, attributes, links:[{id, ref_type(track|sensor_source|claim), ref_id, status(candidate|confirmed|rejected), basis, decided_by, decided_at}]}]}` · Sensor `GET /evidence/{id}/sensor-records` → `{items:[{row_no, time_ms(sensor_ms), si{speed(m/s), accel_long(m/s²), …}, valid, issues}], units_si, time_basis}` · Witnesses `GET /cases/{id}/witnesses`, `GET /witnesses/{id}/statements`, `GET /statements/{id}/claims` · Reports `POST /cases/{id}/reports` body `{scenario_id?, format?}`. Request `format` is `full` (default, 16-section technical dossier, unchanged) or `investigator` (four sections, the executive report; see `docs/REPORT_FORMAT.md`). Create and detail responses are unchanged. `GET /cases/{id}/reports` items add `format`: `executive` when the stored document says `investigator`, otherwise `full` (including documents written before a format key existed). The list does not include `content`. `GET /reports/{id}/markdown|pdf` · Dashboard `GET /dashboard`.

## 12. Frontend consumption (Claude) — what is wired and what is not
Wired to real endpoints: dashboard, case list, workspace (evidence, actors, scenarios, timeline, contradictions, corroborations, gaps, findings, trajectories, seek, overlays, sensor-records, summaries, witnesses/claims), report generate/view, upload + job polling + scenario build.
Frontend rules that follow from this contract: it displays `synthetic`, `oracle:`/`external:` model ids, `unplaced` events, `backfilled`, `moving_camera` and gap bands as the backend reports them; it never computes confidence, never fills gaps and never invents progress (progress comes only from `job.status`/`job.progress`).
**Known frontend defects against this contract:** none open. (Fixed: upload polling used non-existent job statuses.) Frontend usage notes are in `docs/frontend/FRONTEND_INTEGRATION_HANDOFF.md`.

## 13. Requests from frontend to backend (not changes; need agreement before implementation)
1. **Job progress detail:** answered in §4. `progress` is 0..1 within the current stage, from frames actually handled. No new field. There is no `stage_label`.
2. **Accident-moment events for real video:** source events come from `video_events.py` on the tracking run. `possible_collision` requires image-space proximity and an abrupt speed drop; the stored note says that overlap is not physical contact. Thresholds were not lowered for the real clip (storage confidence 0.15, display default 0.25). A single uploaded video is its own reference clock, so those events are placed with `start_ms` equal to media time.
3. **Uploaded-video metadata:** confirmed in §7. `links.stream` starts at media time 0. `video.pts_start_ms` remains the container PTS of the original's first frame.
4. **Activity/audit feed, cross-case jobs and findings lists** for the dashboard (`GET /activity`, `GET /jobs?status=`, `GET /findings?review_status=`): today the UI fans out per case.
5. **A job/stage list per evidence** (`GET /evidence/{id}/jobs`) would remove client-side filtering; optional.

## 14. V2 reconstruction reads and source metadata (additive)

The field lists are in `docs/RECONSTRUCTION_DATA_MODEL.md`. This section names the routes. No existing key is renamed, removed, or given a new unit. Clients that ignore unknown keys keep working.

| Route | Change |
|---|---|
| `GET /cases/{id}/evidence`, `GET /evidence/{id}`, upload response `evidence` | Adds `source`. `video` is unchanged |
| `PATCH /evidence/{id}/source` | New. Body is a subset of the editable source fields. Returns the evidence object, including `source` |
| `POST /cases/{id}/evidence` | `kind` may be `other` (video bytes, not sent to detect/track). Same-bytes duplicate response is unchanged (`200`, `duplicate: true`) |
| `GET /cases/{id}/timeline` | Each event gains `evidence_class`, `clocks`, `trace`. The payload gains `overlaps` and `hypotheses`. `lanes`, `unplaced`, `start_ms`, `end_ms`, `marks` are unchanged |
| `GET /events/{id}` | Same three event fields. `nearby` is unchanged |
| `GET /cases/{id}/associations?scenario_id` | New. `{scenario_id, items}` |
| `POST /cases/{id}/associations` | New. `201` `{item}`. Status is always `uncertain`. Does not create a corroboration |
| `GET /cases/{id}/reconstruction/completeness?scenario_id` | New. See the data-model doc |
| Incident routes in §7a | `incident-narrative` adds `hypothesis_explanation`. Clocks are on the timeline event, not copied onto incident cards |
| Report `POST` | Unchanged. Default request format remains `full` |
| `GET /cases/{id}/reports` | Each item adds `format`: `executive` or `full`. `content` stays off the list |
| `GET /cases/{id}/storyboard?scenario_id` | New. Stored frame references around each video event. See the data-model doc |
| Case create, read, and `PATCH` | Add nullable `incident_at`, `incident_at_note`, and `location_text` |

`PATCH` error codes: `RECORDING_WINDOW` (422), `OFFSET_REFERENCE_REQUIRED` (422), `EVIDENCE_NOT_FOUND` (404), `CAMERA_ROLE_INVALID` (422). Association `POST` uses `TRACK_NOT_FOUND` (404) and `ASSOCIATION_NEEDS_TWO_SOURCES` (422).

A source annotation offset is applied only when a scenario is built after the patch, as edge id `ann:{evidence_id}`. `PUT /evidence/{id}/clock` and `POST /cases/{id}/sync-edges` are unchanged.

There is no breaking change in this section.

## Change log
| Date | Change | Proposed by | Agreed by |
|---|---|---|---|
| (initial) | Baseline documented from commit 76cec77 | Claude | Cursor, with the corrections in the next row |
| 2026-10-30 | `progress` defined per stage. `width`/`height` and `bbox` are unrotated container/decoded pixels. Lone source is its own reference clock. Playback copy starts at media 0. No response field added or renamed. | Cursor | |
| 2026-10-30 | Playback is no longer scaled to 1080. `bbox` / `frame_size` are the upright frame, matching `/stream`. `video.width` / `video.height` stay the coded size. Optional report `format` defaults to `full`. No response field renamed. | Cursor | |
| 2026-10-30 | Added `GET /cases/{id}/incident-events`, `/incident-narrative`, and `/incident-frames`. No field on timeline, event, or event summary was renamed. Report `format` still defaults to `full`. | Cursor | |
| 2026-10-30 | §14 and `docs/RECONSTRUCTION_DATA_MODEL.md`. Additive `source`, `clocks`, `evidence_class`, `trace`, `overlaps`, `hypotheses`, associations, and completeness. No existing field renamed. | Cursor | |
| 2026-10-30 | `incident-narrative` adds `hypothesis_explanation`. Existing narrative keys are unchanged. A rejected model sentence is not stored. | Cursor | |
| 2026-10-30 | Cases gain nullable `incident_at` (offset required) and `location_text`. Report lists add `format` `executive` or `full`. `GET /cases/{id}/storyboard` cites stored frames. No existing key renamed. | Cursor | |
