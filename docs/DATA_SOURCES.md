# DATA_SOURCES

Version 3 (replaces `archive/DATASET_RESEARCH.md`, whose detail remains valid). Research date 2026-10-30. Labels: **[V]** verified from the named official source, **[M]** measured or inspected locally, **[T]** third-party only, **[U]** unverified.

## 1. Summary table

| Source | Real/synthetic | Licence | File types | Annotations | Timestamps | Calibration | Sensor pairing | Size | Intended use | Main limitation |
|---|---|---|---|---|---|---|---|---|---|---|
| Accident-Detection-Model repo | Real images (web-sourced) | Repo: **none**; dataset declares CC BY 4.0 [V] | JPG + YOLO txt, `best.pt` | 1 class `Accident`, boxes [M] | None | None | None | Repo ~210 MB; test+valid+weights 107 MB fetched [M] | Accident-cue model and its validation split | Small, noisy, unclear image rights, possible split leakage [M] |
| NGSIM I-80 | Real, trajectories algorithm-derived from video | CC BY-SA 3.0 (trajectories), 4.0 (I-80 video) [V] | Video zips, CSV trajectories, PDF metadata | Vehicle ID per frame at 10 Hz, positions, lane, speed [V] | `Frame_ID`, `Global_Time` [V]; epoch/units in PDF [U] | Possibly in metadata PDF [U] | No vehicle sensors | Zip sizes unknown [U] | Fixed-camera (CCTV-like) tracking and trajectory sanity checks | No accidents; derived reference trajectories |
| BDD100K | Real dashcam | Research / not-for-profit (UC Regents) [V] | MP4, Scalabel JSON, info JSON | Detection (10 classes), MOT 2020 (5 Hz) [V] | Video time; info timestamps [U] | Unknown per video [V: intrinsics optional] | GPS/IMU "info" package exists (3.9 GB) [V]; per-video pairing [U] | Videos 1.8 TB total; MOT labels 115 MB; detection labels 53 MB [V] | Detector and tracker validation on real dashcam | No accidents; sensor pairing unproven |
| AI City Challenge | Real CCTV (and staged WTS incidents [T]) | Terms per track [U] | Varies | Track-specific | Track-specific | Some tracks [U] | [U] | [U] | Optional CCTV/anomaly examples | Institutional email + approval for evaluation servers [V]; not on critical path |
| CARLA | Synthetic | MIT code [V]; assets [U] | Our export (MP4/PNG, CSV, JSON) | Exact actor poses, collisions | Shared `frame` + `timestamp` per sensor [V] | Known camera parameters | Same simulation clock [V] | Install ~20 GB [V] | Fully synchronized dashcam + CCTV + IMU/GNSS + collision scenarios | **Needs NVIDIA GPU on Windows/Ubuntu [V]; not runnable on our Mac** |
| MetaDrive | Synthetic | Apache-2.0 [V] | Our export | Exact poses | Simulation clock | Known | Simulation clock | pip package [M] | Possible Mac-runnable simulator | **Offscreen camera probe failed on this Mac** (`'NoneType' object has no attribute 'set_shader'`) [M]; README claims macOS support [V] |
| Staged recording (our own) | Real, staged at toy scale | Our own | Phone MP4, sensor-app CSV, text | Hand-labelled by us | Phone clocks + visible sync flash | Measured ground points (we can calibrate) | Same session, synced by flash/clap | Small | Honest multi-camera + sensor demo without a GPU | Toy scale; GPS meaningless indoors; must be labelled "staged" |
| Synthetic witness statements | Synthetic | Our own | TXT | Answer keys | Phrases only | — | Written against a scenario's truth | Tiny | Contradiction and claim-extraction tests | Synthetic text; circularity risk |
| Generator (Python) | Synthetic | Our own | CSV/JSON (+ schematic frames) | Exact | Exact | Exact | Exact | Tiny | Engine-only testing with oracle tracks | Not valid for detector testing |

## 2. Accident-Detection-Model repository (inspected)
- Files: `runs/detect/train/weights/best.pt` and `last.pt` (22.5 MB each), `yolov8s.pt`, `data.yaml`, `runs/detect/train/args.yaml`, `results.csv` (25 epochs), `val`/`val2` plots, demo MP4s, `yolo.ipynb` [M].
- Data organization: `data/{train,valid,test}/{images,labels}` in YOLO format; counts **947 / 154 / 157 images** (train labels 957) [M]. The README's "3200+" and "1200+" figures do not match.
- Class: `Accident` only [M].
- Re-validation (MPS): valid P 0.586 / R 0.524 / mAP50 0.558; test mAP50 0.890 [M]. Source-name overlap across splits (18 test, 19 valid names also in train) suggests frames from the same videos across splits [M; not conclusive].
- Licence: **no repository licence** [V]; Roboflow dataset CC BY 4.0 [V]; underlying images gathered from YouTube, Google, Kaggle (README) with unclear rights.
- Use: model for the `accident_visual_cue` event only (MODEL_SELECTION §3). Do not redistribute the weights or images.

## 3. NGSIM (summary of verified facts)
I-80 (Emeryville, 2005-04-13): seven synchronized cameras, three 15-minute periods. Processed videos overlay vehicle IDs for cross-reference with trajectories. Trajectory attachments include `I-80-Emeryville-CA.zip`, `i-80-ProcessedVideo-0400pm-0415pm-Cam567.zip`, and `I-80_Metadata_Documentation.pdf` [V]. The frame-to-time rule and units must be read from the PDF before pairing [U].

## 4. BDD100K (summary)
Official docs: mirror `dl.cv.ethz.ch/bdd100k/data/`. Original videos are 30 Hz; MOT labels are resampled to 5 Hz; the GPS/IMU "info" package is 3.9 GB [V]. The official sites were not reachable from the research environment, so per-video info pairing must be proven by inspecting a few files [U].

## 5. Recommended demo data path without a GPU: staged recording
- **What:** toy cars (or RC cars) on a mock intersection mat, recorded by:
  - a phone mounted on or following one car as the "dashcam",
  - a phone on a tripod above or beside the intersection as the "CCTV",
  - a phone or second device logging accelerometer and gyroscope on the moving car with a sensor-logging app (for example phyphox, which exports CSV; [U] confirm app and export format),
  - a visible flash or clap at the start of every take as a **manual sync point**.
- **Witnesses:** team members who watched write genuine statements. One extra statement is **scripted** to contain a deliberate contradiction and is labelled scripted.
- **Ground truth:** hand-labelled event list and ground-plane positions, from a printed grid on the mat with known spacing. This gives a real homography, so calibrated trajectories are honest at mat scale.
- **Labelling:** `designation: staged`, toy scale. Metric speeds are reported in mat units only.
- **Detector check:** whether COCO-pretrained YOLO detects the toy cars must be tested on the first take [U]. If it does not, use larger RC cars or record with real bicycles and pedestrians in a safe, closed area (near-miss scenario only, no contact).

## 6. CARLA path (if a team member can lend an NVIDIA PC)
One run per scenario in synchronous mode: ego dashcam RGB camera, a fixed elevated "CCTV" camera, IMU, GNSS, and collision sensor on the shared simulation clock. Exports: two MP4s, sensor CSV, ground-truth JSON, manifest. All labelled synthetic.

## 7. What is not used
- Unrelated real footage paired with invented sensor logs: never.
- YouTube crash compilations: unclear rights, no paired evidence.
- MMAction2 / generic action datasets: no road-event labels.
