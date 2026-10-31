# MODEL_SELECTION

Version 3. Every availability claim below was checked on 2026-10-30. **Measured** numbers come from runs on the development Mac (`research/phase2_benchmark/`, `research/stage1_probes/`). **Published** numbers come from the model's own repository. No model is trained or fine-tuned.

## 1. Summary of choices

| # | Responsibility | Model (exact identifier) | Runs | Status |
|---|---|---|---|---|
| 1 | Accident visual cue | `runs/detect/train/weights/best.pt` from `shubhankar-shandilya-india/Accident-Detection-Model` (YOLOv8s, 1 class `Accident`) | Local MPS/CPU | Verified loadable; **weak; supporting cue only**; licence unresolved |
| 2 | Vehicle and pedestrian detection | Ultralytics **`yolo26s.pt`** (default), **`yolo26n.pt`** (CPU fallback) | Local MPS/CPU | Verified, speed measured |
| 3 | Multi-object tracking | Ultralytics built-in **ByteTrack** (`bytetrack.yaml`); **BoT-SORT** (`botsort.yaml`, `gmc_method: sparseOptFlow`) for dashcams | Local | Verified, speed measured |
| 4 | Text LLM | Featherless **`Qwen/Qwen3-14B`**; reports and explanations **`Qwen/Qwen3-32B`** | Hosted | Listed in catalogue; **live call not yet tested** |
| 5 | Vision-language | Featherless **`Qwen/Qwen3-VL-8B-Instruct`**; fallback **`Qwen/Qwen2.5-VL-7B-Instruct`** | Hosted | Listed; image input documented; **live call not yet tested** |
| — | OCR (scanned statements, optional) | PaddleOCR PP-OCRv6 | Local | Not installed yet |

## 2. Comparison criteria applied

| Criterion | 1 Accident | 2 YOLO26 | 3 Trackers | 4 Qwen3-14B / 32B | 5 Qwen3-VL-8B |
|---|---|---|---|---|---|
| Task suitability | Partial: single class, no actor info | Good: COCO car, motorcycle, bus, truck, person, bicycle, traffic light | Good | Good for extraction (to be measured) | Scene context (to be measured) |
| Image input | n/a | n/a | n/a | No | **Yes**: `image_url`, base64 or URL, PNG/JPEG/WebP (Featherless vision docs) |
| Structured JSON | n/a | n/a | n/a | Requested via prompt + Pydantic; provider-side `json_schema` **not documented** | Same |
| Context length | n/a | n/a | n/a | 32,768 tokens (catalogue) | 32,768 tokens |
| Latency | ~3–6 ms/img inference on MPS (measured during validation) | 12.3 ms (s) / 7.9 ms (n) per frame on MPS (measured) | +1.6–4.4 ms/frame with detection (measured) | Unmeasured | Unmeasured |
| API compatibility | Ultralytics `YOLO()` (loads in 8.4.193, measured) | Ultralytics | Ultralytics `track()` | OpenAI-compatible chat completions | Same |
| Cost / rate limits | Free | Free | Free | 1 unit (14B), 2 units (32B); listed $0.12/$0.24 per M tokens (14B) | 1 unit; listed $0.182/$1.351 per M tokens |
| Hardware | Local MPS/CPU | Local MPS/CPU | Local | Hosted | Hosted |
| Licence | **No repository licence** (all rights reserved by default); dataset declared CC BY 4.0 (Roboflow); trained with AGPL Ultralytics | AGPL-3.0 | AGPL-3.0 (part of Ultralytics) | Model licence per Qwen release + Featherless terms (to confirm) | Same |

## 3. Model 1: existing accident detection weights

**Inspected files** (repository tree via GitHub API; weights and test/valid splits fetched with a sparse clone):

| Item | Finding |
|---|---|
| `best.pt`, `last.pt` | Both 22,508,024 bytes in `runs/detect/train/weights/`. `best.pt` SHA-256 `2c75218e…612f456` |
| `data.yaml` | `nc: 1`, `names: ['Accident']`; Roboflow project `accident-detection-model` v1, licence **CC BY 4.0** |
| Training args (`runs/detect/train/args.yaml`) | `model: yolov8s.yaml`, **`pretrained: false`**, `epochs: 25`, `imgsz: 640`, SGD. The README says it was trained from `yolov8s.pt` with `ultralytics==8.0.20`; the stored args disagree |
| Training results (`results.csv`, 25 epochs) | Best epoch 22: precision 0.579, recall 0.518, mAP50 0.586, mAP50-95 0.275 (on its validation split) |
| Actual image counts | train **947** images / 957 label files, valid **154**, test **157** → **1,258 images**. README claims "3200+" and "1200+": conflicting, and neither matches |
| Sources | README: images collected from YouTube, Google Images, Kaggle. Rights to those images are unclear |
| Repository licence | **None** |
| Pickle safety | All pickle globals scanned before loading (`scan_pickle.py`): only `ultralytics.*`, `torch.*`, `collections.OrderedDict`, `__builtin__.set`. Nothing unsafe found |

**Measured re-validation** (Ultralytics 8.4.193, MPS, 640 px; `research/stage1_probes/acc_val_results.json`):

| Split | Images | Boxes | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|---|---|
| valid | 154 | 170 | 0.586 | 0.524 | 0.558 | 0.249 |
| test | 157 | 81 | 0.902 | 0.802 | 0.890 | 0.419 |

The large gap between the splits is a warning sign. 18 test and 19 valid source-image names also appear in train. Many are generic (`ezgif-frame-087`), so this does not prove leakage, but frame-level splits from the same videos are likely, which would make the test score optimistic. **We treat the validation numbers (precision ~0.59, recall ~0.52) as the more realistic indication.** On one non-accident street image it produced no detections at confidence 0.25; one image is an anecdote, not a false-positive rate.

**Decision:**
- Use `best.pt` as an **`accident_visual_cue`** detector (machine detection). It never establishes a collision by itself.
- A `possible_collision` event requires the cue **plus** independent support: track interaction or proximity with an abrupt motion change, and/or a sensor collision flag or acceleration spike in the same sync group.
- **Licence:** the repository has no licence, so we must not redistribute the weights in our repository. Download at setup from the original repository, with attribution, and ask the author for permission or a licence. If permission is not obtained, the accident cue can be disabled without affecting the rest of the pipeline.
- Re-evaluate on our own staged or simulated footage (EVALUATION_PLAN).

**Limitations to record in every case:** one class with no actor or vehicle association, small and noisy training set, unclear image provenance, metrics on its own splits only, and no evidence of generalization to CCTV or night footage.

## 4. Model 2: vehicle and pedestrian detection

| Candidate | Status | Published COCO mAP50-95 | Measured on this Mac @640 |
|---|---|---|---|
| YOLOv8s | Available in Ultralytics | — (not re-checked) | not measured |
| YOLO11 | Available (`ultralytics/cfg/models/11`) | — (not re-checked) | not measured |
| **YOLO26n** | Current family (README) | 40.9 | MPS 7.9 ms, CPU 15.9 ms |
| **YOLO26s** | Current family | 48.6 | MPS 12.3 ms, CPU 31.6 ms |
| YOLO26m | Current family | 53.1 | MPS 26.1 ms, CPU 63.4 ms |
| RF-DETR Small (Apache-2.0) | Licence fallback | 53.0 | MPS 43.8 ms, CPU 72.7 ms |

**Choice:** `yolo26s.pt` at 640 px on MPS; `yolo26n.pt` on CPU-only machines. COCO classes kept: car, motorcycle, bus, truck, person (pedestrian), bicycle, traffic light. The class mapping is stored with every run. Selection is confirmed or changed after the BDD100K comparison (EVALUATION_PLAN E1).

Configurable: input size, confidence threshold, sampling rate, maximum frames, processing time budget (HARDWARE_AND_COMPUTE_PLAN §4).

## 5. Model 3: tracking

- **ByteTrack** (Ultralytics `bytetrack.yaml`): default for fixed CCTV.
- **BoT-SORT** (`botsort.yaml`, sparse optical-flow motion compensation, ReID off): default for dashcams.
- `track_buffer` is set relative to the sampling rate (30 frames at 5 fps = 6 s of occlusion tolerance). That is a long time, so this value is tuned.
- Track IDs are **per video only**. Cross-camera association is a separate, uncertain step in the engine (candidate links with reasons).
- Track fragments, gaps, and probable identity switches are recorded (VIDEO_PROCESSING_ARCHITECTURE §2.6).

## 6. Model 4: Featherless text model

| Use | Model | Units | Why |
|---|---|---|---|
| Claim extraction and normalization | `Qwen/Qwen3-14B` | 1 | Instruction-following, 32K context, 1 unit keeps parallelism |
| Fallback | `Qwen/Qwen2.5-14B-Instruct` | 1 | Same size, older generation |
| Explanations, report wording | `Qwen/Qwen3-32B` | 2 | Larger model for rarer, longer text |

Output contract: JSON matching a Pydantic schema; verbatim spans checked against the statement; fields not stated stay `null`; one repair attempt; otherwise the extraction is flagged as failed. Temperature 0, versioned prompts, cached responses.

## 7. Model 5: Featherless vision-language model

| Use | Model | Units |
|---|---|---|
| Selected-frame interpretation | `Qwen/Qwen3-VL-8B-Instruct` | 1 |
| Fallback | `Qwen/Qwen2.5-VL-7B-Instruct` | 1 |
| Hard cases (optional) | `Qwen/Qwen3-VL-30B-A3B-Instruct` | 2 |

- Frames are extracted with FFmpeg/OpenCV and sent as base64 JPEG (resized, e.g., longest side 1024). Raw video is never sent.
- At most 12 keyframes per case by default, selected at candidate events.
- Every output stores the source video ID, frame number, and timestamp.
- Outputs are `machine_detection` interpretations. They are never authoritative for time, speed, position, or identity.
- The spec's link `QwenLM-corp/Qwen2.5-VL` is an unofficial fork; the official repository is `QwenLM/Qwen3-VL` (Apache-2.0).

## 8. Must verify before Phase 6 (needs `FEATHERLESS_API_KEY` set in the shell)
1. A vision call with a base64 keyframe succeeds for both VLM choices.
2. JSON behaviour with and without `response_format: {"type": "json_object"}`.
3. Token counts, latency, and 429 behaviour.
4. Billing type and unit allowance.
If a chosen model fails, switch to its listed fallback and record the change here.

## 9. Fallbacks summary

| If… | Then… |
|---|---|
| Accident weights licence not granted | Disable the accident cue; collision candidates come from tracks + sensors |
| AGPL unacceptable | RF-DETR Small + `roboflow/trackers` (Apache-2.0), measured slower but workable |
| Featherless unavailable during demo | Cached responses; witness claims can be entered manually with spans |
| VLM accuracy poor on our frames | Disable frame interpretation; it is optional context |

## 10. Phase 4 outcomes (2026-10-30)
- Installed and pinned in `backend/models.lock.json`: `yolo26s` (sha256 `646f8bc3…`), `yolo26n` (`9b09cc8b…`), `accident_yolov8s` (`2c75218e…`). Files live in `data/models/` (git-ignored) and are fetched with `backend/scripts/fetch_models.py` (`--include-accident` prints the licence notice).
- Loading is refused unless the SHA-256 matches and a static pickle scan finds only allowlisted globals (Ultralytics model classes, PyTorch module/tensor/storage types, `OrderedDict`, `set`).
- Accident-model regression (`backend/scripts/eval_accident_model.py`, report in `research/phase4/accident_regression.json`): Ultralytics validator mAP50 0.558 (P 0.586, R 0.524) reproduced; our inference path + independent metric mAP50 0.562; at confidence 0.25: precision 0.682, recall 0.429. These describe the model on its own small, possibly leaky validation split, not real accidents.
- Still open: detector accuracy on real dashcam footage (BDD100K detection labels, 53 MB, plus a small set of images), which needs approval to download.

## 11. Phase 5 outcomes (2026-10-30)
- Tracking moved from Ultralytics' built-in trackers to `roboflow/trackers` 2.6.1 (Apache-2.0) running on stored detections, so tracking is independent of the detector and can be re-run and evaluated separately.
- Defaults: track-start confidence 0.3, high-confidence association 0.5, 2 s lost-track buffer (time-based via frame timestamps), detections ≥ 0.15 in, classes car/truck/bus/motorcycle/bicycle/pedestrian.
- Measured: both trackers withhold the first detection of every new object (BoT-SORT only starts tracks instantly on the very first frame), so an unambiguous backfill re-attaches it, marked `backfilled`.
- Metrics: `trackers.eval` (CLEAR, Identity, HOTA).

## 12. Phase 6 live results (2026-10-31) — measured, replaces assumptions in §6

Script: `backend/scripts/eval_claim_models.py` (same production prompt, first attempt only, no repair). 10 synthetic statements per model, temperature 0, `max_tokens` 1200. Raw data: `research/phase6/`.

| Configuration | Valid JSON | All quotes verbatim | Median latency | Median output tokens | Failure modes |
|---|---|---|---|---|---|
| Qwen/Qwen3-14B (thinking on, API default) | 4/10 | 4 | 11.4 s | 1200 | 4 empty (budget spent on hidden reasoning), 2 corrupt JSON |
| **Qwen/Qwen3-14B, `chat_template_kwargs.enable_thinking=false`** | **10/10** (then 28/30 over 3 repeats) | **10** | **2.8 s** | **183** | 2 corrupt JSON in 30 |
| Qwen/Qwen2.5-14B-Instruct | 10/10 | 7 | 6.2 s | 141 | paraphrases quotes (rejected by verification) |
| Qwen/Qwen2.5-7B-Instruct | 3/10 | 3 | 3.0 s | 148 | malformed JSON |
| Qwen/Qwen2.5-32B-Instruct | 8/10 | 7 | 6.2 s | 129 | malformed JSON, paraphrases |

**Decision:** keep `Qwen/Qwen3-14B` with thinking disabled (setting `FEATHERLESS_DISABLE_THINKING`, default on, applied to Qwen3 models only and part of the request fingerprint). With the single repair attempt, expected pipeline failure is far below the 5% first-attempt miss rate, and the manual path remains.

Other live facts: the vision model read a base64 PNG correctly; 3 parallel requests to a 1-unit model returned 200 with no 429 on this account; `response_format: {"type":"json_object"}` returned `{}` for this model and is not used. Cost of the whole live test campaign was a few cents (estimated from token counts and listed prices; billing type still unconfirmed).

Caveat: 10 synthetic statements are a screen, not an accuracy benchmark. Normalized fields (subject/action/direction/location/time) are machine readings with visible errors; the engine relies on the verbatim quote and the code-derived maneuver instead.
