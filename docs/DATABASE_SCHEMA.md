# DATABASE_SCHEMA

Version 3. PostgreSQL 16 through SQLAlchemy 2 + Alembic. Large files live on local disk; PostgreSQL stores paths, hashes, and metadata. Originals, derived outputs, and conclusions are kept in separate tables and directories.

## 1. Tables

```sql
-- people and cases
users(id PK, name, role CHECK (role IN ('investigator','reviewer','admin')), created_at)   -- simple demo auth
cases(id PK, code UNIQUE, title, description, status CHECK (status IN ('open','processing','review','closed')),
      designation CHECK (designation IN ('real','staged','synthetic','mixed')),
      allow_external_inference bool NOT NULL DEFAULT false, created_by FK users, created_at, updated_at)

-- evidence (originals are immutable)
evidence_files(id PK, case_id FK, kind CHECK (kind IN ('dashcam','cctv','witness_text','witness_pdf','sensor_csv','annotation','ground_truth')),
      original_filename, stored_path UNIQUE, mime_type, size_bytes, sha256 char(64) NOT NULL,
      uploaded_by FK, uploaded_at, synthetic bool NOT NULL, provenance jsonb, licence text,
      status CHECK (status IN ('uploaded','valid','invalid')), validation jsonb,
      UNIQUE(case_id, sha256))
video_metadata(evidence_id PK FK, duration_ms, fps_nominal, fps_measured, width, height, codec, rotation,
      frame_count, creation_time_claimed timestamptz NULL, timezone NULL,
      clock_offset_ms int NULL, clock_offset_basis text NULL, camera_id FK NULL,
      playback_path text)                                       -- browser-friendly H.264 copy (derived)
cameras(id PK, case_id FK, kind CHECK (kind IN ('dashcam','cctv')), label, mounted_actor_id FK NULL,
      calibration jsonb NULL, calibration_error_px real NULL)
extracted_frames(id PK, evidence_id FK, frame_no, time_ms, thumbnail_path, blur real, brightness real,
      sampled bool, UNIQUE(evidence_id, frame_no))

-- model outputs
model_runs(id PK, case_id FK, stage, model_id, model_version, params jsonb, params_hash, input_sha256,
      device, started_at, finished_at, status, metrics jsonb)
detections(id PK, frame_id FK extracted_frames, model_run_id FK, class, confidence, x1, y1, x2, y2,
      track_id int NULL, is_accident_cue bool DEFAULT false)
vehicle_tracks(id PK, evidence_id FK, model_run_id FK, track_id int, class, first_frame, last_frame,
      duration_ms, mean_confidence, continuity jsonb,         -- gaps, fragments, suspected switches
      points jsonb,                                            -- [{frame,time_ms,bbox,center,conf}]
      UNIQUE(evidence_id, model_run_id, track_id))

-- witnesses
witnesses(id PK, case_id FK, label, notes)
witness_statements(id PK, witness_id FK, evidence_id FK NULL, text_original text NOT NULL,
      source CHECK (source IN ('typed','txt','pdf','ocr')), statement_time timestamptz NULL, synthetic bool NOT NULL)
witness_claims(id PK, statement_id FK, model_run_id FK NULL, char_start, char_end, source_text text NOT NULL,
      subject, action, direction, time_description, certainty, normalized jsonb,
      extraction_status CHECK (extraction_status IN ('valid','repaired','failed','manual')))

-- sensors
sensor_sources(id PK, case_id FK, evidence_id FK, actor_id FK NULL, mapping jsonb, units jsonb,
      clock CHECK (clock IN ('utc','local','relative','simulation')), timezone NULL,
      clock_offset_ms int NULL, clock_offset_basis text NULL, sample_rate_hz real, synthetic bool NOT NULL)
sensor_records(sensor_source_id FK, row_no, t_raw text, time_ms bigint, values jsonb, valid bool,
      issues jsonb, PRIMARY KEY (sensor_source_id, row_no))

-- actors and synchronization
actors(id PK, case_id FK, label, kind CHECK (kind IN ('vehicle','pedestrian','cyclist','other')), attributes jsonb)
actor_links(id PK, actor_id FK, ref_type CHECK (ref_type IN ('track','sensor_source','claim')), ref_id,
      status CHECK (status IN ('candidate','confirmed','rejected')), basis jsonb, decided_by FK NULL, decided_at)
sync_groups(id PK, case_id FK, reference_source text, members jsonb, basis jsonb, version int)

-- reconstruction
reconstruction_scenarios(id PK, case_id FK, name, is_baseline bool, assumptions jsonb, created_by, created_at)
events(id PK, case_id FK, scenario_id FK NULL, schema_version, category, event_type, title, actor_id FK NULL,
      actor_candidates jsonb, start_case_ms bigint NULL, end_case_ms bigint NULL, start_utc timestamptz NULL,
      end_utc timestamptz NULL, uncertainty_ms int, uncertainty_basis, sync_group_id FK NULL,
      source_type, source_id FK evidence_files NULL, location jsonb, observations jsonb, inference jsonb,
      confidence jsonb NOT NULL, provenance jsonb NOT NULL, synthetic bool NOT NULL,
      review_status DEFAULT 'unreviewed', version int DEFAULT 1, supersedes FK events NULL,
      CHECK ((category = 'inference') = (inference IS NOT NULL)))
event_sources(event_id FK, evidence_id FK, kind, frames int4range NULL, rows int4range NULL,
      char_span int4range NULL, thumbnail_path NULL, PRIMARY KEY (event_id, evidence_id, kind))
contradictions(id PK, case_id FK, scenario_id FK, rule_id, event_a FK, event_b FK, related_events jsonb,
      strength CHECK (strength IN ('clear','marginal')), basis jsonb, explanation_template text,
      explanation_llm text NULL, unresolved_questions jsonb, review_status)
corroborations(id PK, case_id FK, scenario_id FK, rule_id, events jsonb, independent bool,
      independence_reason text, temporal_relation text, explanation_template text, review_status)
trajectories(id PK, case_id FK, scenario_id FK, actor_id FK NULL, track_ref jsonb,
      frame CHECK (frame IN ('image','ground_plane','wgs84','schematic')), camera_id FK NULL,
      points jsonb,          -- [{time_ms, x, y, uncertainty, support:'observed'|'interpolated'|'inferred'|'missing', refs}]
      calibration_id NULL, notes)
event_summaries(event_id PK FK, scenario_id FK, content jsonb NOT NULL, validated bool, generated_at)
investigation_findings(id PK, case_id FK, scenario_id FK, kind CHECK (kind IN ('timeline','contradiction','corroboration','gap','observation','inference','open_question')),
      ref_ids jsonb NOT NULL, text text, review_status, reviewer FK NULL, reviewed_at)
annotations(id PK, case_id FK, target_type, target_id, author FK, body text, created_at)
reports(id PK, case_id FK, scenario_id FK, version int, content jsonb, pdf_path NULL, validation jsonb, created_at)

-- operations
processing_jobs(id PK, case_id FK, evidence_id FK NULL, stage, status CHECK (status IN
      ('pending','validating','processing','completed','failed','partially_completed')),
      progress real, error jsonb, attempts int, input_hash, params_hash, created_at, started_at, finished_at)
llm_calls(id PK, model_run_id FK, provider, model, prompt_hash, input_hash, request_meta jsonb,
      response jsonb, valid bool, tokens_in, tokens_out, latency_ms, error, created_at)
audit_log(id bigserial PK, case_id FK, actor FK users, action, target_type, target_id, details jsonb,
      created_at, prev_hash, entry_hash)
```

## 2. Indexes
`detections(frame_id)`, `detections(track_id)`, `extracted_frames(evidence_id, time_ms)`, `vehicle_tracks(evidence_id)`, `sensor_records(sensor_source_id, time_ms)`, `events(case_id, scenario_id, start_case_ms)`, `events(case_id, event_type)`, `event_sources(evidence_id)`, `contradictions(case_id, scenario_id)`, `corroborations(case_id, scenario_id)`, `processing_jobs(case_id, status)`, `llm_calls(prompt_hash, input_hash)`.

## 3. Integrity rules
1. `evidence_files`, `witness_statements.text_original`, `sensor_records.t_raw`, and `audit_log` are never updated or deleted by the application role.
2. `stored_path` is generated by the server (`originals/<sha256[:2]>/<sha256>`). User filenames are kept only as metadata, which prevents path traversal and silent overwrites.
3. Derived artifacts (thumbnails, playback transcodes, crops) go under `derived/<case>/<evidence>/<model_run>/`, never next to originals.
4. Every `events` row (except inferences) has at least one `event_sources` row (trigger).
5. Witness claim spans must equal `substring(text_original)` (trigger plus application check).
6. Ground-truth files (`kind = 'ground_truth'`) are excluded from processing queries and read only by the evaluation harness.
7. Re-processing creates a new `model_run`; earlier outputs remain for comparison.
