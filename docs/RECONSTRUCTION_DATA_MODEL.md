# Reconstruction data model

Additive contract for V2. Existing timeline, event, incident, and report fields keep their names and units. New keys are listed here. `docs/INTEGRATION_CONTRACT.md` §14 is the same contract in endpoint form. Nothing in this file renames a field.

A reconstructed event is never a fact. It cites the evidence it came from. Tracker ids stay inside one video and one tracking run. Equal integers on two cameras are not the same vehicle.

## Evidence classes

`evidence_class` is a new string on each timeline event and on `GET /events/{id}`. `category` is unchanged.

| evidence_class | When it is used |
|---|---|
| `direct_observation` | `category` is `direct_observation` and `source_type` is `video_cctv` or `video_dashcam` |
| `witness_reported` | `category` is `witness_claim` |
| `sensor_observed` | `source_type` is `sensor` |
| `derived_observation` | `category` is `machine_detection` |
| `system_inference` | `category` is `inference` and the row is the rule result |
| `hypothesis` | An entry in the timeline `hypotheses` array. Not a new `category`. `probability` is always JSON `null` |
| `unknown` | The row has no `source_id` and is not an inference |

Sensor readings stay `category: direct_observation` in storage. The new class name is `sensor_observed`. Machine-detection rules stay `category: machine_detection`. The new class name is `derived_observation` because the event is computed from boxes, not a measurement of contact.

## Clocks on an event

`clocks` is a new object. `start_ms` and `end_ms` remain case time and are not renamed.

| Key | Type | Meaning |
|---|---|---|
| `media_ms` | `[number, number]` or `null` | The source's own time, from `observations.source_time_ms`. Video: media milliseconds from the first frame. Sensor: milliseconds from the first valid sample. `null` when that pair is absent |
| `container_pts_ms` | `[number, number]` or `null` | `media_ms` plus `video.pts_start_ms` for a video whose PTS was stored. `null` for sensors, witnesses, and video with no PTS |
| `wall_clock` | `[string, string]` or `null` | ISO-8601 UTC. Computed only when this source has a clock record whose `basis` is `declared_by_investigator` or `simulation_clock` and `utc_zero` is set: `utc_zero + media_ms`. File `creation_time_claimed` is never used |
| `case_ms` | `[number, number]` or `null` | Same numbers as `start_ms` / `end_ms`. `null` when the event is unplaced. A lone source uses its own media time as case time |
| `synchronized_ms` | `[number, number]` or `null` | The case interval only when the event's sync group has two or more sources and the group is consistent. `null` for a lone source, an unsynchronized source, or an inconsistent group. A lone source is not described as synchronized with another camera |

## Trace

Every timeline event and `GET /events/{id}` includes:

```json
{"source_id": "ev_… or null", "source_event_id": "se_… or null", "evidence_ids": ["ev_…"], "complete": true}
```

`evidence_ids` for a non-inference event is `[source_id]` when `source_id` is set, otherwise `[]`. For an inference, `evidence_ids` are the `source_id` values of the premise events, with nulls omitted. `complete` is true only when every premise resolved to an event that has a `source_id`. A non-inference event is complete when `source_id` is set.

`provenance.source_event_id` remains the stored source-event id. `trace.source_event_id` copies it.

## Source annotation

Original bytes, filename, kind, hash, and synthetic flag stay immutable. Editable description lives beside the file.

`Evidence.source` is always present:

| Field | Type | Null | Notes |
|---|---|---|---|
| source_id | string | no | Same as `Evidence.id` |
| display_name | string | yes | Investigator name. Filename is not rewritten |
| camera_role | string | yes | `cctv`, `dashcam`, or `other`. Default is `kind` when `kind` is one of those three, otherwise `null` |
| location_text | string | yes | Free text. Not a geocode and not a discovered camera |
| recording_start, recording_end | string | yes | Investigator-declared ISO-8601 instants. Not read from the file |
| timezone | string | yes | IANA name supplied by the investigator |
| clock_offset_ms | int | yes | See below |
| clock_offset_reference_id | string | yes | Another evidence id in the same case |
| clock_offset_basis | string | yes | `declared_by_investigator` when an offset is stored |
| original_filename | string | no | Copy of the immutable filename |
| processing_kind | string | no | The immutable `kind` the pipeline used |

`PATCH /evidence/{id}/source` accepts any subset of `display_name`, `camera_role`, `location_text`, `recording_start`, `recording_end`, `timezone`, `clock_offset_ms`, `clock_offset_reference_id`. `null` clears a field. An omitted field is left as stored. `recording_end` before `recording_start` is 422 `RECORDING_WINDOW`. An offset without a reference id is 422 `OFFSET_REFERENCE_REQUIRED`. The reference must be a different evidence row in the same case.

`clock_offset_ms` means `time in this source = time in clock_offset_reference_id + clock_offset_ms`, in milliseconds. The next scenario build applies it as edge id `ann:{source_id}` with basis `known_offset`. Scenarios already built are not rewritten. Changing `camera_role` does not re-run detection or tracking.

Upload kind `other` is a video that is not declared CCTV or dashcam. The original is stored. Detect and track are not started for `other`. `processing_kind` is `other` and `camera_role` defaults to `other`.

## Manual offsets already on the API

`PUT /evidence/{id}/clock` and `POST /cases/{id}/sync-edges` are unchanged. A trusted clock record (`declared_by_investigator` or `simulation_clock` with `utc_zero`) still joins sources. Embedded metadata still does not. The source annotation offset is an additional declared edge, not a replacement.

## Overlap, gaps, clock inconsistency

Timeline gains `overlaps`. Each item is one pair of evidence ids whose placed case-time spans intersect:

```json
{"evidence_ids": ["ev_a", "ev_b"], "start_ms": 1000, "end_ms": 1800, "event_ids": ["evt_…"]}
```

`start_ms` / `end_ms` are case milliseconds. Overlap is not contact and is not a corroboration. The array is empty when no two placed sources intersect.

Gaps stay on `GET /cases/{id}/gaps`. They are missing evidence, not contradictions. `clock_inconsistency` is the gap written when two applied clock relations disagree by more than their bounds. Contradictions stay on `GET /cases/{id}/contradictions`.

## Cross-camera association

`GET /cases/{id}/associations?scenario_id` → `{scenario_id, items: [Association]}`.

| Field | Type | Notes |
|---|---|---|
| id | string | `vas_…` |
| status | string | Always `uncertain`. The API does not confirm that two tracks are one vehicle |
| tracks | object[] | `{evidence_id, track_id, track_pk}`. At least two, on different evidence ids. `track_id` is the integer from that video's run only |
| supporting | object[] | `{kind, id, evidence_id}`. `kind` is `actor_link` or `investigator` |
| contradicting | object[] | `{kind, id, evidence_id}`. `kind` is `contradiction` |
| basis | string | Why the row exists |
| probability | null | Always JSON `null`. No score is stored |

Rows are created in two ways only:

1. Scenario build, when one actor has confirmed track links on two or more evidence ids. The row stays `uncertain`. Supporting lists those links. Contradicting lists contradictions in that scenario whose two events cite those evidence ids.
2. `POST /cases/{id}/associations` with `{scenario_id?, tracks: [{evidence_id, track_id}, …], basis}`. The tracks must exist. Supporting is one `investigator` entry. This does not create a corroboration and does not confirm an actor link.

Equal `track_id` integers do not create a row. A second upload of the same bytes does not create a second evidence id (`200` and `duplicate: true`), so it cannot support or corroborate anything.

## Hypotheses

Timeline gains `hypotheses`. One entry per inference event whose premises all have evidence ids:

```json
{"id": "evt_…", "evidence_class": "hypothesis", "statement": "…", "alternatives": ["…"], "premises": ["evt_…"], "evidence_ids": ["ev_…"], "probability": null}
```

`alternatives` are the strings already stored on the inference. They are not new sentences and they have no probabilities. An inference with a premise that has no evidence id is omitted here and listed on the completeness payload as `unsupported_hypotheses`.

## Completeness

`GET /cases/{id}/reconstruction/completeness?scenario_id` →

| Field | Type | Notes |
|---|---|---|
| scenario_id | string | |
| defensible | bool | True only when at least one placed event has `trace.complete` and `evidence_class` in `direct_observation`, `derived_observation`, `sensor_observed`, `witness_reported` |
| reasons | string[] | Present only for conditions that the stored records meet. No invented incident |
| sources | object[] | `{evidence_id, kind, placed, unsynchronized}` |
| gap_types | object | Count by `gap_type` |
| contradiction_count | int | |
| missing_evidence | object[] | `{gap_id, gap_type, evidence_id}` from gap scopes. Not contradiction ids |
| unsupported_hypotheses | string[] | Inference event ids omitted from `hypotheses` |
| overlaps | array | Same shape as the timeline `overlaps` |

`reasons` codes: `no_placed_evidence`, `no_tracked_vehicles`, `sources_unsynchronized`, `clock_inconsistency`, `missing_intervals`, `recording_starts_after_event`, `recording_ends_before_event`. The last two are used only when a trusted wall clock exists for the event and the investigator recording window does not contain that instant. They are not inferred from filenames or from file duration alone.

`no_tracked_vehicles` is used when the case has a valid `cctv` or `dashcam` file and no `VehicleTrack` row for those files.

## Duplicate uploads

`POST /cases/{id}/evidence` with the same bytes and case returns `200`, `duplicate: true`, the existing evidence id, and `job: null`. Corroboration rules still require two different evidence ids.

## Case incident time and place

`incident_at` and `location_text` are on the case, from create, read, list, and `PATCH`. Both are null until an investigator sets them. Migration `0010` adds the columns as null and does not rewrite existing rows.

`incident_at` is an ISO-8601 instant with a timezone offset. A missing offset is 422 `INCIDENT_TIMEZONE_REQUIRED`. The response repeats the stored offset. `incident_at_note` is a fixed sentence on every case: the server does not assume a zone, does not read the instant from a file, and does not use it to choose frames. `location_text` is free text of at most 500 characters. It is not a geocode.

## Storyboard

`GET /cases/{id}/storyboard?scenario_id` returns 409 `NO_RECONSTRUCTION` when no scenario exists. It does not write a JPEG.

```json
{"scenario_id": "scn_…", "ordering": "per_source_media_time", "note": "…", "strips": [{"evidence_id": "ev_…", "items": []}], "omitted": []}
```

Each item is one stored video event (`source_type` `video_cctv` or `video_dashcam`) that has `observations.source_time_ms`:

| Field | Meaning |
|---|---|
| before | The stored extracted frame on that file with the greatest `time_ms` strictly before the interval, or null |
| during | Stored frames whose `frame_no` is in the event's cited frame list. When the event cites none, stored samples whose `time_ms` falls inside the interval |
| after | The stored extracted frame with the least `time_ms` strictly after the interval, or null |
| during_basis | `cited_frames` or `samples_inside_interval` |
| missing | `before`, `during`, and/or `after` when that slot has no stored frame |

A cited frame number with no extracted row is left out. The route does not invent the still. `before` and `after` are not also listed in `during`. Strips are separate per evidence id, ordered by that file's media time. Two cameras are not interleaved, including when their case times overlap. Witness, sensor, and inference events are listed in `omitted` with `not_a_video_event`, `no_source`, or `no_source_time`. `incident_at` is not an input.

Frame objects match incident frames: `evidence_id`, `frame_id`, `frame_no`, `time_ms`, `thumbnail_url`, `full_url`. A frame with no thumbnail has null URLs.

## What this model does not do

No external camera lookup. No plate, make, or model. No legal fault. No probability on a hypothesis or an association. Synthetic evidence is still rejected on a `real` case before staging. A failed Featherless call does not write model sentences. The narrative document still includes `hypothesis_explanation` built from stored events. See `docs/INTEGRATION_CONTRACT.md` §7a and `docs/FEATHERLESS_INTEGRATION.md`.
