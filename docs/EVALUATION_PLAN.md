# EVALUATION_PLAN

Version 3. Metrics come only from the evaluation harness, with sample sizes and failure lists. Results are reported separately for **real**, **staged**, and **synthetic** data, and synthetic or staged results are never presented as real-world accident performance. The only numbers that exist today are the accident-model re-validation and speed benchmarks (MODEL_SELECTION).

## 1. Metrics

| Component | Metric | Data | Notes |
|---|---|---|---|
| Vehicle/pedestrian detection | Precision, recall, mAP50, mAP50-95 | BDD100K detection val subset (real) | COCO→BDD class mapping documented; day/night/rain split |
| Accident cue | P, R, mAP50 | Accident repo **valid** split (baseline measured: P 0.586, R 0.524, mAP50 0.558); hand-labelled staged/CARLA frames | Test split excluded as possibly leaky |
| Tracking | IDF1, HOTA, ID switches, fragmentation | BDD100K MOT 2020 val (5 Hz); CARLA IDs; staged hand labels | ByteTrack vs BoT-SORT |
| Video event extraction | P, R, F1 (type + actor + time tolerance) | Answer keys (staged/CARLA) | Tolerance reported (default ±300 ms) |
| Witness extraction | Claim P/R; actor, action, direction accuracy; span validity | Scenario statements + extra synthetic set | Real observer statements kept separate from scripted ones |
| Synchronization | Timestamp absolute error | CARLA with injected offsets; staged takes (flash marked by hand) | |
| Timeline | Event ordering accuracy (pairwise order agreement on determined pairs) | Answer keys | Undetermined pairs counted separately |
| Trajectory | Position error, RMSE | CARLA (metres); staged grid (mat units); NGSIM if usable | Per coordinate frame; no image-space RMSE in metres |
| Contradiction / corroboration | P, R, F1; independence correctness | Answer keys | Per rule ID |
| Traceability | % findings with valid source references; % witness spans verbatim | All cases | Target 100% (a failure is a bug) |
| Report safety | Banned-phrase hits | All reports | Must be 0 |

## 2. Method
1. Freeze evaluation scenarios and seeds; keep a development split for threshold tuning.
2. **Model path** (real detector, tracker, and LLM outputs) and **oracle path** (ground-truth tracks and claims injected) are evaluated separately, which separates model errors from engine errors.
3. All runs record git revision, configuration, model IDs, and cached LLM responses.
4. Each metric is reported with N, tolerances, and the failure list.
