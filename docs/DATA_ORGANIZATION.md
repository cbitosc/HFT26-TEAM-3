# DATA_ORGANIZATION

## 1. Repository vs data folder

- **Git repository (small, text):** code, docs, scenario scripts, manifests, answer keys, evaluation configs, metric outputs (small JSON), download and validation scripts, license notices.
- **Data directory (large, not in git):** all videos, frames, model outputs of significant size, downloaded datasets. The path is configurable (`TRACELINE_DATA_DIR`). `.gitignore` excludes it. Raw third-party datasets are never committed.

## 2. Directory structure

```
traceline/                        # repository root
├── docs/                         # this documentation
├── scenarios/
│   ├── S01_intersection_collision/
│   │   ├── manifest.yaml
│   │   ├── carla_script.py        # generator, seeded
│   │   ├── groundtruth_script.yaml
│   │   ├── witness/               # synthetic statements (text)
│   │   └── answer_key.yaml        # planted contradictions, expected outputs
│   ├── S02_rear_end/ ...
│   ├── S03_pedestrian_near_miss/ ...
│   └── S04_degraded_footage/ ...
├── eval/                         # metric code, configs
└── src/ ...                      # application code (later)

$TRACELINE_DATA_DIR/              # not in git
├── raw/
│   ├── video/<dataset>/<id>/
│   ├── sensor/<dataset>/<id>/
│   ├── annotations/<dataset>/
│   ├── witness/<scenario>/
│   └── ground_truth/<scenario>/   # exact truth, kept separate from evidence
├── evidence_store/               # content-addressed copy used by the app (read-only)
│   └── sha256/ab/cd/<hash>
├── processed/
│   ├── frames/<evidence_id>/
│   ├── detections/<evidence_id>/<params_hash>/
│   ├── tracking/<evidence_id>/<params_hash>/
│   ├── events/<case_id>/
│   ├── sensors_normalized/<evidence_id>/
│   ├── timelines/<case_id>/
│   ├── trajectories/<case_id>/
│   └── reports/<case_id>/
├── evaluation/
│   └── runs/<run_id>/             # metrics.json, failures.json, config.json
├── quarantine/<reason>/           # files that failed validation (never auto-deleted)
├── manifests_index.json
└── validation_report.json
```

Rules:
- **Ground truth is stored apart from evidence.** The pipeline never reads `raw/ground_truth` during a processing run; only the evaluation harness does. A test asserts this.
- Derived data folders include the **parameters hash** so reruns with different settings never overwrite each other.
- Real and synthetic data live under clearly named dataset folders (`carla-0.9.x`, `synthetic-witness`, `bdd100k`, `ngsim`).

## 3. Scenario manifest (`manifest.yaml`)

```yaml
scenario_id: S01_intersection_collision
title: Signalized intersection collision (synthetic)
designation: synthetic            # synthetic | real | mixed
source:
  generator: CARLA
  version: "0.9.x"                # filled in at generation
  script: carla_script.py
  seed: 1234
  fixed_delta_seconds: 0.05
recording:
  case_clock: simulation_time_s   # t = 0 at episode start
  reference_utc: null             # CARLA has no real UTC
evidence:
  - id: EVD-VID-01
    kind: video
    path: raw/video/carla/S01/front_cam.mp4
    sha256: null                  # filled by ingest tool
    fps: 20
    clock: {type: simulation_frame, offset_s: 0.0, uncertainty_s: 0.05}
  - id: EVD-SEN-01
    kind: sensor
    path: raw/sensor/carla/S01/ego_imu_gnss.csv
    columns: {t: timestamp, ax: accel_x, ay: accel_y, az: accel_z, lat: lat, lon: lon, collision: collision}
    units: {t: s, ax: m/s^2, lat: deg}
    clock: {type: simulation_timestamp, offset_s: 0.0, uncertainty_s: 0.0}
  - id: EVD-WIT-01
    kind: statement
    path: raw/witness/S01/witness_1.txt
    synthetic: true
    author_profile: "accurate, hedged"
  - id: EVD-WIT-02
    kind: statement
    path: raw/witness/S01/witness_2.txt
    synthetic: true
    author_profile: "confident, wrong about signal"
synchronization:
  status: proven                  # proven | partial | unproven
  method: shared_simulation_clock
  checks:                          # the six checks from DATASET_COMPATIBILITY
    same_recording: pass
    shared_clock: pass
    alignment_feasible: pass
    identity_mapping: "CARLA actor_id -> VEH-A/VEH-B/VEH-EGO"
    coordinate_systems: "image, carla_world(m)"
    ground_truth_documented: "CARLA actor transforms per tick"
vehicles:
  - {id: VEH-EGO, carla_actor: 101, role: ego}
  - {id: VEH-A,   carla_actor: 102, role: other}
ground_truth:
  events: raw/ground_truth/S01/events.json
  trajectories: raw/ground_truth/S01/trajectories.json
  answer_key: scenarios/S01_intersection_collision/answer_key.yaml
known_limitations:
  - "Synthetic imagery: detector accuracy not representative of real footage"
  - "Witness statements are synthetic and written against the truth script"
expected_evaluation_tasks:
  - detection_sanity
  - tracking
  - event_extraction
  - timestamp_alignment
  - witness_claim_extraction
  - contradiction_detection
  - trajectory_error
  - traceability
```

For a real-data scenario (BDD100K, NGSIM) the manifest uses `designation: real`, lists `source.dataset`, and sets `synchronization.status` to `unproven` for any pair that fails a check.

## 4. Naming and IDs

- Evidence IDs: `EVD-<KIND>-<NN>` (`VID`, `SEN`, `WIT`, `CAL`).
- Event IDs: `EV-<6 digits>`; consistency records `CR-<6 digits>`.
- Scenarios: `S<NN>_<snake_case>`.
- Run IDs: `YYYYMMDD-HHMMSS-<git short rev>`.

## 5. Post-download validation

Implemented as a script (`tools/validate_data`), described in DATASET_ACQUISITION_PLAN §6. Outputs `validation_report.json`:

```json
{
  "run_at": "...",
  "items": [
    {"path": "...", "sha256": "...", "status": "ok|warning|failed",
     "checks": [{"name": "video_decodes", "result": "pass"}],
     "action": "none|quarantined", "reason": null}
  ],
  "scenarios": [{"scenario_id": "S01...", "status": "ready|blocked", "blocked_by": []}]
}
```

No file is deleted or silently skipped. A failing item is quarantined and its dependent scenario is marked `blocked`.

## 6. Retention and reproducibility

- Seeds, scripts, and parameters are in git, so synthetic data can be regenerated.
- The evidence store is rebuildable from `raw/`.
- Evaluation runs keep config, git revision, model names/versions, and cached model responses so numbers can be reproduced without new API spend.
