# DATASET_RESEARCH

Research date: 2026-10-30. Method: read official dataset pages, official repository documentation, and the data portal's public metadata API. **No dataset files were downloaded.**

Evidence labels used throughout:
- **[V]** verified from an official source read during this research (source named).
- **[T]** reported by a third-party page only; treat as unconfirmed.
- **[U]** not verified. Must be checked before relying on it (a verification step is named in DATASET_ACQUISITION_PLAN).

Headline findings:
1. **None of the four sources contains real accident footage paired with sensor logs and witness statements.** That combination does not exist publicly in a form we can verify; witness statements must be synthetic.
2. **CARLA is the only source that gives synchronized video, IMU, GNSS, collision events, and ground truth**, but it requires an NVIDIA-GPU Windows/Ubuntu machine. The development Mac (Apple M5, 16 GB) cannot run it.
3. **NGSIM is useful for tracking and trajectory validation, not for accidents.** It has no sensor logs.
4. **BDD100K is useful for dashcam detection and tracking validation.** Pairing each video with its GPS/IMU record is plausible but unverified.
5. **AI City access is slow and restricted** (institutional email, approval wait), so it is optional.

---

## A. NGSIM (Next Generation Simulation)

**Sources read:** data.transportation.gov catalog entries `8ect-6jqj` (trajectories), `2577-gpny` (I-80 videos), `i5zb-xe34` (overview), via the portal's public metadata API; catalog.data.gov overview page.

### What it is [V]
Vehicle trajectory data collected by FHWA on southbound US-101 and Lankershim Blvd (Los Angeles), eastbound I-80 (Emeryville), and Peachtree Street (Atlanta). The portal states the data was "collected through a network of synchronized digital video cameras", and a custom program (NGVIDEO) **transcribed trajectories from the video**. Position is given "every one-tenth of a second" (10 Hz).

### Videos [V]
- I-80 video: collected April 13, 2005; 45 minutes in three 15-minute periods (4:00–4:15 pm, 5:00–5:15 pm, 5:15–5:30 pm). Raw and processed video for each of **seven cameras** (numbered south to north). Processed videos overlay vehicle ID numbers and "can be used for cross referencing of the textual vehicle trajectory data … with the corresponding video."
- Separate video entries exist for US-101, Lankershim, and Peachtree.
- The trajectory dataset's attachments include `i-80-ProcessedVideo-0400pm-0415pm-Cam567.zip`, `I-80-Emeryville-CA.zip`, `US-101-LosAngeles-CA.zip`, and PDF metadata documentation for I-80, US-101, and Lankershim. [V: attachment list from the API]
- Video resolution, frame rate, codec, and file sizes: **[U]**.

### Trajectory fields [V]
`Vehicle_ID, Frame_ID, Total_Frames, Global_Time, Local_X, Local_Y, Global_X, Global_Y, v_length, v_Width, v_Class, v_Vel, v_Acc, Lane_ID, O_Zone, D_Zone, Int_ID, Section_ID, Direction, Movement, Preceding, Following, Space_Headway, Time_Headway, Location`.
- Units, `Global_Time` epoch/units, and coordinate conventions: documented in the metadata PDFs; **[U]** until read. A third-party article suggests milliseconds since 1970 and feet for coordinates **[T]**.
- Declared update frequency "R/PT0.1S" (10 Hz) [V: metadata].

### Licensing and access [V]
Public. Trajectory and overview entries: Creative Commons Attribution-ShareAlike **3.0**. I-80 video entry: CC BY-SA **4.0**. Share-alike means derivative datasets we publish should carry compatible attribution/licensing. Contact: data.itsjpo@dot.gov. No registration needed.

### Limits relevant to us
- **No accident labels.** The data is normal freeway and arterial traffic. Do not describe any NGSIM clip as an accident. [V by absence in descriptions; confirm in metadata PDFs]
- **Trajectories are algorithm-derived from video**, not independent ground-truth measurements. They are "reference" data with their own error. The size of that error is **[U]** (the literature reports noise in NGSIM acceleration/speed; confirm before relying).
- **No vehicle-mounted sensors.** `v_Vel` and `v_Acc` come from the trajectory processing, so they are not an independent sensor record.
- Camera calibration (needed to project image pixels to road coordinates for image-space evaluation): **[U]**; may be in the metadata PDFs.
- Mapping from each video frame to `Frame_ID`/`Global_Time`: implied by cross-referencing language, exact rule **[U]**.

### Suitability
Good for: tracking and trajectory-reconstruction sanity checks with ID-overlaid videos; extracting derived events (lane changes from `Lane_ID`, hard braking from `v_Acc`) as *derived* ground truth. Poor for: accident reasoning, dashcam realism, sensor fusion, witness testing.

---

## B. BDD100K

**Sources read:** official repository README and `doc/source/{download,format,license}.rst` (GitHub, `bdd100k/bdd100k`). Official websites (`doc.bdd100k.com`, `bdd-data.berkeley.edu`, `bdd100k.com`) were **not reachable** from the research environment, so statements rely on the repository docs and flagged third-party pages.

### What it is [V]
"100K videos", each about 40 seconds, over 1,000 hours, 100M+ frames, with "GPS/IMU data … for trajectory information." Ten tasks, including road object detection, multi-object tracking, lane and drivable-area labels.

### Video and frame details
- Original video frame rate 30 Hz [V: the MOT docs say videos are "resampled to 5Hz from 30Hz"].
- Resolution 720p [T: third-party]. **[U]** officially.

### Downloads [V: download.rst]
Documented source: `https://dl.cv.ethz.ch/bdd100k/data/` (the license text refers to `bdd-data.berkeley.edu`; a third-party page says sign-in and license acceptance are needed [T]).
| Package | Size | Notes |
|---|---|---|
| 100K videos | 1.8 TB | Also offered as 100 parts and as a torrent; per-part size **[U]** |
| Info (GPS/IMU) | 3.9 GB | "recorded along with the videos" |
| 100K images | 5.3 GB | Frame at the 10th second of each video |
| MOT 2020 labels | 115 MB | Box-tracking labels; train/val; **videos resampled to 5 Hz**; same object has same ID within a video |
| MOT 2020 images | **[U]** size | Frames for tracking train/val/test |
| Detection 2020 labels | 53 MB (val/test) | Additional QC |
| Other labels | 107 MB (2018 detection) to hundreds of MB | Drivable, lane, segmentation |

### Labels [V: format.rst]
Scalabel JSON format. Detection: 10 classes (pedestrian, rider, car, truck, bus, train, motorcycle, bicycle, traffic light, traffic sign). Tracking and instance segmentation: first 8 classes. `category_id` starts at 1.

### GPS/IMU [partly V]
Exists as a separate 3.9 GB "Info" package [V]. Per-video file naming, field list (latitude/longitude/speed/accelerometer/gyro/etc.), sampling rate, timestamps, and whether the clock relates to video time: **[U]**. A pairing between a specific video and its info record must be proven by inspecting the files before any claim of synchronization.

### License [V: license.rst]
Code: BSD-3-Clause. **Data and labels:** UC Regents license permitting use, copying, modification, distribution "for educational, research, and not-for-profit purposes, without fee"; commercial use only for BDD/BAIR Commons members. A hackathon project fits "educational / research / not-for-profit"; **commercial use does not**. Keep attribution and the license text with any redistributed subset.

### Limits relevant to us
- No accident labels. Some clips may contain incidents, but they are not labelled; do not assume.
- No ground-truth world trajectories for other vehicles (only ego GPS/IMU).
- MOT labels are at 5 Hz on a resampled subset, which differs from the 30 Hz raw video; use the 5 Hz image sequences for tracking evaluation, or resample consistently.
- Sensor-to-video clock alignment unknown **[U]**.

### Suitability
Good for: real dashcam domain validation of detection (mAP) and tracking (IDF1/HOTA), weather/night robustness, video decoding tests. Possibly good for ego-motion plausibility checks if info files pair correctly. Not for accidents, multi-vehicle trajectory truth, or witness testing.

---

## C. AI City Challenge

**Sources read:** `aicitychallenge.org/ai-city-challenge-dataset-access/` (official), 2021 tracks page, 2021 data-access page, 2024 Track 2 page (password protected), and a web search for the WTS dataset (third-party summaries).

### Access [V]
- "AI City Challenge datasets are now available without requiring a data access request form," for the datasets listed on the access page; datasets not listed are no longer accessible. (The 2021 data-access page separately mentions an online request form for past challenges since Jan 2023; the two statements are not fully consistent: **[U]** which applies per dataset.)
- Evaluation-server registration requires an **institutional or non-commercial email**; personal providers are not approved; after registering, teams email the organizers for approval, "Allow 2–3 business days." The team's listed emails are Gmail addresses, so evaluation-server access may be blocked.
- Contact: aicitychallenges@gmail.com.

### Datasets listed [V]
2025/2024 Track 1 multi-camera 3D perception; 2025/2024 Track 2 Traffic Safety Description and Analysis; 2025 Track 3 warehouse; 2025/2024 Track 4 fish-eye road object detection; 2024 Track 3 naturalistic driving action recognition; 2023 Track 2 tracked-vehicle retrieval by language; 2023 Track 4 retail checkout; 2022 Track 1 city-scale multi-camera vehicle tracking; 2021 Track 1 vehicle counting; 2021 Track 2 vehicle re-ID; 2021 Track 4 traffic anomaly detection.

### Most relevant to us
- **2021 Track 4 – Traffic Anomaly Detection** [V: covers "car crashes and stalled vehicles", from intersection and highway cameras]. Video count, duration, annotation format, how anomaly start time is labelled: **[U]** (page defers to access instructions).
- **2024/2025 Track 2 – Traffic Safety Description and Analysis**, based on the Woven Traffic Safety (WTS) dataset [T]: staged pedestrian–vehicle incidents with multiple views and detailed captions, "over 1.2k video events" [T]. Camera setup and calibration: **[U]**. Captions are annotator descriptions, not witness statements. The 2024 Track 2 page was password protected.
- **2022 Track 1 – multi-camera vehicle tracking**: calibration and synchronization **[U]**.

### License [U]
No usage terms were stated on the pages read. Treat as research-only until read from each track's own terms.

### Suitability
Potentially valuable (staged incidents, multi-view, captions) but **access is uncertain, slow, and unverified**. Not on the critical path.

---

## D. CARLA

**Sources read:** CARLA sensor reference, synchrony/time-step docs, quick-start page (`carla.readthedocs.io`), and the GitHub repository API.

### What it is [V]
Open-source driving simulator. Repository license: MIT. Latest GitHub release found: **0.9.16** (published 2025-09-16). The quick-start page found describes 0.9.15. Asset/map content licenses: **[U]**, check before redistributing rendered content.

### Sensors relevant to us [V: sensor reference]
- RGB camera; depth; semantic and instance segmentation cameras (instance segmentation: tag + instance ID).
- **GNSS** (latitude, longitude, altitude).
- **IMU** (accelerometer, gyroscope, compass).
- **Collision detector** (event per collision).
- Lane invasion, obstacle detector, radar, LiDAR, optical flow, and others.
- Every measurement carries `frame` (int), `timestamp` (simulation seconds since episode start), and the sensor's world `transform` [V].

### Synchronization [V: synchrony docs]
- In **synchronous mode** the server waits for the client's `world.tick()`; use a **fixed time step** (e.g., 0.05 s = 20 steps/s). Camera data can arrive "a couple of frames late", so sensor data should be collected via queues matched to the tick/frame.
- Determinism requires synchronous mode, fixed step, world reload per run, and a seeded Traffic Manager.
- `sensor_tick` sets the capture interval per sensor.

### Ground truth [V in principle / U for specifics]
Actors' world transforms and velocities are available through the API each tick, and the instance-segmentation camera supports object identities. Exact export of 2D boxes with IDs and the pedestrian behavior APIs: standard CARLA capabilities **[U]**, to be confirmed in a one-scenario prototype.

### Export [U]
Not a built-in dataset format. We define our own export (frames as images; JSON/CSV for sensors; ground-truth JSON), and optionally the CARLA recorder for replay. This is custom code.

### Hardware [V: quick-start page]
"Dedicated GPU equivalent to NVIDIA 2070 or better with at least 8 GB VRAM"; ~20 GB disk; **Windows 10/11 and Ubuntu 20.04/22.04; macOS is not listed.** Python 3.7–3.12 for the client. Ports 2000–2001.

**The development Mac is an Apple M5 with 16 GB memory, which is not a supported CARLA target.** Options are in RISKS_AND_LIMITATIONS (teammate GPU PC, rented cloud GPU, or a fallback simulator).

### Suitability
The only candidate for synchronized video + sensors + collision events + exact truth, and for engineering the four evaluation scenarios. **All CARLA output is synthetic and must be labelled so.** Detection metrics on CARLA do not represent real-world performance (domain gap).

---

## E. Other sources noted (not investigated further)

- **CCD (Car Crash Dataset):** 1,500 five-second YouTube-sourced crash clips (10 fps) plus 3,000 normal clips; repo MIT, videos' own rights unclear; no sensors or statements. Possible auxiliary real-crash visuals for demo only, not for evaluation of fusion.
- Other public dashcam crash sets may exist; not verified here.

---

## F. Summary table

| Source | Real or synthetic | Sensors | Accidents | Access friction | Role |
|---|---|---|---|---|---|
| NGSIM | Real, algorithm-derived trajectories | None | No | Low | Tracking/trajectory validation |
| BDD100K | Real | GPS/IMU (pairing unverified) | No | Medium (large downloads, license) | Detection/tracking validation, dashcam realism |
| AI City | Real (and staged) | Unverified | Some (anomaly/staged) | High / uncertain | Optional |
| CARLA | Synthetic | GNSS, IMU, collision, etc. | Scripted | Hardware blocker | Primary controlled scenarios |
| Witness statements | Synthetic only | — | — | — | Contradiction testing |
