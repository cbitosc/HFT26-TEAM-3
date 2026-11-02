"""Collision model through the real job pipeline (detector, accident cue, tracker, rules v3). Clips come from TRACELINE_CLIPS (a folder)."""
import os
from pathlib import Path

import pytest

from tests.conftest import MODELS, needs_weights

CLIPS = Path(os.environ.get("TRACELINE_CLIPS", "/tmp/ml-clips"))
needs_clips = pytest.mark.skipif(not (CLIPS / "ev_0ff2527eb7f6.mp4").is_file(), reason=f"clips not found in {CLIPS}")
CASES = [  # clip, camera kind, window (s) where a possible_collision is expected, or None for a negative
    ("ev_0ff2527eb7f6.mp4", "cctv", (0.0, 3.4)),
    ("badminton.mp4", "cctv", None),
]


def _flags(client, name, kind):
    case = client.post("/api/v1/cases", json={"title": name, "designation": "real", "description": "collision model e2e"}).json()
    up = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": (name, (CLIPS / name).read_bytes(), "video/mp4")},
                     data={"kind": kind, "synthetic": "false", "licence": "test", "provenance": "{}"})
    assert up.status_code == 201, up.text
    eid = up.json()["evidence"]["id"]
    jobs = {j["stage"]: j for j in client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"]}
    for stage in ("detect", "track"):
        assert jobs[stage]["status"] in ("completed", "partially_completed"), jobs[stage]
    ev = client.get(f"/api/v1/evidence/{eid}/video-events").json()["items"]
    return [e for e in ev if e["event_type"] == "possible_collision"], eid


@needs_weights
@needs_clips
@pytest.mark.skipif(not (MODELS / "accident_yolov8s_best.pt").is_file(), reason="accident cue weights not installed")
@pytest.mark.parametrize("name,kind,window", CASES)
def test_collision_flags(client, name, kind, window):
    flags, eid = _flags(client, name, kind)
    if window is None:
        assert flags == [], [(f["t_start_ms"], f["observations"].get("collision_signals")) for f in flags]
    else:
        assert any(window[0] * 1000 <= f["t_start_ms"] <= window[1] * 1000 for f in flags), flags
        assert all(f["observations"].get("collision_signals") for f in flags if f["rule_id"] != "VID-SCENE-01")
