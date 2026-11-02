"""Clocks, classes, overlap, hypotheses, and associations. Synthetic values only. Not a claim about real footage."""


def test_empty_scenario_is_not_a_defensible_reconstruction(client):
    case = client.post("/api/v1/cases", json={"title": "Empty", "designation": "synthetic"}).json()
    client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"})
    timeline = client.get(f"/api/v1/cases/{case['id']}/timeline").json()
    assert timeline["overlaps"] == [] and timeline["hypotheses"] == []
    body = client.get(f"/api/v1/cases/{case['id']}/reconstruction/completeness").json()
    assert body["defensible"] is False
    assert "no_placed_evidence" in body["reasons"]
    assert body["contradiction_count"] == 0
    listed = client.get(f"/api/v1/cases/{case['id']}/associations").json()
    assert listed["items"] == []
from datetime import datetime, timezone

from app.services.reconstruction_view import (
    associations_from_links, clocks_for, completeness, evidence_class, hypotheses, overlaps, trace_for,
)


def ev(**kw):
    base = {
        "id": "evt_1", "category": "machine_detection", "source_type": "video_cctv", "source_id": "ev_a",
        "event_type": "possible_collision", "title": "Possible collision between tracked vehicles",
        "start_ms": 1000, "end_ms": 1200, "observations": {"source_time_ms": [1000, 1200]},
        "provenance": {"source_event_id": "se_1", "sync_group": "sg_one"}, "inference": None,
    }
    base.update(kw)
    return base


def test_evidence_classes_keep_the_stored_category_meaning():
    assert evidence_class("machine_detection", "video_cctv", "ev_a") == "derived_observation"
    assert evidence_class("witness_claim", "witness", "ev_w") == "witness_reported"
    assert evidence_class("direct_observation", "sensor", "ev_s") == "sensor_observed"
    assert evidence_class("direct_observation", "video_cctv", "ev_a") == "direct_observation"
    assert evidence_class("inference", "engine", None) == "system_inference"
    assert evidence_class("direct_observation", "vlm", None) == "unknown"


def test_lone_source_has_case_time_and_no_cross_camera_sync():
    clocks = clocks_for(ev(), {"pts": {"ev_a": 2500.0}, "clocks": {}, "groups": {"sg_one": {"members": 1, "consistent": True}}})
    assert clocks["media_ms"] == [1000, 1200]
    assert clocks["container_pts_ms"] == [3500.0, 3700.0]
    assert clocks["case_ms"] == [1000, 1200]
    assert clocks["synchronized_ms"] is None
    assert clocks["wall_clock"] is None


def test_wall_clock_uses_only_a_trusted_declaration():
    zero = datetime(2026, 10, 30, 5, 0, tzinfo=timezone.utc)
    trusted = clocks_for(ev(), {"pts": {}, "clocks": {"ev_a": {"basis": "declared_by_investigator", "utc_zero": zero}}, "groups": {}})
    assert trusted["wall_clock"][0].startswith("2026-10-30T05:00:01")
    embedded = clocks_for(ev(), {"pts": {}, "clocks": {"ev_a": {"basis": "embedded_metadata_unverified", "utc_zero": zero}}, "groups": {}})
    assert embedded["wall_clock"] is None


def test_two_sources_overlap_without_becoming_contact():
    a = ev(id="evt_a", source_id="ev_a", start_ms=1000, end_ms=2000)
    b = ev(id="evt_b", source_id="ev_b", start_ms=1500, end_ms=1800, provenance={"sync_group": "sg_two"})
    found = overlaps([a, b])
    assert found == [{"evidence_ids": ["ev_a", "ev_b"], "start_ms": 1500, "end_ms": 1800, "event_ids": ["evt_a", "evt_b"]}]
    assert overlaps([a]) == []


def test_hypothesis_without_evidence_is_not_narrated():
    premise = ev(id="evt_p", source_id=None)
    inference = ev(id="evt_i", category="inference", source_type="engine", source_id=None, start_ms=1000, end_ms=1000,
                   inference={"statement": "Braking may have preceded the candidate.", "alternatives": ["braking for the junction"], "premises": ["evt_p"]})
    by_id = {premise["id"]: premise, inference["id"]: inference}
    ready, missing = hypotheses([premise, inference], by_id)
    assert ready == [] and missing == ["evt_i"]
    premise["source_id"] = "ev_a"
    ready, missing = hypotheses([premise, inference], by_id)
    assert missing == [] and ready[0]["probability"] is None and ready[0]["evidence_ids"] == ["ev_a"]
    assert trace_for(inference, by_id)["complete"] is True


def test_equal_track_ids_do_not_create_an_association():
    tracks = [
        {"pk": "trk_a", "evidence_id": "ev_a", "track_id": 1},
        {"pk": "trk_b", "evidence_id": "ev_b", "track_id": 1},
    ]
    assert associations_from_links(tracks, [], [], {}) == []
    linked = associations_from_links(
        tracks,
        [{"id": "lnk_a", "actor_id": "act_1", "ref_id": "trk_a"}, {"id": "lnk_b", "actor_id": "act_1", "ref_id": "trk_b"}],
        [], {},
    )
    assert linked[0]["status"] == "uncertain" and linked[0]["probability"] is None
    assert {t["evidence_id"] for t in linked[0]["tracks"]} == {"ev_a", "ev_b"}


def test_recording_window_is_compared_only_when_a_wall_clock_exists():
    zero = datetime(2026, 10, 30, 5, 0, tzinfo=timezone.utc)
    event = ev()
    ctx = {"pts": {}, "clocks": {"ev_a": {"basis": "declared_by_investigator", "utc_zero": zero}}, "groups": {}}
    body = completeness(
        [event], {event["id"]: event},
        [{"id": "ev_a", "kind": "cctv", "status": "valid"}], [], 1, [],
        {"ev_a": {"recording_start": datetime(2026, 10, 30, 5, 0, 2, tzinfo=timezone.utc), "recording_end": None}},
        ctx,
    )
    assert "recording_starts_after_event" in body["reasons"]
    assert body["defensible"] is True
    assert body["missing_evidence"] == []
