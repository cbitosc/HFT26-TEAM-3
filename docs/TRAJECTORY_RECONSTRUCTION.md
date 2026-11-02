# TRAJECTORY_RECONSTRUCTION

Version 2. Rule zero: **pixel coordinates are never converted to metres without a valid calibration or an equivalent physical reference.**

## 1. Trajectory levels

| Level | Coordinate frame | Requires | Use |
|---|---|---|---|
| `image_space` | Image pixels of one camera | Tracks | Always available; schematic or image-space reconstruction video |
| `calibrated_ground` | Ground plane (metres) of a camera | A valid homography (≥ 4 non-collinear ground points with known positions) or full calibration, with reprojection error recorded; planar road assumption stated | Metric top-down reconstruction within the calibrated region |
| `gps` | WGS84 → local ENU | GPS records with known accuracy | Vehicle-level path |
| `sensor_dead_reckoning` | Local frame from speed + heading | Speed and heading; short horizon | Bridging short GPS gaps, with drift warning |
| `simulator_truth` | Simulator world frame | Synthetic scenario ground truth | Evaluation only; never shown as a case finding |

The summary and the reconstruction video always display the level and frame.

## 2. Image-space trajectories
- Point per track sample: box bottom-centre (ground-contact proxy), with box-jitter-based pixel uncertainty.
- Gaps remain gaps. Optional interpolation creates `interpolated` segments that are rendered differently and never counted as observations.
- Dashcam image trajectories are relative to the moving camera. They are labelled "relative to dashcam view".

## 3. Calibrated ground-plane trajectories
- **Calibration input:** investigator-provided correspondences (image point ↔ ground point measured on site or from a scaled plan), or simulator camera parameters for synthetic scenarios.
- **Validity checks before use:** point count and spread; reprojection error below threshold; the transform is applied only inside the region spanned by the calibration points (`valid_region`). Outside it, points are marked `out_of_calibrated_region` and not projected.
- **Projection:** OpenCV homography on the ground-contact point.
- **Uncertainty:** combine pixel uncertainty (box jitter) propagated through the homography's local Jacobian with the calibration residual. Uncertainty grows with distance from the camera; this is shown in the output, not hidden.
- **Smoothing (optional):** constant-velocity Kalman filter/smoother with recorded parameters. Raw projected points are kept alongside the smoothed path.

## 4. GPS and sensor trajectories
- WGS84 → ENU (PyProj/GeographicLib) around the case origin.
- Uncertainty from reported accuracy; unknown when not reported (stated as unknown).
- Dead reckoning only across short gaps, with linearly growing bounds and a drift warning.

## 5. Combining sources for one entity
v1 does **not** fuse sources into a single estimate. For each entity and time segment it selects the source by a fixed preference (simulator truth is evaluation only; then calibrated ground or GPS by smaller uncertainty; then image space) and **shows disagreements** between sources as correlation records (CON-LOC-01 or supporting). Fusion (e.g., a multi-sensor filter) is a later option once the per-source behaviour is measured.

## 6. Road geometry
Optional scene geometry (lanes, stop lines, intersection polygon) comes from the simulator map (synthetic), an investigator drawing on a scaled plan, or a survey. It is used for zone-based maneuver classes and for rendering. Its source and accuracy note are stored. Without geometry, the top-down video is schematic.

## 7. Candidate collision region
Computed only when:
1. two confirmed entities have trajectories in the **same metric frame** (calibrated ground, GPS/ENU, or a registered transform between them), and
2. a candidate collision time interval exists from video (`potential_collision_interval`) and/or sensors (`collision_flag`, IMU spike) in the same sync group.

The region is the overlap of both entities' position uncertainty regions during that interval, expanded by vehicle footprints when dimensions are known (vehicle dimensions are flagged as assumed when class-default sizes are used). The status is always `candidate`. Without a shared metric frame, the output is "collision location not determinable from available evidence".

## 8. Point record
```json
{"t": {"earliest": 12.30, "latest": 12.35},
 "pos": [14.2, -3.1], "cov": [[0.36,0],[0,0.81]],
 "frame": "calibrated_ground:CAM-02",
 "support": "observed",          // observed | interpolated | inferred | unknown
 "refs": ["DET-88123", "TRK-3"]}
```

## 9. Rendering contract (used by the reconstruction video)
- `observed` → solid line; `interpolated` or `inferred` → dashed line; uncertainty → shaded area; `unknown` → gap marker with interval label.
- Image-space or schematic trajectories carry a "not to scale" label.

## 10. Evaluation
Position error and RMSE per level against simulator truth (synthetic) and, if verified in Phase 3, NGSIM reference trajectories. Also interval coverage: the fraction of true positions inside the stated uncertainty. Results are reported per level; image-space levels are not compared in metres.
