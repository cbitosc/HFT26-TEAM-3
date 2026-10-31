"""Phase 5: tracking over stored detections, post-processing, metrics adapter, tracks/overlays API."""
import numpy as np
import pytest

from app.eval.tracking_metrics import evaluate
from app.services import tracking
from app.services.tracking import Det, Frame, associate, build_tracks, default_params, make_tracker
from tests.conftest import needs_weights

FPS = 5
STEP = 1000 // FPS


def scene(objects, n_frames, jitter=0.0, miss=(), seed=0):
    """objects: [(gt_id, start, end, x0, y0, vx, vy, w, h, cls)]. miss: {(gt_id, frame)} to drop. Returns (frames, gt_frames, det_gt)."""
    rng = np.random.default_rng(seed)
    frames, gt_frames, det_gt, did = [], [], {}, 0
    for k in range(n_frames):
        fr, gts = Frame(k, k * STEP), []
        for gid, start, end, x0, y0, vx, vy, w, h, cls in objects:
            if start <= k <= end:
                x, y = x0 + vx * (k - start), y0 + vy * (k - start)
                box = (x, y, x + w, y + h)
                gts.append((gid, list(box)))
                if (gid, k) not in miss:
                    did += 1
                    j = rng.normal(0, jitter, 4) if jitter else np.zeros(4)
                    noisy = tuple(float(v) for v in np.array(box) + j)
                    fr.dets.append(Det(did, k, k * STEP, cls, float(np.clip(0.8 + rng.normal(0, 0.05), 0.35, 0.99)), noisy))
                    det_gt[did] = gid
        frames.append(fr)
        gt_frames.append(gts)
    return frames, gt_frames, det_gt


def run(frames, name="bytetrack", **overrides):
    p = default_params("cctv", FPS) | {"tracker": name} | overrides
    images = ((f.frame_no, np.zeros((480, 640, 3), np.uint8)) for f in frames) if name == "botsort" else None
    return build_tracks(frames, associate(frames, make_tracker(p), images), p, (640, 480))


def as_pred_frames(frames, tracks):
    by_frame = {f.frame_no: [] for f in frames}
    for t in tracks:
        for pt in t["points"]:
            by_frame[pt["frame_no"]].append((t["track_id"], pt["bbox"]))
    return [by_frame[f.frame_no] for f in frames]


CROSSING = [(1, 0, 14, 20, 100, 30, 0, 60, 40, "car"), (2, 2, 14, 470, 100, -30, 0, 60, 60, "car")]


# --------------------------------------------------------------------------------------- association + backfill
@pytest.mark.parametrize("name", ["bytetrack", "botsort"])
def test_crossing_objects_keep_identity_and_every_observation(name):
    frames, gt, _ = scene(CROSSING, 15)
    tracks, cands = run(frames, name)
    assert len(tracks) == 2 and cands == []
    assert sorted(t["continuity"]["observations"] for t in tracks) == [13, 15]  # nothing lost, including first frames
    assert sorted(t["first_frame"] for t in tracks) == [0, 2]
    m = evaluate(gt, as_pred_frames(frames, tracks))
    assert m["IDF1"] == pytest.approx(1.0) and m["IDSW"] == 0 and m["MOTA"] == pytest.approx(1.0)


def test_backfill_is_what_restores_the_first_observation():
    frames, _, _ = scene(CROSSING, 15)
    tracks, _ = run(frames, "bytetrack", backfill_iou=1.01)  # impossible threshold = backfill off
    assert sorted(t["first_frame"] for t in tracks) == [1, 3]  # the library withholds each new object's first detection
    tracks, _ = run(frames, "bytetrack")
    assert sorted(t["first_frame"] for t in tracks) == [0, 2]
    assert all(t["points"][0]["backfilled"] for t in tracks)


# --------------------------------------------------------------------------------------- gaps and continuations
def test_short_occlusion_is_one_track_with_a_recorded_gap():
    obj = [(1, 0, 19, 20, 100, 20, 0, 60, 40, "car")]
    frames, gt, _ = scene(obj, 20, miss={(1, k) for k in (8, 9, 10)})  # 600 ms missing, inside the 2 s buffer
    tracks, _ = run(frames)
    assert len(tracks) == 1
    gaps = tracks[0]["continuity"]["gaps"]
    assert len(gaps) == 1 and gaps[0]["missing_sampled_frames"] == 3 and gaps[0]["duration_ms"] == 4 * STEP
    assert tracks[0]["continuity"]["reliability"] == "fragmented"
    assert not any(pt["frame_no"] in (8, 9, 10) for pt in tracks[0]["points"])  # no invented positions


def test_long_absence_gives_separate_tracks_and_a_candidate_never_a_merge():
    obj = [(1, 0, 29, 20, 100, 6, 0, 60, 40, "car")]
    frames, gt, _ = scene(obj, 30, miss={(1, k) for k in range(8, 20)})  # 2.4 s missing: beyond the buffer
    tracks, cands = run(frames, lost_buffer_s=1.0, continuation_max_gap_ms=3000)
    assert len(tracks) == 2
    assert len(cands) == 1 and cands[0]["status"] == "candidate" and cands[0]["from_track"] != cands[0]["to_track"]
    assert evaluate(gt, as_pred_frames(frames, tracks))["IDF1"] < 1.0  # honest: the identity break is visible in the metric


# --------------------------------------------------------------------------------------- post-processing flags
def test_position_jump_is_flagged_as_possible_identity_switch():
    frames = [Frame(k, k * STEP, [Det(k + 1, k, k * STEP, "car", 0.9, (20 + 10 * k + (400 if k >= 5 else 0), 100, 80 + 10 * k + (400 if k >= 5 else 0), 140))])
              for k in range(8)]
    tracks, _ = build_tracks(frames, {k + 1: 7 for k in range(8)}, default_params("cctv", FPS), (640, 480))
    flags = tracks[0]["continuity"]["flags"]
    assert tracks[0]["continuity"]["reliability"] == "id_switch_suspected"
    assert flags and flags[0]["type"] == "possible_identity_switch" and flags[0]["between_frames"] == [4, 5]


def test_border_exit_overlap_and_short_tracks():
    exiting = [(1, 0, 9, 400, 100, 30, 0, 60, 40, "car")]  # reaches the right edge
    frames, _, _ = scene(exiting, 10)
    t = run(frames)[0][0]
    assert t["continuity"]["ends_at_frame_border"] is True

    frames = [Frame(k, k * STEP, [Det(2 * k + 1, k, k * STEP, "car", 0.9, (100, 100, 200, 160)),
                                  Det(2 * k + 2, k, k * STEP, "car", 0.9, (105, 102, 205, 162))]) for k in range(4)]
    assign = {2 * k + 1: 1 for k in range(4)} | {2 * k + 2: 2 for k in range(4)}
    tracks, _ = build_tracks(frames, assign, default_params("cctv", FPS), (640, 480))
    assert all(tr["continuity"]["overlaps_with"] for tr in tracks)

    frames = [Frame(0, 0, [Det(1, 0, 0, "car", 0.9, (10, 10, 50, 50))]), Frame(1, STEP, [Det(2, 1, STEP, "car", 0.9, (12, 10, 52, 50))])]
    assert build_tracks(frames, {1: 1, 2: 1}, default_params("cctv", FPS))[0][0]["continuity"]["reliability"] == "short"


@pytest.mark.parametrize("name", ["bytetrack", "botsort"])
def test_noisy_detections_still_track_well(name):
    objs = [(1, 0, 24, 20, 80, 18, 2, 70, 45, "car"), (2, 3, 24, 560, 200, -20, 0, 70, 50, "car"),
            (3, 0, 24, 300, 380, 2, -6, 30, 70, "pedestrian")]
    miss = {(1, 7), (2, 12), (2, 13), (3, 18)}
    frames, gt, _ = scene(objs, 25, jitter=2.0, miss=miss, seed=3)
    tracks, _ = run(frames, name)
    m = evaluate(gt, as_pred_frames(frames, tracks))
    assert m["IDF1"] >= 0.9 and m["IDSW"] == 0, m


# --------------------------------------------------------------------------------------- metrics adapter
def test_metrics_adapter_catches_an_identity_swap():
    gt = [[(1, [0, 0, 10, 10]), (2, [50, 0, 60, 10])] for _ in range(6)]
    perfect = [[(7, [0, 0, 10, 10]), (8, [50, 0, 60, 10])] for _ in range(6)]
    swapped = perfect[:3] + [[(8, [0, 0, 10, 10]), (7, [50, 0, 60, 10])] for _ in range(3)]
    assert evaluate(gt, perfect)["IDF1"] == pytest.approx(1.0)
    m = evaluate(gt, swapped)
    assert m["IDSW"] == 2 and m["IDF1"] == pytest.approx(0.5)
    with pytest.raises(ValueError):
        evaluate(gt, perfect[:-1])


# --------------------------------------------------------------------------------------- end to end
def make_case(client):
    return client.post("/api/v1/cases", json={"title": "Tracking test", "designation": "synthetic"}).json()


def upload(client, case_id, path, kind):
    r = client.post(f"/api/v1/cases/{case_id}/evidence", files={"file": (path.name, path.read_bytes())}, data={"kind": kind, "synthetic": "true"})
    assert r.status_code == 201, r.text
    return r.json()["evidence"]["id"]


def job(client, case_id, stage):
    return next(j for j in client.get(f"/api/v1/cases/{case_id}/jobs").json()["items"] if j["stage"] == stage)


@needs_weights
@pytest.mark.parametrize("kind,expected", [("cctv", "bytetrack"), ("dashcam", "botsort")])
def test_full_chain_tracks_the_bus(client, bus_video, kind, expected):
    case = make_case(client)
    eid = upload(client, case["id"], bus_video, kind)
    tj = job(client, case["id"], "track")
    assert tj["status"] == "completed" and tj["result"]["tracker"] == expected
    tracks = client.get(f"/api/v1/evidence/{eid}/tracks").json()
    buses = [t for t in tracks["items"] if t["class"] == "bus"]
    sampled = len(client.get(f"/api/v1/evidence/{eid}/frames").json()["items"])
    assert len(buses) == 1 and buses[0]["observations"] == sampled and buses[0]["reliability"] == "stable"  # one identity, every frame
    assert "do not establish" in tracks["note"]

    detail = client.get(f"/api/v1/tracks/{buses[0]['id']}").json()
    assert len(detail["points"]) == sampled and detail["coordinate_frame"].startswith("image pixels")
    times = [p["time_ms"] for p in detail["points"]]
    assert times == sorted(times)

    ov = client.get(f"/api/v1/evidence/{eid}/overlays?from_ms=0&to_ms=3000").json()
    bus_boxes = [b for f in ov["items"] for b in f["boxes"] if b["class"] == "bus"]
    assert bus_boxes and {b["track_id"] for b in bus_boxes} == {buses[0]["track_id"]}
    assert client.get(f"/api/v1/evidence/{eid}/overlays?from_ms=5000&to_ms=1000").status_code == 422


@needs_weights
def test_tracking_rerun_is_idempotent(client, bus_video):
    case = make_case(client)
    upload(client, case["id"], bus_video, "cctv")
    again = client.post(f"/api/v1/cases/{case['id']}/process", json={"stages": ["track"]}).json()["jobs"][0]
    assert "reused_model_run" in client.get(f"/api/v1/jobs/{again['id']}").json()["result"]


def test_equal_tracker_ids_are_not_the_same_vehicle():
    """Synthetic tracks. The same integer on two cameras is not an identity and not a match."""
    tracks = [
        {"evidence_id": "ev_a", "model_run_id": "run_a", "track_id": 1, "class": "car"},
        {"evidence_id": "ev_b", "model_run_id": "run_b", "track_id": 1, "class": "car"},
    ]
    assert tracking.propose_cross_camera_matches(tracks) == []


def test_tracking_needs_a_detector_run(client, sample_video, tmp_path):
    client.settings.models_dir = tmp_path / "no_models"  # detection fails, so no detector run exists
    case = make_case(client)
    eid = upload(client, case["id"], sample_video, "cctv")
    r = client.post(f"/api/v1/cases/{case['id']}/process", json={"stages": ["track"]}).json()["jobs"][0]
    j = client.get(f"/api/v1/jobs/{r['id']}").json()
    assert j["status"] == "failed" and "no finished detector run" in j["error"]["message"]
    assert client.get(f"/api/v1/evidence/{eid}/tracks").status_code == 409
