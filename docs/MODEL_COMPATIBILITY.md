# MODEL_COMPATIBILITY

Phase 2, version 1. How each candidate component fits our interfaces, hardware, licences, and data. Evidence labels as in MODEL_REPOSITORY_ANALYSIS ([V] verified, [M] measured, [U] unverified).

## 1. Interface fit

| Interface | Candidate | Native output | Adapter work | Fit |
|---|---|---|---|---|
| `ObjectDetector` | Ultralytics YOLO26 | `Results.boxes` (xyxy, cls, conf) [M] | Map COCO names to our classes; attach PTS, model ID, params hash | Good |
| `ObjectDetector` | RF-DETR N/S/M/L | `supervision.Detections` [M] | Same mapping (COCO IDs via `rfdetr.assets.coco_classes`) [M] | Good |
| `ObjectTracker` | Ultralytics `track()` (ByteTrack/BoT-SORT) | Track IDs on `Results.boxes.id` [M] | Couples detector and tracker in one call; we need to record gaps and reliability ourselves | Fair (coupling) |
| `ObjectTracker` | `roboflow/trackers` ByteTrack/BoT-SORT | `Detections.tracker_id` [M] | Detector-agnostic; we add gap and reliability bookkeeping | Good (decoupled) |
| `FrameInterpreter` | Featherless Qwen3-VL / Qwen2.5-VL | Chat text | Prompt with fixed questions; Pydantic schema; frame references attached by us | Good (pending live test) |
| `WitnessExtractor` | Featherless Qwen3 / Qwen2.5 text | Chat text (JSON requested) | Schema validation, verbatim-span check, one repair attempt | Good (pending live test) |
| `OCRProcessor` | PaddleOCR | Text + boxes + scores [V: README] | Map to sentences and character offsets | Unverified install on this Mac |

## 2. Hardware fit (no NVIDIA GPU; Apple M5, 16 GB)

| Component | CPU | MPS | Memory | Verdict |
|---|---|---|---|---|
| YOLO26n/s/m | Works [M] | Works [M], 2–2.5× faster than CPU here | Fits | Compatible |
| RF-DETR N/S | Works [M] | Works [M] | Fits | Compatible, slower than YOLO26 at a similar size |
| `trackers` ByteTrack | 0.1 ms/frame [M] | n/a | Negligible | Compatible |
| `trackers` BoT-SORT | 3.7 ms/frame [M] | n/a | Small | Compatible |
| SAM 2.1 | [U] | [U] | [U] | Not needed in v1 |
| MMAction2 | CUDA-oriented install instructions [V] | [U] | — | Excluded |
| PaddleOCR | Advertised [V] | n/a | [U] | Verify at install |
| VLM / LLM | Hosted | Hosted | — | Compatible via Featherless |

## 3. Licence compatibility

| Stack | Licences | Consequence |
|---|---|---|
| **A: Ultralytics** (YOLO26 + built-in trackers) | AGPL-3.0 | The whole service must be offered under AGPL-compatible terms to its users. Fine for an open-source hackathon repository; not for closed commercial use without an Enterprise Licence |
| **B: Permissive** (RF-DETR N/S/M/L + `trackers` + `supervision`) | Apache-2.0 / MIT | No copyleft obligations; attribution required. Avoid `rfdetr[plus]` (PML 1.0 models) |
| Mixed (Ultralytics detector + `trackers`) | AGPL-3.0 dominates | No licence benefit over A |
| PaddleOCR, SAM 2, Qwen3-VL code | Apache-2.0 | Permissive |
| Hosted models via Featherless | Each model's own licence plus Featherless terms [U] | Gemma models are gated [V]; check terms before use |

## 4. Data and domain compatibility

| Concern | Status |
|---|---|
| Classes needed (car, truck, bus, motorcycle, bicycle, pedestrian, traffic light) | All present in COCO-pretrained detectors [V] |
| Dashcam domain (BDD100K) | Accuracy unknown until measured on BDD100K labels (Phase 4/9) [U] |
| CCTV / elevated views (NGSIM, AI City) | Unknown; small objects at distance may need 960 px input [U] |
| Night and rain | Expected degradation; to be measured on BDD100K weather/time-of-day attributes [U] |
| Synthetic renders (CARLA or a generator) | Not representative for detector accuracy |
| Moving camera tracking | BoT-SORT's camera-motion compensation is the documented mitigation [V]; benefit to be measured on BDD100K MOT |
| VLM frame facts (signal state, weather) | Unknown accuracy; measured on a labelled keyframe set |
| Witness extraction | Unknown accuracy; measured on synthetic statements with answer keys |

## 5. Structured output compatibility (hosted models)

The design does **not** depend on provider-side JSON-schema enforcement, because Featherless documentation does not confirm it [U]:
1. The prompt includes the JSON schema and a strict output instruction.
2. If a live test shows `response_format: {"type": "json_object"}` is accepted, use it as an extra guard.
3. Validate the response with Pydantic.
4. Make one repair attempt with the validation error.
5. Otherwise record the call as failed; never patch the output silently.

## 6. Open compatibility checks (to run once a key is available)
1. A text model call returns valid JSON for the claim schema, with and without `response_format`.
2. A vision call with a base64 JPEG keyframe succeeds for Qwen3-VL-8B and Qwen2.5-VL-7B.
3. Record prompt and completion tokens, latency, and any 429 behaviour.
4. Confirm the account's billing type (per token vs subscription) and unit allowance.

## 7. Open checks resolved (2026-10-31, live)
1. Text call returns valid JSON for the claim schema: **only with thinking disabled** on Qwen3-14B (see MODEL_SELECTION §12). `response_format: json_object` **does not work reliably** (empty object).
2. Vision call with a base64 image: **works** (Qwen3-VL-8B-Instruct read a red square correctly, 1.3 s). Real keyframe accuracy is still untested.
3. Token counts, latency, 429 behaviour: recorded in `research/featherless_check/report.json` and `research/phase6/`; no 429 with 3 parallel requests.
4. Billing type and unit allowance: **still unconfirmed** (check the Featherless dashboard).
