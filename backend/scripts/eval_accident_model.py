"""Regression check for the accident-cue model on its own validation split.

    python scripts/eval_accident_model.py [--data <dir with images/ and labels/>]

1. Reference: Ultralytics' own validator.
2. Our path: the verified loader + app.services.detection.run_model + an independent mAP50 computation.
The two mAP50 values must agree within --tolerance; this shows our loading, inference and box handling reproduce the
model's known behaviour. These numbers describe the model on its own (small, possibly leaky) data, not real accidents.
"""
import argparse
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2  # noqa: E402

from app.config import REPO_ROOT, get_settings  # noqa: E402
from app.eval.detection_metrics import average_precision, match, precision_recall_at  # noqa: E402
from app.services import detection  # noqa: E402
from app.services.weights import load_yolo  # noqa: E402

BASELINE = {"precision": 0.586, "recall": 0.524, "mAP50": 0.558}  # measured in Stage 1 (research/stage1_probes)


def yolo_labels(path: Path, w: int, h: int) -> list[list[float]]:
    boxes = []
    if path.is_file():
        for line in path.read_text().split("\n"):
            parts = line.split()
            if len(parts) == 5:
                _, cx, cy, bw, bh = map(float, parts)
                boxes.append([(cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h])
    return boxes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(get_settings().storage_path / "datasets/accident_detection/valid"))
    ap.add_argument("--tolerance", type=float, default=0.01)
    args = ap.parse_args()
    data = Path(args.data)
    images = sorted(p for p in (data / "images").iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    if not images:
        print(f"no images under {data}/images")
        return 2
    s = get_settings()
    device = detection.pick_device(s.detector_device)
    model, entry = load_yolo("accident_yolov8s", str(s.models_path))

    # 1. reference: Ultralytics validator
    with tempfile.TemporaryDirectory() as tmp:
        yaml = Path(tmp) / "acc.yaml"
        yaml.write_text(f"path: {data.parent}\ntrain: {data.name}/images\nval: {data.name}/images\nnc: 1\nnames: ['Accident']\n")
        r = model.val(data=str(yaml), imgsz=640, device=device, verbose=False, plots=False, project=tmp, name="val")
        reference = {"precision": round(float(r.box.mp), 3), "recall": round(float(r.box.mr), 3), "mAP50": round(float(r.box.map50), 3)}

    # 2. our path
    preds, gts = [], {}
    for i in range(0, len(images), 16):
        batch = images[i:i + 16]
        imgs = [cv2.imread(str(p)) for p in batch]
        boxes, _ = detection.run_model(model, imgs, imgsz=640, conf=0.001, device=device, keep=detection.ACCIDENT_KEEP)
        for p, img, bs in zip(batch, imgs, boxes):
            h, w = img.shape[:2]
            gts[p.name] = yolo_labels(data / "labels" / (p.stem + ".txt"), w, h)
            preds += [(p.name, b.confidence, [b.x1, b.y1, b.x2, b.y2]) for b in bs]
    conf, tp, n_gt = match(preds, gts, 0.5)
    ours_map50 = round(average_precision(tp, n_gt), 3)
    p25, r25 = precision_recall_at(conf, tp, n_gt, 0.25)

    agree = abs(ours_map50 - reference["mAP50"]) <= args.tolerance
    report = {
        "run_at": datetime.now(timezone.utc).isoformat(), "model": "accident_yolov8s", "weights_sha256": entry["sha256"], "device": device,
        "images": len(images), "ground_truth_boxes": n_gt, "reference_ultralytics_val": reference, "baseline_stage1": BASELINE,
        "our_path": {"mAP50": ours_map50, "precision_at_0.25": round(p25, 3), "recall_at_0.25": round(r25, 3)},
        "our_path_agrees_with_reference": agree, "tolerance": args.tolerance,
        "caveat": "model's own validation split (154 images, web-sourced, frames possibly shared with training): not real-world accident accuracy",
    }
    out = REPO_ROOT / "research" / "phase4"
    out.mkdir(parents=True, exist_ok=True)
    (out / "accident_regression.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0 if agree else 1


if __name__ == "__main__":
    raise SystemExit(main())
