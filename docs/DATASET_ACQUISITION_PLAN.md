# DATASET_ACQUISITION_PLAN

Version 3. **Nothing large is downloaded before approval.** Already fetched during research (scratchpad only, not in the project): the accident repo's `best.pt` and its test and valid splits (107 MB).

## 1. Order and exact items

| Step | Item | Exact files / action | Size | Gate |
|---|---|---|---|---|
| A1 | Accident model | `runs/detect/train/weights/best.pt` (SHA-256 `2c75218e…612f456`) via setup script from the original repo; licence request to the author | 22.5 MB | Licence decision |
| A2 | Accident validation data | `data/valid/` (154 images, 170 boxes) for regression checks | small | — |
| B1 | BDD100K labels | MOT 2020 labels (115 MB), Detection 2020 labels (53 MB) | 168 MB | — |
| B2 | BDD100K videos | 20–30 validation videos (day/night/rain mix) from the smallest video part that contains them; check part sizes with HEAD/listing first | unknown until listing | Size check |
| B3 | BDD100K info | Inspect 3–5 info records first; download the 3.9 GB package only if pairing is proven | 3.9 GB | Pairing proof |
| N1 | NGSIM metadata | `I-80_Metadata_Documentation.pdf` | small | — |
| N2 | NGSIM I-80 | `I-80-Emeryville-CA.zip` + `i-80-ProcessedVideo-0400pm-0415pm-Cam567.zip` | unknown (HEAD first) | N1 confirms frame/time rule |
| S1 | Staged recordings | 4 scenario takes (DEMO_SCENARIOS), 2 phones + IMU logger, flash sync, grid mat | < 2 GB | Approval of staged path |
| C1 | CARLA (optional) | Same 4 scenarios on a borrowed NVIDIA PC; exports only | < 2 GB | Hardware available |
| W1 | Witness statements | Real observer statements from staged takes + scripted contradictions | tiny | — |
| G1 | Generator data | Python-generated oracle tracks, sensors, answer keys for engine tests | tiny | — |

AI City is not acquired unless a team member has an institutional email and time permits.

## 2. Validation after acquisition
For every file:
- recorded SHA-256 and size;
- video decodes completely (ffprobe and frame count); PTS monotonic;
- labels parse, and IDs match videos;
- sensor timestamps monotonic, gaps listed, units declared;
- licence notice present.

Per scenario: the six pairing checks (DATASET_COMPATIBILITY §2). Failures are moved to `quarantine/<reason>/` and listed in `validation_report.json`; nothing is deleted silently. Dependent scenarios are marked `blocked`.

## 3. Storage layout
`data/raw/<source>/…` (read-only), `data/scenarios/<id>/manifest.yaml`, `data/ground_truth/<id>/…` (evaluation only), `data/quarantine/`. Raw third-party data stays out of git; manifests, answer keys, and scripts are in git. Details in DATA_ORGANIZATION.md.

## 4. Budget
About 10 GB total without the BDD100K info package; about 14 GB with it.
