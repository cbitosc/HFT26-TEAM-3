"""Tracking metrics via `trackers.eval` (a maintained TrackEval port: CLEAR, Identity, HOTA). This module only adapts formats.

Input: per-frame lists of (object_id, box) for ground truth and for predictions, on the same frame sequence.
"""
import numpy as np


def _iou_matrix(a: list, b: list) -> np.ndarray:
    if not a or not b:
        return np.zeros((len(a), len(b)))
    A, B = np.array(a, float), np.array(b, float)
    ix1 = np.maximum(A[:, None, 0], B[None, :, 0])
    iy1 = np.maximum(A[:, None, 1], B[None, :, 1])
    ix2 = np.minimum(A[:, None, 2], B[None, :, 2])
    iy2 = np.minimum(A[:, None, 3], B[None, :, 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
    area = lambda X: (X[:, 2] - X[:, 0]) * (X[:, 3] - X[:, 1])  # noqa: E731
    return inter / np.maximum(area(A)[:, None] + area(B)[None, :] - inter, 1e-12)


def evaluate(gt_frames: list[list[tuple[int, list]]], pred_frames: list[list[tuple[int, list]]], threshold: float = 0.5) -> dict:
    from trackers.eval.clear import compute_clear_metrics
    from trackers.eval.hota import compute_hota_metrics
    from trackers.eval.identity import compute_identity_metrics

    if len(gt_frames) != len(pred_frames):
        raise ValueError("ground truth and predictions must cover the same frames")
    gt_ids = [np.array([i for i, _ in f], dtype=int) for f in gt_frames]
    pr_ids = [np.array([i for i, _ in f], dtype=int) for f in pred_frames]
    sims = [_iou_matrix([b for _, b in g], [b for _, b in p]) for g, p in zip(gt_frames, pred_frames)]
    clear = compute_clear_metrics(gt_ids, pr_ids, sims, threshold)
    ident = compute_identity_metrics(gt_ids, pr_ids, sims, threshold)
    hota = compute_hota_metrics(gt_ids, pr_ids, sims)
    pick = lambda d, keys: {k: (float(d[k]) if isinstance(d[k], (float, np.floating)) else int(d[k])) for k in keys if k in d}  # noqa: E731
    return pick(ident, ("IDF1", "IDR", "IDP")) | pick(clear, ("MOTA", "IDSW", "CLR_Re", "CLR_Pr", "Frag", "MT", "ML")) | pick(hota, ("HOTA", "DetA", "AssA"))
