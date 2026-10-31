# MODEL_REPOSITORY_ANALYSIS

Phase 2, version 1. Research date: 2026-10-30. Sources: GitHub repository metadata and READMEs (via the GitHub API), the Featherless public model list (`GET https://api.featherless.ai/v1/models`, 22,421 entries at research time), Featherless docs, and **local benchmarks on the development Mac** (`research/phase2_benchmark/`).

Labels: **[V]** verified from the named source in this research, **[M]** measured locally, **[U]** unverified.

---

## 1. Object detection

### 1.1 Ultralytics (`ultralytics/ultralytics`)
| Item | Finding |
|---|---|
| Repository | https://github.com/ultralytics/ultralytics [V] |
| Licence | **AGPL-3.0** [V]; README offers an Enterprise Licence for commercial use [V]. Network use of an AGPL program requires offering its source to users, which is compatible with an open-source hackathon repository but restricts closed commercial use |
| Latest release | v8.4.193 (2026-10-30) [V]; package tested: `ultralytics==8.4.193` [M] |
| Current family | **YOLO26** (n/s/m/l/x) pretrained on COCO [V]. README says YOLO27 is "coming soon" with no models available [V] |
| Checkpoints | `yolo26n.pt`, `yolo26s.pt`, `yolo26m.pt` (auto-downloaded on first use from Ultralytics releases) [V/M] |
| Published accuracy (COCO val2017, 640) | n 40.9, s 48.6, m 53.1 mAP50-95 [V: README] |
| Published CPU latency | n 38.9 ms, s 87.2 ms, m 220.0 ms, **ONNX on a 32-core Intel Xeon**, not comparable to our Mac [V] |
| Classes | COCO: car, truck, bus, motorcycle, bicycle, person, traffic light (all classes we need are present) [V by detection output] |
| Input | Image arrays/paths/video; any size, letterboxed to `imgsz` |
| Output | Boxes (xyxy), class IDs, confidences; `.track()` adds track IDs |
| Tracking | Built-in trackers: `bytetrack.yaml`, `botsort.yaml`, plus `ocsort`, `deepocsort`, `fasttrack`, `tracktrack` [V: repo cfg/trackers] |
| Hardware | CPU and Apple MPS work [M] |
| Install | `pip install ultralytics` (pulls PyTorch); environment ~1.3 GB including RF-DETR and trackers [M] |
| Limits | AGPL; COCO classes only; no accident semantics |

### 1.2 RF-DETR (`roboflow/rf-detr`) — permissive alternative
| Item | Finding |
|---|---|
| Repository | https://github.com/roboflow/rf-detr [V] |
| Licence | Repository Apache-2.0 [V]. **Nano, Small, Medium, Large detection weights are Apache-2.0**; Atto/Femto/Pico/XL/2XL are under PML 1.0 and come only with `rfdetr[plus]` [V: README]. Use the plain `rfdetr` package only |
| Package tested | `rfdetr==1.11.2` [M] |
| Published accuracy (COCO AP50:95) | N 48.4, S 53.0, M 54.7, L 56.5 [V: README; GPU latency figures in README not applicable to us] |
| Input / output | PIL/array images → `supervision.Detections` (xyxy, class_id, confidence) [M] |
| Hardware | CPU and MPS work [M] |
| Limits | Slower than YOLO26n on this Mac (see §6); API changed between versions (e.g., `rfdetr.util` removed in v1.9.0) [M], so pin the version |

Other permissive detectors seen (not benchmarked): YOLOX (Apache-2.0), RT-DETR (`lyuwenyu/RT-DETR`, Apache-2.0), D-FINE (Apache-2.0) [V: repo metadata].

---

## 2. Multi-object tracking

| Repository | Licence | Status | Notes |
|---|---|---|---|
| `ifzhang/ByteTrack` → redirects to **`FoundationVision/ByteTrack`** | MIT [V] | Last push 2024-06-19 [V] | Research code tied to YOLOX; not used directly |
| `NirAharon/BoT-SORT` | MIT [V] | Last push 2024-08-08 [V] | Research code (ReID, camera-motion compensation); not used directly |
| Ultralytics built-in ByteTrack/BoT-SORT | AGPL-3.0 (part of the package) [V] | Maintained | BoT-SORT config: `gmc_method: sparseOptFlow` (camera-motion compensation), `with_reid: False` by default, `track_buffer: 30` [V: botsort.yaml] |
| **`roboflow/trackers`** | **Apache-2.0** [V] | Maintained (pushed 2026-10-30) [V]; tested `trackers==2.6.1` [M] | "Clean-room" implementations of SORT, ByteTrack, OC-SORT, BoT-SORT, C-BIoU, McByte [V: README]; classes `ByteTrackTracker`, `BoTSORTTracker`, `OCSORTTracker`, `SORTTracker`, `CBIoUTracker`, `McByteTracker` [M]. README reports BoT-SORT handles moving cameras through camera-motion compensation [V] |
| `roboflow/supervision` | MIT [V] | Maintained | Detections container, drawing utilities, video I/O |

Implication: a **fully permissive stack** is available (RF-DETR N/S/M/L + `trackers` + `supervision`), and so is a **faster AGPL stack** (Ultralytics YOLO26 + built-in trackers). Both sit behind the `ObjectDetector`/`ObjectTracker` interfaces.

---

## 3. Optional segmentation: SAM 2 (`facebookresearch/sam2`)
| Item | Finding |
|---|---|
| Licence | Apache-2.0 [V] |
| Checkpoints | SAM 2.1: `sam2.1_hiera_tiny.pt`, `_small`, `_base_plus`, `_large` [V: README] |
| Requirements | `python>=3.10`, `torch>=2.5.1`, `torchvision>=0.20.1` [V] |
| CPU/MPS behaviour | [U]; not benchmarked |
| Value for us | Masks could refine ground-contact points or occlusion analysis. **No clear requirement needs it in v1** |
| Decision | Not in v1. Revisit only if bottom-centre box points prove inadequate for calibrated trajectories |

## 4. Optional action recognition: MMAction2 (`open-mmlab/mmaction2`)
| Item | Finding |
|---|---|
| Licence | Apache-2.0 [V] |
| Latest release | v1.2.0 (2023-10-12) [V]; repo pushed 2026-03-18 [V] |
| Pretrained data | Kinetics-400/600/700/710, AVA, NTU skeletons, and others [V: README] |
| Dependencies | PyTorch, MMCV, MMEngine, MMDetection; installation commands are CUDA-oriented [V] |
| Value for us | No pretrained checkpoint found that targets traffic collisions; generic human-action classes do not establish road events [V by README dataset list; no accident dataset listed] |
| Decision | **Excluded.** Our candidate events come from tracks and sensors, which are measurable and traceable |

## 5. Vision-language model
| Item | Finding |
|---|---|
| URL in the spec | `QwenLM-corp/Qwen2.5-VL` is a **fork** (4 stars) of `QwenLM/Qwen3-VL`, owned by a different organization [V: API `fork=true`, `parent=QwenLM/Qwen3-VL`]. **Not the official source** |
| Official repository | `QwenLM/Qwen2.5-VL` now redirects to **`QwenLM/Qwen3-VL`** (Apache-2.0) [V] |
| Local inference | Not planned (no GPU). Hosted through Featherless |
| Featherless availability [V: model list] | `Qwen/Qwen2.5-VL-3B/7B/32B/72B-Instruct`, `Qwen/Qwen3-VL-2B/4B/8B/32B-Instruct`, `Qwen/Qwen3-VL-30B-A3B-Instruct`, `Qwen/Qwen3-VL-235B-A22B-Thinking`; also Gemma 3/4 vision-capable variants |
| Image input | Featherless chat completions accept `image_url` (public URL or base64 data URL; PNG/JPEG/WebP), text first then image [V: vision docs]. Raw video is not documented |

## 6. OCR: PaddleOCR (`PaddlePaddle/PaddleOCR`)
| Item | Finding |
|---|---|
| Licence | Apache-2.0 [V] |
| Latest release | v3.7.0 (2026-06-11) [V] |
| Models | PP-OCRv6 (50 languages in one model) and PP-OCRv5 [V: README] |
| Platforms | Badges list Linux, Windows, Mac; CPU, GPU, XPU, NPU [V]; README cites an Apple M4 speedup for the tiny model [V] |
| Local test | **Not installed or benchmarked** [U]; installation on Apple Silicon to be confirmed in Phase 5 |
| Use | Only for scanned statements without a text layer |

---

## 7. Local benchmark (development Mac)

**Setup [M]:** Apple M5, 16 GB, macOS 27.0.1, Python 3.11 (Homebrew), torch 2.15.0, MPS available. Versions in `research/phase2_benchmark/versions.txt`.
**Input:** one sample street image (`bus.jpg` from Ultralytics) and a 60-frame synthetic pan built from it at 1280×720.
**Method:** median latency per frame after warm-up (30 runs for YOLO26, 20 for RF-DETR), including pre- and post-processing as exposed by each library's predict call. **This measures speed only, not accuracy.** Accuracy needs labelled data (BDD100K, Phase 3–4).

### Detection
| Model | Licence | Device | 640 px | 960 px |
|---|---|---|---|---|
| YOLO26n | AGPL-3.0 | CPU | 15.9 ms | 28.7 ms |
| YOLO26n | AGPL-3.0 | MPS | 7.9 ms | 9.9 ms |
| YOLO26s | AGPL-3.0 | CPU | 31.6 ms | 57.6 ms |
| YOLO26s | AGPL-3.0 | MPS | 12.3 ms | 19.7 ms |
| YOLO26m | AGPL-3.0 | CPU | 63.4 ms | 121.5 ms |
| YOLO26m | AGPL-3.0 | MPS | 26.1 ms | 46.9 ms |
| RF-DETR Nano | Apache-2.0 | CPU | 43.7 ms (native res.) | — |
| RF-DETR Nano | Apache-2.0 | MPS | 29.3 ms | — |
| RF-DETR Small | Apache-2.0 | CPU | 72.7 ms | — |
| RF-DETR Small | Apache-2.0 | MPS | 43.8 ms | — |

All models found the bus and three people at 640 px. At 960 px YOLO26n also reported a second bus and a truck box. Whether that is a duplicate or a valid detection was not checked, which is one reason a single image proves nothing about accuracy.

### Detection + tracking (YOLO26n, 640 px, 60 frames, after warm-up)
| Tracker | CPU | MPS |
|---|---|---|
| Ultralytics ByteTrack | 16.8 ms/frame | 9.5 ms/frame |
| Ultralytics BoT-SORT (sparse optical flow motion compensation) | 20.0 ms/frame | 12.3 ms/frame |

### Tracker-only overhead (`roboflow/trackers`, on precomputed RF-DETR Nano detections, CPU)
| Tracker | ms/frame |
|---|---|
| ByteTrackTracker | 0.1 |
| BoTSORTTracker | 3.7 |

**Reading the numbers:** at a 10 fps analysis rate, a 60-second clip is 600 frames. YOLO26n + ByteTrack on MPS at about 10 ms/frame is roughly 6 seconds of compute. YOLO26m on CPU at about 63 ms/frame is roughly 40 seconds. This is an extrapolation from a synthetic sequence; real footage with many objects will differ and must be measured in Phase 5.

---

## 8. Featherless (hosted inference)

| Item | Finding |
|---|---|
| Base URL, auth | `https://api.featherless.ai/v1`; `Authorization: Bearer <key>` [V: quickstart] |
| Model list | Public `GET /v1/models`, which returns `id`, `is_gated`, `context_length`, `concurrency_cost`, `pricing` [V/M] |
| Image input | `image_url` content parts [V: vision docs] |
| Structured outputs (`response_format` / `json_schema`) | **Not documented** in the pages read, and no Featherless page was found by search [U]. An older tool-calling page mentions `response_format={"type":"json_object"}`. To be tested live |
| Concurrency | Unit-based; costs per model listed (1, 2, 4) [V] |
| Gating | Gemma models are listed `is_gated: true` [V]; access may require extra acceptance [U] |
| API key | **Not set** in the research shell, so **no live call was made**. Image input, JSON behaviour, latency, and token counts remain to be tested (verification step V-8) |

Candidate models with listed prices (USD per million tokens, at research time) [V: model list]:

| Model | Use | Context | Units | Input | Output |
|---|---|---|---|---|---|
| Qwen/Qwen3-VL-8B-Instruct | Frame interpretation | 32,768 | 1 | 0.182 | 1.351 |
| Qwen/Qwen2.5-VL-7B-Instruct | Frame interpretation (alt.) | 32,768 | 1 | 0.400 | 0.800 |
| Qwen/Qwen3-VL-30B-A3B-Instruct | Harder frames | 131,072 | 2 | 0.150 | 0.500 |
| Qwen/Qwen3-14B | Witness extraction | 32,768 | 1 | 0.120 | 0.240 |
| Qwen/Qwen3-8B | Witness extraction (cheaper) | 32,768 | 1 | 0.117 | 0.455 |
| Qwen/Qwen2.5-14B-Instruct | Witness extraction (alt.) | 32,768 | 1 | 0.108 | 0.280 |
| Qwen/Qwen3-32B | Explanations, summary wording | 32,768 | 2 | 0.102 | 0.493 |

Whether the account is billed per token, or by a fixed subscription with unit limits, is still unconfirmed. Prices matter only for the per-token case.
