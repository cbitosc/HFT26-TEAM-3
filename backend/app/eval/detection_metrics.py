"""Detection metrics computed independently of Ultralytics (used to check our inference path, and later for BDD100K)."""
import numpy as np


def iou(a, b) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def match(preds: list[tuple], gts: dict, thr: float = 0.5) -> tuple[np.ndarray, np.ndarray, int]:
    """preds: [(image_id, confidence, box)], gts: {image_id: [box]}. Greedy by confidence, one match per ground truth.
    Returns (confidences, true-positive flags) sorted by confidence desc, and the ground-truth count."""
    order = sorted(preds, key=lambda p: -p[1])
    used = {k: [False] * len(v) for k, v in gts.items()}
    conf, tp = [], []
    for img, c, box in order:
        best, best_j = 0.0, -1
        for j, g in enumerate(gts.get(img, [])):
            if not used[img][j]:
                o = iou(box, g)
                if o > best:
                    best, best_j = o, j
        hit = best >= thr
        if hit:
            used[img][best_j] = True
        conf.append(c)
        tp.append(hit)
    return np.array(conf), np.array(tp, dtype=bool), sum(len(v) for v in gts.values())


def average_precision(tp: np.ndarray, n_gt: int) -> float:
    """101-point interpolated AP (COCO style), from TP flags already sorted by confidence."""
    if n_gt == 0:
        return float("nan")
    if tp.size == 0:
        return 0.0
    ctp = np.cumsum(tp)
    recall = ctp / n_gt
    precision = ctp / np.arange(1, len(tp) + 1)
    # precision drops to 0 right after the highest recall actually reached; without the extra sentinel, interpolation
    # would draw a line to recall 1.0 and credit recall the detector never achieved (inflating AP)
    mrec = np.concatenate(([0.0], recall, [recall[-1]], [1.0]))
    mpre = np.concatenate(([1.0], precision, [0.0], [0.0]))
    mpre = np.flip(np.maximum.accumulate(np.flip(mpre)))  # precision envelope
    x = np.linspace(0, 1, 101)
    return float(np.trapezoid(np.interp(x, mrec, mpre), x))


def precision_recall_at(conf: np.ndarray, tp: np.ndarray, n_gt: int, threshold: float) -> tuple[float, float]:
    keep = conf >= threshold
    k = int(keep.sum())
    hits = int(tp[keep].sum())
    return (hits / k if k else 0.0), (hits / n_gt if n_gt else 0.0)


def ap50(preds: list[tuple], gts: dict) -> float:
    _, tp, n = match(preds, gts, 0.5)
    return average_precision(tp, n)
