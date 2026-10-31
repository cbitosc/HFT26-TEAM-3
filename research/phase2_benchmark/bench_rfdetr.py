"""RF-DETR (Apache-2.0 sizes) + roboflow `trackers` ByteTrack/BoT-SORT timing on the same sample."""
import json, statistics, time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).parent
img = cv2.imread(str(HERE / "bus.jpg"))
canvas = cv2.resize(img, (1600, 900))
frames = [canvas[90:810, 10 + 4 * i: 1290 + 4 * i].copy() for i in range(60)]
out = []

def timed(fn, n=20, warm=3):
    for _ in range(warm):
        fn()
    t = []
    for _ in range(n):
        s = time.perf_counter(); fn(); t.append((time.perf_counter() - s) * 1000)
    return round(statistics.median(t), 1)

import rfdetr
from rfdetr.assets.coco_classes import COCO_CLASSES

for cls_name in ["RFDETRNano", "RFDETRSmall"]:
    Model = getattr(rfdetr, cls_name, None)
    if Model is None:
        out.append({"model": cls_name, "error": "class not found"}); continue
    for device in ["cpu", "mps"]:
        try:
            m = Model(device=device)
            pil = Image.fromarray(cv2.cvtColor(frames[0], cv2.COLOR_BGR2RGB))
            ms = timed(lambda: m.predict(pil, threshold=0.5))
            det = m.predict(pil, threshold=0.5)
            names = [COCO_CLASSES[int(c)] for c in det.class_id]
            out.append({"model": cls_name, "device": device, "median_ms_per_frame": ms,
                        "detected": {n: names.count(n) for n in sorted(set(names))}})
        except Exception as e:  # record, don't hide
            out.append({"model": cls_name, "device": device, "error": f"{type(e).__name__}: {e}"[:300]})
        print(out[-1])

# Tracker-only overhead with roboflow `trackers` on detections from RF-DETR Nano (cpu)
try:
    import trackers
    m = rfdetr.RFDETRNano(device="cpu")
    dets = [m.predict(Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)), threshold=0.4) for f in frames]
    for tname in ["ByteTrackTracker", "BoTSORTTracker", "BotSortTracker"]:
        T = getattr(trackers, tname, None)
        if T is None:
            continue
        tr = T()
        ids = set(); s = time.perf_counter()
        for f, d in zip(frames, dets):
            try:
                r = tr.update(d, f)
            except TypeError:
                r = tr.update(d)
            if getattr(r, "tracker_id", None) is not None:
                ids.update(int(i) for i in r.tracker_id if i is not None and i >= 0)
        out.append({"tracker": tname, "tracker_only_ms_per_frame": round((time.perf_counter() - s) * 1000 / len(frames), 2),
                    "unique_track_ids": len(ids)})
        print(out[-1])
    out.append({"trackers_available": [n for n in dir(trackers) if n.endswith("Tracker")]})
    print(out[-1])
except Exception as e:
    out.append({"trackers_error": f"{type(e).__name__}: {e}"[:300]}); print(out[-1])

(HERE / "results_rfdetr.json").write_text(json.dumps(out, indent=2))
