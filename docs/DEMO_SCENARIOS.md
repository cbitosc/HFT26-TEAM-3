# DEMO_SCENARIOS

Version 3. Four scenarios. Each can be produced by the **staged path** (two phones + a phone IMU logger, toy scale, real recordings) or the **CARLA path** (borrowed NVIDIA PC, fully synthetic). Engine-only variants come from the Python generator. Every file is labelled `staged`, `synthetic`, or `scripted`.

Every scenario also carries the same "must not conclude" list:
- fault, guilt, or liability;
- which witness is truthful;
- exact metric positions outside the calibrated grid or simulator;
- a collision from the accident cue or box overlap alone.

## Manifest template
```yaml
scenario_id: A_intersection_collision
designation: staged            # staged | synthetic | real
generator: phones_v1           # or carla-0.9.x / generator-v1
evidence:
  - {id: dashcam_01, kind: dashcam, file: raw/staged/A/dashcam.mp4, sha256: null}
  - {id: cctv_02, kind: cctv, file: raw/staged/A/cctv.mp4, sha256: null, calibration: grid_A.json}
  - {id: sensor_01, kind: sensor_csv, file: raw/staged/A/imu.csv, actor: vehicle_A, clock: device_local}
  - {id: witness_A, kind: witness_text, file: raw/staged/A/witness_A.txt, author: observer, scripted: false}
  - {id: witness_B, kind: witness_text, file: raw/staged/A/witness_B.txt, author: team, scripted: true}
sync:
  method: manual_sync_point     # flash visible in both videos + tap spike in IMU
  points: [{dashcam_01: 1.267s, cctv_02: 0.933s, sensor_01: 3.120s}]
  uncertainty_ms: 67            # one frame at 15 fps (re-measured per take)
actors: [{id: vehicle_A, label: blue car}, {id: vehicle_B, label: white car}]
ground_truth: {events: ground_truth/A/events.json, positions: ground_truth/A/grid_positions.json}
expected_findings: ground_truth/A/answer_key.yaml
known_limitations: ["toy scale", "GPS not meaningful indoors", "one scripted statement"]
```

## Scenario A: Intersection collision
- **Story:** Vehicles A and B approach an intersection. A goes **straight** (truth). B enters from the right. Contact in the intersection.
- **Evidence:** dashcam on B, CCTV overhead, IMU on A, Witness A (scripted: "the blue car turned left just before the crash"), Witness B (observer: "the blue car kept going straight").
- **Expected sequence:** A enters view → B approaches from the right → A enters the intersection → contact interval → both stop.
- **Expected findings:**
  - Contradiction: Witness A vs Witness B on A's maneuver (CON-ACTION-01), with the CCTV track of A labelled "consistent with straight movement (image-space, CCTV)".
  - Corroboration: IMU acceleration spike + CCTV track interaction + accident cue (if it fires) in the same interval. The IMU is an independent source; the accident cue and the track come from the same video and do not count as independent of each other.
- **Trajectories:** grid-calibrated ground plane from CCTV; image space from dashcam.
- **Must not conclude:** that A or B caused the collision.

## Scenario B: Rear-end collision
- **Story:** Lead vehicle L brakes sharply; follower F approaches and contacts L at low speed.
- **Evidence:** dashcam on F, CCTV side view, IMU on L, one witness ("the front car braked suddenly").
- **Expected findings:** `vehicle_deceleration` (IMU on L) corroborates `vehicle_slowing` (dashcam track of L) and the witness claim. The impact time is given as an interval if the dashcam frame rate and sync uncertainty do not resolve it.
- **Must not conclude:** following distance as a legal finding.

## Scenario C: Pedestrian near miss
- **Story:** A pedestrian figure steps into the road; the vehicle slows and stops short. No contact.
- **Evidence:** CCTV, dashcam, IMU on the vehicle; Witness 1 "the car did not stop", Witness 2 "the car stopped just in time".
- **Expected findings:** witness contradiction; IMU deceleration + track stop **consistent with** Witness 2; `possible_near_miss` from proximity in image space with the note "image proximity is not physical distance" (unless grid-calibrated).
- **Pedestrian detection:** a toy figure may not be detected as `person`, so staged takes may use a team member walking in a safe, closed space with a slowly pushed cart, never a moving car near a person. CARLA uses walker actors.
- **Must not conclude:** that the driver or pedestrian was negligent.

## Scenario D: Incomplete evidence
- **Story:** Scenario A or B with degradation:
  - dim lighting or a blur filter applied during recording,
  - an occluding object passing the CCTV,
  - a 2-second segment cut from the dashcam,
  - IMU logging paused for 1 second,
  - witness times given as "around six".
- **Expected findings:** evidence-quality warnings; `track_gap` and `occlusion` events; a timeline gap marker; an IMU `sensor_gap`; witness times left un-placed or wide; and an **alternative scenario** for an ambiguous identity (track 4 vs track 6 = vehicle A). Recommendations: another camera angle, the full dashcam file, confirmation of the device clock.
- **Must not conclude:** an order of events inside the missing interval.

## Answer keys
`answer_key.yaml` per scenario lists the expected events (type, actor, interval), contradictions, corroborations (with independence), gaps, and the negative assertions. The processing pipeline never reads it.
