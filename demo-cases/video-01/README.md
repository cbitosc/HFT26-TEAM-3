# Video 01 — two paired jury cases

The full collection will contain exactly **3 videos × 2 cases = 6 cases**. This pack contains the first pair.

| Code | Witness accounts | Simulated sensor CSVs | Expected findings |
|---|---|---|---|
| TD-V01-01 | Describe the visible rider fall and later aftermath | Shared assumed profiles for motorcycle A and MPV B | No controlled contradiction |
| TD-V01-02 | Deny the visible fall; include excessive speed claims | Byte-identical to case 01 | One denial versus reviewed-video conflict and two speed-versus-sensor conflicts |

The original video is 22.67 s, 680 frames at 30 fps. It shows a motorcycle/rider falling around 14.4–14.9 s and getting up later. Vehicle-to-vehicle contact and fault are not established. The fall interval is entered as an **attributed human visual review**, with links to the actual frames; it is not presented as an automatic fall-detector result.

Every witness account is fictional and clearly marked GENERATED DEMO. Every sensor row is SIMULATED_DEMO. Speeds are illustrative assumptions, not measurements recovered from the video. Case 01 describes visible events without inventing measured speed. Case 02's numeric conflicts compare fictional witness estimates to simulated CSVs, while its fall denial compares with the human-reviewed video interval.

Each case contains two CSVs and two witness accounts. CSVs contain 227 rows per vehicle at 10 Hz, 0.0–22.6 s. A assumes 30 km/h before decelerating at 13.9–15.2 s; B assumes 36 km/h before decelerating at 13.4–15.6 s. These profiles roughly follow the visible sequence and are not actual braking evidence. No GPS, injury assessment, or collision flag is invented.

Map timestamp_s → t (s), speed_kmh → speed (km/h), accel_long_mps2 → accel_long (m/s2). Leave record_origin and vehicle_label unmapped. Simulation time zero is explicitly tied to clip start with ±0.5 s alignment uncertainty. Witness time ranges retain an additional ±0.5 s. Same video and CSV hashes are checked across both cases.

## Load into a teammate's project

Run the API and PostgreSQL, then from the repository root:

```sh
backend/.venv/bin/python backend/scripts/load_jury_cases.py --api http://127.0.0.1:8010/api/v1
```

On Windows use backend\.venv\Scripts\python.exe. Real video processing requires the installed vision dependencies, pinned weights and FFmpeg. The loader uses public APIs, builds scenarios and verifies the expected findings. Re-running skips complete existing case codes; it does not duplicate them or delete unrelated cases. Future video pairs will use unique case codes.

For the jury, open case 01 first, then case 02 and its findings. The clip and sensors stay constant; changed witness accounts cause the differences. Creating one fresh case separately demonstrates intake without re-entering the prepared collection.
