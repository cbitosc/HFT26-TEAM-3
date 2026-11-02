"""Phase 2 micro-benchmark: pretrained detector + tracker throughput on this machine.
Not an accuracy test. Synthetic pan sequence built from one sample image."""
import json, platform, statistics, time, urllib.request
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

HERE = Path(__file__).parent
IMG = HERE / "bus.jpg"
if not IMG.exists():
    urllib.request.urlretrieve("https://ultralytics.com/images/bus.jpg", IMG)
img = cv2.imread(str(IMG))

# 60-frame synthetic "pan" sequence at 1280x720 so tracker has motion to follow
canvas = cv2.resize(img, (1600, 900))
frames = [canvas[90:810, 10 + 4 * i: 1290 + 4 * i].copy() for i in range(60)]

def timed(fn, n, warm=5):
    for _ in range(warm):
        fn()
    t = []
    for _ in range(n):
        s = time.perf_counter(); fn(); t.append((time.perf_counter() - s) * 1000)
    return round(statistics.median(t), 1), round(statistics.pstdev(t), 1)

results = {"machine": platform.platform(), "processor": platform.processor(),
           "torch": torch.__version__, "mps": torch.backends.mps.is_available(), "runs": []}

for weights in ["yolo26n.pt", "yolo26s.pt", "yolo26m.pt"]:
    model = YOLO(weights)
    for device in ["cpu", "mps"]:
        for imgsz in [640, 960]:
            f = frames[0]
            med, sd = timed(lambda: model.predict(f, imgsz=imgsz, device=device, verbose=False), 30)
            r = model.predict(f, imgsz=imgsz, device=device, verbose=False)[0]
            names = [r.names[int(c)] for c in r.boxes.cls.tolist()]
            results["runs"].append({"task": "detect", "weights": weights, "device": device, "imgsz": imgsz,
                                    "median_ms_per_frame": med, "sd_ms": sd,
                                    "detected": {n: names.count(n) for n in sorted(set(names))}})
            print(results["runs"][-1])

# Tracking overhead: full predict+track over the 60-frame sequence
model = YOLO("yolo26n.pt")
for tracker in ["bytetrack.yaml", "botsort.yaml"]:
    for device in ["cpu", "mps"]:
        s = time.perf_counter()
        ids = set()
        for f in frames:
            r = model.track(f, persist=True, tracker=tracker, imgsz=640, device=device, verbose=False)[0]
            if r.boxes.id is not None:
                ids.update(int(i) for i in r.boxes.id.tolist())
        total = (time.perf_counter() - s) * 1000
        model.predictor.trackers = None if hasattr(model, "predictor") and model.predictor else None
        model = YOLO("yolo26n.pt")  # reset tracker state
        results["runs"].append({"task": "detect+track", "tracker": tracker, "device": device, "weights": "yolo26n.pt",
                                "frames": len(frames), "ms_per_frame": round(total / len(frames), 1),
                                "unique_track_ids": len(ids)})
        print(results["runs"][-1])

(HERE / "results.json").write_text(json.dumps(results, indent=2))
print("saved")
