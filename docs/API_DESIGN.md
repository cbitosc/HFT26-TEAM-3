# API_DESIGN

Version 3 (replaces `archive/API_SPECIFICATION.md`). FastAPI under `/api/v1`, Pydantic request and response models, JSON except for file transfer. The browser never talks to Featherless.

## 1. Conventions
- Errors: `{"error": {"code": "VIDEO_UNDECODABLE", "message": "...", "details": {...}}}` with 400/404/409/413/415/422/429/500/503.
- Jobs: `202 Accepted` + `{job_id}`; status values `pending | validating | processing | completed | failed | partially_completed`.
- Every finding includes `refs` that resolve to evidence (frames, rows, spans).
- Lists paginate with `limit` and `cursor`.
- `synthetic: true` is present on all records derived from synthetic or staged evidence.
- Time fields are `*_ms` on the case timeline, plus source time where relevant.

## 2. Endpoints

### Cases
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/cases` | `{title, description?, designation, allow_external_inference}` | Case |
| GET | `/cases` | `status?` | Cases with evidence counts, job status, open findings |
| GET | `/cases/{case_id}` | | Case + summary counts |
| PATCH | `/cases/{case_id}` | title, description, status, policy | Case (audited) |
| GET | `/dashboard` | | Real counts: cases by status, recent evidence, jobs in progress, findings needing review |

### Evidence
| Method | Path | Notes |
|---|---|---|
| POST | `/cases/{id}/evidence` | multipart: `file`, `kind`, `camera_id?`, `witness_id?`, `synthetic`, `clock_offset_ms?`, `timezone?`; size limit (video 500 MB, others 20 MB, configurable); MIME sniffed |
| GET | `/cases/{id}/evidence` | Inventory with hash, status, metadata, processing state |
| GET | `/evidence/{eid}` | Detail |
| GET | `/evidence/{eid}/stream` | Video playback (HTTP Range); serves the derived H.264 copy, with the original available via `/evidence/{eid}/original` |
| GET | `/evidence/{eid}/frames?from_ms&to_ms&sampled=true` | Frame index + thumbnail URLs |
| GET | `/frames/{frame_id}/image` | Thumbnail or full frame (derived) |
| POST | `/cases/{id}/witnesses` · `/witnesses/{wid}/statements` | Typed statement text or uploaded file |
| POST | `/cases/{id}/sensors` | CSV + mapping `{column→field, units, clock, timezone, actor_id?}`; validation preview returned |
| PUT | `/evidence/{eid}/clock` | Investigator-declared offset `{offset_ms, basis, uncertainty_ms}` → new sync version |

### Processing
| Method | Path | Notes |
|---|---|---|
| POST | `/cases/{id}/process` | `{stages?, config?: {sample_fps, detector_imgsz, det_conf, accident_conf, max_frames, max_processing_seconds}}` |
| POST | `/evidence/{eid}/reprocess` | `{from_ms, to_ms, full_rate: true}` for a selected interval |
| GET | `/cases/{id}/jobs` · `/jobs/{job_id}` | Stage statuses, progress, errors, partial results |
| POST | `/jobs/{job_id}/retry` | Retry failed stages only |

### Vision results
| Method | Path |
|---|---|
| GET | `/evidence/{eid}/detections?from_ms&to_ms&classes` |
| GET | `/evidence/{eid}/tracks` · `/tracks/{track_pk}` (history, continuity, thumbnails) |
| GET | `/evidence/{eid}/overlays?from_ms&to_ms` (boxes, track IDs, event markers for a window, built for the player canvas) |

### Witness and sensor results
| Method | Path |
|---|---|
| GET | `/statements/{sid}` (original text) · `/statements/{sid}/claims` (claims with spans and status) |
| PUT | `/claims/{claim_id}` (manual correction → new version, audited) |
| GET | `/sensors/{sid}/records?from_ms&to_ms&fields` · `/sensors/{sid}/anomalies` |

### Reconstruction
| Method | Path | Notes |
|---|---|---|
| GET | `/cases/{id}/scenarios` · POST `/cases/{id}/scenarios` | Baseline + alternatives `{name, assumptions}` → recompute job |
| GET | `/cases/{id}/timeline?scenario_id&categories&actor&source&from_ms&to_ms` | Events + ordering relations + lanes per sync group |
| GET | `/events/{event_id}` · `/events/{event_id}/summary` · `/events/{event_id}/sources` | Event, stored incident summary, resolved source references |
| GET | `/events/{event_id}/seek` | `{evidence_id, video_time_ms, frame_no, thumbnail}` per relevant video source |
| GET | `/cases/{id}/playback-map?evidence_id&video_time_ms&scenario_id` | Case time + active event + actor positions (null + reason if unsynchronized) |
| GET | `/cases/{id}/contradictions` · `/corroborations` · `/gaps` | Findings with refs, explanations, open questions |
| GET | `/cases/{id}/trajectories?scenario_id` | Per actor/track points, frame, support class, uncertainty |
| GET | `/cases/{id}/actors` · POST `/actor-links/{id}/confirm|reject` | Identity decisions (audited) |
| PATCH | `/findings/{fid}` | `{review_status, note?}` |
| POST | `/cases/{id}/annotations` | Investigator annotations |

### Reports and assistant
| Method | Path | Notes |
|---|---|---|
| POST | `/cases/{id}/reports` | `{scenario_id}` → job; builds 16-section dossier from stored records; validator report included |
| GET | `/reports/{rid}` · `/reports/{rid}/pdf` | JSON / PDF |
| POST | `/cases/{id}/ask` (optional) | Case-grounded answer with record citations, or "not in the case records" |

## 3. Example: incident summary
```json
GET /api/v1/events/evt_0044/summary
{
  "event_id": "evt_0044", "title": "Possible collision", "time": {"case_ms": 7800, "uncertainty_ms": 200},
  "involved_actors": ["vehicle_A", "vehicle_B"],
  "observations": [{"text": "Sensor collision flag set", "refs": [{"evidence_id": "ev_sensor_001", "rows": [156, 156]}]}],
  "detections": [{"text": "Tracks 3 and 7 overlap with abrupt motion change (CCTV 02)", "refs": [{"evidence_id": "ev_cctv_02", "frames": [234, 241]}], "model": "yolo26s+bytetrack"},
                 {"text": "Accident visual cue (conf 0.61)", "refs": [{"evidence_id": "ev_cctv_02", "frames": [236, 236]}], "model": "accident-yolov8s"}],
  "witness_claims": [{"witness": "A", "text": "turned left just before the collision", "refs": [{"evidence_id": "ev_stmt_A", "char_span": [0, 55]}]},
                     {"witness": "B", "text": "kept going straight", "refs": [{"evidence_id": "ev_stmt_B", "char_span": [12, 41]}]}],
  "sensor_observations": [{"text": "Deceleration minimum −5.2 m/s²", "refs": [{"evidence_id": "ev_sensor_001", "rows": [124, 132]}]}],
  "inferences": [],
  "status": ["requires_review", "conflicting_witness_accounts"],
  "uncertainty": ["Exact collision position not established (image-space only)", "Vehicle identity across cameras is a candidate link"],
  "open_questions": ["Did Vehicle A turn before entering the intersection?"],
  "synthetic": true
}
```

## 4. Behaviour guarantees
1. A failed Featherless stage never deletes or invalidates processed video or sensor results; the job becomes `partially_completed`.
2. No endpoint returns secrets or accepts file paths from clients.
3. Processing endpoints never read ground truth.
4. Original evidence bytes are served unchanged (`/original`).
5. External inference is skipped and reported when the case policy forbids it.

## 5. Implemented in Phase 2 (2026-10-30) and deviations from the design above

Live: `GET /health`, `GET /dashboard`, `POST|GET /cases`, `GET|PATCH /cases/{id}`, `POST|GET /cases/{id}/evidence`, `GET /evidence/{id}`, `GET /evidence/{id}/original`, `POST|GET /cases/{id}/witnesses`, `POST|GET /witnesses/{id}/statements`, `POST /witnesses/{id}/statements/upload`, `GET /statements/{id}`, `GET /cases/{id}/jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/retry`.

| Design | As built |
|---|---|
| Upload returns the evidence | Returns `{"duplicate": bool, "evidence": {...}, "job": {...}}`. `201` for new evidence; `200` with `duplicate: true` and the existing record when the same bytes are already in the case (an audit entry is written, no second job) |
| Validation result in the upload response | Validation runs right after the response (in-process background task, or `python -m app.worker`). The upload response shows `status: "uploaded"` and a `pending` job; poll `GET /evidence/{id}` or the job |
| `GET /evidence/{id}/stream` plus `/original` | Only `/original` exists. It supports HTTP Range, so browsers can seek H.264 MP4 directly. The transcoded playback copy and `/stream` arrive with video preprocessing (Phase 3) |
| - | `GET /evidence/{id}/original?verify=true` re-hashes the stored file; a mismatch returns `409 INTEGRITY_MISMATCH` and writes an audit entry |
| Size limits | Enforced while streaming: video 500 MB, everything else 20 MB (configurable). `413 FILE_TOO_LARGE` |
| Type checks | By content, not filename or client MIME. `415 UNSUPPORTED_CONTENT` when the content does not fit the declared kind |
| `synthetic` | Required on every upload: a missing value is a `422`, so nothing is silently treated as real |
| Auth | None. `X-Actor` header attributes audit entries (default `local-investigator`) |
| Errors | `{"error": {"code", "message", "details"}}` for application and validation errors |

## 6. Implemented in Phase 3 (2026-10-30)

| Endpoint | Behaviour |
|---|---|
| `GET /evidence/{id}/stream` | Derived H.264 playback copy (Range supported; header `X-Evidence-Role: derived-playback-copy`). `409 PLAYBACK_NOT_READY` until preprocessing produced it |
| `GET /evidence/{id}/frames?from_ms&to_ms&sampled=true&limit` | Frame index: `frame_no`, `time_ms`, `sampled`, `blur`, `brightness`, `thumbnail_url`, `full_url`; plus `pts_start_ms` |
| `GET /frames/{frame_id}/image[?full=true]` | Thumbnail, or frame-accurate full-resolution JPEG (extracted once, cached as a derived file) |
| `POST /evidence/{id}/reprocess` | `{from_ms, to_ms, sample_fps?}` (≤ 120 s) → higher-rate thumbnails for that interval |
| `POST /cases/{id}/process` | `{stages: ["preprocess"], sample_fps?, max_frames?}` → preprocess every valid video; identical input + parameters reuses the earlier run |

**Time convention:** `time_ms` = media time from the first frame (container PTS). The playback copy starts at 0, so `<video>.currentTime × 1000 = time_ms`. The container's own start offset is reported as `pts_start_ms`. None of these are wall-clock or synchronized times (synchronization is Phase 8).

Jobs now include `params` and `result`. Non-validation stages run in state `processing`. `partially_completed` jobs can be retried.

## 7. Implemented in Phase 4 (2026-10-30)

| Endpoint | Behaviour |
|---|---|
| `GET /evidence/{id}/detections?from_ms&to_ms&classes&min_conf=0.25&include_accident_cue=true&model_run_id&include_empty` | Machine detections per sampled frame, `bbox` in original-frame pixels, from the latest finished detector and accident-cue runs (or a named run). `409 DETECTIONS_NOT_READY` before detection has run |
| `GET /evidence/{id}/model-runs` | Every model run on these exact bytes (preprocess, detect, accident_cue): model ID, weights hash prefix, parameters, device, metrics |
| `POST /cases/{id}/process` | `stages` now also accepts `["detect"]` (re-detect on existing sampled frames) |

Boxes are stored down to the storage threshold (`detector_conf` 0.15); `min_conf` filters for display. Every detection is category `machine_detection`; the response carries a note that the accident cue never establishes a collision by itself.

## 8. Implemented in Phase 5 (2026-10-30)

| Endpoint | Behaviour |
|---|---|
| `GET /evidence/{id}/tracks?class&min_observations` | Latest tracking run: per track class (majority vote), first/last ms, observations, reliability (`stable`, `fragmented`, `id_switch_suspected`, `short`), gaps, flags, border exit, continuation candidates; plus the run's parameters and metrics |
| `GET /tracks/{id}` | Full track: points (frame, time, bbox, bottom-centre anchor, confidence, detection id, `backfilled`) and continuity |
| `GET /evidence/{id}/overlays?from_ms&to_ms(≤60 s)&min_conf` | Boxes per sampled frame with `track_id` (null when untracked), for the player canvas. Boxes exist only on sampled frames; anything drawn between them is interpolation |
| `POST /cases/{id}/process` | `stages` also accepts `["track"]` |

Track IDs are per video and per run. They never assert that two cameras saw the same vehicle; cross-camera identity is a separate, uncertain engine step.

## 9. Implemented in Phase 6 (2026-10-31)

| Endpoint | Behaviour |
|---|---|
| `POST /statements/{id}/extract` | Queue claim extraction (202 + job). `403 EXTERNAL_INFERENCE_DISABLED` if the case forbids external inference (response points to the manual endpoint); `503 LLM_NOT_CONFIGURED` without a server key |
| `GET /statements/{id}/claims` | Claims of the latest extraction run plus manual claims, with the original text and the run's status/metrics |
| `GET /cases/{id}/claims` | All claims in a case, with witness labels |
| `POST /statements/{id}/claims` | Manual claim `{char_start, char_end, ...}`; the server cuts `source_text` from the stored statement |

Statement creation (typed or uploaded) returns `extraction_job` when extraction was queued automatically (case allows external inference **and** a key is configured), otherwise `null`.

Claim shape: `explicit_statement` (verbatim text, offsets, context), `normalized_interpretation` (machine reading: subject, action, direction, location, time description + exactness, certainty, hedges, `event_type_hint` from a fixed keyword table, `interpreted_by`), `corroboration_status` / `contradiction_status` (`not_assessed` until the engine), `time_placement` (always "not placed" here).

Design decisions: (1) the ledger cache is keyed by model + prompt + input, not by case, so an identical statement is not re-sent; the case policy is checked before any cache lookup. (2) A fault statement that a witness actually wrote is testimony: stored verbatim as a claim and never promoted to a system finding; the later summary validator governs system-written sentences, not quoted testimony.

Addendum (Phase 6, live): `normalized_interpretation` also carries `code_derived_maneuver` (left | right | straight | null, read by code from the witness's own words) and `direction_check` (`agrees` | `differs` | `not_comparable` between the model's direction field and the code-derived maneuver). Downstream rules must use the code-derived value.

## 10. Implemented in Phases 7-13 (2026-10-31)
All under `/api/v1`. 61 paths in total.
- **Sensors:** `POST /evidence/{id}/sensor-preview` (dry run), `POST /cases/{id}/sensors` (register mapping, units, clock, actor), `GET /cases/{id}/sensors`, `GET /evidence/{id}/sensor-records`, `GET /evidence/{id}/sensor-events`.
- **Synchronization:** `PUT /evidence/{id}/clock`, `POST /cases/{id}/sync-edges`, `POST /cases/{id}/sync-points`, `GET /cases/{id}/sync` (groups, unsynchronized sources, inconsistencies, edges), `POST /cases/{id}/sync/proposals`, `POST /sync-edges/{id}/confirm|reject`, `GET /cases/{id}/playback-map`.
- **Identity:** `POST/GET /cases/{id}/actors`, `POST /actors/{id}/links` (candidate or confirmed), `POST /actor-links/{id}/confirm|reject`.
- **Calibration and imported detections:** `POST/GET /evidence/{id}/calibration` (fixed cameras only), `POST /evidence/{id}/detections/import` (`source` oracle|external, labelled), `POST /cases/{id}/process` accepts `chain_detect=false`.
- **Reconstruction:** `POST/GET /cases/{id}/reconstruction/scenarios` (assumptions: `edge_offsets`, `exclude_edges`, `reference`, `unconfirm_links`), `GET /cases/{id}/reconstruction/diff?a=&b=`, `GET /cases/{id}/timeline`, `GET /events/{id}`, `GET /events/{id}/summary`, `GET /cases/{id}/seek?case_ms=`, `/contradictions`, `/corroborations`, `/gaps`, `/trajectories?frame=image|ground_plane`, `/collision-candidates`, `/findings`, `PATCH /findings/{id}` (review). Reads default to the baseline scenario; `scenario_id` selects another.
- **Reports:** `POST /cases/{id}/reports` (build + validate; PDF only if valid), `GET /cases/{id}/reports`, `GET /reports/{id}`, `/markdown`, `/pdf`.
Deviations from §2: no assistant endpoint yet; `X-Actor` header instead of accounts (user FK columns are plain names since migration 0007).
