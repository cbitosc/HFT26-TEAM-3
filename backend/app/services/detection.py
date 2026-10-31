"""Pretrained detection on sampled frames: COCO vehicles/pedestrians (YOLO26) and the single-class accident cue.

Outputs are machine detections. A box is a model output with a confidence, not an established fact; the accident cue in
particular never establishes a collision on its own (MODEL_SELECTION §3).
"""
import time
from dataclasses import dataclass

import numpy as np

# COCO name -> our class. Anything else the detector reports is dropped (and counted).
COCO_KEEP = {"car": "car", "truck": "truck", "bus": "bus", "motorcycle": "motorcycle", "bicycle": "bicycle",
             "person": "pedestrian", "traffic light": "traffic_light"}
ACCIDENT_KEEP = {"Accident": "accident_cue"}
DETECTION_VERSION = "1"


@dataclass
class Box:
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float


def pick_device(pref: str) -> str:
    if pref != "auto":
        return pref
    try:
        import torch

        return "mps" if torch.backends.mps.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


def run_model(model, images: list[np.ndarray], *, imgsz: int, conf: float, device: str, keep: dict[str, str]) -> tuple[list[list[Box]], int]:
    """Predict on a batch. Boxes are in the original image's pixel coordinates. Returns (boxes per image, dropped count)."""
    results = model.predict(images, imgsz=imgsz, conf=conf, device=device, verbose=False)
    out, dropped = [], 0
    for r in results:
        boxes = []
        names = r.names
        for (x1, y1, x2, y2), c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            ours = keep.get(names[int(k)])
            if ours is None:
                dropped += 1
                continue
            boxes.append(Box(ours, round(float(c), 4), round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)))
        out.append(boxes)
    return out, dropped


def detect_stream(frames, model, *, imgsz: int, conf: float, device: str, keep: dict[str, str], stats: dict, batch: int = 8, progress=None):
    """Consume (frame_index, image) pairs and yield (frame_index, boxes). Updates the caller's `stats` dict in place.

    `progress(done)` is called after each inferred batch with the number of frames actually inferred. It is not a clock."""
    stats.update({"frames": 0, "boxes": 0, "dropped_other_classes": 0, "seconds": 0.0})
    buf_idx, buf_img = [], []

    def flush():
        t0 = time.perf_counter()
        res, dropped = run_model(model, buf_img, imgsz=imgsz, conf=conf, device=device, keep=keep)
        stats["seconds"] += time.perf_counter() - t0
        stats["dropped_other_classes"] += dropped
        for i, b in zip(buf_idx, res):
            stats["frames"] += 1
            stats["boxes"] += len(b)
            yield i, b
        buf_idx.clear()
        buf_img.clear()
        if progress is not None:
            progress(stats["frames"])

    for i, img in frames:
        buf_idx.append(i)
        buf_img.append(img)
        if len(buf_img) >= batch:
            yield from flush()
    if buf_img:
        yield from flush()
    stats["ms_per_frame"] = round(1000 * stats["seconds"] / stats["frames"], 2) if stats["frames"] else None
