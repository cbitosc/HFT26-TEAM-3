"""Case incident fields, report list format, and storyboard frame references.

FIXTURE: synthetic. These tests do not use the selected accident clip.
"""
from datetime import datetime, timezone

from app.models import Event, EventSource, ExtractedFrame
from app.services.storyboard import build_storyboard


def _frame(fid, evidence_id, number, time_ms, thumb=True):
    return {"id": fid, "evidence_id": evidence_id, "frame_no": number, "time_ms": time_ms,
            "thumbnail_path": "derived/t.jpg" if thumb else None}


def test_storyboard_uses_stored_frames_and_does_not_interleave_cameras():
    frames = [
        _frame(1, "ev_a", 0, 0),
        _frame(2, "ev_a", 1, 200),
        _frame(3, "ev_a", 2, 400),
        _frame(4, "ev_a", 4, 800),
        _frame(5, "ev_b", 0, 0),
        _frame(6, "ev_b", 3, 900),
    ]
    events = [
        {"id": "evt_b", "source_id": "ev_b", "source_type": "video_cctv", "event_type": "vehicle_slowing", "title": "slow",
         "observations": {"source_time_ms": [100, 200]}, "cited_frames": []},
        {"id": "evt_a", "source_id": "ev_a", "source_type": "video_cctv", "event_type": "possible_collision", "title": "candidate",
         "observations": {"source_time_ms": [400, 400]}, "cited_frames": [2]},
        {"id": "evt_w", "source_id": "ev_w", "source_type": "witness", "event_type": "vehicle_turned", "title": "said",
         "observations": {}, "cited_frames": []},
        {"id": "evt_u", "source_id": "ev_a", "source_type": "video_dashcam", "event_type": "vehicle_stopped", "title": "stop",
         "observations": {}, "cited_frames": [1]},
    ]
    body = build_storyboard(events, frames)
    assert body["ordering"] == "per_source_media_time"
    assert "incident_at is not used" in body["note"]
    assert [strip["evidence_id"] for strip in body["strips"]] == ["ev_a", "ev_b"]
    card = body["strips"][0]["items"][0]
    assert card["event_id"] == "evt_a" and card["during_basis"] == "cited_frames"
    assert card["before"]["frame_id"] == 2 and card["before"]["time_ms"] == 200
    assert [item["frame_no"] for item in card["during"]] == [2]
    assert card["after"]["frame_id"] == 4 and card["after"]["time_ms"] == 800
    assert card["missing"] == []
    assert card["during"][0]["thumbnail_url"].endswith("/image")
    other = body["strips"][1]["items"][0]
    assert other["event_id"] == "evt_b" and other["during_basis"] == "samples_inside_interval"
    assert [item["time_ms"] for item in other["during"]] == []
    assert "during" in other["missing"]
    reasons = {row["event_id"]: row["reason"] for row in body["omitted"]}
    assert reasons == {"evt_u": "no_source_time", "evt_w": "not_a_video_event"}


def test_missing_cited_frame_is_not_invented():
    frames = [_frame(1, "ev_a", 0, 0, thumb=False)]
    events = [{
        "id": "evt_a", "source_id": "ev_a", "source_type": "video_cctv", "event_type": "possible_collision", "title": "candidate",
        "observations": {"source_time_ms": [500, 700]}, "cited_frames": [9],
    }]
    card = build_storyboard(events, frames)["strips"][0]["items"][0]
    assert card["during"] == [] and "during" in card["missing"]
    assert card["before"]["frame_id"] == 1 and card["before"]["thumbnail_url"] is None
    assert card["after"] is None


def test_case_incident_fields_round_trip_and_reject_a_naive_time(client):
    created = client.post("/api/v1/cases", json={"title": "Place", "designation": "synthetic", "location_text": "north corner"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["incident_at"] is None and body["location_text"] == "north corner"
    assert "timezone offset" in body["incident_at_note"]
    listed = client.get("/api/v1/cases").json()["items"]
    assert listed[0]["incident_at"] is None and listed[0]["location_text"] == "north corner"

    naive = client.post("/api/v1/cases", json={"title": "Naive", "designation": "synthetic", "incident_at": "2026-10-30T10:00:00"})
    assert naive.status_code == 422 and naive.json()["error"]["code"] == "INCIDENT_TIMEZONE_REQUIRED"

    stamped = client.patch(f"/api/v1/cases/{body['id']}", json={"incident_at": "2026-10-30T10:00:00+05:30"})
    assert stamped.status_code == 200, stamped.text
    assert stamped.json()["incident_at"] == "2026-10-30T10:00:00+05:30"
    assert stamped.json()["location_text"] == "north corner"
    cleared = client.patch(f"/api/v1/cases/{body['id']}", json={"incident_at": None, "location_text": None})
    assert cleared.json()["incident_at"] is None and cleared.json()["location_text"] is None
    bare = client.patch(f"/api/v1/cases/{body['id']}", json={"title": "Place renamed"})
    assert bare.json()["title"] == "Place renamed" and bare.json()["incident_at"] is None


def test_report_list_names_executive_and_full_without_the_document(client):
    case = client.post("/api/v1/cases", json={"title": "Reports", "designation": "synthetic"}).json()
    client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"})
    full = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "full"})
    executive = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "investigator"})
    assert full.status_code == 201 and executive.status_code == 201
    assert full.json()["content"].get("format") is None
    assert executive.json()["content"]["format"] == "investigator"
    items = client.get(f"/api/v1/cases/{case['id']}/reports").json()["items"]
    assert [item["format"] for item in items] == ["executive", "full"]
    assert all("content" not in item for item in items)
    assert items[1]["version"] == 1 and items[0]["version"] == 2


def test_storyboard_route_cites_stored_frames_and_ignores_incident_at(client):
    case = client.post("/api/v1/cases", json={
        "title": "Boards", "designation": "synthetic", "incident_at": "2026-01-01T00:00:00Z", "location_text": "lab",
    }).json()
    missing = client.get(f"/api/v1/cases/{case['id']}/storyboard")
    assert missing.status_code == 409 and missing.json()["error"]["code"] == "NO_RECONSTRUCTION"
    scn = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"}).json()
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("clip.txt", b"synthetic source\n")},
        data={"kind": "witness_text", "synthetic": "true"},
    )
    assert uploaded.status_code == 201, uploaded.text
    evidence_id = uploaded.json()["evidence"]["id"]
    with client.factory() as db:
        db.add(ExtractedFrame(evidence_id=evidence_id, frame_no=1, time_ms=100, thumbnail_path="derived/a.jpg", sampled=True))
        db.add(ExtractedFrame(evidence_id=evidence_id, frame_no=2, time_ms=400, thumbnail_path="derived/b.jpg", sampled=True))
        db.add(ExtractedFrame(evidence_id=evidence_id, frame_no=3, time_ms=900, thumbnail_path="derived/c.jpg", sampled=True))
        event = Event(
            case_id=case["id"], scenario_id=scn["id"], category="machine_detection", event_type="possible_collision",
            title="Possible collision between tracked vehicles", start_case_ms=400, end_case_ms=400, uncertainty_ms=100,
            uncertainty_basis="sampling", source_type="video_cctv", source_id=evidence_id, synthetic=True,
            observations={"source_time_ms": [400, 400], "frames": [2], "coordinate_frame": "image_pixels"},
            confidence={"timestamp": "unsynchronized"}, provenance={"source_event_id": "se_board", "rule_id": "VID-COLL-01"},
        )
        db.add(event)
        db.flush()
        db.add(EventSource(event_id=event.id, evidence_id=evidence_id, kind="metadata"))
        db.commit()
    body = client.get(f"/api/v1/cases/{case['id']}/storyboard").json()
    assert body["scenario_id"] == scn["id"]
    card = body["strips"][0]["items"][0]
    assert card["before"]["time_ms"] == 100
    assert card["during"][0]["time_ms"] == 400 and card["during"][0]["frame_no"] == 2
    assert card["after"]["time_ms"] == 900
    assert "2026-01-01" not in str(card)
