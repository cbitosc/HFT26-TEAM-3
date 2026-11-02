# Phase 14: scenario evaluation (SYNTHETIC)

Script: `backend/scripts/eval_scenarios.py` · raw results: `eval_oracle.json`, `eval_model.json`.
All four scenarios come from a stylized kinematic world (`backend/scenarios/world.py`). None of this measures performance on real footage.

## Oracle path (boxes from the world model; measures the reconstruction logic, not a detector)

| Scenario | Expected rule outcomes (fixed before running) | Result |
|---|---|---|
| A intersection collision | CON-ACTION-01; COR-BRAKE-01, COR-COLL-01, COR-MANEUVER-01; untestable-claim gap | all present, nothing else |
| B rear-end | no contradiction; COR-COLL-01; untestable-claim gap | all present; **extra** COR-BRAKE-01 |
| C pedestrian near miss | CON-COLL-CLAIM-01 (marginal), no collision candidate | all present; **extra** COR-BRAKE-01 |
| D incomplete evidence | video gap, sensor gap, no-calibration gap; no confident findings | all gaps present; **extra** COR-MANEUVER-01 |

The three "extra" findings were not in the expectations I wrote down beforehand. Reviewed by hand, each is legitimate: in B and C the car really brakes (sensor and camera agree),
and in D witness 1 ("went straight on") does agree with the camera track. The expectations were incomplete, not the engine wrong; the table keeps them as an honest record.
Scenario D produced **no** collision candidate at all (the impact falls in the dropped-frame interval and the IMU gap), which is the intended "do not guess" outcome.

Timing error against exact ground truth (n = 1 contact or braking event per scenario, so these are examples, not statistics):

| Measure | A | B | C |
|---|---|---|---|
| Video collision candidate vs true contact | 220 ms | 240 ms | none (no contact) |
| Sensor collision flag vs true contact | 30 ms | 10 ms | none |
| Sensor hard-braking onset vs truth | 30 ms | 0 ms | 30 ms |

The video figure is dominated by the 5 fps sampling (200 ms) and by comparing image-box overlap with a footprint overlap.
Ground-plane position error (CCTV, calibrated): median 0.0 m, p95 ≤ 0.17 m, max 0.9-1.75 m (A: n=73, B: n=64, C: n=86 track points).
The maximum occurs where a vehicle is clipped by the frame edge. Error is against the bottom-centre of the true footprint, which is the anchor the pipeline uses; the world is perfectly flat and the
calibration points are exact, so this is a best case.

## Model path (real detector on the rendered frames), scenario A only

`yolo26s` produced **0 detections** on the stylized top-down CCTV render and 0 on the dashcam render, so there were 0 tracks and no video-derived findings;
only sensor-derived events survive (collision flag 30 ms, braking 30 ms). The renders are not photographic, so this shows that these synthetic videos cannot stand in for real footage when judging the detector,
and nothing about detector accuracy on real footage (BDD100K was not available; that measurement remains outstanding).

## Not covered
Real footage, real witness language (10 synthetic statements checked earlier), the LLM claim-extraction path inside this pipeline (claims here are entered manually), and any comparison with other systems.
