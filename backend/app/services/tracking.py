"""Multi-object tracking over stored detections, plus deterministic post-processing.

Association uses `roboflow/trackers` (Apache-2.0, detector-independent): ByteTrack for fixed CCTV, BoT-SORT with camera-motion
compensation for dashcams. Track IDs are per video and per run only; they never claim identity across cameras.

Post-processing never invents observations. It records gaps, short tracks, possible identity switches, overlaps (occlusion
risk), border exits, and *candidate* continuations between tracks (kept as candidates, never merged).
One deterministic correction is applied: both trackers withhold an object's first detection while confirming a new track
(measured in Phase 5), which would make every track start one sampled frame late. That detection is re-attached when it is
unambiguous, and marked `backfilled`.
"""
from collections import Counter
from dataclasses import dataclass, field

import numpy as np

TRACK_CLASSES = ("bicycle", "bus", "car", "motorcycle", "pedestrian", "truck")
TRACKING_VERSION = "1"


@dataclass(frozen=True)
class Det:
    id: int
    frame_no: int
    time_ms: int
    cls: str
    conf: float
    box: tuple[float, float, float, float]


@dataclass
class Frame:
    frame_no: int
    time_ms: int
    dets: list[Det] = field(default_factory=list)


def iou(a, b) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def default_params(kind: str, fps: float) -> dict:
    return {"tracker": "botsort" if kind == "dashcam" else "bytetrack", "sample_fps": fps, "activation": 0.3, "high_conf": 0.5,
            "lost_buffer_s": 2.0, "min_conf": 0.15, "classes": list(TRACK_CLASSES), "backfill_iou": 0.3,
            "continuation_max_gap_ms": 2000, "continuation_max_dist_diag": 2.0, "switch_jump_diag": 1.5, "overlap_iou": 0.5,
            "version": TRACKING_VERSION}


def make_tracker(p: dict):
    import trackers

    common = {"lost_track_buffer": max(1, int(round(p["lost_buffer_s"] * 30))),  # trackers: buffer/30 = seconds without update
              "frame_rate": float(p["sample_fps"]), "track_activation_threshold": p["activation"],
              "minimum_consecutive_frames": 1, "high_conf_det_threshold": p["high_conf"]}
    if p["tracker"] == "botsort":
        return trackers.BoTSORTTracker(**common, enable_cmc=True, cmc_method="sparseOptFlow")
    if p["tracker"] == "bytetrack":
        return trackers.ByteTrackTracker(**common)
    raise ValueError(f"unknown tracker {p['tracker']}")


def associate(frames: list[Frame], tracker, images=None, progress=None) -> dict[int, int]:
    """Feed every sampled frame (empty ones too, so time advances) in order. Returns {detection_id: raw_track_id}.

    `progress(done, total)` is called after each sampled frame is given to the tracker. It is not a clock."""
    import supervision as sv

    classes = {c: i for i, c in enumerate(TRACK_CLASSES)}
    image_iter = iter(images) if images is not None else None
    out: dict[int, int] = {}
    total = len(frames)
    for done, fr in enumerate(frames, start=1):
        img = None
        if image_iter is not None:
            idx, img = next(image_iter)
            if idx != fr.frame_no:
                raise RuntimeError(f"frame image order mismatch: expected {fr.frame_no}, got {idx}")
        if fr.dets:
            det = sv.Detections(xyxy=np.array([d.box for d in fr.dets], dtype=float), confidence=np.array([d.conf for d in fr.dets]),
                                class_id=np.array([classes[d.cls] for d in fr.dets]), data={"det_id": np.array([d.id for d in fr.dets])})
        else:
            det = sv.Detections.empty()
            det.data["det_id"] = np.array([], dtype=int)
        res = tracker.update(det, frame=img, timestamp=fr.time_ms / 1000.0)
        if res.tracker_id is not None and len(res):
            for did, tid in zip(res.data["det_id"], res.tracker_id):
                if tid is not None and int(tid) >= 0:
                    out[int(did)] = int(tid)
        if progress is not None and total:
            progress(done, total)
    return out


def _bottom_center(b) -> tuple[float, float]:
    return ((b[0] + b[2]) / 2, b[3])


def _diag(b) -> float:
    return float(np.hypot(b[2] - b[0], b[3] - b[1]))


def build_tracks(frames: list[Frame], assign: dict[int, int], p: dict, frame_size: tuple[int, int] | None = None) -> tuple[list[dict], list[dict]]:
    """Turn raw assignments into track records with continuity metadata. Returns (tracks, continuation_candidates)."""
    order = {fr.frame_no: i for i, fr in enumerate(frames)}
    det_by_id = {d.id: d for fr in frames for d in fr.dets}
    members: dict[int, list[Det]] = {}
    for did, tid in assign.items():
        members.setdefault(tid, []).append(det_by_id[did])
    for m in members.values():
        m.sort(key=lambda d: d.frame_no)

    # backfill the withheld first observation (unambiguous only)
    used = set(assign)
    backfilled: set[int] = set()
    for tid, m in members.items():
        first = m[0]
        i = order[first.frame_no]
        if i == 0:
            continue
        prev = frames[i - 1]
        cands = [d for d in prev.dets if d.id not in used and d.cls == first.cls and iou(d.box, first.box) >= p["backfill_iou"]]
        if len(cands) == 1:
            m.insert(0, cands[0])
            used.add(cands[0].id)
            backfilled.add(cands[0].id)

    by_frame: dict[int, list[tuple[int, Det]]] = {}
    for tid, m in members.items():
        for d in m:
            by_frame.setdefault(d.frame_no, []).append((tid, d))

    tracks = []
    w, h = frame_size or (None, None)
    for out_id, (tid, m) in enumerate(sorted(members.items(), key=lambda kv: (kv[1][0].frame_no, kv[0])), start=1):
        votes = Counter(d.cls for d in m)
        gaps, flags = [], []
        for a, b in zip(m, m[1:]):
            missing = order[b.frame_no] - order[a.frame_no] - 1
            if missing > 0:
                gaps.append({"after_frame": a.frame_no, "before_frame": b.frame_no, "missing_sampled_frames": missing,
                             "duration_ms": b.time_ms - a.time_ms})
            (ax, ay), (bx, by) = _bottom_center(a.box), _bottom_center(b.box)
            steps = order[b.frame_no] - order[a.frame_no]
            if np.hypot(bx - ax, by - ay) > p["switch_jump_diag"] * _diag(a.box) * steps:
                flags.append({"type": "possible_identity_switch", "between_frames": [a.frame_no, b.frame_no],
                              "reason": "position jump larger than plausible for the elapsed frames"})
        overlaps = sorted({(other, d.frame_no) for d in m for other, od in by_frame.get(d.frame_no, [])
                           if other != tid and iou(d.box, od.box) >= p["overlap_iou"]})
        last = m[-1].box
        at_border = bool(w and h and (last[0] <= 0.02 * w or last[1] <= 0.02 * h or last[2] >= 0.98 * w or last[3] >= 0.98 * h))
        reliability = ("short" if len(m) < 3 else "id_switch_suspected" if flags else "fragmented" if gaps else "stable")
        tracks.append({
            "track_id": out_id, "raw_tracker_id": tid, "class": votes.most_common(1)[0][0], "class_votes": dict(votes),
            "first_frame": m[0].frame_no, "last_frame": m[-1].frame_no, "first_ms": m[0].time_ms, "last_ms": m[-1].time_ms,
            "duration_ms": m[-1].time_ms - m[0].time_ms, "mean_confidence": round(float(np.mean([d.conf for d in m])), 4),
            "points": [{"frame_no": d.frame_no, "time_ms": d.time_ms, "bbox": list(d.box), "anchor": list(_bottom_center(d.box)),
                        "confidence": d.conf, "detection_id": d.id, "backfilled": d.id in backfilled} for d in m],
            "continuity": {"observations": len(m), "gaps": gaps, "flags": flags, "reliability": reliability,
                           "overlaps_with": [{"raw_tracker_id": o, "frame_no": f} for o, f in overlaps][:50],
                           "ends_at_frame_border": at_border, "backfilled_first_observation": m[0].id in backfilled},
        })

    # candidate continuations: same class, short time gap, nearby position. Never merged automatically.
    cands = []
    for a in tracks:
        for b in tracks:
            if a is b or a["class"] != b["class"]:
                continue
            dt = b["first_ms"] - a["last_ms"]
            if 0 < dt <= p["continuation_max_gap_ms"]:
                la, fb = a["points"][-1], b["points"][0]
                dist = float(np.hypot(fb["anchor"][0] - la["anchor"][0], fb["anchor"][1] - la["anchor"][1]))
                if dist <= p["continuation_max_dist_diag"] * _diag(la["bbox"]):
                    cands.append({"from_track": a["track_id"], "to_track": b["track_id"], "gap_ms": dt, "distance_px": round(dist, 1),
                                  "status": "candidate", "basis": "same class, short gap, nearby position; not merged"})
    return tracks, cands


def propose_cross_camera_matches(tracks: list[dict]) -> list:
    """Tracker ids are per video and per run. Equal integers are not a match and produce no association."""
    return []
