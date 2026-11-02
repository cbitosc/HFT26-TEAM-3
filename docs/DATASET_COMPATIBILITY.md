# DATASET_COMPATIBILITY

Version 3. Classes: **Direct**, **Partial**, **Needs processing**, **No**, **Unverified**.

## 1. Capability matrix

| Capability | Accident repo | NGSIM | BDD100K | AI City | CARLA | Staged recording | Generator |
|---|---|---|---|---|---|---|---|
| Video analysis | Partial (stills, 2 demo MP4s) | Partial (fixed freeway cams) | Direct (dashcam) | Unverified | Direct (rendered) | Direct (phone video) | Partial (schematic frames) |
| Vehicle detection eval | No (single class) | Needs processing (no image boxes) | **Direct** | Unverified | Needs processing | Needs processing (we label) | No |
| Accident-cue eval | **Direct** (valid split) | No | No | Partial / Unverified | Needs processing | Needs processing | No |
| Tracking eval | No | Needs processing (projection) | **Direct** (MOT 5 Hz) | Unverified | Direct | Needs processing (we label) | Direct (oracle) |
| Ground-truth trajectories | No | Partial (derived) | No (ego only, unverified) | Unverified | **Direct** | Partial (hand-labelled on grid) | Direct |
| Sensor processing | No | No | Partial / Unverified | Unverified | **Direct** | **Direct** (real phone IMU) | Direct |
| Timestamp sync | No | Partial | Unverified | Unverified | **Direct** | **Direct** via flash sync point | Direct |
| Witness contradiction | No | No | No | Partial (captions ≠ testimony) | Needs processing (synthetic text) | **Direct** (real + scripted statements) | Needs processing |
| Accident reconstruction | No | No | No | Partial / Unverified | **Direct** | Direct (toy scale) | Direct (logic only) |
| Trajectory eval | No | Partial (calibration unverified) | No | Unverified | Direct | Partial (mat-scale) | Direct |
| Multi-camera | No | Partial (7 cams) | No | Unverified | Direct | **Direct** (2 phones) | Direct |

## 2. Pairing rules (applied to every demo case manifest)

A set of files may be treated as one incident **only if all six checks pass**:
1. Same recording session or simulation run (IDs recorded).
2. A shared clock or a documented synchronization basis (simulation clock, sync point, declared offset).
3. Alignable timestamps with a stated uncertainty.
4. Actor identity mapping method recorded (simulator IDs, hand labels, candidate links).
5. Coordinate systems known (image, mat grid, world, WGS84).
6. Ground truth documented, or explicitly absent.

Any failing check → the files are separate evidence, in separate timeline lanes, and are never used for corroboration.

## 3. Allowed and forbidden combinations

| Combination | Verdict |
|---|---|
| Staged take: dashcam phone + CCTV phone + phone IMU CSV + statements from the same take | **Allowed**, synced by the flash sync point (manual sync) |
| CARLA run: ego camera + fixed camera + IMU/GNSS/collision + ground truth | **Allowed** (simulation clock) |
| Scripted witness statement written for a staged or CARLA scenario | Allowed, labelled scripted/synthetic |
| NGSIM processed video + NGSIM trajectories of the same site/period/cameras | Allowed only after the metadata PDF confirms the frame/time rule |
| BDD100K video + its labels (same video name) | Allowed for model evaluation |
| BDD100K video + BDD100K info GPS/IMU | **Unverified: do not use** until pairing is proven |
| Accident repo images + anything else | Model evaluation only |
| Any real video + generated sensor CSV "to match it" | **Forbidden** (fabricated corroboration) |
| Any footage + sensor data from a different recording | **Forbidden** |

## 4. What each source validates
| Metric | Source |
|---|---|
| Detection mAP on real dashcam | BDD100K |
| Accident-cue P/R | Accident repo validation split (+ our staged takes, hand-labelled) |
| Tracking IDF1/HOTA | BDD100K MOT val; CARLA; staged takes (hand-labelled subset) |
| Event extraction, ordering, timestamp error, contradiction detection | CARLA and/or staged scenarios with answer keys; generator for engine-only tests |
| Trajectory error | CARLA (metric); staged takes (mat grid); NGSIM if the PDF permits |
