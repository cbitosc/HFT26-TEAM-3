# API_SPECIFICATION

Version 2. REST over HTTPS, JSON bodies, base path `/api/v1`. FastAPI generates the OpenAPI schema from these contracts during implementation. This document fixes resources, behaviour, and shapes.

## 1. Conventions

- **Auth:** bearer token per user; roles investigator, reviewer, admin (SECURITY_AND_EVIDENCE_INTEGRITY.md).
- **IDs:** opaque strings with prefixes (`CASE-`, `EVD-`, `EV-`, `TLV-`, `SUM-`, `RV-`, `JOB-`).
- **Async work:** returns `202 Accepted` with `{job_id}`. Poll `GET /jobs/{id}` or subscribe to `GET /cases/{id}/events-stream` (Server-Sent Events).
- **Versions:** versioned resources return `version` and an `ETag`. Mutations that create versions require `If-Match`, giving optimistic concurrency.
- **Staleness:** any artifact response includes `stale: bool` and `stale_reason` when applicable.
- **Errors:** `{ "error": { "code": "EVIDENCE_INVALID", "message": "...", "details": {...}, "request_id": "..." } }` with suitable HTTP status (400, 401, 403, 404, 409 conflict/stale, 412 precondition, 422 validation, 429, 500, 503).
- **Pagination:** `?limit=&cursor=`; responses include `next_cursor`.
- **Time:** case time in seconds as `{earliest, latest}` intervals; wall-clock times in ISO 8601 with offset.

## 2. Endpoints

### Cases
| Method | Path | Purpose |
|---|---|---|
| POST | `/cases` | Create `{title, designation, allow_external_inference}` |
| GET | `/cases`, `/cases/{case_id}` | List, detail (with evidence counts and stage status) |
| PATCH | `/cases/{case_id}` | Update title or policy (audited; changing the policy does not affect past calls) |
| POST | `/cases/{case_id}/archive` | Archive |

### Evidence and registry
| Method | Path | Purpose |
|---|---|---|
| POST | `/cases/{id}/evidence` | Multipart upload + `{source_type, camera_id?, witness_id?, sensor_stream_id?, recording_start_time?, recording_timezone?, clock_offset_s?, clock_offset_basis?, is_synthetic, provenance}` → evidence item |
| GET | `/cases/{id}/evidence` | Inventory with hash, status, quality |
| GET | `/evidence/{evidence_id}` | Detail and metadata |
| GET | `/evidence/{evidence_id}/content` | Original bytes; supports `Range` (original playback) |
| POST/GET | `/cases/{id}/cameras`, `/cases/{id}/witnesses`, `/cases/{id}/sensor-streams` | Registry |
| POST | `/cameras/{camera_id}/calibration` | Homography points or parameters; returns reprojection error |
| POST | `/cases/{id}/geometry` | Scene geometry for reconstruction (frame, source, content) |

### Processing
| Method | Path | Purpose |
|---|---|---|
| POST | `/cases/{id}/process` | Run the stage DAG; body `{stages?: [...], force?: false}` → `{job_ids}` |
| GET | `/cases/{id}/jobs`, `/jobs/{job_id}` | Status, progress, errors |
| POST | `/jobs/{job_id}/retry` | Retry a failed job |
| GET | `/cases/{id}/processing-report` | Stages run, skipped, failed; external-inference calls made |

### Video results and original playback
| Method | Path | Purpose |
|---|---|---|
| GET | `/evidence/{id}/frames?from=&to=` | Frame index (PTS, quality) |
| GET | `/evidence/{id}/detections?frame_from=&frame_to=` | Detections |
| GET | `/evidence/{id}/tracks`, `/tracks/{track_id}` | Tracks with gaps and reliability |
| GET | `/evidence/{id}/overlays?video_from=&video_to=` | Boxes, track IDs, event markers for a time window |
| GET | `/playback/map?evidence_id=&video_time=` | Video time → case time interval, active events, trajectory positions (or `null` + reason if unsynchronized) |
| GET | `/events/{event_id}/seek` | `{evidence_id, video_time, frame_no, supporting_frames}` |

### Witness and sensor results
| Method | Path | Purpose |
|---|---|---|
| GET | `/statements/{id}` | Verbatim text and sentences |
| GET | `/statements/{id}/claims` | Claims with spans, normalized fields, statuses |
| GET | `/evidence/{id}/sensor-records?t_from=&t_to=&fields=` | Normalized records |
| GET | `/evidence/{id}/sensor-gaps` | Gaps |

### Normalization and engine
| Method | Path | Purpose |
|---|---|---|
| GET | `/cases/{id}/events?type=&status=&source=&entity=` | Canonical events |
| GET | `/events/{event_id}`, `/events/{event_id}/provenance` | Event, full reference chain to raw evidence |
| GET | `/cases/{id}/clocks`, `/cases/{id}/sync-groups` | Clock records, groups |
| POST | `/cases/{id}/sync-points` | Investigator-verified synchronization point |
| GET | `/cases/{id}/sync-proposals` · POST `/sync-proposals/{id}/confirm|reject` | Anchor proposals and decisions |
| GET | `/cases/{id}/entities` · POST `/entity-links/{id}/confirm|reject` | Entities and candidate links |
| GET | `/cases/{id}/timeline?version=` | Timeline version: entries, relations, alternatives, groups |
| POST | `/cases/{id}/timeline/corrections` | Correction → new timeline version (`If-Match`) |
| GET | `/cases/{id}/correlations?kind=` | Supporting, contradicting, partial, unrelated, insufficient |
| GET | `/cases/{id}/contradictions` | Shortcut for `kind=contradicting` |
| GET | `/cases/{id}/gaps` | Gaps and recommendations |
| GET | `/cases/{id}/trajectories?version=` | Trajectories with frame, level, uncertainty |
| GET | `/cases/{id}/inferences` | Inferences with premises and alternatives |

### Summary
| Method | Path | Purpose |
|---|---|---|
| POST | `/cases/{id}/summaries` | Generate a draft from current versions → job |
| GET | `/cases/{id}/summaries`, `/summaries/{summary_version_id}` | Versions, content, validation results |
| POST | `/summaries/{id}/edits` | Investigator edit → new draft version (`If-Match`, `edit_reason`) |
| POST | `/summaries/{id}/finalize` | Finalize (reviewer or investigator role); fails if validation has errors |
| GET | `/summaries/{id}/export?format=pdf|md|json` | Export |
| POST | `/cases/{id}/ask` (optional) | Case-grounded question → answer with citations, or "not supported by case records" |

### Reconstruction video
| Method | Path | Purpose |
|---|---|---|
| POST | `/summaries/{id}/reconstruction-videos` | Generate from a **finalized** summary; body `{render_config?}` → job. Returns 409 if the summary is not finalized |
| GET | `/cases/{id}/reconstruction-videos` | List with status and staleness |
| GET | `/reconstruction-videos/{video_id}` | Manifest, status, `stale`, `stale_reason` (changed finding IDs) |
| GET | `/reconstruction-videos/{video_id}/content` | MP4 (range requests; `Content-Disposition` for download) |
| GET | `/reconstruction-videos/{video_id}/trace?t=` | Rendered elements at video time t → record IDs (source-to-video traceability) |
| POST | `/reconstruction-videos/{video_id}/regenerate` | New video from the latest finalized versions |

### Evaluation (evaluation role only; never called by processing)
| Method | Path | Purpose |
|---|---|---|
| POST | `/eval/runs` | Run the harness for scenarios → job |
| GET | `/eval/runs/{run_id}` | Metrics, sample sizes, failures |

## 3. Example payloads

**Seek from an event**
```json
GET /api/v1/events/EV-000031/seek
{
  "event_id": "EV-000031",
  "evidence_id": "EVD-VID-01",
  "video_time": 11.90,
  "frame_no": 357,
  "supporting_frames": [357, 372],
  "case_time": {"earliest": 11.85, "latest": 11.95},
  "sync_group_id": "SG-1"
}
```

**Correlation record**
```json
{
  "record_id": "CR-000012",
  "kind": "contradicting",
  "rule_id": "CON-ACTION-01",
  "compared_events": ["EV-000044", "EV-000071"],
  "basis": {
    "entity_match": {"entity_id": "VEH-A", "status": "confirmed"},
    "time_overlap": true,
    "attribute": "maneuver",
    "values": {"EV-000044": "straight (image-space, CCTV-02)", "EV-000071": "turned left (reported)"}
  },
  "independence": {"independent": true, "reason": "different evidence items and source types"},
  "explanation_template": "CCTV-02 track 3 (VEH-A) appears to continue straight through frames 401–455, while witness W2 states VEH-A turned left. The system does not determine which account is correct.",
  "explanation_llm": null
}
```

**Reconstruction video (stale)**
```json
{
  "video_id": "RV-0003",
  "status": "stale",
  "summary_version_id": "SUM-0007",
  "stale": true,
  "stale_reason": {
    "changed": [{"type": "entity_link", "id": "LNK-0021", "change": "rejected"},
                {"type": "timeline_version", "from": 4, "to": 5}],
    "affected_findings": ["CR-000012", "TRJ-VEH-A"]
  }
}
```

## 4. Behavioural guarantees

1. No endpoint accepts or returns API keys.
2. Processing endpoints never expose ground truth.
3. Hosted-model stages are skipped, and reported as skipped, when `allow_external_inference=false`.
4. Every finding returned by the API carries resolvable references.
5. Original evidence content is served byte-identical to the stored hash.
