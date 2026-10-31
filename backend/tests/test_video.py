"""Phase 3: frame index, sampling, thumbnails, playback copy, frame-accurate stills, interval reprocessing."""
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.services import jobs
from app.services import video as vid


def make_case(client):
    return client.post("/api/v1/cases", json={"title": "Video test", "designation": "synthetic"}).json()


def upload_video(client, case_id, path, kind="dashcam"):
    r = client.post(f"/api/v1/cases/{case_id}/evidence", files={"file": (path.name, path.read_bytes())}, data={"kind": kind, "synthetic": "true"})
    assert r.status_code == 201, r.text
    return r.json()["evidence"]["id"]


def decoded_frame_times_ms(path) -> list[float]:
    """Independent reference: timestamps of *decoded* frames (not the packet scan the implementation uses), relative to the first."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time",
                          "-of", "json", str(path)], capture_output=True, text=True).stdout
    t = sorted(float(f["best_effort_timestamp_time"]) for f in json.loads(out)["frames"])
    return [(x - t[0]) * 1000 for x in t]


def probe(path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,start_time",
                          "-of", "json", str(path)], capture_output=True, text=True).stdout
    return json.loads(out)["streams"][0]


def all_frames(client, eid):
    return client.get(f"/api/v1/evidence/{eid}/frames?sampled=false&limit=5000").json()["items"]


def jobs_of(client, case_id, stage):
    return [j for j in client.get(f"/api/v1/cases/{case_id}/jobs").json()["items"] if j["stage"] == stage]


# --------------------------------------------------------------------------------------------- pure sampling
def test_choose_sampled_regular_gap_and_limits():
    rel = [i * 1000 / 15 for i in range(30)]  # 15 fps, 2 s
    idx, truncated = vid.choose_sampled(rel, 5, 1000)
    assert idx == list(range(0, 30, 3)) and not truncated
    assert vid.choose_sampled(rel, 30, 1000)[0] == list(range(30))  # above native rate: every frame, no duplicates
    assert vid.choose_sampled(rel, 5, 4) == ([0, 3, 6, 9], True)
    assert vid.choose_sampled([], 5, 10) == ([], False)

    gap = [t for i, t in enumerate(rel) if not 8 <= i <= 22]  # ~1 s with no frames
    g_idx, _ = vid.choose_sampled(gap, 5, 1000)
    times = [gap[i] for i in g_idx]
    assert not any(rel[8] <= t <= rel[22] for t in times)  # nothing invented inside the gap
    assert len(g_idx) == len(set(g_idx))
    # no bunching at the gap edges: exactly one sample per grid point that has a real frame within half a step
    step = 200.0
    grid = [gap[0] + k * step for k in range(int(gap[-1] // step) + 1)]
    assert len(g_idx) == sum(1 for g in grid if any(abs(t - g) <= step / 2 for t in gap))
    assert all(min(abs(gap[i] - g) for g in grid) <= step / 2 for i in g_idx)


def test_decoder_timing_mismatch_is_measured(sample_video, tmp_path):
    pts = vid.probe_frame_pts(sample_video)
    rel = [(t - pts[0]) * 1000 for t in pts]
    assert vid.decode_selected(sample_video, set(), tmp_path, 320, rel)["max_pts_deviation_ms"] <= 0.01
    shifted = [r + (100 if i >= 10 else 0) for i, r in enumerate(rel)]  # container claims a 100 ms jump the decoder never sees
    assert 99 <= vid.decode_selected(sample_video, set(), tmp_path, 320, shifted)["max_pts_deviation_ms"] <= 101


def test_timing_mismatch_makes_preprocess_partial(client, sample_video, monkeypatch):
    real = vid.decode_selected

    def drifting(*a, **k):
        out = real(*a, **k)
        out["max_pts_deviation_ms"] = 250.0
        return out

    monkeypatch.setattr(vid, "decode_selected", drifting)
    case = make_case(client)
    upload_video(client, case["id"], sample_video)
    pre = jobs_of(client, case["id"], "preprocess")[0]
    assert pre["status"] == "partially_completed" and any("decoder timing differs" in w for w in pre["result"]["warnings"])


# --------------------------------------------------------------------------------------------- end-to-end preprocess
def test_preprocess_builds_exact_frame_index_thumbnails_and_playback(client, sample_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], sample_video)

    pre = jobs_of(client, case["id"], "preprocess")
    assert len(pre) == 1 and pre[0]["status"] == "completed", pre
    assert pre[0]["result"]["frames_indexed"] == 30 and pre[0]["result"]["warnings"] == []

    frames = all_frames(client, eid)
    reference = decoded_frame_times_ms(sample_video)
    assert [f["frame_no"] for f in frames] == list(range(30))
    assert max(abs(f["time_ms"] - r) for f, r in zip(frames, reference)) <= 1  # ms rounding only

    sampled = [f for f in frames if f["sampled"]]
    assert [f["frame_no"] for f in sampled] == list(range(0, 30, 3))  # 5 fps out of 15
    assert all(f["blur"] > 0 and 0 <= f["brightness"] <= 255 for f in sampled)
    thumb = client.get(sampled[0]["thumbnail_url"])
    assert thumb.status_code == 200 and thumb.content[:3] == b"\xff\xd8\xff"  # JPEG
    assert cv2.imdecode(np.frombuffer(thumb.content, np.uint8), cv2.IMREAD_COLOR).shape[1] <= 320

    ev = client.get(f"/api/v1/evidence/{eid}").json()
    assert ev["video"]["playback_ready"] and ev["video"]["pts_start_ms"] == 0 and "stream" in ev["links"]
    r = client.get(ev["links"]["stream"], headers={"Range": "bytes=0-499"})
    assert r.status_code == 206 and r.headers["x-evidence-role"] == "derived-playback-copy"


def test_original_is_untouched_and_derived_files_are_separate(client, sample_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], sample_video)
    ev = client.get(f"/api/v1/evidence/{eid}").json()
    assert hashlib.sha256(client.get(ev["links"]["original"]).content).hexdigest() == ev["sha256"] == hashlib.sha256(sample_video.read_bytes()).hexdigest()
    store = client.settings.storage_path
    assert [p.name for p in (store / "originals").rglob("*") if p.is_file()] == [ev["sha256"]]
    derived = [p for p in (store / "derived").rglob("*") if p.is_file()]
    assert any(p.name == "playback.mp4" for p in derived) and any(p.suffix == ".jpg" for p in derived)


def test_offset_start_is_recorded_and_playback_starts_at_zero(client, offset_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], offset_video)
    ev = client.get(f"/api/v1/evidence/{eid}").json()
    assert 2300 <= ev["video"]["pts_start_ms"] <= 2600  # container start offset kept separately
    frames = all_frames(client, eid)
    assert frames[0]["time_ms"] == 0 and len(frames) == 30
    playback = client.settings.storage_path / next(p for p in (client.settings.storage_path / "derived").rglob("playback.mp4"))
    info = probe(playback)
    assert info["codec_name"] == "h264" and abs(float(info["start_time"])) < 0.001
    pre = jobs_of(client, case["id"], "preprocess")[0]["result"]["playback"]
    assert pre["mode"] == "transcode" and pre["timing_preserved"] and pre["frames_copy"] == pre["frames_source"] == 30


def test_non_browser_codec_is_transcoded(client, mkv_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], mkv_video, kind="cctv")
    pre = jobs_of(client, case["id"], "preprocess")[0]
    assert pre["status"] == "completed" and pre["result"]["playback"]["mode"] == "transcode"
    stream = client.get(f"/api/v1/evidence/{eid}/stream")
    path = client.settings.storage_path / "check.mp4"
    path.write_bytes(stream.content)
    assert probe(path)["codec_name"] == "h264" and probe(path)["pix_fmt"] == "yuv420p"


def test_gap_is_preserved_and_not_sampled(client, gappy_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], gappy_video, kind="cctv")
    frames = all_frames(client, eid)
    assert len(frames) == 44
    steps = [b["time_ms"] - a["time_ms"] for a, b in zip(frames, frames[1:])]
    big = max(steps)
    assert big >= 1000  # the missing second is visible in the frame index, not papered over
    gap_start = frames[steps.index(big)]["time_ms"]
    assert not any(gap_start < f["time_ms"] < gap_start + big for f in frames if f["sampled"])
    sampled_times = [f["time_ms"] for f in frames if f["sampled"]]
    grid = [k * 200 for k in range(frames[-1]["time_ms"] // 200 + 1)]
    assert len(sampled_times) == sum(1 for g in grid if any(abs(f["time_ms"] - g) <= 100 for f in frames))  # 5 fps grid, no edge bunching
    assert client.get(f"/api/v1/evidence/{eid}").json()["validation"]["checks"]["pts_gap_count"] >= 1


# --------------------------------------------------------------------------------------------- stills and intervals
def test_full_frame_is_frame_accurate_and_cached(client, sample_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], sample_video)
    frames = all_frames(client, eid)
    target = frames[17]  # an unsampled frame
    r = client.get(target["full_url"])
    assert r.status_code == 200 and r.headers["x-frame-no"] == "17"
    img = cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR).astype(int)
    assert img.shape[:2] == (240, 320)
    cap = cv2.VideoCapture(str(sample_video))
    decoded = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        decoded.append(fr.astype(int))
    assert min(range(len(decoded)), key=lambda j: np.abs(decoded[j] - img).mean()) == 17
    assert client.get(target["full_url"]).content == r.content  # cached derived file


def test_interval_reprocess_samples_every_frame_in_range(client, sample_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], sample_video)
    unsampled = next(f for f in all_frames(client, eid) if not f["sampled"])
    miss = client.get(f"/api/v1/frames/{unsampled['id']}/image")
    assert miss.status_code == 404 and miss.json()["error"]["code"] == "THUMBNAIL_NOT_AVAILABLE"

    assert client.post(f"/api/v1/evidence/{eid}/reprocess", json={"from_ms": 900, "to_ms": 100}).status_code == 422
    r = client.post(f"/api/v1/evidence/{eid}/reprocess", json={"from_ms": 600, "to_ms": 1000})
    assert r.status_code == 202
    job = client.get(f"/api/v1/jobs/{r.json()['id']}").json()
    assert job["status"] == "completed" and job["result"]["frames_extracted"] == job["result"]["frames_requested"] > 0
    inside = [f for f in all_frames(client, eid) if 600 <= f["time_ms"] <= 1000]
    assert inside and all(f["sampled"] and f["thumbnail_url"] for f in inside)
    times_before = [f["time_ms"] for f in all_frames(client, eid)]
    assert times_before == sorted(times_before)  # frame times unchanged by reprocessing


def test_process_is_idempotent_and_new_parameters_add_samples(client, sample_video):
    case = make_case(client)
    eid = upload_video(client, case["id"], sample_video)
    before = sum(f["sampled"] for f in all_frames(client, eid))

    same = client.post(f"/api/v1/cases/{case['id']}/process", json={}).json()["jobs"][0]
    assert client.get(f"/api/v1/jobs/{same['id']}").json()["result"].get("reused_model_run")

    denser = client.post(f"/api/v1/cases/{case['id']}/process", json={"sample_fps": 15}).json()["jobs"][0]
    dj = client.get(f"/api/v1/jobs/{denser['id']}").json()
    assert dj["status"] == "completed" and "reused_model_run" not in dj["result"]
    after = sum(f["sampled"] for f in all_frames(client, eid))
    assert before == 10 and after == 30


def test_playback_failure_gives_partial_result_and_is_retryable(client, sample_video, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("encoder unavailable")

    monkeypatch.setattr(vid, "make_playback", boom)
    case = make_case(client)
    eid = upload_video(client, case["id"], sample_video)
    pre = jobs_of(client, case["id"], "preprocess")[0]
    assert pre["status"] == "partially_completed" and any("playback copy" in w for w in pre["result"]["warnings"])
    assert len(all_frames(client, eid)) == 30  # frames survive the failure
    s = client.get(f"/api/v1/evidence/{eid}/stream")
    assert s.status_code == 409 and s.json()["error"]["code"] == "PLAYBACK_NOT_READY"

    monkeypatch.undo()
    r = client.post(f"/api/v1/jobs/{pre['id']}/retry")
    assert r.status_code == 202
    assert client.get(f"/api/v1/jobs/{pre['id']}").json()["status"] == "completed"
    assert client.get(f"/api/v1/evidence/{eid}/stream").status_code == 200


def test_non_video_and_invalid_video_are_not_preprocessed(client):
    case = make_case(client)
    csv = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("s.csv", b"t,v\n0,1\n")},
                      data={"kind": "sensor_csv", "synthetic": "true"}).json()["evidence"]
    assert client.get(f"/api/v1/evidence/{csv['id']}/stream").json()["error"]["code"] == "NOT_A_VIDEO"
    junk = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 20
    client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("x.mp4", junk)}, data={"kind": "dashcam", "synthetic": "true"})
    assert jobs_of(client, case["id"], "preprocess") == []


@pytest.mark.parametrize("stage", [jobs.STAGE_PREPROCESS, jobs.STAGE_INTERVAL])
def test_stage_handlers_refuse_non_video(client, stage):
    case = make_case(client)
    csv = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("s.csv", b"t,v\n0,1\n")},
                      data={"kind": "sensor_csv", "synthetic": "true"}).json()["evidence"]
    with client.factory() as s:
        job = jobs.enqueue(s, case_id=case["id"], evidence_id=csv["id"], stage=stage, input_hash=csv["sha256"],
                           params={"from_ms": 0, "to_ms": 10})
        s.commit()
        jid = job.id
    jobs.run_pending(client.factory, client.settings)
    j = client.get(f"/api/v1/jobs/{jid}").json()
    assert j["status"] == "failed" and "dashcam/cctv" in j["error"]["message"]


def _encode(args, dest: Path) -> Path:
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *args, str(dest)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return dest


def _stream(path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", str(path)], capture_output=True, text=True).stdout
    return json.loads(out)["streams"][0]


def test_playback_keeps_a_frame_taller_than_1080(tmp_path):
    """The failing audit check: a 1352-tall source was scaled to 1080, so videoWidth no longer matched the boxes."""
    src = _encode(["-f", "lavfi", "-i", "testsrc=duration=0.4:size=640x1200:rate=10", "-pix_fmt", "yuv420p", "-c:v", "libx264"], tmp_path / "tall.mp4")
    dst = tmp_path / "playback.mp4"
    info = vid.make_playback(src, dst, 0.0, None)
    stream = _stream(dst)
    assert info["mode"] == "remux" and info["timing_preserved"]
    assert int(stream["width"]) == 640 and int(stream["height"]) == 1200


@pytest.mark.parametrize("angle,size", [(90, (240, 320)), (180, (320, 240)), (270, (240, 320))])
def test_display_rotation_is_baked_once_and_matches_the_decoder(tmp_path, angle, size):
    base = _encode(["-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.3:r=10", "-vf", "drawbox=x=0:y=0:w=40:h=240:color=red:t=fill",
                    "-pix_fmt", "yuv420p", "-c:v", "libx264"], tmp_path / "base.mp4")
    src = _encode(["-display_rotation", str(angle), "-i", str(base), "-c", "copy"], tmp_path / f"r{angle}.mp4")
    dst = tmp_path / "playback.mp4"
    info = vid.make_playback(src, dst, 0.0, angle if angle != 270 else -90)
    stream = _stream(dst)
    assert info["mode"] == "transcode" and info["timing_preserved"]
    assert (int(stream["width"]), int(stream["height"])) == size
    assert not any("rotation" in (sd or {}) for sd in stream.get("side_data_list") or [])
    upright = next(vid.iter_frames(src, {0}, angle if angle != 270 else -90))[1]
    played = next(vid.iter_frames(dst, {0}, None))[1]
    assert upright.shape == played.shape == (size[1], size[0], 3)
    assert abs(upright.astype(np.int16) - played.astype(np.int16)).mean() < 25


def test_unsupported_rotation_is_rejected(client, tmp_path):
    base = _encode(["-f", "lavfi", "-i", "testsrc=duration=0.3:size=320x240:rate=10", "-pix_fmt", "yuv420p", "-c:v", "libx264"], tmp_path / "base.mp4")
    src = _encode(["-display_rotation", "45", "-i", str(base), "-c", "copy"], tmp_path / "r45.mp4")
    with pytest.raises(vid.UnsupportedRotation, match="45"):
        vid.make_playback(src, tmp_path / "no.mp4", 0.0, 45)
    case = make_case(client)
    eid = upload_video(client, case["id"], src)
    ev = client.get(f"/api/v1/evidence/{eid}").json()
    assert ev["status"] == "invalid"
    assert any("45" in err and "270" in err for err in ev["validation"]["errors"])
    assert jobs_of(client, case["id"], "preprocess") == []
