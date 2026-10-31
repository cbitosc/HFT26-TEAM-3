"""Job progress is the fraction of frames already handled, not a clock."""
import pytest

from app.services import jobs


def test_preprocess_progress_steps_with_grabbed_frames(client, sample_video, monkeypatch):
    seen = []
    original = jobs.publish_progress

    def spy(fraction):
        seen.append(fraction)
        original(fraction)

    monkeypatch.setattr(jobs, "publish_progress", spy)
    case = client.post("/api/v1/cases", json={"title": "Progress", "designation": "synthetic"}).json()
    upload = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("ok.mp4", sample_video.read_bytes())},
                         data={"kind": "dashcam", "synthetic": "true"})
    assert upload.status_code == 201, upload.text
    rows = client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"]
    pre = next(j for j in rows if j["stage"] == "preprocess")
    assert pre["status"] == "completed" and pre["progress"] == 1.0
    assert seen, "preprocess reported no frame progress"
    # Handlers pass completed/planned, which reaches 1 on the last unit. publish_progress caps storage at 0.99 until the runner writes 1.0.
    assert all(0 < v <= 1 for v in seen)
    prefix = [seen[0]]
    for value in seen[1:]:
        if value + 1e-9 < prefix[-1]:
            break
        prefix.append(value)
    steps = [round(b - a, 6) for a, b in zip(prefix, prefix[1:]) if b > a + 1e-9]
    assert len(steps) >= 5
    assert len(set(steps)) == 1  # one container frame per step: done / (frames + playback unit)


def test_failed_detect_keeps_the_last_real_fraction(client, sample_video, tmp_path, monkeypatch):
    seen = []
    monkeypatch.setattr(jobs, "publish_progress", lambda fraction: seen.append(fraction))
    client.settings.models_dir = tmp_path / "no-weights"
    case = client.post("/api/v1/cases", json={"title": "Progress fail", "designation": "synthetic"}).json()
    client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("ok.mp4", sample_video.read_bytes())},
                data={"kind": "dashcam", "synthetic": "true"})
    rows = client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"]
    detect = next(j for j in rows if j["stage"] == "detect")
    pre = next(j for j in rows if j["stage"] == "preprocess")
    assert pre["progress"] == 1.0 and pre["status"] == "completed"
    assert detect["status"] == "failed"
    assert detect["progress"] == 0.0  # detection had not inferred a frame
    assert seen  # preprocess still reported grabbed frames before detect failed
