# EVENT_SCHEMA

Version 3 (`schema_version: "3.0"`). All evidence sources end up as `Event` records. Events are append-only, and corrections create new versions.

## 1. Four evidence categories (never merged)

| `category` | Meaning | Examples | Produced by |
|---|---|---|---|
| `direct_observation` | Recorded fact read deterministically from evidence, with no model judgement | Sensor speed at row 124; video metadata time; OCR'd on-screen CCTV clock (flagged OCR) | Sensor pipeline, metadata extraction |
| `machine_detection` | Output of a model or rule applied to evidence | YOLO box/track, accident cue, track-derived "vehicle slowing", VLM frame description | Video pipeline, frame interpreter |
| `witness_claim` | What a witness stated, with its verbatim span | "I saw the blue car turn left…" | Witness pipeline |
| `inference` | Conclusion derived from other events by a registered rule | "Possible evasive braking" | Engine inference registry |

Corroboration and contradiction are **relations between events**, stored separately (§6). They are not event categories.

## 2. Pydantic model (specification)

```python
class TimePoint(BaseModel):
    utc: datetime | None          # absolute time, only if the source clock is synchronized
    case_ms: int | None           # milliseconds on the case timeline (sync group reference clock)

class Interval(BaseModel):
    start: TimePoint
    end: TimePoint | None         # None = instantaneous or unknown end
    uncertainty_ms: int           # ± bound applied to both ends
    uncertainty_basis: Literal["frame_period","clock_offset_declared","clock_offset_unknown",
                               "sensor_sampling","witness_approximate","interpolated"]

class SourceReference(BaseModel):
    evidence_id: str
    file: str                     # original filename (display only)
    kind: Literal["video_frames","sensor_rows","statement_span","document_region","metadata"]
    frames: tuple[int,int] | None = None
    frame_times_ms: tuple[int,int] | None = None   # source-video time
    rows: tuple[int,int] | None = None
    char_span: tuple[int,int] | None = None
    thumbnail: str | None = None

class Location(BaseModel):
    frame: Literal["image","ground_plane","wgs84","schematic"]
    camera_id: str | None = None   # required for image coordinates
    x: float; y: float
    lat: float | None = None; lon: float | None = None
    uncertainty: float | None = None              # px or m, per frame
    calibration_id: str | None = None             # required for ground_plane

class Confidence(BaseModel):                      # separate dimensions, no overall score
    detection: float | None = None                # model score (machine_detection only)
    tracking: Literal["stable","fragmented","id_switch_suspected","short"] | None = None
    timestamp: Literal["high","medium","low","unsynchronized"]
    source_quality: Literal["high","medium","low"] | None = None
    extraction: Literal["valid","repaired","manual"] | None = None   # witness claims
    corroboration: Literal["none","single_source","independent_support","contested"] = "none"
    inference_support: Literal["weak","moderate","strong"] | None = None
    reasons: list[str] = []                       # e.g. "low light", "occlusion", "clock mismatch"

class Event(BaseModel):
    schema_version: Literal["3.0"]
    event_id: str
    case_id: str
    category: Literal["direct_observation","machine_detection","witness_claim","inference"]
    event_type: str                               # controlled vocabulary (§4)
    title: str                                    # short, hedged ("Possible collision")
    actor_id: str | None                          # confirmed actor only
    actor_candidates: list[ActorCandidate] = []   # unconfirmed links with reasons
    time: Interval
    source_type: Literal["video_dashcam","video_cctv","witness","sensor","vlm","engine","investigator"]
    source_id: str | None                         # evidence item (None for inferences)
    source_reference: list[SourceReference]       # ≥1 except inferences
    location: Location | None = None
    observations: dict = {}                       # measured or extracted values with units
    inference: InferenceDetail | None = None      # required iff category == "inference"
    confidence: Confidence
    provenance: Provenance                        # pipeline, model_id, params_hash, run_id, prompt_hash
    synthetic: bool
    review_status: Literal["unreviewed","reviewed","disputed"] = "unreviewed"
    version: int = 1
    supersedes: str | None = None

class InferenceDetail(BaseModel):
    rule_id: str
    premises: list[str]                           # event IDs; no inference premises
    alternatives: list[str]                       # mandatory, non-empty
    statement: str                                # "may", "possible"
```

Validators enforce:
- `inference` ⇔ `category == "inference"`; inference premises exist and are not inferences;
- non-inference events have at least one `source_reference`, and those references exist;
- witness `char_span` matches the stored statement text verbatim;
- `Location.frame == "ground_plane"` requires a calibration;
- `time.start.utc` is only set when the source's clock is synchronized;
- `synthetic` copies the evidence item's flag.

## 3. Examples

**Sensor (direct observation)**
```json
{
  "schema_version": "3.0", "event_id": "evt_0042", "case_id": "case_001",
  "category": "direct_observation", "event_type": "vehicle_deceleration",
  "title": "Hard deceleration recorded", "actor_id": "vehicle_A",
  "time": {"start": {"utc": "2026-10-30T10:32:14.000Z", "case_ms": 14000},
           "end": {"utc": "2026-10-30T10:32:14.800Z", "case_ms": 14800},
           "uncertainty_ms": 50, "uncertainty_basis": "sensor_sampling"},
  "source_type": "sensor", "source_id": "ev_sensor_001",
  "source_reference": [{"evidence_id": "ev_sensor_001", "file": "sensor.csv", "kind": "sensor_rows", "rows": [124, 132]}],
  "observations": {"longitudinal_accel_mps2_min": -5.2},
  "confidence": {"timestamp": "high", "source_quality": "high", "corroboration": "none"},
  "provenance": {"pipeline": "sensors", "rule_id": "SEN-BRAKE-01", "params_hash": "…"},
  "synthetic": true
}
```

**Video (machine detection)**
```json
{
  "event_id": "evt_0031", "category": "machine_detection", "event_type": "vehicle_slowing",
  "title": "Track 7 appears to slow", "actor_id": null,
  "actor_candidates": [{"actor_id": "vehicle_A", "basis": ["only white car in view", "ego dashcam ahead"], "status": "candidate"}],
  "time": {"start": {"utc": null, "case_ms": 13900}, "end": {"utc": null, "case_ms": 14600},
           "uncertainty_ms": 200, "uncertainty_basis": "frame_period"},
  "source_type": "video_cctv", "source_id": "ev_cctv_02",
  "source_reference": [{"evidence_id": "ev_cctv_02", "file": "cctv_02.mp4", "kind": "video_frames",
                        "frames": [417, 438], "frame_times_ms": [13900, 14600], "thumbnail": "thumbs/ev_cctv_02/000417.jpg"}],
  "location": {"frame": "image", "camera_id": "cam_cctv_02", "x": 612, "y": 410, "uncertainty": 6},
  "observations": {"track_id": 7, "class": "car", "bbox_bottom_speed_px_s": [182, 41]},
  "confidence": {"detection": 0.88, "tracking": "stable", "timestamp": "medium", "source_quality": "medium",
                 "reasons": ["CCTV offset declared by investigator ±200 ms"]},
  "provenance": {"pipeline": "video", "model_id": "ultralytics/yolo26s@8.4.193", "tracker": "bytetrack", "rule_id": "MOT-SLOW-01"},
  "synthetic": true
}
```

**Witness claim**
```json
{
  "event_id": "evt_0071", "category": "witness_claim", "event_type": "vehicle_turned",
  "title": "Witness A reports a left turn",
  "actor_candidates": [{"actor_id": "vehicle_A", "basis": ["'blue car' matches VLM colour for track 7"], "status": "candidate"}],
  "time": {"start": {"utc": null, "case_ms": null}, "end": null, "uncertainty_ms": 0,
           "uncertainty_basis": "witness_approximate"},
  "observations": {"subject": "blue car", "action": "turn", "direction": "left",
                   "time_description": "just before the collision",
                   "certainty": "reported_as_direct_observation", "anchor": "collision"},
  "source_type": "witness", "source_id": "ev_stmt_A",
  "source_reference": [{"evidence_id": "ev_stmt_A", "file": "witness_A.txt", "kind": "statement_span", "char_span": [0, 55]}],
  "confidence": {"timestamp": "low", "extraction": "valid"},
  "provenance": {"pipeline": "witness", "model_id": "featherless:Qwen/Qwen3-14B", "prompt_hash": "…"},
  "synthetic": true
}
```
The approximate time stays **un-placed** (`case_ms: null`) until the engine resolves its anchor ("the collision") to an event in the same sync group. It then becomes a wide interval, never an exact timestamp.

**Inference**
```json
{
  "event_id": "evt_0090", "category": "inference", "event_type": "possible_evasive_action",
  "title": "Possible evasive braking (not established)", "actor_id": "vehicle_A",
  "inference": {"rule_id": "INF-EVASIVE-01", "premises": ["evt_0031", "evt_0042"],
                "alternatives": ["braking for the signal", "braking for an unrelated hazard"],
                "statement": "Vehicle A may have braked to avoid Vehicle B."},
  "source_type": "engine", "source_id": null, "source_reference": [],
  "confidence": {"timestamp": "medium", "inference_support": "moderate"}
}
```

## 4. Event type vocabulary (v3)

- **Video (machine_detection):** `vehicle_enters_scene`, `vehicle_approaches_intersection`, `vehicle_direction_change`, `vehicle_slowing`, `vehicle_stopped`, `vehicle_accelerating`, `vehicle_lane_change`, `vehicle_leaves_scene`, `pedestrian_enters_road`, `vehicle_approaches_pedestrian`, `possible_near_miss`, `possible_collision`, `accident_visual_cue`, `track_gap`, `occlusion`.
- **VLM (machine_detection):** `scene_context` (signal state, weather, lighting, visible damage, vehicle colour/type).
- **Sensor (direct_observation):** `vehicle_deceleration`, `acceleration_spike`, `heading_change`, `stop`, `gps_movement_pattern`, `collision_flag`, `sensor_gap`.
- **Witness (witness_claim):** `vehicle_turned`, `vehicle_went_straight`, `vehicle_braked`, `vehicle_speed_claim`, `vehicle_stopped_claim`, `signal_state_claim`, `collision_claim`, `pedestrian_claim`, `position_claim`.
- **Inference:** registered rules only.
- **Investigator:** `manual_annotation`, `manual_sync_point` (category `direct_observation` with `source_type: investigator`).

## 5. Time representation
- Internally: `case_ms` integer milliseconds on the sync group's reference clock, plus optional UTC.
- Source times are kept in `source_reference.frame_times_ms` or row timestamps.
- Video frame → time uses PTS (variable frame rate safe).
- An unsynchronized source gets `case_ms` within its own group only, and the UI shows it in a separate lane.

## 6. Relations (separate table)
`event_relation(relation_id, case_id, scenario_id, a_event, b_event, relation ∈ {supports, consistent_with, contradicts, insufficient, same_physical_event_candidate}, rule_id, basis, independence {independent: bool, reason}, explanation_template, explanation_llm?)`.

Two observations from the same evidence item, or one derived from another, are never "independent support".

## 7. Incident summary record (per event or cluster)
`event_summary(event_id, scenario_id, observations[], detections[], witness_claims[], sensor_observations[], inferences[], involved_actors[], evidence_refs[], uncertainty[], open_questions[], status, generated_by, validated)`. It is generated once at analysis time and read by the UI (ARCHITECTURE §7).
