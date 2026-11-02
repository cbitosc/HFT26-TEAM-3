"""One real accident video through the existing pipeline. Boxes come from the pinned detector, not from fixtures."""
import hashlib
import json
import os
from collections import Counter
from pathlib import Path

import cv2
import pytest

from app.services.detection import COCO_KEEP
from tests.conftest import MODELS, needs_weights

REAL = Path(os.environ.get(
    "TRACELINE_REAL_VIDEO",
    "/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/selected_accident.mp4",
))
REAL_SHA = "29567448e55c8810cc434349cf78c9202033622e038d8d9c03b426cd1d067b6b"
VEHICLE = {"car", "truck", "bus", "motorcycle", "bicycle"}

needs_real = pytest.mark.skipif(not REAL.is_file(), reason=f"real video not available at {REAL}")


def _summary(payload: dict) -> None:
    print("REAL_VIDEO_SUMMARY " + json.dumps(payload, default=str))


@needs_weights
@needs_real
def test_selected_accident_video_is_detected_tracked_and_reviewed(client):
    raw = REAL.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == REAL_SHA
    case = client.post("/api/v1/cases", json={
        "title": "ACCIDENT preview tbone (4)",
        "designation": "real",
        "description": "Fixed daylight intersection preview. Impact time is not established.",
    }).json()
    provenance = json.dumps({
        "source_url": "https://accidentbench.github.io/assets/videos/real-world/tbone%20(4).mp4",
        "source_name": "ACCIDENT benchmark preview, candidate-04 / selected_accident.mp4",
        "sha256": REAL_SHA,
    })
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("selected_accident.mp4", raw, "video/mp4")},
        data={"kind": "cctv", "synthetic": "false", "licence": "CC BY-NC-SA 4.0", "provenance": provenance},
    )
    assert uploaded.status_code == 201, uploaded.text
    eid = uploaded.json()["evidence"]["id"]

    detail = client.get(f"/api/v1/evidence/{eid}").json()
    video = detail["video"]
    assert detail["synthetic"] is False and detail["status"] == "valid"
    assert detail["sha256"] == REAL_SHA
    assert video["codec"] == "h264" and video["width"] == 2392 and video["height"] == 1352
    assert video["creation_time_claimed"] is None and video["rotation"] is None
    assert video["pts_start_ms"] is not None and video["playback_ready"] is True
    assert "not a verified or synchronized time" in video["note"]
    assert 15000 <= video["duration_ms"] <= 15200

    jobs = client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"]
    by_stage = {j["stage"]: j for j in jobs}
    for stage in ("validate", "preprocess", "detect", "track"):
        assert stage in by_stage, jobs
        assert by_stage[stage]["status"] in ("completed", "partially_completed"), by_stage[stage]
        assert by_stage[stage]["progress"] == 1.0
    assert by_stage["detect"]["result"]["detector"]["boxes"] > 0

    frames = client.get(f"/api/v1/evidence/{eid}/frames").json()
    assert frames["time_basis"].startswith("media time")
    assert frames["items"][0]["time_ms"] == 0
    assert all(item["time_ms"] >= 0 for item in frames["items"])
    sampled = {item["frame_no"] for item in frames["items"]}

    det = client.get(f"/api/v1/evidence/{eid}/detections?min_conf=0.15").json()
    classes = Counter(d["class"] for frame in det["items"] for d in frame["detections"] if not d["is_accident_cue"])
    assert VEHICLE & set(classes), classes
    assert set(classes) <= set(COCO_KEEP.values())
    w, h = det["frame_size"]["width"], det["frame_size"]["height"]
    for frame in det["items"]:
        assert frame["frame_no"] in sampled
        assert frame["time_ms"] >= 0
        for box in frame["detections"]:
            x1, y1, x2, y2 = box["bbox"]
            assert -1 <= x1 < x2 <= w + 1 and -1 <= y1 < y2 <= h + 1
            assert box["category"] == "machine_detection"
    runs = {r["stage"]: r for r in det["model_runs"]}
    assert runs["detect"]["model_id"] == "yolo26s"
    assert runs["detect"]["model_version"].startswith("sha256:646f8bc3fe0a")

    # The stored boxes for one frame are the detector's boxes, not a hand-written set.
    target = next(frame for frame in det["items"] if any(d["class"] in VEHICLE and d["confidence"] >= 0.25 for d in frame["detections"]))
    cap = cv2.VideoCapture(str(REAL))
    ok, img = False, None
    for _ in range(target["frame_no"] + 1):
        ok, img = cap.read()
    assert ok and img is not None
    from ultralytics import YOLO
    direct = YOLO(str(MODELS / "yolo26s.pt")).predict(img, imgsz=640, conf=0.25, device="cpu", verbose=False)[0]
    ref = sorted((COCO_KEEP[direct.names[int(c)]], [round(v) for v in b])
                 for b, c in zip(direct.boxes.xyxy.tolist(), direct.boxes.cls.tolist()) if direct.names[int(c)] in COCO_KEEP)
    ours = sorted((d["class"], [round(v) for v in d["bbox"]])
                  for d in target["detections"] if not d["is_accident_cue"] and d["confidence"] >= 0.25)
    assert [c for c, _ in ours] == [c for c, _ in ref]
    for (_, a), (_, b) in zip(ours, ref):
        assert max(abs(x - y) for x, y in zip(a, b)) <= 3

    tracks = client.get(f"/api/v1/evidence/{eid}/tracks").json()
    assert tracks["items"], "tracker returned no tracks"
    assert tracks["model_run"]["model_id"].startswith("trackers:")
    detail_track = client.get(f"/api/v1/tracks/{tracks['items'][0]['id']}").json()
    assert detail_track["coordinate_frame"] == "image pixels of this camera; not metres"
    assert detail_track["points"]
    assert all("time_ms" in p and len(p["bbox"]) == 4 for p in detail_track["points"])
    assert detail_track["points"][0]["time_ms"] >= 0

    events = client.get(f"/api/v1/evidence/{eid}/video-events").json()
    assert events["time_basis"].startswith("media time")
    kinds = Counter(item["event_type"] for item in events["items"])
    assert "collision" not in kinds
    for item in events["items"]:
        assert item["category"] == "machine_detection"
        assert item["t_start_ms"] <= item["t_end_ms"]
        assert item["source_ref"]["kind"] == "video_frames"
        assert item["observations"]["coordinate_frame"] == "image_pixels"
        if item["event_type"] in ("possible_collision", "possible_near_miss", "potential_interaction"):
            assert "not physical contact" in item["observations"]["note"]

    # A lone source is its own reference clock (offset 0). That is a clock relation of one file with itself, not a measured sync to another camera.
    built = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "single camera, own reference clock"}).json()
    assert built["unsynchronized_sources"] == []
    assert built["build"]["sync_groups"] == 1
    timeline = client.get(f"/api/v1/cases/{case['id']}/timeline").json()
    placed = [ev for lane in timeline["lanes"].values() for ev in lane]
    assert placed, "reconstruction dropped the source events"
    assert timeline["span_ms"][0] is not None and timeline["span_ms"][0] <= timeline["span_ms"][1]
    for ev in placed:
        assert ev["synchronized"] is True
        assert ev["start_ms"] is not None and ev["end_ms"] is not None
        assert "start_utc" not in ev and "end_utc" not in ev
        if ev["category"] == "machine_detection":
            src = ev["observations"]["source_time_ms"]
            assert ev["start_ms"] == round(src[0]) and ev["end_ms"] == round(src[1])
            assert ev["evidence_class"] == "derived_observation"
            assert ev["trace"]["complete"] is True and ev["trace"]["evidence_ids"] == [eid]
            assert ev["clocks"]["case_ms"][0] == ev["start_ms"]
            assert ev["clocks"]["synchronized_ms"] is None
            assert ev["clocks"]["media_ms"][0] == src[0]
        if ev["event_type"] == "possible_collision":
            assert ev["category"] == "machine_detection"
            assert "not physical contact" in ev["observations"]["note"]
    n_source = len(events["items"])
    n_timeline = len(timeline["unplaced"]) + len(placed)
    assert n_timeline >= n_source  # inferences may be added; source events are not dropped
    seek = client.get(f"/api/v1/cases/{case['id']}/seek", params={"case_ms": 0}).json()
    assert seek["unsynchronized"] == []
    assert seek["targets"] and seek["targets"][0]["evidence_id"] == eid
    assert seek["targets"][0]["media_ms"] == 0

    traj = client.get(f"/api/v1/cases/{case['id']}/trajectories").json()
    assert traj["items"]
    assert {row["frame"] for row in traj["items"]} == {"image"}
    for row in traj["items"]:
        assert row["points"]
        assert all(p["case_ms"] == round(p["source_ms"]) and p["source_ms"] >= 0 for p in row["points"])
        assert "pixel" in row["calibration_note"].lower()

    findings = client.get(f"/api/v1/cases/{case['id']}/findings").json()
    gap_rows = client.get(f"/api/v1/cases/{case['id']}/gaps").json()["items"]
    assert client.get(f"/api/v1/cases/{case['id']}/contradictions").json()["items"] == []
    checked = client.get(f"/api/v1/evidence/{eid}/original", params={"verify": True})
    assert checked.status_code == 200 and checked.headers["x-content-sha256"] == REAL_SHA
    created = client.post(f"/api/v1/cases/{case['id']}/reports", json={})
    assert created.status_code == 201, created.text
    report = created.json()
    assert report["validation"]["passed"] is True and report["has_pdf"] is True
    sections = report["content"]["sections"]
    assert len(sections) == 16 and sections[0]["title"] == "Case overview"
    assert "SYNTHETIC" not in sections[0]["facts"]["data_designation"]
    assert client.get(f"/api/v1/reports/{report['id']}/markdown").status_code == 200
    assert client.get(f"/api/v1/reports/{report['id']}/pdf").status_code == 200
    case_body = client.get(f"/api/v1/cases/{case['id']}").json()
    _summary({
        "case_id": case["id"],
        "evidence_id": eid,
        "sha256": REAL_SHA,
        "duration_ms": video["duration_ms"],
        "fps_nominal": video["fps_nominal"],
        "fps_measured": video["fps_measured"],
        "pts_start_ms": video["pts_start_ms"],
        "frame_count": video["frame_count"],
        "frames_indexed": by_stage["preprocess"]["result"].get("frames_indexed"),
        "frames_sampled": by_stage["preprocess"]["result"].get("frames_sampled"),
        "preprocess_status": by_stage["preprocess"]["status"],
        "preprocess_warnings": by_stage["preprocess"]["result"].get("warnings"),
        "detector_boxes": by_stage["detect"]["result"]["detector"].get("boxes"),
        "detector_by_class": by_stage["detect"]["result"]["detector"].get("by_class"),
        "detector_ms_per_frame": by_stage["detect"]["result"]["detector"].get("ms_per_frame"),
        "accident_cue": by_stage["detect"]["result"].get("accident_cue"),
        "detect_status": by_stage["detect"]["status"],
        "classes_at_0_15": dict(classes),
        "frames_with_boxes": len(det["items"]),
        "frames_considered": det["frames_considered"],
        "tracks": by_stage["track"]["result"].get("tracks"),
        "track_reliability": by_stage["track"]["result"].get("reliability"),
        "detections_tracked": by_stage["track"]["result"].get("detections_tracked"),
        "detections_considered": by_stage["track"]["result"].get("detections_considered"),
        "untracked": by_stage["track"]["result"].get("untracked"),
        "backfilled": by_stage["track"]["result"].get("backfilled"),
        "tracker": by_stage["track"]["result"].get("tracker"),
        "video_event_types": dict(kinds),
        "video_events": len(events["items"]),
        "timeline_unplaced": len(timeline["unplaced"]),
        "timeline_placed": len(placed),
        "span_ms": timeline["span_ms"],
        "seek_targets": seek["targets"],
        "gap_types": [g["gap_type"] for g in gap_rows],
        "gap_details": [{k: g[k] for k in ("gap_type", "details", "recommendation")} for g in gap_rows],
        "trajectories": len(traj["items"]),
        "trajectory_points": sum(len(row["points"]) for row in traj["items"]),
        "findings": len(findings["items"]),
        "finding_kinds": dict(Counter(f["kind"] for f in findings["items"])),
        "build": built.get("build"),
        "jobs_failed": case_body["counts"]["jobs_failed"],
    })
